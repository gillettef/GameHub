/**
 * 로비 → 드래프트 → 차례 진행 → 종료 (Rules.md 4·5·6·9절).
 * 순수 함수. `applyAction(state, action) => { state, error? }`. 입력 state 를 변이하지 않는다.
 */
import { GOAL_COUNT, HAND_SIZE, MAX_PLAYERS, MIN_PLAYERS, rulesFor } from '../data/constants.js';
import { GOALS, GOAL_EXCLUSIONS, SPECIES_IDS, getGoal, getSpecies, isSpeciesId } from '../data/species.js';
import type { Action, Direction, GameLogEntry, GameResultReason, GameState, GoalId, LogKind, PlayerId, PlayerKind, PlayerState, Position, SpeciesId } from '../types/index.js';
import { buildBoard, hexDistance, isDirection, samePos } from './board.js';
import { computeInfluence, legalDirections, legalPlantCells, legalSeedCells } from './influence.js';
import { shuffle } from './rng.js';
import { computeRanking, computeScores, landCounts } from './scoring.js';

export interface ActionResult {
  state: GameState;
  /** 거부됐으면 사유. 거부 시 state 는 입력과 같다 */
  error?: string;
}

const reject = (state: GameState, error: string): ActionResult => ({ state, error });

// ---------------------------------------------------------------------------
// 로비
// ---------------------------------------------------------------------------

/**
 * deckSeed 는 덱 셔플 전용이다(Rules.md 11절). 온라인에서는 서버가 boardSeed 와 독립인 암호학적 난수를 넣어야
 * 공개 보드·목표로 손패를 역산할 수 없다. 생략하면(핫시트·테스트) boardSeed 에서 만든다
 */
export function createInitialState(roomId: string, rngSeed: number, deckSeed: number = (rngSeed ^ 0x9e3779b9) >>> 0): GameState {
  return {
    roomId,
    phase: 'lobby',
    board: null,
    goals: [],
    draftOrder: [],
    draftIndex: 0,
    round: 0,
    turn: 0,
    currentPlayerId: null,
    players: [],
    plants: [],
    seeds: [],
    rngSeed: rngSeed >>> 0,
    deckSeed: deckSeed >>> 0,
    result: null,
    log: [],
  };
}

export function createPlayer(id: PlayerId, nickname: string, kind: PlayerKind = 'human'): PlayerState {
  return { id, nickname, kind, seat: 0, isReady: kind === 'ai', drafted: [], deck: [], hand: [], surrenderedOrder: null };
}

export function joinPlayer(state: GameState, player: PlayerState): ActionResult {
  if (state.phase !== 'lobby') return reject(state, '이미 시작된 게임입니다');
  if (state.players.length >= MAX_PLAYERS) return reject(state, `정원은 최대 ${MAX_PLAYERS}명입니다`);
  if (state.players.some((p) => p.id === player.id)) return reject(state, '이미 입장한 플레이어입니다');
  const joined = { ...player, seat: state.players.length };
  // 인원이 바뀌면 사람의 준비를 푼다: 준비해 둔 방장이 AI 를 하나 넣자마자 2인 판이 시작되거나,
  // "전원 준비"인데 시작되지 않는 상태가 생기지 않게 한다(AI 는 늘 준비 상태)
  let s: GameState = { ...state, players: [...resetHumanReady(state.players), joined] };
  s = addLog(s, 'system', joined.id, `${joined.nickname} 입장`);
  return { state: s };
}

export function leaveLobby(state: GameState, playerId: PlayerId): ActionResult {
  if (state.phase !== 'lobby') return reject(state, '게임 중에는 나갈 수 없습니다. 기권하세요');
  const leaving = state.players.find((p) => p.id === playerId);
  if (!leaving) return reject(state, '방에 없는 플레이어입니다');
  const players = resetHumanReady(state.players.filter((p) => p.id !== playerId)).map((p, seat) => ({ ...p, seat }));
  return { state: addLog({ ...state, players }, 'system', null, `${leaving.nickname} 퇴장`) };
}

const resetHumanReady = (players: PlayerState[]): PlayerState[] => players.map((p) => (p.kind === 'human' ? { ...p, isReady: false } : p));

