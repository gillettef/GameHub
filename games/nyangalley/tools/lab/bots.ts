/**
 * 실험실 봇. 같은 규칙에서 성향이 다른 플레이어를 흉내 낸다.
 *  random     : 아무 합법 수
 *  greedy     : 1수 탐욕 (내 점수 − 상대 점수)
 *  expander   : 내 땅·심을 자리 넓히기만 본다 (상대 무시)
 *  raider     : 상대 점수 깎기를 더 크게 본다
 *  fortress   : 큐브를 두껍게 쌓은 안전한 땅을 더 친다
 *  goalie     : 목표 점수를 두 배로 친다
 *  human      : greedy 평가에 잡음 (상위 몇 수 중 확률로 고름) — 사람다운 실수
 *  lookahead  : 내 상위 수마다 다음 사람의 최선 응수를 본 뒤 고른다 (2수)
 */
import { PLACE_CHORES, type ChoreId, type Game, type Move, type Rand, type TurnAction } from './engine.js';

export interface Bot {
  name: string;
  /** 마켓에서 가져올 카드 번호 */
  take(g: Game, s: number, rand: Rand): number;
  plant(g: Game, s: number, rand: Rand): Move;
  /** 행동 고르기 규칙(rules.actions)에서 이번 차례 행동 */
  action?(g: Game, s: number, rand: Rand): TurnAction;
  /** 골목 일과 규칙에서 펼친 일과 중 고를 번호 */
  draft?(g: Game, s: number, rand: Rand): number;
}

type Eval = (g: Game, s: number) => number;

function oppTerm(sc: number[], s: number): { max: number; mean: number } {
  let max = -Infinity;
  let sum = 0;
  let k = 0;
  sc.forEach((v, o) => {
    if (o === s) return;
    max = Math.max(max, v);
    sum += v;
    k++;
  });
  return { max, mean: k ? sum / k : 0 };
}

/** 행동 고르기 규칙에서만: 내 칸에 쌓인 고양이(칸당 3마리까지)의 수비 가치. 한 수 앞만 보는 봇이 쌓기·이동의 가치를 보게 한다 */
export const SAFE_W = Number(process.env.LAB_SAFE ?? 0.18);
/** 쉬는 고양이 경제(noRelocate)에서만: 쉬는 고양이 1마리의 가치(다음 명당 놓기에 쓸 수 있다) */
export const SUPPLY_W = Number(process.env.LAB_SUPPLY ?? 0.35);
function safety(g: Game, s: number): number {
  if (!g.rules.actions) return 0;
  if (g.rules.actions.noRelocate) return SUPPLY_W * Math.min(6, g.supplyOf(s)) + safetyStack(g, s);
  return safetyStack(g, s);
}
function safetyStack(g: Game, s: number): number {
  const I = g.inf[s] as Int16Array;
  let v = 0;
  for (let c = 0; c < g.geo.n; c++) if (g.owner(c) === s) v += Math.min(3, I[c] as number) - 1;
  return SAFE_W * v;
}

export const evalBalanced: Eval = (g, s) => {
  const sc = g.scores();
  const o = oppTerm(sc, s);
  return (sc[s] as number) - (g.P === 2 ? o.max : 0.6 * o.max + 0.4 * o.mean) + safety(g, s);
};

function frontier(g: Game, s: number): number {
  let k = 0;
  for (let c = 0; c < g.geo.n; c++) if (g.isPlantable(c) && g.owner(c) === s) k++;
  return k;
}

function safeCells(g: Game, s: number, min = 2): number {
  let k = 0;
  const I = g.inf[s] as Int16Array;
  for (let c = 0; c < g.geo.n; c++) if (g.owner(c) === s && (I[c] as number) >= min) k++;
  return k;
}

export const evalExpander: Eval = (g, s) => {
  const sc = g.scores();
  return (sc[s] as number) + 0.35 * frontier(g, s);
};

export const evalRaider: Eval = (g, s) => {
  const sc = g.scores();
  const o = oppTerm(sc, s);
  return (sc[s] as number) - 1.6 * (g.P === 2 ? o.max : 0.5 * o.max + 0.5 * o.mean);
};

