/**
 * 게임 상수 (Rules.md 12절). 엔진·UI·AI 어디에도 이 값을 하드코딩하지 않는다.
 * Python 쪽은 shared/fixtures/specs.json 의 constants 로 같은 값을 읽는다.
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** 시작 에너지 (2026-09-22: 3 → 5) */
export const STARTING_ENERGY = 5;
/** 코어 기본 수입 (턴당). 건물이 하나도 없어도 굶지 않게 (2026-09-22: 1 → 2) */
export const CORE_BASE_INCOME = 2;
export const CORE_HP = 20;
export const CORE_SIGHT = 2;

export const INITIAL_HAND_SIZE = 4;
/** 손패 상한. 상한이면 드로우 생략 */
export const HAND_LIMIT = 5;
export const DRAW_PER_TURN = 1;

export const BASE_DECK_SIZE = 22;
/** 덱 빌딩에서 고르는 특수 카드 수 (건물·유닛·마법 각 1장) */
export const SPECIAL_PICKS = 3;

/** 광맥 위 건물의 생산 보너스 */
export const VEIN_PRODUCTION_BONUS = 1;
/** 영토 1칸 점수 */
export const SCORE_PER_TERRITORY = 1;
/** 침투 키워드: 적 마커로부터 이 거리 이내에도 배치 가능 */
export const INFILTRATE_RANGE = 1;
/** 정비 키워드: 반경과 회복량 */
export const REPAIR_RADIUS = 1;
export const REPAIR_AMOUNT = 1;

export const CONSTANTS = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  STARTING_ENERGY,
  CORE_BASE_INCOME,
  CORE_HP,
  CORE_SIGHT,
  INITIAL_HAND_SIZE,
  HAND_LIMIT,
  DRAW_PER_TURN,
  BASE_DECK_SIZE,
  SPECIAL_PICKS,
  VEIN_PRODUCTION_BONUS,
  SCORE_PER_TERRITORY,
  INFILTRATE_RANGE,
  REPAIR_RADIUS,
  REPAIR_AMOUNT,
} as const;
