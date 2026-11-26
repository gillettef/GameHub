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
  /** 자리별 입구 위치 */
  entrances: Position[];
  /** 조각 수 */
  tileCount: number;
}

// ---------------------------------------------------------------------------
// 식물 · 목표 (Rules.md 7·8절)
// ---------------------------------------------------------------------------

export type SpeciesId = 'grass' | 'oak' | 'pine' | 'kudzu' | 'fern' | 'dandelion' | 'lotus' | 'mushroom' | 'mugunghwa';

/** 뿌리 모양의 한 칸: 심은 칸 기준 축 좌표 차이와 놓을 큐브 수. (0,0) 이 심은 칸 (Rules.md 7절) */
export interface RootSpot {
  dq: number;
  dr: number;
  n: number;
}

/** 식물 카드. 뿌리 모양은 카드에 그림으로 그려지고, 능력은 많아야 한 줄이다 */
export interface SpeciesSpec {
  id: SpeciesId;
  name: string;
  /** 짧은 설명 (카드에 표시) */
  description: string;
  /** 회전 0 기준 뿌리 모양 (심은 칸 먼저, 놓는 순서) */
  roots: RootSpot[];
  /** 심은 뒤 두 칸 안 아무 칸에 더 놓는 큐브 수 (민들레). 0 이면 없음 */
  seed: number;
  /** 연못과 맞닿은 빈 칸이면 내 땅이 아니어도 심을 수 있다 (연꽃) */
  pondPlanting: boolean;
  /** 맞닿은 6칸에서 남의 큐브를 이만큼씩 걷어낸다 (버섯) */
  wither: number;
  /** 끝날 때 이 식물이 내 땅 위에 있으면 점수 (무궁화) */
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
  | 'variety'
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

/** 보드 위 식물. 식물은 누구의 것도 아니다 — 점수는 그 칸을 뿌리로 차지한 사람이 받는다 (Rules.md 1절) */
export interface Plant {
  /** 심은 순서 번호 (p1, p2, …) */
  id: string;
  species: SpeciesId;
  /** 심은 사람 (기록용. 점수와 무관) */
  ownerId: PlayerId;
  pos: Position;
  /** 뿌리 모양 회전 0~5 (60°씩) */
  rotation: Direction;
}

// ---------------------------------------------------------------------------
// 플레이어 · 게임 상태
// ---------------------------------------------------------------------------

export type PlayerKind = 'human' | 'ai';

export interface PlayerState {
  id: PlayerId;
  nickname: string;
  kind: PlayerKind;
  /** 자리 번호 = 차례 순서. 0부터 */
  seat: number;
  /** 로비: 준비 완료. 공개 단계: 확인함 (Rules.md 4절 7) */
  isReady: boolean;
  /** 손에 든 카드. 서버는 타인에게 장수만 보낸다 */
  hand: SpeciesId[];
  /** 기권 순서(0부터). 기권 안 했으면 null */
  surrenderedOrder: number | null;
}

/** lobby → reveal(이번 판 식물 공개, Rules.md 4절 7) → playing → finished */
export type GamePhase = 'lobby' | 'reveal' | 'playing' | 'finished';

/**
 * 단계 (Rules.md 5절, v7 「골목 일과」).
 *  - 'chore': 라운드 시작의 일과 고르기. currentPlayerId 가 지금 고르는 사람 (PICK_CHORE)
 *  - 'take' → 'plant': 명당을 놓는 일과(식빵 굽기·생선 냄새·마실·대장 방울)의 가져오기 → 심기 (TAKE → PLANT/DISCARD)
 *  - 'move': 담 넘기 차례 (MOVE)
 *  - 'call': 명당 부르기 차례 (CALL)
 */
export type RoundStage = 'chore' | 'take' | 'plant' | 'move' | 'call';

/** 일과 6장 (Rules.md 5.3). 화면 이름은 data/chores.ts */
export type ChoreId = 'bread' | 'peek' | 'roam' | 'boss' | 'move' | 'call';

export interface ChoreSpec {
  id: ChoreId;
  /** 화면 이름 (식빵 굽기 …) */
  name: string;
  /** 짧은 설명 (일과 카드에 표시) */
  description: string;
  /** 명당을 놓는 일과인가 (가져오기 → 심기) */
  place: boolean;
}

/** 담 넘기 한 번: from 칸의 내 큐브 count 개(1~2)를 맞닿은 to 칸으로 (Rules.md 5.3) */
export interface MoveStep {
  from: Position;
  to: Position;
  count: number;
}

export type LogKind = 'system' | 'take' | 'plant' | 'discard' | 'flip' | 'uproot' | 'turn' | 'surrender' | 'result' | 'chore' | 'move' | 'call' | 'peek' | 'pass';

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
  /** 내 땅 위에 서 있는 식물 수 (동점 깨기, Rules.md 9절) */
  plantsOnLand: number;
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
  /** 이번 판에 쓰는 식물 (표 순서, 공개). Rules.md 4절 */
  species: SpeciesId[];
  /** 펼쳐 둔 마켓 카드 (공개). 1장 가져가면 더미에서 바로 채운다. Rules.md 5절 */
  market: SpeciesId[];
  /** 카드 더미 (맨 앞이 다음 카드). 서버는 아무에게도 보내지 않는다 */
  pile: SpeciesId[];
  /** 이번 라운드의 선(첫 자리). 대장 방울을 고른 사람, 없으면 라운드가 끝날 때 공급처에 큐브가 가장 많이 남은 사람 (Rules.md 5.4). 공개 */
  roundStart: number;
  /** 이번 라운드에 펼친 일과 (펼친 순서, 고른 것 포함, 공개). 남은 일과는 remainingChores() (Rules.md 5.1) */
  choreOffer: ChoreId[];
  /** 자리별 이번 라운드에 고른 일과 (아직 안 골랐거나 기권이면 null, 공개). 대장 방울을 고른 자리는 bossSeat() */
  chores: (ChoreId | null)[];
  /** 생선 냄새 차례에 카드 더미 맨 위에서 앞면으로 편 카드 (공개). 가져오기가 끝나면 null (Rules.md 5.3) */
  peek: SpeciesId | null;
  /** 라운드 = 모두 한 차례씩 둔 것. 1부터 (공개 단계는 0) */
  round: number;
  /** 차례 안의 단계 (공개 단계·종료에서는 의미 없음) */
  stage: RoundStage;
  /** 전체 차례 번호. 1부터 */
  turn: number;
  /** 차례인 사람 */
  currentPlayerId: PlayerId | null;
  players: PlayerState[];
  /** 심은 순서대로 */
  plants: Plant[];
  /** 칸별 뿌리 큐브 색(자리, −1 없음). board.cells 와 같은 순서. 한 칸에는 한 색만 (줄다리기, Rules.md 6.2) */
  rootSeat: number[];
  /** 칸별 뿌리 큐브 수 */
  rootCount: number[];
  /** 보드·목표용 시드 RNG 상태. 엔진은 Math.random 을 쓰지 않는다 */
  rngSeed: number;
  /** 덱 셔플 전용 시드. 공개되는 보드·목표에서 역산할 수 없도록 rngSeed 와 따로 둔다(서버가 암호학적 난수로 만든다).
   * 손패·덱 비공개를 지키기 위해 누구에게도 보내지 않는다 */
  deckSeed: number[];
  result: GameResult | null;
  /** 진행 탭 로그 (최신이 뒤) */
  log: GameLogEntry[];
}