export const evalFortress: Eval = (g, s) => {
  const sc = g.scores();
  const o = oppTerm(sc, s);
  return (sc[s] as number) - (g.P === 2 ? o.max : 0.6 * o.max + 0.4 * o.mean) + 0.4 * safeCells(g, s);
};

export const evalGoalie: Eval = (g, s) => {
  const sc = g.scores();
  const gs = g.goalScores();
  const o = oppTerm(sc, s);
  return (sc[s] as number) + (gs[s] as number) - (g.P === 2 ? o.max : 0.6 * o.max + 0.4 * o.mean);
};

/** 손 카드 + (가져올 카드) 로 둘 수 있는 수 중 평가가 가장 높은 수 */
function bestMove(g: Game, s: number, ev: Eval): { move: Move; value: number; all: { move: Move; value: number }[] } {
  const moves = g.moves(s);
  if (!moves.length) {
    const none = { move: { hand: -1, cell: -1, rot: 0, extra: -1 }, value: ev(g, s) };
    return { ...none, all: [none] };
  }
  const all = moves.map((m) => ({ move: m, value: m.cell >= 0 ? g.tryMove(s, m, () => ev(g, s)) : ev(g, s) - 0.5 }));
  let best = all[0] as { move: Move; value: number };
  for (const x of all) if (x.value > best.value) best = x;
  return { move: best.move, value: best.value, all };
}

/** 마켓 카드마다 "가져와서 바로 심을 때 최선 값"을 잰다 (turn 흐름). round 흐름에서도 근사로 쓴다 */
function marketValues(g: Game, s: number, ev: Eval): { idx: number; value: number; move: Move }[] {
  const out: { idx: number; value: number; move: Move }[] = [];
  const hand = g.hands[s] as number[];
  const seen = new Map<number, { value: number; move: Move }>();
  g.market.forEach((card, idx) => {
    const cached = seen.get(card);
    if (cached) {
      out.push({ idx, ...cached });
      return;
    }
    hand.push(card);
    const b = bestMove(g, s, ev);
    hand.pop();
    seen.set(card, { value: b.value, move: b.move });
    out.push({ idx, value: b.value, move: b.move });
  });
  // 카드 더미 뒷면 1장 (blindDraw): 아직 못 본 카드 분포로 낸 기댓값. idx = -1
  if (g.rules.blindDraw && g.bag.length) {
    const unseen = g.unseen(s);
    let total = 0;
    let sum = 0;
    let move: Move = { hand: -1, cell: -1, rot: 0, extra: -1 };
    for (const [card, n] of unseen) {
      let v = seen.get(card)?.value;
      if (v === undefined) {
        hand.push(card);
        const b = bestMove(g, s, ev);
        hand.pop();
        v = b.value;
        move = b.move;
      }
      sum += n * v;
      total += n;
    }
    if (total) out.push({ idx: -1, value: sum / total, move });
  }
  return out;
}

