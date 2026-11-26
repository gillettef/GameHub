/**
 * 게임 상수 (Rules.md 4·10절). 엔진·UI·AI 어디에도 이 값을 하드코딩하지 않는다.
 * 카드 문구 도구(tools/card-text.mjs)는 test/fixtures/specs.json 의 constants 로 같은 값을 읽는다.
 * 2026-10-16 오프라인판 규칙으로 바꾸며 tools/lab 시뮬레이터로 맞춘 값이다 (Rules.md 12절).
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** 처음 손에 드는 카드 (Rules.md 4절). 명당을 놓는 차례마다 1장 가져와 손 중 1장을 심는다 */
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

/** 목표 점수 (Rules.md 8절). 1·2등 목표(큰 정원·오솔길)의 1등·2등 점수 */
export const RANK_FIRST_BONUS = 4;
export const RANK_SECOND_BONUS = 2;
/** 중앙 광장: 가운데 구역에서 내 땅이 가장 많으면 (2등 없음) */
export const CENTER_PLAZA_BONUS = 4;
/** 비옥한 밭: 기름진 땅인 내 땅 1칸당 */
export const FERTILE_BONUS = 2;
/** 꽃밭: 내 땅 위 꽃 1개당 */
export const FLOWER_BONUS = 2;
/** 숲: 내 땅 위 나무가 FOREST_MIN_GROUP 개 이상 맞닿은 무리 1개당 */
export const FOREST_BONUS = 4;
export const FOREST_MIN_GROUP = 3;

// 골목 일과 (v7, Rules.md 5·10절)
/** 라운드마다 펼치는 일과 = 기권하지 않은 인원 + 이만큼 */
export const CHORE_EXTRA = 1;
/** 손 카드 최대 (명당 부르기로 이보다 많이 가져올 수 없다) */
export const HAND_MAX = 3;
/** 식빵 굽기: 심은 칸에 놓는 큐브 + */
export const BREAD_BONUS = 1;
/** 명당 부르기: 그 식물 칸에 놓는 큐브 + */
export const CALL_BONUS = 1;
/** 담 넘기: 이동 횟수 최대 */
export const MOVE_TIMES = 2;
/** 담 넘기: 한 번에 옮기는 큐브 최대 */
export const MOVE_MAX = 2;
/** 마실: 내 땅에서 이 거리 안의 빈 칸에도 심는다 */
export const ROAM_RANGE = 2;

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
  /** 라운드 수 (v7, Rules.md 5.4). 이만큼 라운드를 마치면 끝난다 */
  rounds: number;
}

export const PLAYER_COUNT_RULES: Record<number, PlayerCountRule> = {
  2: { gardenSize: 6, copies: 4, market: 2, supply: 16, komi: [0, 0], rounds: 12 },
  3: { gardenSize: 6, copies: 5, market: 2, supply: 18, komi: [0, 0, 0], rounds: 10 },
  4: { gardenSize: 8, copies: 5, market: 2, supply: 16, komi: [0, 1, 1, 1], rounds: 10 },
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
  RANK_FIRST_BONUS,
  RANK_SECOND_BONUS,
  CENTER_PLAZA_BONUS,
  FERTILE_BONUS,
  FLOWER_BONUS,
  FOREST_BONUS,
  FOREST_MIN_GROUP,
  CHORE_EXTRA,
  HAND_MAX,
  BREAD_BONUS,
  CALL_BONUS,
  MOVE_TIMES,
  MOVE_MAX,
  ROAM_RANGE,
} as const;

// ---------------------------------------------------------------------------
// 온라인 진행 상수 (Rules.md 6.3). 규칙 엔진 밖에서 서버가 쓰는 값이라 CONSTANTS 에는 넣지 않는다
// ---------------------------------------------------------------------------

/** 방장이 고를 수 있는 차례 제한 시간(초). null = 제한 없음(비동기) */
export const TURN_TIME_OPTIONS_SEC: readonly (number | null)[] = [60, 90, 180, null];
/** 새 방의 기본 차례 제한 시간(초) */
export const DEFAULT_TURN_TIME_SEC = 90;
/** 연속으로 이 횟수만큼 시간 초과하면 AI 가 그 자리를 대신 둔다 */
export const AFK_STRIKES_FOR_AUTOPILOT = 2;
/** 서버가 시간 초과·AI 대리 안내 로그에 넣는 문구. 클라이언트는 이 문구로 내 시간 초과를 알아챈다 */
export const TIMEOUT_LOG_MARK = '자동으로 둡니다';
export const AUTOPILOT_LOG_MARK = 'AI가 대신 둡니다';

/** 닉네임 길이 (앞뒤 공백 제외) */
export const NICKNAME_MAX_LENGTH = 12;
/** 방 비밀번호 자릿수 (숫자만) */
export const ROOM_PASSWORD_DIGITS = 4;

/** 닉네임이 1~NICKNAME_MAX_LENGTH 자인가 (앞뒤 공백 제외) */
export function isValidNickname(nickname: unknown): boolean {
  if (typeof nickname !== 'string') return false;
  const n = nickname.trim();
  return n.length >= 1 && n.length <= NICKNAME_MAX_LENGTH;
}

/** 방 비밀번호가 숫자 ROOM_PASSWORD_DIGITS 자리인가 */
export function isValidRoomPassword(password: string): boolean {
  return password.length === ROOM_PASSWORD_DIGITS && /^\d+$/.test(password);
}
