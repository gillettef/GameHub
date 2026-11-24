export const RIDE_TYPES = ['스릴형', '패밀리형', '공포형', '어드벤처형', '교육형', '물놀이형', '놀이형'] as const;
export type RideType = (typeof RIDE_TYPES)[number];
export type FacilityType = RideType | '상점' | '부대시설';
export type StaffKey = 'engineer' | 'marketer' | 'cleaner' | 'guide' | 'researcher';
export const STAFF_KEYS: StaffKey[] = ['marketer', 'guide', 'engineer', 'cleaner', 'researcher'];

/** 원본 시설 카드 (notes/놀이공원_v1.xlsx 그대로, tools/gen_facilities.py 생성) */
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

/** 시설 역할: 놀이기구 = 만족도, 상점 = 돈, 부대시설 = 고정 효과 */
export type CardKind = 'ride' | 'shop' | 'amenity';
/** 놀이기구 대상: 해당 관객만 만족도를 준다 (all = 모두) */
export type RideTarget = 'child' | 'adult' | 'all';

/**
 * 이벤트 아이콘(태그). 시설 특수효과가 이 아이콘에 반응한다.
 * 날씨·시간·축제 4종 + 유형 테마 이벤트 6종.
 */
export type EventTag =
  | 'sunny' | 'badWeather' | 'night' | 'festival'
  | 'family' | 'horror' | 'summer' | 'explore' | 'learn' | 'kids';

/**
 * 시설 특수효과 (원본 카드 문구를 v1 규칙의 개념으로 재해석, data/cards.ts).
 * 놀이기구 효과는 "그 놀이기구에 그룹 1개를 배치할 때마다", 부대시설 효과는 "매 라운드" 적용한다.
 */
export interface CardEffect {
  text: string;
  /* 놀이기구 — 배치 1회당 */
  /** 이 아이콘의 이벤트면 만족도 추가 */
  on?: { tag: EventTag; sat: number }[];
  /** 취향 일치 시 기본 보너스에 더해 만족도 추가 */
  favSat?: number;
  /** 어린이와 성인이 함께 있는 그룹이면 만족도 추가 */
  mixedSat?: number;
  /** 어린이가 1명이라도 있는 그룹이면 만족도 추가 */
  kidSat?: number;
  /** 수리 토큰을 받지 않음 */
  noRepair?: boolean;
  /** 이 아이콘의 이벤트면 유지비 추가 */
  upkeepOn?: { tag: EventTag; n: number };
  /* 상점 — 매 라운드 (그룹이 1개라도 입장했을 때) */
  /** 이 아이콘의 이벤트면 수익 추가 */
  shopOn?: { tag: EventTag; income: number }[];
  /** 입장 그룹이 min개 이상이면 수익 추가 */
  crowdIncome?: { min: number; income: number };
  /* 부대시설 — 매 라운드 (수리 토큰과 무관하게 항상) */
  flatSat?: number;
  /** 이 아이콘의 이벤트면 만족도 추가 */
  flatOn?: { tag: EventTag; sat: number }[];
  flatIncome?: number;
  /** 이 아이콘의 이벤트면 수익 추가 */
  flatIncomeOn?: { tag: EventTag; income: number }[];
  /** 입장 그룹 1개당 수익 */
  perGroupIncome?: number;
  /** 놀이기구에 배치한 그룹 중 어린이가 있는 그룹 1개당 / 성인만 있는 그룹 1개당 만족도 */
  kidGroupSat?: number;
  adultGroupSat?: number;
  /** 관리 단계 무료 수리/청소 */
  freeRepair?: number;
  freeClean?: number;
  /** 정원 초과 배치 가능 횟수 (안내 직원 1명과 같은 효과) */
  overflow?: number;
  /** 정전 이벤트의 수리 토큰을 받지 않음 */
  blackoutImmune?: boolean;
}

/** 카드에 인쇄되는 값 (원본 수치에서 data/cards.ts 규칙으로 한 번 변환) */
export interface ParkCard {
  id: number;
  type: FacilityType;
  name: string;
  kind: CardKind;
  cost: number;
  upkeep: number;
  /** 놀이기구: 정원(명) */
  cap: number;
  /** 놀이기구: 대상 */
  target: RideTarget;
  /** 놀이기구: 대상 1명당 만족도 */
  sat: number;
  /** 상점: 입장 그룹 1개당 수익 */
  income: number;
  /** 야외 시설 여부 (날씨 이벤트) */
  outdoor: boolean;
  fx: CardEffect;
  /** 원본 카드 문구 */
  orig: string;
}

