// LIGHTCONE 웹 클라이언트. 봇 대전(브라우저 안에서 진행)과 온라인 대전(서버가 진행)을 같은 화면으로 그린다.
// 화면은 엔진의 playerView(내가 알아도 되는 정보)만 보고 그린다.
import { ADJ, SYSTEMS, PLANETS, POS, STRENGTH, ROUNDS } from './src/map.js';
import {
  newGame, submitMoves, submitAttacks, submitBlockades, submitOccupations, blockadeOptions,
  publicView, playerView, validateOccupations, STAY,
} from './src/engine.js';
import { botMoves, botAttacks, botBlockades, botOccupations } from './src/bot.js';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const narrow = matchMedia('(max-width: 899px)');

let session = null;
let view = null;
let ui = null;
let uiKey = '';
let busy = false;

// ---------------------------------------------------------------- 세션: 봇 대전
class BotSession {
  constructor() {
    this.kind = 'bot';
    this.me = 'A';
    this.cheat = false;
    this.game = newGame({ seed: Math.floor(Math.random() * 2 ** 31) });
  }

  view() { return playerView(this.game, 'A', { revealOpp: this.cheat }); }

  async submit(kind, payload) {
    const g = this.game;
    const bv = () => publicView(g, 'B');
    const botBlocks = () => botBlockades(g, blockadeOptions(g).filter((o) => o.blocker === 'B'));
    if (kind === 'moves') submitMoves(g, { A: payload, B: botMoves(bv()) });
    else if (kind === 'attacks') {
      submitAttacks(g, { A: payload, B: botAttacks(bv()) });
      if (g.phase === 'blockade' && !blockadeOptions(g).some((o) => o.blocker === 'A')) submitBlockades(g, { A: [], B: botBlocks() });
    } else if (kind === 'blockades') submitBlockades(g, { A: payload, B: botBlocks() });
    else if (kind === 'occupations') {
      const err = validateOccupations(g, 'A', payload);
      if (err) throw new Error(err);
      submitOccupations(g, { A: payload, B: botOccupations(bv(), g) });
    } else if (kind === 'rematch') this.game = newGame({ seed: Math.floor(Math.random() * 2 ** 31) });
    refresh();
  }

  close() {}
}

// ---------------------------------------------------------------- 세션: 온라인 대전
const storeKey = (code) => `lightcone-room-${code}`;

class OnlineSession {
  constructor({ code, token, pid }) {
    this.kind = 'online';
    this.code = code;
    this.token = token;
    this.me = pid;
    this.v = null;
    this.connected = false;
    try { localStorage.setItem(storeKey(code), JSON.stringify({ token, pid })); } catch { /* 저장 불가 환경 */ }
    history.replaceState(null, '', `?room=${code}`);
    this.connect();
  }

  connect() {
    this.es = new EventSource(`api/rooms/${this.code}/events?token=${encodeURIComponent(this.token)}`);
    this.es.addEventListener('view', (e) => { this.v = JSON.parse(e.data); this.connected = true; refresh(); renderConn(); });
    this.es.onopen = () => { this.connected = true; renderConn(); };
    this.es.onerror = () => { this.connected = false; renderConn(); };
  }

  view() { return this.v; }

