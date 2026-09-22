/**
 * 로비 → 게임 시작 → 턴 진행 (Rules.md 4절, 5절, 9.2, F018~F020, F024, F025).
 * 순수 함수. `applyAction(state, action) => { state, error? }`. 입력 state 를 변이하지 않는다.
 *
 * 턴 흐름:
 *  setupGame  : 코어 배치, 덱 셔플, 손패 4, 에너지 3 (시작 단계 전 상태. F018/F019 기준)
 *  beginTurn  : 시작 단계 — 전투 → 정비 → 지속 마법 만료 → 수입 → 드로우
 *  행동       : PLACE / PASS / SURRENDER 중 하나
 *  advanceTurn: 종료 단계 — 종료 조건 확인 → 다음 생존자에게 턴 → beginTurn
 */
import type {
  Action,
  DeckChoice,
  GameResultReason,
  GameState,
  MapId,
  Marker,
  PlayerId,
  PlayerKind,
  PlayerState,
} from '../types/index.js';
import {
  CORE_SPEC,
  DEFAULT_DECK_CHOICE,
  DRAW_PER_TURN,
  HAND_LIMIT,
  INITIAL_HAND_SIZE,
  MAX_PLAYERS,
  STARTING_ENERGY,
  buildDeck,
  getMap,
  isValidDeckChoice,
} from '../data/index.js';
import { addLog, applyRepair, eliminatePlayer, expirePersistentMagic, nameOf, resolveCombat, withMarkers } from './combat.js';
import { applyPlacement, validatePlacement } from './placement.js';
import { shuffle } from './rng.js';
import { alivePlayers, computeIncome, computeRanking, computeScores, getPlayer } from './scoring.js';

export interface ActionResult {
  state: GameState;
  /** 거부됐으면 사유. 거부 시 state 는 입력과 같다 */
  error?: string;
}

// ---------------------------------------------------------------------------
// 로비
// ---------------------------------------------------------------------------

export function createInitialState(roomId: string, mapId: MapId, rngSeed: number): GameState {
  const map = getMap(mapId);
  return {
    roomId,
    phase: 'lobby',
    mapId,
    board: {
      width: map.size,
      height: map.size,
      asteroids: map.asteroids.map((p) => ({ ...p })),
      veins: map.veins.map((p) => ({ ...p })),
    },
    roundLimit: map.roundLimit,
    round: 0,
    turn: 0,
    currentPlayerId: null,
    players: [],
    markers: [],
    nextMarkerId: 1,
    rngSeed,
    result: null,
    log: [],
  };
}

/** 좌석은 joinPlayer 가 정한다. AI 좌석은 기본 덱을 자동 선택하고 준비 완료로 들어온다 (F026) */
export function createPlayer(id: PlayerId, nickname: string, kind: PlayerKind = 'human'): PlayerState {
  const ai = kind === 'ai';
  return {
    id,
    nickname,
    kind,
    seat: -1,
    isReady: ai,
    deckChoice: ai ? { ...DEFAULT_DECK_CHOICE } : null,
    energy: 0,
    deck: [],
    hand: [],
    discard: [],
    alive: true,
    eliminatedOrder: null,
    passed: false,
  };
}

export function joinPlayer(state: GameState, player: PlayerState): ActionResult {
  if (state.phase !== 'lobby') return { state, error: '이미 시작된 게임입니다' };
  if (state.players.some((p) => p.id === player.id)) return { state, error: '이미 참여한 플레이어입니다' };
  if (state.players.length >= MAX_PLAYERS) return { state, error: `정원은 최대 ${MAX_PLAYERS}명입니다` };
  const seated = { ...player, seat: state.players.length };
  let s: GameState = { ...state, players: [...state.players, seated] };
  s = addLog(s, 'system', player.id, `${player.nickname} 입장 (좌석 ${seated.seat})`);
  return { state: s };
}

function selectDeck(state: GameState, playerId: PlayerId, choice: DeckChoice): ActionResult {
  if (state.phase !== 'lobby') return { state, error: '이미 시작된 게임입니다' };
  if (!state.players.some((p) => p.id === playerId)) return { state, error: '방에 없는 플레이어입니다' };
  if (!isValidDeckChoice(choice)) return { state, error: '건물·유닛·마법 특수 카드를 하나씩 골라야 합니다' };
  return {
    state: {
      ...state,
      players: state.players.map((p) => (p.id === playerId ? { ...p, deckChoice: choice, isReady: false } : p)),
    },
  };
}