/** 담 넘기·모여라 후보 중 평가가 가장 높은 것 (모여라는 1마리씩 가장 좋은 칸에 탐욕으로 나눈다) */
export function bestNonPlace(g: Game, s: number, ev: Eval): { act: TurnAction; value: number }[] {
  const out: { act: TurnAction; value: number }[] = [];
  const a = g.rules.actions;
  if (!a) return out;
  let bestMv: { act: TurnAction; value: number } | null = null;
  if (g.canDo(s, 'move'))
    for (const [from, to, k] of g.moveOptions(s)) {
      const mk = g.mark();
      g.applyMove(s, from, to, k);
      const v = ev(g, s);
      g.rollback(mk);
      if (!bestMv || v > bestMv.value) bestMv = { act: { kind: 'move', from, to, k }, value: v };
    }
  if (bestMv && (a.moveTimes ?? 1) >= 2 && bestMv.act.kind === 'move') {
    const first = bestMv.act;
    const mk = g.mark();
    g.applyMove(s, first.from, first.to, first.k);
    let second: { from: number; to: number; k: number; value: number } | null = null;
    for (const [from, to, k] of g.moveOptions(s)) {
      const m2 = g.mark();
      g.applyMove(s, from, to, k);
      const v = ev(g, s);
      g.rollback(m2);
      if (!second || v > second.value) second = { from, to, k, value: v };
    }
    g.rollback(mk);
    if (second && second.value > bestMv.value) bestMv = { act: { ...first, then: { from: second.from, to: second.to, k: second.k } }, value: second.value };
  }
  if (bestMv) out.push(bestMv);
  if (g.canDo(s, 'call')) {
    let bestC: { act: TurnAction; value: number } | null = null;
    for (const cell of g.callOptions(s)) {
      const rots = g.rules.chores?.callTurn ? (g.rotCache[g.plant[cell] as number] as unknown[]).map((_, i) => i) : [undefined];
      for (const rot of rots) {
        const mk = g.mark();
        g.applyCall(s, cell, rot);
        const v = ev(g, s);
        g.rollback(mk);
        if (!bestC || v > bestC.value) bestC = { act: { kind: 'call', cell, rot }, value: v };
      }
    }
    if (bestC && g.rules.chores?.callTake && g.market.length) bestC.value += 0.6;
    if (bestC) out.push(bestC);
  }
  if (a.gatherMode === 'nap' && g.canDo(s, 'gather')) {
    const mk = g.mark();
    const cells: number[] = [];
    let cur = ev(g, s);
    for (let i = 0; i < a.gather; i++) {
      let best = -1;
      let bv = -Infinity;
      for (let c = 0; c < g.geo.n; c++) {
        if (g.owner(c) !== s) continue;
        const m2 = g.mark();
        g.applyGather(s, [c]);
        const v = ev(g, s);
        g.rollback(m2);
        if (v > bv) {
          bv = v;
          best = c;
        }
      }
      if (best < 0 || (cells.length > 0 && bv < cur)) break;
      g.applyGather(s, [best]);
      cells.push(best);
      cur = bv;
    }
    const v = ev(g, s);
    g.rollback(mk);
    if (cells.length) out.push({ act: { kind: 'gather', cells }, value: v });
    return out;
  }
  if (a.gatherMode === 'regroup' && g.canDo(s, 'gather')) {
    const mk = g.mark();
    const cells: number[] = [];
    const own = () => {
      const o: number[] = [];
      for (let c = 0; c < g.geo.n; c++) if (g.owner(c) === s) o.push(c);
      return o;
    };
    let cur = ev(g, s);
    for (let i = 0; i < a.gather; i++) {
      const o = own();
      let best: [number, number] | null = null;
      let bv = cur;
      for (const from of o)
        for (const to of o) {
          if (from === to) continue;
          const m2 = g.mark();
          g.applyRegroup(s, from, to);
          const v = ev(g, s);
          g.rollback(m2);
          if (v > bv + 1e-9) {
            bv = v;
            best = [from, to];
          }
        }
      if (!best) break;
      g.applyRegroup(s, best[0], best[1]);
      cells.push(best[0], best[1]);
      cur = bv;
    }
    const v = ev(g, s);
    g.rollback(mk);
    if (cells.length) out.push({ act: { kind: 'gather', cells }, value: v });
    return out;
  }
  const n = Math.min(a.gather, g.supplyOf(s));
  if (n > 0 && g.canDo(s, 'gather')) {
    const mk = g.mark();
    const cells: number[] = [];
    const per = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      let best = -1;
      let bv = -Infinity;
      for (let c = 0; c < g.geo.n; c++) {
        if (g.owner(c) !== s || (per.get(c) ?? 0) >= a.perCell) continue;
        const m2 = g.mark();
        g.applyGather(s, [c]);
        const v = ev(g, s);
        g.rollback(m2);
        if (v > bv) {
          bv = v;
          best = c;
        }
      }
      if (best < 0) break;
      g.applyGather(s, [best]);
      cells.push(best);
      per.set(best, (per.get(best) ?? 0) + 1);
    }
    const v = ev(g, s);
    g.rollback(mk);
    if (cells.length) out.push({ act: { kind: 'gather', cells }, value: v });
  }
  return out;
}

