export type Position = 'FW' | 'MF' | 'DF' | 'GK';
export type Trait = '스타' | '플레이메이커' | '베테랑' | '유망주' | '클린시트' | '멀티플레이어';
export type EventKey = 'normal' | 'fw' | 'budget' | 'young' | 'deadline';
export type TacticKey = 'charm' | 'leak' | 'fast' | 'low';
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
}

export type AgentKind = 'human' | 'ai';

export interface AgentState {
  name: string;
  kind: AgentKind;
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

export type InvalidReason =
  | 'not-in-market'
  | 'card-not-owned'
  | 'salary-below-min'
  | 'over-budget';

export type EntryStatus = 'won' | 'lost' | 'pass' | 'none' | 'invalid';

export interface RoundEntry {
  agent: number;
  status: EntryStatus;
  offer?: Offer;
  /** 유효 연봉 s */
  salary?: number;
  attract?: number;
  /** 성공 시 받은 수수료 (빅딜 보너스 포함) */
  fee?: number;
  bigDeal?: boolean;
  reason?: InvalidReason;
  /** 패배 시 승자의 매력도 */
  winnerAttract?: number;
  winner?: number;
}

export interface RoundResult {
  round: number;
  event: EventKey;
  entries: RoundEntry[];
}

export type Phase = 'bid' | 'result' | 'done';

export interface GameState {
  v: 1;
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
