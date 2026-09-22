/**
 * 순수 함수 룰 엔진. `(state, action) => { state, error? }`. 입력 state를 변이하지 않는다.
 * 부수효과·Math.random·Date 의존 금지. 난수는 state.rngSeed 로만.
 *
 * 구현 범위 (Phase 1): 로비 참여, 덱 선택(F016), 준비·게임 시작(F018, F019),
 * 턴 시작 자원 생산·드로우(F020, F021), 턴 종료, 제한 턴·덱 소진 시 점수 정산(F025).
 * 배치·이동·전투·마법은 Phase 2.
 *
 * 턴 규칙:
 *  - 1턴은 모든 플레이어가 시작 자원(INITIAL_*)·시작 손패로 진행한다. 생산·드로우는 2턴부터.
 *  - 마지막 플레이어가 턴을 끝내면 턴 수가 1 오른다.
 *  - 제한 턴(turnLimit)을 마지막 플레이어까지 다 진행하면 점수 정산. 최종 turn 은 turnLimit.
 *  - 한 바퀴가 끝났을 때 모든 플레이어의 덱이 비어 있으면 점수 정산 (마지막 카드를 뽑은 바퀴는 끝까지 진행).
 */
import type {
  Action,
  BuildingInstance,
  CardRef,
  DeckChoice,
  GameLogEntry,
  GameState,
  PlayerId,
  PlayerState,
  Production,
  RoomId,
} from '../types/index.js';
import {
  BASE_DECK,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DEFAULT_DECK_CHOICE,
  DRAW_PER_TURN,
  INITIAL_HAND_SIZE,
  INITIAL_MANA,
  INITIAL_RESOURCES,
  MAIN_BASE_POSITIONS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TURN_LIMIT,
  getBuildingSpec,
  isValidDeckChoice,
} from '../data/index.js';
import { shuffle } from './rng.js';
import { settleByScore } from './scoring.js';

export { computeScores, computeTerritory, settleByScore } from './scoring.js';
export { nextRandom, shuffle } from './rng.js';

export interface ApplyResult {
  state: GameState;
  /** 액션이 거부된 경우 이유. 거부 시 state는 입력과 동일한 참조 */
  error?: string;
}

// ---------------------------------------------------------------------------
// 생성
// ---------------------------------------------------------------------------

/** rngSeed 는 방마다 달라야 한다 (서버가 발급). 같은 시드는 같은 셔플을 만든다 */
export function createInitialState(roomId: RoomId, rngSeed: number): GameState {
  return {
    roomId,
    phase: 'lobby',
    turn: 0,
    turnLimit: TURN_LIMIT,
    currentPlayerId: null,
    players: [],
    board: { width: BOARD_WIDTH, height: BOARD_HEIGHT },
    buildings: [],
    units: [],
    rngSeed: rngSeed >>> 0,
    result: null,
    log: [],
  };
}

export function createPlayer(id: PlayerId, nickname: string, kind: PlayerState['kind'] = 'human'): PlayerState {
  return {
    id,
    nickname,
    kind,
    isReady: false,
    deckChoice: null,
    resources: 0,
    mana: 0,
    deck: [],
    hand: [],
    discard: [],
    mainBaseId: null,
  };
}

/** 로비에 플레이어를 추가한다. 이미 있으면 그대로 */
export function joinPlayer(state: GameState, player: PlayerState): ApplyResult {
  if (state.phase !== 'lobby') return { state, error: '이미 시작된 게임입니다.' };
  if (state.players.some((p) => p.id === player.id)) return { state };
  if (state.players.length >= MAX_PLAYERS) return { state, error: `최대 ${MAX_PLAYERS}명까지 참여할 수 있습니다.` };
  return {
    state: {
      ...state,
      players: [...state.players, player],
      log: [...state.log, log(state, 'system', `${player.nickname} 님이 참여했습니다.`)],
    },
  };
}

// ---------------------------------------------------------------------------
// 액션 적용
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action): ApplyResult {
  if (state.phase === 'finished') return { state, error: '이미 끝난 게임입니다.' };
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) return { state, error: '방에 없는 플레이어입니다.' };

  switch (action.type) {
    case 'SELECT_DECK':
      return selectDeck(state, player, action.choice);
    case 'READY':
      return ready(state, player);
    case 'END_TURN':
      return endTurn(state, player);
    case 'PLACE_BUILDING':
    case 'PLACE_UNIT':
    case 'MOVE_UNIT':
    case 'ATTACK':
    case 'CAST_MAGIC':
      return { state, error: `아직 지원하지 않는 액션입니다: ${action.type}` };
  }
}