/** 명당 놓기 차례의 값(가져오기 후보 중 최선)과 가져올 카드 번호. 놓을 수 없으면 null */
function placeValue(g: Game, s: number, ev: Eval): { value: number; take: number } | null {
  if (!g.canDo(s, 'place')) return null;
  if (g.market.length || (g.rules.blindDraw && g.bag.length)) {
    const vals = marketValues(g, s, ev);
    if (!vals.length) return null;
    const best = vals.reduce((x, y) => (y.value > x.value ? y : x));
    return { value: best.value, take: best.idx };
  }
  if (!(g.hands[s] as number[]).length) return null;
  const b = bestMove(g, s, ev);
  return b.move.cell >= 0 ? { value: b.value, take: 0 } : null;
}


/** 상대 o 의 탐욕 응수(명당 놓기: 손 + 펼친 타일 하나 / 행동 고르기면 담 넘기도)를 적용한다. 되돌리기 기록에 남는다 */
function greedyReply(g: Game, o: number): void {
  const hand = g.hands[o] as number[];
  let best: { value: number; apply: () => void } | null = null;
  const pool = [...new Set(g.market.length ? g.market : [-1])];
  for (const mc of pool) {
    if (mc >= 0) hand.push(mc);
    if (hand.length) {
      const r = bestMove(g, o, evalBalanced);
      if (r.move.cell >= 0 && (!best || r.value > best.value)) {
        const sp = hand[r.move.hand] as number;
        const mv = r.move;
        best = { value: r.value, apply: () => g.applyPlant(o, sp, mv.cell, mv.rot, mv.extra) };
      }
    }
    if (mc >= 0) hand.pop();
  }
  if (g.rules.actions && g.canDo(o, 'move'))
    for (const [from, to, k] of g.moveOptions(o)) {
      const mk = g.mark();
      g.applyMove(o, from, to, k);
      const v = evalBalanced(g, o);
      g.rollback(mk);
      if (!best || v > best.value) best = { value: v, apply: () => g.applyMove(o, from, to, k) };
    }
  if (best) best.apply();
}

/** 행동 후보를 둔 뒤 다른 사람들이 차례대로 탐욕 응수했을 때의 평가. 0.3 × 바로 값 + 0.7 × 응수 뒤 값 */
function replyValue(g: Game, s: number, ev: Eval, immediate: number, apply: () => void): number {
  const mk = g.mark();
  apply();
  for (let k = 1; k < g.P; k++) greedyReply(g, (s + k) % g.P);
  const after = ev(g, s);
  g.rollback(mk);
  return 0.3 * immediate + 0.7 * after;
}

