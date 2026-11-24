/**
 * AI 수 결정 (2026-11-25 Python `ai/astral_ai/search.py` 에서 옮김, 같은 수를 고른다).
 * 차례 = 마켓에서 1장 가져오기 → 손 2장 중 1장 심기 (Rules.md 5절).
 * 가져오기: 마켓 카드마다 "손 카드 + 그 카드로 둘 수 있는 최선 1수 가치 + 공개 목표 연계 가산"을 매기고, 카드 더미 뒷면 1장은
 * 아직 못 본 카드(전체 − 심은 카드 − 마켓 − 내 손) 분포로 낸 기댓값을 매겨 가장 큰 쪽을 고른다. 더미 순서는 보지 않는다.
 * 심기: 손 카드 × 칸 × 회전(× 민들레 씨앗 상위 칸)에 대해 1수 탐욕(내 총점 − 가장 높은 상대 총점)으로 고른다.
 * 규칙 계산은 전부 shared 엔진(plantRoots·computeScores·legalPlantCells)을 부른다(사본 없음).
 * 입력은 그 자리가 보는 가린 상태다(사람과 같은 정보). 시간 제한 안에 끝내지 못하면 엔진 자동 수.
 * 허브 프로세스 안에서 돌기 때문에 SLICE_MS 마다 이벤트 루프에 양보한다(결과는 같고, 오래 걸리면 시간 예산만 줄어든다).
 */
import type { Action, Direction, GameState, GoalId, MaskedGameState, PlayerId, Plant, Position, SpeciesId } from '@rootbound/shared';
import {
  FLOWER_SPECIES,
  FOREST_SPECIES,
  autoAction,
  computeScores,
  distinctRotations,
  getGoal,
  getSpecies,
  legalPlantCells,
  legalSeedCells,
  maskState,
  plantRoots,
  rulesFor,
} from '@rootbound/shared';

/** 탐색 시간 예산: 제한 시간 중 이 비율에서 여유(ms)를 뺀다 */
const TIME_FRACTION = 0.6;
const TIME_MARGIN_MS = 150;
/** 민들레 씨앗 칸을 따로 펼쳐 볼 상위 (칸, 회전) 수 */
const SEED_TOP = 3;
/** 허브 한 프로세스에서 다른 게임이 멈추지 않게, 탐색이 이벤트 루프를 연속으로 붙잡는 최대 시간(ms) */
const SLICE_MS = 8;

// 가져오기 목표 연계 가산 (AI 휴리스틱. 규칙 수치가 아니라 AI 선호도라 여기 둔다)
const RESERVE_TAKE_BONUS = 2;
const FLOWER_TAKE_BONUS = 1;
const FOREST_TAKE_BONUS = 1;

type SearchState = GameState | MaskedGameState;

export interface Decision {
  action: Action;
  /** 0 = 시간 초과·폴백, 1 = 1수 탐욕 */
  depth: number;
  elapsedMs: number;
}

/** 공개 목표가 이 카드를 반길 때 더하는 가치 */
export function takeGoalBonus(goals: readonly GoalId[], species: SpeciesId): number {
  let bonus = 0;
  for (const g of goals) {
    if (getGoal(g).species === species) bonus += RESERVE_TAKE_BONUS;
    else if (g === 'flower-bed' && FLOWER_SPECIES.includes(species)) bonus += FLOWER_TAKE_BONUS;
    else if (g === 'forest' && FOREST_SPECIES.includes(species)) bonus += FOREST_TAKE_BONUS;
  }
  return bonus;
}

class OutOfTime extends Error {}

interface Candidate {
  value: number;
  species: SpeciesId;
  pos: Position;
  rotation: number;
  seed: Position | null;
}

/** 한 상태에서 여러 수를 시험한다. 상태는 바꾸지 않는다 */
class Evaluator {
  readonly seat: number;
  private readonly rivals: number[];
  private sliceStart = performance.now();

  constructor(
    private readonly state: SearchState,
    private readonly playerId: PlayerId,
    private readonly deadline: number,
  ) {
    const me = state.players.find((p) => p.id === playerId);
    if (!me) throw new Error('없는 플레이어입니다');
    this.seat = me.seat;
    this.rivals = state.players.filter((p) => p.id !== playerId && p.surrenderedOrder === null).map((p) => p.seat);
  }