// ---------------------------------------------------------------------------
// 공용 도우미
// ---------------------------------------------------------------------------

export function addLog(state: GameState, kind: LogKind, playerId: PlayerId | null, message: string): GameState {
  const entry: GameLogEntry = { turn: state.turn, round: state.round, playerId, kind, message };
  return { ...state, log: [...state.log, entry] };
}

export function nameOf(state: Pick<GameState, 'players'>, playerId: PlayerId): string {
  return state.players.find((p) => p.id === playerId)?.nickname ?? playerId;
}

export function getPlayer(state: GameState, playerId: PlayerId): PlayerState | undefined {
  return state.players.find((p) => p.id === playerId);
}

function updatePlayer(state: GameState, playerId: PlayerId, patch: Partial<PlayerState>): GameState {
  return { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)) };
}

const posText = (p: Position) => `(${p.q},${p.r})`;

// ---------------------------------------------------------------------------
// 시작: 보드 → 목표 → 드래프트 순서 (Rules.md 4절, 11절 난수 순서)
// ---------------------------------------------------------------------------

/** 18장을 섞고 앞에서부터 3장씩 끊어 조건(종 연계 1장 이상, 배제 쌍 없음)을 만족하는 첫 묶음 */
export function pickGoals(seed: number): { goals: GoalId[]; seed: number } {
  let s = seed;
  for (;;) {
    const r = shuffle(GOALS.map((g) => g.id), s);
    s = r.seed;
    for (let i = 0; i + GOAL_COUNT <= r.items.length; i += GOAL_COUNT) {
      const chunk = r.items.slice(i, i + GOAL_COUNT);
      if (!chunk.some((g) => getGoal(g).species !== null)) continue;
      if (GOAL_EXCLUSIONS.some(([a, b]) => chunk.includes(a) && chunk.includes(b))) continue;
      return { goals: chunk, seed: s };
    }
  }
}

/** 뱀 순서 드래프트 픽 순서 (좌석 id 목록) */
export function draftSequence(state: GameState): PlayerId[] {
  const rule = rulesFor(state.players.length);
  const bySeat = [...state.players].sort((a, b) => a.seat - b.seat).map((p) => p.id);
  const first = rule.draftFirstRound.map((seat) => bySeat[seat] as PlayerId);
  const order: PlayerId[] = [];
  for (let round = 0; round < rule.picks; round++) order.push(...(round % 2 === 0 ? first : [...first].reverse()));
  return order;
}

/** 로비에서 2명 이상이 모두 준비했으면 시작한다. 아니면 그대로 */
export function maybeStart(state: GameState): GameState {
  if (state.phase !== 'lobby' || state.players.length < MIN_PLAYERS || !state.players.every((p) => p.isReady)) return state;
  return startGame(state);
}

export function startGame(state: GameState): GameState {
  const P = state.players.length;
  const built = buildBoard(P, state.rngSeed);
  const goals = pickGoals(built.seed);
  let s: GameState = {
    ...state,
    phase: 'drafting',
    board: built.board,
    goals: goals.goals,
    rngSeed: goals.seed,
    draftIndex: 0,
    round: 0,
    turn: 0,
    plants: [],
    seeds: [],
    result: null,
    players: state.players.map((p) => ({ ...p, drafted: [], deck: [], hand: [], surrenderedOrder: null })),
  };
  s = { ...s, draftOrder: draftSequence(s) };
  s = { ...s, currentPlayerId: s.draftOrder[0] ?? null };
  s = addLog(s, 'system', null, `게임 시작: 목표 ${goals.goals.map((g) => getGoal(g).name).join(' · ')}`);
  return s;
}

/** 드래프트에서 이 플레이어가 지금 고를 수 있는 종 (표 순서) */
export function draftOptions(state: GameState, playerId: PlayerId): SpeciesId[] {
  if (state.phase !== 'drafting' || state.currentPlayerId !== playerId) return [];
  const me = getPlayer(state, playerId);
  if (!me) return [];
  const max = rulesFor(state.players.length).maxTakers;
  return SPECIES_IDS.filter((s) => !me.drafted.includes(s) && state.players.filter((p) => p.drafted.includes(s)).length < max);
}

