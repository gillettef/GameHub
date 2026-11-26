/**
 * AI 수 결정 (2026-11-25 Python `ai/astral_ai/search.py` 에서 옮김). 2026-11-26 v7 「골목 일과」(Rules.md 5절)를 더했다.
 * 모든 판단은 1수 탐욕: 수를 둔 뒤 "내 총점 − 가장 높은 상대 총점"(margin)이 가장 큰 수를 고른다.
 *  - 일과 고르기: 남은 일과마다 "그 일과로 이번 차례에 둘 수 있는 최선 1수 값"을 추정해 가장 큰 일과(실험실 lab/bots.ts choreValue 와 같은 생각).
 *    명당을 놓는 일과는 손 ∪ 마켓 카드로 둘 수 있는 최선 심기(식빵 굽기는 심은 칸 +1, 마실은 마실 칸 포함), 대장 방울·생선 냄새는 작은 가산.
 *    담 넘기는 탐욕 두 번 이동, 명당 부르기는 최선 부르기(+ 마켓 카드를 가져올 수 있으면 가산).
 *  - 가져오기: 마켓 카드마다 "손 카드 + 그 카드로 둘 수 있는 최선 1수 가치 + 공개 목표 연계 가산"을 매기고, 카드 더미 뒷면 1장은
 *    아직 못 본 카드(전체 − 심은 카드 − 마켓 − 내 손 − 생선 냄새로 편 카드) 분포로 낸 기댓값을 매겨 가장 큰 쪽을 고른다. 더미 순서는 보지 않는다.
 *    생선 냄새 차례에는 편 카드도 후보이고 더미 뒷면은 후보가 아니다.
 *  - 심기: 손 카드 × 칸 × 회전(× 민들레 씨앗 상위 칸). 고른 일과(식빵 굽기·마실)를 반영한다.
 *  - 담 넘기: (출발 칸 × 맞닿은 칸 × 1~2개) 중 최선 한 번, 그 뒤 두 번째 최선이 더 좋으면 두 번.
 *  - 명당 부르기: 부를 수 있는 식물 칸 × 서로 다른 방향 중 최선, 가져올 마켓 카드는 가져오기와 같은 카드 값으로.
 * 규칙 계산은 전부 엔진(plantRoots·moveRoots·callRoots·computeScores·legal*)을 부른다(사본 없음).
 * 입력은 그 자리가 보는 가린 상태다(사람과 같은 정보). 시간 제한 안에 끝내지 못하면 그때까지의 최선 또는 엔진 자동 수.
 * 공통 방 코드(@gamehub/net)의 봇(def.bot.next)이 동기 함수라 동기로 돈다. 허브 프로세스를 오래 막지 않도록 봇은 BOT_TIME_LIMIT_MS 로 부른다.
 */
import type { Action, ChoreId, Direction, GameState, GoalId, MaskedGameState, MoveStep, PlayerId, Plant, Position, SpeciesId } from '../engine/index.js';
import {
  BREAD_BONUS,
  FLOWER_SPECIES,
  FOREST_SPECIES,
  HAND_MAX,
  MOVE_MAX,
  MOVE_TIMES,
  autoAction,
  callRoots,
  computeScores,
  distinctRotations,
  getGoal,
  getSpecies,
  isPlaceChore,
  legalCallCells,
  legalMoveSources,
  legalMoveTargets,
  legalPlantCells,
  legalSeedCells,
  maskState,
  moveRoots,
  plantRoots,
  remainingChores,
  rulesFor,
  samePos,
} from '../engine/index.js';

/** 탐색 시간 예산: 제한 시간 중 이 비율에서 여유(ms)를 뺀다 */
const TIME_FRACTION = 0.6;
const TIME_MARGIN_MS = 150;
/** 민들레 씨앗 칸을 따로 펼쳐 볼 상위 (칸, 회전) 수 */
const SEED_TOP = 3;

// 가져오기 목표 연계 가산 (AI 휴리스틱. 규칙 수치가 아니라 AI 선호도라 여기 둔다)
const RESERVE_TAKE_BONUS = 2;
const FLOWER_TAKE_BONUS = 1;
const FOREST_TAKE_BONUS = 1;