  /** 내 총점 − 가장 높은 상대 총점 */
  private margin(s: Pick<GameState, 'board' | 'plants' | 'players' | 'rootSeat' | 'rootCount' | 'goals'>): number {
    const scores = computeScores(s);
    const total = (seat: number) => scores[this.state.players.find((p) => p.seat === seat)!.id]!.total;
    return total(this.seat) - (this.rivals.length ? Math.max(...this.rivals.map(total)) : 0);
  }

  base(): number {
    return this.margin(this.state);
  }

  value(species: SpeciesId, pos: Position, rotation: number, seed: Position | null): number {
    if (performance.now() >= this.deadline) throw new OutOfTime();
    const plant: Plant = { id: 'ai', species, ownerId: this.playerId, pos, rotation: rotation as Direction };
    const plants = [...this.state.plants, plant];
    const next = { ...this.state, plants };
    const r = plantRoots(next, this.playerId, species, pos, rotation, seed);
    return this.margin({ ...next, rootSeat: r.rootSeat, rootCount: r.rootCount });
  }

  /** 연속 계산이 SLICE_MS 를 넘으면 다른 일(다른 게임의 요청)을 먼저 처리하게 한 번 쉰다 */
  async pause(): Promise<void> {
    if (performance.now() - this.sliceStart < SLICE_MS) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.sliceStart = performance.now();
  }

  /** 가장 좋은 심기. 심을 칸이 없으면 null. 같은 값이면 먼저 본 수(종 → 칸 → 회전 순) */
  async best(speciesList: readonly SpeciesId[], withSeeds: boolean): Promise<Candidate | null> {
    let best: Candidate | null = null;
    const dandelion: Candidate[] = [];
    const s = this.state as GameState;
    for (const sp of new Set(speciesList)) {
      const rots = distinctRotations(sp);
      const seeds = withSeeds && getSpecies(sp).seed > 0;
      for (const pos of legalPlantCells(s, this.playerId, sp)) {
        for (const rotation of rots) {
          await this.pause();
          const v = this.value(sp, pos, rotation, null);
          if (!best || v > best.value) best = { value: v, species: sp, pos, rotation, seed: null };
          if (seeds) dandelion.push({ value: v, species: sp, pos, rotation, seed: null });
        }
      }
    }
    // 안정 정렬: 같은 값이면 먼저 본 순서 (Python sort 와 같다)
    dandelion.sort((a, b) => b.value - a.value);
    for (const d of dandelion.slice(0, SEED_TOP)) {
      for (const x of legalSeedCells(s, d.pos)) {
        await this.pause();
        const v = this.value(d.species, d.pos, d.rotation, x);
        if (!best || v > best.value) best = { ...d, value: v, seed: x };
      }
    }
    return best;
  }
}

function plantAction(playerId: PlayerId, c: Candidate): Action {
  const a: Action = { type: 'PLANT', playerId, species: c.species, pos: c.pos, rotation: c.rotation as 0 };
  return c.seed ? { ...a, seed: c.seed } : a;
}

/** 아직 못 본 카드(카드 더미 + 남의 손) 종별 장수. 전체 − 보드에 심은 카드 − 마켓 − 내 손. 더미 내용은 쓰지 않는다 */
export function unseenCards(state: SearchState, playerId: PlayerId): Map<SpeciesId, number> {
  const copies = rulesFor(state.players.length).copies;
  const left = new Map<SpeciesId, number>(state.species.map((sp) => [sp, copies]));
  const me = state.players.find((p) => p.id === playerId);
  for (const sp of [...state.plants.map((p) => p.species), ...state.market, ...(me?.hand ?? [])]) {
    const n = left.get(sp);
    if (n !== undefined) left.set(sp, n - 1);
  }
  for (const [sp, n] of left) if (n <= 0) left.delete(sp);
  return left;
}

type Key = [number, number];
const keyGreater = (a: Key, b: Key) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);