function finishDraft(state: GameState): GameState {
  const rule = rulesFor(state.players.length);
  let seed = state.deckSeed;
  const players = [...state.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => {
      const r = shuffle(p.drafted.flatMap((s) => new Array<SpeciesId>(rule.copies).fill(s)), seed);
      seed = r.seed;
      return { ...p, hand: r.items.slice(0, HAND_SIZE), deck: r.items.slice(HAND_SIZE) };
    });
  const first = players[0] as PlayerState;
  let s: GameState = { ...state, phase: 'playing', players, deckSeed: seed, round: 1, turn: 1, currentPlayerId: first.id };
  s = addLog(s, 'turn', first.id, `${first.nickname}의 차례`);
  return s;
}

// ---------------------------------------------------------------------------
// 진행
// ---------------------------------------------------------------------------

const canAct = (p: PlayerState) => p.surrenderedOrder === null && p.hand.length > 0;

/** 손패의 어떤 카드라도 심을 칸이 있는가 */
export function hasAnyPlant(state: GameState, playerId: PlayerId): boolean {
  const me = getPlayer(state, playerId);
  if (!me || !state.board) return false;
  const inf = computeInfluence(state);
  return [...new Set(me.hand)].some((s) => legalPlantCells(state, playerId, s, inf).length > 0);
}

function finishGame(state: GameState, reason: GameResultReason): GameState {
  const scores = computeScores(state);
  const ranking = computeRanking(state, scores);
  const winner = ranking[0] ?? null;
  let s: GameState = { ...state, phase: 'finished', currentPlayerId: null, result: { reason, ranking, scores } };
  const summary = ranking.map((id, i) => `${i + 1}위 ${nameOf(s, id)} ${scores[id]?.total ?? 0}점`).join(', ');
  s = addLog(s, 'result', winner, `게임 종료${reason === 'last-standing' ? ' (남은 사람 1명)' : ''}: ${summary}`);
  return s;
}

/** 다음 차례로 넘긴다. 둘 사람이 없으면 종료 */
function advance(state: GameState): GameState {
  const active = state.players.filter((p) => p.surrenderedOrder === null);
  if (active.length <= 1 && state.players.length > 1) return finishGame(state, 'last-standing');
  const order = [...state.players].sort((a, b) => a.seat - b.seat);
  const curSeat = getPlayer(state, state.currentPlayerId as PlayerId)?.seat ?? -1;
  for (let k = 1; k <= order.length; k++) {
    const next = order[(curSeat + k) % order.length] as PlayerState;
    if (!canAct(next)) continue;
    const wrapped = next.seat <= curSeat;
    let s: GameState = { ...state, currentPlayerId: next.id, turn: state.turn + 1, round: state.round + (wrapped ? 1 : 0) };
    s = addLog(s, 'turn', next.id, `${next.nickname}의 차례`);
    return s;
  }
  return finishGame(state, 'complete');
}

/** 손패에서 카드 한 장을 빼고 덱에서 한 장 뽑는다 */
function spendCard(state: GameState, playerId: PlayerId, species: SpeciesId): GameState {
  const me = getPlayer(state, playerId) as PlayerState;
  const hand = [...me.hand];
  hand.splice(hand.indexOf(species), 1);
  const deck = [...me.deck];
  const drawn = deck.shift();
  if (drawn !== undefined) hand.push(drawn);
  return updatePlayer(state, playerId, { hand, deck });
}

const isPos = (p: unknown): p is Position => {
  const v = p as Record<string, unknown> | null;
  return !!v && typeof v === 'object' && Number.isInteger(v.q) && Number.isInteger(v.r);
};

