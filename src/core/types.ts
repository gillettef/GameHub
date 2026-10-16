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
  pos: Position;
  pref: Trait;
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
export type PersonaKey = 'random' | 'balanced' | 'greedy' | 'cautious' | 'blatant' | 'stealth' | 'ignore' | 'deducer' | 'spoiler' | 'pass' | 'low' | 'high';

export interface AgentState {
  name: string;
  kind: AgentKind;
  /** AI 난이도. 없으면 easy */
  level?: AiLevel;
  /** AI 성향 (지정하면 level 대신 사용) */
  persona?: PersonaKey;
  /** 계약 수수료 합계 (비밀 구단·지목 점수는 게임 종료 때 final 에 따로) */
  score: number;
  deals: number;
  /** 손에 남은 요구 수수료 카드. 4장을 다 쓰면 다시 1~4를 가져온다 */
  hand: Demand[];
  /** 비밀 구단 (이번 게임 구단 중 하나, 본인만 앎) */
  secret: number;
  /** 게임 종료 정산 결과 */
  final?: FinalScore;
}

export interface FinalScore {
  /** 다른 에이전트 → 내가 지목한 구단 */
  guesses: Record<number, number>;
  /** 맞힌 지목 수 × 지목 보너스 */
  guessPoints: number;
  /** 누군가 내 비밀 구단을 맞혔는가 (맞혔으면 비밀 구단 보너스 몰수) */
  exposed: boolean;
  /** 내 비밀 구단에 계약된 선수 수 (스폰서 데이는 2명으로 셈) */
  clubDeals: number;
  clubPoints: number;
  total: number;
}

export interface Offer {
  playerId: number;
  clubId: number;
  demand: Demand;
}

/** null = 패스 */
export type Submission = Offer | null;

export type InvalidReason =
  | 'not-in-market'
  | 'card-not-owned'
  /** 제시액 < 몸값 */
  | 'under-cost'
  /** 매력도가 최소치 미만이라 구단이 거절 */
  | 'rejected';

export type EntryStatus = 'won' | 'lost' | 'pass' | 'invalid';

export interface RoundEntry {
  agent: number;
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
  entries: RoundEntry[];
}

/** 구단 아래 놓인 계약 선수 */
export interface Signing {
  playerId: number;
  clubId: number;
  agent: number;
  round: number;
  /** 비밀 구단 보너스 계산 시 몇 명으로 세는가 (스폰서 데이 2) */
  weight: number;
}

/** bid: 제안 작성 / result: 라운드 결과 / guess: 비밀 구단 지목 / done: 종료 */
export type Phase = 'bid' | 'result' | 'guess' | 'done';

export interface GameState {
  v: 5;
  rng: number;
  round: number;
  phase: Phase;
  /** 라운드별 이벤트 (마지막은 항상 데드라인 데이). 이번 라운드와 다음 라운드만 공개 */
  events: EventKey[];
  market: number[];
  /** 이번 게임 구단 (게임 내내 고정) */
  clubs: number[];
  signings: Signing[];
  agents: AgentState[];
  results: RoundResult[];
}

export interface Evaluation {
  attract: number;
  /** 성공 시 수수료 */
  fee: number;
}

/** 게임 종료 시 지목: 다른 에이전트 인덱스 → 구단 id */
export type Guesses = Record<number, number>;
