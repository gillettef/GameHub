import { CLUBS, FEE_RATES, player } from './data';
import type { Rng } from './rng';
import { effectiveBudget, feeRemaining, isEvaluation, validateOffer } from './rules';
import type { GameState, Offer } from './types';

/**
 * 쉬움 AI (프로토타입 로직). 라운드 시작 상태 기준으로 판단한다.
 * 유효한 제안을 만들지 못하면 null (카드 소모 없음).
 */
export function makeAiOffer(state: GameState, agentIdx: number, rng: Rng): Offer | null {
  const agent = state.agents[agentIdx];
  if (!agent) throw new Error(`unknown agent ${agentIdx}`);
  const available = state.market.filter((id) => !state.sold.includes(id));
  if (!available.length) return null;
  const p = player(available[rng.int(available.length)]!);

  const fit = (pos: string, pref: string) => (pos === p.pos ? 2 : 0) + (pref === p.trait ? 1 : 0);
  const eligible = state.clubs
    .map((id) => CLUBS[id]!)
    .filter((c) => effectiveBudget(c, state.event) >= p.minSalary)
    .sort((a, b) => fit(b.pos, b.pref) - fit(a.pos, a.pref));
  if (!eligible.length) return null;
  const c = eligible[rng.int(Math.min(3, eligible.length))]!;

  const remaining = feeRemaining(agent);
  const fees = FEE_RATES.filter((f) => remaining[f] > 0);
  if (!fees.length) return null;
  const fee = fees[rng.int(fees.length)]!;

  const tactic = agent.tactics.length && rng.next() < 0.45 ? agent.tactics[rng.int(agent.tactics.length)]! : null;
  const salary = Math.min(effectiveBudget(c, state.event), p.minSalary + rng.int(3));

  const offer: Offer = { playerId: p.id, clubId: c.id, salary, fee, tactic };
  return isEvaluation(validateOffer(state, agentIdx, offer)) ? offer : null;
}
