/**
 * 서버·클라이언트·AI 서비스가 공유하는 게임 도메인 타입.
 * ai/astral_ai/models.py 의 Pydantic 모델과 필드명·타입을 1:1로 맞춘다.
 * 필드를 추가·변경하면 반드시 models.py 와 shared/fixtures 도 함께 갱신한다.
 */

export type PlayerId = string;
export type RoomId = string;
export type EntityId = string;

export interface Position {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// 카드 스펙 (기준표). 실제 값은 shared/src/data 에 있다.
// ---------------------------------------------------------------------------

export interface Cost {
  resources: number;
  mana: number;
}

export interface Production {
  resources: number;
  mana: number;
}

export type CardType = 'building' | 'unit' | 'magic';

export type BuildingKind = 'main-base' | 'resource' | 'mana' | 'defense';

export interface BuildingSpec {
  id: string;
  name: string;
  kind: BuildingKind;
  /** 특수 카드 여부. 특수 카드는 덱 빌딩에서 종류별 1장만 고른다 */
  special: boolean;
  cost: Cost;
  hp: number;
  defense: number;
  production: Production;
  /** 점수 정산(F025) 시 건물 점수 */
  score: number;
  description: string;
}

export interface UnitSpec {
  id: string;
  name: string;
  special: boolean;
  cost: Cost;
  hp: number;
  attack: number;
  defense: number;
  /** 한 턴에 이동 가능한 칸 수 (체비쇼프 거리) */
  moveRange: number;
  /** 공격 가능한 거리 (체비쇼프 거리) */
  attackRange: number;
  description: string;
}

export type MagicEffect =
  | { type: 'damage'; amount: number; radius: number }
  | { type: 'heal'; amount: number }
  | { type: 'gain'; resources: number; mana: number }
  | { type: 'buff-attack'; amount: number; durationTurns: number };

export interface MagicSpec {
  id: string;
  name: string;
  special: boolean;
  cost: Cost;
  effect: MagicEffect;
  description: string;
}

/** 덱·손패에 들어가는 카드 한 장. 스펙은 specId로 조회한다 */
export interface CardRef {
  type: CardType;
  specId: string;
}

/** 덱 빌딩(F016)에서 플레이어가 고르는 특수 카드 세 장 */
export interface DeckChoice {
  buildingId: string;
  unitId: string;
  magicId: string;
}

// ---------------------------------------------------------------------------
// 보드 위 개체
// ---------------------------------------------------------------------------

export interface BuildingInstance {
  id: EntityId;
  specId: string;
  ownerId: PlayerId;
  pos: Position;
  hp: number;
}

export interface UnitInstance {
  id: EntityId;
  specId: string;
  ownerId: PlayerId;
  pos: Position;
  hp: number;
  /** 이번 턴에 이미 이동·공격했는지 */
  hasActed: boolean;
  /** 공격력 버프 (buff-attack 마법). 남은 턴이 0이 되면 제거 */
  attackBuff: { amount: number; remainingTurns: number } | null;
}

// ---------------------------------------------------------------------------
// 플레이어 · 게임 상태
// ---------------------------------------------------------------------------

export type PlayerKind = 'human' | 'ai';

export interface PlayerState {
  id: PlayerId;
  nickname: string;
  kind: PlayerKind;
  /** 로비에서 준비 완료 여부 */
  isReady: boolean;
  /** 덱 빌딩에서 고른 특수 카드. 고르기 전엔 null */
  deckChoice: DeckChoice | null;
  resources: number;
  mana: number;
  /** 뽑을 카드 더미 (맨 앞이 다음 카드) */
  deck: CardRef[];
  hand: CardRef[];
  /** 사용 완료 카드 (상태 탭에서 음영 처리, F011) */
  discard: CardRef[];
  mainBaseId: EntityId | null;
}

/** 덱 빌딩은 lobby 단계 안에서 이뤄진다 (별도 phase 없음) */
export type GamePhase = 'lobby' | 'playing' | 'finished';

export type LogKind = 'system' | 'production' | 'place' | 'move' | 'combat' | 'magic' | 'turn' | 'result';

export interface GameLogEntry {
  turn: number;
  kind: LogKind;
  message: string;
}

export type GameResultReason = 'base-destroyed' | 'deck-exhausted' | 'turn-limit';

export interface GameResult {
  winnerId: PlayerId | null;
  reason: GameResultReason;
  scores: Record<PlayerId, { territory: number; buildings: number; total: number }>;
}

export interface GameState {
  roomId: RoomId;
  phase: GamePhase;
  turn: number;
  turnLimit: number;
  currentPlayerId: PlayerId | null;
  players: PlayerState[];
  board: {
    width: number;
    height: number;
  };
  buildings: BuildingInstance[];
  units: UnitInstance[];
  /** 시드 기반 RNG 상태. 엔진은 Math.random 을 쓰지 않는다 */
  rngSeed: number;
  result: GameResult | null;
  /** 진행 탭에 표시되는 이벤트 로그 (최신이 뒤) */
  log: GameLogEntry[];
}

// ---------------------------------------------------------------------------
// 액션. 서버 룰 엔진이 검증한다. 클라이언트는 상태를 직접 계산하지 않는다.
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'SELECT_DECK'; playerId: PlayerId; choice: DeckChoice }
  | { type: 'READY'; playerId: PlayerId }
  | { type: 'PLACE_BUILDING'; playerId: PlayerId; handIndex: number; pos: Position }
  | { type: 'PLACE_UNIT'; playerId: PlayerId; handIndex: number; pos: Position }
  | { type: 'MOVE_UNIT'; playerId: PlayerId; unitId: EntityId; to: Position }
  | { type: 'ATTACK'; playerId: PlayerId; unitId: EntityId; targetId: EntityId }
  | { type: 'CAST_MAGIC'; playerId: PlayerId; handIndex: number; target: Position | EntityId | null }
  | { type: 'END_TURN'; playerId: PlayerId };

export type ActionType = Action['type'];
