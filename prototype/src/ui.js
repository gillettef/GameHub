// LASTGRAIN 웹 시뮬레이터 화면 — 봇 대전(브라우저 안에서 진행)과 온라인 대전(서버가 진행) 공용.
import {
  newGame, tick, endTurn, moveOptions, attackOptions, reserve, unitAt, canSummon, homeCells,
  summonable, isSpring, isRuin, cellName, KINDS, PLAYER_NAME, apply, resign,
} from './rules.js';
import { chooseAction } from './bot.js';
import * as Net from './net.js';

const $ = (sel) => document.querySelector(sel);
const SAND = { scout: '#d9ccb0', warrior: '#e0ac35', giant: '#c8553d' };

const app = {
  mode: null,          // 'bot' | 'online'
  s: null,             // 게임 상태 (온라인은 서버 스냅숏의 사본)
  me: 0,               // 내 좌석
  opts: { showSec: true, level: 'normal', botDelay: 1500 },
  paused: false,
  selected: null,
  summonPick: null,
  pending: false,      // 온라인 행동 전송 중
  botTimer: null,
  net: null,           // { code, token, snap, stop, status, countEnd, overKey }
  overShownFor: null,
};

// ---------------------------------------------------------------- 공용 도우미
const fmtSec = (ms) => `${Math.max(0, Math.ceil(ms / 1000))}`;
const fmtClock = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const oppName = () => (app.mode === 'bot' ? '봇' : '상대');
const who = (p) => (p === app.me ? '나' : oppName());

function show(id) {
  for (const sc of document.querySelectorAll('.screen')) sc.hidden = sc.id !== id;
}

let toastTimer = null;
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

function readSettings() {
  const fd = new FormData($('#settings'));
  return {
    side: fd.get('side'), greatMin: Number(fd.get('greatMin')), target: Number(fd.get('target')),
    handleMs: Number(fd.get('handleMs')), level: fd.get('level'), botDelay: Number(fd.get('botDelay')),
    showSec: fd.get('showSec') === 'on',
  };
}
function saveSettings() { try { localStorage.setItem('lastgrain.settings', JSON.stringify(readSettings())); } catch { /* 무시 */ } }
function loadSettings() {
  let v = null;
  try { v = JSON.parse(localStorage.getItem('lastgrain.settings')); } catch { /* 무시 */ }
  if (!v) return;
  const f = $('#settings');
  for (const k of ['side', 'greatMin', 'target', 'handleMs', 'level', 'botDelay']) if (v[k] !== undefined && f[k]) f[k].value = String(v[k]);
  f.showSec.checked = v.showSec !== false;
}

// HTTP에서도 되는 복사 (navigator.clipboard는 보안 컨텍스트에서만 쓸 수 있다)
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
  return Promise.resolve(legacyCopy(text));
}
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

