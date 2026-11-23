// LIGHTCONE 웹 시뮬레이터 화면. 사람 = 플레이어 A(파랑), 봇 = 플레이어 B(주황).
import { ADJ, SYSTEMS, PLANETS, POS, FLEET_IDS, STRENGTH, ROUNDS, VICTORY } from './src/map.js';
import {
  newGame, submitMoves, submitAttacks, submitBlockades, submitOccupations, legalMoves, realPos,
  fleetOf, blockadeOptions, holdCount, publicView, validateOccupations, eligibleFleets, canOccupy,
  ripple, STAY,
} from './src/engine.js';
import { botMoves, botAttacks, botBlockades, botOccupations } from './src/bot.js';

const ME = 'A';
const BOT = 'B';
const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';

let game;
let ui;

function start() {
  game = newGame({ seed: Math.floor(Math.random() * 2 ** 31) });
  ui = { moves: [STAY, STAY, STAY], selFleet: 1, attacks: new Set(), blocks: new Set(), orders: {}, error: '' };
  render();
}

// ---------------------------------------------------------------- 좌표
const px = (s) => 30 + POS[s][0] * 190;
const py = (s) => 30 + POS[s][1] * 160;

function el(name, attrs = {}, parent) {
  const n = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

// ---------------------------------------------------------------- 보드
function renderBoard() {
  const svg = $('board');
  svg.replaceChildren();
  const drawn = new Set();
  for (const s of SYSTEMS) {
    for (const t of ADJ[s]) {
      const key = [s, t].sort().join('-');
      if (drawn.has(key)) continue;
      drawn.add(key);
      el('line', { x1: px(s), y1: py(s), x2: px(t), y2: py(t), class: 'edge' }, svg);
    }
  }
  const targets = new Set(game.phase === 'plan' && ui.selFleet ? legalMoves(game, ME, ui.selFleet).filter((m) => m !== STAY) : []);
  for (const s of SYSTEMS) {
    const g = el('g', { class: 'node' }, svg);
    if (PLANETS.includes(s)) g.classList.add('planet');
    if (s === 'A') g.classList.add('homeA');
    if (s === 'B') g.classList.add('homeB');
    if (targets.has(s)) {
      g.classList.add('target');
      g.addEventListener('click', () => { ui.moves[ui.selFleet - 1] = s; nextFleet(); render(); });
    }
    const r = s === 'A' || s === 'B' ? 46 : 34;
    const owner = game.holds[s];
    if (owner) el('circle', { cx: px(s), cy: py(s), r: r + 9, class: 'hold', fill: owner === ME ? 'rgba(90,169,255,.35)' : 'rgba(255,154,77,.35)' }, g);
    el('circle', { cx: px(s), cy: py(s), r, class: 'base' }, g);
    const t = el('text', { x: px(s), y: py(s) - (PLANETS.includes(s) ? 4 : 0), class: 'id' }, g);
    t.textContent = s;
    if (PLANETS.includes(s)) {
      const sub = el('text', { x: px(s), y: py(s) + 20, class: 'sub' }, g);
      sub.textContent = owner ? (owner === ME ? '내 점령' : '봇 점령') : '행성';
      const neb = game.nebula.includes(s);
      const b = el('g', { class: `badge${neb ? ' neb' : ''}` }, g);
      el('circle', { cx: px(s) + 30, cy: py(s) - 30, r: 14 }, b);
      const bt = el('text', { x: px(s) + 30, y: py(s) - 30 }, b);
      bt.textContent = ripple(game, s);
      if (neb) {
        const nt = el('text', { x: px(s), y: py(s) - 50, class: 'sub' }, g);
        nt.textContent = '성운 +1';
        nt.setAttribute('fill', '#a98bff');
      }
    } else if (s === 'A' || s === 'B') {
      const sub = el('text', { x: px(s), y: py(s) + 24, class: 'sub' }, g);
      sub.textContent = s === 'A' ? '내 모항성' : '봇 모항성';
    }
  }
  // 말
  const groups = {};
  const add = (s, cls, label, fid) => (groups[s] ??= []).push({ cls, label, fid });
  for (const f of game.players[ME].fleets) {
    add(realPos(f), 'real', f.id, f.id);
    add(f.echo, 'echo', f.id);
  }
  for (const f of game.players[BOT].fleets) add(f.echo, 'oecho', f.id);
  if ($('cheat').checked || game.phase === 'over') for (const f of game.players[BOT].fleets) add(realPos(f), 'oreal', f.id);
  for (const [s, toks] of Object.entries(groups)) {
    const n = toks.length;
    toks.forEach((tk, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1) + (n > 6 ? 0.2 : 0);
      const rad = s === 'A' || s === 'B' ? 62 : 52;
      const x = px(s) + Math.cos(ang) * rad;
      const y = py(s) + Math.sin(ang) * rad;
      const g = el('g', { class: `tok ${tk.cls}` }, svg);
      if (tk.cls === 'real' && game.phase === 'plan' && tk.fid === ui.selFleet) g.classList.add('sel');
      if (tk.cls === 'real' && game.phase === 'plan') {
        g.style.cursor = 'pointer';
        g.addEventListener('click', () => { ui.selFleet = tk.fid; render(); });
      }
      el('circle', { cx: x, cy: y, r: 14 }, g);
      const t = el('text', { x, y }, g);
      t.textContent = tk.label;
      const title = el('title', {}, g);
      title.textContent = { real: `내 함대 ${tk.label} 실체`, echo: `내 함대 ${tk.label} 잔상`, oecho: `봇 함대 ${tk.label} 잔상`, oreal: `봇 함대 ${tk.label} 실체` }[tk.cls];
    });
  }
}

