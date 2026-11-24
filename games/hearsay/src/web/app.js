// HEARSAY 웹 클라이언트. 서버가 보내 주는 "내가 볼 수 있는 정보"만 그린다.
// 지난 계절 기록이나 지난 말은 화면에 남기지 않는다(기둥 1: 메모 금지).

const HOUSE = {
  red: { name: '빨강', hex: 'var(--red)' }, blue: { name: '파랑', hex: 'var(--blue)' },
  yellow: { name: '노랑', hex: 'var(--yellow)' }, green: { name: '초록', hex: 'var(--green)' },
  purple: { name: '보라', hex: 'var(--purple)' }, black: { name: '검정', hex: 'var(--black)' },
  grey: { name: '회색', hex: 'var(--grey)' },
};
const PERSONA = { archivist: '기록형', politician: '정치형', schemer: '조작형', follower: '휩쓸림형' };
const PHASE = { claim: '점유', claimResult: '점유 공개', choose: '질문 칸 고르기', whisper: '속삭임', result: '증언 공개', ended: '게임 끝' };

const $ = (id) => document.getElementById(id);
const eunNeun = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0 ? '은' : '는'; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 불가 환경 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};

let session = null; // { code, token }
let es = null;
let view = null;
let viewAt = 0;
let selectedToken = null;
let lastQKey = '';

// ───────── 서버 ─────────
async function api(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `오류 ${res.status}`);
  return data;
}
const act = (body) => api(`/api/rooms/${session.code}/act`, { ...body, token: session.token }).catch((e) => toast(e.message));

function connect(code, token) {
  session = { code, token };
  store.set(`hearsay:${code}`, token);
  history.replaceState(null, '', `?room=${code}`);
  es?.close();
  es = new EventSource(`/api/rooms/${code}/stream?token=${encodeURIComponent(token)}`);
  es.onmessage = (ev) => {
    view = JSON.parse(ev.data); viewAt = performance.now();
    const qk = `${view.phase}|${view.season}|${view.question?.plot}|${view.question?.season}`;
    if (qk !== lastQKey) { selectedToken = null; lastQKey = qk; }
    render();
  };
  es.onerror = async () => {
    // 방이 사라졌거나 참가자가 아니면 처음 화면으로
    const r = await fetch(`/api/rooms/${code}`).catch(() => null);
    if (r && r.status === 404) { leave('방이 사라졌습니다 (서버 재시작 또는 오래 비어 있던 방)'); }
  };
}

function leave(msg) {
  es?.close(); es = null;
  keepAwake(false);
  if (typeof setChat === 'function') setChat(false);
  if (session) store.del(`hearsay:${session.code}`);
  session = null; view = null;
  history.replaceState(null, '', location.pathname);
  show('home');
  $('homeError').textContent = msg || '';
  $('status').innerHTML = '';
}

// ───────── 화면 전환 ─────────
function show(id) { for (const s of ['home', 'lobby', 'game']) $(s).classList.toggle('hidden', s !== id); }

function render() {
  if (!view) return;
  if (view.lobby) { renderLobby(); return; }
  show('game');
  keepAwake(view.phase !== 'ended');
  renderStatus();
  renderBoard();
  renderPlayers();
  renderPanel();
  renderChat();
}

function renderLobby() {
  show('lobby');
  $('lobbyCode').textContent = view.code;
  $('shareLink').value = `${location.origin}/?room=${view.code}`;
  const items = [];
  for (let i = 0; i < view.size; i++) {
    const s = view.seats[i];
    items.push(s
      ? `<li><span class="dot" style="background:${HOUSE[Object.keys(HOUSE)[i]].hex}"></span>${esc(s.name)}${i === view.you ? ' <span class="badge">나</span>' : ''}${i === 0 ? ' <span class="muted">방장</span>' : ''}</li>`
      : '<li class="empty">빈자리 (시작하면 봇)</li>');
  }
  $('seatList').innerHTML = items.join('');
  $('startBtn').classList.toggle('hidden', !view.isHost);
  $('lobbyHint').textContent = view.isHost ? '모두 모이면 시작하세요.' : '방장이 시작하기를 기다리는 중입니다.';
  $('status').innerHTML = `방 <b class="code">${esc(view.code)}</b> · 대기 중`;
}

