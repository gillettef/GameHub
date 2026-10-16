/**
 * 게임 상수 (Rules.md 4·10절). 엔진·UI·AI 어디에도 이 값을 하드코딩하지 않는다.
 * Python 쪽은 shared/fixtures/specs.json 의 constants 로 같은 값을 읽는다.
 * 2026-10-16 오프라인판 규칙으로 바꾸며 shared/scripts/lab 시뮬레이터로 맞춘 값이다 (Rules.md 12절).
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** 처음 손에 드는 카드 (Rules.md 4절). 차례마다 1장 가져와 2장 중 1장을 심는다 */
export const START_HAND = 1;
/** 입구 둘레 6칸에 처음 놓는 큐브 */
export const ENTRANCE_ROOTS = 1;
export const GOAL_COUNT = 3;
/** 종 연계 목표: 끝날 때 내 땅 위의 그 식물 1개당 점수 */
export const RESERVE_BONUS = 2;
/** 민들레 씨앗을 놓을 수 있는 거리 */
export const SEED_RANGE = 2;

/** 목표 '여러 가지 심기': 내 땅 위 서로 다른 식물이 이만큼 이상이면 */
export const VARIETY_SPECIES = 5;
export const VARIETY_BONUS = 4;

/** 인원별 구성 (Rules.md 4·5·10절) */
export interface PlayerCountRule {
  /** 이번 판에 쓰는 식물 수 */
  gardenSize: number;
  /** 식물마다 카드 더미에 넣는 장수 (식물 수 × 장수 = 인원 × 각자 심는 횟수) */
  copies: number;
  /** 펼쳐 두는 마켓 카드 수 */
  market: number;
  /** 한 사람의 뿌리 큐브 수 (공급처 + 보드) */
  supply: number;
  /** 자리별 순서 보너스(덤) */
  komi: number[];
}

export const PLAYER_COUNT_RULES: Record<number, PlayerCountRule> = {
  2: { gardenSize: 6, copies: 4, market: 3, supply: 16, komi: [0, 0] },
  3: { gardenSize: 6, copies: 5, market: 4, supply: 18, komi: [0, 0, 0] },
  4: { gardenSize: 8, copies: 5, market: 5, supply: 16, komi: [0, 1, 1, 1] },
};

export function rulesFor(players: number): PlayerCountRule {
  const r = PLAYER_COUNT_RULES[players];
  if (!r) throw new Error(`${players}인 규칙이 없습니다`);
  return r;
}

export const CONSTANTS = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  START_HAND,
  ENTRANCE_ROOTS,
  GOAL_COUNT,
  RESERVE_BONUS,
  SEED_RANGE,
  VARIETY_SPECIES,
  VARIETY_BONUS,
} as const;

// ---------------------------------------------------------------------------
// 온라인 진행 상수 (Rules.md 6.3). 규칙 엔진 밖에서 서버가 쓰는 값이라 CONSTANTS 에는 넣지 않는다
// ---------------------------------------------------------------------------

/** 방장이 고를 수 있는 차례 제한 시간(초). null = 제한 없음(비동기) */
export const TURN_TIME_OPTIONS_SEC: readonly (number | null)[] = [60, 90, 180, null];
/** 새 방의 기본 차례 제한 시간(초) */
export const DEFAULT_TURN_TIME_SEC = 90;
/** 연속으로 이 횟수만큼 시간 초과하면 AI 가 그 좌석을 대신 둔다 */
export const AFK_STRIKES_FOR_AUTOPILOT = 2;