// ---------------------------------------------------------------- 그림
let clipSeq = 0;
function hourglass(frac, kind) {
  const f = Math.max(0, Math.min(1, frac));
  const yTop = 32 - 27 * f, yBot = 60 - 27 * (1 - f);
  const id = `h${clipSeq++}`;
  const top = 'M7,5 C7,22 18,28 20,32 C22,28 33,22 33,5 Z';
  const bot = 'M7,59 C7,42 18,36 20,32 C22,36 33,42 33,59 Z';
  const flow = f > 0 && f < 1 ? `<line x1="20" y1="32" x2="20" y2="${yBot}" stroke="${SAND[kind]}" stroke-width="1.2" stroke-dasharray="2 2"/>` : '';
  return `<svg viewBox="0 0 40 64" aria-hidden="true">
    <defs><clipPath id="t${id}"><path d="${top}"/></clipPath><clipPath id="b${id}"><path d="${bot}"/></clipPath></defs>
    <path d="${top}" fill="#f7fafc"/><path d="${bot}" fill="#f7fafc"/>
    <rect x="0" y="${yTop}" width="40" height="${32 - yTop}" fill="${SAND[kind]}" clip-path="url(#t${id})"/>
    <rect x="0" y="${yBot}" width="40" height="${60 - yBot}" fill="${SAND[kind]}" clip-path="url(#b${id})"/>
    ${flow}
    <path d="${top}" fill="none" stroke="#9fb2bf" stroke-width="1.3"/><path d="${bot}" fill="none" stroke="#9fb2bf" stroke-width="1.3"/>
    <rect x="2" y="0" width="36" height="5" rx="1.5" fill="#7a5634"/><rect x="2" y="59" width="36" height="5" rx="1.5" fill="#7a5634"/>
    <rect x="3" y="5" width="2.5" height="54" fill="#5a3d22"/><rect x="34.5" y="5" width="2.5" height="54" fill="#5a3d22"/>
  </svg>`;
}
const SPRING_SVG = '<svg class="terrain" viewBox="0 0 100 100"><ellipse cx="50" cy="50" rx="46" ry="38" fill="#79bfdc" stroke="#3f8fb3" stroke-width="4"/><path d="M26 52 q12 -9 24 0 t24 0" fill="none" stroke="#e8f6fb" stroke-width="5"/></svg>';
const RUIN_SVG = '<svg class="terrain" viewBox="0 0 100 100"><g fill="none" stroke="#8a6a44" stroke-width="6" stroke-linejoin="round" opacity=".7"><path d="M10 88 H90 M18 88 V40 M40 88 V40 M60 88 V40 M82 88 V40 M8 40 H92 L50 10 Z"/></g></svg>';

function pieceHtml(u, { lying, cls = '', sec = app.opts.showSec } = {}) {
  const k = KINDS[u.kind];
  const secHtml = sec ? `<span class="sec${u.rem < 10_000 ? ' low' : ''}">${fmtSec(u.rem)}</span>` : '';
  return `<div class="piece p${u.owner} ${lying ? 'lying' : ''} ${cls}" data-unit="${u.id}">
    <div class="disc"></div>${hourglass(u.rem / u.cap, u.kind)}<span class="kind">${k.short}</span>${secHtml}</div>`;
}

// 내 소환 줄이 항상 화면 아래에 오도록 회전한다
const rows = () => (app.me === 0 ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4]);
const cols = () => (app.me === 0 ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0]);

// ---------------------------------------------------------------- 상태 판단
const phase = () => (app.mode === 'online' ? app.net?.snap?.phase || 'waiting' : app.s?.over ? 'over' : 'playing');
const canAct = () => {
  const s = app.s;
  return s && !s.over && phase() === 'playing' && s.active === app.me && !app.paused && !app.pending;
};

