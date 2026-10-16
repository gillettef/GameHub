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
import type { Game, Move, Rand } from './engine.js';

export interface Bot {
  name: string;
  /** 마켓에서 가져올 카드 번호 */
  take(g: Game, s: number, rand: Rand): number;
  plant(g: Game, s: number, rand: Rand): Move;
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

export const evalBalanced: Eval = (g, s) => {
  const sc = g.scores();
  const o = oppTerm(sc, s);
  return (sc[s] as number) - (g.P === 2 ? o.max : 0.6 * o.max + 0.4 * o.mean);
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
  return out;
}

class EvalBot implements Bot {
  private planned: { card: number; move: Move } | null = null;
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
    this.planned = null;
    return pick.idx;
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
  take(g: Game, _s: number, rand: Rand): number {
    return Math.floor(rand() * Math.max(1, g.market.length));
  }
  plant(g: Game, s: number, rand: Rand): Move {
    const m = g.moves(s);
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
  take(g: Game, s: number, _rand: Rand): number {
    if (!g.market.length) return 0;
    const vals = marketValues(g, s, evalBalanced).sort((a, b) => b.value - a.value);
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
  plant(g: Game, s: number, _rand: Rand): Move {
    return this.deep(g, s).move;
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