/** 행동 고르기에서 응수까지 보고 고른다 (rules.actions, LAB_REPLY != 0) */
function replyAwareAction(g: Game, s: number, ev: Eval): TurnAction | null {
  const cands: { act: TurnAction; value: number }[] = [];
  const hand = g.hands[s] as number[];
  if (g.canDo(s, 'place')) {
    if (g.market.length || (g.rules.blindDraw && g.bag.length)) {
      const vals = marketValues(g, s, ev).sort((x, y) => y.value - x.value).slice(0, 2);
      for (const v of vals) {
        if (v.idx < 0 || v.move.cell < 0) {
          cands.push({ act: { kind: 'place', take: v.idx }, value: v.value });
          continue;
        }
        const card = g.market[v.idx] as number;
        const mv = v.move;
        const val = replyValue(g, s, ev, v.value, () => {
          hand.push(card);
          const sp = hand[mv.hand] as number;
          g.applyPlant(s, sp, mv.cell, mv.rot, mv.extra);
          hand.pop();
        });
        cands.push({ act: { kind: 'place', take: v.idx }, value: val });
      }
    } else if (hand.length) {
      const b = bestMove(g, s, ev);
      if (b.move.cell >= 0) {
        const mv = b.move;
        const sp = hand[mv.hand] as number;
        cands.push({ act: { kind: 'place', take: 0 }, value: replyValue(g, s, ev, b.value, () => g.applyPlant(s, sp, mv.cell, mv.rot, mv.extra)) });
      }
    }
  }
  if (g.canDo(s, 'move')) {
    const mvs: { from: number; to: number; k: number; value: number }[] = [];
    for (const [from, to, k] of g.moveOptions(s)) {
      const mk = g.mark();
      g.applyMove(s, from, to, k);
      mvs.push({ from, to, k, value: ev(g, s) });
      g.rollback(mk);
    }
    for (const m of mvs.sort((x, y) => y.value - x.value).slice(0, 3))
      cands.push({ act: { kind: 'move', from: m.from, to: m.to, k: m.k }, value: replyValue(g, s, ev, m.value, () => g.applyMove(s, m.from, m.to, m.k)) });
  }
  for (const o of bestNonPlace(g, s, ev)) {
    if (o.act.kind === 'gather') {
      const cells = o.act.cells;
      cands.push({ act: o.act, value: replyValue(g, s, ev, o.value, () => g.applyGather(s, cells)) });
    } else if (o.act.kind === 'move' && o.act.then) {
      const m = o.act;
      const t = m.then!;
      cands.push({ act: m, value: replyValue(g, s, ev, o.value, () => { g.applyMove(s, m.from, m.to, m.k); g.applyMove(s, t.from, t.to, t.k); }) });
    } else if (o.act.kind === 'call') {
      const cell = o.act.cell;
      const rot = o.act.rot;
      cands.push({ act: o.act, value: replyValue(g, s, ev, o.value, () => g.applyCall(s, cell, rot)) });
    }
  }
  if (!cands.length) return null;
  return cands.reduce((x, y) => (y.value > x.value ? y : x)).act;
}

/** 대장 방울(다음 선)의 가치 추정. 봇 쪽 보정값이다 */
export const BOSS_W = Number(process.env.LAB_BOSS ?? 0.2);
/** 일과 ch 를 골랐을 때 이번 차례 최선의 1수 값 (고르기 추정용) */
export function choreValue(g: Game, s: number, ch: ChoreId, ev: Eval): number {
  const prev = g.choreOf[s] ?? null;
  g.choreOf[s] = ch;
  let v = -Infinity;
  if (PLACE_CHORES.includes(ch)) {
    if (ch === 'peek' && g.rules.chores?.peekMode !== 'look3') {
      const hand = g.hands[s] as number[];
      const add = g.market.slice(0, 2);
      hand.push(...add);
      if (hand.length) v = bestMove(g, s, ev).value + 0.3;
      hand.splice(hand.length - add.length, add.length);
    } else {
      const pv = placeValue(g, s, ev);
      if (pv) v = pv.value + (ch === 'boss' ? BOSS_W : 0) + (ch === 'peek' ? 0.1 : 0);
    }
  } else for (const o of bestNonPlace(g, s, ev)) v = Math.max(v, o.value);
  g.choreOf[s] = prev;
  return v === -Infinity ? ev(g, s) - 1 : v;
}