function nextFleet() {
  const i = FLEET_IDS.indexOf(ui.selFleet);
  ui.selFleet = FLEET_IDS[(i + 1) % FLEET_IDS.length];
}

// ---------------------------------------------------------------- 패널
function cardLabel(c) { return c === STAY ? '머무름' : c; }

function renderConveyors() {
  const box = $('conveyors');
  box.replaceChildren();
  for (const f of game.players[ME].fleets) {
    const row = document.createElement('div');
    row.className = 'conv';
    row.innerHTML = `<div class="fl">함대 ${f.id}<br><small>전력 ${STRENGTH[f.id]}</small></div>
      <div class="slotc ${f.front === STAY ? 'stay' : ''}">${cardLabel(f.front)}<small>앞 칸 · 실체 ${realPos(f)}</small></div>
      <div class="slotc ${f.back === STAY ? 'stay' : ''}">${cardLabel(f.back)}<small>뒤 칸 → 다음에 공개</small></div>`;
    box.appendChild(row);
  }
}

function renderRipple() {
  const me = $('rippleMe');
  const bot = $('rippleBot');
  me.innerHTML = '<div class="who me">나</div>';
  bot.innerHTML = '<div class="who bot">봇</div>';
  for (let k = 5; k >= 1; k--) {
    const a = document.createElement('div');
    a.className = 'rs';
    a.innerHTML = `<span class="n">${k}번</span>` + game.players[ME].slots[k]
      .map((c) => (c.kind === 'planet' ? `<span class="c">${c.planet}</span>` : '<span class="c d">위장</span>')).join('');
    me.appendChild(a);
    const b = document.createElement('div');
    b.className = 'rs';
    b.innerHTML = `<span class="n">${k}번</span>` + '<span class="c h">■</span>'.repeat(game.players[BOT].slots[k].length);
    bot.appendChild(b);
  }
}

const who = (pid) => (pid === ME ? '<span class="a">나</span>' : '<span class="b">봇</span>');

