/**
 * 로비 → 차례 진행(라운드 마켓) → 종료 (Rules.md 4·5·6·9절).
 * 순수 함수. `applyAction(state, action) => { state, error? }`. 입력 state 를 변이하지 않는다.
 */
import { GOAL_COUNT, HAND_SIZE, MAX_PLAYERS, MIN_PLAYERS, rulesFor } from '../data/constants.js';
import { FLOWER_SPECIES, FOREST_SPECIES, GOALS, GOAL_EXCLUSIONS, SPECIES_IDS, getGoal, getSpecies, isSpeciesId } from '../data/species.js';
import type { Action, Direction, GameLogEntry, GameResultReason, GameState, GoalId, LogKind, PlayerId, PlayerKind, PlayerState, Position, SpeciesId } from '../types/index.js';
import { buildBoard, hexDistance, isDirection, samePos } from './board.js';
import { computeInfluence, legalDirections, legalPlantCells, legalSeedCells } from './influence.js';
import { deckKeyFrom, shuffle, shuffleDeck } from './rng.js';
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
 * deckSeed 는 카드 더미 셔플 전용이다(Rules.md 11절). 온라인에서는 서버가 boardSeed 와 독립인 암호학적 난수를 넣어야
 * 공개 보드·목표로 손패를 역산할 수 없다. 생략하면(핫시트·테스트) boardSeed 에서 만든다
 */
export function createInitialState(roomId: string, rngSeed: number, deckSeed: number | readonly number[] = (rngSeed ^ 0x9e3779b9) >>> 0): GameState {
  return {
    roomId,
    phase: 'lobby',
    board: null,
    goals: [],
    species: [],
    market: [],
    pile: [],
    roundStart: 0,
    round: 0,
    turn: 0,
    currentPlayerId: null,
    players: [],
    plants: [],
    seeds: [],
    rngSeed: rngSeed >>> 0,
    deckSeed: deckKeyFrom(deckSeed),
    result: null,
    log: [],
  };
}

export function createPlayer(id: PlayerId, nickname: string, kind: PlayerKind = 'human'): PlayerState {
  return { id, nickname, kind, seat: 0, isReady: kind === 'ai', hand: [], surrenderedOrder: null };
}

