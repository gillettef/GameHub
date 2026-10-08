/**
 * Rootbound 공용 타입 (notes/Rules.md). 서버·클라이언트·AI(Pydantic models.py)가 같은 모양을 쓴다.
 * 이름을 바꾸면 ai/astral_ai/models.py 도 함께 바꾼다.
 */

export type PlayerId = string;
export type RoomId = string;

// ---------------------------------------------------------------------------
// 보드 (Rules.md 2·3절)
// ---------------------------------------------------------------------------

/** 육각 축 좌표 */
export interface Position {
  q: number;
  r: number;
}

/** 방향 0~5: (+1,0) (+1,−1) (0,−1) (−1,0) (−1,+1) (0,+1) */
export type Direction = 0 | 1 | 2 | 3 | 4 | 5;

export type Terrain = 'empty' | 'fertile' | 'pond' | 'rock';

export interface Cell {
  q: number;
  r: number;
  terrain: Terrain;
  /** 이 칸이 속한 정원 조각 번호 (0 = 가운데 조각) */
  tile: number;
}

export interface Board {
  /** 칸 목록. 항상 r → q 오름차순 (Rules.md 11절) */
  cells: Cell[];
  /** 좌석별 입구 위치 */
  entrances: Position[];
  /** 조각 수 */
  tileCount: number;
}

// ---------------------------------------------------------------------------
// 식물 · 목표 (Rules.md 7·8절)
// ---------------------------------------------------------------------------

export type SpeciesId =
  | 'grass'
  | 'oak'
  | 'pine'
  | 'kudzu'
  | 'fern'
  | 'dandelion'
  | 'rapeseed'
  | 'lotus'
  | 'ivy'
  | 'bamboo'
  | 'mushroom'
  | 'mugunghwa';

/** 종의 뿌리 모양. 0 이면 효과 없음 */
export interface SpeciesSpec {
  id: SpeciesId;
  name: string;
  /** 짧은 설명 (카드에 표시) */
  description: string;
  self: number;
  ring1: number;
  /** 별 모양 거리 2 (6방향 직선 위 6칸) */
  star2: number;
  /** 심을 때 고른 방향 직선 거리 1..lineLength 칸에 주는 영향력 */
  line: number;
  lineLength: number;
  /** 심은 뒤 거리 2 이내 빈 칸에 놓을 수 있는 씨앗의 영향력 */
  seed: number;
  /** 연못과 맞닿은 빈 칸이면 영향력 없이도 심을 수 있다 */
  pondPlanting: boolean;
  /** 거리 1에 다른 식물이 있는 칸마다 그 칸에 추가 */
  ivy: number;
  /** 거리 1의 내 같은 종 1개당 자기 칸 추가 */
  cluster: number;
  /** 거리 1의 다른 플레이어 영향력 빼기 */
  wither: number;
  /** 비옥토에 심으면 거리 1 추가 */
  fertileRing: number;
  /** 끝날 때 이 칸이 심은 사람의 땅이면 점수 */
  bloomBonus: number;
}

export type GoalId =
  | 'pond-side'
  | 'big-garden'
  | 'long-path'
  | 'fertile-field'
  | 'edge-fence'
  | 'center-plaza'
  | 'every-tile'
  | 'flower-bed'
  | 'forest'
  | 'connected'
  | 'border-guard'
  | 'full-set'
  | 'pine-reserve'
  | 'kudzu-reserve'
  | 'fern-reserve'
  | 'grass-reserve'
  | 'mushroom-reserve'
  | 'dandelion-reserve';

export interface GoalSpec {
  id: GoalId;
  name: string;
  description: string;
  /** 종 연계 목표면 그 종 */
  species: SpeciesId | null;
}

/** 보드 위 식물 */
export interface Plant {
  /** 심은 순서 번호 (p1, p2, …) */
  id: string;
  species: SpeciesId;
  ownerId: PlayerId;
  pos: Position;
  /** 칡의 방향. 그 외 null */
  direction: Direction | null;
}

