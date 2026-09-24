/**
 * 로비 → 게임 시작 → 턴 진행 (Rules.md 4절, 5절, 9.2, F018~F020, F024, F025).
 * 순수 함수. `applyAction(state, action) => { state, error? }`. 입력 state 를 변이하지 않는다.
 *
 * 턴 흐름 (2026-09-23 사용자 지시로 자동 효과 시점을 "다음 사람 턴 시작"에서
 * "내 턴을 끝내는 시점"으로 옮겼다 — Rules.md 5절):
 *  setupGame  : 코어 배치, 덱 셔플, 손패 4, 에너지 5 (첫 턴 시작 전 상태. F018/F019 기준)
 *  행동       : PLACE(턴당 1회만) / PASS(패스 또는 턴 종료) / SURRENDER
 *  PASS       : 턴을 끝내는 그 플레이어 자신의 전투 → 정비 → 지속 마법 만료 → 수입 → 드로우 →
 *               (선택) 손패 교체 를 즉시 처리한 뒤 다음 생존자에게 턴을 넘긴다
 *  advanceTurn: 종료 조건 확인 → 다음 생존자로 currentPlayerId 전환 (자동 효과 없음, 그 사람이
 *               자기 턴을 끝낼 때 비로소 처리된다)
 */
import type {
  Action,
  CardId,
  GameResultReason,
  GameState,
  MapId,
  Marker,
  PlayerId,
  PlayerKind,
  PlayerState,
  RaceId,
} from '../types/index.js';
import {
  CORE_SPEC,
  DRAW_PER_TURN,
  ENERGY_CAP,
  HAND_LIMIT,
  INITIAL_HAND_SIZE,
  MAX_PLAYERS,
  RACES,
  STARTING_ENERGY,
  buildDeck,
  getMap,
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

/**
 * 좌석은 joinPlayer 가 정한다. AI 좌석은 종족을 자동 선택하고 준비 완료로 들어온다 (F026).
 * `aiRace` 를 주지 않으면 기본값(coalition)으로 떨어진다 — 호출자가 랜덤을 원하면 직접 골라 넘긴다.
 */
export function createPlayer(
  id: PlayerId,
  nickname: string,
  kind: PlayerKind = 'human',
  aiRace: RaceId = 'coalition',
): PlayerState {
  const ai = kind === 'ai';
  return {
    id,
    nickname,
    kind,
    seat: -1,
    isReady: ai,
    race: ai ? aiRace : null,
    energy: 0,
    deck: [],
    hand: [],
    discard: [],
    alive: true,
    eliminatedOrder: null,
    passed: false,
    actedThisTurn: false,
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

function selectRace(state: GameState, playerId: PlayerId, race: RaceId): ActionResult {
  if (state.phase !== 'lobby') return { state, error: '이미 시작된 게임입니다' };
  if (!state.players.some((p) => p.id === playerId)) return { state, error: '방에 없는 플레이어입니다' };
  if (!RACES.some((r) => r.id === race)) return { state, error: '알 수 없는 종족입니다' };
  return {
    state: {
      ...state,
      players: state.players.map((p) => (p.id === playerId ? { ...p, race, isReady: false } : p)),
    },
  };
}

function ready(state: GameState, playerId: PlayerId): ActionResult {
  if (state.phase !== 'lobby') return { state, error: '이미 시작된 게임입니다' };
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { state, error: '방에 없는 플레이어입니다' };
  if (!player.race) return { state, error: '종족을 먼저 골라야 합니다' };
  let s: GameState = { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, isReady: true } : p)) };
  if (canStart(s)) s = startGame(s);
  return { state: s };
}

/**
 * 로비에서 맵 변경 (F030). 보드·라운드 제한을 새 맵으로 바꾸고 플레이어·로그는 유지한다.
 * 정원이 줄어 인원이 넘치면 거부한다. 준비 상태는 전원 해제한다(정원이 바뀌면 다시 확인해야 하므로).
 */