// ---------------------------------------------------------------- 렌더링
let seenSeq = -1;
function render() {
  const s = app.s;
  if (!s) return;
  const mine = canAct();
  const sel = mine && app.selected && s.units[app.selected]?.pos ? s.units[app.selected] : null;
  if (!sel) app.selected = null;
  const moves = sel ? moveOptions(s, sel.id) : [];
  const attacks = sel ? attackOptions(s, sel.id) : [];
  const summonCells = mine && app.summonPick && canSummon(s) ? homeCells(s) : [];

  let html = '';
  for (const r of rows()) {
    for (const c of cols()) {
      const u = unitAt(s, c, r);
      const cls = ['cell'];
      if (r === 0) cls.push('home0');
      if (r === 4) cls.push('home1');
      const mv = moves.find((m) => m.c === c && m.r === r);
      if (mv) cls.push('target', mv.canFlip ? 'flip' : '');
      if (summonCells.some(([sc, sr]) => sc === c && sr === r)) cls.push('summon-target');
      if (u && attacks.some((a) => a.targetId === u.id)) cls.push('attackable');
      const terrain = isSpring(c, r) ? SPRING_SVG : isRuin(c, r) ? RUIN_SVG : '';
      let piece = '';
      if (u) {
        const pc = [];
        if (u.owner === s.active && u.acted) pc.push('acted');
        if (u.id === app.selected) pc.push('selected');
        piece = pieceHtml(u, { lying: u.owner !== s.active || s.over || phase() !== 'playing', cls: pc.join(' ') });
      }
      html += `<div class="${cls.join(' ')}" data-c="${c}" data-r="${r}"><span class="coord">${cellName(c, r)}</span>${terrain}${piece}</div>`;
    }
  }
  $('#board').innerHTML = html;

  // 비축
  const opp = 1 - app.me;
  const okList = mine ? summonable(s) : [];
  const myRes = reserve(s, app.me);
  $('#my-reserve').innerHTML = `<span class="label">내 비축</span>` + (myRes.length ? myRes.map((u) => {
    const c = [];
    if (mine && canSummon(s) && okList.includes(u)) c.push('usable');
    if (s.crumbled.includes(u.id) && s.active === app.me) c.push('locked');
    if (u.id === app.summonPick) c.push('chosen');
    return pieceHtml({ ...u, rem: u.cap }, { lying: true, cls: c.join(' '), sec: false });
  }).join('') : '<span class="empty">모두 보드 위에 있다</span>');
  const oppRes = reserve(s, opp);
  $('#opp-reserve').innerHTML = `<span class="label">${oppName()} 비축</span>` + (oppRes.length ? oppRes.map((u) => pieceHtml({ ...u, rem: u.cap }, { lying: true, sec: false })).join('') : '<span class="empty">없음</span>');

  // HUD
  const online = app.mode === 'online' ? app.net?.snap?.online || [true, true] : [true, true];
  const chip = (p) => `<span class="who"><span class="dot" style="background:var(--${p === 0 ? 'blue' : 'red'})"></span>${who(p)} · ${p === 0 ? '선' : '후'}${app.mode === 'online' && p !== app.me ? ` <span class="net${online[p] ? '' : ' off'}" title="${online[p] ? '접속 중' : '연결 끊김'}"></span>` : ''}</span>
    <span class="pts">${s.scores[p]}<small> / ${s.config.target}</small></span>`;
  $('#chip-me').innerHTML = chip(app.me);
  $('#chip-opp').innerHTML = chip(opp);
  $('#chip-me').classList.toggle('active', !s.over && s.active === app.me);
  $('#chip-opp').classList.toggle('active', !s.over && s.active === opp);
  $('#glass').innerHTML = `${hourglass(s.greatRem / s.config.greatMs, 'warrior')}<span class="t">${fmtClock(s.greatRem)}</span>`;

  // 배너
  const b = $('#banner');
  const set = (cls, text) => { b.className = `banner ${cls}`; b.textContent = text; };
  if (s.over) set('', '게임 종료');
  else if (phase() === 'countdown') set('warn', '곧 시작한다');
  else if (app.paused) set('warn', '일시정지 — 모든 모래가 멈췄다');
  else if (s.active === app.me && s.mustSummon) set('warn', '보드가 비었다. 아래 비축에서 하나를 골라 소환하라.');
  else if (s.active === app.me) set('mine', `${s.finalTurn ? '마지막 차례! ' : ''}내 차례 — 내 모래가 흐른다`);
  else if (app.mode === 'online' && !online[opp]) set('opp', '상대 연결이 끊겼다… (상대 모래는 계속 흐른다)');
  else set('opp', `${s.finalTurn ? `${oppName()}의 마지막 차례… ` : ''}${oppName()} 차례 — ${oppName()}의 모래가 흐른다`);

  $('#btn-end').disabled = !mine || (s.mustSummon && canSummon(s));

  // 기록
  if (s.seq !== seenSeq) {
    const fresh = seenSeq >= 0 && s.seq > seenSeq;
    seenSeq = s.seq;
    $('#log').innerHTML = s.log.slice().reverse().slice(0, 80)
      .map((l) => `<li class="${l.p === null ? '' : `p${l.p}`}">${l.p === null ? '' : `[${who(l.p)}] `}${l.text}</li>`).join('');
    if (fresh && $('#log-sheet').hidden) $('#log-badge').hidden = false;
  }
}