/** 관객 그룹 카드 */
export interface Group {
  id: number;
  name: string;
  kids: number;
  adults: number;
  /** 지불 한도: 1인 입장료가 이 값 이하일 때만 입장 */
  budget: number;
  fav: RideType;
}

export interface EventCard {
  id: number;
  name: string;
  desc: string;
  icon: string;
  tags: EventTag[];
  /** 놀이기구 배치 1회당 만족도 보정 */
  rides?: { target: 'all' | 'outdoor' | 'indoor' | RideType[]; sat: number }[];
  /** 관객 모집 수 보정 */
  groupDelta?: number;
  /** 상점 1곳당 수익 보정 */
  shopDelta?: number;
  /** 운영 뒤 쓰레기 추가 */
  trashDelta?: number;
  /** 라운드 시작 시 정원이 가장 큰 놀이기구 1곳에 수리 토큰 */
  blackout?: boolean;
  /** 이번 라운드 입장료 상한 */
  maxFee?: number;
}

export interface Built {
  id: number;
  /** 수리 토큰: 있으면 이번 라운드에 운영하지 못한다 */
  repair: boolean;
}

export interface PlaceLine {
  group: Group;
  facility: string;
  facilityType: FacilityType;
  sat: number;
  /** 정원을 꽉 채워 수리 토큰을 받았는지 */
  wear: boolean;
}

export interface RoundReport {
  fee: number;
  /** 입장한 그룹 수 / 인원 */
  groups: number;
  people: number;
  /** 입장료로 돌아간 그룹 */
  turnedBack: Group[];
  feeIncome: number;
  places: PlaceLine[];
  /** 놀이기구에 배치하지 못한 그룹 */
  unplaced: Group[];
  unplacedSat: number;
  shopIncome: number;
  /** 부대시설 수익 */
  bonusIncome: number;
  /** 부대시설 만족도 */
  bonusSat: number;
  upkeep: number;
  /** 이번 운영으로 얻은 만족도 합 */
  sat: number;
  /** 유지비를 다 못 내 깎인 만족도 */
  debtSat: number;
  trashAdded: number;
  /** 관리 단계 이후: 쓰레기 감점 */
  trashPenalty: number;
}

export interface Player {
  id: number;
  name: string;
  isAI: boolean;
  /** AI 성향 (engine.ts AI_PROFILES 키) */
  ai?: string;
  money: number;
  /** 만족도 토큰 = 점수 */
  vp: number;
  /** 게임 종료 시 잔액에서 환산된 만족도 (표시용) */
  endBonus?: number;
  facilities: (Built | null)[];
  staff: Record<StaffKey, number>;
  trash: number;
  /** 이번 라운드 건설한 시설 수 */
  built: number;
  /** 이번 라운드 인력을 고용했는지 (라운드당 1명) */
  hired: boolean;
  /** 홍보 입찰액 (공개 전에는 AI도 null) */
  bid: number | null;
  fee: number;
  /** 이번 라운드에 데려온 관객 그룹 id */
  groups: number[];
  /** groups[i]를 배치한 부지 칸 (null = 배치 안 함) */
  place: (number | null)[];
  report: RoundReport | null;
}

export type Phase = 'construct' | 'promote' | 'operate' | 'manage' | 'gameOver';

export interface GameState {
  round: number;
  maxRounds: number;
  phase: Phase;
  /** promote: bid(입찰) → pick(관객 고르기) / operate: fee(입장료) → place(배치) → result(결과) */
  step: 'bid' | 'pick' | 'fee' | 'place' | 'result' | null;
  players: Player[];
  first: number;
  /** 1라운드 선 플레이어 (이후 시계 방향 순환). 시작 자금의 기준 */
  startFirst: number;
  turn: number;
  passed: boolean[];
  market: number[];
  facilityDeck: number[];
  groupDeck: number[];
  /** 관객 줄: 테이블 중앙에 공개된 그룹 카드. by = 가져간 플레이어 */
  groupRow: { g: number; by: number | null }[];
  /** 입찰 순위대로 정렬된 플레이어 id (관객 고르기 순서) */
  pickOrder: number[];
  pickTurn: number;
  pickDone: boolean[];
  eventDeck: number[];
  event: EventCard | null;
  /** 미리 공개된 다음 라운드 운영카드 */
  nextEvent: EventCard | null;
  rng: number;
  log: string[];
  notice: string | null;
}
