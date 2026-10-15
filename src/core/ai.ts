import { CLUBS, FEE_RATES, MAX_SALARY, TOTAL_ROUNDS, player } from './data';
import type { Rng } from './rng';
import { effectiveBudget, feeRemaining, isEvaluation, validateOffer } from './rules';
import type { AiLevel, GameState, Offer, TacticKey } from './types';

/**
 * AI 제안 생성. 라운드 시작 상태 기준으로 판단한다.
 * 유효한 제안을 만들지 못하면 null (카드 소모 없음).
 */
export function makeAiOffer(state: GameState, agentIdx: number, rng: Rng): Offer | null {
  const agent = state.agents[agentIdx];
  if (!agent) throw new Error(`unknown agent ${agentIdx}`);
  const level: AiLevel = agent.level ?? 'easy';
  return level === 'normal' ? makeNormalOffer(state, agentIdx, rng) : makeEasyOffer(state, agentIdx, rng);
}

/** 쉬움 AI (프로토타입 로직) */
export function makeEasyOffer(state: GameState, agentIdx: number, rng: Rng): Offer | null {
  const agent = state.agents[agentIdx]!;
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

/** 전략 카드를 아끼는 비용 (마지막 라운드는 0) */
const TACTIC_COST = 0.25;

/** 보통 AI: 모든 제안의 기대 수수료(수수료 × 추정 승률)를 비교해 선수별 최선안 상위 3개 중 가중 무작위 선택 */
export function makeNormalOffer(state: GameState, agentIdx: number, rng: Rng): Offer | null {
  const agent = state.agents[agentIdx]!;
  const available = state.market.filter((id) => !state.sold.includes(id));
  const clubs = state.clubs.map((id) => CLUBS[id]!);
  const remaining = feeRemaining(agent);
  const fees = FEE_RATES.filter((f) => remaining[f] > 0);
  const tactics: (TacticKey | null)[] = [null, ...agent.tactics];
  const tacticCost = state.round >= TOTAL_ROUNDS ? 0 : TACTIC_COST;

  const scored: { offer: Offer; value: number }[] = [];
  for (const pid of available) {
    const p = player(pid);
    const threat = p.minSalary + 1 + Math.max(0, ...clubs.map((c) => (c.pos === p.pos ? 2 : 0) + (c.pref === p.trait ? 1 : 0)));
    for (const c of clubs) {
      const maxSalary = Math.min(MAX_SALARY, effectiveBudget(c, state.event) + 1);
      for (let salary = p.minSalary; salary <= maxSalary; salary++) {
        for (const fee of fees) {
          for (const tactic of tactics) {
            const offer: Offer = { playerId: pid, clubId: c.id, salary, fee, tactic };
            const ev = validateOffer(state, agentIdx, offer);
            if (!isEvaluation(ev)) continue;
            const win = Math.min(1, Math.max(0.05, 0.5 + 0.15 * (ev.attract - threat)));
            scored.push({ offer, value: ev.fee * win - (tactic ? tacticCost : 0) });
          }
        }
      }
    }
  }
  if (!scored.length) return null;

  // 선수별 최선 제안 중 상위 3명 → 여러 AI가 같은 선수에 몰리지 않게
  scored.sort((a, b) => b.value - a.value);
  const seen = new Set<number>();
  const top = scored.filter((s) => !seen.has(s.offer.playerId) && seen.add(s.offer.playerId)).slice(0, 3);
  const weights = top.map((s) => Math.max(0.01, s.value));
  let r = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < top.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return top[i]!.offer;
  }
  return top[0]!.offer;
}