class EvalBot implements Bot {
  constructor(
    readonly name: string,
    private ev: Eval,
    private noise = 0,
  ) {}
  take(g: Game, s: number, rand: Rand): number {
    if (!g.market.length) return 0;
    const vals = marketValues(g, s, this.ev);
    let pick = vals.reduce((a, b) => (b.value > a.value ? b : a));
    if (this.noise > 0 && rand() < this.noise) pick = vals[Math.floor(rand() * vals.length)] as typeof pick;
    return pick.idx;
  }
  draft(g: Game, s: number, rand: Rand): number {
    const vals = g.offer.map((ch) => choreValue(g, s, ch, this.ev));
    let best = 0;
    vals.forEach((v, i) => v > (vals[best] as number) && (best = i));
    if (this.noise > 0 && vals.length > 1 && rand() < this.noise) return Math.floor(rand() * vals.length);
    return best;
  }
  action(g: Game, s: number, rand: Rand): TurnAction {
    if (process.env.LAB_REPLY !== '0' && !(this.noise > 0 && rand() < this.noise)) {
      const a = replyAwareAction(g, s, this.ev);
      if (a) return a;
    }
    const cands: { act: TurnAction; value: number }[] = [];
    const pv = placeValue(g, s, this.ev);
    if (pv) cands.push({ act: { kind: 'place', take: pv.take }, value: pv.value });
    cands.push(...bestNonPlace(g, s, this.ev));
    if (!cands.length) return { kind: 'place', take: 0 };
    cands.sort((x, y) => y.value - x.value);
    if (this.noise > 0 && cands.length > 1 && rand() < this.noise) return (cands[1] as { act: TurnAction }).act;
    return (cands[0] as { act: TurnAction }).act;
  }
  plant(g: Game, s: number, rand: Rand): Move {
    const b = bestMove(g, s, this.ev);
    if (this.noise > 0 && b.all.length > 1 && rand() < this.noise * 2) {
      const sorted = [...b.all].sort((x, y) => y.value - x.value);
      const top = sorted.slice(0, Math.min(4, sorted.length));
      return (top[Math.floor(rand() * top.length)] as { move: Move }).move;
    }
    return b.move;
  }
}

export class RandomBot implements Bot {
  name = 'random';
  draft(g: Game, _s: number, rand: Rand): number {
    return Math.floor(rand() * g.offer.length);
  }
  action(g: Game, s: number, rand: Rand): TurnAction {
    const opts: TurnAction[] = [];
    if (g.canDo(s, 'place') && (g.market.length || (g.hands[s] as number[]).length)) opts.push({ kind: 'place', take: this.take(g, s, rand) });
    const mv = g.canDo(s, 'move') ? g.moveOptions(s) : [];
    if (mv.length) {
      const [from, to, k] = mv[Math.floor(rand() * mv.length)] as [number, number, number];
      opts.push({ kind: 'move', from, to, k });
    }
    const own: number[] = [];
    for (let c = 0; c < g.geo.n; c++) if (g.owner(c) === s) own.push(c);
    const calls = g.canDo(s, 'call') ? g.callOptions(s) : [];
    if (calls.length) opts.push({ kind: 'call', cell: calls[Math.floor(rand() * calls.length)] as number });
    if (own.length && g.supplyOf(s) > 0 && g.canDo(s, 'gather')) opts.push({ kind: 'gather', cells: Array.from({ length: g.rules.actions?.gather ?? 0 }, () => own[Math.floor(rand() * own.length)] as number) });
    return opts.length ? (opts[Math.floor(rand() * opts.length)] as TurnAction) : { kind: 'place', take: 0 };
  }
  take(g: Game, _s: number, rand: Rand): number {
    const pile = g.rules.blindDraw && g.bag.length ? 1 : 0;
    const k = Math.floor(rand() * Math.max(1, g.market.length + pile));
    return k >= g.market.length && pile ? -1 : k;
  }
  plant(g: Game, s: number, rand: Rand): Move {
    const m = g.moves(s);
    if (!m.length) return { hand: -1, cell: -1, rot: 0, extra: -1 };
    return m[Math.floor(rand() * m.length)] as Move;
  }
}

/**
 * 한 바퀴 앞보기: 내 상위 K수마다, 다음 사람들이 차례대로 (자기 손 + 마켓 카드 중) 탐욕 응수를 한다고 보고
 * 다시 내 차례가 왔을 때의 평가로 고른다 (상대 손을 안다고 가정한 상한 근사)
 */
