/**
 * AI 수 결정 (2026-11-25 Python `ai/astral_ai/search.py` 에서 옮김). 2026-11-27 v8 「행동 하나」(Rules.md 5절).
 * 모든 판단은 1수 탐욕: 수를 둔 뒤 "내 총점 − 가장 높은 상대 총점"(margin)이 가장 큰 수를 고른다.
 *  - 행동 고르기: 놓기(손 카드 × 칸 × 회전(× 민들레 씨앗 상위 칸)의 최선) · 명당 부르기(부를 식물 칸 × 방향의 최선) ·
 *    가져오기(지금 margin + TAKE_WEIGHT × 가져온 뒤 손의 최선 놓기 이득 + HAND_WEIGHT × 가져올 장수, 실험실 lab/bots.ts oneCandidates 와 같은 생각)
 *    중 값이 가장 큰 행동. 놓을 칸이 없고 가져오기·부르기도 못 하면 버리기.
 *  - 가져오기 한 장: 마켓 카드마다 "손 카드 + 그 카드로 둘 수 있는 최선 1수 가치 + 공개 목표 연계 가산"을 매기고, 카드 더미 뒷면 1장은
 *    아직 못 본 카드(전체 − 심은 카드 − 마켓 − 내 손) 분포로 낸 기댓값을 매겨 가장 큰 쪽을 고른다. 더미 순서는 보지 않는다.
 * 규칙 계산은 전부 엔진(plantRoots·callRoots·computeScores·legal*)을 부른다(사본 없음).
 * 입력은 그 자리가 보는 가린 상태다(사람과 같은 정보). 시간 제한 안에 끝내지 못하면 그때까지의 최선 또는 엔진 자동 수.
 * 공통 방 코드(@gamehub/net)의 봇(def.bot.next)이 동기 함수라 동기로 돈다. 허브 프로세스를 오래 막지 않도록 봇은 BOT_TIME_LIMIT_MS 로 부른다.
 */