// 일과 고르기 가산 (AI 휴리스틱, 실험실 lab/bots.ts 의 BOSS_W·peek 0.1·callTake 0.6 과 같은 값)
/** 대장 방울: 다음 라운드 선 */
const BOSS_PICK_BONUS = 0.2;
/** 생선 냄새: 카드 하나를 더 보고 고른다 */
const PEEK_PICK_BONUS = 0.1;
/** 명당 부르기: 마켓 카드도 손에 */
const CALL_TAKE_BONUS = 0.6;
/** 둘 수 없는 일과의 값 = 지금 margin − 이만큼 */
const IDLE_PENALTY = 1;

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

/** 심기 조건: 식빵 굽기 칸 보너스, 마실 칸 */
interface PlantOpts {
  bonus: number;
  roam: boolean;
}

const plantOptsFor = (chore: ChoreId | null | undefined): PlantOpts => ({ bonus: chore === 'bread' ? BREAD_BONUS : 0, roam: chore === 'roam' });

type RootState = Pick<GameState, 'board' | 'plants' | 'players' | 'rootSeat' | 'rootCount' | 'goals'>;

/** 한 상태에서 여러 수를 시험한다. 상태는 바꾸지 않는다 */
class Evaluator {
  readonly seat: number;
  private readonly rivals: number[];

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

  private tick(): void {
    if (performance.now() >= this.deadline) throw new OutOfTime();
  }

  /** 내 총점 − 가장 높은 상대 총점 */
  margin(s: RootState): number {
    const scores = computeScores(s);
    const total = (seat: number) => scores[this.state.players.find((p) => p.seat === seat)!.id]!.total;
    return total(this.seat) - (this.rivals.length ? Math.max(...this.rivals.map(total)) : 0);
  }

  base(): number {
    return this.margin(this.state);
  }

  value(species: SpeciesId, pos: Position, rotation: number, seed: Position | null, bonus = 0): number {
    this.tick();
    const plant: Plant = { id: 'ai', species, ownerId: this.playerId, pos, rotation: rotation as Direction };
    const plants = [...this.state.plants, plant];
    const next = { ...this.state, plants };
    const r = plantRoots(next, this.playerId, species, pos, rotation, seed, bonus);
    return this.margin({ ...next, rootSeat: r.rootSeat, rootCount: r.rootCount });
  }

  /** 가장 좋은 심기. 심을 칸이 없으면 null. 같은 값이면 먼저 본 수(종 → 칸 → 회전 순) */
  best(speciesList: readonly SpeciesId[], withSeeds: boolean, opts: PlantOpts): Candidate | null {
    let best: Candidate | null = null;
    const dandelion: Candidate[] = [];
    const s = this.state as GameState;
    for (const sp of new Set(speciesList)) {
      const rots = distinctRotations(sp);
      const seeds = withSeeds && getSpecies(sp).seed > 0;
      for (const pos of legalPlantCells(s, this.playerId, sp, opts.roam)) {
        for (const rotation of rots) {
          const v = this.value(sp, pos, rotation, null, opts.bonus);
          if (!best || v > best.value) best = { value: v, species: sp, pos, rotation, seed: null };
          if (seeds) dandelion.push({ value: v, species: sp, pos, rotation, seed: null });
        }
      }
    }
    // 안정 정렬: 같은 값이면 먼저 본 순서 (Python sort 와 같다)
    dandelion.sort((a, b) => b.value - a.value);
    for (const d of dandelion.slice(0, SEED_TOP)) {
      for (const x of legalSeedCells(s, d.pos)) {
        const v = this.value(d.species, d.pos, d.rotation, x, opts.bonus);
        if (!best || v > best.value) best = { ...d, value: v, seed: x };
      }
    }
    return best;
  }

  /** 담 넘기 최선: 탐욕으로 한 번, 두 번째가 더 좋으면 두 번. 옮길 수 없으면 null */
  bestMove(): { moves: MoveStep[]; value: number } | null {
    const s = this.state as GameState;
    const first = this.bestStep(s);
    if (!first) return null;
    const after = { ...s, ...moveRoots(s, this.playerId, first.step.from, first.step.to, first.step.count) };
    const second = MOVE_TIMES >= 2 ? this.bestStep(after) : null;
    if (second && second.value > first.value) return { moves: [first.step, second.step], value: second.value };
    return { moves: [first.step], value: first.value };
  }