export interface Seed {
  ownerId: PlayerId;
  pos: Position;
}

// ---------------------------------------------------------------------------
// 플레이어 · 게임 상태
// ---------------------------------------------------------------------------

export type PlayerKind = 'human' | 'ai';

export interface PlayerState {
  id: PlayerId;
  nickname: string;
  kind: PlayerKind;
  /** 좌석 번호 = 차례 순서. 0부터 */
  seat: number;
  isReady: boolean;
  /** 드래프트로 고른 종 (공개) */
  drafted: SpeciesId[];
  /** 뽑을 카드 더미 (맨 앞이 다음 카드). 서버는 아무에게도 보내지 않는다 */
  deck: SpeciesId[];
  /** 손패. 서버는 타인에게 장수만 보낸다 */
  hand: SpeciesId[];
  /** 기권 순서(0부터). 기권 안 했으면 null */
  surrenderedOrder: number | null;
}

/** lobby → drafting → playing → finished */
export type GamePhase = 'lobby' | 'drafting' | 'playing' | 'finished';

export type LogKind = 'system' | 'draft' | 'plant' | 'discard' | 'flip' | 'turn' | 'surrender' | 'result';

export interface GameLogEntry {
  turn: number;
  round: number;
  /** 사건의 주체. 시스템 사건은 null */
  playerId: PlayerId | null;
  kind: LogKind;
  message: string;
}

export interface Score {
  land: number;
  goals: number;
  /** 목표별 점수 (공개 목표 순서) */
  goalBreakdown: number[];
  bloom: number;
  komi: number;
  total: number;
}

export type GameResultReason = 'complete' | 'last-standing';

export interface GameResult {
  reason: GameResultReason;
  /** 순위 순 플레이어 id (Rules.md 9절). 첫 번째가 승자 */
  ranking: PlayerId[];
  scores: Record<PlayerId, Score>;
}

export interface GameState {
  roomId: RoomId;
  phase: GamePhase;
  /** 로비에서는 null, 시작하면 조립된 보드 */
  board: Board | null;
  /** 공개 목표 3장 */
  goals: GoalId[];
  /** 드래프트 픽 순서(좌석 id 목록 전체)와 다음 픽 위치 */
  draftOrder: PlayerId[];
  draftIndex: number;
  /** 라운드 = 모두 한 번씩 둔 것. 1부터 */
  round: number;
  /** 전체 차례 번호. 1부터, 드래프트 중에는 0 */
  turn: number;
  /** 드래프트 중에는 다음에 고를 사람, 진행 중에는 차례인 사람 */
  currentPlayerId: PlayerId | null;
  players: PlayerState[];
  /** 심은 순서대로 */
  plants: Plant[];
  seeds: Seed[];
  /** 보드·목표용 시드 RNG 상태. 엔진은 Math.random 을 쓰지 않는다 */
  rngSeed: number;
  /** 덱 셔플 전용 시드. 공개되는 보드·목표에서 역산할 수 없도록 rngSeed 와 따로 둔다(서버가 암호학적 난수로 만든다).
   * 손패·덱 비공개를 지키기 위해 누구에게도 보내지 않는다 */
  deckSeed: number;
  result: GameResult | null;
  /** 진행 탭 로그 (최신이 뒤) */
  log: GameLogEntry[];
}

// ---------------------------------------------------------------------------
// 액션. 서버 룰 엔진이 검증한다
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'READY'; playerId: PlayerId }
  | { type: 'DRAFT'; playerId: PlayerId; species: SpeciesId }
  /** direction: 칡만. seed: 민들레만(생략 가능) */
  | { type: 'PLANT'; playerId: PlayerId; species: SpeciesId; pos: Position; direction?: Direction; seed?: Position }
  /** 손패의 어떤 카드도 심을 칸이 없을 때만 */
  | { type: 'DISCARD'; playerId: PlayerId; species: SpeciesId }
  | { type: 'SURRENDER'; playerId: PlayerId };

export type ActionType = Action['type'];