function msLeft() {
  if (view?.deadlineIn == null) return null;
  return Math.max(0, view.deadlineIn - (performance.now() - viewAt));
}

function renderStatus() {
  const season = view.council?.kind === 'final' || (view.phase === 'ended') ? '마지막 회의' : `${view.season}계절 / 7`;
  const left = view.council ? `<span class="st-left"> · 남은 질문 ${view.council.left}</span>` : '';
  $('status').innerHTML = `<span class="st-room">방 <b class="code">${esc(view.code)}</b> · </span><b>${season}</b> · ${PHASE[view.phase] ?? view.phase}${left} <span class="timer" id="timer"></span>`;
  tickTimer();
}

function tickTimer() {
  const t = msLeft();
  const el = $('timer');
  if (el) el.textContent = t == null || view.phase === 'ended' ? '' : `${Math.ceil(t / 1000)}초`;
  const bar = document.querySelector('#panel .bar > i');
  if (bar && t != null && view.phase === 'whisper') bar.style.width = `${(t / 60000) * 100}%`;
}
setInterval(() => { if (view && !view.lobby) { tickTimer(); fadeChat(); } }, 250);

function colLabel(s) {
  if (s <= view.forgotten) return '망각됨';
  if (s === view.season) return '이번';
  if (s === view.season - 1) return '직전';
  return '';
}

function renderBoard() {
  const me = view.me;
  const choosing = view.phase === 'choose' && me && view.questioner === me.index;
  const drawnMap = new Map((view.drawn ?? []).map((d) => [d.id, d.askable]));
  const feuds = view.claimReveal?.feuds ?? [];
  let h = '<table class="board"><thead><tr><th class="plot"></th>';
  for (let s = 1; s <= 7; s++) h += `<th class="colh ${s === view.season ? 'cur' : ''}">${s}계절<small>${colLabel(s)}</small></th>`;
  h += '</tr></thead><tbody>';
  for (const row of view.board) {
    const drawn = drawnMap.has(row.id);
    h += `<tr><th class="plot"><span class="nm">${esc(row.name)}</span><span class="val">${row.value}</span>${drawn ? ' <span class="badge">회상</span>' : ''}</th>`;
    row.cells.forEach((c, k) => {
      const s = k + 1;
      const cls = [];
      if (c.forgotten) cls.push('forgotten');
      else if (s > view.season) cls.push('future');
      const askable = choosing && drawn && drawnMap.get(row.id).includes(s);
      if (askable) cls.push('askable');
      if (view.question && view.question.plot === row.id && view.question.season === s) cls.push('questioned');
      if (view.phase === 'claimResult' && s === view.season && feuds.includes(row.id)) cls.push('feud');
      let inner = '';
      if (c.tile) {
        const fading = view.phase === 'claimResult' && s === view.season - 1;
        inner = `<span class="tile ${fading ? 'fadeout' : ''}" style="background:${HOUSE[c.tile].hex}" title="${HOUSE[c.tile].name}"></span>`;
      } else if (c.chron) {
        inner = `<span class="ring" style="--c:${HOUSE[c.chron].hex}" title="공식 역사: ${HOUSE[c.chron].name}"></span>`;
      }
      h += `<td class="${cls.join(' ')}" ${askable ? `data-ask="${row.id}:${s}" title="${s}계절 ${esc(row.name)} 질문하기"` : ''}>${inner}</td>`;
    });
    h += '</tr>';
  }
  h += '</tbody></table>';
  $('board').innerHTML = h;
}

