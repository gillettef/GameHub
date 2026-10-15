import { makeAiOffers } from './ai';
import { createRng } from './rng';
import { BIG_DEAL_BONUS } from './data';
import { consumeCards, evaluateOffer, isEvaluation, precheck } from './rules';
import type { AgentState, GameState, Offer, RoundEntry, RoundSubmission, Stage } from './types';

interface Candidate {
  agent: number;
  stage: Stage;
  offer: Offer;
  attract: number;
  fee: number;
}

/**
 * 같은 선수 제안끼리 경쟁: 매력도 높은 쪽 → 요구 수수료 낮은 쪽.
 * 그래도 같은 제안들은 서로 상쇄되어 탈락하고 다음 순위가 계약한다 (무작위·좌석 우선 없음).
 */
function contest(group: Candidate[]): { winner: Candidate | null; beaten: Candidate[]; cancelled: Candidate[] } {
  const sorted = [...group].sort((x, y) => y.attract - x.attract || x.offer.demand - y.offer.demand);
  const cancelled: Candidate[] = [];
  let i = 0;
  while (i < sorted.length) {
    const head = sorted[i]!;
    const tier = sorted.filter((c) => c.attract === head.attract && c.offer.demand === head.offer.demand);
    if (tier.length === 1) return { winner: head, beaten: sorted.slice(i + 1), cancelled };
    cancelled.push(...tier);
    i += tier.length;
  }
  return { winner: null, beaten: [], cancelled };
}

const byPlayer = (cands: Candidate[]): Candidate[][] => {
  const m = new Map<number, Candidate[]>();
  for (const c of cands) m.set(c.offer.playerId, [...(m.get(c.offer.playerId) ?? []), c]);
  return [...m.values()];
};

/**
 * 라운드 정산. humanSubs 는 사람 에이전트 인덱스 → 1차·2차 제출(각각 null = 패스).
 * AI 제안은 이 함수 안에서 라운드 시작 상태 기준으로 생성한다.
 * 1차를 모두 정산한 뒤 2차를 정산한다. 2차는 1차 계약 선수를 하이재킹으로만 노릴 수 있다.
 */
export function resolveRound(state: GameState, humanSubs: Readonly<Record<number, RoundSubmission>>): GameState {
  if (state.phase !== 'bid') throw new Error('not in bid phase');
  const rng = createRng(state.rng);
  let agents: AgentState[] = state.agents.map((a) => ({ ...a, demandUsed: [...a.demandUsed], tactics: [...a.tactics] }));
  const entries: RoundEntry[] = [];

  const subs: RoundSubmission[] = state.agents.map((a, i) => {
    if (a.kind === 'ai') return makeAiOffers(state, i, rng);
    const sub = humanSubs[i];
    if (!sub) throw new Error(`missing submission for agent ${i}`);
    return sub;
  });

  /** 1차 계약: 선수 → 계약 후보 */
  const contracts1 = new Map<number, Candidate>();

  /** 제출 검사 → 카드 소모 → 연봉 조건 평가. 경쟁에 들어갈 후보면 반환 */
  const enter = (i: number, stage: Stage): Candidate | null => {
    const sub = subs[i]!;
    const offer = stage === 1 ? sub.first : sub.second;
    if (!offer) {
      entries.push({ agent: i, stage, status: state.agents[i]!.kind === 'ai' ? 'none' : 'pass' });
      return null;
    }
    const reason = precheck(state, i, offer, stage, sub.first);
    if (reason) {
      entries.push({ agent: i, stage, status: 'invalid', offer, reason });
      return null;
    }
    // 공개된 카드는 모두 버린다 (몸값 미달·협상 무산 포함)
    agents = agents.map((a, k) => (k === i ? consumeCards(a, offer) : a));
    // 2차: 1차에서 계약된 선수는 하이재킹이 아니면 협상 무산
    if (stage === 2 && contracts1.has(offer.playerId) && offer.tactic !== 'hijack') {
      entries.push({ agent: i, stage, status: 'void', offer });
      return null;
    }
    const ev = evaluateOffer(offer, state.event);
    if (!isEvaluation(ev)) {
      entries.push({ agent: i, stage, status: 'invalid', offer, reason: ev });
      return null;
    }
    return { agent: i, stage, offer, ...ev };
  };

  const lost = (c: Candidate, w: { agent: number; attract: number }): RoundEntry => ({
    agent: c.agent,
    stage: c.stage,
    status: 'lost',
    offer: c.offer,
    attract: c.attract,
    winner: w.agent,
    winnerAttract: w.attract,
  });

  /** 동률 상쇄로 탈락 */
  const tied = (c: Candidate): RoundEntry => ({ agent: c.agent, stage: c.stage, status: 'lost', offer: c.offer, attract: c.attract, tied: true });

  // ── 1차 ──
  const cands1 = state.agents.flatMap((_, i) => enter(i, 1) ?? []);
  for (const group of byPlayer(cands1)) {
    const { winner: w, beaten, cancelled } = contest(group);
    for (const c of cancelled) entries.push(tied(c));
    if (!w) continue;
    contracts1.set(w.offer.playerId, w);
    for (const c of beaten) entries.push(lost(c, w));
  }

  // ── 2차 ──
  const hijacked = new Map<number, number>(); // 1차 계약 선수 → 하이재커
  const contracts2: Candidate[] = [];
  const cands2 = state.agents.flatMap((_, i) => enter(i, 2) ?? []);
  for (const group of byPlayer(cands2)) {
    const { winner: w, beaten, cancelled } = contest(group);
    for (const c of cancelled) entries.push(tied(c));
    if (!w) continue;
    const orig = contracts1.get(w.offer.playerId);
    if (orig && w.attract < orig.attract) {
      // 하이재킹 실패: 1차 계약보다 매력도가 낮으면 1차 계약 유지 (같으면 하이재킹 성공)
      for (const c of [w, ...beaten]) entries.push({ ...lost(c, orig), hijackFailed: true });
      continue;
    }
    if (orig) hijacked.set(w.offer.playerId, w.agent);
    contracts2.push(w);
    for (const c of beaten) entries.push(lost(c, w));
  }

  // ── 점수 반영 (최종 계약 기준) ──
  const finals = [...[...contracts1.values()].filter((c) => !hijacked.has(c.offer.playerId)), ...contracts2];
  for (const c of contracts1.values()) {
    const by = hijacked.get(c.offer.playerId);
    if (by !== undefined) entries.push({ agent: c.agent, stage: 1, status: 'hijacked', offer: c.offer, attract: c.attract, by });
  }
  const maxFee = Math.max(0, ...finals.map((w) => w.fee));
  const sold = [...state.sold];
  for (const w of finals) {
    const bigDeal = state.event === 'deadline' && w.fee === maxFee;
    const fee = w.fee + (bigDeal ? BIG_DEAL_BONUS : 0);
    agents = agents.map((a, k) => (k === w.agent ? { ...a, score: a.score + fee, deals: a.deals + 1 } : a));
    sold.push(w.offer.playerId);
    entries.push({
      agent: w.agent,
      stage: w.stage,
      status: 'won',
      offer: w.offer,
      attract: w.attract,
      fee,
      ...(bigDeal ? { bigDeal } : {}),
      ...(w.stage === 2 && hijacked.has(w.offer.playerId) ? { hijack: true } : {}),
    });
  }
  entries.sort((a, b) => a.stage - b.stage || a.agent - b.agent);

  return {
    ...state,
    rng: rng.state,
    phase: 'result',
    agents,
    sold,
    results: [...state.results, { round: state.round, event: state.event, entries }],
  };
}
