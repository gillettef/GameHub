import { BUDGET_CUT, DEMANDS, EVENT_BONUS, RULES, club, player } from './data';
import type { AgentState, Club, Demand, EventKey, Evaluation, GameState, InvalidReason, Offer, PlayerCard } from './types';

/** 이번 라운드 이벤트 */
export const currentEvent = (state: Pick<GameState, 'events' | 'round'>): EventKey => state.events[state.round - 1] ?? 'normal';
/** 다음 라운드 예고 이벤트 (마지막 라운드면 null) */
export const upcomingEvent = (state: Pick<GameState, 'events' | 'round'>): EventKey | null => state.events[state.round] ?? null;

/** 구단 제시액 (긴축 이벤트 시 −2) */
export const offerValue = (c: Club, event: EventKey): number => c.budget - (event === 'budget' ? BUDGET_CUT : 0);

/** 포지션 일치 +2, 선호 특성 일치 +1 */
export const fitScore = (p: { pos: string; trait: string }, c: Club): number => (p.pos === c.pos ? 2 : 0) + (p.trait === c.pref ? 1 : 0);

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

export const ownsCard = (agent: AgentState, demand: Demand): boolean => isDemand(demand) && agent.hand.includes(demand);

export const inMarket = (state: Pick<GameState, 'market' | 'clubs'>, offer: Offer): boolean =>
  state.market.includes(offer.playerId) && state.clubs.includes(offer.clubId);

/** 매력도·수수료 계산 (모두 정수). 제시액이 몸값보다 낮으면 사유를 반환한다. */
export function evaluateOffer(offer: Offer, event: EventKey): Evaluation | InvalidReason {
  const p = player(offer.playerId);
  const c = club(offer.clubId);
  if (offerValue(c, event) < p.cost) return 'under-cost';
  const attract = fitScore(p, c) - demandPenalty(offer.demand);
  if (RULES.minAttract !== null && attract < RULES.minAttract) return 'rejected';
  return { attract, fee: p.base + demandFee(offer.demand) + eventFee(p, event) };
}

export const isEvaluation = (r: Evaluation | InvalidReason): r is Evaluation => typeof r === 'object';

/** 제출 단계 검사 (몸값 조건 제외). 통과하면 요구 수수료 카드가 소모된다. */
export function precheck(state: GameState, agentIdx: number, offer: Offer): InvalidReason | null {
  const agent = state.agents[agentIdx];
  if (!agent) throw new Error(`unknown agent ${agentIdx}`);
  if (!inMarket(state, offer)) return 'not-in-market';
  return ownsCard(agent, offer.demand) ? null : 'card-not-owned';
}

/** 시장·카드·몸값을 모두 검사한 최종 판정 */
export function validateOffer(state: GameState, agentIdx: number, offer: Offer): Evaluation | InvalidReason {
  return precheck(state, agentIdx, offer) ?? evaluateOffer(offer, currentEvent(state));
}

/** 요구 수수료 카드를 낸 뒤의 손패. 4장을 모두 쓰면 1~4를 다시 가져온다 */
export function playCard(hand: readonly Demand[], demand: Demand): Demand[] {
  if (!RULES.cycle) return [...DEMANDS];
  const i = hand.indexOf(demand);
  if (i < 0) return [...hand];
  const rest = [...hand.slice(0, i), ...hand.slice(i + 1)];
  return rest.length ? rest : [...DEMANDS];
}

export const INVALID_TEXT: Record<InvalidReason, string> = {
  'not-in-market': '시장에 없는 선수/구단',
  'card-not-owned': '손에 없는 카드',
  'under-cost': '몸값 미달',
  rejected: '매력도 부족 (구단 거절)',
};