function nameOf(i) { return view.players[i]?.name ?? '?'; }
function swatch(c) { return `<span class="dot" style="background:${HOUSE[c]?.hex ?? 'transparent'}"></span>`; }
function answerLabel(c) {
  if (c === 'grey') return '아무도 없었다';
  if (c === 'empty' || c === 'none') return '빈 주먹';
  const i = view.players.findIndex((p) => p.color === c);
  return `${HOUSE[c].name}${i >= 0 ? ` (${esc(nameOf(i))})` : ''}`;
}

function renderPlayers() {
  $('players').innerHTML = view.players.map((p, i) => `
    <div class="pl ${view.me?.index === i ? 'me' : ''} ${view.questioner === i && view.phase !== 'ended' ? 'isq' : ''} ${p.ready ? 'isready' : ''}">
      ${swatch(p.color)}
      <div><div class="nm">${esc(p.name)} ${view.questioner === i && view.phase !== 'ended' ? '<span class="badge">질문자</span>' : ''}</div>
      <div class="meta">${p.isBot ? `봇 · ${PERSONA[p.persona] ?? ''}` : '사람'}${view.me?.index === i ? ' · 나' : ''} ${p.ready ? '<span class="ready">✓ 준비</span>' : ''}</div></div>
      <div class="sc">${p.score}</div>
    </div>`).join('');
}