function selectDeck(state: GameState, player: PlayerState, choice: DeckChoice): ApplyResult {
  if (state.phase !== 'lobby') return { state, error: '덱은 게임 시작 전에만 고를 수 있습니다.' };
  if (!isValidDeckChoice(choice)) return { state, error: '특수 건물·유닛·마법 카드를 각각 1장씩 골라야 합니다.' };
  // 덱을 바꾸면 준비 상태는 해제된다
  return {
    state: {
      ...updatePlayer(state, player.id, (p) => ({ ...p, deckChoice: choice, isReady: false })),
      log: [...state.log, log(state, 'system', `${player.nickname} 님이 덱을 구성했습니다.`)],
    },
  };
}

function ready(state: GameState, player: PlayerState): ApplyResult {
  if (state.phase !== 'lobby') return { state, error: '이미 시작된 게임입니다.' };
  if (!player.deckChoice) return { state, error: '먼저 덱을 구성해야 준비할 수 있습니다.' };

  const readied: GameState = {
    ...updatePlayer(state, player.id, (p) => ({ ...p, isReady: true })),
    log: [...state.log, log(state, 'system', `${player.nickname} 님 준비 완료.`)],
  };
  const allReady = readied.players.length >= MIN_PLAYERS && readied.players.every((p) => p.isReady);
  if (!allReady) return { state: readied };
  const started = startGame(readied);
  // 시작 실패는 준비 자체를 되돌린다 (예: 인원수 배치 정보 없음)
  return started.error ? { state, error: started.error } : started;
}

/**
 * 게임 시작 (F018, F019): 메인 기지 대칭 배치, 초기 자원·마나, 덱 셔플, 시작 손패.
 * 모든 플레이어가 준비되면 ready() 가 호출한다. AI 방처럼 서버가 직접 호출할 수도 있다.
 */
export function startGame(state: GameState): ApplyResult {
  if (state.phase !== 'lobby') return { state, error: '이미 시작된 게임입니다.' };
  if (state.players.length < MIN_PLAYERS) return { state, error: `최소 ${MIN_PLAYERS}명이 필요합니다.` };
  const positions = MAIN_BASE_POSITIONS[state.players.length];
  if (!positions || positions.length < state.players.length) {
    return { state, error: `${state.players.length}명 게임의 기지 배치 정보가 없습니다.` };
  }
  const baseSpec = getBuildingSpec('main-base');
  if (!baseSpec) return { state, error: 'main-base 스펙이 없습니다.' };

  let seed = state.rngSeed;
  const buildings: BuildingInstance[] = [];
  const players: PlayerState[] = state.players.map((p, i) => {
    const pos = positions[i] ?? { x: 0, y: 0 };
    const baseId = `b-${p.id}-base`;
    buildings.push({ id: baseId, specId: baseSpec.id, ownerId: p.id, pos: { ...pos }, hp: baseSpec.hp });

    const choice = p.deckChoice ?? DEFAULT_DECK_CHOICE;
    // 카드 객체는 플레이어마다 새로 만든다 (상수 BASE_DECK 의 객체를 공유하지 않는다)
    const full: CardRef[] = [
      ...BASE_DECK.map((c) => ({ ...c })),
      { type: 'building', specId: choice.buildingId },
      { type: 'unit', specId: choice.unitId },
      { type: 'magic', specId: choice.magicId },
    ];
    const shuffled = shuffle(full, seed);
    seed = shuffled.seed;
    return {
      ...p,
      isReady: true,
      deckChoice: choice,
      resources: INITIAL_RESOURCES,
      mana: INITIAL_MANA,
      hand: shuffled.items.slice(0, INITIAL_HAND_SIZE),
      deck: shuffled.items.slice(INITIAL_HAND_SIZE),
      discard: [],
      mainBaseId: baseId,
    };
  });

  const first = players[0];
  if (!first) return { state, error: '플레이어가 없습니다.' };

  return {
    state: {
      ...state,
      phase: 'playing',
      turn: 1,
      currentPlayerId: first.id,
      players,
      buildings,
      units: [],
      rngSeed: seed,
      result: null,
      log: [
        ...state.log,
        {
          turn: 1,
          kind: 'system',
          message: `게임 시작. 메인 기지가 배치되고 자원 ${INITIAL_RESOURCES}, 마나 ${INITIAL_MANA}, 카드 ${INITIAL_HAND_SIZE}장으로 시작합니다.`,
        },
      ],
    },
  };
}