export function validatePlant(state: GameState, a: Extract<Action, { type: 'PLANT' }>): string | null {
  if (!isPos(a.pos) || (a.seed !== undefined && !isPos(a.seed))) return '잘못된 심기 요청입니다';
  if (state.phase !== 'playing') return '진행 중인 게임이 아닙니다';
  if (state.currentPlayerId !== a.playerId) return '내 차례가 아닙니다';
  const me = getPlayer(state, a.playerId);
  if (!me) return '없는 플레이어입니다';
  if (!isSpeciesId(a.species) || !me.hand.includes(a.species)) return '손패에 없는 카드입니다';
  const sp = getSpecies(a.species);
  if (!legalPlantCells(state, a.playerId, a.species).some((p) => samePos(p, a.pos))) {
    return sp.pondPlanting ? '뿌리가 닿는 칸이나 연못 옆 빈 칸에만 심을 수 있습니다' : '내 뿌리가 닿는 빈 칸에만 심을 수 있습니다';
  }
  if (sp.line) {
    if (!isDirection(a.direction)) return '덩굴을 뻗을 방향을 고르세요';
    if (!legalDirections(state, a.pos).includes(a.direction)) return '그 방향으로는 보드가 없습니다';
  } else if (a.direction !== undefined) return '이 식물은 방향이 없습니다';
  if (a.seed !== undefined) {
    if (!sp.seed) return '이 식물은 씨앗을 날리지 않습니다';
    if (hexDistance(a.seed, a.pos) > 2 || samePos(a.seed, a.pos) || !legalSeedCells(state, a.pos).some((p) => samePos(p, a.seed as Position))) {
      return '씨앗은 심는 칸에서 거리 2 이내 빈 칸에만 놓을 수 있습니다';
    }
  }
  return null;
}

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'READY': {
      if (state.phase !== 'lobby') return reject(state, '이미 시작된 게임입니다');
      const me = getPlayer(state, action.playerId);
      if (!me) return reject(state, '없는 플레이어입니다');
      return { state: maybeStart(updatePlayer(state, action.playerId, { isReady: !me.isReady })) };
    }
    case 'DRAFT': {
      if (state.phase !== 'drafting') return reject(state, '드래프트 중이 아닙니다');
      if (state.currentPlayerId !== action.playerId) return reject(state, '내가 고를 차례가 아닙니다');
      if (!draftOptions(state, action.playerId).includes(action.species)) return reject(state, '고를 수 없는 종입니다');
      const me = getPlayer(state, action.playerId) as PlayerState;
      let s = updatePlayer(state, action.playerId, { drafted: [...me.drafted, action.species] });
      s = addLog(s, 'draft', action.playerId, `${me.nickname}: ${getSpecies(action.species).name} 선택`);
      const nextIndex = s.draftIndex + 1;
      if (nextIndex >= s.draftOrder.length) return { state: finishDraft({ ...s, draftIndex: nextIndex }) };
      return { state: { ...s, draftIndex: nextIndex, currentPlayerId: s.draftOrder[nextIndex] ?? null } };
    }
    case 'PLANT': {
      const err = validatePlant(state, action);
      if (err) return reject(state, err);
      const me = getPlayer(state, action.playerId) as PlayerState;
      const sp = getSpecies(action.species);
      const before = landCounts(state);
      let s: GameState = {
        ...state,
        plants: [
          ...state.plants,
          { id: `p${state.plants.length + 1}`, species: action.species, ownerId: action.playerId, pos: { q: action.pos.q, r: action.pos.r }, direction: sp.line ? (action.direction as Direction) : null },
        ],
        seeds: action.seed && sp.seed ? [...state.seeds, { ownerId: action.playerId, pos: { q: action.seed.q, r: action.seed.r } }] : state.seeds,
      };
      s = spendCard(s, action.playerId, action.species);
      s = addLog(s, 'plant', action.playerId, `${me.nickname}: ${posText(action.pos)}에 ${sp.name}${action.seed ? `, 씨앗 ${posText(action.seed)}` : ''}`);
      const after = landCounts(s);
      // 다른 사람 땅이 줄었으면 뺏긴 것으로 기록한다 (진행 탭·연출용)
      const mySeat = me.seat;
      s.players.forEach((p) => {
        const lost = (before[p.seat] ?? 0) - (after[p.seat] ?? 0);
        if (p.seat !== mySeat && lost > 0) s = addLog(s, 'flip', action.playerId, `${me.nickname}이(가) ${p.nickname}의 땅 ${lost}칸을 가져갔습니다`);
      });
      return { state: advance(s) };
    }
    case 'DISCARD': {
      if (state.phase !== 'playing') return reject(state, '진행 중인 게임이 아닙니다');
      if (state.currentPlayerId !== action.playerId) return reject(state, '내 차례가 아닙니다');
      const me = getPlayer(state, action.playerId);
      if (!me || !me.hand.includes(action.species)) return reject(state, '손패에 없는 카드입니다');
      if (hasAnyPlant(state, action.playerId)) return reject(state, '심을 수 있는 칸이 있으면 버릴 수 없습니다');
      let s = spendCard(state, action.playerId, action.species);
      s = addLog(s, 'discard', action.playerId, `${me.nickname}: 심을 곳이 없어 ${getSpecies(action.species).name} 버림`);
      return { state: advance(s) };
    }
    case 'SURRENDER': {
      if (state.phase !== 'playing' && state.phase !== 'drafting') return reject(state, '게임 중에만 기권할 수 있습니다');
      const me = getPlayer(state, action.playerId);
      if (!me || me.surrenderedOrder !== null) return reject(state, '기권할 수 없습니다');
      const order = state.players.filter((p) => p.surrenderedOrder !== null).length;
      let s = updatePlayer(state, action.playerId, { surrenderedOrder: order });
      s = addLog(s, 'surrender', action.playerId, `${me.nickname} 기권`);
      if (s.phase === 'drafting') {
        // 드래프트 중 기권: 남은 사람이 1명이면 끝, 아니면 기권자의 남은 픽을 순서에서 뺀다
        if (s.players.filter((p) => p.surrenderedOrder === null).length <= 1) return { state: finishGame(s, 'last-standing') };
        const draftOrder = [...s.draftOrder.slice(0, s.draftIndex), ...s.draftOrder.slice(s.draftIndex).filter((id) => id !== action.playerId)];
        s = { ...s, draftOrder, currentPlayerId: draftOrder[s.draftIndex] ?? null };
        return { state: s.draftIndex >= draftOrder.length ? finishDraft(s) : s };
      }
      if (s.currentPlayerId === action.playerId) return { state: advance(s) };
      const active = s.players.filter((p) => p.surrenderedOrder === null);
      if (active.length <= 1) return { state: finishGame(s, 'last-standing') };
      return { state: s };
    }
    default:
      return reject(state, '알 수 없는 행동입니다');
  }
}

