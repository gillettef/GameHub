/**
 * 게임 상수 (Rules.md 12절). 엔진·UI·AI 어디에도 이 값을 하드코딩하지 않는다.
 * Python 쪽은 shared/fixtures/specs.json 의 constants 로 같은 값을 읽는다.
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** 시작 에너지 (2026-09-22: 3 → 5) */
export const STARTING_ENERGY = 5;
/** 코어 기본 수입 (턴당). 건물이 하나도 없어도 굶지 않게 (2026-09-22: 1 → 2, 육각 전환 2 → 1) */
export const CORE_BASE_INCOME = 1;
/** 에너지 저장 상한. 초과분은 버려진다 (2026-09-22: 후반 건물 누적 수입으로 무한정 쌓이는 것을 막음) */
export const ENERGY_CAP = 20;
export const CORE_HP = 20;
/** 육각 거리 기준 시야 반경 (2026-09-22: 육각 전환 2 → 1) */
export const CORE_SIGHT = 1;

export const INITIAL_HAND_SIZE = 4;
/** 손패 상한. 상한이면 드로우 생략 */
export const HAND_LIMIT = 5;
export const DRAW_PER_TURN = 1;

/** 종족별 기본 카드 표(카탈로그 분류)의 copies 합. baseDeckOf 불변식 검증에만 쓴다 */
export const BASE_DECK_SIZE = 22;
/** 덱 빌딩에서 완성해야 하는 총 장수. 2026-09-23부터 기본/특수 구분 없이 이 장수를 채우면 된다 */
export const DECK_SIZE = 25;

/** 광맥 위 건물의 생산 보너스 */
export const VEIN_PRODUCTION_BONUS = 1;
/** 영토 1칸 점수 */
export const SCORE_PER_TERRITORY = 1;
/** 덤(komi): 좌석 번호 × 이 값을 최종 점수에 더한다. 선턴(좌석 0)이 유리하므로 나중 좌석일수록
 * 소소한 보너스를 받는다 (2026-09-23 신설, Rules.md 9.1/9.3) */
export const KOMI_PER_SEAT = 1;
/** 침투 키워드: 적 마커로부터 이 육각 거리 이내에도 배치 가능 */
export const INFILTRATE_RANGE = 1;
/** 정비 키워드: 반경(육각 거리)과 회복량 */
export const REPAIR_RADIUS = 1;
export const REPAIR_AMOUNT = 1;
/** 과부하 키워드(오토마타): 반경과 인접 건물 1개당 생산 보너스 */
export const OVERCLOCK_RADIUS = 1;
export const OVERCLOCK_BONUS_PER_NEIGHBOR = 1;

export const CONSTANTS = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  STARTING_ENERGY,
  CORE_BASE_INCOME,
  ENERGY_CAP,
  CORE_HP,
  CORE_SIGHT,
  INITIAL_HAND_SIZE,
  HAND_LIMIT,
  DRAW_PER_TURN,
  BASE_DECK_SIZE,
  DECK_SIZE,
  VEIN_PRODUCTION_BONUS,
  SCORE_PER_TERRITORY,
  KOMI_PER_SEAT,
  INFILTRATE_RANGE,
  REPAIR_RADIUS,
  REPAIR_AMOUNT,
  OVERCLOCK_RADIUS,
  OVERCLOCK_BONUS_PER_NEIGHBOR,
} as const;
