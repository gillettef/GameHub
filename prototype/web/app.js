// RETROCAUSE 웹 플레이. 화면은 '뷰(view)' 하나로 그리고, 행동은 컨트롤러로 보낸다.
//  - 혼자 하기: 브라우저 안 엔진 + 봇 (localController)
//  - 온라인:    서버 방 API + SSE (onlineController)
import {
  newGame, applyAction, legalSlots, illegalReason, stateAt, decisiveCause, finalScore,
  CARD, SUBJECTS, FIGURES, INITIAL, makeRng, shuffle,
} from './src/engine.js';
import { chooseAction, guessMotives, BOT_STYLES } from './src/bots.js';
import { makeView } from './src/view.js';

const $ = (s) => document.querySelector(s);
const ICON = { 성: '🏰', 왕: '👑', 금고: '💰', 경비: '💂', 성문: '🚪' };
const FIG_COLOR = {
  하인: 'var(--f-hain)', 왕비: 'var(--f-queen)', 대신: 'var(--f-minister)',
  경비대장: 'var(--f-captain)', '궁정 의사': 'var(--f-doctor)', 광대: 'var(--f-jester)',
};
const WHY = { condition: '조건이 거짓인 칸', ending: '결말과 어긋나는 칸', occupied: '찬 칸' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fact = (f) => `${ICON[f.subject]} ${f.subject} = ${f.state}`;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
};

let ctl = null;
let v = null;
const ui = {
  selected: null, target: null, showMotive: false, showStates: store.get('rc:states') ?? true,
  flash: { placed: null, removed: [] }, tab: 'players', endClosedFor: null, receivedAt: 0, takeoverTimer: null,
};

// ---------- 공통 ----------
function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), ms);
}
function myName() {
  const n = $('#in-name').value.trim() || '손님';
  store.set('rc:name', n);
  return n;
}
function show(screen) {
  for (const id of ['home', 'lobby', 'game']) $(`#screen-${id}`).hidden = id !== screen;
}

function setView(nv) {
  const prev = v;
  const sameGame = prev && nv && prev.seed === nv.seed && prev.history && nv.history;
  ui.flash = { placed: null, removed: [] };
  if (sameGame && nv.history.length > prev.history.length) {
    const h = nv.history[nv.history.length - 1];
    if (h.type === 'place') {
      ui.flash.placed = h.slot;
      ui.flash.removed = h.removed.map((r) => r.slot);
      if (h.removed.length) toast(`연쇄 정리! ${nv.names[h.player]} 패러독스 +${h.removed.length}`);
    }
    if (!prev.finalRound && nv.finalRound) toast('종료 라운드가 시작되었습니다');
  }
  if (!sameGame) { ui.selected = null; ui.target = null; }
  if (nv?.hand && ui.selected && !nv.hand.includes(ui.selected)) { ui.selected = null; ui.target = null; }
  if (sameGame && nv.current !== prev.current) ui.target = null;
  v = nv;
  ui.receivedAt = Date.now();
  render();
}

// ---------- 혼자 하기 ----------
function localController({ name, n, speed }) {
  const seed = Math.floor(Math.random() * 1e9);
  const rng = makeRng(seed ^ 0x5bd1e995);
  const me = Math.floor(rng() * n);
  const botNames = shuffle(['아그네스', '베르톨트', '세실리아', '도미닉', '엘로이즈', '페르디난트'], rng);
  const styles = [];
  const names = [];
  for (let p = 0, b = 0; p < n; p++) {
    if (p === me) { names.push(name); styles.push(null); continue; }
    const key = ['greedy', 'rival', 'bluffer'][Math.floor(rng() * 3)];
    names.push(botNames[b++]);
    styles.push({ ...BOT_STYLES[key], activity: 0.8 });
  }
  let g = newGame({ names, seed });
  let result = null;
  let guesses = null;
  let timer = null;
  const view = () => ({
    mode: 'local', isHost: true,
    phase: !g.over ? 'play' : result ? 'result' : 'guess',
    ...makeView(g, me),
    seatBots: styles.map(Boolean),
    styleLabels: styles.map((s) => s?.label ?? null),
    guessed: g.names.map((_, p) => p !== me || !!guesses),
    result: result ? { ...result, motives: g.motives, guesses } : null,
  });
  const push = () => {
    setView(view());
    clearTimeout(timer);
    if (!g.over && styles[g.current]) {
      timer = setTimeout(() => {
        const r = makeRng((g.seed + g.history.length * 977) >>> 0);
        g = applyAction(g, chooseAction(g, styles[g.current], r));
        push();
      }, speed);
    }
  };
  return {
    start: push,
    act(a) { try { g = applyAction(g, a); push(); } catch (e) { toast(e.message); } },
    guess(myGuess) {
      guesses = g.names.map((_, p) => (p === me ? myGuess : guessMotives(g, p)));
      result = finalScore(g, guesses);
      push();
    },
    rematch() { clearTimeout(timer); ctl = localController({ name, n, speed }); ctl.start(); },
    leave() { clearTimeout(timer); },
  };
}

