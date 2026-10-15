export type Position = 'FW' | 'MF' | 'DF' | 'GK';
export type Trait = '스타' | '플레이메이커' | '베테랑' | '유망주' | '클린시트' | '멀티플레이어';
export type EventKey = 'normal' | 'fw' | 'budget' | 'young' | 'deadline';
export type TacticKey = 'charm' | 'leak' | 'fast' | 'low' | 'hijack';
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

export interface Tactic {
  key: TacticKey;
  name: string;
  desc: string;
  attract: number;
  /** 계약 성공 시 수수료 보정 */
  feeAdj: number;
  /** 몸값 조건 보정 (실속 협상 −2) */
  costAdj: number;
  /** 동률 상쇄 대신 이 카드를 낸 제안이 이긴다 (같은 동률 안에 1장일 때) */
  tieWin?: boolean;
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
  /** 지금까지 사용한 요구 수수료 카드 */
  demandUsed: Demand[];
  /** 아직 쓰지 않은 전략 카드 */
  tactics: TacticKey[];
  /** 손패: 아직 등록하지 않은 고객 선수 카드 */
  hand: number[];
  /** 지금까지 시장에 등록한 의뢰 선수 (비공개, 게임 종료 시 공개) */
  clients: ClientRegistration[];
  /** 다음 라운드에 등록할 손패 카드 (없으면 무작위) */
  pending: number | null;
  /** 게임 종료 시 받은 고객 보너스 (score 에 이미 포함) */
  clientBonus?: number;
}

export interface Offer {
  playerId: number;
  clubId: number;
  demand: Demand;
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
  /** 다음 라운드에 등록할 손패 카드 (없거나 잘못되면 무작위) */
  client?: number | null;
}

export type InvalidReason =
  | 'not-in-market'
  | 'card-not-owned'
  /** 제시액 < 몸값 */
  | 'under-cost'
  /** 하이재킹 카드를 1차에 냄 */
  | 'second-only'
  /** 1차에 대어가 아닌 선수를 냄 */
  | 'not-star'
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
  /** 매력도·요구 수수료가 같은 최고 제안끼리 서로 상쇄되어 탈락 */
  tied?: boolean;
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
  v: 4;
  rng: number;
  round: number;
  phase: Phase;
  event: EventKey;
  /** 다음 라운드 이벤트 예고 */
  nextEvent: EventKey;
  market: number[];
  clubs: number[];
  sold: number[];
  agents: AgentState[];
  results: RoundResult[];
}

export interface ClientRegistration {
  playerId: number;
  round: number;
}

/** 고객 선수 결과: self = 직접 계약, other = 다른 에이전트가 계약, unsigned = 미계약 */
export interface ClientOutcome {
  playerId: number;
  round: number;
  result: 'self' | 'other' | 'unsigned';
  /** 계약한 에이전트 */
  by?: number;
  bonus: number;
}

export interface Evaluation {
  attract: number;
  /** 성공 시 수수료 (빅딜 제외) */
  fee: number;
}
