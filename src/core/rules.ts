import { DEMANDS, DEMAND_CARDS_EACH, TACTICS, club, player } from './data';
import type { AgentState, Club, Demand, EventKey, Evaluation, GameState, InvalidReason, Offer, Stage, Submission } from './types';

/** 구단 제시액 (긴축 이벤트 시 −1) */
export const offerValue = (c: Club, event: EventKey): number => c.budget - (event === 'budget' ? 1 : 0);

/** 포지션 일치 +2, 선호 특성 일치 +1 */
export const fitScore = (p: { pos: string; trait: string }, c: Club): number => (p.pos === c.pos ? 2 : 0) + (p.trait === c.pref ? 1 : 0);

export function demandRemaining(agent: AgentState): Record<Demand, number> {
  const r = { 1: DEMAND_CARDS_EACH, 2: DEMAND_CARDS_EACH, 3: DEMAND_CARDS_EACH, 4: DEMAND_CARDS_EACH } as Record<Demand, number>;
  for (const d of agent.demandUsed) r[d]--;
  return r;
}

export const isDemand = (n: number): n is Demand => (DEMANDS as readonly number[]).includes(n);

/** 카드 보유 여부 검사. 실패 시 카드는 소모되지 않는다. */
export function ownsCards(agent: AgentState, offer: Offer): boolean {
  if (!isDemand(offer.demand) || demandRemaining(agent)[offer.demand] <= 0) return false;
  return offer.tactic === null || agent.tactics.includes(offer.tactic);
}

export const inMarket = (state: GameState, offer: Offer): boolean =>
  state.market.includes(offer.playerId) && !state.sold.includes(offer.playerId) && state.clubs.includes(offer.clubId);

/** 매력도·수수료 계산 (모두 정수). 몸값 조건을 만족하지 않으면 사유를 반환한다. */
export function evaluateOffer(offer: Offer, event: EventKey): Evaluation | InvalidReason {
  const p = player(offer.playerId);
  const c = club(offer.clubId);
  const t = offer.tactic ? TACTICS[offer.tactic] : null;
  const value = offerValue(c, event);
  if (value < p.cost + (t?.costAdj ?? 0)) return 'under-cost';
  const attract = fitScore(p, c) + (t?.attract ?? 0) - offer.demand;
  const fee = Math.max(
    0,
    p.base +
      offer.demand +
      (t?.feeAdj ?? 0) +
      (event === 'fw' && p.pos === 'FW' ? 1 : 0) +
      (event === 'young' && p.trait === '유망주' ? 1 : 0),
  );
  return { attract, fee };
}

export const isEvaluation = (r: Evaluation | InvalidReason): r is Evaluation => typeof r === 'object';

/** 카드를 소모한 새 에이전트 상태 */
export function consumeCards(agent: AgentState, offer: Offer): AgentState {
  const tactics = [...agent.tactics];
  if (offer.tactic) tactics.splice(tactics.indexOf(offer.tactic), 1);
  return { ...agent, demandUsed: [...agent.demandUsed, offer.demand], tactics };
}

/**
 * 제출 단계 검사 (몸값 조건 제외). 통과하면 카드가 소모된다.
 * 2차는 1차와의 중복을 보고, 카드 보유는 1차에서 소모될 카드를 뺀 뒤 판정한다.
 */
export function precheck(state: GameState, agentIdx: number, offer: Offer, stage: Stage = 1, first: Submission = null): InvalidReason | null {
  const agent = state.agents[agentIdx];
  if (!agent) throw new Error(`unknown agent ${agentIdx}`);
  if (!inMarket(state, offer)) return 'not-in-market';
  if (stage === 1) {
    if (offer.tactic && TACTICS[offer.tactic].secondOnly) return 'second-only';
    return ownsCards(agent, offer) ? null : 'card-not-owned';
  }
  if (first && (first.playerId === offer.playerId || first.clubId === offer.clubId)) return 'duplicate';
  const after = first && precheck(state, agentIdx, first, 1) === null ? consumeCards(agent, first) : agent;
  return ownsCards(after, offer) ? null : 'card-not-owned';
}

/** 시장·카드·몸값을 모두 검사한 최종 판정 */
export function validateOffer(state: GameState, agentIdx: number, offer: Offer, stage: Stage = 1, first: Submission = null): Evaluation | InvalidReason {
  return precheck(state, agentIdx, offer, stage, first) ?? evaluateOffer(offer, state.event);
}

export const INVALID_TEXT: Record<InvalidReason, string> = {
  'not-in-market': '시장에 없는 선수/구단',
  'card-not-owned': '보유하지 않은 카드',
  'under-cost': '몸값 미달',
  'second-only': '2차 전용 카드',
  duplicate: '1차와 같은 선수/구단',
};