// ---------------------------------------------------------------------------
// 액션. 서버 룰 엔진이 검증한다
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'READY'; playerId: PlayerId }
  /** 이번 판 식물 공개 단계에서 확인 (Rules.md 4절 7) */
  | { type: 'CONFIRM'; playerId: PlayerId }
  /** 일과 고르기 단계: 펼친 일과 중 아직 안 고른 하나 (Rules.md 5.1) */
  | { type: 'PICK_CHORE'; playerId: PlayerId; chore: ChoreId }
  /** 가져오기: 마켓 take 번 카드, 'pile' = 카드 더미 맨 위 1장(뒷면), 'peek' = 생선 냄새로 편 카드 (Rules.md 5.2·5.3).
   * 생선 냄새 차례에는 'pile' 대신 'peek' */
  | { type: 'TAKE'; playerId: PlayerId; take: number | 'pile' | 'peek' }
  /** 심기. rotation: 뿌리 모양 회전(생략 0). seed: 민들레만(생략 가능) */
  | { type: 'PLANT'; playerId: PlayerId; species: SpeciesId; pos: Position; rotation?: Direction; seed?: Position }
  /** 심기 단계. 손의 어떤 카드도 심을 칸이 없을 때만 */
  | { type: 'DISCARD'; playerId: PlayerId; species: SpeciesId }
  /** 담 넘기 차례: 1~2번 이동. 두 번째 이동은 첫 이동 뒤의 보드 기준 (Rules.md 5.3) */
  | { type: 'MOVE'; playerId: PlayerId; moves: MoveStep[] }
  /** 명당 부르기 차례: 내 땅 위 식물 칸 pos, 새 방향 rotation(생략하면 지금 방향). take: 그다음 손에 가져올 마켓 번호
   * (손이 3장 미만이고 마켓에 카드가 있으면 반드시, 아니면 생략) (Rules.md 5.3) */
  | { type: 'CALL'; playerId: PlayerId; pos: Position; rotation?: Direction; take?: number }
  | { type: 'SURRENDER'; playerId: PlayerId };
