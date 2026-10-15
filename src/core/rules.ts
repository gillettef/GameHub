import { FEE_CARDS_EACH, FEE_RATES, TACTICS, club, player } from './data';
import type { AgentState, Club, EventKey, Evaluation, FeeRate, GameState, InvalidReason, Offer } from './types';

/** 소수 둘째 자리 반올림 (억 단위 금액) */
export const round2 = (x: number): number => Math.round(x * 100) / 100;

export const effectiveBudget = (c: Club, event: EventKey): number => c.budget - (event === 'budget' ? 1 : 0);

export function feeRemaining(agent: AgentState): Record<FeeRate, number> {
  const r = { 5: FEE_CARDS_EACH, 10: FEE_CARDS_EACH, 15: FEE_CARDS_EACH, 20: FEE_CARDS_EACH } as Record<FeeRate, number>;
  for (const f of agent.feeUsed) r[f]--;
  return r;
}

export const isFeeRate = (n: number): n is FeeRate => (FEE_RATES as readonly number[]).includes(n);

/** 카드 보유 여부 검사. 실패 시 카드는 소모되지 않는다. */
export function ownsCards(agent: AgentState, offer: Offer): boolean {
  if (!isFeeRate(offer.fee) || feeRemaining(agent)[offer.fee] <= 0) return false;
  return offer.tactic === null || agent.tactics.includes(offer.tactic);
}

export const inMarket = (state: GameState, offer: Offer): boolean =>
  state.market.includes(offer.playerId) && !state.sold.includes(offer.playerId) && state.clubs.includes(offer.clubId);

/** 매력도·수수료 계산. 연봉 조건을 만족하지 않으면 사유를 반환한다. */
export function evaluateOffer(offer: Offer, event: EventKey): Evaluation | InvalidReason {
  const p = player(offer.playerId);
  const c = club(offer.clubId);
  const t = offer.tactic ? TACTICS[offer.tactic] : null;
  const s = offer.salary + (t?.salaryAdj ?? 0);
  if (s < p.minSalary) return 'salary-below-min';
  if (s > effectiveBudget(c, event)) return 'over-budget';
  const attract =
    s +
    (p.pos === c.pos ? 2 : 0) +
    (p.trait === c.pref ? 1 : 0) +
    (t?.attract ?? 0) +
    (event === 'fw' && p.pos === 'FW' ? 1 : 0);
  const fee = Math.max(
    0,
    (s * offer.fee) / 100 +
      p.bonus +
      (t?.feeAdj ?? 0) +
      (t?.successBonus ?? 0) +
      (event === 'young' && p.trait === '유망주' ? 0.3 : 0),
  );
  return { salary: s, attract, fee: round2(fee) };
}

export const isEvaluation = (r: Evaluation | InvalidReason): r is Evaluation => typeof r === 'object';

/** 시장·카드·연봉을 모두 검사한 최종 판정 */
export function validateOffer(state: GameState, agentIdx: number, offer: Offer): Evaluation | InvalidReason {
  const agent = state.agents[agentIdx];
  if (!agent) throw new Error(`unknown agent ${agentIdx}`);
  if (!inMarket(state, offer)) return 'not-in-market';
  if (!ownsCards(agent, offer)) return 'card-not-owned';
  return evaluateOffer(offer, state.event);
}

export const INVALID_TEXT: Record<InvalidReason, string> = {
  'not-in-market': '시장에 없는 선수/구단',
  'card-not-owned': '보유하지 않은 카드',
  'salary-below-min': '최소 연봉 미달',
  'over-budget': '구단 예산 초과',
};