export function changeMap(state: GameState, mapId: MapId): ActionResult {
  if (state.phase !== 'lobby') return { state, error: '이미 시작된 게임입니다' };
  const map = getMap(mapId);
  if (state.players.length > map.players) {
    return { state, error: `${map.name} 맵은 ${map.players}명까지입니다 (현재 ${state.players.length}명)` };
  }
  const fresh = createInitialState(state.roomId, mapId, state.rngSeed);
  let s: GameState = {
    ...state,
    mapId,
    board: fresh.board,
    roundLimit: fresh.roundLimit,
    players: state.players.map((p) => (p.kind === 'ai' ? p : { ...p, isReady: false })),
  };
  s = addLog(s, 'system', null, `맵 변경: ${map.name} (${map.players}인, ${map.size}×${map.size}, ${map.roundLimit}라운드)`);
  return { state: s };
}

/** 로비에서 퇴장. 뒷좌석을 당겨 좌석 번호를 다시 매긴다. 게임 중엔 기권(SURRENDER)을 써야 한다 */
export function leaveLobby(state: GameState, playerId: PlayerId): ActionResult {
  if (state.phase !== 'lobby') return { state, error: '게임 중에는 기권으로만 나갈 수 있습니다' };
  const leaving = state.players.find((p) => p.id === playerId);
  if (!leaving) return { state, error: '방에 없는 플레이어입니다' };
  const remaining = state.players
    .filter((p) => p.id !== playerId)
    .sort((a, b) => a.seat - b.seat)
    .map((p, seat) => (p.seat === seat ? p : { ...p, seat }));
  let s: GameState = { ...state, players: remaining };
  s = addLog(s, 'system', playerId, `${leaving.nickname} 퇴장`);
  return { state: s };
}

/** 인원이 맵 정원과 같고 전원 종족 선택·준비 완료 (F002, F030) */
export function canStart(state: GameState): boolean {
  const map = getMap(state.mapId);
  return (
    state.phase === 'lobby' &&
    state.players.length === map.players &&
    state.players.every((p) => p.isReady && p.race !== null)
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
    const r = shuffle(buildDeck(p.race as RaceId), seed);
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
      actedThisTurn: false,
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

/**
 * setupGame 만으로 충분하다. 예전에는 여기서 첫 플레이어의 "턴 시작" 자동 효과를 미리 한 번
 * 돌렸지만, 이제 자동 효과는 그 플레이어가 자기 턴을 끝낼 때(PASS) 처리되므로 게임 시작 시점에는
 * 아무 효과도 없다 — 첫 플레이어는 초기 배분(손패 4장, 에너지 5)만으로 첫 배치를 한다.
 */
export function startGame(state: GameState): GameState {
  return setupGame(state);
}

function applyIncome(state: GameState, playerId: PlayerId): GameState {
  const income = computeIncome(state, playerId);
  const before = getPlayer(state, playerId).energy;
  const after = Math.min(before + income.total, ENERGY_CAP);
  const s: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, energy: after } : p)),
  };
  const detail = income.items.map((i) => `${i.name}${i.vein ? '(광맥)' : ''} +${i.amount}`).join(', ');
  const capped = after < before + income.total ? ` (상한 ${ENERGY_CAP} 초과분 버림)` : '';
  return addLog(s, 'income', playerId, `수입 +${income.total} (${detail}), 에너지 ${before} → ${after}${capped}`);
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

/**
 * 종료 단계: 종료 조건을 확인하고 currentPlayerId 를 다음 생존자로 넘긴다.
 * 자동 효과(전투·수입·드로우)는 더 이상 여기서 일어나지 않는다 — 그 플레이어가 자기 턴을
 * 끝낼 때(PASS) 이미 처리됐거나, 처리될 것이다. 여기서는 다음 사람이 PLACE 할 수 있도록
 * actedThisTurn 만 리셋한다.
 */
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
  s = {
    ...s,
    turn: s.turn + 1,
    currentPlayerId: next.id,
    players: s.players.map((p) => (p.id === next.id ? { ...p, actedThisTurn: false } : p)),
  };
  s = addLog(s, 'turn', next.id, `${s.turn}턴 시작: ${next.nickname} (라운드 ${s.round})`);
  return s;
}