export class LookaheadBot implements Bot {
  name = 'lookahead';
  constructor(private k = 6) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 봇 인터페이스 모양
  take(g: Game, s: number, _rand: Rand): number {
    if (!g.market.length) return 0;
    const all = marketValues(g, s, evalBalanced).sort((a, b) => b.value - a.value);
    // 더미 뒷면은 기댓값이라 앞보기를 하지 않는다: 1수 값이 가장 높을 때만 고른다
    if (all[0]!.idx === -1) return -1;
    const vals = all.filter((v) => v.idx >= 0);
    let best = vals[0]!;
    let bestV = -Infinity;
    const seen = new Set<number>();
    for (const v of vals) {
      const card = g.market[v.idx] as number;
      if (seen.has(card)) continue;
      seen.add(card);
      if (seen.size > 3) break;
      const hand = g.hands[s] as number[];
      hand.push(card);
      const removed = g.market.splice(v.idx, 1);
      const val = this.deep(g, s).value;
      g.market.splice(v.idx, 0, ...removed);
      hand.pop();
      if (val > bestV) {
        bestV = val;
        best = v;
      }
    }
    return best.idx;
  }
  /** 상대 o 의 탐욕 응수 (손 + 마켓 카드 하나) 를 적용한다. 되돌리기 기록에 남는다 */
  private reply(g: Game, o: number): void {
    const hand = g.hands[o] as number[];
    const pool = [...new Set(g.market.length ? g.market : [-1])];
    let best: { sp: number; move: Move; value: number } | null = null;
    for (const mc of pool) {
      if (mc >= 0) hand.push(mc);
      if (hand.length) {
        const r = bestMove(g, o, evalBalanced);
        if (r.move.cell >= 0 && (!best || r.value > best.value)) best = { sp: hand[r.move.hand] as number, move: r.move, value: r.value };
      }
      if (mc >= 0) hand.pop();
    }
    if (best) g.applyPlant(o, best.sp, best.move.cell, best.move.rot, best.move.extra);
  }
  private deep(g: Game, s: number): { move: Move; value: number } {
    const b = bestMove(g, s, evalBalanced);
    const top = [...b.all].sort((x, y) => y.value - x.value).slice(0, this.k);
    let best = top[0] as { move: Move; value: number };
    let bestV = -Infinity;
    for (const cand of top) {
      if (cand.move.cell < 0) continue;
      const mk = g.mark();
      const sp = g.hands[s]![cand.move.hand] as number;
      g.applyPlant(s, sp, cand.move.cell, cand.move.rot, cand.move.extra);
      for (let k = 1; k < g.P; k++) this.reply(g, (s + k) % g.P);
      const after = evalBalanced(g, s);
      g.rollback(mk);
      const v = 0.3 * cand.value + 0.7 * after;
      if (v > bestV) {
        bestV = v;
        best = cand;
      }
    }
    return { move: best.move, value: bestV === -Infinity ? best.value : bestV };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 봇 인터페이스 모양
  plant(g: Game, s: number, _rand: Rand): Move {
    return this.deep(g, s).move;
  }
  /** 행동 고르기: 1수 값으로 놓기 대 담 넘기·모여라를 비교하고, 놓기면 가져오기는 take(앞보기)로 */
  draft(g: Game, s: number): number {
    const vals = g.offer.map((ch) => choreValue(g, s, ch, evalBalanced));
    let best = 0;
    vals.forEach((v, i) => v > (vals[best] as number) && (best = i));
    return best;
  }
  action(g: Game, s: number, rand: Rand): TurnAction {
    const pv = placeValue(g, s, evalBalanced);
    const others = bestNonPlace(g, s, evalBalanced).sort((x, y) => y.value - x.value);
    if (others.length && (!pv || (others[0] as { value: number }).value > pv.value)) return (others[0] as { act: TurnAction }).act;
    return { kind: 'place', take: this.take(g, s, rand) };
  }
}

export function makeBot(name: string): Bot {
  switch (name) {
    case 'random':
      return new RandomBot();
    case 'greedy':
      return new EvalBot('greedy', evalBalanced);
    case 'expander':
      return new EvalBot('expander', evalExpander);
    case 'raider':
      return new EvalBot('raider', evalRaider);
    case 'fortress':
      return new EvalBot('fortress', evalFortress);
    case 'goalie':
      return new EvalBot('goalie', evalGoalie);
    case 'human':
      return new EvalBot('human', evalBalanced, 0.18);
    case 'lookahead':
      return new LookaheadBot();
    default:
      throw new Error(`봇 없음: ${name}`);
  }
}

export const ARCHETYPES = ['greedy', 'expander', 'raider', 'fortress', 'goalie'];