// ---------- 온라인 ----------
async function api(path, body) {
  const res = await fetch(`/api/rooms${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({ error: '서버 응답을 읽을 수 없습니다' }));
  if (!res.ok) throw new Error(data.error ?? '요청 실패');
  return data;
}

function onlineController(code, token) {
  let es = null;
  let closed = false;
  let failures = 0;
  const connect = () => {
    es?.close();
    es = new EventSource(`/api/rooms/${code}/stream?token=${encodeURIComponent(token)}`);
    es.onmessage = (e) => { failures = 0; setView(JSON.parse(e.data)); };
    es.onerror = async () => {
      if (closed) return;
      failures += 1;
      if (es.readyState === EventSource.CLOSED || failures >= 3) {
        // 방이 사라졌는지 확인한다
        try { await api(`/${code}/view`, { token }); connect(); } catch (err) {
          store.del('rc:room');
          toast(err.message);
          goHome();
        }
      } else if (failures === 1) toast('연결이 끊겼습니다. 다시 연결하는 중…');
    };
  };
  const call = (verb, body = {}) => api(`/${code}/${verb}`, { token, ...body }).catch((e) => { toast(e.message); throw e; });
  return {
    code,
    start() { connect(); },
    act(action) { call('action', { action }).catch(() => {}); },
    guess(guess) { call('guess', { guess }).catch(() => {}); },
    rematch() { call('rematch').catch(() => {}); },
    startGame() { call('start').catch(() => {}); },
    config(players) { call('config', { players }).catch(() => {}); },
    takeover() { call('takeover').catch(() => {}); },
    reconnect() { if (!closed && (!es || es.readyState !== EventSource.OPEN)) connect(); },
    leave() { closed = true; es?.close(); api(`/${code}/leave`, { token }).catch(() => {}); store.del('rc:room'); },
  };
}

async function joinOnline(code, token) {
  const name = myName();
  const res = await api(`/${code.toUpperCase()}/join`, { name, token });
  store.set('rc:room', { code: res.code, token: res.token });
  history.replaceState(null, '', `?room=${res.code}`);
  ctl?.leave?.();
  ctl = onlineController(res.code, res.token);
  v = null;
  ctl.start();
}

function goHome() {
  ctl?.leave?.();
  ctl = null;
  v = null;
  history.replaceState(null, '', location.pathname);
  $('#dlg-end').close();
  $('#sheet').close();
  renderHome();
  show('home');
}

// ---------- 홈 ----------
function renderHome() {
  const saved = store.get('rc:room');
  $('#btn-resume').hidden = !saved;
  if (saved) $('#btn-resume').textContent = `이전 방으로 돌아가기 (${saved.code})`;
}
$('#in-name').value = store.get('rc:name') ?? '';
const qRoom = new URLSearchParams(location.search).get('room');
if (qRoom) $('#in-code').value = qRoom.toUpperCase().slice(0, 4);
$('#in-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });

for (const segId of ['seg-local', 'seg-speed']) {
  $(`#${segId}`).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $(`#${segId}`).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  });
}
$('#btn-local').addEventListener('click', () => {
  const n = Number($('#seg-local .on').dataset.n);
  const speed = Number($('#seg-speed .on').dataset.s);
  ctl?.leave?.();
  ctl = localController({ name: myName(), n, speed });
  ctl.start();
});
$('#btn-create').addEventListener('click', async () => {
  try {
    const res = await api('', { name: myName() });
    store.set('rc:room', res);
    await joinOnline(res.code, res.token);
  } catch (e) { toast(e.message); }
});
$('#btn-join').addEventListener('click', async () => {
  const code = $('#in-code').value.trim();
  if (code.length !== 4) { toast('방 코드 4자리를 입력하세요'); return; }
  const saved = store.get('rc:room');
  try { await joinOnline(code, saved?.code === code.toUpperCase() ? saved.token : undefined); } catch (e) { toast(e.message); }
});
$('#btn-resume').addEventListener('click', async () => {
  const saved = store.get('rc:room');
  try { await joinOnline(saved.code, saved.token); } catch (e) { store.del('rc:room'); renderHome(); toast(e.message); }
});

// ---------- 대기실 ----------
function renderLobby() {
  $('#lobby-code').textContent = v.code;
  $('#lobby-count').textContent = `${v.members.length}명 / 최대 5명`;
  const bots = Math.max(0, v.targetPlayers - v.members.length);
  $('#lobby-members').innerHTML = v.members.map((m) => `<li><span>${esc(m.name)}${m.me ? ' (나)' : ''}</span><span class="tag">${m.host ? '방장' : ''}</span></li>`).join('')
    + Array.from({ length: bots }, () => '<li class="bot"><span>빈 자리</span><span class="tag">봇</span></li>').join('');
  $('#lobby-host').hidden = !v.isHost;
  $('#lobby-wait').hidden = v.isHost;
  $('#seg-online').querySelectorAll('button').forEach((b) => {
    const n = Number(b.dataset.n);
    b.classList.toggle('on', n === v.targetPlayers);
    b.disabled = n < v.members.length;
  });
}
$('#seg-online').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b && !b.disabled) ctl.config(Number(b.dataset.n));
});
$('#btn-start').addEventListener('click', () => ctl.startGame());
$('#btn-lobby-leave').addEventListener('click', () => { if (confirm('방에서 나갈까요?')) goHome(); });
$('#btn-share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?room=${v.code}`;
  const text = `RETROCAUSE 같이 해요! 방 코드 ${v.code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'RETROCAUSE', text, url });
    else { await navigator.clipboard.writeText(`${text}\n${url}`); toast('초대 링크를 복사했습니다'); }
  } catch { /* 공유 취소 */ }
});

// ---------- 게임 화면 ----------
const isMine = () => v && !v.over && v.phase === 'play' && v.current === v.seat;
const canPassV = () => v.deckCount === 0 || v.timeline.every(Boolean);

function render() {
  if (!v) { renderHome(); show('home'); return; }
  if (v.phase === 'lobby') { renderLobby(); show('lobby'); return; }
  show('game');
  renderBar();
  renderTimeline();
  renderDock();
  if ($('#sheet').open) renderSheet();
  renderEnd();
  document.title = isMine() ? '● 당신의 차례 · RETROCAUSE' : 'RETROCAUSE';
}

function renderBar() {
  const t = $('#g-turn');
  const mine = isMine();
  t.classList.toggle('me', mine);
  t.innerHTML = v.phase !== 'play' ? '게임 종료' : mine ? '<span class="dot"></span>당신의 차례' : `${esc(v.names[v.current])}의 차례…`;
  $('#g-meta').innerHTML = `라운드 ${v.round}${v.finalRound ? '·종료' : ''}<br>덱 ${v.deckCount} · ${v.code ? `방 ${v.code}` : '연습'}`;
  $('#g-endings').innerHTML = v.endings.map((e) => {
    const d = decisiveCause(v.timeline, e);
    const fig = d ? CARD[d.cardId].figure : null;
    return `<div class="end-chip">${ICON[e.subject]} <b>${e.subject} = ${e.state}</b><span class="dc">${fig ? `결정 원인 <i style="--fig:${FIG_COLOR[fig]}">${fig}</i> · 칸 ${d.slot + 1}` : '결정 원인 없음'}</span></div>`;
  }).join('');

  // 배너: 결과 보기 / 대리 진행
  const banner = $('#g-banner');
  clearTimeout(ui.takeoverTimer);
  let html = '';
  if (v.phase === 'guess' || v.phase === 'result') {
    html = `<span>${v.phase === 'guess' ? '추리 단계입니다' : '게임이 끝났습니다'}</span><button class="btn" id="btn-open-end">${v.phase === 'guess' ? '추리하기' : '결과 보기'}</button>`;
  } else if (v.mode === 'online' && !mine && !v.seatBots[v.current]) {
    const left = v.takeoverMs - v.turnAgeMs - (Date.now() - ui.receivedAt);
    if (left <= 0) html = `<span>${esc(v.names[v.current])}의 응답이 없습니다</span><button class="btn" id="btn-takeover">봇에게 넘기기</button>`;
    else ui.takeoverTimer = setTimeout(renderBar, left + 200);
  }
  banner.hidden = !html;
  banner.innerHTML = html;
  $('#btn-open-end')?.addEventListener('click', () => { ui.endClosedFor = null; renderEnd(); });
  $('#btn-takeover')?.addEventListener('click', () => ctl.takeover());
}

function cardInner(c, badge = '') {
  return `${badge}<div class="tc-top"><span class="tc-title">${esc(c.title)}</span><span class="tc-fig">${esc(c.figure)}</span></div>
    <div class="tc-line">${c.cond ? fact(c.cond) : '<span class="nocond">조건 없음</span>'}<span class="arrow">→</span><b>${fact(c.effect)}</b></div>`;
}

function renderTimeline() {
  const el = $('#timeline');
  el.classList.toggle('hide-states', !ui.showStates);
  const endSubj = new Set(v.endings.map((e) => e.subject));
  const decisive = new Map();
  for (const e of v.endings) { const d = decisiveCause(v.timeline, e); if (d) decisive.set(d.slot, true); }
  const legal = ui.selected ? new Set(legalSlots(v.timeline, ui.selected, v.endings)) : new Set();
  let html = `<div class="tl-legend">위가 과거, 아래가 결말 · 카드 위 칩은 그 칸 직전까지 바뀐 상태</div>
    <div class="trow"><div class="tnum">시작</div><div class="tstart">${SUBJECTS.map((s) => `<span>${ICON[s.id]} ${s.id} ${INITIAL[s.id]}</span>`).join('')}</div></div>`;
  v.timeline.forEach((id, i) => {
    const cls = ['trow'];
    if (id) cls.push('filled');
    if (legal.has(i)) cls.push('legal');
    if (ui.target === i) cls.push('target');
    if (ui.flash.placed === i) cls.push('flash');
    if (ui.flash.removed.includes(i)) cls.push('burn');
    const changed = SUBJECTS.map((s) => ({ s: s.id, st: stateAt(v.timeline, i, s.id) })).filter((x) => x.st !== INITIAL[x.s]);
    const states = changed.length
      ? changed.map((x) => `<span class="st${endSubj.has(x.s) ? ' end' : ''}">${ICON[x.s]} ${x.st}</span>`).join('')
      : '<span class="st none">시작 상태 그대로</span>';
    let body;
    if (id) {
      const c = CARD[id];
      body = `<div class="tcard" style="--fig:${FIG_COLOR[c.figure]}">${cardInner(c, decisive.has(i) ? '<span class="badge">결정 원인</span>' : '')}</div>`;
    } else {
      const label = ui.target === i ? `칸 ${i + 1}에 놓기 — 아래 버튼으로 확정` : legal.has(i) ? '여기에 놓을 수 있음 (눌러서 선택)' : '빈 칸';
      body = `<div class="tempty">${label}</div>`;
    }
    html += `<div class="${cls.join(' ')}" data-slot="${i}" id="slot-${i}"><div class="tnum">${i + 1}</div><div class="tcell"><div class="tstates">${states}</div>${body}</div></div>`;
  });
  html += `<div class="trow"><div class="tnum">결말</div><div class="tend">${v.endings.map((e) => `<span>${ICON[e.subject]} <b>${e.subject} = ${e.state}</b></span>`).join('')}</div></div>`;
  el.innerHTML = html;
  el.querySelectorAll('.trow.legal').forEach((row) => row.addEventListener('click', () => pickTarget(Number(row.dataset.slot), false)));
}

function pickTarget(slot, scroll) {
  ui.target = ui.target === slot ? null : slot;
  renderTimeline();
  renderDock();
  if (scroll && ui.target !== null) $(`#slot-${slot}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function renderDock() {
  const mine = isMine();
  const hand = v.hand ?? [];
  $('#hand').innerHTML = hand.map((id) => {
    const c = CARD[id];
    const n = legalSlots(v.timeline, id, v.endings).length;
    return `<button class="hcard${ui.selected === id ? ' sel' : ''}${n ? '' : ' dead'}" data-id="${id}" style="--fig:${FIG_COLOR[c.figure]}">
      <span class="tc-title">${esc(c.title)}</span><span class="tc-fig">${esc(c.figure)}</span>
      <span class="row"><span class="lab">조건</span>${c.cond ? fact(c.cond) : '없음'}</span>
      <span class="row"><span class="lab">결과</span><b>${fact(c.effect)}</b></span>
      <span class="cnt">${n ? `놓을 수 있는 칸 ${n}개` : '지금 놓을 칸 없음'}</span></button>`;
  }).join('');
  $('#hand').querySelectorAll('.hcard').forEach((b) => b.addEventListener('click', () => {
    ui.selected = ui.selected === b.dataset.id ? null : b.dataset.id;
    ui.target = null;
    renderTimeline();
    renderDock();
    const first = ui.selected && legalSlots(v.timeline, ui.selected, v.endings)[0];
    if (first !== undefined && first !== null && ui.selected) $(`#slot-${first}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }));

  // 놓을 수 있는 칸 칩
  const chips = $('#slot-chips');
  if (ui.selected) {
    const slots = legalSlots(v.timeline, ui.selected, v.endings);
    if (slots.length) {
      chips.innerHTML = slots.map((s) => `<button class="slot-chip${ui.target === s ? ' on' : ''}" data-s="${s}">칸 ${s + 1}</button>`).join('');
    } else {
      const reasons = new Set(v.timeline.map((x, i) => (x ? null : illegalReason(v.timeline, ui.selected, i, v.endings))).filter(Boolean));
      chips.innerHTML = `<span class="why">놓을 칸이 없습니다 (${[...reasons].map((r) => WHY[r]).join(', ') || '빈 칸 없음'})</span>`;
    }
    chips.querySelectorAll('.slot-chip').forEach((b) => b.addEventListener('click', () => pickTarget(Number(b.dataset.s), true)));
  } else chips.innerHTML = '';

  const confirmBtn = $('#btn-confirm');
  confirmBtn.disabled = !(mine && ui.selected && ui.target !== null);
  confirmBtn.textContent = !mine ? (v.phase === 'play' ? `${v.names[v.current]}의 차례` : '게임 종료')
    : !ui.selected ? '카드를 고르세요' : ui.target === null ? '칸을 고르세요' : `칸 ${ui.target + 1}에 놓기`;
  $('#btn-exchange').disabled = !(mine && ui.selected && v.deckCount > 0);
  $('#btn-pass').disabled = !(mine && canPassV());
  $('#dock-hint').textContent = mine ? (ui.selected ? '' : '카드를 눌러 고르세요') : '다른 플레이어 차례에도 카드를 미리 볼 수 있어요';
  $('#btn-motive').textContent = ui.showMotive ? `비밀 목표: ${v.motive}` : '비밀 목표 보기';
  document.documentElement.style.setProperty('--dock-h', `${$('#dock').offsetHeight}px`);
}

$('#btn-confirm').addEventListener('click', () => {
  if (!isMine() || !ui.selected || ui.target === null) return;
  const a = { type: 'place', cardId: ui.selected, slot: ui.target };
  ui.selected = null; ui.target = null;
  ctl.act(a);
});
$('#btn-exchange').addEventListener('click', () => {
  if (!isMine() || !ui.selected) return;
  const c = CARD[ui.selected];
  if (!confirm(`「${c.title}」을(를) 버리고 새 카드를 가져올까요? 버린 카드는 모두에게 공개됩니다.`)) return;
  const a = { type: 'exchange', cardId: ui.selected };
  ui.selected = null; ui.target = null;
  ctl.act(a);
});
$('#btn-pass').addEventListener('click', () => { if (isMine() && canPassV()) ctl.act({ type: 'pass' }); });
$('#btn-motive').addEventListener('click', () => { ui.showMotive = !ui.showMotive; renderDock(); });
new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', `${$('#dock').offsetHeight}px`)).observe($('#dock'));

// ---------- 시트: 플레이어 / 기록 / 메뉴 ----------
$('#btn-menu').addEventListener('click', () => { renderSheet(); $('#sheet').showModal(); });
$('#btn-sheet-close').addEventListener('click', () => $('#sheet').close());
$('#sheet').addEventListener('click', (e) => { if (e.target === $('#sheet')) $('#sheet').close(); });
$('#sheet-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  ui.tab = b.dataset.tab;
  renderSheet();
});

function describe(h) {
  const who = `<b>${esc(v.names[h.player])}</b>`;
  if (h.type === 'place') {
    const c = CARD[h.cardId];
    let s = `${who} 칸 ${h.slot + 1}에 「${esc(c.title)}」(${c.figure})`;
    if (h.removed?.length) s += ` → 연쇄 정리 ${h.removed.map((r) => `칸 ${r.slot + 1} 「${esc(CARD[r.cardId].title)}」`).join(', ')} 버림, 패러독스 +${h.removed.length}`;
    return { html: s, warn: h.removed?.length > 0 };
  }
  if (h.type === 'exchange') return { html: `${who} 교체 — 「${esc(CARD[h.cardId].title)}」(${CARD[h.cardId].figure}) 버림` };
  return { html: `${who} 패스` };
}

function renderSheet() {
  $('#sheet-tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const body = $('#sheet-body');
  if (!v?.names) { body.innerHTML = ''; return; }
  if (ui.tab === 'players') {
    body.innerHTML = v.names.map((name, p) => {
      const placed = {};
      for (const h of v.history) if (h.player === p && h.type === 'place') placed[CARD[h.cardId].figure] = (placed[CARD[h.cardId].figure] ?? 0) + 1;
      const ex = v.history.filter((h) => h.player === p && h.type === 'exchange').length;
      const chips = Object.entries(placed).map(([f, k]) => `<span class="figchip" style="--fig:${FIG_COLOR[f]}">${f} ${k}</span>`).join('');
      const tag = [p === v.seat ? '나' : null, p === 0 ? '시작' : null, v.styleLabels?.[p] ? `봇·${v.styleLabels[p]}` : v.seatBots?.[p] ? '봇 대리' : null].filter(Boolean).join(' · ');
      return `<div class="player${v.current === p && v.phase === 'play' ? ' active' : ''}">
        <div class="pname">${esc(name)} <small>${tag}</small></div><div class="tokens">패러독스 ${v.paradox[p]}</div>
        <div class="pmeta">손패 ${v.handCounts[p]} · 교체 ${ex}회</div><div></div>
        <div class="pfigs">${chips || '<span class="pmeta">놓은 카드 없음</span>'}</div></div>`;
    }).join('');
  } else if (ui.tab === 'log') {
    const items = [...v.history].reverse().map((h) => { const d = describe(h); return `<li class="${d.warn ? 'warn' : ''}">${d.html}</li>`; });
    body.innerHTML = items.length ? `<ol class="log" reversed>${items.join('')}</ol>` : '<p class="hint">아직 기록이 없습니다.</p>';
  } else {
    body.innerHTML = `<div class="menu-list">
      <label>칸별 상태 칩 보기 <input type="checkbox" id="tg-states" ${ui.showStates ? 'checked' : ''}></label>
      <button class="btn" id="btn-rules">룰북 보기</button>
      ${v.mode === 'online' ? `<button class="btn" id="btn-share2">방 코드 ${v.code} 공유</button>` : ''}
      <button class="btn" id="btn-quit">${v.mode === 'online' ? '방 나가기' : '연습 그만하기'}</button>
      <p class="hint">시드 ${v.seed} · 덱 ${v.deckCount}장 · 버림 ${v.discardCount}장</p></div>`;
    $('#tg-states').addEventListener('change', (e) => { ui.showStates = e.target.checked; store.set('rc:states', ui.showStates); renderTimeline(); });
    $('#btn-rules').addEventListener('click', () => {
      body.innerHTML = '<iframe src="./rulebook.html" title="룰북" style="width:100%;height:62dvh;border:0;border-radius:12px;background:#15110e"></iframe>';
    });
    $('#btn-share2')?.addEventListener('click', () => $('#btn-share').click());
    $('#btn-quit').addEventListener('click', () => {
      if (confirm(v.mode === 'online' ? '방에서 나갈까요? 같은 방 코드로 다시 들어올 수 있습니다.' : '연습을 그만할까요?')) {
        const online = v.mode === 'online';
        const saved = store.get('rc:room');
        $('#sheet').close();
        goHome();
        if (online && saved) { store.set('rc:room', saved); renderHome(); } // 같은 방으로 돌아갈 수 있게 남긴다
      }
    });
  }
}

// ---------- 종료: 추리와 결과 ----------
function renderEnd() {
  const dlg = $('#dlg-end');
  if (v.phase !== 'guess' && v.phase !== 'result') { if (dlg.open) dlg.close(); return; }
  const key = `${v.seed}:${v.phase}`;
  if (ui.endClosedFor === key) return;
  if (v.phase === 'guess' && v.guessed[v.seat]) {
    $('#end-title').textContent = '추리 완료';
    $('#end-body').innerHTML = `<p class="hint">다른 플레이어의 추리를 기다리고 있습니다… (${v.guessed.filter(Boolean).length}/${v.guessed.length})</p>`;
    $('#end-actions').innerHTML = '<button class="btn" id="btn-end-close">시간선 보기</button>';
  } else if (v.phase === 'guess') {
    if (dlg.open && $('#guess-form')) return; // 입력 중에는 다시 그리지 않는다
    $('#end-title').textContent = '추리: 다른 플레이어의 비밀 목표 인물은?';
    const opts = FIGURES.filter((f) => f !== v.motive);
    $('#end-body').innerHTML = `<div id="guess-form"><p class="hint">당신의 인물은 ${v.motive}. 한 인물은 한 번만 적을 수 있고, 맞히면 1개당 +1점입니다.</p>
      ${v.names.map((name, p) => (p === v.seat ? '' : `<div class="guess-row"><span>${esc(name)}</span>
        <select data-p="${p}"><option value="">선택…</option>${opts.map((f) => `<option>${f}</option>`).join('')}</select></div>`)).join('')}
      <div class="err" id="guess-err"></div></div>`;
    $('#end-actions').innerHTML = '<button class="btn" id="btn-end-close">시간선 보기</button><button class="btn primary" id="btn-guess">제출</button>';
    $('#btn-guess').addEventListener('click', () => {
      const guess = {};
      const sels = [...$('#end-body').querySelectorAll('select')];
      if (sels.some((s) => !s.value)) { $('#guess-err').textContent = '모든 플레이어의 인물을 골라 주세요.'; return; }
      sels.forEach((s) => { guess[s.dataset.p] = s.value; });
      if (new Set(Object.values(guess)).size !== sels.length) { $('#guess-err').textContent = '같은 인물을 두 번 적을 수 없습니다.'; return; }
      ctl.guess(guess);
    });
  } else {
    const r = v.result;
    const pts = v.points;
    const iWon = r.winners.includes(v.seat);
    $('#end-title').textContent = iWon ? '승리!' : `${r.winners.map((w) => v.names[w]).join(', ')} 승리`;
    const dc = r.decisive.map((d) => `<li>${fact(d.ending)} — ${d.figure ? `「${esc(CARD[d.cardId].title)}」 <b>${d.figure}</b>` : r.unresolved.some((u) => u.subject === d.ending.subject) ? '<b>미해결 결말</b> (모두 패러독스 +1)' : '결정 원인 없음'}</li>`).join('');
    const rows = r.rows.map((x) => `<tr class="${r.winners.includes(x.player) ? 'win' : ''}"><td>${esc(x.name)}${x.player === v.seat ? ' (나)' : ''}<br><small>${x.figure}</small></td>
      <td>${x.decisive * pts.decisive}</td><td>${x.cards * pts.card}</td><td>${x.correct * pts.deduction}</td><td>${x.paradox * pts.paradox}</td><td><b>${x.total}</b></td></tr>`).join('');
    $('#end-body').innerHTML = `<ul class="dc-list">${dc}</ul>
      <table class="score"><thead><tr><th>플레이어</th><th>결정<br>원인</th><th>카드</th><th>추리</th><th>패러<br>독스</th><th>합계</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="hint">동점이면 패러독스가 적은 플레이어가 이깁니다.</p>`;
    $('#end-actions').innerHTML = `<button class="btn" id="btn-end-close">시간선 보기</button>${v.isHost ? `<button class="btn primary" id="btn-again">${v.mode === 'online' ? '대기실로' : '새 게임'}</button>` : ''}`;
    $('#btn-again')?.addEventListener('click', () => { dlg.close(); ctl.rematch(); });
  }
  $('#btn-end-close').addEventListener('click', () => { ui.endClosedFor = key; dlg.close(); });
  if (!dlg.open) dlg.showModal();
}

// ---------- 시작 ----------
document.addEventListener('visibilitychange', () => { if (!document.hidden) ctl?.reconnect?.(); });
renderHome();
show('home');
if (qRoom && store.get('rc:room')?.code === qRoom.toUpperCase()) {
  const saved = store.get('rc:room');
  joinOnline(saved.code, saved.token).catch(() => { store.del('rc:room'); renderHome(); });
}
