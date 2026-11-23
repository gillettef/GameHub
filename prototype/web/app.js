// CREASE 웹 프로토타입 (핫시트 + 봇). 규칙은 engine.js, 수치는 rules-config.js
import {
  COLS, ROWS, COL_NAMES, cellName, key, unkey, physPos, isCoveredCol, isFlippedCol,
  newGame, startTurn, legalSteps, legalFolds, doStep, doFold, finishTurn, winners,
} from './engine.js';
import { chooseTurn } from './bot.js';
import { RULES } from './rules-config.js';

const CS = 64; const OX = 24; const OY = 34;
const COLORS = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)'];
const NAMES = ['빨강', '파랑', '초록', '노랑'];
const CREASE_NAMES = { L: ['왼쪽 1선', '왼쪽 2선', '왼쪽 3선'], R: ['오른쪽 1선', '오른쪽 2선', '오른쪽 3선'] };
const SVGNS = 'http://www.w3.org/2000/svg';
const app = document.getElementById('app');

let state = null; let seats = []; let busy = false; const logLines = [];

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// ------------------------------------------------------------ 시작 화면
function setupScreen() {
  app.innerHTML = `
  <div class="panel setup">
    <h3>새 게임</h3>
    <label>인원 <select id="n"><option>2</option><option>3</option><option>4</option></select></label>
    <div id="seats"></div>
    <label>시드(같은 값이면 같은 별똥별 순서) <input id="seed" type="number" value="${Math.floor(Math.random() * 9999)}" style="width:90px"></label>
    <div class="btns"><button class="primary" id="go">시작</button><button id="rules">룰북 열기</button></div>
    <p class="legend">보드 끝을 접으면 멀리 있던 칸이 바로 옆으로 옵니다. 날개에 깔린 칸의 말과 조각은 누운 채(부재) 날개 위에 표시됩니다.</p>
  </div>`;
  const seatsDiv = app.querySelector('#seats');
  const drawSeats = () => {
    const n = Number(app.querySelector('#n').value);
    seatsDiv.innerHTML = Array.from({ length: n }, (_, i) => `
      <label><span style="color:${COLORS[i]}">● ${i + 1}번째 · ${NAMES[i]}</span>
      <select data-seat="${i}"><option value="human">사람</option><option value="bot"${i > 0 ? ' selected' : ''}>봇</option></select></label>`).join('');
  };
  app.querySelector('#n').onchange = drawSeats;
  drawSeats();
  app.querySelector('#rules').onclick = () => window.open('https://github.com/gillettef/Crease/blob/dev/rules/rulebook.md', '_blank');
  app.querySelector('#go').onclick = () => {
    const n = Number(app.querySelector('#n').value);
    seats = [...seatsDiv.querySelectorAll('select')].map((s) => s.value);
    state = newGame(n, Number(app.querySelector('#seed').value) || 1, RULES);
    logLines.length = 0;
    log(`게임 시작 · ${n}인 · 목표 ${RULES.target[n]}점`);
    gameScreen();
    beginTurn();
  };
}

// ------------------------------------------------------------ 게임 화면
let svg; let colGroups = []; let pieceEls = []; let shardLayer; let ghostLayer; let seamLayer;

function gameScreen() {
  app.innerHTML = `
  <main>
    <div class="panel"><svg id="board" viewBox="0 0 ${OX * 2 + CS * COLS} ${OY + CS * ROWS + 20}"></svg>
      <p class="legend">초록 칸을 눌러 한 걸음 이동 · 금색 선 = 이음(새로 이웃한 곳) · 푸른 칸 = 날개 뒷면 · 누운 말/회색 조각 = 부재</p></div>
    <aside class="panel">
      <div id="status"></div>
      <div class="players" id="players"></div>
      <h3>접기 · 펼치기 (차례에 1번)</h3>
      <div class="btns" id="folds"></div>
      <div class="btns"><button class="primary" id="end">차례 끝내기</button><button id="new">새 게임</button></div>
      <h3>기록</h3><div id="log"></div>
    </aside>
  </main>`;
  svg = app.querySelector('#board');
  ghostLayer = el('g', {}, svg);
  colGroups = [];
  for (let c = 0; c < COLS; c++) {
    const g = el('g', { class: 'col' }, svg);
    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      const rect = el('rect', { x: 0, y: OY + r * CS, width: CS, height: CS, class: 'cell front' }, g);
      rect.addEventListener('click', () => onCellClick(c, r));
      const t = el('text', { x: 5, y: OY + r * CS + 13, class: 'coord' }, g);
      t.textContent = cellName(c, r);
      cells.push(rect);
    }
    colGroups.push({ g, cells });
  }
  seamLayer = el('g', {}, svg);
  shardLayer = el('g', {}, svg);
  pieceEls = state.players.map((p, i) => {
    const g = el('g', { class: 'piece' }, svg);
    el('ellipse', { cx: 0, cy: 0, rx: 13, ry: 13, fill: COLORS[i], stroke: '#2b2a28', 'stroke-width': 2 }, g);
    const t = el('text', { x: 0, y: 5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: '#fff' }, g);
    t.textContent = String(i + 1);
    return g;
  });
  app.querySelector('#end').onclick = () => { if (!busy && seats[state.current] === 'human') endTurn(); };
  app.querySelector('#new').onclick = () => { busy = false; setupScreen(); };
}

