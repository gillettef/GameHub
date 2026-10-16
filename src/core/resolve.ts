import { makeAiOffer } from './ai';
import { RULES, club } from './data';
import { createRng } from './rng';
import { currentEvent, evaluateOffer, isEvaluation, playCard, precheck } from './rules';
import type { AgentState, GameState, Offer, RoundEntry, Signing, Submission } from './types';

interface Candidate {
  agent: number;
  offer: Offer;
  attract: number;
  fee: number;
}

/**
 * 같은 선수 제안끼리 경쟁: 매력도가 가장 높은 제안이 계약한다.
 * 최고 매력도가 같은 제안끼리는 서로 상쇄되어 탈락하고 그다음 매력도가 계약한다 (무작위·좌석 우선 없음).
 */
export function contest(group: readonly Candidate[]): { winner: Candidate | null; beaten: Candidate[]; cancelled: Candidate[] } {
  const sorted = [...group].sort((x, y) => y.attract - x.attract);
  const cancelled: Candidate[] = [];
  let i = 0;
  while (i < sorted.length) {
    const tier = sorted.filter((c) => c.attract === sorted[i]!.attract);
    if (tier.length === 1) return { winner: tier[0]!, beaten: sorted.slice(i + 1), cancelled };
    if (RULES.tieBudget) {
      // 제시액이 가장 큰 구단 쪽이 단독이면 그 제안이 계약
      const top = Math.max(...tier.map((c) => club(c.offer.clubId).budget));
      const rich = tier.filter((c) => club(c.offer.clubId).budget === top);
      if (rich.length === 1) return { winner: rich[0]!, beaten: [...tier.filter((c) => c !== rich[0]), ...sorted.slice(i + tier.length)], cancelled };
    }
    cancelled.push(...tier);
    i += tier.length;
  }
  return { winner: null, beaten: [], cancelled };
}

/**
 * 라운드 정산. humanSubs 는 사람 에이전트 인덱스 → 제안(null = 패스).
 * AI 제안은 이 함수 안에서 라운드 시작 상태 기준으로 생성한다.
 */
export function resolveRound(state: GameState, humanSubs: Readonly<Record<number, Submission>>): GameState {
  if (state.phase !== 'bid') throw new Error('not in bid phase');
  const rng = createRng(state.rng);
  const event = currentEvent(state);
  let agents: AgentState[] = state.agents.map((a) => ({ ...a, hand: [...a.hand] }));
  const entries: RoundEntry[] = [];

  const subs: Submission[] = state.agents.map((a, i) => {
    if (a.kind === 'ai') return makeAiOffer(state, i, rng);
    if (!(i in humanSubs)) throw new Error(`missing submission for agent ${i}`);
    return humanSubs[i] ?? null;
  });

  const cands: Candidate[] = [];
  subs.forEach((offer, i) => {
    if (!offer) return void entries.push({ agent: i, status: 'pass' });
    const reason = precheck(state, i, offer);
    if (reason) return void entries.push({ agent: i, status: 'invalid', offer, reason });
    // 공개된 요구 수수료 카드는 몸값 미달이어도 소모된다
    agents = agents.map((a, k) => (k === i ? { ...a, hand: playCard(a.hand, offer.demand) } : a));
    const ev = evaluateOffer(offer, event);
    if (!isEvaluation(ev)) return void entries.push({ agent: i, status: 'invalid', offer, reason: ev });
    cands.push({ agent: i, offer, ...ev });
  });

  const byPlayer = new Map<number, Candidate[]>();
  for (const c of cands) byPlayer.set(c.offer.playerId, [...(byPlayer.get(c.offer.playerId) ?? []), c]);

  const signings: Signing[] = [...state.signings];
  let market = [...state.market];
  for (const group of byPlayer.values()) {
    const { winner: w, beaten, cancelled } = contest(group);
    for (const c of cancelled) entries.push({ agent: c.agent, status: 'lost', offer: c.offer, attract: c.attract, tied: true, ...(w ? { winner: w.agent, winnerAttract: w.attract } : {}) });
    if (!w) continue;
    for (const c of beaten) entries.push({ agent: c.agent, status: 'lost', offer: c.offer, attract: c.attract, winner: w.agent, winnerAttract: w.attract });
    entries.push({ agent: w.agent, status: 'won', offer: w.offer, attract: w.attract, fee: w.fee });
    agents = agents.map((a, k) => (k === w.agent ? { ...a, score: a.score + w.fee, deals: a.deals + 1 } : a));
    signings.push({ playerId: w.offer.playerId, clubId: w.offer.clubId, agent: w.agent, round: state.round, weight: event === 'sponsor' ? 2 : 1 });
    market = market.filter((id) => id !== w.offer.playerId);
  }
  entries.sort((a, b) => a.agent - b.agent);

  return {
    ...state,
    rng: rng.state,
    phase: 'result',
    agents,
    market,
    signings,
    results: [...state.results, { round: state.round, event, entries }],
  };
}