// ---------------------------------------------------------------- 시트
function closeSheets() {
  $('#scrim').hidden = true;
  $('#sheet').hidden = true;
  $('#log-sheet').hidden = true;
}
/** items: [{label, sub?, cls?, disabled?, run}] */
function openSheet(title, desc, items) {
  const sh = $('#sheet');
  sh.innerHTML = `<h3>${title}</h3>${desc ? `<p>${desc}</p>` : ''}`
    + items.map((it, i) => `<button class="btn ${it.cls || ''}" type="button" data-i="${i}" ${it.disabled ? 'disabled' : ''}>${it.label}${it.sub ? `<small>${it.sub}</small>` : ''}</button>`).join('')
    + '<button class="btn ghost" type="button" data-i="x">취소</button>';
  sh.onclick = (e) => {
    const i = e.target.closest('button')?.dataset.i;
    if (i === undefined) return;
    closeSheets();
    if (i !== 'x') items[Number(i)].run();
  };
  $('#scrim').hidden = false;
  sh.hidden = false;
}

// ---------------------------------------------------------------- 행동
function doAction(action) {
  app.selected = null;
  app.summonPick = null;
  if (app.mode === 'bot') {
    const res = apply(app.s, action);
    if (res && res.ok === false) toast(res.error);
    render();
    return;
  }
  const { code, token } = app.net;
  app.pending = true;
  render();
  Net.sendAction(code, token, action)
    .then((res) => { if (res && res.ok === false) toast(res.error); })
    .catch((e) => toast(e.message))
    .finally(() => { app.pending = false; render(); });
}

function onBoardPointer(e) {
  if (!canAct()) return;
  const s = app.s;
  const cellEl = e.target.closest('.cell');
  if (!cellEl) return;
  const c = Number(cellEl.dataset.c), r = Number(cellEl.dataset.r);
  const u = unitAt(s, c, r);

  if (app.summonPick && canSummon(s) && homeCells(s).some(([hc, hr]) => hc === c && hr === r)) {
    return doAction({ type: 'summon', unitId: app.summonPick, c, r });
  }
  if (app.selected) {
    const id = app.selected;
    const sel = s.units[id];
    const mv = moveOptions(s, id).find((m) => m.c === c && m.r === r);
    if (mv) {
      if (!mv.canFlip) return doAction({ type: 'move', unitId: id, c, r, flip: false });
      return openSheet(`${cellName(c, r)} 샘에 도착`, '샘에서 모래시계를 뒤집을 수 있다.', [
        { label: '↻ 뒤집고 이동', sub: `잔량 ${fmtSec(sel.rem)}초 → ${fmtSec(sel.cap - sel.rem)}초`, cls: 'primary', run: () => doAction({ type: 'move', unitId: id, c, r, flip: true }) },
        { label: '그대로 이동', sub: `잔량 ${fmtSec(sel.rem)}초 유지`, run: () => doAction({ type: 'move', unitId: id, c, r, flip: false }) },
      ]);
    }
    const at = u && attackOptions(s, id).find((a) => a.targetId === u.id);
    if (at) {
      return openSheet(`${KINDS[u.kind].name} 공격`, `${cellName(...u.pos)}의 ${oppName()} ${KINDS[u.kind].name}`, [
        { label: '↻ 강제 뒤집기', sub: `잔량 ${fmtSec(u.rem)}초 → ${fmtSec(u.cap - u.rem)}초`, run: () => doAction({ type: 'attack', unitId: id, targetId: u.id, mode: 'flip' }) },
        { label: at.pushOff ? '⇥ 밀어내기 — 보드 밖으로' : '⇥ 밀어내기', sub: at.pushOff ? '사막 밖으로 흩어져 소멸한다' : at.canPush ? `${cellName(...at.pushTo)}로 밀려난다` : '뒤 칸이 막혀 밀 수 없다', cls: at.pushOff ? 'danger' : '', disabled: !at.canPush, run: () => doAction({ type: 'attack', unitId: id, targetId: u.id, mode: 'push' }) },
      ]);
    }
  }
  if (u && u.owner === app.me && !u.acted) { app.selected = u.id === app.selected ? null : u.id; app.summonPick = null; render(); return; }
  app.selected = null;
  render();
}

