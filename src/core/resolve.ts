import { makeAiOffer } from './ai';
import { createRng } from './rng';
import { evaluateOffer, inMarket, isEvaluation, ownsCards, round2 } from './rules';
import type { AgentState, GameState, Offer, RoundEntry, Submission } from './types';

interface Candidate {
  agent: number;
  offer: Offer;
  salary: number;
  attract: number;
  fee: number;
  tie: number;
}

/**
 * 라운드 정산. humanSubs 는 사람 에이전트 인덱스 → 제출(null = 패스).
 * AI 제안은 이 함수 안에서 라운드 시작 상태 기준으로 생성한다.
 */
export function resolveRound(state: GameState, humanSubs: Readonly<Record<number, Submission>>): GameState {
  if (state.phase !== 'bid') throw new Error('not in bid phase');
  const rng = createRng(state.rng);
  const agents: AgentState[] = state.agents.map((a) => ({ ...a, feeUsed: [...a.feeUsed], tactics: [...a.tactics] }));
  const entries: RoundEntry[] = [];
  const candidates: Candidate[] = [];

  state.agents.forEach((a, i) => {
    let sub: Submission;
    if (a.kind === 'ai') {
      sub = makeAiOffer(state, i, rng);
      if (!sub) return void entries.push({ agent: i, status: 'none' });
    } else {
      if (!(i in humanSubs)) throw new Error(`missing submission for agent ${i}`);
      sub = humanSubs[i] ?? null;
      if (!sub) return void entries.push({ agent: i, status: 'pass' });
    }

    const offer = sub;
    if (!inMarket(state, offer)) return void entries.push({ agent: i, status: 'invalid', offer, reason: 'not-in-market' });
    if (!ownsCards(a, offer)) return void entries.push({ agent: i, status: 'invalid', offer, reason: 'card-not-owned' });

    // 카드는 제출 시점에 소모 (조건 불충족으로 무효여도 소모)
    const ag = agents[i]!;
    ag.feeUsed.push(offer.fee);
    if (offer.tactic) ag.tactics.splice(ag.tactics.indexOf(offer.tactic), 1);

    const ev = evaluateOffer(offer, state.event);
    if (!isEvaluation(ev)) return void entries.push({ agent: i, status: 'invalid', offer, reason: ev });
    candidates.push({ agent: i, offer, ...ev, tie: rng.next() });
  });

  const byPlayer = new Map<number, Candidate[]>();
  for (const c of candidates) byPlayer.set(c.offer.playerId, [...(byPlayer.get(c.offer.playerId) ?? []), c]);

  const winners: Candidate[] = [];
  const losers: { c: Candidate; w: Candidate }[] = [];
  for (const group of byPlayer.values()) {
    group.sort((x, y) => y.attract - x.attract || x.offer.fee - y.offer.fee || x.tie - y.tie);
    const [w, ...rest] = group as [Candidate, ...Candidate[]];
    winners.push(w);
    for (const c of rest) losers.push({ c, w });
  }

  const maxSalary = Math.max(0, ...winners.map((w) => w.salary));
  const sold = [...state.sold];
  for (const w of winners) {
    const bigDeal = state.event === 'deadline' && w.salary === maxSalary;
    const fee = round2(w.fee + (bigDeal ? 0.5 : 0));
    const ag = agents[w.agent]!;
    ag.score = round2(ag.score + fee);
    ag.deals++;
    sold.push(w.offer.playerId);
    entries.push({ agent: w.agent, status: 'won', offer: w.offer, salary: w.salary, attract: w.attract, fee, ...(bigDeal ? { bigDeal } : {}) });
  }
  for (const { c, w } of losers) {
    entries.push({ agent: c.agent, status: 'lost', offer: c.offer, salary: c.salary, attract: c.attract, winner: w.agent, winnerAttract: w.attract });
  }
  entries.sort((a, b) => a.agent - b.agent);

  return {
    ...state,
    rng: rng.state,
    phase: 'result',
    agents,
    sold,
    results: [...state.results, { round: state.round, event: state.event, entries }],
  };
}
