export const RIDE_TYPES = ['스릴형', '패밀리형', '공포형', '어드벤처형', '교육형', '물놀이형', '놀이형'] as const;
export type RideType = (typeof RIDE_TYPES)[number];
export type FacilityType = RideType | '상점' | '부대시설';
export type VisitorKind = 'child' | 'adult';
export type StaffKey = 'engineer' | 'marketer' | 'cleaner' | 'guide' | 'researcher';
export const STAFF_KEYS: StaffKey[] = ['marketer', 'guide', 'engineer', 'cleaner', 'researcher'];

export interface FacilityCard {
  id: number;
  type: FacilityType;
  name: string;
  cost: number;
  upkeep: number;
  /** [어린이, 성인] */
  income: [number, number];
  sat: [number, number];
  effect: string;
}

export interface Visitor {
  id: number;
  kind: VisitorKind;
  fav: RideType;
  /** 지불 가능한 입장료 상한 (관객 트랙 $1~$4) */
  budget: number;
}

export type EventTarget = 'all' | 'outdoor' | 'indoor' | FacilityType[];
export interface EventCard {
  id: number;
  name: string;
  desc: string;
  icon: string;
  effects?: { target: EventTarget; income?: number; sat?: number }[];
  visitorDelta?: number;
  trashDelta?: number;
  breakCount?: number;
  badWeather?: boolean;
}

export interface Built {
  id: number;
  broken: boolean;
}

export interface VisitLine {
  visitor: Visitor;
  facility: string;
  facilityType: FacilityType;
  income: number;
  sat: number;
}

export interface RoundReport {
  drawn: number;
  entered: number;
  fee: number;
  feeIncome: number;
  visits: VisitLine[];
  unserved: number;
  income: number;
  upkeep: number;
  sat: number;
  vpGain: number;
  broken: string[];
  trashAdded: number;
  debtVp: number;
  /** 관리 단계 이후 */
  trashPenalty: number;
}

export interface Player {
  id: number;
  name: string;
  isAI: boolean;
  /** AI 성향 (engine.ts AI_PROFILES 키) */
  ai?: string;
  /** 게임 종료 시 잔액에서 환산된 VP (UI 표시용) */
  endBonus?: number;
  money: number;
  vp: number;
  satPool: number;
  facilities: (Built | null)[];
  staff: Record<StaffKey, number>;
  trash: number;
  fee: number;
  freeRepairs: number;
  freeCleans: number;
  /** 이번 라운드에 내 입구로 가져온 관객 (공개 정보) */
  visitors: Visitor[];
  report: RoundReport | null;
}

export type Phase = 'construct' | 'promote' | 'operate' | 'manage' | 'gameOver';

export interface GameState {
  round: number;
  maxRounds: number;
  phase: Phase;
  players: Player[];
  first: number;
  /** 1라운드 선 플레이어 (이후 시계 방향 순환). 시작 자금 보정의 기준 */
  startFirst: number;
  turn: number;
  passed: boolean[];
  market: number[];
  facilityDeck: number[];
  visitorDeck: Visitor[];
  /** 관객 트랙: 테이블 중앙에 공개된 관객카드. by = 가져간 플레이어 */
  visitorRow: { v: Visitor; by: number | null }[];
  promoteStep: 'pick' | 'fee';
  pickTurn: number;
  pickDone: boolean[];
  eventDeck: number[];
  event: EventCard | null;
  nextVisitorId: number;
  rng: number;
  log: string[];
  notice: string | null;
}
