import { BUDGET_CUT, DEMANDS, EVENT_BONUS, RULES, club, goal, need, player } from './data';
import type { Club, ClubNeed, Demand, EventKey, Evaluation, GameState, GoalCard, InvalidReason, Offer, PlayerCard, Signing, Submission } from './types';

/** 이번 라운드 이벤트 */
export const currentEvent = (state: Pick<GameState, 'events' | 'round'>): EventKey => state.events[state.round - 1] ?? 'normal';
/** 다음 라운드 예고 이벤트 (마지막 라운드면 null) */
export const upcomingEvent = (state: Pick<GameState, 'events' | 'round'>): EventKey | null => state.events[state.round] ?? null;

/** 구단 제시액 (긴축 이벤트 시 −2) */
export const offerValue = (c: Club, event: EventKey): number => c.budget - (event === 'budget' ? BUDGET_CUT : 0);

/** 구단 id → 공개된 요구 카드 id */
export type Needs = Readonly<Record<number, number>>;

/** 이 구단에 지금 공개된 요구 카드 */
export const clubNeed = (needs: Needs, clubId: number): ClubNeed => need(needs[clubId] ?? -1);

/** 요구 카드의 포지션 일치 +2, 선호 특성 일치 +1 */
export const fitScore = (p: { pos: string; trait: string }, n: Pick<ClubNeed, 'pos' | 'pref'>): number => (p.pos === n.pos ? 2 : 0) + (p.trait === n.pref ? 1 : 0);

/** 요구 수수료 카드의 매력도 감점 */
export const demandPenalty = (d: Demand): number => RULES.penalty[d - 1] ?? d;
export const demandFee = (d: Demand): number => RULES.fee[d - 1] ?? d;

/** 이벤트로 붙는 수수료 */
export function eventFee(p: PlayerCard, event: EventKey): number {
  const hit =
    (event === 'fw' && p.pos === 'FW') ||
    (event === 'defense' && (p.pos === 'DF' || p.pos === 'GK')) ||
    (event === 'young' && p.trait === '유망주') ||
    (event === 'big' && p.cost >= 6);
  if (event === 'deadline') return RULES.deadlineBonus;
  return hit ? EVENT_BONUS : 0;
}

export const isDemand = (n: number): n is Demand => (DEMANDS as readonly number[]).includes(n);

export const ownsCard = (hand: readonly Demand[], demand: Demand): boolean => isDemand(demand) && hand.includes(demand);

export const inMarket = (state: Pick<GameState, 'market' | 'clubs'>, offer: Offer): boolean =>
  state.market.includes(offer.playerId) && state.clubs.includes(offer.clubId);

/** 매력도·수수료 계산 (모두 정수). 제시액이 몸값보다 낮으면 사유를 반환한다. */
export function evaluateOffer(offer: Offer, event: EventKey, needs: Needs): Evaluation | InvalidReason {
  const p = player(offer.playerId);
  if (offerValue(club(offer.clubId), event) < p.cost) return 'under-cost';
  const attract = fitScore(p, clubNeed(needs, offer.clubId)) - demandPenalty(offer.demand);
  if (RULES.minAttract !== null && attract < RULES.minAttract) return 'rejected';
  return { attract, fee: p.base + demandFee(offer.demand) + eventFee(p, event) };
}

export const isEvaluation = (r: Evaluation | InvalidReason): r is Evaluation => typeof r === 'object';

/**
 * 제출 단계 검사 (몸값 조건 제외). 통과하면 요구 수수료 카드가 소모된다.
 * hand 는 이 협상 때의 손패 (2차는 1차에 낸 카드를 뺀 손), first 는 같은 라운드의 1차 제안 (2차 검사 때).
 */
export function precheck(state: GameState, agentIdx: number, offer: Offer, hand?: readonly Demand[], first?: Submission): InvalidReason | null {
  const agent = state.agents[agentIdx];
  if (!agent) throw new Error(`unknown agent ${agentIdx}`);
  if (!inMarket(state, offer)) return 'not-in-market';
  if (first && (first.playerId === offer.playerId || first.clubId === offer.clubId)) return 'duplicate';
  return ownsCard(hand ?? agent.hand, offer.demand) ? null : 'card-not-owned';
}

/** 시장·카드·몸값을 모두 검사한 최종 판정 (1차 기준) */
export function validateOffer(state: GameState, agentIdx: number, offer: Offer): Evaluation | InvalidReason {
  return precheck(state, agentIdx, offer) ?? evaluateOffer(offer, currentEvent(state), state.needs);
}

/** 1차를 낸 뒤 2차의 판정 (1차에서 계약될 선수인지는 정산 전이라 알 수 없다) */
export function validateSecond(state: GameState, agentIdx: number, first: Submission, second: Offer): Evaluation | InvalidReason {
  const hand = handAfter(state, agentIdx, first);
  return precheck(state, agentIdx, second, hand, first) ?? evaluateOffer(second, currentEvent(state), state.needs);
}

/** 1차 제출 뒤 2차에 쓸 수 있는 손패 (1차가 시장·카드 검사를 통과하면 그 카드는 소모) */
export function handAfter(state: GameState, agentIdx: number, first: Submission): Demand[] {
  const hand = state.agents[agentIdx]!.hand;
  return first && !precheck(state, agentIdx, first) ? playCard(hand, first.demand) : [...hand];
}

/** 요구 수수료 카드를 낸 뒤의 손패: 낸 카드 1장을 버린다 (RULES.copies = 0 이면 소진 없음) */
export function playCard(hand: readonly Demand[], demand: Demand): Demand[] {
  if (!RULES.copies) return [...DEMANDS];
  const i = hand.indexOf(demand);
  if (i < 0) return [...hand];
  return [...hand.slice(0, i), ...hand.slice(i + 1)];
}

/** 이 선수가 목표 카드 조건에 맞는가 (allPos 는 모든 선수가 맞고, 진척은 포지션 수로 센다) */
export function goalMatches(g: GoalCard, p: PlayerCard): boolean {
  switch (g.rule.kind) {
    case 'pos':
      return p.pos === g.rule.pos;
    case 'trait':
      return p.trait === g.rule.trait;
    case 'cost':
      return p.cost >= g.rule.min;
    case 'allPos':
      return true;
  }
}

/** 목표 진척: 조건에 맞는 직접 계약 선수 수 (스폰서 데이는 2명). allPos 는 채운 포지션 종류 수 */
export function goalProgress(goalId: number, signings: readonly Pick<Signing, 'playerId' | 'weight'>[]): number {
  const g = goal(goalId);
  if (g.rule.kind === 'allPos') return new Set(signings.map((s) => player(s.playerId).pos)).size;
  return signings.filter((s) => goalMatches(g, player(s.playerId))).reduce((n, s) => n + s.weight, 0);
}

/** 이 에이전트가 직접 계약시킨 선수 */
export const ownSignings = (state: Pick<GameState, 'signings'>, agentIdx: number): Signing[] => state.signings.filter((s) => s.agent === agentIdx);

export const INVALID_TEXT: Record<InvalidReason, string> = {
  'not-in-market': '시장에 없는 선수/구단',
  'card-not-owned': '손에 없는 카드',
  duplicate: '1차와 같은 선수/구단',
  signed: '1차에서 이미 계약됨 (협상 무산)',
  'under-cost': '몸값 미달',
  rejected: '매력도 부족 (구단 거절)',
};