function logText(e) {
  switch (e.type) {
    case 'reveal':
      return e.pid === ME ? null : `${who(e.pid)}의 함대 ${e.fid} 잔상 → ${e.echo}${e.card === STAY ? ' (머무름)' : ''}`;
    case 'strike': return `${who(e.pid)} 함대 ${e.fid}가 성계 ${e.system}에서 공격 선언`;
    case 'miss': return `빗나감 — 성계 ${e.system}에 ${e.pid === ME ? '봇' : '내'} 실체 없음`;
    case 'engagement': {
      const res = e.losers.length === 0 ? '쌍방 공격 동률, 아무도 귀환하지 않음' : `${e.losers.map((l) => (l === ME ? '나' : '봇')).join('·')} 패배`;
      return `교전 @${e.system}: 나 [${e.fleets.A.join(',')}] 전력 ${e.sum.A} 대 봇 [${e.fleets.B.join(',')}] 전력 ${e.sum.B} → ${res}`;
    }
    case 'recall': return `${who(e.pid)} 함대 ${e.fid} 귀환 (컨베이어: ${e.cards.map(cardLabel).join(', ')})`;
    case 'arrival': return `${who(e.pid)}의 파문 도달: ${e.card.kind === 'planet' ? `행성 ${e.card.planet} (${e.card.round}라운드 점령)` : '위장'}`;
    case 'blockade': return `${who(e.pid)}가 행성 ${e.planet} 도달을 <span class="g">봉쇄</span>`;
    case 'hold': return `${who(e.pid)} 행성 ${e.planet} <span class="g">확정 점령</span>${e.prev && e.prev !== e.pid ? ' (덮어씀)' : ''}`;
    case 'neutral': return `행성 ${e.planet} 동시 도달 → 중립`;
    case 'place':
      if (e.pid === ME) return e.secret.kind === 'planet' ? `내 행성 ${e.secret.planet} 카드 → ${e.slot}번 칸` : `내 위장 카드 → ${e.slot}번 칸`;
      return `봇이 파문 컨베이어 ${e.slot}번 칸에 카드를 놓음`;
    case 'lastlight': return '<b>마지막 빛</b> — 파문 컨베이어 1·2·3번 칸을 처리한다';
    case 'gameover': return `<b>게임 종료</b> — 나 ${e.holds.A} : 봇 ${e.holds.B}`;
    default: return null;
  }
}

function renderLog() {
  const ol = $('log');
  ol.replaceChildren();
  const entries = publicView(game, ME).log;
  let cur = null;
  const items = [];
  for (const e of entries) {
    const txt = logText(e);
    if (!txt) continue;
    if (e.round !== cur) { cur = e.round; items.push(`<li class="rh">${cur}라운드</li>`); }
    items.push(`<li>${txt}</li>`);
  }
  ol.innerHTML = items.reverse().join('');
}

