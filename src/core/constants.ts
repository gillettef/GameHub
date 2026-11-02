/** 권역별 선거인단(= 칸 수). 합계 35 */
export const CAP: readonly number[] = [8, 7, 6, 6, 4, 4];
export const HOLE_COUNT = 6;
export const HOLE_NAMES: readonly string[] = ['수도권', '동해안권', '서해안권', '중원권', '산악권', '도서권'];
export const HOLE_LABELS: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/** 초기 예비군: 🔵 10 / 🔴 11 */
export const INITIAL_RESERVES: readonly [number, number] = [10, 11];
/** 셋업 단계에서 각자 배치하는 토큰 수 */
export const SETUP_TOKENS = 4;
/**
 * 한 턴에 투입할 수 있는 최대 예비군 수.
 * 프로토타입은 2(1~2개)였으나, 실제로 1개만 놓는 경우가 1% 수준이라 2026-11-02 1개로 바꿨다
 * (AI 셀프플레이 비교: 선공 승률 53.8→49.3%, 역전 5.7→11.3회/판, 수읽기 이득 61→66%).
 * 1보다 크게 두면 투입 완료(endPlace) 흐름이 다시 살아난다.
 */
export const MAX_PLACE_PER_TURN = 1;
/** 포화 권역이 이만큼 되면 선거일 */
export const FULL_HOLES_TO_END = 4;

export const PLAYER_EMOJI: readonly [string, string] = ['🔵', '🔴'];
export const PLAYER_NAMES: readonly [string, string] = ['파랑', '빨강'];
