import { makeAiBid } from './ai';
import { RULES, club } from './data';
import { createRng } from './rng';
import { currentEvent, evaluateOffer, isEvaluation, playCard, precheck } from './rules';
import type { AgentState, GameState, Offer, RoundBid, RoundEntry, Signing } from './types';

interface Candidate {
  agent: number;
  offer: Offer;
  attract: number;
  fee: number;
}

/**
 * 같은 선수 제안끼리 경쟁: 매력도가 가장 높은 제안이 계약한다.
 * 최고 매력도가 같으면 요구 수수료 카드가 가장 낮은(수수료가 적은) 제안이 계약한다. 그 카드가 여럿이면 그 매력도의 제안은
 * 모두 상쇄되어 탈락하고 그다음 매력도가 계약한다 (무작위·좌석 우선 없음).
 */
export function contest(group: readonly Candidate[]): { winner: Candidate | null; beaten: Candidate[]; cancelled: Candidate[] } {
  const sorted = [...group].sort((x, y) => y.attract - x.attract);
  const cancelled: Candidate[] = [];
  let i = 0;
  while (i < sorted.length) {
    const tier = sorted.filter((c) => c.attract === sorted[i]!.attract);
    if (tier.length === 1) return { winner: tier[0]!, beaten: sorted.slice(i + 1), cancelled };
    // 동률 처리 기준: 3 = 카드가 낮은 쪽, 2 = 카드가 높은 쪽, 1 = 제시액이 큰 구단 쪽
    const key = (c: Candidate): number =>
      RULES.tieBudget === 3 ? -c.offer.demand : RULES.tieBudget === 2 ? c.offer.demand : RULES.tieBudget ? club(c.offer.clubId).budget : 0;
    if (RULES.tieBudget) {
      const top = Math.max(...tier.map(key));
      const best = tier.filter((c) => key(c) === top);
      if (best.length === 1) return { winner: best[0]!, beaten: [...tier.filter((c) => c !== best[0]), ...sorted.slice(i + tier.length)], cancelled };
    }
    cancelled.push(...tier);
    i += tier.length;
  }
  return { winner: null, beaten: [], cancelled };
}

/**
 * 라운드 정산. humanSubs 는 사람 에이전트 인덱스 → 1·2차 제안(null = 패스).
 * AI 제안은 이 함수 안에서 라운드 시작 상태 기준으로 생성한다. 1차를 모두 정산한 뒤 2차를 정산한다.
 */
export function resolveRound(state: GameState, humanSubs: Readonly<Record<number, RoundBid>>): GameState {
  if (state.phase !== 'bid') throw new Error('not in bid phase');
  const rng = createRng(state.rng);
  const event = currentEvent(state);
  let agents: AgentState[] = state.agents.map((a) => ({ ...a, hand: [...a.hand] }));
  const entries: RoundEntry[] = [];

  const bids: RoundBid[] = state.agents.map((a, i) => {
    if (a.kind === 'ai') return makeAiBid(state, i, rng);
    const b = humanSubs[i];
    if (!b) throw new Error(`missing submission for agent ${i}`);
    return { first: b.first ?? null, second: b.second ?? null };
  });

  const signings: Signing[] = [...state.signings];
  let market = [...state.market];
  const signedNow = new Set<number>();

  for (const stage of [1, 2] as const) {
    const cands: Candidate[] = [];
    bids.forEach((bid, i) => {
      const offer = stage === 1 ? bid.first : bid.second;
      if (!offer) return void entries.push({ agent: i, stage, status: 'pass' });
      const reason = precheck(state, i, offer, agents[i]!.hand, stage === 2 ? bid.first : null);
      if (reason) return void entries.push({ agent: i, stage, status: 'invalid', offer, reason });
      // 공개된 요구 수수료 카드는 몸값 미달·협상 무산이어도 소모된다
      agents = agents.map((a, k) => (k === i ? { ...a, hand: playCard(a.hand, offer.demand) } : a));
      if (signedNow.has(offer.playerId)) return void entries.push({ agent: i, stage, status: 'invalid', offer, reason: 'signed' });
      const ev = evaluateOffer(offer, event, state.needs);
      if (!isEvaluation(ev)) return void entries.push({ agent: i, stage, status: 'invalid', offer, reason: ev });
      cands.push({ agent: i, offer, ...ev });
    });

    const byPlayer = new Map<number, Candidate[]>();
    for (const c of cands) byPlayer.set(c.offer.playerId, [...(byPlayer.get(c.offer.playerId) ?? []), c]);

    for (const group of byPlayer.values()) {
      const { winner: w, beaten, cancelled } = contest(group);
      for (const c of cancelled) entries.push({ agent: c.agent, stage, status: 'lost', offer: c.offer, attract: c.attract, tied: true, ...(w ? { winner: w.agent, winnerAttract: w.attract } : {}) });
      if (!w) continue;
      for (const c of beaten) entries.push({ agent: c.agent, stage, status: 'lost', offer: c.offer, attract: c.attract, winner: w.agent, winnerAttract: w.attract });
      entries.push({ agent: w.agent, stage, status: 'won', offer: w.offer, attract: w.attract, fee: w.fee });
      agents = agents.map((a, k) => (k === w.agent ? { ...a, score: a.score + w.fee, deals: a.deals + 1 } : a));
      signings.push({ playerId: w.offer.playerId, clubId: w.offer.clubId, agent: w.agent, round: state.round, weight: event === 'sponsor' ? 2 : 1 });
      market = market.filter((id) => id !== w.offer.playerId);
      signedNow.add(w.offer.playerId);
    }
  }
  entries.sort((a, b) => a.stage - b.stage || a.agent - b.agent);

  return {
    ...state,
    rng: rng.state,
    phase: 'result',
    agents,
    market,
    signings,
    results: [...state.results, { round: state.round, event, needs: state.needs, entries }],
  };
}
