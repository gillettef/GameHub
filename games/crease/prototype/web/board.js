// SVG 접기 보드 렌더러. 열(<g>)과 말은 유지하고 위치만 바꿔 CSS 전환으로 접히는 움직임을 보여 준다.
import { COLS, ROWS, cellName, key, unkey, physPos, isCoveredCol, isFlippedCol } from './engine.js';

export const COLORS = ['#e2525f', '#3d8fd6', '#3cae74', '#e8b020'];
export const NAMES = ['빨강', '파랑', '초록', '노랑'];
const NS = 'http://www.w3.org/2000/svg';
const CS = 44; const OX = 6; const OY = 6;

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

export class Board {
  constructor(svg, { onCell } = {}) {
    this.svg = svg;
    this.onCell = onCell;
    svg.setAttribute('viewBox', `0 0 ${OX * 2 + CS * COLS} ${OY * 2 + CS * ROWS}`);
    svg.innerHTML = '';
    el('rect', { x: 0, y: 0, width: OX * 2 + CS * COLS, height: OY * 2 + CS * ROWS, rx: 10, class: 'table' }, svg);
    this.ghost = el('g', {}, svg);
    this.cols = [];
    for (let c = 0; c < COLS; c++) {
      const g = el('g', { class: 'col' }, svg);
      const cells = [];
      for (let r = 0; r < ROWS; r++) {
        const rect = el('rect', { x: 0.5, y: OY + r * CS + 0.5, width: CS - 1, height: CS - 1, rx: 3, class: 'cell' }, g);
        rect.addEventListener('click', () => this.onCell?.(c, r));
        const t = el('text', { x: 4, y: OY + r * CS + 11, class: 'coord' }, g);
        t.textContent = cellName(c, r);
        cells.push(rect);
      }
      this.cols.push({ g, cells });
    }
    this.marks = el('g', { class: 'marks' }, svg);
    this.shardLayer = el('g', { class: 'shards' }, svg);
    this.pieces = [];
    this.pieceLayer = el('g', {}, svg);
  }

  ensurePieces(n) {
    while (this.pieces.length < n) {
      const i = this.pieces.length;
      const g = el('g', { class: 'piece' }, this.pieceLayer);
      el('circle', { cx: 0, cy: 0, r: 11, fill: COLORS[i], class: 'pawn' }, g);
      const t = el('text', { x: 0, y: 4.2, class: 'pawn-num' }, g);
      t.textContent = String(i + 1);
      this.pieces.push(g);
    }
  }

  /**
   * @param state 엔진 상태(또는 fromView 결과)
   * @param opt { legal: [[c,r]], previewFold, mine: Set(seat), focus: seat }
   */
  render(state, opt = {}) {
    const fold = opt.previewFold || state.fold;
    const legal = new Set((opt.legal || []).map(([c, r]) => key(c, r)));
    this.svg.classList.toggle('previewing', !!opt.previewFold);
    // 날개가 떠난 빈 자리
    this.ghost.innerHTML = '';
    for (let p = 0; p < COLS; p++) {
      let used = false;
      for (let c = 0; c < COLS; c++) if (physPos(fold, c) === p || (isCoveredCol(fold, c) && c === p)) used = true;
      if (!used) el('rect', { x: OX + p * CS + 3, y: OY + 3, width: CS - 6, height: ROWS * CS - 6, rx: 6, class: 'empty-slot' }, this.ghost);
    }
    for (let c = 0; c < COLS; c++) {
      const { g, cells } = this.cols[c];
      const covered = isCoveredCol(fold, c);
      const pos = covered ? c : physPos(fold, c);
      g.style.transform = `translate(${OX + pos * CS}px, 0px)`;
      g.style.opacity = covered ? 0 : 1;
      g.style.pointerEvents = covered ? 'none' : 'auto';
      const back = isFlippedCol(fold, c);
      cells.forEach((rect, r) => {
        rect.setAttribute('class', `cell ${back ? 'back' : 'front'}${legal.has(key(c, r)) ? ' legal' : ''}`);
      });
    }
    // 이음, 닻 칸
    this.marks.innerHTML = '';
    const seam = (x) => el('line', { x1: OX + x * CS, y1: OY + 2, x2: OX + x * CS, y2: OY + ROWS * CS - 2, class: 'seam' }, this.marks);
    if (fold.L > 0) seam(2 * fold.L);
    if (fold.R > 0) seam(COLS - 2 * fold.R);
    state.players.forEach((p, i) => {
      const [ac, ar] = unkey(p.anchor);
      const x = OX + physPos(fold, ac) * CS; const y = OY + ar * CS;
      el('rect', { x: x + 3, y: y + 3, width: CS - 6, height: CS - 6, rx: 7, class: 'anchor', stroke: COLORS[i] }, this.marks);
    });
    if (opt.lastSpawn != null && !opt.previewFold) {
      const [c, r] = unkey(opt.lastSpawn);
      if (!isCoveredCol(fold, c)) el('circle', { cx: OX + physPos(fold, c) * CS + CS / 2, cy: OY + r * CS + CS / 2, r: 18, class: 'spawn-ping' }, this.marks);
    }
    // 별빛 조각
    this.shardLayer.innerHTML = '';
    for (const [k, cnt] of state.shards) {
      const [c, r] = unkey(k);
      const covered = isCoveredCol(fold, c);
      const pos = covered ? c : physPos(fold, c);
      for (let i = 0; i < cnt; i++) {
        const cx = OX + pos * CS + CS - 11 - i * 7; const cy = OY + r * CS + CS - (covered ? 9 : 12);
        if (covered) el('circle', { cx, cy, r: 6, class: 'shard-absent' }, this.shardLayer);
        else el('path', { d: star(cx, cy, 8.5, 3.8), class: 'shard' }, this.shardLayer);
      }
    }
    // 길잡이
    this.ensurePieces(state.players.length);
    const occ = {};
    state.players.forEach((p, i) => {
      const covered = isCoveredCol(fold, p.c);
      const pos = covered ? p.c : physPos(fold, p.c);
      const slotKey = `${pos},${p.r},${covered}`;
      const slot = (occ[slotKey] = (occ[slotKey] || 0) + 1) - 1;
      const x = OX + pos * CS; const y = OY + p.r * CS;
      const px = x + 15 + (slot % 2) * 15; const py = covered ? y + CS - 10 : y + 22 + Math.floor(slot / 2) * 8;
      const g = this.pieces[i];
      g.style.transform = `translate(${px}px, ${py}px)${covered ? ' rotate(90deg) scale(.55, 1)' : ''}`;
      g.classList.toggle('absent', covered);
      g.classList.toggle('focus', opt.focus === i && !state.over);
      g.style.display = '';
    });
    for (let i = state.players.length; i < this.pieces.length; i++) this.pieces[i].style.display = 'none';
  }
}

function star(cx, cy, R, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
}