function ready(state: GameState, playerId: PlayerId): ActionResult {
  if (state.phase !== 'lobby') return { state, error: '이미 시작된 게임입니다' };
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { state, error: '방에 없는 플레이어입니다' };
  if (!player.deckChoice) return { state, error: '특수 카드를 먼저 골라야 합니다' };
  let s: GameState = { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, isReady: true } : p)) };
  if (canStart(s)) s = startGame(s);
  return { state: s };
}

/** 인원이 맵 정원과 같고 전원 덱 선택·준비 완료 (F002, F030) */
export function canStart(state: GameState): boolean {
  const map = getMap(state.mapId);
  return (
    state.phase === 'lobby' &&
    state.players.length === map.players &&
    state.players.every((p) => p.isReady && p.deckChoice !== null)
  );
}

// ---------------------------------------------------------------------------
// 게임 시작
// ---------------------------------------------------------------------------

/**
 * F018/F019: 좌석 순으로 코어 배치, 덱(기본 20 + 특수 3) 시드 셔플, 손패 4, 에너지 3.
 * 첫 턴의 시작 단계는 아직 실행하지 않는다 (startGame 이 이어서 실행).
 */
export function setupGame(state: GameState): GameState {
  if (!canStart(state)) throw new Error('시작 조건을 만족하지 않습니다');
  const map = getMap(state.mapId);
  const players = [...state.players].sort((a, b) => a.seat - b.seat);
  let seed = state.rngSeed;
  const markers: Marker[] = [];
  let nextId = state.nextMarkerId;
  const dealt: PlayerState[] = [];

  for (const p of players) {
    const corePos = map.corePositions[p.seat];
    if (!corePos) throw new Error(`맵 ${map.id}에 좌석 ${p.seat} 코어 좌표가 없습니다`);
    markers.push({ id: `m${nextId++}`, specId: CORE_SPEC.id, kind: 'core', ownerId: p.id, pos: corePos, hp: CORE_SPEC.hp, remainingTurns: null });
    const r = shuffle(buildDeck(p.deckChoice as DeckChoice), seed);
    seed = r.seed;
    dealt.push({
      ...p,
      energy: STARTING_ENERGY,
      hand: r.items.slice(0, INITIAL_HAND_SIZE),
      deck: r.items.slice(INITIAL_HAND_SIZE),
      discard: [],
      alive: true,
      eliminatedOrder: null,
      passed: false,
    });
  }

  const first = dealt[0] as PlayerState;
  let s: GameState = withMarkers(
    {
      ...state,
      phase: 'playing',
      players: dealt,
      nextMarkerId: nextId,
      rngSeed: seed,
      round: 1,
      turn: 1,
      currentPlayerId: first.id,
      result: null,
    },
    markers,
  );
  s = addLog(s, 'system', null, `게임 시작: ${map.name} (${map.size}×${map.size}, ${map.roundLimit}라운드)`);
  for (const p of dealt) {
    const core = markers.find((m) => m.ownerId === p.id) as Marker;
    s = addLog(s, 'system', p.id, `${p.nickname} 코어 (${core.pos.x},${core.pos.y}) 배치, 에너지 ${STARTING_ENERGY}, 손패 ${p.hand.length}장`);
  }
  s = addLog(s, 'turn', first.id, `${s.turn}턴 시작: ${first.nickname} (라운드 ${s.round})`);
  return s;
}

/** setupGame + 첫 플레이어의 시작 단계 */
export function startGame(state: GameState): GameState {
  return beginTurn(setupGame(state));
}

// ---------------------------------------------------------------------------
// 턴 시작 단계 (5.1)
// ---------------------------------------------------------------------------

export function beginTurn(state: GameState): GameState {
  const playerId = state.currentPlayerId;
  if (state.phase !== 'playing' || playerId === null) return state;

  let s = resolveCombat(state, playerId);
  if (alivePlayers(s).length <= 1) return finishGame(s, 'last-survivor');

  s = applyRepair(s, playerId);
  s = expirePersistentMagic(s, playerId);
  s = applyIncome(s, playerId);
  s = drawCard(s, playerId);
  return s;
}

function applyIncome(state: GameState, playerId: PlayerId): GameState {
  const income = computeIncome(state, playerId);
  const before = getPlayer(state, playerId).energy;
  const s: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, energy: p.energy + income.total } : p)),
  };
  const detail = income.items.map((i) => `${i.name}${i.vein ? '(광맥)' : ''} +${i.amount}`).join(', ');
  return addLog(s, 'income', playerId, `수입 +${income.total} (${detail}), 에너지 ${before} → ${before + income.total}`);
}