async function chooseTake(state: SearchState, playerId: PlayerId, deadline: number): Promise<{ take: number | 'pile'; depth: number }> {
  const me = state.players.find((p) => p.id === playerId);
  if (!state.market.length || !me || !state.board) return { take: 0, depth: 0 };
  const ev = new Evaluator(state, playerId, deadline);
  let bestI: number | 'pile' = 0;
  try {
    const noMove = ev.base() - 100;
    const handBest = await ev.best(me.hand, false);
    const handV = handBest ? handBest.value : noMove;
    const ownCache = new Map<SpeciesId, number>();
    // (손 카드와 그 카드 중 최선 + 목표 가산, 그 카드 자체의 1수 가치)
    const cardKey = async (sp: SpeciesId): Promise<Key> => {
      let own = ownCache.get(sp);
      if (own === undefined) {
        own = (await ev.best([sp], false))?.value ?? noMove;
        ownCache.set(sp, own);
      }
      return [Math.max(own, handV) + takeGoalBonus(state.goals, sp), own];
    };
    let bestKey: Key | null = null;
    for (const [i, sp] of state.market.entries()) {
      const k = await cardKey(sp);
      if (!bestKey || keyGreater(k, bestKey)) {
        bestKey = k;
        bestI = i;
      }
    }
    // 서버가 가린 상태는 pile 이 비고 pileCount 만 있다
    const pileN = state.pile.length || ('pileCount' in state ? state.pileCount : 0);
    const unseen = pileN ? unseenCards(state, playerId) : new Map<SpeciesId, number>();
    let total = 0;
    for (const n of unseen.values()) total += n;
    if (total && bestKey) {
      let e0 = 0;
      let e1 = 0;
      for (const [sp, n] of unseen) {
        const k = await cardKey(sp);
        e0 += n * k[0];
        e1 += n * k[1];
      }
      // 1수 탐욕 근사: 마켓 카드를 남겨 두는 손해(다음 사람이 가져감)는 보지 않는다
      if (keyGreater([e0 / total, e1 / total], bestKey)) bestI = 'pile';
    }
  } catch (err) {
    // 더미 기댓값 도중에 끊기면 그때까지의 마켓 최선을 쓴다
    if (err instanceof OutOfTime) return { take: bestI, depth: 0 };
    throw err;
  }
  return { take: bestI, depth: 1 };
}

async function choosePlant(state: SearchState, playerId: PlayerId, deadline: number): Promise<{ action: Action; depth: number }> {
  const me = state.players.find((p) => p.id === playerId)!;
  const discard: Action = { type: 'DISCARD', playerId, species: me.hand[0]! };
  try {
    const best = await new Evaluator(state, playerId, deadline).best(me.hand, true);
    if (!best) return { action: discard, depth: 1 };
    return { action: plantAction(playerId, best), depth: 1 };
  } catch (err) {
    if (!(err instanceof OutOfTime)) throw err;
    return { action: autoAction(state as GameState, playerId) ?? discard, depth: 0 };
  }
}

/** (행동, 깊이, 걸린 시간). 항상 시간 제한 안에 돌려준다. 입력 상태는 바꾸지 않는다 */
export async function decide(state: SearchState, playerId: PlayerId, timeLimitMs: number): Promise<Decision> {
  const start = performance.now();
  const deadline = start + Math.max(50, timeLimitMs * TIME_FRACTION - TIME_MARGIN_MS);
  const me = state.players.find((p) => p.id === playerId);
  const myTurn = state.currentPlayerId === playerId && state.phase === 'playing' && !!state.board && !!me && me.surrenderedOrder === null;
  let action: Action;
  let depth = 0;
  if (myTurn && state.stage === 'take' && state.market.length) {
    const t = await chooseTake(state, playerId, deadline);
    action = { type: 'TAKE', playerId, take: t.take };
    depth = t.depth;
  } else if (myTurn && state.stage === 'plant' && me!.hand.length) {
    ({ action, depth } = await choosePlant(state, playerId, deadline));
  } else {
    // 내 차례가 아니거나 둘 수 없는 상태: 엔진 자동 수, 그것도 없으면 엔진이 거부해도 해가 없는 행동
    action = autoAction(state as GameState, playerId) ?? { type: 'READY', playerId };
  }
  return { action, depth, elapsedMs: Math.round(performance.now() - start) };
}


/** F027: AI 는 2초 이내에 행동을 결정해야 한다 */
export const AI_TIME_LIMIT_MS = 2000;

/**
 * AI 차례 실행기(game/aiTurn.ts)가 부른다. 그 자리가 보는 정보(자기 손만, 카드 더미·시드는 가림)로만 고른다.
 * 예외면 null 을 돌려주고, 재검증과 자동 수 폴백은 실행기 한 곳에서 한다.
 */
export async function requestAiDecision(state: GameState, playerId: PlayerId): Promise<Action | null> {
  try {
    return (await decide(maskState(state, playerId), playerId, AI_TIME_LIMIT_MS)).action;
  } catch (err) {
    console.warn(`[ai] 결정 실패 (${(err as Error).message})`);
    return null;
  }
}
