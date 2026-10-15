import type { Club, Demand, EventKey, MarketEvent, PlayerCard, Position, Tactic, TacticKey, Trait } from './types';

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
  normal: { key: 'normal', name: '이적시장 개장', icon: '📰', desc: '기본 협상 라운드입니다.' },
  fw: { key: 'fw', name: '공격수 품귀 현상', icon: '🔥', desc: 'FW 선수 계약 수수료 +1억' },
  budget: { key: 'budget', name: '구단 긴축 경영', icon: '📉', desc: '모든 구단 제시액 −1억' },
  young: { key: 'young', name: '유망주 열풍', icon: '🌱', desc: '유망주 선수 계약 수수료 +1억' },
  deadline: { key: 'deadline', name: '빅딜 시즌', icon: '💰', desc: '이번 라운드 수수료가 가장 큰 계약에 +2억 (동률이면 모두)' },
};

export const EVENT_KEYS: readonly EventKey[] = ['normal', 'fw', 'budget', 'young', 'deadline'];

export const TACTICS: Readonly<Record<TacticKey, Tactic>> = {
  charm: { key: 'charm', name: '관계 구축', desc: '매력도 +2, 동률이면 이 제안이 이김', attract: 2, feeAdj: 0, costAdj: 0, tieWin: true },
  leak: { key: 'leak', name: '이적설 흘리기', desc: '매력도 +4, 수수료 −1억', attract: 4, feeAdj: -1, costAdj: 0 },
  fast: { key: 'fast', name: '신속한 결단', desc: '매력도 +1, 수수료 +1억', attract: 1, feeAdj: 1, costAdj: 0 },
  low: { key: 'low', name: '실속 협상', desc: '매력도 +2, 제시액이 몸값보다 3억 낮아도 계약 가능', attract: 2, feeAdj: 0, costAdj: -3 },
  hijack: {
    key: 'hijack',
    name: '하이재킹',
    desc: '2차 전용 · 매력도 +3, 1차 계약 선수도 그 계약 매력도 이상이면 빼앗기',
    attract: 3,
    feeAdj: 0,
    costAdj: 0,
    secondOnly: true,
  },
};

/** 시작 시 무작위로 나눠 주는 전략 카드 */
export const TACTIC_KEYS: readonly TacticKey[] = ['charm', 'leak', 'fast', 'low'];
/** 모든 에이전트가 1장씩 받는 카드 */
export const HIJACK: TacticKey = 'hijack';

export const DEMANDS: readonly Demand[] = [1, 2, 3, 4];
export const DEMAND_CARDS_EACH = 3;
export const TACTICS_PER_AGENT = 3;
export const TOTAL_ROUNDS = 5;
/** 빅딜 시즌 보너스 (억) */
export const BIG_DEAL_BONUS = 2;
export const MIN_AGENTS = 2;
export const MAX_AGENTS = 4;
/** 라운드당 협상 횟수 */
export const STAGES = [1, 2] as const;

/** 1차(대어 쟁탈전)에서 노릴 수 있는 대어 수: 2인 2명, 3인 2명, 4인 3명 */
export const starSlots = (agents: number): number => Math.max(2, agents - 1);

/** 인원별 라운드 시장 크기: 선수 2N+1, 구단 N+2 */
export const marketSize = (agents: number): { players: number; clubs: number } => ({
  players: agents * 2 + 1,
  clubs: agents + 2,
});

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
