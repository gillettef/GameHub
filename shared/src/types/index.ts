/**
 * 서버·클라이언트·AI 서비스가 공유하는 게임 도메인 타입 (규칙 v2, notes/Rules.md).
 * ai/astral_ai/models.py 의 Pydantic 모델과 필드명·타입을 1:1로 맞춘다.
 * 필드를 추가·변경하면 반드시 models.py 와 shared/fixtures 도 함께 갱신한다.
 */

export type PlayerId = string;
export type RoomId = string;
export type MarkerId = string;
export type CardId = string;
export type MapId = string;

/** odd-r 오프셋 육각 좌표. x는 열, y는 행이며 홀수 행은 반 칸 오른쪽으로 밀린다 (Rules.md 3절) */
export interface Position {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// 카드 기준표 (Rules.md 10절). 실제 값은 shared/src/data/cards.ts 에만 둔다.
// ---------------------------------------------------------------------------

/** 손패 카드 종류 */
export type CardType = 'building' | 'unit' | 'magic';
/** 보드 위 마커 종류. 코어는 덱에 없지만 마커다 */
export type MarkerKind = 'core' | CardType;

/** 침투: 적 마커 거리 1 이내에도 배치 가능. 정비: 턴 시작 시 반경 1 아군 체력 +1.
 * 과부하: 턴 시작 수입 계산 시 반경 1 이내 자신 소유 건물 수만큼 생산 추가(오토마타 종족) */
export type Keyword = 'infiltrate' | 'repair' | 'overclock';

/** 종족 (완전 비대칭 카드 세트, notes/Rules.md 10절) */
export type RaceId = 'coalition' | 'swarm' | 'automata';

export interface RaceDef {
  id: RaceId;
  name: string;
  concept: string;
}

/** 마법 효과. 즉발형은 배치 즉시 적용 후 사라지고, 지속형은 마커로 남는다 (Rules.md 7.2) */
export type MagicEffect =
  | { kind: 'damage'; amount: number; radius: number }
  | { kind: 'heal'; amount: number; radius: number }
  | { kind: 'energy'; amount: number }
  | { kind: 'persistent'; durationTurns: number };

export interface CardSpec {
  id: CardId;
  name: string;
  kind: MarkerKind;
  /** 소속 종족. 코어만 null(종족 공통) */
  race: RaceId | null;
  /** 특수 카드 여부. 덱 빌딩(F016)에서 종류별 1장만 고른다 */
  special: boolean;
  /** 배치 비용(에너지). 코어는 0 */
  cost: number;
  /** 시야 반경(육각 거리). 즉발 마법은 0 */
  sight: number;
  /** 최대 체력. 즉발 마법은 0 */
  hp: number;
  attack: number;
  /** 사거리(육각 거리). 공격력이 없으면 0 */
  range: number;
  /** 턴당 생산 에너지. 건물·코어만 > 0 */
  production: number;
  /** 마커 점수 (Rules.md 9.1) */
  score: number;
  keywords: Keyword[];
  /** 마법 카드만. 그 외 null */
  effect: MagicEffect | null;
  /** 기본 덱 장수. 특수 카드·코어는 0 */
  copies: number;
  description: string;
}

/** 덱 빌딩(F016)에서 플레이어가 고르는 종족 + 특수 카드 세 장 */
export interface DeckChoice {
  race: RaceId;
  buildingId: CardId;
  unitId: CardId;
  magicId: CardId;
}

// ---------------------------------------------------------------------------
// 맵 (Rules.md 11절). 실제 값은 shared/src/data/maps.ts 에만 둔다.
// ---------------------------------------------------------------------------

export type Terrain = 'space' | 'asteroid' | 'vein';

export interface MapDef {
  id: MapId;
  name: string;
  /** 이 맵의 정원. 로비 인원과 같아야 시작할 수 있다 */
  players: number;
  /** 한 변의 길이. 보드는 width=height=size 인 직사각 육각 판(odd-r 오프셋) */
  size: number;
  roundLimit: number;
  /** 좌석 순서대로 코어 좌표 */
  corePositions: Position[];
  asteroids: Position[];
  veins: Position[];
  description: string;
}

/** GameState 에 실리는 보드 지형. 맵 정의에서 복사한다 */
export interface Board {
  width: number;
  height: number;
  asteroids: Position[];
  veins: Position[];
}

// ---------------------------------------------------------------------------
// 보드 위 마커
// ---------------------------------------------------------------------------

export interface Marker {
  id: MarkerId;
  specId: CardId;
  kind: MarkerKind;
  ownerId: PlayerId;
  pos: Position;
  hp: number;
  /** 지속 마법의 남은 턴. 소유자 턴 시작마다 1 줄고 0이면 제거. 그 외 null */
  remainingTurns: number | null;
}

// ---------------------------------------------------------------------------
// 플레이어 · 게임 상태
// ---------------------------------------------------------------------------

export type PlayerKind = 'human' | 'ai';

export interface PlayerState {
  id: PlayerId;
  nickname: string;
  kind: PlayerKind;
  /** 좌석 번호 = 턴 순서. 0부터 */
  seat: number;
  /** 로비에서 준비 완료 여부 */
  isReady: boolean;
  /** 덱 빌딩에서 고른 특수 카드. 고르기 전엔 null */
  deckChoice: DeckChoice | null;
  energy: number;
  /** 뽑을 카드 더미 (맨 앞이 다음 카드). 서버는 타인에게 보내지 않는다 */
  deck: CardId[];
  /** 손패. 서버는 타인에게 장수만 보낸다 */
  hand: CardId[];
  /** 사용 완료 카드 (F011) */
  discard: CardId[];
  alive: boolean;
  /** 탈락 순서 (0부터). 생존 중이면 null. 순위 정렬에 쓴다 */
  eliminatedOrder: number | null;
  /** 현재 연속 패스 구간에서 패스했는지. 누군가 배치하면 전원 false (Rules.md 9.2-2) */
  passed: boolean;
  /** 이번 턴에 배치를 한 번이라도 했는지. beginTurn 에서 false 로 리셋 (Rules.md 5.2) */
  actedThisTurn: boolean;
}

/** 덱 빌딩은 lobby 단계 안에서 이뤄진다 (별도 phase 없음) */
export type GamePhase = 'lobby' | 'playing' | 'finished';

export type LogKind =
  | 'system'
  | 'turn'
  | 'combat'
  | 'repair'
  | 'expire'
  | 'income'
  | 'draw'
  | 'place'
  | 'magic'
  | 'destroy'
  | 'eliminate'
  | 'pass'
  | 'surrender'
  | 'result';

export interface GameLogEntry {
  turn: number;
  round: number;
  /** 사건의 주체. 시스템 사건은 null */
  playerId: PlayerId | null;
  kind: LogKind;
  message: string;
}

export interface Score {
  territory: number;
  markers: number;
  total: number;
}

export type GameResultReason = 'last-survivor' | 'all-pass' | 'round-limit';

export interface GameResult {
  reason: GameResultReason;
  /** 순위 순 플레이어 id (Rules.md 9.3). 첫 번째가 승자 */
  ranking: PlayerId[];
  scores: Record<PlayerId, Score>;
}

export interface GameState {
  roomId: RoomId;
  phase: GamePhase;
  mapId: MapId;
  board: Board;
  roundLimit: number;
  /** 라운드 = 생존자 전원이 한 번씩 턴을 마친 것. 1부터 */
  round: number;
  /** 전체 턴 번호. 1부터, 플레이어 턴마다 1씩 */
  turn: number;
  currentPlayerId: PlayerId | null;
  players: PlayerState[];
  /** 항상 y → x 오름차순으로 정렬 (Rules.md 13절) */
  markers: Marker[];
  /** 다음 마커 id 번호 */
  nextMarkerId: number;
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
  | { type: 'PLACE'; playerId: PlayerId; cardId: CardId; pos: Position }
  | { type: 'PASS'; playerId: PlayerId }
  | { type: 'SURRENDER'; playerId: PlayerId };

export type ActionType = Action['type'];

/** 배치 거부 사유 코드 (F022). 메시지는 엔진이 만든다 */
export type PlacementErrorCode =
  | 'not-playing'
  | 'unknown-player'
  | 'not-your-turn'
  | 'not-in-hand'
  | 'not-enough-energy'
  | 'out-of-bounds'
  | 'asteroid'
  | 'occupied'
  | 'out-of-sight';

export interface PlacementError {
  code: PlacementErrorCode;
  message: string;
}
