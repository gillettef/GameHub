/** 권역별 선거인단(= 칸 수). 합계 35 */
export const CAP: readonly number[] = [8, 7, 6, 6, 4, 4];
export const HOLE_COUNT = 6;
export const HOLE_NAMES: readonly string[] = ['수도권', '동해안권', '서해안권', '중원권', '산악권', '도서권'];
export const HOLE_LABELS: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/** 초기 예비군: 🔵 10 / 🔴 11 */
export const INITIAL_RESERVES: readonly [number, number] = [10, 11];
/** 셋업 단계에서 각자 배치하는 토큰 수 */
export const SETUP_TOKENS = 4;
/** 한 턴에 투입할 수 있는 최대 예비군 수 */
export const MAX_PLACE_PER_TURN = 2;
/** 포화 권역이 이만큼 되면 선거일 */
export const FULL_HOLES_TO_END = 4;

export const PLAYER_EMOJI: readonly [string, string] = ['🔵', '🔴'];
export const PLAYER_NAMES: readonly [string, string] = ['파랑', '빨강'];