  private bestStep(s: GameState): { step: MoveStep; value: number } | null {
    let best: { step: MoveStep; value: number } | null = null;
    const cells = s.board!.cells;
    for (const from of legalMoveSources(s, this.playerId)) {
      const c = cells.findIndex((x) => x.q === from.q && x.r === from.r);
      const have = s.rootSeat[c] === this.seat ? (s.rootCount[c] ?? 0) : 0;
      for (const to of legalMoveTargets(s, from)) {
        for (let count = 1; count <= Math.min(MOVE_MAX, have); count++) {
          this.tick();
          const v = this.margin({ ...s, ...moveRoots(s, this.playerId, from, to, count) });
          if (!best || v > best.value) best = { step: { from, to, count }, value: v };
        }
      }
    }
    return best;
  }

  /** 명당 부르기 최선 (칸 × 서로 다른 방향). 부를 식물이 없으면 null */
  bestCall(): { pos: Position; rotation: Direction; value: number } | null {
    const s = this.state as GameState;
    let best: { pos: Position; rotation: Direction; value: number } | null = null;
    for (const pos of legalCallCells(s, this.playerId)) {
      const plant = s.plants.find((p) => samePos(p.pos, pos))!;
      // 지금 방향을 먼저 본다: 같은 값이면 방향을 바꾸지 않는다
      const rots = [plant.rotation, ...distinctRotations(plant.species).filter((r) => r !== plant.rotation)];
      for (const rotation of rots) {
        this.tick();
        const r = callRoots(s, this.playerId, pos, rotation);
        const v = this.margin({ ...s, rootSeat: r.rootSeat, rootCount: r.rootCount });
        if (!best || v > best.value) best = { pos, rotation, value: v };
      }
    }
    return best;
  }
}

function plantAction(playerId: PlayerId, c: Candidate): Action {
  const a: Action = { type: 'PLANT', playerId, species: c.species, pos: c.pos, rotation: c.rotation as 0 };
  return c.seed ? { ...a, seed: c.seed } : a;
}

/** 아직 못 본 카드(카드 더미 + 남의 손) 종별 장수. 전체 − 보드에 심은 카드 − 마켓 − 생선 냄새로 편 카드 − 내 손. 더미 내용은 쓰지 않는다 */
export function unseenCards(state: SearchState, playerId: PlayerId): Map<SpeciesId, number> {
  const copies = rulesFor(state.players.length).copies;
  const left = new Map<SpeciesId, number>(state.species.map((sp) => [sp, copies]));
  const me = state.players.find((p) => p.id === playerId);
  const peek = state.peek ? [state.peek] : [];
  for (const sp of [...state.plants.map((p) => p.species), ...state.market, ...peek, ...(me?.hand ?? [])]) {
    const n = left.get(sp);
    if (n !== undefined) left.set(sp, n - 1);
  }
  for (const [sp, n] of left) if (n <= 0) left.delete(sp);
  return left;
}

type Key = [number, number];
const keyGreater = (a: Key, b: Key) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
type Take = number | 'pile' | 'peek';

/** 카드 값 (손 카드와 그 카드 중 최선 + 목표 가산, 그 카드 자체의 1수 가치). 같은 종은 한 번만 잰다 */
function cardKeys(state: SearchState, ev: Evaluator, hand: readonly SpeciesId[], opts: PlantOpts): (sp: SpeciesId) => Key {
  const noMove = ev.base() - 100;
  const handBest = ev.best(hand, false, opts);
  const handV = handBest ? handBest.value : noMove;
  const ownCache = new Map<SpeciesId, number>();
  return (sp) => {
    let own = ownCache.get(sp);
    if (own === undefined) {
      own = ev.best([sp], false, opts)?.value ?? noMove;
      ownCache.set(sp, own);
    }
    return [Math.max(own, handV) + takeGoalBonus(state.goals, sp), own];
  };
}

/** 마켓 카드 중 카드 값이 가장 큰 번호 (같으면 앞 번호) */
function bestMarketIndex(state: SearchState, cardKey: (sp: SpeciesId) => Key): { index: number; key: Key | null } {
  let index = 0;
  let key: Key | null = null;
  for (const [i, sp] of state.market.entries()) {
    const k = cardKey(sp);
    if (!key || keyGreater(k, key)) {
      key = k;
      index = i;
    }
  }
  return { index, key };
}

