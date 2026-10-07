/**
 * 게임 상수 (Rules.md 4·10절). 엔진·UI·AI 어디에도 이 값을 하드코딩하지 않는다.
 * Python 쪽은 shared/fixtures/specs.json 의 constants 로 같은 값을 읽는다.
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export const HAND_SIZE = 3;
export const ENTRANCE_SELF = 3;
export const ENTRANCE_RING = 1;
export const FERTILE_BONUS = 1;
export const GOAL_COUNT = 3;
/** 종 연계 목표: 끝날 때 내 땅 위의 내 그 종 식물 1개당 점수 */
export const RESERVE_BONUS = 2;

/** 인원별 드래프트·덱 구성 (Rules.md 4·5절) */
export interface PlayerCountRule {
  /** 각자 고르는 종 수 */
  picks: number;
  /** 종마다 덱에 넣는 장수 */
  copies: number;
  /** 한 종을 가져갈 수 있는 인원 */
  maxTakers: number;
  /** 드래프트 첫 바퀴 좌석 순서 (이후 뱀 순서) */
  draftFirstRound: number[];
  /** 좌석별 덤 */
  komi: number[];
}

export const PLAYER_COUNT_RULES: Record<number, PlayerCountRule> = {
  2: { picks: 5, copies: 3, maxTakers: 1, draftFirstRound: [1, 0], komi: [0, 1] },
  3: { picks: 4, copies: 4, maxTakers: 1, draftFirstRound: [0, 2, 1], komi: [2, 2, 0] },
  4: { picks: 4, copies: 4, maxTakers: 2, draftFirstRound: [1, 0, 3, 2], komi: [1, 0, 0, 0] },
};

export function rulesFor(players: number): PlayerCountRule {
  const r = PLAYER_COUNT_RULES[players];
  if (!r) throw new Error(`${players}인 규칙이 없습니다`);
  return r;
}

export const CONSTANTS = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  HAND_SIZE,
  ENTRANCE_SELF,
  ENTRANCE_RING,
  FERTILE_BONUS,
  GOAL_COUNT,
  RESERVE_BONUS,
} as const;

// ---------------------------------------------------------------------------
// 온라인 진행 상수 (Rules.md 6.3). 규칙 엔진 밖에서 서버가 쓰는 값이라 CONSTANTS 에는 넣지 않는다
// ---------------------------------------------------------------------------

/** 방장이 고를 수 있는 차례 제한 시간(초). null = 제한 없음(비동기) */
export const TURN_TIME_OPTIONS_SEC: readonly (number | null)[] = [60, 90, 180, null];
/** 새 방의 기본 차례 제한 시간(초) */
export const DEFAULT_TURN_TIME_SEC = 90;
/** 드래프트 픽 제한 시간 = 차례 제한의 1/3, 최소값(초) */
export const MIN_DRAFT_TIME_SEC = 20;
/** 연속으로 이 횟수만큼 시간 초과하면 AI 가 그 좌석을 대신 둔다 */
export const AFK_STRIKES_FOR_AUTOPILOT = 2;

export function draftTimeSec(turnTimeSec: number | null): number | null {
  return turnTimeSec === null ? null : Math.max(MIN_DRAFT_TIME_SEC, Math.round(turnTimeSec / 3));
}
