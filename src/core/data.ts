import type { Club, Demand, EventKey, MarketEvent, PlayerCard, Position, Trait } from './types';

/** [이름, 포지션, 몸값, 특성, 기본 수수료] */
type PlayerRow = [string, Position, number, Trait, number];

const PLAYER_ROWS: PlayerRow[] = [
  ['강태오', 'FW', 8, '스타', 4],
  ['윤시후', 'MF', 6, '플레이메이커', 3],
  ['박도윤', 'DF', 4, '베테랑', 2],
  ['최준서', 'FW', 3, '유망주', 2],
  ['김민재', 'GK', 4, '클린시트', 2],
  ['이하준', 'MF', 3, '유망주', 2],
  ['정우진', 'DF', 2, '멀티플레이어', 2],
  ['한승우', 'FW', 7, '스타', 4],
  ['오지환', 'MF', 5, '플레이메이커', 3],
  ['문현수', 'DF', 3, '베테랑', 2],
  ['임재원', 'FW', 2, '유망주', 2],
  ['백승민', 'GK', 2, '클린시트', 2],
  ['서강민', 'MF', 6, '스타', 3],
  ['조현우', 'DF', 2, '멀티플레이어', 2],
  ['장민호', 'FW', 5, '베테랑', 3],
  ['남기훈', 'MF', 2, '유망주', 2],
  ['유태양', 'DF', 6, '스타', 3],
  ['신도현', 'GK', 3, '클린시트', 2],
  ['차은결', 'MF', 2, '플레이메이커', 2],
  ['배준혁', 'FW', 6, '스타', 3],
  ['송지호', 'FW', 5, '베테랑', 3],
  ['권태민', 'MF', 4, '멀티플레이어', 2],
  ['홍석진', 'DF', 7, '스타', 4],
  ['류건우', 'GK', 6, '스타', 3],
  ['안재현', 'FW', 2, '멀티플레이어', 2],
  ['고민성', 'MF', 7, '스타', 4],
  ['황보람', 'DF', 3, '유망주', 2],
  ['전하늘', 'GK', 2, '유망주', 2],
  ['노승현', 'MF', 4, '베테랑', 2],
  ['마동훈', 'DF', 4, '클린시트', 2],
  ['표준영', 'FW', 4, '플레이메이커', 2],
  ['엄태웅', 'MF', 3, '멀티플레이어', 2],
  ['하지원', 'FW', 3, '유망주', 2],
  ['구본철', 'GK', 5, '베테랑', 3],
  ['진우석', 'DF', 5, '플레이메이커', 3],
  ['석현준', 'MF', 5, '유망주', 3],
];

export const PLAYERS: readonly PlayerCard[] = PLAYER_ROWS.map(([name, pos, cost, trait, base], id) => ({ id, name, pos, cost, trait, base }));

/** [이름, 제시액, 필요 포지션, 선호 특성] */
type ClubRow = [string, number, Position, Trait];

const CLUB_ROWS: ClubRow[] = [
  ['블루 드래곤즈', 10, 'FW', '스타'],
  ['실버 호크스', 8, 'MF', '플레이메이커'],
  ['아이언 가디언즈', 7, 'GK', '클린시트'],
  ['에메랄드 타이거즈', 9, 'DF', '스타'],
  ['오로라 FC', 6, 'MF', '유망주'],
  ['노바 크루저스', 6, 'DF', '베테랑'],
  ['썬더 울브스', 5, 'FW', '유망주'],
  ['스톰 파이오니어', 9, 'MF', '플레이메이커'],
  ['레드 피닉스', 8, 'GK', '베테랑'],
  ['골든 이글스', 7, 'FW', '멀티플레이어'],
  ['퍼플 나이츠', 7, 'DF', '유망주'],
  ['화이트 샤크스', 10, 'MF', '스타'],
];

export const CLUBS: readonly Club[] = CLUB_ROWS.map(([name, budget, pos, pref], id) => ({ id, name, budget, pos, pref }));