function onReservePointer(e) {
  if (!canAct() || !canSummon(app.s)) return;
  const p = e.target.closest('.piece');
  if (!p) return;
  const id = p.dataset.unit;
  if (!summonable(app.s).some((u) => u.id === id)) return;
  app.summonPick = app.summonPick === id ? null : id;
  app.selected = null;
  render();
}

function onEnd() {
  if (!canAct()) return;
  if (app.s.mustSummon && canSummon(app.s)) return toast('보드가 비면 먼저 소환해야 한다.');
  doAction({ type: 'end' });
}

function openMenu() {
  if (!app.s) return;
  const items = [];
  if (app.mode === 'bot' && !app.s.over) {
    items.push({ label: app.paused ? '▶ 계속' : '❚❚ 일시정지', sub: '봇 대전에서만 쓸 수 있다', run: () => { app.paused = !app.paused; lastFrame = performance.now(); if (!app.paused) scheduleBot(); render(); } });
  }
  if (app.mode === 'online') items.push({ label: '🔗 방 링크 복사', sub: `코드 ${app.net.code}`, run: () => copyLink() });
  if (!app.s.over) items.push({ label: '🏳 기권', cls: 'danger', run: () => confirmResign() });
  items.push({ label: '📖 규칙서', run: () => window.open('rules.html', '_blank') });
  items.push({ label: '⌂ 홈으로', sub: app.mode === 'online' ? '링크로 다시 들어올 수 있다' : '이 게임은 끝난다', run: () => goHome() });
  openSheet('메뉴', '', items);
}

function confirmResign() {
  openSheet('기권할까?', '기권하면 바로 진다.', [
    { label: '기권한다', cls: 'danger', run: () => {
      if (app.mode === 'bot') { resign(app.s, app.me); render(); } else doAction({ type: 'resign' });
    } },
  ]);
}

// ---------------------------------------------------------------- 봇 대전
function scheduleBot() {
  clearTimeout(app.botTimer);
  const s = app.s;
  if (app.mode !== 'bot' || !s || s.over || app.paused || s.active === app.me) return;
  app.botTimer = setTimeout(() => {
    if (app.mode !== 'bot' || !app.s || app.s.over || app.paused || app.s.active === app.me) return;
    apply(app.s, chooseAction(app.s, app.opts.level));
    render();
    scheduleBot();
  }, app.opts.botDelay * (0.7 + Math.random() * 0.6));
}

function startBot() {
  const st = readSettings();
  saveSettings();
  stopOnline();
  app.mode = 'bot';
  app.opts = { showSec: st.showSec, level: st.level, botDelay: st.botDelay };
  app.me = st.side === 'random' ? (Math.random() < 0.5 ? 0 : 1) : Number(st.side);
  app.s = newGame({ greatMs: st.greatMin * 60_000, target: st.target, handleMs: st.handleMs });
  resetView();
  show('game');
  render();
  scheduleBot();
}

// ---------------------------------------------------------------- 온라인 대전
function roomUrl(code) { return `${location.origin}${location.pathname}?room=${code}`; }

function copyLink() {
  const url = roomUrl(app.net.code);
  copyText(url).then((ok) => toast(ok ? '링크를 복사했다.' : `복사하지 못했다: ${url}`, ok ? 2000 : 5000));
}

function stopOnline() {
  if (app.net?.stop) app.net.stop();
  app.net = null;
}