function cellXY(pos, r) { return [OX + pos * CS, OY + r * CS]; }

function render() {
  const fold = state.fold;
  const human = seats[state.current] === 'human' && !state.over && !busy;
  const steps = human ? legalSteps(state) : [];
  const stepSet = new Set(steps.map(([c, r]) => key(c, r)));

  // 빈 탁자 자리(날개가 떠난 자리)
  ghostLayer.innerHTML = '';
  for (let p = 0; p < COLS; p++) {
    let shown = false;
    for (let c = 0; c < COLS; c++) if (physPos(fold, c) === p) shown = true;
    if (!shown && ![...Array(COLS).keys()].some((c) => isCoveredCol(fold, c) && c === p)) {
      el('rect', { x: OX + p * CS + 3, y: OY + 3, width: CS - 6, height: ROWS * CS - 6, rx: 6, class: 'ghost' }, ghostLayer);
    }
  }
  // 열 위치
  for (let c = 0; c < COLS; c++) {
    const { g, cells } = colGroups[c];
    const covered = isCoveredCol(fold, c);
    const pos = covered ? c : physPos(fold, c);
    g.style.transform = `translate(${OX + pos * CS}px, 0px)`;
    g.style.opacity = covered ? 0 : 1;
    g.style.pointerEvents = covered ? 'none' : 'auto';
    const back = isFlippedCol(fold, c);
    cells.forEach((rect, r) => {
      rect.setAttribute('class', `cell ${back ? 'back' : 'front'}${stepSet.has(key(c, r)) ? ' legal' : ''}`);
    });
  }
  // 이음과 경첩
  seamLayer.innerHTML = '';
  const seamAt = (x) => el('line', { x1: OX + x * CS, y1: OY + 2, x2: OX + x * CS, y2: OY + ROWS * CS - 2, class: 'seam' }, seamLayer);
  if (fold.L > 0) seamAt(2 * fold.L);
  if (fold.R > 0) seamAt(COLS - 2 * fold.R);
  // 닻 칸 표시
  state.players.forEach((p, i) => {
    const [ac, ar] = unkey(p.anchor);
    const [x, y] = cellXY(physPos(fold, ac), ar);
    el('rect', { x: x + 4, y: y + 4, width: CS - 8, height: CS - 8, rx: 8, fill: 'none', stroke: COLORS[i], 'stroke-width': 3 }, seamLayer);
  });
  // 별빛 조각
  shardLayer.innerHTML = '';
  for (const [k, n] of state.shards) {
    const [c, r] = unkey(k);
    const covered = isCoveredCol(fold, c);
    const pos = covered ? c : physPos(fold, c);
    for (let i = 0; i < n; i++) {
      const [x, y] = cellXY(pos, r);
      const cx = x + CS - 14 - i * 6; const cy = y + CS - 14;
      if (covered) el('circle', { cx, cy, r: 8, fill: '#9a9a9a', stroke: '#555' }, shardLayer);
      else {
        const t = el('text', { x: cx, y: cy + 7, 'text-anchor': 'middle', 'font-size': 22, fill: 'var(--gold)', stroke: '#6b4f00', 'stroke-width': .8 }, shardLayer);
        t.textContent = '★';
      }
    }
  }
  // 길잡이
  const occ = {};
  state.players.forEach((p, i) => {
    const covered = isCoveredCol(fold, p.c);
    const pos = covered ? p.c : physPos(fold, p.c);
    const slot = (occ[`${pos},${p.r}`] = (occ[`${pos},${p.r}`] || 0) + 1) - 1;
    const [x, y] = cellXY(pos, p.r);
    const px = x + 22 + (slot % 2) * 20; const py = y + 30 + Math.floor(slot / 2) * 18;
    const g = pieceEls[i];
    g.style.transform = `translate(${px}px, ${py}px) ${covered ? 'rotate(90deg) scale(1, .55)' : ''}`;
    g.style.opacity = covered ? 0.75 : 1;
  });
  renderSide();
}