function renderPanel() {
  const me = view.me;
  const p = $('panel');
  const q = view.question;
  const qName = q ? `${q.season}계절 ${esc(view.board.find((b) => b.id === q.plot).name)}` : '';
  switch (view.phase) {
    case 'claim': {
      if (me.claim) {
        const nm = view.board.find((b) => b.id === me.claim).name;
        p.innerHTML = `<h3>${esc(nm)} 카드를 뒷면으로 놓았습니다</h3><p class="muted">다른 이야기꾼을 기다리는 중… 놓은 카드는 바꿀 수 없습니다.</p>`;
      } else {
        p.innerHTML = `<h3>${view.season}계절 점유 — 구역 카드 한 장을 고르세요</h3>
          <p class="muted">모두 동시에 공개합니다. 같은 구역을 고른 사람끼리는 다툼이 되어 아무도 갖지 못합니다.${view.season > 1 ? ' 직전 계절의 땅은 이번 공개 뒤 사라집니다. 지금 잘 봐 두세요.' : ''}</p>
          <div class="choices">${view.board.map((b) => `<button data-claim="${b.id}" type="button">${esc(b.name)} <b>${b.value}</b></button>`).join('')}</div>`;
      }
      break;
    }
    case 'claimResult': {
      const r = view.claimReveal;
      p.innerHTML = `<h3>점유 공개</h3>
        <div class="reveal">${r.picks.map((pid, i) => `<div>${swatch(view.players[i].color)} ${esc(nameOf(i))}<br><b>${esc(view.board.find((b) => b.id === pid).name)}</b>${r.feuds.includes(pid) ? '<br><span class="muted">다툼</span>' : ''}</div>`).join('')}</div>
        ${view.season > 1 ? `<p class="muted">곧 ${view.season - 1}계절의 땅이 망각 주머니로 들어갑니다.</p>` : ''}`;
      break;
    }
    case 'choose': {
      const drawn = view.drawn.map((d) => view.board.find((b) => b.id === d.id).name).map(esc).join(', ');
      if (me && view.questioner === me.index) {
        p.innerHTML = `<h3>당신이 질문자입니다</h3><p>회상 카드: <b>${drawn}</b></p>
          <p>보드에서 빨간 테두리 칸(망각된 계절, 아직 기록 없음) 중 하나를 눌러 질문하세요.</p>
          <p class="muted">선언할 때까지 모두 침묵합니다. 당신은 질문자여도 자기 집안 색을 증언할 수 없습니다.</p>`;
      } else {
        p.innerHTML = `<h3>${esc(nameOf(view.questioner))}이(가) 질문 칸을 고르는 중</h3><p>회상 카드: <b>${drawn}</b></p><p class="muted">선언 전에는 아무도 말할 수 없습니다.</p>`;
      }
      break;
    }
    case 'whisper': {
      const fist = me?.fist;
      let mine;
      if (fist) {
        mine = `<p>주먹을 내밀었습니다: <b>${answerLabel(fist)}</b> <span class="muted">(공개 전까지 바꿀 수 없음)</span></p>`;
      } else {
        const tokenLabel = (t) => (t === 'grey' ? '아무도 없었다' : esc(nameOf(view.players.findIndex((pl) => pl.color === t))));
        const opts = me.tokens.map((t) => `<button type="button" data-token="${t}" class="${selectedToken === t ? 'sel' : ''}" title="${t === 'empty' ? '빈 주먹' : answerLabel(t)}">${t === 'empty' ? '✊ 빈 주먹' : `${swatch(t)} ${tokenLabel(t)}`}</button>`).join('');
        mine = `<p><b>증언 토큰을 고르세요</b> <span class="muted">— 당신(${HOUSE[me.color].name})의 색은 없습니다</span></p>
          <div class="choices tokens">${opts}</div>
          <button type="button" class="primary" id="fistBtn" ${selectedToken ? '' : 'disabled'}>주먹 내밀기</button>`;
      }
      const claimBtns = [...view.players.map((pl) => pl.color), 'grey'].map((c) => `<button type="button" data-assert="${c}">${swatch(c)} ${c === me.color ? '내 땅이었어' : answerLabel(c)}</button>`).join('');
      p.innerHTML = `<h3>“${qName}의 주인은 누구였나?”</h3>
        <div class="bar"><i></i></div>
        ${mine}
        <p class="muted">빠른 주장 (말로 하기, 거짓말도 됩니다)</p><div class="choices assertRow">${claimBtns}</div>`;
      break;
    }
    case 'result': {
      const r = view.result;
      const counts = Object.entries(r.counts).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${swatch(k)} ${answerLabel(k)} ${c}`).join(' · ') || '유효한 증언 없음';
      const verdict = r.blank ? '공백 — 아무것도 기록되지 않았다' : r.official === 'grey' ? '공식 역사: 아무도 없었다' : `공식 역사: ${answerLabel(r.official)}`;
      p.innerHTML = `<h3>${r.season}계절 ${esc(view.board.find((b) => b.id === r.plot).name)} — 증언 공개</h3>
        <div class="reveal">${r.fists.map((f, i) => `<div>${esc(nameOf(i))}${i === view.questioner ? ' <span class="muted">(질문자)</span>' : ''}<br>${f === 'none' || f === 'empty' ? '✊ 빈 주먹' : `${swatch(f)} ${answerLabel(f)}`}${r.gains[i] ? `<br><b>+${r.gains[i]}</b>` : ''}</div>`).join('')}</div>
        <p class="muted">${counts}</p><p class="verdict">${verdict}</p>`;
      break;
    }
    case 'ended': {
      const order = view.players.map((pl, i) => ({ ...pl, i })).sort((a, b) => b.score - a.score);
      p.innerHTML = `<h3>게임 끝 — 마을의 공식 역사가 완성되었습니다</h3>
        <ol class="rank">${order.map((pl) => `<li>${swatch(pl.color)} ${esc(pl.name)}${pl.isBot ? ' <span class="muted">봇</span>' : ''}<b>${pl.score}</b></li>`).join('')}</ol>
        <p class="muted">실제로 무슨 일이 있었는지는 아무도 모릅니다. 진실은 망각 주머니 속에 영원히 남습니다.</p>
        <div class="row"><button type="button" class="primary" data-again="${view.players.length}">같은 인원으로 봇 대전 다시</button><button type="button" id="homeBtn">처음으로</button></div>`;
      break;
    }
    default: p.innerHTML = '';
  }
  tickTimer();
}

// 말: 지난 말은 남기지 않는다. ttl이 지나면 사라진다.
let chatShown = new Map();
function renderChat() {
  const log = $('chatLog');
  const now = performance.now();
  const ids = new Set(view.chat.map((m) => m.id));
  for (const [id, el] of chatShown) if (!ids.has(id)) { el.remove(); chatShown.delete(id); }
  for (const m of view.chat) {
    if (chatShown.has(m.id)) continue;
    const el = document.createElement('div');
    el.className = `msg ${m.assert ? 'assert' : ''}`;
    el.dataset.expire = String(now + m.ttl);
    const pl = view.players[m.from];
    el.innerHTML = `<span class="who" style="color:${HOUSE[pl.color].hex}">${esc(pl.name)}</span>${esc(m.text)}`;
    log.appendChild(el);
    chatShown.set(m.id, el);
    if (isPhone() && !chatOpen && m.from !== view.me?.index) {
      showBubble(pl, m.text);
      unread++;
    }
  }
  const badge = $('chatBadge');
  badge.textContent = String(unread);
  badge.classList.toggle('hidden', unread === 0 || chatOpen);
  $('chatFab').classList.toggle('hidden', view.phase === 'ended');
  log.scrollTop = log.scrollHeight;
  $('chatInput').disabled = !view.canSpeak;
  $('chatInput').placeholder = view.canSpeak ? '주장하고, 설득하고, 거래하세요' : '지금은 침묵해야 합니다';
  document.querySelector('.chat').classList.toggle('silent', !view.canSpeak);
}
function fadeChat() {
  const now = performance.now();
  for (const [id, el] of chatShown) {
    const left = Number(el.dataset.expire) - now;
    if (left <= 0) { el.remove(); chatShown.delete(id); } else if (left < 4000) el.style.opacity = String(left / 4000);
  }
}

function toast(msg) {
  const p = $('panel');
  const n = document.createElement('p');
  n.className = 'error';
  n.textContent = msg;
  p.prepend(n);
  setTimeout(() => n.remove(), 3500);
}

// ───────── 입력 ─────────
const nameInput = $('nameInput');
nameInput.value = store.get('hearsay:name') || '';
const myName = () => { const v = nameInput.value.trim() || '이야기꾼'; store.set('hearsay:name', v); return v; };

async function startSolo(size) {
  try { const r = await api('/api/rooms', { name: myName(), size, mode: 'solo' }); connect(r.code, r.token); } catch (e) { $('homeError').textContent = e.message; }
}

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button, td[data-ask]');
  if (!t) return;
  if (t.dataset.solo) startSolo(Number(t.dataset.solo));
  else if (t.dataset.multi) {
    try { const r = await api('/api/rooms', { name: myName(), size: Number(t.dataset.multi), mode: 'multi' }); connect(r.code, r.token); } catch (e) { $('homeError').textContent = e.message; }
  } else if (t.id === 'joinBtn') joinRoom($('codeInput').value);
  else if (t.id === 'startBtn') api(`/api/rooms/${session.code}/start`, { token: session.token }).catch((e) => ($('lobbyHint').textContent = e.message));
  else if (t.id === 'leaveBtn' || t.id === 'homeBtn') leave();
  else if (t.id === 'copyBtn') { navigator.clipboard?.writeText($('shareLink').value); t.textContent = '복사됨'; }
  else if (t.dataset.claim) act({ type: 'claim', plot: t.dataset.claim });
  else if (t.dataset.ask) { const [plot, season] = t.dataset.ask.split(':'); act({ type: 'ask', plot, season: Number(season) }); }
  else if (t.dataset.token) { selectedToken = t.dataset.token; renderPanel(); }
  else if (t.id === 'fistBtn' && selectedToken) { const tok = selectedToken; selectedToken = null; act({ type: 'fist', choice: tok }); }
  else if (t.dataset.assert) {
    const c = t.dataset.assert;
    const q = view.question;
    const plotName = view.board.find((b) => b.id === q.plot).name;
    const jn = eunNeun(plotName);
    const text = c === view.me.color ? `${q.season}계절 ${plotName}${jn} 내 땅이었어.` : c === 'grey' ? `${q.season}계절 ${plotName}엔 아무도 없었어.` : `${q.season}계절 ${plotName}${jn} ${HOUSE[c].name}(${nameOf(view.players.findIndex((pl) => pl.color === c))}) 땅이었어.`;
    act({ type: 'say', text, assert: c });
  } else if (t.dataset.again) leaveThen(() => startSolo(Number(t.dataset.again)));
});

function leaveThen(fn) { leave(); fn(); }

$('chatForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const v = $('chatInput').value.trim();
  if (!v || !session) return;
  $('chatInput').value = '';
  act({ type: 'say', text: v });
});
$('helpBtn').addEventListener('click', () => $('help').showModal());

// ───────── 휴대폰 (아이폰) ─────────
const phoneMq = matchMedia('(max-width: 600px)');
const isPhone = () => phoneMq.matches;
let chatOpen = false;
let unread = 0;
function setChat(open) {
  chatOpen = open;
  document.querySelector('.chat').classList.toggle('open', open);
  $('scrim').classList.toggle('hidden', !open);
  if (open) { unread = 0; $('chatBadge').classList.add('hidden'); $('bubbles').innerHTML = ''; }
  else $('chatInput').blur();
}
$('chatFab').addEventListener('click', () => setChat(true));
$('chatClose').addEventListener('click', () => setChat(false));
$('scrim').addEventListener('click', () => setChat(false));
phoneMq.addEventListener('change', () => { if (!isPhone()) setChat(false); });

function showBubble(pl, text) {
  const box = $('bubbles');
  const b = document.createElement('div');
  b.className = 'bubble';
  b.innerHTML = `<b style="color:${HOUSE[pl.color].hex}">${esc(pl.name)}</b>${esc(text)}`;
  box.appendChild(b);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => b.remove(), 5200);
}

// 아래 시트 높이만큼 보드 아래에 여백을 두고, 말 버튼·말풍선을 시트 위에 띄운다
new ResizeObserver(() => {
  const h = isPhone() && !$('game').classList.contains('hidden') ? $('panel').offsetHeight : 0;
  document.documentElement.style.setProperty('--sheet-h', `${h}px`);
}).observe($('panel'));

// iOS 키보드가 올라오면 말 서랍을 키보드 위로 올린다
if (window.visualViewport) {
  const vv = window.visualViewport;
  const onVV = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', `${kb}px`);
  };
  vv.addEventListener('resize', onVV);
  vv.addEventListener('scroll', onVV);
}
$('chatInput').addEventListener('focus', () => { if (isPhone() && !chatOpen) setChat(true); });

// 게임 중에는 화면이 꺼지지 않게 한다 (iOS 16.4+)
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* 지원하지 않거나 거부됨 */ }
}

// 앱 전환 뒤 돌아오면 연결을 다시 잇는다 (iOS는 백그라운드에서 SSE를 끊는다)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !session) return;
  if (!es || es.readyState === EventSource.CLOSED) connect(session.code, session.token);
  if (view && !view.lobby && view.phase !== 'ended') keepAwake(true);
});
$('brand').addEventListener('click', () => { if (!session || view?.phase === 'ended' || confirm('처음 화면으로 갈까요? 진행 중인 게임은 그대로 이어집니다(같은 링크로 돌아올 수 있음).')) { es?.close(); es = null; session = null; view = null; history.replaceState(null, '', location.pathname); show('home'); $('status').innerHTML = ''; } });

async function joinRoom(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!code) return;
  const saved = store.get(`hearsay:${code}`);
  if (saved) { connect(code, saved); return; }
  try { const r = await api(`/api/rooms/${code}/join`, { name: myName() }); connect(r.code, r.token); } catch (e) { $('homeError').textContent = e.message; show('home'); }
}

// 링크로 들어온 경우
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) {
  const code = roomParam.toUpperCase();
  const saved = store.get(`hearsay:${code}`);
  if (saved) connect(code, saved);
  else { $('codeInput').value = code; $('homeError').textContent = '이름을 확인하고 "참가"를 누르세요.'; }
}