import type { Action, Direction, GameState, GoalId, MaskedGameState, PlayerId, Plant, Position, SpeciesId } from '../engine/index.js';
import {
  FLOWER_SPECIES,
  FOREST_SPECIES,
  HAND_MAX,
  TAKE_COUNT,
  autoAction,
  callRoots,
  canTake,
  computeScores,
  distinctRotations,
  getGoal,
  getSpecies,
  legalCallCells,
  legalPlantCells,
  legalSeedCells,
  maskState,
  plantRoots,
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

// 행동 고르기 가중치 (AI 휴리스틱, 실험실 lab/bots.ts 의 TAKE_W·HAND_W 와 같은 값)
/** 가져오기: 가져온 뒤 손의 최선 놓기 이득에 곱한다(나중에 놓으므로 깎는다) */
const TAKE_WEIGHT = 0.6;
/** 가져오기: 손에 드는 카드 한 장의 값 */
const HAND_WEIGHT = 0.4;
/** 버리기의 값 = 지금 margin − 이만큼 (다른 행동이 없을 때만 고른다) */
const DISCARD_PENALTY = 1;

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

  value(species: SpeciesId, pos: Position, rotation: number, seed: Position | null): number {
    this.tick();
    const plant: Plant = { id: 'ai', species, ownerId: this.playerId, pos, rotation: rotation as Direction };
    const plants = [...this.state.plants, plant];
    const next = { ...this.state, plants };
    const r = plantRoots(next, this.playerId, species, pos, rotation, seed);
    return this.margin({ ...next, rootSeat: r.rootSeat, rootCount: r.rootCount });
  }

  /** 가장 좋은 심기. 심을 칸이 없으면 null. 같은 값이면 먼저 본 수(종 → 칸 → 회전 순) */
  best(speciesList: readonly SpeciesId[], withSeeds: boolean): Candidate | null {
    let best: Candidate | null = null;
    const dandelion: Candidate[] = [];
    const s = this.state as GameState;
    for (const sp of new Set(speciesList)) {
      const rots = distinctRotations(sp);
      const seeds = withSeeds && getSpecies(sp).seed > 0;
      for (const pos of legalPlantCells(s, this.playerId, sp)) {
        for (const rotation of rots) {
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
        const v = this.value(d.species, d.pos, d.rotation, x);
        if (!best || v > best.value) best = { ...d, value: v, seed: x };
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
type Take = number | 'pile';

/** 카드 값 (손 카드와 그 카드 중 최선 + 목표 가산, 그 카드 자체의 1수 가치). 같은 종은 한 번만 잰다 */
function cardKeys(state: SearchState, ev: Evaluator, hand: readonly SpeciesId[]): (sp: SpeciesId) => Key {
  const noMove = ev.base() - 100;
  const handBest = ev.best(hand, false);
  const handV = handBest ? handBest.value : noMove;
  const ownCache = new Map<SpeciesId, number>();
  return (sp) => {
    let own = ownCache.get(sp);
    if (own === undefined) {
      own = ev.best([sp], false)?.value ?? noMove;
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

/** 가져오기 한 장의 고르기와 그 카드 값(카드 값의 첫 요소). 카드가 없으면 key 는 null */
function pickTake(state: SearchState, playerId: PlayerId, ev: Evaluator): { take: Take; key: Key | null } {
  const me = state.players.find((p) => p.id === playerId)!;
  let take: Take = state.market.length ? 0 : 'pile';
  const cardKey = cardKeys(state, ev, me.hand);
  const m = bestMarketIndex(state, cardKey);
  let bestKey = m.key;
  if (bestKey) take = m.index;
  // 서버가 가린 상태는 pile 이 비고 pileCount 만 있다
  const pileN = pileCountOf(state);
  const unseen = pileN ? unseenCards(state, playerId) : new Map<SpeciesId, number>();
  let total = 0;
  for (const n of unseen.values()) total += n;
  if (total) {
    let e0 = 0;
    let e1 = 0;
    for (const [sp, n] of unseen) {
      const k = cardKey(sp);
      e0 += n * k[0];
      e1 += n * k[1];
    }
    const pileKey: Key = [e0 / total, e1 / total];
    // 1수 탐욕 근사: 마켓 카드를 남겨 두는 손해(다음 사람이 가져감)는 보지 않는다
    if (!bestKey || keyGreater(pileKey, bestKey)) {
      take = 'pile';
      bestKey = pileKey;
    }
  }
  return { take, key: bestKey };
}

/** 카드 더미 장수 (가린 상태는 pileCount) */
const pileCountOf = (state: SearchState): number => state.pile.length || ('pileCount' in state ? state.pileCount : 0);

/** 가져오기 한 장을 할 수 있는가 (가린 상태 포함) */
const takeOk = (state: SearchState, playerId: PlayerId): boolean => canTake({ players: state.players, market: state.market, pile: state.pile, pileCount: pileCountOf(state) }, playerId);

function chooseTake(state: SearchState, playerId: PlayerId, deadline: number): { take: Take; depth: number } {
  const fallback: Take = state.market.length ? 0 : 'pile';
  try {
    return { take: pickTake(state, playerId, new Evaluator(state, playerId, deadline)).take, depth: 1 };
  } catch (err) {
    if (err instanceof OutOfTime) return { take: fallback, depth: 0 };
    throw err;
  }
}

/** 행동 후보 */
export interface ActCandidate {
  action: Action;
  value: number;
}

/**
 * 행동 고르기 후보 (Rules.md 5.1): 놓기 · 명당 부르기 · 가져오기(첫 장)마다 값을 매긴다.
 * 놓을 칸이 없고 가져오기·부르기도 못 하면 버리기 하나
 */
export function actCandidates(state: SearchState, playerId: PlayerId, deadline: number): ActCandidate[] {
  const me = state.players.find((p) => p.id === playerId)!;
  const ev = new Evaluator(state, playerId, deadline);
  const base = ev.base();
  const out: ActCandidate[] = [];
  const plant = me.hand.length ? ev.best(me.hand, true) : null;
  if (plant) out.push({ action: plantAction(playerId, plant), value: plant.value });
  const call = ev.bestCall();
  if (call) out.push({ action: { type: 'CALL', playerId, pos: call.pos, rotation: call.rotation }, value: call.value });
  if (takeOk(state, playerId)) {
    const t = pickTake(state, playerId, ev);
    const handGain = plant ? plant.value - base : 0;
    const gain = Math.max(0, handGain, t.key ? t.key[0] - base : 0);
    const n = Math.min(TAKE_COUNT, HAND_MAX - me.hand.length);
    out.push({ action: { type: 'TAKE', playerId, take: t.take }, value: base + TAKE_WEIGHT * gain + HAND_WEIGHT * n });
  }
  if (!out.length && me.hand.length) out.push({ action: { type: 'DISCARD', playerId, species: me.hand[0]! }, value: base - DISCARD_PENALTY });
  return out;
}

/** 가장 값이 큰 행동. 같은 값이면 먼저 넣은 후보(놓기 → 부르기 → 가져오기) */
function chooseAct(state: SearchState, playerId: PlayerId, deadline: number): { action: Action | null; depth: number } {
  try {
    let best: ActCandidate | null = null;
    for (const c of actCandidates(state, playerId, deadline)) if (!best || c.value > best.value) best = c;
    return { action: best?.action ?? null, depth: best ? 1 : 0 };
  } catch (err) {
    if (!(err instanceof OutOfTime)) throw err;
    return { action: null, depth: 0 };
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
    if (state.stage === 'take') {
      if (takeOk(state, playerId)) {
        const t = chooseTake(state, playerId, deadline);
        action = { type: 'TAKE', playerId, take: t.take };
        depth = t.depth;
      }
    } else ({ action, depth } = chooseAct(state, playerId, deadline));
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
