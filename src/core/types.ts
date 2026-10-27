export type Position = 'FW' | 'MF' | 'DF' | 'GK';
export type Trait = '스타' | '플레이메이커' | '베테랑' | '유망주' | '클린시트' | '멀티플레이어';
export type EventKey = 'normal' | 'fw' | 'defense' | 'young' | 'budget' | 'big' | 'sponsor' | 'overseas' | 'deadline';
/** 요구 수수료 카드 (억, 정수) */
export type Demand = 1 | 2 | 3 | 4;

export interface PlayerCard {
  id: number;
  name: string;
  pos: Position;
  /** 몸값: 구단 제시액이 이 값 이상이어야 계약 가능 */
  cost: number;
  trait: Trait;
  /** 기본 수수료: 계약 성공 시 요구 수수료에 더해 받는 값 */
  base: number;
}

export interface Club {
  id: number;
  name: string;
  /** 제시액 */
  budget: number;
}

/** 구단 요구 카드 (구단마다 3장). 공개된 1장이 그 구단의 현재 필요 포지션·선호 특성 */
export interface ClubNeed {
  id: number;
  club: number;
  pos: Position;
  pref: Trait;
}

/** 목표 카드 조건: 직접 계약한 선수 중 조건에 맞는 선수가 n 명 이상 (allPos 는 FW·MF·DF·GK 각 1명 이상) */
export type GoalRule = { kind: 'pos'; pos: Position } | { kind: 'trait'; trait: Trait } | { kind: 'cost'; min: number } | { kind: 'allPos' };

/** 목표 카드 (게임 시작 때 비공개로 받고, 게임 종료 때 공개해 달성하면 보너스) */
export interface GoalCard {
  id: number;
  name: string;
  /** 조건 설명 (카드에 인쇄) */
  desc: string;
  rule: GoalRule;
  /** 필요 인원 (allPos 는 포지션 4종) */
  n: number;
}

export interface MarketEvent {
  key: EventKey;
  name: string;
  icon: string;
  desc: string;
}

export type AgentKind = 'human' | 'ai';
export type AiLevel = 'easy' | 'normal';
/** AI 성향 (시뮬레이션용. 앱은 level 로 random/balanced 를 쓴다) */
export type PersonaKey = 'random' | 'balanced' | 'greedy' | 'cautious' | 'focused' | 'opportunist' | 'ignore' | 'blocker' | 'spoiler' | 'pass' | 'low' | 'high';

export interface AgentState {
  name: string;
  kind: AgentKind;
  /** AI 난이도. 없으면 easy */
  level?: AiLevel;
  /** AI 성향 (지정하면 level 대신 사용) */
  persona?: PersonaKey;
  /** 계약 수수료 합계 (목표 보너스는 게임 종료 때 final 에 따로) */
  score: number;
  deals: number;
  /** 손에 남은 요구 수수료 카드 (종류별 RULES.copies 장으로 시작, 공개된 카드는 버린다) */
  hand: Demand[];
  /** 목표 카드 id 들 (본인만 앎, 게임 종료 때 공개) */
  goals: number[];
  /** 게임 종료 정산 결과 */
  final?: FinalScore;
}

export interface GoalResult {
  goal: number;
  /** 게임 종료 때의 진척 (스폰서 데이 계약은 2명으로 셈) */
  progress: number;
  done: boolean;
  points: number;
}

export interface FinalScore {
  goals: GoalResult[];
  /** 달성한 목표 보너스 합계 */
  goalPoints: number;
  total: number;
}

export interface Offer {
  playerId: number;
  clubId: number;
  demand: Demand;
}

/** null = 패스 */
export type Submission = Offer | null;

/** 협상 차수 (라운드마다 1차 → 2차) */
export type Stage = 1 | 2;

/** 한 라운드 제출: 1차·2차 협상을 한꺼번에 비공개로 낸다 */
export interface RoundBid {
  first: Submission;
  second: Submission;
}

export type InvalidReason =
  | 'not-in-market'
  | 'card-not-owned'
  /** 1차와 같은 선수 또는 같은 구단을 2차에 냄 */
  | 'duplicate'
  /** 2차에 고른 선수가 이번 1차에서 이미 계약됨 (협상 무산) */
  | 'signed'
  /** 제시액 < 몸값 */
  | 'under-cost'
  /** 매력도가 최소치 미만이라 구단이 거절 */
  | 'rejected';

export type EntryStatus = 'won' | 'lost' | 'pass' | 'invalid';

export interface RoundEntry {
  agent: number;
  stage: Stage;
  status: EntryStatus;
  offer?: Offer;
  attract?: number;
  /** 성공 시 받은 수수료 */
  fee?: number;
  reason?: InvalidReason;
  /** 패배 시 계약한 에이전트와 그 매력도 (아무도 계약하지 못했으면 없음) */
  winner?: number;
  winnerAttract?: number;
  /** 최고 매력도가 같은 제안끼리 서로 상쇄되어 탈락 */
  tied?: boolean;
}

export interface RoundResult {
  round: number;
  event: EventKey;
  /** 이 라운드에 공개돼 있던 구단 요구 카드 (구단 id → 요구 카드 id) */
  needs: Record<number, number>;
  entries: RoundEntry[];
}

/** 구단 아래 놓인 계약 선수 */
export interface Signing {
  playerId: number;
  clubId: number;
  agent: number;
  round: number;
  /** 목표 카드 '○명 이상' 조건에서 몇 명으로 세는가 (스폰서 데이 2) */
  weight: number;
}

/** bid: 제안 작성 / result: 라운드 결과 / done: 종료 (목표 카드 공개) */
export type Phase = 'bid' | 'result' | 'done';

export interface GameState {
  v: 8;
  rng: number;
  round: number;
  phase: Phase;
  /** 라운드별 이벤트 (마지막은 항상 데드라인 데이). 이번 라운드와 다음 라운드만 공개 */
  events: EventKey[];
  market: number[];
  /** 이번 게임 구단 (게임 내내 고정) */
  clubs: number[];
  /** 구단별 공개된 요구 카드 (구단 id → 요구 카드 id) */
  needs: Record<number, number>;
  /** 구단별 요구 카드 더미 (맨 앞이 다음에 공개될 카드, 비공개). 계약된 구단은 라운드가 끝나면 공개 카드를 맨 뒤로 넣고 맨 앞을 연다 */
  needDecks: Record<number, number[]>;
  signings: Signing[];
  agents: AgentState[];
  results: RoundResult[];
}

export interface Evaluation {
  attract: number;
  /** 성공 시 수수료 */
  fee: number;
}

