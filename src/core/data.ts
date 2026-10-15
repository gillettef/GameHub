import type { Club, EventKey, FeeRate, MarketEvent, PlayerCard, Position, Tactic, TacticKey, Trait } from './types';

type PlayerRow = [string, Position, number, number, Trait, number];

const PLAYER_ROWS: PlayerRow[] = [
  ['강태오', 'FW', 10, 8, '스타', 1],
  ['윤시후', 'MF', 8, 6, '플레이메이커', 0],
  ['박도윤', 'DF', 7, 4, '베테랑', 0.3],
  ['최준서', 'FW', 6, 3, '유망주', 1],
  ['김민재', 'GK', 7, 4, '클린시트', 0.5],
  ['이하준', 'MF', 6, 3, '유망주', 1],
  ['정우진', 'DF', 5, 2, '멀티플레이어', 0.3],
  ['한승우', 'FW', 9, 7, '스타', 1],
  ['오지환', 'MF', 7, 5, '플레이메이커', 0.3],
  ['문현수', 'DF', 6, 3, '베테랑', 0.3],
  ['임재원', 'FW', 5, 2, '유망주', 1],
  ['백승민', 'GK', 5, 2, '클린시트', 0.5],
  ['서강민', 'MF', 8, 6, '스타', 1],
  ['조현우', 'DF', 4, 2, '멀티플레이어', 0.3],
  ['장민호', 'FW', 7, 5, '베테랑', 0.5],
  ['남기훈', 'MF', 5, 2, '유망주', 1],
  ['유태양', 'DF', 8, 6, '스타', 1],
  ['신도현', 'GK', 6, 3, '클린시트', 0.5],
  ['차은결', 'MF', 4, 2, '플레이메이커', 0.3],
  ['배준혁', 'FW', 8, 6, '스타', 1],
];

export const PLAYERS: readonly PlayerCard[] = PLAYER_ROWS.map(([name, pos, value, minSalary, trait, bonus], id) => ({
  id, name, pos, value, minSalary, trait, bonus,
}));

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
];

export const CLUBS: readonly Club[] = CLUB_ROWS.map(([name, budget, pos, pref], id) => ({ id, name, budget, pos, pref }));

export const EVENTS: Readonly<Record<EventKey, MarketEvent>> = {
  normal: { key: 'normal', name: '이적시장 개장', icon: '📰', desc: '기본 협상 라운드입니다.' },
  fw: { key: 'fw', name: '공격수 품귀 현상', icon: '🔥', desc: 'FW 선수의 계약 매력도 +1' },
  budget: { key: 'budget', name: '구단 긴축 경영', icon: '📉', desc: '모든 구단의 유효 예산 -1억' },
  young: { key: 'young', name: '유망주 열풍', icon: '🌱', desc: '유망주 선수 수수료 +0.3억' },
  deadline: { key: 'deadline', name: '빅딜 시즌', icon: '💰', desc: '이번 라운드 연봉이 가장 높은 계약에 +0.5억 (동률이면 모두)' },
};

export const EVENT_KEYS: readonly EventKey[] = ['normal', 'fw', 'budget', 'young', 'deadline'];

export const TACTICS: Readonly<Record<TacticKey, Tactic>> = {
  charm: { key: 'charm', name: '관계 구축', desc: '매력도 +2', attract: 2, feeAdj: 0, successBonus: 0, salaryAdj: 0 },
  leak: { key: 'leak', name: '이적설 흘리기', desc: '매력도 +3, 수수료 -0.2억', attract: 3, feeAdj: -0.2, successBonus: 0, salaryAdj: 0 },
  fast: { key: 'fast', name: '신속한 결단', desc: '매력도 +1, 성공 시 +0.3억', attract: 1, feeAdj: 0, successBonus: 0.3, salaryAdj: 0 },
  low: { key: 'low', name: '실속 협상', desc: '연봉 -1억, 매력도 +1', attract: 1, feeAdj: 0, successBonus: 0, salaryAdj: -1 },
};

export const TACTIC_KEYS: readonly TacticKey[] = ['charm', 'leak', 'fast', 'low'];

export const FEE_RATES: readonly FeeRate[] = [5, 10, 15, 20];
export const FEE_CARDS_EACH = 2;
export const TACTICS_PER_AGENT = 3;
export const TOTAL_ROUNDS = 5;
export const MAX_SALARY = 10;
export const MIN_AGENTS = 2;
export const MAX_AGENTS = 4;

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