function endTurn(state: GameState, player: PlayerState): ApplyResult {
  if (state.phase !== 'playing') return { state, error: '게임이 진행 중이 아닙니다.' };
  if (state.currentPlayerId !== player.id) return { state, error: '자신의 턴이 아닙니다.' };

  const idx = state.players.findIndex((p) => p.id === player.id);
  const nextIdx = (idx + 1) % state.players.length;
  const next = state.players[nextIdx];
  if (!next) return { state, error: '다음 플레이어를 찾을 수 없습니다.' };
  const wrapped = nextIdx === 0;

  const ended: GameState = {
    ...state,
    // 턴 종료 시 이번 턴 행동 플래그 초기화, 버프 소진
    units: state.units.map((u) =>
      u.ownerId === player.id ? { ...u, hasActed: false, attackBuff: tickBuff(u.attackBuff) } : u,
    ),
    log: [...state.log, log(state, 'turn', `${player.nickname} 턴 종료 → ${next.nickname}`)],
  };

  if (wrapped) {
    // 제한 턴을 다 진행함 → 점수 정산 (F025). turn 은 turnLimit 로 유지
    if (state.turn >= state.turnLimit) return { state: settleByScore(ended, 'turn-limit') };
    // 모든 덱 소진 → 점수 정산 (F025). 마지막 카드를 뽑은 바퀴는 끝까지 진행했다
    if (state.players.every((p) => p.deck.length === 0)) return { state: settleByScore(ended, 'deck-exhausted') };
  }

  const switched: GameState = {
    ...ended,
    turn: wrapped ? state.turn + 1 : state.turn,
    currentPlayerId: next.id,
  };
  return { state: beginTurn(switched, next.id) };
}

/** 턴 시작: 자원·마나 생산(F020) 후 카드 드로우. 1턴은 시작 자원으로 진행하므로 생략 */
function beginTurn(state: GameState, playerId: PlayerId): GameState {
  if (state.turn <= 1) return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;

  const prod = computeProduction(state, playerId);
  const drawn = player.deck.slice(0, DRAW_PER_TURN);
  const rest = player.deck.slice(DRAW_PER_TURN);

  const entries: GameLogEntry[] = [
    log(state, 'production', `${player.nickname} 생산: 자원 +${prod.resources}, 마나 +${prod.mana}`),
  ];
  entries.push(
    drawn.length > 0
      ? log(state, 'system', `${player.nickname} 카드 ${drawn.length}장 드로우 (남은 덱 ${rest.length}장)`)
      : log(state, 'system', `${player.nickname} 덱이 비어 카드를 뽑지 못했습니다.`),
  );

  return {
    ...updatePlayer(state, playerId, (p) => ({
      ...p,
      resources: p.resources + prod.resources,
      mana: p.mana + prod.mana,
      hand: [...p.hand, ...drawn],
      deck: rest,
    })),
    log: [...state.log, ...entries],
  };
}

// ---------------------------------------------------------------------------
// 계산 (부수효과 없음)
// ---------------------------------------------------------------------------

/** 플레이어가 보유한 건물의 턴당 생산량 합계 (F020). 파괴된 건물은 목록에 없으므로 자동 차감 (F021) */
export function computeProduction(state: GameState, playerId: PlayerId): Production {
  return state.buildings
    .filter((b) => b.ownerId === playerId)
    .reduce<Production>(
      (acc, b) => {
        const spec = getBuildingSpec(b.specId);
        if (!spec) return acc;
        return { resources: acc.resources + spec.production.resources, mana: acc.mana + spec.production.mana };
      },
      { resources: 0, mana: 0 },
    );
}

// ---------------------------------------------------------------------------
// 내부 유틸
// ---------------------------------------------------------------------------

function updatePlayer(state: GameState, playerId: PlayerId, fn: (p: PlayerState) => PlayerState): GameState {
  return { ...state, players: state.players.map((p) => (p.id === playerId ? fn(p) : p)) };
}

function tickBuff(buff: { amount: number; remainingTurns: number } | null) {
  if (!buff) return null;
  const remaining = buff.remainingTurns - 1;
  return remaining > 0 ? { ...buff, remainingTurns: remaining } : null;
}

function log(state: GameState, kind: GameLogEntry['kind'], message: string): GameLogEntry {
  return { turn: state.turn, kind, message };
}