  async submit(kind, payload) {
    const res = await fetch(`api/rooms/${this.code}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: this.token, kind, payload }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '요청이 거절되었습니다.');
    this.v = json;
    refresh();
  }

  close() { this.es?.close(); }
}

async function apiPost(path) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || '요청이 거절되었습니다.');
  return json;
}

async function openRoom(code) {
  code = code.trim().toUpperCase();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(storeKey(code)) || 'null'); } catch { /* 무시 */ }
  if (saved) {
    const res = await fetch(`api/rooms/${code}/state?token=${encodeURIComponent(saved.token)}`);
    if (res.ok) { startSession(new OnlineSession({ code, ...saved })); return; }
  }
  startSession(new OnlineSession(await apiPost(`api/rooms/${code}/join`)));
}

// ---------------------------------------------------------------- 화면 상태
function freshUi(v) {
  return {
    moves: v.fleets.map(() => STAY),
    sel: v.fleets[0]?.id ?? 1,
    attacks: new Set(),
    blocks: new Set(v.blockades.map((o) => o.idx)),
    orders: Object.fromEntries(v.fleets.map((f) => [f.id, f.canOccupy && v.holds[f.real] !== v.me ? 'occupy' : 'none'])),
    overShown: false,
  };
}

function refresh() {
  if (!session) return;
  view = session.view();
  if (!view) { renderConn(); return; }
  const key = `${view.round}-${view.phase}-${view.winner ?? ''}`;
  if (key !== uiKey) {
    const shown = Boolean(ui?.overShown) && view.phase === 'over';
    uiKey = key;
    ui = freshUi(view);
    ui.overShown = shown;
  }
  render();
  if (view.phase === 'over' && !ui.overShown) { ui.overShown = true; showOver(); }
}

function startSession(s) {
  session?.close();
  session = s;
  uiKey = '';
  view = null;
  $('lobby').hidden = true;
  $('game').hidden = false;
  document.querySelector('.status').hidden = false;
  $('cheatWrap').hidden = s.kind !== 'bot';
  $('cheat').checked = false;
  $('oppLegend').textContent = s.kind === 'bot' ? '봇' : '상대';
  $('modeTag').textContent = s.kind === 'bot' ? '봇과 대전' : `온라인 방 ${s.code}`;
  refresh();
  renderConn();
}

function leave() {
  session?.close();
  session = null;
  view = null;
  history.replaceState(null, '', location.pathname);
  $('game').hidden = true;
  $('lobby').hidden = false;
  document.querySelector('.status').hidden = true;
  $('connBar').hidden = true;
  $('roundPill').textContent = '—';
  $('modeTag').textContent = '상대는 언제나 당신의 과거를 본다';
}

const oppName = () => (session?.kind === 'bot' ? '봇' : '상대');
const oppId = () => (view.me === 'A' ? 'B' : 'A');

// ---------------------------------------------------------------- 보드 좌표
// 좁은 화면(세로): 지도를 세로로 세우고 내 모항성을 아래에 둔다. 넓은 화면: 내 모항성을 왼쪽에 둔다.
function layout() {
  if (narrow.matches) return { box: '0 0 640 860', node: 34, home: 42, ring: 50, tok: 16 };
  return { box: '-60 10 1320 650', node: 34, home: 46, ring: 54, tok: 15 };
}

function coord(s) {
  const flip = view.me === 'B';
  const [x, y] = POS[s];
  if (narrow.matches) {
    const row = flip ? x : 6 - x;
    const col = flip ? 4 - y : y;
    return [90 + (col - 0.5) * 153, 70 + row * 120];
  }
  const xv = flip ? 6 - x : x;
  const yv = flip ? 4 - y : y;
  return [30 + xv * 190, 30 + yv * 160];
}

function el(name, attrs = {}, parent) {
  const n = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

function renderBoard() {
  const L = layout();
  const svg = $('board');
  svg.setAttribute('viewBox', L.box);
  svg.replaceChildren();
  const drawn = new Set();
  for (const s of SYSTEMS) {
    for (const t of ADJ[s]) {
      const key = [s, t].sort().join('-');
      if (drawn.has(key)) continue;
      drawn.add(key);
      const [x1, y1] = coord(s);
      const [x2, y2] = coord(t);
      el('line', { x1, y1, x2, y2, class: 'edge' }, svg);
    }
  }
  const planning = view.phase === 'plan' && !view.online?.waiting?.me && (!view.online || view.online.oppJoined);
  const selFleet = view.fleets.find((f) => f.id === ui.sel);
  const targets = new Set(planning && selFleet ? selFleet.legal.filter((m) => m !== STAY) : []);
  if (view.phase === 'plan') {
    view.fleets.forEach((f, i) => {
      const m = ui.moves[i];
      if (m === STAY) return;
      const [x1, y1] = coord(f.real);
      const [x2, y2] = coord(m);
      el('line', { x1, y1, x2, y2, class: 'arrow' }, svg);
    });
  }
  const myHome = view.me;
  for (const s of SYSTEMS) {
    const [x, y] = coord(s);
    const g = el('g', { class: 'node' }, svg);
    const isHome = s === 'A' || s === 'B';
    if (PLANETS.includes(s)) g.classList.add('planet');
    if (isHome) g.classList.add(s === myHome ? 'homeMe' : 'homeOpp');
    if (view.phase === 'plan' && ui.moves.includes(s)) g.classList.add('chosen');
    const r = isHome ? L.home : L.node;
    if (targets.has(s)) {
      g.classList.add('target');
      el('circle', { cx: x, cy: y, r: r + 22, class: 'hit' }, g);
      g.addEventListener('click', () => setMove(ui.sel, s));
    }
    const owner = view.holds[s];
    if (owner) el('circle', { cx: x, cy: y, r: r + 9, fill: owner === view.me ? 'rgba(90,169,255,.38)' : 'rgba(255,154,77,.38)' }, g);
    el('circle', { cx: x, cy: y, r, class: 'base' }, g);
    el('text', { x, y: y - (PLANETS.includes(s) || isHome ? 5 : 0), class: 'id' }, g).textContent = s;
    if (PLANETS.includes(s)) {
      el('text', { x, y: y + 19, class: 'sub' }, g).textContent = owner ? (owner === view.me ? '내 점령' : `${oppName()} 점령`) : '행성';
      const neb = view.nebula.includes(s);
      const b = el('g', { class: `badge${neb ? ' neb' : ''}` }, g);
      el('circle', { cx: x + 29, cy: y - 29, r: 14 }, b);
      el('text', { x: x + 29, y: y - 29 }, b).textContent = view.ripple[s];
    } else if (isHome) {
      el('text', { x, y: y + 22, class: 'sub' }, g).textContent = s === myHome ? '내 모항성' : `${oppName()} 모항성`;
    }
  }
  const groups = {};
  const add = (s, cls, label, fid) => (groups[s] ??= []).push({ cls, label, fid });
  for (const f of view.fleets) { add(f.real, 'real', f.id, f.id); add(f.echo, 'echo', f.id); }
  for (const f of view.opp.fleets) {
    add(f.echo, 'oecho', f.id);
    if (f.real) add(f.real, 'oreal', f.id);
  }
  const names = { real: '내 함대 실체', echo: '내 함대 잔상', oecho: `${oppName()} 함대 잔상`, oreal: `${oppName()} 함대 실체` };
  for (const [s, toks] of Object.entries(groups)) {
    const [cx, cy] = coord(s);
    const n = toks.length;
    toks.forEach((tk, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const rad = s === 'A' || s === 'B' ? L.ring + 10 : L.ring;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;
      const g = el('g', { class: `tok ${tk.cls}` }, svg);
      if (tk.cls === 'real' && planning) {
        if (tk.fid === ui.sel) g.classList.add('sel');
        el('circle', { cx: x, cy: y, r: L.tok + 12, fill: 'transparent' }, g);
        g.addEventListener('click', () => { ui.sel = tk.fid; render(); });
      }
      el('circle', { cx: x, cy: y, r: L.tok }, g);
      el('text', { x, y }, g).textContent = tk.label;
      el('title', {}, g).textContent = `${names[tk.cls]} ${tk.label}`;
    });
  }
}

function setMove(fid, m) {
  ui.moves[view.fleets.findIndex((f) => f.id === fid)] = m;
  const next = view.fleets.find((f, i) => f.id !== fid && ui.moves[i] === STAY);
  if (next) ui.sel = next.id;
  render();
}

// ---------------------------------------------------------------- 패널
const cardLabel = (c) => (c === STAY ? '머무름' : c);

function renderConveyors() {
  $('conveyors').innerHTML = view.fleets.map((f) => `
    <div class="conv">
      <div class="fl">함대 ${f.id}<small>전력 ${STRENGTH[f.id]}</small></div>
      <div class="slotc ${f.front === STAY ? 'stay' : ''}">${cardLabel(f.front)}<small>앞 칸 · 실체 ${f.real}</small></div>
      <div class="slotc ${f.back === STAY ? 'stay' : ''}">${cardLabel(f.back)}<small>뒤 칸 · 잔상 ${f.echo}</small></div>
    </div>`).join('');
}

function renderRipple() {
  const cells = (fn) => [5, 4, 3, 2, 1].map((k) => `<div class="rs"><span class="n">${k}번</span>${fn(k)}</div>`).join('');
  $('rippleMe').innerHTML = '<div class="who me">나</div>' + cells((k) => view.slots[k]
    .map((c) => (c.kind === 'planet' ? `<span class="c">${c.planet}</span>` : '<span class="c d">위장</span>')).join(''));
  $('rippleOpp').innerHTML = `<div class="who opp">${oppName()}</div>` + cells((k) => '<span class="c h">■</span>'.repeat(view.opp.slotCounts[k]));
}

function logText(e) {
  const me = view.me;
  const who = (pid) => (pid === me ? '<span class="a">나</span>' : `<span class="b">${oppName()}</span>`);
  switch (e.type) {
    case 'reveal': return e.pid === me ? null : `${who(e.pid)} 함대 ${e.fid} 잔상 → ${e.echo}${e.card === STAY ? ' (머무름)' : ''}`;
    case 'strike': return `${who(e.pid)} 함대 ${e.fid} 공격 @${e.system}`;
    case 'miss': return `빗나감 — 성계 ${e.system}에 ${e.pid === me ? oppName() : '내'} 실체 없음`;
    case 'engagement': {
      const res = e.losers.length === 0 ? '쌍방 공격 동률, 귀환 없음' : `${e.losers.map((l) => (l === me ? '나' : oppName())).join('·')} 패배·귀환`;
      return `교전 @${e.system}: 나 [${e.fleets[me].join(',')}] ${e.sum[me]} 대 ${oppName()} [${e.fleets[oppId()].join(',')}] ${e.sum[oppId()]} → ${res}`;
    }
    case 'recall': return `${who(e.pid)} 함대 ${e.fid} 귀환 (컨베이어 ${e.cards.map(cardLabel).join(', ')})`;
    case 'arrival': return `${who(e.pid)} 파문 도달: ${e.card.kind === 'planet' ? `행성 ${e.card.planet} (${e.card.round}R 점령)` : '위장'}`;
    case 'blockade': return `${who(e.pid)}가 행성 ${e.planet} 도달을 <span class="g">봉쇄</span>`;
    case 'hold': return `${who(e.pid)} 행성 ${e.planet} <span class="g">확정 점령</span>${e.prev && e.prev !== e.pid ? ' (덮어씀)' : ''}`;
    case 'neutral': return `행성 ${e.planet} 동시 도달 → 중립`;
    case 'place':
      if (e.pid === me) return e.secret.kind === 'planet' ? `내 행성 ${e.secret.planet} 카드 → ${e.slot}번 칸` : `내 위장 카드 → ${e.slot}번 칸`;
      return `${who(e.pid)}가 파문 ${e.slot}번 칸에 카드를 놓음`;
    case 'lastlight': return '<b>마지막 빛</b> — 파문 1·2·3번 칸 처리';
    case 'gameover': return `<b>게임 종료</b> — 나 ${e.holds[me]} : ${oppName()} ${e.holds[oppId()]}`;
    default: return null;
  }
}

function renderLog() {
  let cur = null;
  const items = [];
  for (const e of view.log) {
    const txt = logText(e);
    if (!txt) continue;
    if (e.round !== cur) { cur = e.round; items.push(`<li class="rh">${cur}라운드</li>`); }
    items.push(`<li>${txt}</li>`);
  }
  $('log').innerHTML = items.reverse().join('');
}

// ---------------------------------------------------------------- 하단 조작 패널
function btn(text, cls, onClick, disabled = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.innerHTML = text;
  if (cls) b.className = cls;
  b.disabled = disabled || busy;
  b.addEventListener('click', onClick);
  return b;
}

function div(cls, ...kids) {
  const d = document.createElement('div');
  d.className = cls;
  d.append(...kids);
  return d;
}

async function send(kind, payload) {
  if (busy || !session) return;
  busy = true;
  render();
  try { await session.submit(kind, payload); } catch (e) { toast(e.message); } finally { busy = false; render(); }
}

function phaseName(p) {
  return { plan: '계획 — 이동', attack: '공격', blockade: '봉쇄', occupy: '점령', over: '게임 종료' }[p] ?? p;
}

function renderDock() {
  const c = $('controls');
  c.replaceChildren();
  const title = $('phaseTitle');
  const hint = $('phaseHint');
  const online = view.online;
  const opp = $('oppState');
  if (online) {
    opp.hidden = false;
    opp.className = `chip ${online.oppConnected ? 'ok' : 'warn'}`;
    opp.textContent = !online.oppJoined ? '상대 대기' : !online.oppConnected ? '상대 연결 끊김' : online.waiting.opp ? '상대 제출 완료' : '상대 생각 중';
  } else opp.hidden = true;

  if (online && !online.oppJoined) {
    title.textContent = '상대를 초대하세요';
    hint.textContent = '코드나 링크를 보내면 다른 네트워크에서도 참가할 수 있습니다.';
    const link = `${location.origin}${location.pathname}?room=${online.code}`;
    const box = div('invite');
    box.innerHTML = `<div class="code">${online.code}</div>`;
    const row = div('row');
    row.style.justifyContent = 'center';
    if (navigator.share) row.append(btn('공유하기', 'primary', () => navigator.share({ title: 'LIGHTCONE 대전', text: `LIGHTCONE 방 코드 ${online.code}`, url: link }).catch(() => {})));
    row.append(btn('링크 복사', '', async () => {
      try { await navigator.clipboard.writeText(link); toast('링크를 복사했습니다'); } catch { toast(link); }
    }));
    box.append(row);
    c.append(box);
    return;
  }
  title.textContent = phaseName(view.phase);
  if (online?.waiting?.me && view.phase !== 'over') {
    hint.textContent = '제출했습니다. 상대도 정하면 동시에 처리됩니다.';
    const w = div('waitBox');
    w.innerHTML = `<span class="spin"></span><span>${online.oppConnected ? '상대가 고르는 중…' : '상대 연결을 기다리는 중…'}</span>`;
    c.append(w);
    return;
  }
  if (view.phase === 'plan') {
    hint.textContent = '함대를 고른 뒤 빛나는 성계를 누르세요. 직전에 떠난 성계로는 갈 수 없습니다(관성).';
    const chips = div('fleetChips');
    view.fleets.forEach((f, i) => {
      const m = ui.moves[i];
      chips.append(btn(`<b>함대 ${f.id}</b><span>${f.real} → ${m === STAY ? '■' : m}</span><small>${m === STAY ? '머무름' : '이동'}</small>`, `fchip ${ui.sel === f.id ? 'on' : ''}`, () => { ui.sel = f.id; render(); }));
    });
    const go = btn('이동 확정', 'primary', () => send('moves', [...ui.moves]));
    go.style.flex = '1';
    c.append(chips, div('row', btn('선택 함대 머무름', '', () => setMove(ui.sel, STAY)), go));
  } else if (view.phase === 'attack') {
    hint.textContent = `공격할 함대를 누르세요. 그 성계에 ${oppName()} 실체가 있으면 교전합니다. 공격한 함대는 이번 라운드에 점령·위장·봉쇄할 수 없고, 빗나가면 위치만 드러납니다.`;
    const chips = div('fleetChips');
    for (const f of view.fleets) {
      const on = ui.attacks.has(f.id);
      chips.append(btn(`<b>함대 ${f.id}</b><span>@${f.real}</span><small>${on ? '공격!' : `전력 ${STRENGTH[f.id]}`}</small>`, `fchip danger ${on ? 'on' : ''}`, () => {
        if (on) ui.attacks.delete(f.id); else ui.attacks.add(f.id);
        render();
      }));
    }
    c.append(chips, btn(ui.attacks.size ? `공격 ${ui.attacks.size}건 확정` : '공격하지 않음', 'primary wide', () => send('attacks', [...ui.attacks])));
  } else if (view.phase === 'blockade') {
    hint.textContent = `${oppName()}의 점령 카드가 내 함대가 있는 행성에 도달했습니다. 봉쇄하면 무효가 되지만 내 함대 위치가 드러납니다.`;
    const chips = div('fleetChips');
    for (const o of view.blockades) {
      const on = ui.blocks.has(o.idx);
      chips.append(btn(`<b>행성 ${o.planet}</b><span>${on ? '봉쇄' : '통과'}</span><small>함대 ${o.fleets.join(',')}</small>`, `fchip ${on ? 'on' : ''}`, () => {
        if (on) ui.blocks.delete(o.idx); else ui.blocks.add(o.idx);
        render();
      }));
    }
    c.append(chips, btn('확정', 'primary wide', () => send('blockades', [...ui.blocks])));
  } else if (view.phase === 'occupy') {
    hint.textContent = `행성에 있는 함대는 점령할 수 있습니다. 위장 카드(남은 ${view.decoys}장)는 ${oppName()}를 속입니다. 나중에 도달한 점령이 덮어씁니다.`;
    for (const f of view.fleets) {
      const elig = view.eligible.includes(f.id);
      const seg = div('seg');
      const opt = (val, label, ok = true) => seg.append(btn(label, ui.orders[f.id] === val ? 'on' : '', () => { ui.orders[f.id] = val; render(); }, !elig || !ok));
      opt('none', '안 함');
      opt('occupy', f.canOccupy ? `점령 ${f.real}→${view.ripple[f.real]}칸` : '점령 불가', f.canOccupy);
      if (view.decoys > 0) for (const k of [3, 4, 5]) opt(`decoy${k}`, `위장${k}`);
      const lbl = document.createElement('div');
      lbl.className = 'lbl';
      lbl.innerHTML = `함대 ${f.id}<small>${!elig ? (f.recalled ? '귀환함' : '공격함') : `@${f.real}`}</small>`;
      c.append(div('occRow', lbl, seg));
    }
    c.append(btn('점령 확정', 'primary wide', () => {
      const orders = [];
      for (const [fid, v] of Object.entries(ui.orders)) {
        if (!view.eligible.includes(Number(fid))) continue;
        if (v === 'occupy') orders.push({ fid: Number(fid), kind: 'occupy' });
        else if (v.startsWith('decoy')) orders.push({ fid: Number(fid), kind: 'decoy', slot: Number(v.slice(5)) });
      }
      send('occupations', orders);
    }));
  } else if (view.phase === 'over') {
    hint.textContent = resultText();
    const again = online?.rematch?.me
      ? btn(online.rematch.opp ? '시작 중…' : '상대의 수락을 기다리는 중…', 'wide', () => {}, true)
      : btn(online?.rematch?.opp ? '상대가 다시 하자고 합니다 — 수락' : '다시 하기', 'primary wide', () => send('rematch'));
    c.append(again, btn('결과와 실제 경로 보기', 'wide', showOver));
  }
}

function resultText() {
  const how = view.lastLight ? '마지막 빛까지 간 끝에' : '즉시 승리 조건으로';
  const res = view.winner === 'draw' ? '무승부' : view.winner === view.me ? '승리' : '패배';
  return `${res} — ${how} 확정 점령 ${view.holdCount[view.me]} : ${view.holdCount[oppId()]}`;
}

function showOver() {
  $('overTitle').textContent = view.winner === 'draw' ? '무승부' : view.winner === view.me ? '승리!' : '패배';
  $('overText').textContent = `${resultText()}. 아래는 두 함대의 실제 경로입니다.`;
  const rows = view.history.map((h) => `<tr><td>${h.round}</td><td class="a">${h[view.me].join(' · ')}</td><td class="b">${h[oppId()].join(' · ')}</td></tr>`).join('');
  $('overReplay').innerHTML = `<table><tr><th>R</th><th>내 함대 1·2·3</th><th>${oppName()} 함대 1·2·3</th></tr>${rows}</table>`;
  if (!$('over').open) $('over').showModal();
}

function renderConn() {
  const bar = $('connBar');
  if (session?.kind !== 'online') { bar.hidden = true; return; }
  bar.hidden = session.connected;
  bar.textContent = '서버와 다시 연결하는 중…';
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

function render() {
  if (!view) return;
  $('roundPill').textContent = view.phase === 'over' ? '종료' : `${view.round} / ${ROUNDS}`;
  $('scoreMe').textContent = view.holdCount[view.me];
  $('scoreOpp').textContent = view.holdCount[oppId()];
  renderBoard();
  renderConveyors();
  renderRipple();
  renderDock();
  renderLog();
}

// ---------------------------------------------------------------- 이벤트
$('botBtn').addEventListener('click', () => startSession(new BotSession()));
$('createBtn').addEventListener('click', async () => {
  try { startSession(new OnlineSession(await apiPost('api/rooms'))); } catch (e) { $('lobbyErr').textContent = e.message; }
});
$('joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('joinCode').value.trim();
  if (code.length !== 5) { $('lobbyErr').textContent = '방 코드 5자리를 입력하세요.'; return; }
  try { await openRoom(code); } catch (err) { $('lobbyErr').textContent = err.message; }
});
$('helpBtn').addEventListener('click', () => $('help').showModal());
$('lobbyHelp').addEventListener('click', () => $('help').showModal());
$('menuBtn').addEventListener('click', () => {
  if (!session) return;
  if (session.kind === 'online' && view?.phase !== 'over' && !confirm('방에서 나갈까요? 같은 기기에서 링크로 다시 들어올 수 있습니다.')) return;
  leave();
});
$('cheat').addEventListener('change', (e) => { if (session?.kind === 'bot') { session.cheat = e.target.checked; refresh(); } });
$('overClose').addEventListener('click', () => $('over').close());
$('overAgain').addEventListener('click', () => { $('over').close(); send('rematch'); });
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === t.dataset.tab));
}));
narrow.addEventListener('change', () => { if (view) render(); });

const params = new URLSearchParams(location.search);
if (params.get('play') === 'bot') startSession(new BotSession());
if (params.get('room')) {
  openRoom(params.get('room')).catch((e) => { $('lobbyErr').textContent = e.message; history.replaceState(null, '', location.pathname); });
}

// ---------------------------------------------------------------- 자가 점검(?selftest): 봇 모드를 화면 경로로 여러 판 완주
if (params.has('selftest')) {
  (async () => {
    try {
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      for (let n = 0; n < 15; n++) {
        startSession(new BotSession());
        let guard = 0;
        while (view.phase !== 'over') {
          if (++guard > 200) throw new Error('끝나지 않음');
          if (view.phase === 'plan') await session.submit('moves', view.fleets.map((f) => pick(f.legal)));
          else if (view.phase === 'attack') await session.submit('attacks', view.fleets.filter(() => Math.random() < 0.3).map((f) => f.id));
          else if (view.phase === 'blockade') await session.submit('blockades', view.blockades.map((o) => o.idx));
          else if (view.phase === 'occupy') {
            const used = new Set();
            const orders = [];
            for (const f of view.fleets) if (f.canOccupy && !used.has(f.real)) { used.add(f.real); orders.push({ fid: f.id, kind: 'occupy' }); }
            await session.submit('occupations', orders);
          }
        }
        if ($('over').open) $('over').close();
      }
      document.title = 'SELFTEST OK';
    } catch (e) {
      document.title = `SELFTEST FAIL: ${e.message}`;
    }
  })();
}