// ---------------------------------------------------------------- 단계별 조작
function button(text, cls, onClick, disabled = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  if (cls) b.className = cls;
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function row(...children) {
  const d = document.createElement('div');
  d.className = 'row';
  d.append(...children);
  return d;
}

function span(text, cls) {
  const s = document.createElement('span');
  if (cls) s.className = cls;
  s.innerHTML = text;
  return s;
}

function renderControls() {
  const c = $('controls');
  c.replaceChildren();
  const title = $('phaseTitle');
  const hint = $('phaseHint');
  if (game.phase === 'plan') {
    title.textContent = '계획 단계';
    hint.textContent = '함대를 고르고 빛나는 이웃 성계를 누르세요. 컨베이어에 있는 성계(직전에 떠난 곳)로는 갈 수 없습니다(관성).';
    for (const fid of FLEET_IDS) {
      const f = fleetOf(game, ME, fid);
      const m = ui.moves[fid - 1];
      c.append(row(
        span(`함대 ${fid}`, `lbl f${fid}`),
        span(`${realPos(f)} → <b>${m === STAY ? '머무름' : m}</b>`),
        button('선택', ui.selFleet === fid ? 'sel' : '', () => { ui.selFleet = fid; render(); }),
        button('머무름', '', () => { ui.moves[fid - 1] = STAY; nextFleet(); render(); }),
      ));
    }
    c.append(button('이동 확정', 'primary', doMoves));
  } else if (game.phase === 'attack') {
    title.textContent = '공격 처리';
    hint.textContent = '공격할 함대를 고르세요. 그 함대가 있는 성계에 봇 실체가 있으면 교전합니다. 공격한 함대는 이번 라운드에 점령·위장·봉쇄할 수 없습니다. 빗나가면 내 위치만 드러납니다.';
    for (const f of game.players[ME].fleets) {
      const l = document.createElement('label');
      l.className = 'chk';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = ui.attacks.has(f.id);
      cb.addEventListener('change', () => { cb.checked ? ui.attacks.add(f.id) : ui.attacks.delete(f.id); });
      l.append(cb, span(`함대 ${f.id} (전력 ${STRENGTH[f.id]}) — 성계 <b>${realPos(f)}</b>에서 공격`));
      c.append(l);
    }
    c.append(button('공격 확정', 'primary', doAttacks));
  } else if (game.phase === 'blockade') {
    title.textContent = '봉쇄';
    hint.textContent = '봇의 점령 카드가 내 함대가 있는 행성에 도달했습니다. 봉쇄하면 그 점령은 무효지만 내 함대 위치가 드러납니다.';
    for (const o of blockadeOptions(game).filter((x) => x.blocker === ME)) {
      const l = document.createElement('label');
      l.className = 'chk';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      ui.blocks.add(o.idx);
      cb.addEventListener('change', () => { cb.checked ? ui.blocks.add(o.idx) : ui.blocks.delete(o.idx); });
      l.append(cb, span(`행성 <b>${o.planet}</b> 봉쇄 (함대 ${o.fleets.join(',')})`));
      c.append(l);
    }
    c.append(button('봉쇄 확정', 'primary', doBlockades));
  } else if (game.phase === 'occupy') {
    title.textContent = '점령 처리';
    hint.innerHTML = `행성에 있는 함대는 점령할 수 있습니다. 위장 카드(남은 ${game.players[ME].decoys}장)는 3·4·5번 칸에 놓아 봇을 속입니다. 나중에 도달한 점령이 덮어씁니다.`;
    const elig = new Set(eligibleFleets(game, ME));
    for (const f of game.players[ME].fleets) {
      const s = realPos(f);
      const sel = document.createElement('select');
      const opts = [['none', '하지 않음']];
      if (canOccupy(game, ME, f.id)) opts.push(['occupy', `행성 ${s} 점령 → ${ripple(game, s)}번 칸`]);
      if (game.players[ME].decoys > 0) for (const k of [3, 4, 5]) opts.push([`decoy${k}`, `위장 → ${k}번 칸`]);
      for (const [v, t] of opts) {
        const o = document.createElement('option');
        o.value = v; o.textContent = t;
        sel.appendChild(o);
      }
      sel.value = ui.orders[f.id] ?? (canOccupy(game, ME, f.id) && game.holds[s] !== ME ? 'occupy' : 'none');
      ui.orders[f.id] = sel.value;
      sel.addEventListener('change', () => { ui.orders[f.id] = sel.value; });
      sel.disabled = !elig.has(f.id);
      const note = !elig.has(f.id) ? span(f.recalled ? '귀환함' : '공격함', 'chip warn') : span(`성계 ${s}`, 'chip');
      c.append(row(span(`함대 ${f.id}`, `lbl f${f.id}`), sel, note));
    }
    if (ui.error) c.append(span(ui.error, 'chip warn'));
    c.append(button('점령 확정', 'primary', doOccupy));
  } else if (game.phase === 'over') {
    title.textContent = '게임 종료';
    hint.textContent = '';
    c.append(button('새 게임', 'primary', start));
  }
}

function botView() { return publicView(game, BOT); }

function doMoves() {
  const b = botMoves(botView());
  submitMoves(game, { A: [...ui.moves], B: b });
  ui.moves = [STAY, STAY, STAY];
  ui.attacks = new Set();
  render();
}

function doAttacks() {
  const b = botAttacks(botView());
  submitAttacks(game, { A: [...ui.attacks], B: b });
  afterRipple();
}

function afterRipple() {
  if (game.phase === 'blockade') {
    const mine = blockadeOptions(game).filter((o) => o.blocker === ME);
    if (!mine.length) {
      submitBlockades(game, { A: [], B: botBlockades(game, blockadeOptions(game).filter((o) => o.blocker === BOT)) });
    } else ui.blocks = new Set();
  }
  ui.orders = {};
  ui.error = '';
  render();
}

function doBlockades() {
  const bot = botBlockades(game, blockadeOptions(game).filter((o) => o.blocker === BOT));
  submitBlockades(game, { A: [...ui.blocks], B: bot });
  ui.orders = {};
  render();
}

function doOccupy() {
  const orders = [];
  for (const [fid, v] of Object.entries(ui.orders)) {
    if (v === 'occupy') orders.push({ fid: Number(fid), kind: 'occupy' });
    else if (v.startsWith('decoy')) orders.push({ fid: Number(fid), kind: 'decoy', slot: Number(v.slice(5)) });
  }
  const err = validateOccupations(game, ME, orders);
  if (err) { ui.error = err; render(); return; }
  const b = botOccupations(botView(), game);
  submitOccupations(game, { A: orders, B: b });
  ui.selFleet = 1;
  render();
  if (game.phase === 'over') showOver();
}

function showOver() {
  const a = holdCount(game, ME);
  const b = holdCount(game, BOT);
  $('overTitle').textContent = game.winner === ME ? '승리!' : game.winner === BOT ? '패배' : '무승부';
  const how = game.lastLight ? '마지막 빛까지 간 끝에' : '즉시 승리 조건으로';
  $('overText').textContent = `${how} 확정 점령 ${a} : ${b}. 아래는 두 함대의 실제 경로입니다.`;
  const rows = game.history.map((h) => `<tr><td>${h.round}</td><td class="a">${h.A.join(' · ')}</td><td class="b">${h.B.join(' · ')}</td></tr>`).join('');
  $('overReplay').innerHTML = `<table style="width:100%;font-size:13px;border-collapse:collapse"><tr><th>R</th><th>내 함대 1·2·3</th><th>봇 함대 1·2·3</th></tr>${rows}</table>`;
  $('over').showModal();
}

function render() {
  $('roundPill').textContent = game.phase === 'over' ? '종료' : `라운드 ${game.round} / ${ROUNDS}`;
  $('scoreA').textContent = holdCount(game, ME);
  $('scoreB').textContent = holdCount(game, BOT);
  renderBoard();
  renderConveyors();
  renderRipple();
  renderControls();
  renderLog();
}

$('newBtn').addEventListener('click', start);
$('helpBtn').addEventListener('click', () => $('help').showModal());
$('cheat').addEventListener('change', render);
$('overNew').addEventListener('click', () => { start(); });
start();

// ---------------------------------------------------------------- 자가 점검(?selftest): 화면 조작 경로로 여러 판을 끝까지 돌린다
if (new URLSearchParams(location.search).has('selftest')) {
  try {
    for (let n = 0; n < 20; n++) {
      start();
      let guard = 0;
      while (game.phase !== 'over') {
        if (++guard > 200) throw new Error('끝나지 않음');
        if (game.phase === 'plan') {
          ui.moves = FLEET_IDS.map((fid) => { const l = legalMoves(game, ME, fid); return l[Math.floor(Math.random() * l.length)]; });
          doMoves();
        } else if (game.phase === 'attack') {
          ui.attacks = new Set(FLEET_IDS.filter(() => Math.random() < 0.3));
          doAttacks();
        } else if (game.phase === 'blockade') {
          doBlockades();
        } else if (game.phase === 'occupy') {
          for (const sel of document.querySelectorAll('#controls select')) void sel;
          doOccupy();
          if (ui.error) { ui.orders = {}; doOccupy(); }
        }
      }
      $('over').close();
    }
    document.title = 'SELFTEST OK';
  } catch (e) {
    document.title = `SELFTEST FAIL: ${e.message}`;
  }
}
