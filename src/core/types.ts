export type Position = 'FW' | 'MF' | 'DF' | 'GK';
export type Trait = '스타' | '플레이메이커' | '베테랑' | '유망주' | '클린시트' | '멀티플레이어';
export type EventKey = 'normal' | 'fw' | 'budget' | 'young' | 'deadline';
export type TacticKey = 'charm' | 'leak' | 'fast' | 'low' | 'hijack';
export type FeeRate = 5 | 10 | 15 | 20;

export interface PlayerCard {
  id: number;
  name: string;
  pos: Position;
  /** 카드 표시용 가치. 계산에는 쓰이지 않는다. */
  value: number;
  minSalary: number;
  trait: Trait;
  bonus: number;
}

export interface Club {
  id: number;
  name: string;
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

export interface Tactic {
  key: TacticKey;
  name: string;
  desc: string;
  attract: number;
  feeAdj: number;
  successBonus: number;
  salaryAdj: number;
  /** 2차 협상에서만 낼 수 있는 카드 (하이재킹) */
  secondOnly?: boolean;
}

export type AgentKind = 'human' | 'ai';
export type AiLevel = 'easy' | 'normal';

export interface AgentState {
  name: string;
  kind: AgentKind;
  /** AI 난이도. 없으면 easy (구버전 저장 데이터 호환) */
  level?: AiLevel;
  score: number;
  deals: number;
  /** 지금까지 사용한 수수료율 카드 */
  feeUsed: FeeRate[];
  /** 아직 쓰지 않은 전략 카드 */
  tactics: TacticKey[];
}

export interface Offer {
  playerId: number;
  clubId: number;
  /** 제시 연봉 (전략 카드 보정 전) */
  salary: number;
  fee: FeeRate;
  tactic: TacticKey | null;
}

/** null = 패스 */
export type Submission = Offer | null;

/** 협상 차수: 1차 / 2차 */
export type Stage = 1 | 2;

/** 한 라운드의 제출 (1차·2차 동시 비공개) */
export interface RoundSubmission {
  first: Submission;
  second: Submission;
}

export type InvalidReason =
  | 'not-in-market'
  | 'card-not-owned'
  | 'salary-below-min'
  | 'over-budget'
  /** 하이재킹 카드를 1차에 냄 */
  | 'second-only'
  /** 1차와 같은 선수/구단을 2차에 냄 */
  | 'duplicate';

/**
 * void: 2차 협상 무산 (1차에서 이미 계약된 선수, 카드 반환)
 * hijacked: 1차 계약이 2차 하이재킹으로 파기됨
 */
export type EntryStatus = 'won' | 'lost' | 'pass' | 'none' | 'invalid' | 'void' | 'hijacked';

export interface RoundEntry {
  agent: number;
  stage: Stage;
  status: EntryStatus;
  offer?: Offer;
  /** 유효 연봉 s */
  salary?: number;
  attract?: number;
  /** 성공 시 받은 수수료 (빅딜 보너스 포함) */
  fee?: number;
  bigDeal?: boolean;
  /** 하이재킹으로 성사된 계약 */
  hijack?: boolean;
  reason?: InvalidReason;
  /** 패배 시 승자의 매력도 */
  winnerAttract?: number;
  winner?: number;
  /** 2차 하이재킹이 1차 계약을 넘지 못해 패배 */
  hijackFailed?: boolean;
  /** hijacked 일 때 하이재커 */
  by?: number;
}

export interface RoundResult {
  round: number;
  event: EventKey;
  entries: RoundEntry[];
}

export type Phase = 'bid' | 'result' | 'done';

export interface GameState {
  v: 2;
  rng: number;
  round: number;
  phase: Phase;
  event: EventKey;
  market: number[];
  clubs: number[];
  sold: number[];
  agents: AgentState[];
  results: RoundResult[];
}

export interface Evaluation {
  salary: number;
  attract: number;
  fee: number;
}