function chooseTake(state: SearchState, playerId: PlayerId, deadline: number): { take: Take; depth: number } {
  const me = state.players.find((p) => p.id === playerId);
  if (!me || !state.board) return { take: 0, depth: 0 };
  const chore = state.chores[me.seat] ?? null;
  // 마켓이 비고 편 카드만 남는 일은 없지만(더미가 비면 편 카드도 없다) 만일을 위해
  let bestI: Take = state.market.length ? 0 : 'peek';
  const ev = new Evaluator(state, playerId, deadline);
  try {
    const cardKey = cardKeys(state, ev, me.hand, plantOptsFor(chore));
    const m = bestMarketIndex(state, cardKey);
    let bestKey = m.key;
    if (bestKey) bestI = m.index;
    if (state.peek) {
      const k = cardKey(state.peek);
      if (!bestKey || keyGreater(k, bestKey)) {
        bestKey = k;
        bestI = 'peek';
      }
    }
    // 서버가 가린 상태는 pile 이 비고 pileCount 만 있다. 생선 냄새 차례에는 더미 뒷면을 가져올 수 없다
    const pileN = chore === 'peek' ? 0 : state.pile.length || ('pileCount' in state ? state.pileCount : 0);
    const unseen = pileN ? unseenCards(state, playerId) : new Map<SpeciesId, number>();
    let total = 0;
    for (const n of unseen.values()) total += n;
    if (total && bestKey) {
      let e0 = 0;
      let e1 = 0;
      for (const [sp, n] of unseen) {
        const k = cardKey(sp);
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

function choosePlant(state: SearchState, playerId: PlayerId, deadline: number): { action: Action; depth: number } {
  const me = state.players.find((p) => p.id === playerId)!;
  const discard: Action = { type: 'DISCARD', playerId, species: me.hand[0]! };
  try {
    const best = new Evaluator(state, playerId, deadline).best(me.hand, true, plantOptsFor(state.chores[me.seat]));
    if (!best) return { action: discard, depth: 1 };
    return { action: plantAction(playerId, best), depth: 1 };
  } catch (err) {
    if (!(err instanceof OutOfTime)) throw err;
    return { action: autoAction(state as GameState, playerId) ?? discard, depth: 0 };
  }
}

function chooseMove(state: SearchState, playerId: PlayerId, deadline: number): { action: Action | null; depth: number } {
  try {
    const best = new Evaluator(state, playerId, deadline).bestMove();
    if (best) return { action: { type: 'MOVE', playerId, moves: best.moves }, depth: 1 };
  } catch (err) {
    if (!(err instanceof OutOfTime)) throw err;
  }
  return { action: null, depth: 0 };
}

const canTakeAfterCall = (state: SearchState, playerId: PlayerId) => {
  const me = state.players.find((p) => p.id === playerId);
  return !!me && me.hand.length < HAND_MAX && state.market.length > 0;
};

function chooseCall(state: SearchState, playerId: PlayerId, deadline: number): { action: Action | null; depth: number } {
  const me = state.players.find((p) => p.id === playerId)!;
  try {
    const ev = new Evaluator(state, playerId, deadline);
    const best = ev.bestCall();
    if (!best) return { action: null, depth: 0 };
    const action: Extract<Action, { type: 'CALL' }> = { type: 'CALL', playerId, pos: best.pos, rotation: best.rotation };
    if (!canTakeAfterCall(state, playerId)) return { action, depth: 1 };
    // 가져올 카드는 부르기 전 보드 기준 카드 값으로 고른다(다음 차례에 심을 카드). 시간이 모자라면 마켓 맨 앞
    action.take = 0;
    try {
      action.take = bestMarketIndex(state, cardKeys(state, ev, me.hand, plantOptsFor(null))).index;
    } catch (err) {
      if (!(err instanceof OutOfTime)) throw err;
    }
    return { action, depth: 1 };
  } catch (err) {
    if (!(err instanceof OutOfTime)) throw err;
  }
  return { action: null, depth: 0 };
}

/**
 * 일과마다 이번 차례 최선 1수 값 추정 (실험실 lab/bots.ts choreValue). 명당을 놓는 일과는 손 ∪ 마켓 카드로 둘 수 있는 최선 심기
 * (가져올 카드 하나 + 손 카드 중 하나를 심으므로 합집합 중 최선과 같다). 둘 수 없으면 지금 margin − IDLE_PENALTY
 */
export function choreValues(state: SearchState, playerId: PlayerId, chores: readonly ChoreId[], deadline: number): number[] {
  const me = state.players.find((p) => p.id === playerId)!;
  const ev = new Evaluator(state, playerId, deadline);
  const idle = ev.base() - IDLE_PENALTY;
  const cards = [...new Set([...me.hand, ...state.market])];
  const placeCache = new Map<string, number | null>();
  const place = (opts: PlantOpts): number | null => {
    const key = `${opts.bonus}:${opts.roam}`;
    if (!placeCache.has(key)) placeCache.set(key, ev.best(cards, false, opts)?.value ?? null);
    return placeCache.get(key) as number | null;
  };
  return chores.map((c) => {
    if (isPlaceChore(c)) {
      const v = place(plantOptsFor(c));
      if (v === null) return idle;
      return v + (c === 'boss' ? BOSS_PICK_BONUS : 0) + (c === 'peek' ? PEEK_PICK_BONUS : 0);
    }
    if (c === 'move') return ev.bestMove()?.value ?? idle;
    const call = ev.bestCall();
    return call ? call.value + (canTakeAfterCall(state, playerId) ? CALL_TAKE_BONUS : 0) : idle;
  });
}

function chooseChore(state: SearchState, playerId: PlayerId, deadline: number): { chore: ChoreId; depth: number } {
  const left = remainingChores(state);
  try {
    const vals = choreValues(state, playerId, left, deadline);
    let best = 0;
    vals.forEach((v, i) => v > (vals[best] as number) && (best = i));
    return { chore: left[best] as ChoreId, depth: 1 };
  } catch (err) {
    if (!(err instanceof OutOfTime)) throw err;
    return { chore: left[0] as ChoreId, depth: 0 };
  }
}

/** (행동, 깊이, 걸린 시간). 항상 시간 제한 안에 돌려준다. 입력 상태는 바꾸지 않는다 */
export function decide(state: SearchState, playerId: PlayerId, timeLimitMs: number): Decision {
  const start = performance.now();
  const deadline = start + Math.max(50, timeLimitMs * TIME_FRACTION - TIME_MARGIN_MS);
  const me = state.players.find((p) => p.id === playerId);
  const myTurn = state.currentPlayerId === playerId && state.phase === 'playing' && !!state.board && !!me && me.surrenderedOrder === null;
  let action: Action | null = null;
  let depth = 0;
  if (myTurn) {
    switch (state.stage) {
      case 'chore':
        if (remainingChores(state).length) {
          const c = chooseChore(state, playerId, deadline);
          action = { type: 'PICK_CHORE', playerId, chore: c.chore };
          depth = c.depth;
        }
        break;
      case 'take':
        if (state.market.length || state.peek) {
          const t = chooseTake(state, playerId, deadline);
          action = { type: 'TAKE', playerId, take: t.take };
          depth = t.depth;
        }
        break;
      case 'plant':
        if (me!.hand.length) ({ action, depth } = choosePlant(state, playerId, deadline));
        break;
      case 'move':
        ({ action, depth } = chooseMove(state, playerId, deadline));
        break;
      case 'call':
        ({ action, depth } = chooseCall(state, playerId, deadline));
        break;
    }
  }
  // 내 차례가 아니거나 둘 수 없는 상태·시간 초과: 엔진 자동 수, 그것도 없으면 엔진이 거부해도 해가 없는 행동
  action ??= autoAction(state as GameState, playerId) ?? { type: 'READY', playerId };
  return { action, depth, elapsedMs: Math.round(performance.now() - start) };
}

/** F027: AI 는 2초 이내에 행동을 결정해야 한다 */
export const AI_TIME_LIMIT_MS = 2000;
/** 서버(허브 한 프로세스, t4g.nano)의 봇 한 수. 탐색 예산은 이 값의 60% − 150ms = 450ms 이고, 넘으면 그때까지의 최선 또는 자동 수 */
export const BOT_TIME_LIMIT_MS = 1000;

/**
 * 봇(def.bot)이 부른다. 그 자리가 보는 정보(자기 손만, 카드 더미·시드는 가림)로만 고른다.
 * 예외면 null 을 돌려주고, 재검증과 자동 수 폴백은 공통 진행 코드(def.bot.fallback)가 한다.
 */
export function requestAiDecision(state: GameState, playerId: PlayerId, timeLimitMs = BOT_TIME_LIMIT_MS): Action | null {
  try {
    return decide(maskState(state, playerId), playerId, timeLimitMs).action;
  } catch (err) {
    console.warn(`[ai] 결정 실패 (${(err as Error).message})`);
    return null;
  }
}