export const EVENTS: Readonly<Record<EventKey, MarketEvent>> = {
  normal: { key: 'normal', name: '이적시장 개장', icon: '📰', desc: '특별한 효과가 없습니다.' },
  fw: { key: 'fw', name: '공격수 품귀', icon: '🔥', desc: 'FW 선수 계약 수수료 +2억' },
  defense: { key: 'defense', name: '수비 보강', icon: '🧤', desc: 'DF·GK 선수 계약 수수료 +2억' },
  young: { key: 'young', name: '유망주 열풍', icon: '🌱', desc: '유망주 선수 계약 수수료 +2억' },
  budget: { key: 'budget', name: '구단 긴축', icon: '📉', desc: '모든 구단 제시액 −2억' },
  big: { key: 'big', name: '빅딜 시즌', icon: '💰', desc: '몸값 6억 이상 선수 계약 수수료 +2억' },
  sponsor: { key: 'sponsor', name: '스폰서 데이', icon: '🎙', desc: '이번 라운드에 직접 계약시킨 선수는 비밀 구단 보너스를 2배로 셉니다' },
  overseas: { key: 'overseas', name: '해외파 귀국', icon: '✈️', desc: '시장에 선수 2명을 더 깝니다' },
  deadline: { key: 'deadline', name: '데드라인 데이', icon: '⏰', desc: '마지막 라운드 · 모든 계약 수수료 +4억' },
};

/** 무작위로 섞어 7장을 쓰는 이벤트 (마지막 라운드는 항상 데드라인 데이) */
export const EVENT_POOL: readonly EventKey[] = ['normal', 'fw', 'defense', 'young', 'budget', 'big', 'sponsor', 'overseas'];
export const EVENT_KEYS: readonly EventKey[] = [...EVENT_POOL, 'deadline'];

export const DEMANDS: readonly Demand[] = [1, 2, 3, 4];
export const TOTAL_ROUNDS = 8;
/** 게임에 쓰는 구단 수 (12곳 중 무작위) */
export const CLUBS_IN_GAME = 6;
/** 이벤트 수수료 보너스 (억) */
export const EVENT_BONUS = 2;
/** 긴축 시 제시액 감소 */
export const BUDGET_CUT = 2;
/** 해외파 귀국 시 추가 선수 */
export const OVERSEAS_EXTRA = 2;
/**
 * 밸런스 조정 대상 규칙 수치. 기본값이 공식 규칙이며, 시뮬레이션(--rules k=v)에서만 바꾼다.
 */
export const RULES = {
  /** 비밀 구단에 계약된 선수 1명당 보너스 (들키지 않았을 때) */
  clubBonus: 10,
  /** 다른 에이전트의 비밀 구단을 맞혔을 때 보너스 */
  guessBonus: 3,
  /** 데드라인 데이 수수료 보너스 */
  deadlineBonus: 4,
  /** 이 값보다 매력도가 낮은 제안은 구단이 거절한다 (null = 제한 없음) */
  minAttract: null as number | null,
  /** 최고 매력도 동률일 때: 0 = 모두 상쇄, 1 = 제시액이 큰 구단 쪽이 계약, 2 = 요구 수수료 카드가 높은 쪽이 계약 (실험. 그것도 같으면 상쇄) */
  tieBudget: 0,
  /** 게임 종료 지목: 0 = 다른 에이전트 전원을 하나씩, 1 = 한 명만 골라 지목 */
  guessOne: 0,
  /** 비밀 구단 보너스: 0 = 누가 계약했든 센다, 1 = 내가 직접 계약시킨 선수만 센다 */
  clubOwnOnly: 1,
  /** 틀린 지목 1개당 감점 (0 = 감점 없음). 감점이 있으면 지목은 선택이다 */
  wrongGuess: 2,
  /** 요구 수수료 카드: 1 = 낸 카드는 4장을 다 쓸 때까지 못 씀(순환), 0 = 매 라운드 1~4 중 자유 */
  cycle: 0,
  /** 요구 수수료 카드 1·2·3·4 의 매력도 감점 (카드에 인쇄) */
  penalty: [1, 2, 3, 4] as number[],
  /** 요구 수수료 카드 1·2·3·4 로 받는 수수료 (카드에 인쇄) */
  fee: [1, 2, 3, 4] as number[],
  /** 시장 선수 수 = 인원 + marketExtra */
  marketExtra: 1,
};
/** @deprecated RULES.clubBonus */
export const CLUB_BONUS = RULES.clubBonus;
/** @deprecated RULES.guessBonus */
export const GUESS_BONUS = RULES.guessBonus;
/** 3~4인 전용 (2026-10-16 사용자 결정: 2인은 지원하지 않음) */
export const MIN_AGENTS = 3;
export const MAX_AGENTS = 4;

/** 라운드 시장 선수 수 N + 1 (남은 선수는 다음 라운드에도 남고 빈자리만 채운다) */
export const marketSize = (agents: number): number => agents + RULES.marketExtra;

export const player = (id: number): PlayerCard => {
  const p = PLAYERS[id];
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
};

export const club = (id: number): Club => {
  const c = CLUBS[id];
  if (!c) throw new Error(`unknown club ${id}`);
  return c;
};