function drawCard(state: GameState, playerId: PlayerId): GameState {
  const player = getPlayer(state, playerId);
  if (player.hand.length >= HAND_LIMIT) {
    return addLog(state, 'draw', playerId, `손패 상한(${HAND_LIMIT}장)이라 드로우 생략`);
  }
  if (player.deck.length === 0) {
    return addLog(state, 'draw', playerId, '덱이 비어 드로우 생략');
  }
  const n = Math.min(DRAW_PER_TURN, HAND_LIMIT - player.hand.length, player.deck.length);
  const drawn = player.deck.slice(0, n);
  const s: GameState = {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, hand: [...p.hand, ...drawn], deck: p.deck.slice(n) } : p,
    ),
  };
  return addLog(s, 'draw', playerId, `카드 ${n}장 드로우 (손패 ${player.hand.length + n}장, 덱 ${player.deck.length - n}장)`);
}

// ---------------------------------------------------------------------------
// 턴 종료 단계 (5.3) · 종료 (9.2)
// ---------------------------------------------------------------------------

export function finishGame(state: GameState, reason: GameResultReason): GameState {
  const scores = computeScores(state);
  const ranking = computeRanking(state, scores);
  let s: GameState = { ...state, phase: 'finished', currentPlayerId: null, result: { reason, ranking, scores } };
  const why = reason === 'last-survivor' ? '최후 생존' : reason === 'all-pass' ? '전원 패스' : '라운드 제한';
  const winner = ranking[0];
  const summary = ranking
    .map((id, i) => `${i + 1}위 ${nameOf(s, id)} ${scores[id]?.total ?? 0}점`)
    .join(', ');
  s = addLog(s, 'result', winner ?? null, `게임 종료 (${why}): ${summary}`);
  return s;
}

/** 종료 단계: 종료 조건을 확인하고 다음 생존 플레이어의 시작 단계까지 진행한다 */
export function advanceTurn(state: GameState): GameState {
  if (state.phase !== 'playing' || state.currentPlayerId === null) return state;
  const alive = alivePlayers(state);
  if (alive.length <= 1) return finishGame(state, 'last-survivor');
  if (alive.every((p) => p.passed)) return finishGame(state, 'all-pass');

  const current = getPlayer(state, state.currentPlayerId);
  const next = alive.find((p) => p.seat > current.seat) ?? (alive[0] as PlayerState);
  const wrapped = next.seat <= current.seat;
  let s = state;
  if (wrapped) {
    if (s.round >= s.roundLimit) return finishGame(s, 'round-limit');
    s = { ...s, round: s.round + 1 };
  }
  s = { ...s, turn: s.turn + 1, currentPlayerId: next.id };
  s = addLog(s, 'turn', next.id, `${s.turn}턴 시작: ${next.nickname} (라운드 ${s.round})`);
  return beginTurn(s);
}

// ---------------------------------------------------------------------------
// 액션 적용
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'SELECT_DECK':
      return selectDeck(state, action.playerId, action.choice);
    case 'READY':
      return ready(state, action.playerId);
    case 'PLACE': {
      const err = validatePlacement(state, action.playerId, action.cardId, action.pos);
      if (err) return { state, error: err.message };
      let s = applyPlacement(state, action.playerId, action.cardId, action.pos);
      s = { ...s, players: s.players.map((p) => (p.passed ? { ...p, passed: false } : p)) };
      return { state: advanceTurn(s) };
    }
    case 'PASS': {
      const err = checkTurn(state, action.playerId);
      if (err) return { state, error: err };
      let s: GameState = { ...state, players: state.players.map((p) => (p.id === action.playerId ? { ...p, passed: true } : p)) };
      s = addLog(s, 'pass', action.playerId, `${nameOf(s, action.playerId)} 패스 (연속 ${countPasses(s)})`);
      return { state: advanceTurn(s) };
    }
    case 'SURRENDER': {
      const err = checkTurn(state, action.playerId);
      if (err) return { state, error: err };
      let s = addLog(state, 'surrender', action.playerId, `${nameOf(state, action.playerId)} 기권`);
      s = eliminatePlayer(s, action.playerId, 'surrender');
      return { state: advanceTurn(s) };
    }
    default:
      return { state, error: '알 수 없는 액션입니다' };
  }
}

/** 현재 연속 패스 구간에서 패스한 생존자 수 (F013 표시용) */
export function countPasses(state: GameState): number {
  return state.players.filter((p) => p.alive && p.passed).length;
}

function checkTurn(state: GameState, playerId: PlayerId): string | null {
  if (state.phase !== 'playing') return '진행 중인 게임이 아닙니다';
  if (!state.players.some((p) => p.id === playerId)) return '방에 없는 플레이어입니다';
  if (state.currentPlayerId !== playerId) return `${nameOf(state, state.currentPlayerId as PlayerId)}의 턴입니다`;
  if (!getPlayer(state, playerId).alive) return '탈락한 플레이어입니다';
  return null;
}