function goOnline(code, token) {
  stopOnline();
  app.mode = 'online';
  app.opts = { ...app.opts, showSec: readSettings().showSec };
  app.net = { code, token, snap: null, stop: null, status: 'connecting', countEnd: 0 };
  Net.saveSeat(code, token);
  history.replaceState(null, '', `?room=${code}`);
  $('#wait-code').textContent = code;
  app.net.stop = Net.connect(code, token, {
    onSnap: onSnapshot,
    onStatus: (st) => { if (app.net) { app.net.status = st; if (st === 'reconnecting') toast('연결이 끊겨 다시 연결하는 중…', 1500); } },
    onFatal: (msg) => { toast(msg, 4000); Net.forgetSeat(code); goHome(); },
  });
}

function onSnapshot(snap) {
  if (!app.net) return;
  const prevStart = app.net.snap?.startAt;
  app.net.snap = snap;
  app.me = snap.seat;
  if (snap.phase === 'waiting') {
    const c = snap.cfg;
    $('#wait-cfg').textContent = `대모래시계 ${c.greatMin}분 · 목표 ${c.target}점 · 조작 시간 ${c.handleMs ? '1초' : '끔'} · 방장은 ${snap.seat === 0 ? '선' : '후'} 플레이어`;
    show('wait');
    return;
  }
  if (snap.startAt !== prevStart) { resetView(); if ($('#over').open) $('#over').close(); }
  app.s = snap.state;
  lastFrame = performance.now();
  if (snap.phase === 'countdown') app.net.countEnd = performance.now() + (snap.startAt - snap.serverNow);
  show('game');
  if (snap.phase === 'over' && $('#over').open) updateOverRematch();
  render();
}

async function hostRoom() {
  const st = readSettings();
  saveSettings();
  $('#home-err').textContent = '';
  try {
    const r = await Net.createRoom({ side: st.side, greatMin: st.greatMin, target: st.target, handleMs: st.handleMs });
    goOnline(r.code, r.token);
    show('wait');
  } catch (e) { $('#home-err').textContent = e.message; }
}

async function joinByCode(raw) {
  const code = String(raw || '').trim().toUpperCase();
  $('#home-err').textContent = '';
  if (!/^[A-Z2-9]{5}$/.test(code)) { $('#home-err').textContent = '방 코드는 5자리다.'; return; }
  const saved = Net.loadSeat(code);
  if (saved) { goOnline(code, saved); return; }
  try {
    const r = await Net.joinRoom(code);
    goOnline(r.code, r.token);
  } catch (e) { $('#home-err').textContent = e.message; }
}

// ---------------------------------------------------------------- 종료 화면
function showOver() {
  const s = app.s;
  const win = s.winner === app.me;
  const why = { score: `${PLAYER_NAME[s.winner]}가 ${s.config.target}점에 먼저 도달했다.`, time: '대모래시계가 다 떨어져 마지막 점수 계산으로 승부가 났다.', resign: s.winner === app.me ? '상대가 기권했다.' : '기권했다.' }[s.endReason];
  $('#over-body').innerHTML = `<p class="over-title">${win ? '승리!' : '패배'}</p><p>${why}</p>
    <p>최종 점수 — 나 <b>${s.scores[app.me]}</b> : ${oppName()} <b>${s.scores[1 - app.me]}</b><br>총 ${s.turn}차례 · 대모래시계 ${fmtClock(s.config.greatMs - s.greatRem)} 경과</p>
    <p class="hint" id="over-rematch"></p>`;
  updateOverRematch();
  $('#over').showModal();
}
function updateOverRematch() {
  const el = $('#over-rematch');
  if (!el || app.mode !== 'online') return;
  const rm = app.net?.snap?.rematch || [false, false];
  el.textContent = rm[app.me] ? '상대가 "다시 하기"를 누르기를 기다리는 중… (선후를 바꿔 시작한다)' : rm[1 - app.me] ? '상대가 다시 하기를 원한다.' : '';
}
function again() {
  if (app.mode === 'bot') { $('#over').close(); startBot(); return; }
  Net.requestRematch(app.net.code, app.net.token).then(updateOverRematch, (e) => toast(e.message));
}

