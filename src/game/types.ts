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
/** 이벤트 성격 태그. 시설 특수효과가 이 태그에 반응한다 (data/effects.ts) */
export type EventTag =
  | 'sunny' | 'badWeather' | 'family' | 'horror' | 'summer' | 'festival' | 'special'
  | 'explore' | 'learn' | 'kids' | 'night' | 'blackout' | 'mess';
export interface EventCard {
  id: number;
  name: string;
  desc: string;
  icon: string;
  tags: EventTag[];
  effects?: { target: EventTarget; income?: number; sat?: number }[];
  visitorDelta?: number;
  trashDelta?: number;
  breakCount?: number;
}

/**
 * 시설 특수효과 (원본 카드 문구를 구현 가능한 규칙으로 재해석한 것, data/effects.ts).
 * 패시브(perChild/perAdult/flatSat/free*)는 고장 나지 않은 시설에만 적용된다.
 */
export interface CardEffect {
  /** 카드에 표시하는 효과 문구 */
  text: string;
  /** 취향(유형)이 일치하는 관객이 이용하면 만족도 추가 */
  favSat?: number;
  /** 어린이/성인 관객이 이용하면 만족도 추가 */
  childSat?: number;
  adultSat?: number;
  /** 이번 라운드 이벤트가 이 태그를 가지면 이용 1회당 수익/만족도 추가 */
  on?: { tag: EventTag; income?: number; sat?: number }[];
  /** 이번 라운드 이벤트가 이 태그를 가지면 유지비 추가 */
  upkeepOn?: { tag: EventTag; n: number };
  /** 패시브: 내 공원에 입장한 어린이/성인 1명당 만족도 */
  perChild?: number;
  perAdult?: number;
  /** 패시브: 매 라운드 만족도 */
  flatSat?: number;
  /** 패시브: 입장 관객이 n명 이상이면 수익 추가 */
  crowdIncome?: { min: number; income: number };
  /** 패시브: 관리 단계 무료 수리/청소 추가 */
  freeRepair?: number;
  freeClean?: number;
  /** 고장 나지 않음 */
  noBreak?: boolean;
  /** 정전 이벤트로 이 공원의 시설이 고장 나지 않음 */
  blackoutImmune?: boolean;
  /** 수용 인원 추가 */
  cap?: number;
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
  /** 이용으로 생긴 쓰레기 + 이벤트 쓰레기 */
  trashAdded: number;
  /** 시설을 하나도 이용하지 못한 관객 불만으로 깎인 만족도 */
  unservedSat: number;
  /** 연구원·부대시설 패시브 등으로 더해진 만족도 */
  bonusSat: number;
  /** 시설 특수효과로 더해진 수익 (crowdIncome) */
  bonusIncome: number;
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
  /** 이번 라운드에 축제를 열었는지 (라운드당 1회) */
  festival: boolean;
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