// ---------------------------------------------------------------------------
// 시간 초과 자동 수 (Rules.md 5·6.3절). 서버가 쓴다
// ---------------------------------------------------------------------------

export function autoAction(state: GameState, playerId: PlayerId): Action | null {
  if (state.currentPlayerId !== playerId) return null;
  if (state.phase === 'drafting') {
    const first = draftOptions(state, playerId)[0];
    return first ? { type: 'DRAFT', playerId, species: first } : null;
  }
  if (state.phase !== 'playing') return null;
  const me = getPlayer(state, playerId);
  if (!me || me.hand.length === 0) return null;
  const inf = computeInfluence(state);
  const species = me.hand[0] as SpeciesId;
  const cell = legalPlantCells(state, playerId, species, inf)[0];
  if (cell) {
    const sp = getSpecies(species);
    const direction = sp.line ? (legalDirections(state, cell)[0] as Direction | undefined) : undefined;
    return { type: 'PLANT', playerId, species, pos: cell, ...(direction !== undefined ? { direction } : {}) };
  }
  if (!hasAnyPlant(state, playerId)) return { type: 'DISCARD', playerId, species };
  // 맨 앞 카드는 못 심지만 다른 카드는 심을 수 있다: 심을 수 있는 첫 카드를 첫 칸에
  for (const s of me.hand) {
    const c = legalPlantCells(state, playerId, s, inf)[0];
    if (!c) continue;
    const sp = getSpecies(s);
    const direction = sp.line ? (legalDirections(state, c)[0] as Direction | undefined) : undefined;
    return { type: 'PLANT', playerId, species: s, pos: c, ...(direction !== undefined ? { direction } : {}) };
  }
  return null;
}