function renderSide() {
  const cur = state.players[state.current];
  const status = app.querySelector('#status');
  if (state.over) {
    const w = winners(state);
    status.innerHTML = `<b>게임 끝!</b> 승자: ${w.map((i) => `<span style="color:${COLORS[i]}">${NAMES[i]}</span>`).join(', ')}`;
  } else {
    const absent = isCoveredCol(state.fold, cur.c);
    status.innerHTML = `<b style="color:${COLORS[cur.id]}">${NAMES[cur.id]}</b> 차례 (${state.round}라운드) · ${seats[cur.id] === 'bot' ? '봇 생각 중…' : `남은 걸음 ${state.config.moveSteps - state.turnSteps} · 접기 ${state.turnFolded ? '사용함' : '가능'}`}${absent ? '<br><b>부재 중</b>: 펼쳐야 움직일 수 있어요' : ''}`;
  }
  app.querySelector('#players').innerHTML = state.players.map((p, i) => `
    <div class="p ${i === state.current && !state.over ? 'active' : ''}"><span class="dot" style="background:${COLORS[i]}"></span>
    <span>${NAMES[i]} (${seats[i] === 'bot' ? '봇' : '사람'}) · 닻 ${cellName(...unkey(p.anchor))}</span>
    <span>${p.score}점 · 든 조각 ${p.carried}/${state.config.carryLimit}</span></div>`).join('') +
    `<div class="legend">목표 ${state.config.target[state.n]}점 · 별똥별 카드 ${state.deck.length}장 남음</div>`;
  const human = seats[state.current] === 'human' && !state.over && !busy;
  const legal = human ? legalFolds(state) : [];
  const btn = (a, label) => {
    const ok = legal.some((b) => b.type === a.type && b.side === a.side && b.width === a.width);
    return `<button ${ok ? '' : 'disabled'} data-a='${JSON.stringify(a)}'>${label}</button>`;
  };
  const html = [];
  for (const side of ['L', 'R']) for (let w = 1; w <= 3; w++) html.push(btn({ type: 'fold', side, width: w }, `${CREASE_NAMES[side][w - 1]} 접기`));
  html.push(btn({ type: 'unfold', side: 'L' }, '왼쪽 펼치기'), btn({ type: 'unfold', side: 'R' }, '오른쪽 펼치기'));
  const folds = app.querySelector('#folds');
  folds.innerHTML = html.join('');
  folds.querySelectorAll('button').forEach((b) => { b.onclick = () => { act(JSON.parse(b.dataset.a)); }; });
  app.querySelector('#end').disabled = !human;
  app.querySelector('#log').innerHTML = logLines.slice(-60).reverse().join('<br>');
}

function log(msg) { logLines.push(msg); }

function describe(a) {
  if (a.type === 'step') return `→ ${cellName(...a.to)}`;
  if (a.type === 'fold') return `${CREASE_NAMES[a.side][a.width - 1]} 접기`;
  return `${a.side === 'L' ? '왼쪽' : '오른쪽'} 펼치기`;
}

function act(a) {
  const p = state.players[state.current];
  const before = { score: p.score, carried: p.carried };
  try {
    if (a.type === 'step') doStep(state, a.to); else doFold(state, a);
  } catch (e) { log(`⚠ ${e.message}`); render(); return; }
  let msg = `${NAMES[p.id]}: ${describe(a)}`;
  if (p.score > before.score) msg += ` · <b>${p.score - before.score}점 득점</b>`;
  else if (p.carried > before.carried) msg += ' · 조각 줍기';
  log(msg);
  render();
}

function onCellClick(c, r) {
  if (busy || state.over || seats[state.current] !== 'human') return;
  if (!legalSteps(state).some(([a, b]) => a === c && b === r)) return;
  act({ type: 'step', to: [c, r] });
}

function beginTurn() {
  if (state.over) { render(); return; }
  startTurn(state);
  render();
  if (seats[state.current] === 'bot') runBot();
}

async function runBot() {
  busy = true;
  render();
  await sleep(500);
  const acts = chooseTurn(state, 'balanced');
  for (const a of acts) {
    busy = false; act(a); busy = true; render();
    await sleep(a.type === 'step' ? 380 : 700);
  }
  busy = false;
  endTurn();
}

function endTurn() {
  const p = state.players[state.current];
  const spawned = finishTurn(state);
  if (spawned != null) {
    const [c, r] = unkey(spawned);
    log(`✦ 별똥별: ${cellName(c, r)}${isCoveredCol(state.fold, c) ? ' (가려진 칸 · 부재)' : ''}`);
  }
  if (state.over) {
    log(`게임 끝 · ${state.players.map((q) => `${NAMES[q.id]} ${q.score}`).join(' / ')}`);
    render();
    return;
  }
  void p;
  beginTurn();
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
void COL_NAMES;
setupScreen();