export function joinPlayer(state: GameState, player: PlayerState): ActionResult {
  if (state.phase !== 'lobby') return reject(state, '이미 시작된 게임입니다');
  if (state.players.length >= MAX_PLAYERS) return reject(state, `방에는 최대 ${MAX_PLAYERS}명까지 들어올 수 있습니다`);
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

// ---------------------------------------------------------------------------
// 시작: 보드 → 목표 → 이번 판 식물 → 카드 더미·손 → 첫 마켓 (Rules.md 4·5절, 11절 난수 순서)
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

/**
 * 이번 판 식물 (Rules.md 4절). 보호구역 목표의 식물은 반드시, 꽃밭·숲 목표가 있으면 꽃·나무 중 하나 이상(표 순서를 섞어 첫 번째),
 * 나머지는 남은 식물을 표 순서로 놓고 섞어 앞에서부터 채운다. 결과는 표 순서
 */
export function pickGarden(players: number, goals: GoalId[], seed: number): { species: SpeciesId[]; seed: number } {
  const size = rulesFor(players).gardenSize;
  const chosen = new Set<SpeciesId>();
  for (const g of goals) {
    const sp = getGoal(g).species;
    if (sp) chosen.add(sp);
  }
  let s = seed;
  const needOne = (pool: readonly SpeciesId[]) => {
    if (pool.some((x) => chosen.has(x))) return;
    const r = shuffle(SPECIES_IDS.filter((x) => pool.includes(x)), s);
    s = r.seed;
    chosen.add(r.items[0] as SpeciesId);
  };
  if (goals.includes('flower-bed')) needOne(FLOWER_SPECIES);
  if (goals.includes('forest')) needOne(FOREST_SPECIES);
  const rest = shuffle(SPECIES_IDS.filter((x) => !chosen.has(x)), s);
  s = rest.seed;
  for (const x of rest.items) {
    if (chosen.size >= size) break;
    chosen.add(x);
  }
  return { species: SPECIES_IDS.filter((x) => chosen.has(x)), seed: s };
}

/** 로비에서 2명 이상이 모두 준비했으면 시작한다. 아니면 그대로 */
export function maybeStart(state: GameState): GameState {
  if (state.phase !== 'lobby' || state.players.length < MIN_PLAYERS || !state.players.every((p) => p.isReady)) return state;
  return startGame(state);
}

export function startGame(state: GameState): GameState {
  const P = state.players.length;
  const rule = rulesFor(P);
  const built = buildBoard(P, state.rngSeed);
  const goals = pickGoals(built.seed);
  const garden = pickGarden(P, goals.goals, goals.seed);
  // 카드 더미: 이번 판 식물마다 copies 장을 섞고, 자리 0부터 손에 3장씩
  const dealt = shuffleDeck(garden.species.flatMap((sp) => new Array<SpeciesId>(rule.copies).fill(sp)), deckKeyFrom(state.deckSeed));
  const pile = [...dealt.items];
  const players = [...state.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({ ...p, hand: pile.splice(0, HAND_SIZE), surrenderedOrder: null }));
  const first = players[0] as PlayerState;
  let s: GameState = {
    ...state,
    phase: 'playing',
    board: built.board,
    goals: goals.goals,
    species: garden.species,
    rngSeed: garden.seed,
    deckSeed: dealt.key,
    market: [],
    pile,
    round: 1,
    roundStart: first.seat,
    turn: 1,
    currentPlayerId: first.id,
    plants: [],
    seeds: [],
    result: null,
    players,
  };
  s = addLog(s, 'system', null, `게임 시작: 목표 ${goals.goals.map((g) => getGoal(g).name).join(' · ')} / 식물 ${garden.species.map((x) => getSpecies(x).name).join(' · ')}`);
  s = revealMarket(s);
  s = addLog(s, 'turn', first.id, `${first.nickname}의 차례`);
  return s;
}

/** 라운드 시작: 남은 마켓 카드는 버리고, 기권 안 한 인원 수만큼 더미에서 펼친다 (Rules.md 5절) */
function revealMarket(state: GameState): GameState {
  const n = state.players.filter((p) => p.surrenderedOrder === null).length;
  return { ...state, market: state.pile.slice(0, n), pile: state.pile.slice(n) };
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

/**
 * 다음 라운드의 첫 자리: 이번 라운드 첫 자리 다음부터 자리 순서로, 기권하지 않은 첫 사람 (Rules.md 5절 선 돌리기).
 * 기권자가 있어도 선은 남은 사람 사이에서 고르게 돈다
 */
export function nextRoundStart(state: GameState): number {
  const P = state.players.length;
  const bySeat = [...state.players].sort((a, b) => a.seat - b.seat);
  for (let k = 1; k <= P; k++) {
    const p = bySeat[(state.roundStart + k) % P] as PlayerState;
    if (p.surrenderedOrder === null) return p.seat;
  }
  return state.roundStart;
}

/**
 * 다음 차례로 넘긴다. 라운드 안에서는 그 라운드의 첫 자리(roundStart)부터 자리 순서로 두고, 기권자·손이 빈 사람은 건너뛴다.
 * 라운드를 다 돌면 다음 라운드(첫 자리가 남은 사람 사이에서 한 칸 돎)로 넘어가며 마켓을 새로 펼친다. 둘 사람이 없으면 종료
 */
function advance(state: GameState): GameState {
  const active = state.players.filter((p) => p.surrenderedOrder === null);
  if (active.length <= 1 && state.players.length > 1) return finishGame(state, 'last-standing');
  const P = state.players.length;
  const bySeat = [...state.players].sort((a, b) => a.seat - b.seat);
  const curSeat = getPlayer(state, state.currentPlayerId as PlayerId)?.seat ?? 0;
  // 이번 라운드에서 지금 자리 뒤에 남은 사람
  const start = state.roundStart;
  for (let k = ((curSeat - start + P) % P) + 1; k < P; k++) {
    const next = bySeat[(start + k) % P] as PlayerState;
    if (canAct(next)) return enterTurn({ ...state, currentPlayerId: next.id, turn: state.turn + 1 }, next);
  }
  // 다음 라운드
  const round = state.round + 1;
  const nextStart = nextRoundStart(state);
  for (let k = 0; k < P; k++) {
    const next = bySeat[(nextStart + k) % P] as PlayerState;
    if (canAct(next)) return enterTurn(revealMarket({ ...state, currentPlayerId: next.id, turn: state.turn + 1, round, roundStart: nextStart }), next);
  }
  return finishGame(state, 'complete');
}

function enterTurn(state: GameState, next: PlayerState): GameState {
  return addLog(state, 'turn', next.id, `${next.nickname}의 차례`);
}

/** 손에서 카드 한 장을 뺀다 */
function spendCard(state: GameState, playerId: PlayerId, species: SpeciesId): GameState {
  const me = getPlayer(state, playerId) as PlayerState;
  const hand = [...me.hand];
  hand.splice(hand.indexOf(species), 1);
  return updatePlayer(state, playerId, { hand });
}

/** 가져오기 검사: 마켓에 카드가 있으면 자리 번호가 꼭 있어야 하고, 비었으면 없어야 한다 (Rules.md 5절) */
export function validateTake(state: GameState, take: unknown): string | null {
  if (state.market.length === 0) return take === undefined ? null : '가져올 카드가 없습니다';
  if (take === undefined) return '가져올 카드를 고르세요';
  if (!Number.isInteger(take) || (take as number) < 0 || (take as number) >= state.market.length) return '없는 카드입니다';
  return null;
}

/** 마켓 take 번 카드를 손에 넣는다. 그 자리는 채우지 않는다 */
function takeCard(state: GameState, playerId: PlayerId, take: number | undefined): GameState {
  if (take === undefined) return state;
  const card = state.market[take] as SpeciesId;
  const me = getPlayer(state, playerId) as PlayerState;
  let s: GameState = { ...state, market: state.market.filter((_, i) => i !== take) };
  s = updatePlayer(s, playerId, { hand: [...me.hand, card] });
  return addLog(s, 'take', playerId, `${me.nickname}: ${getSpecies(card).name} 가져옴`);
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
  if (!isSpeciesId(a.species) || !me.hand.includes(a.species)) return '손에 없는 카드입니다';
  const sp = getSpecies(a.species);
  if (!legalPlantCells(state, a.playerId, a.species).some((p) => samePos(p, a.pos))) {
    return sp.pondPlanting ? '뿌리가 닿는 칸이나 연못 옆 빈 칸에만 심을 수 있습니다' : '내 뿌리가 닿는 빈 칸에만 심을 수 있습니다';
  }
  if (sp.line) {
    if (!isDirection(a.direction)) return '칡을 뻗을 방향을 고르세요';
    if (!legalDirections(state, a.pos).includes(a.direction)) return '그 방향으로는 보드가 없습니다';
  } else if (a.direction !== undefined) return '이 식물은 방향이 없습니다';
  const takeErr = validateTake(state, a.take);
  if (takeErr) return takeErr;
  if (a.seed !== undefined) {
    if (!sp.seed) return '이 식물은 씨앗을 날리지 않습니다';
    if (hexDistance(a.seed, a.pos) > 2 || samePos(a.seed, a.pos) || !legalSeedCells(state, a.pos).some((p) => samePos(p, a.seed as Position))) {
      return '씨앗은 심는 칸에서 두 칸 안 빈 칸에만 놓을 수 있습니다';
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
      s = addLog(s, 'plant', action.playerId, `${me.nickname}: ${sp.name} 심음${action.seed ? ', 씨앗 놓음' : ''}`);
      const after = landCounts(s);
      // 다른 사람 땅이 줄었으면 뺏긴 것으로 기록한다 (진행 탭·연출용)
      const mySeat = me.seat;
      s.players.forEach((p) => {
        const lost = (before[p.seat] ?? 0) - (after[p.seat] ?? 0);
        if (p.seat !== mySeat && lost > 0) s = addLog(s, 'flip', action.playerId, `${me.nickname}: ${p.nickname}의 땅 ${lost}칸을 가져갔습니다`);
      });
      s = takeCard(s, action.playerId, action.take);
      return { state: advance(s) };
    }
    case 'DISCARD': {
      if (state.phase !== 'playing') return reject(state, '진행 중인 게임이 아닙니다');
      if (state.currentPlayerId !== action.playerId) return reject(state, '내 차례가 아닙니다');
      const me = getPlayer(state, action.playerId);
      if (!me || !me.hand.includes(action.species)) return reject(state, '손에 없는 카드입니다');
      if (hasAnyPlant(state, action.playerId)) return reject(state, '심을 수 있는 칸이 있으면 버릴 수 없습니다');
      const takeErr = validateTake(state, action.take);
      if (takeErr) return reject(state, takeErr);
      let s = spendCard(state, action.playerId, action.species);
      s = addLog(s, 'discard', action.playerId, `${me.nickname}: 심을 곳이 없어 ${getSpecies(action.species).name} 버림`);
      s = takeCard(s, action.playerId, action.take);
      return { state: advance(s) };
    }
    case 'SURRENDER': {
      if (state.phase !== 'playing') return reject(state, '게임 중에만 기권할 수 있습니다');
      const me = getPlayer(state, action.playerId);
      if (!me || me.surrenderedOrder !== null) return reject(state, '기권할 수 없습니다');
      const order = state.players.filter((p) => p.surrenderedOrder !== null).length;
      let s = updatePlayer(state, action.playerId, { surrenderedOrder: order, hand: [] });
      s = addLog(s, 'surrender', action.playerId, `${me.nickname} 기권`);
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
  if (state.phase !== 'playing') return null;
  // 가져오기는 마켓 맨 앞 카드 (Rules.md 6.3)
  const take = state.market.length > 0 ? { take: 0 } : {};
  const me = getPlayer(state, playerId);
  if (!me || me.hand.length === 0) return null;
  const inf = computeInfluence(state);
  const species = me.hand[0] as SpeciesId;
  const cell = legalPlantCells(state, playerId, species, inf)[0];
  if (cell) {
    const sp = getSpecies(species);
    const direction = sp.line ? (legalDirections(state, cell)[0] as Direction | undefined) : undefined;
    return { type: 'PLANT', playerId, species, pos: cell, ...(direction !== undefined ? { direction } : {}), ...take };
  }
  if (!hasAnyPlant(state, playerId)) return { type: 'DISCARD', playerId, species, ...take };
  // 맨 앞 카드는 못 심지만 다른 카드는 심을 수 있다: 심을 수 있는 첫 카드를 첫 칸에
  for (const s of me.hand) {
    const c = legalPlantCells(state, playerId, s, inf)[0];
    if (!c) continue;
    const sp = getSpecies(s);
    const direction = sp.line ? (legalDirections(state, c)[0] as Direction | undefined) : undefined;
    return { type: 'PLANT', playerId, species: s, pos: c, ...(direction !== undefined ? { direction } : {}), ...take };
  }
  return null;
}
