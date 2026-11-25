// 봇 플레이어. 결정적 규칙을 그대로 시뮬레이션해서 고른다.
//  - 조종사(normal): 할 수 있는 개입을 모두 시험해 "내 코어 − 설계자에게 줄 점수 + 자리·에너지 가치"가 가장 큰 것을 고른다.
//  - 설계자(normal): 손패 5개로 만들 수 있는 배치 60가지마다 상대 조종사의 최선 대응을 가정해
//    "내 설계자 점수 − 상대 코어의 절반"이 가장 큰 배치를 고른다.
//  - easy: 대부분 무작위.
import { CORE_SPOTS, MAX_ENERGY } from './data';
import { createRng } from './rng';
import { currentBot, designerOf, emptyStats, legalInterventions, line, playTurn, submitDesign, targetOf } from './engine';
import type { GameState, Intervention } from './types';

const ALPHA = 0.5;

/** 로그·통계를 비운 가벼운 복사본 (시뮬레이션용). 타일 종류표(tiles)만 바뀌지 않으므로 공유한다 */
function scratch(g: GameState): GameState {
  return {
    ...g,
    players: g.players.map((p) => ({ ...p, bot: { ...p.bot }, brain: [...p.brain], hand: [...p.hand], pending: p.pending ? [...p.pending] : null })),
    cores: g.cores.map((c) => ({ ...c })),
    bag: [...g.bag],
    log: [],
    stats: emptyStats(),
  };
}

/** g를 복사해 로봇 p의 실행 차례를 지금 진행한다고 놓는다 */
function asTurnOf(g: GameState, p: number, brain?: number[]): GameState {
  const c = scratch(g);
  c.phase = 'exec';
  c.first = p;
  c.turn = 0;
  c.rounds = 999;
  if (brain) c.players[p]!.brain = [...brain];
  return c;
}

const nearestCore = (g: GameState, x: number, y: number) => {
  const spots = g.cores.length ? g.cores : CORE_SPOTS;
  return Math.min(...spots.map((c) => Math.abs(c.x - x) + Math.abs(c.y - y)));
};

interface Outcome {
  cores: number;
  /** 설계자가 얻은 것: 설계자 점수 + 쓴 에너지 0.5 */
  given: number;
  pilotValue: number;
}

function outcome(before: GameState, after: GameState, p: number): Outcome {
  const b = before.players[p]!;
  const a = after.players[p]!;
  const d = designerOf(before, p);
  const cores = a.cores - b.cores;
  const given = after.players[d]!.dp - before.players[d]!.dp + 0.5 * (a.spent - b.spent);
  const lastRound = before.round >= before.rounds;
  // 에너지: 다음 충전에서 넘치지 않는 만큼만 가치가 있다
  const energyValue = lastRound ? 0 : Math.min(a.energy, MAX_ENERGY - 1) * 0.35 + (a.energy >= MAX_ENERGY ? 0.05 : 0);
  const posValue = lastRound ? 0 : -0.25 * nearestCore(after, a.bot.x, a.bot.y) + (line(after, p).cells.some((c) => after.cores.some((k) => k.x === c.x && k.y === c.y)) ? 0.4 : 0);
  return { cores, given, pilotValue: 2 * cores - given + energyValue + posValue };
}

function bestResponse(g: GameState, p: number): { iv: Intervention; out: Outcome } {
  let best: { iv: Intervention; out: Outcome } | null = null;
  for (const iv of legalInterventions(g)) {
    const c = scratch(g);
    playTurn(c, iv);
    const out = outcome(g, c, p);
    if (!best || out.pilotValue > best.out.pilotValue + 1e-9) best = { iv, out };
  }
  return best!;
}

/** 지금 실행 차례 로봇의 조종사가 봇일 때 고르는 개입 */
export function botIntervention(g: GameState, seed: number): Intervention {
  const p = currentBot(g);
  const rng = createRng(seed);
  if (g.players[p]!.level === 'easy' && rng.next() < 0.7) {
    const legal = legalInterventions(g);
    return rng.next() < 0.5 ? { k: 'none' } : legal[rng.int(legal.length)]!;
  }
  return bestResponse(g, p).iv;
}

/** 설계자 d가 봇일 때 고르는 배치 (슬롯 1·2·3 순서) */
export function botDesign(g: GameState, d: number, seed: number): number[] {
  const hand = g.players[d]!.hand;
  const rng = createRng(seed);
  if (g.players[d]!.level === 'easy') {
    const h = [...hand];
    const out: number[] = [];
    while (out.length < 3) out.push(h.splice(rng.int(h.length), 1)[0]!);
    return out;
  }
  const t = targetOf(g, d);
  let best: number[] = hand.slice(0, 3);
  let bestVal = -Infinity;
  for (const a of hand)
    for (const b of hand)
      for (const c of hand) {
        if (a === b || b === c || a === c) continue;
        const brain = [a, b, c];
        const base = asTurnOf(g, t, brain);
        const { out } = bestResponse(base, t);
        const val = out.given - ALPHA * 2 * out.cores + rng.next() * 1e-3;
        if (val > bestVal) {
          bestVal = val;
          best = brain;
        }
      }
  return best;
}

/** 봇끼리만 끝까지 진행 (자동 시뮬레이션용) */
export function playOut(g: GameState, seed: number): GameState {
  let s = seed;
  while (g.phase !== 'done') {
    if (g.phase === 'design') {
      for (let d = 0; d < g.n; d++) if (!g.players[d]!.pending) submitDesign(g, d, botDesign(g, d, s++));
    } else {
      playTurn(g, botIntervention(g, s++));
    }
  }
  return g;
}