// ---------------------------------------------------------------------------
// 액션 적용
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'SELECT_RACE':
      return selectRace(state, action.playerId, action.race);
    case 'READY':
      return ready(state, action.playerId);
    case 'PLACE': {
      const err = validatePlacement(state, action.playerId, action.cardId, action.pos);
      if (err) return { state, error: err.message };
      let s = applyPlacement(state, action.playerId, action.cardId, action.pos);
      // 누가 배치하든(자기 자신 포함) 전원 연속 패스 판정이 깨진다 (Rules.md 9.2-2)
      s = {
        ...s,
        players: s.players.map((p) =>
          p.id === action.playerId ? { ...p, passed: false, actedThisTurn: true } : p.passed ? { ...p, passed: false } : p,
        ),
      };
      // 즉발 마법으로 마지막 상대 코어가 깨졌으면 배치 중이라도 즉시 승리 (Rules.md 9.2-1)
      if (alivePlayers(s).length <= 1) return { state: finishGame(s, 'last-survivor') };
      // 배치는 턴을 자동으로 끝내지 않지만, actedThisTurn 이 서므로 같은 턴에 더는 놓을 수 없다
      // (validateCard 의 already-placed) — PASS(턴 종료)로 넘긴다 (Rules.md 5.2)
      return { state: s };
    }
    case 'PASS': {
      const err = checkTurn(state, action.playerId);
      if (err) return { state, error: err };
      const discardIds = action.discardCardIds ?? [];
      const discardErr = validateDiscard(state, action.playerId, discardIds);
      if (discardErr) return { state, error: discardErr };

      const acted = getPlayer(state, action.playerId).actedThisTurn;

      // 턴을 끝내는 본인의 마커 효과를 여기서 즉시 처리한다(Rules.md 5절, 2026-09-23 사용자 지시):
      // 전투 → 정비 → 지속 마법 만료 → 수입 → 드로우 → (선택) 손패 교체.
      let s = resolveCombat(state, action.playerId);
      if (alivePlayers(s).length <= 1) return { state: finishGame(s, 'last-survivor') };
      s = applyRepair(s, action.playerId);
      s = expirePersistentMagic(s, action.playerId);
      s = applyIncome(s, action.playerId);
      s = drawCard(s, action.playerId);
      s = applyDiscardExchange(s, action.playerId, discardIds);

      s = acted
        ? s
        : { ...s, players: s.players.map((p) => (p.id === action.playerId ? { ...p, passed: true } : p)) };
      s = addLog(
        s,
        'pass',
        action.playerId,
        acted ? `${nameOf(s, action.playerId)} 턴 종료` : `${nameOf(s, action.playerId)} 패스 (연속 ${countPasses(s)})`,
      );
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

/** discardCardIds 가 전부 실제 손패 안의 카드(같은 카드 중복 지정 시 그만큼의 장수)인지 확인 */
function validateDiscard(state: GameState, playerId: PlayerId, ids: CardId[]): string | null {
  if (ids.length === 0) return null;
  const hand = [...getPlayer(state, playerId).hand];
  for (const id of ids) {
    const idx = hand.indexOf(id);
    if (idx === -1) return '손패에 없는 카드는 버릴 수 없습니다';
    hand.splice(idx, 1);
  }
  return null;
}

/**
 * 턴을 끝낼 때 손패 카드를 원하는 만큼(0장도 가능) 버리고 남은 덱과 합쳐 시드 RNG로 섞은 뒤,
 * 손패 상한(HAND_LIMIT)까지 다시 뽑는다. discardIds 는 validateDiscard 로 이미 검증된 상태여야 한다.
 */
function applyDiscardExchange(state: GameState, playerId: PlayerId, discardIds: CardId[]): GameState {
  if (discardIds.length === 0) return state;
  const player = getPlayer(state, playerId);
  const remainingHand = [...player.hand];
  for (const id of discardIds) remainingHand.splice(remainingHand.indexOf(id), 1);

  const { items: shuffled, seed } = shuffle([...player.deck, ...discardIds], state.rngSeed);
  const n = Math.min(HAND_LIMIT - remainingHand.length, shuffled.length);
  const drawn = shuffled.slice(0, n);
  const deck = shuffled.slice(n);
  const s: GameState = {
    ...state,
    rngSeed: seed,
    players: state.players.map((p) => (p.id === playerId ? { ...p, hand: [...remainingHand, ...drawn], deck } : p)),
  };
  return addLog(
    s,
    'draw',
    playerId,
    `${discardIds.length}장 교체: 덱과 섞어 ${drawn.length}장 새로 뽑음 (손패 ${remainingHand.length + drawn.length}장, 덱 ${deck.length}장)`,
  );
}