// ---------------------------------------------------------------- 화면 전환·루프
function resetView() {
  app.selected = null; app.summonPick = null; app.paused = false; app.pending = false;
  seenSeq = -1; app.overShownFor = null;
  $('#log-badge').hidden = true;
  closeSheets();
}

function goHome() {
  clearTimeout(app.botTimer);
  stopOnline();
  app.mode = null;
  app.s = null;
  if ($('#over').open) $('#over').close();
  closeSheets();
  history.replaceState(null, '', location.pathname);
  show('home');
}

let lastFrame = performance.now();
let lastRender = 0;
let lastActive = null;
function frame(now) {
  const dt = Math.min(now - lastFrame, 5000);
  lastFrame = now;
  const s = app.s;
  if (s && !s.over) {
    if (app.mode === 'bot' && !app.paused) tick(s, dt);
    if (app.mode === 'online' && phase() === 'playing') {
      // 표시용 예측: 다음 서버 스냅숏(최대 2초)까지 모래를 줄여 보여 준다. 판정은 서버가 한다.
      s.greatRem = Math.max(0, s.greatRem - dt);
      for (const u of Object.values(s.units)) if (u.pos && u.owner === s.active) u.rem = Math.max(0, u.rem - dt);
    }
  }
  if (s) {
    if (s.active !== lastActive) { lastActive = s.active; app.selected = null; app.summonPick = null; if (app.mode === 'bot') scheduleBot(); }
    // 카운트다운
    const cnt = $('#count');
    const left = app.mode === 'online' && phase() === 'countdown' ? app.net.countEnd - now : 0;
    if (left > 0) { cnt.hidden = false; cnt.textContent = String(Math.ceil(left / 1000)); } else cnt.hidden = true;
    if (now - lastRender > 100) { lastRender = now; render(); }
    const key = app.mode === 'online' ? app.net?.snap?.startAt : s;
    if (s.over && app.overShownFor !== key) { app.overShownFor = key; clearTimeout(app.botTimer); render(); showOver(); }
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- 연결
$('#btn-bot').addEventListener('click', startBot);
$('#btn-host').addEventListener('click', hostRoom);
$('#join-form').addEventListener('submit', (e) => { e.preventDefault(); joinByCode($('#join-code').value); });
$('#settings').addEventListener('change', saveSettings);
$('#board').addEventListener('pointerdown', onBoardPointer);
$('#my-reserve').addEventListener('pointerdown', onReservePointer);
$('#btn-end').addEventListener('click', onEnd);
$('#btn-menu').addEventListener('click', openMenu);
$('#btn-log').addEventListener('click', () => { $('#log-badge').hidden = true; $('#scrim').hidden = false; $('#log-sheet').hidden = false; });
$('#log-sheet').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheets(); });
$('#scrim').addEventListener('click', closeSheets);
$('#btn-copy').addEventListener('click', copyLink);
$('#btn-share').addEventListener('click', () => {
  const url = roomUrl(app.net.code);
  if (navigator.share) navigator.share({ title: 'LASTGRAIN 대전', text: `LASTGRAIN 한 판 하자! 방 코드 ${app.net.code}`, url }).catch(() => {});
  else copyLink();
});
$('#btn-wait-cancel').addEventListener('click', goHome);
$('#btn-again').addEventListener('click', again);
$('#btn-over-home').addEventListener('click', goHome);
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !$('#game').hidden && !$('#over').open && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); onEnd(); }
  if (e.key === 'Escape') { app.selected = null; app.summonPick = null; closeSheets(); render(); }
});
// 화면 잠금에서 돌아오면 시간을 다시 맞춘다
document.addEventListener('visibilitychange', () => { if (!document.hidden) lastFrame = performance.now(); });

loadSettings();
if (!navigator.share) $('#btn-share').textContent = '링크 공유 (복사)';
const qRoom = new URLSearchParams(location.search).get('room');
if (qRoom) { $('#join-code').value = qRoom.toUpperCase(); joinByCode(qRoom); }
requestAnimationFrame(frame);
