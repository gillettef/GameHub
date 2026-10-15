import { CLUBS, DEMANDS, TACTICS, TOTAL_ROUNDS, player } from './data';
import type { Rng } from './rng';
import { consumeCards, demandRemaining, evaluateOffer, fitScore, isEvaluation, offerValue, stars, validateOffer } from './rules';
import type { AgentState, GameState, Offer, RoundSubmission, Stage, TacticKey } from './types';

/** 차수별 제안 조건: 2차는 1차에서 고른 선수·구단 제외, 1차 카드 소모 반영 */
export interface Ctx {
  stage: Stage;
  agent: AgentState;
  excludePlayer: number | null;
  excludeClub: number | null;
}

const ctxFor = (state: GameState, agentIdx: number, first: Offer | null): Ctx => {
  const agent = state.agents[agentIdx]!;
  if (first === null) return { stage: 1, agent, excludePlayer: null, excludeClub: null };
  return { stage: 2, agent: consumeCards(agent, first), excludePlayer: first.playerId, excludeClub: first.clubId };
};

const usableTactics = (ctx: Ctx): TacticKey[] => ctx.agent.tactics.filter((k) => ctx.stage === 2 || !TACTICS[k].secondOnly);

/**
 * AI의 1차·2차 제안 생성. 라운드 시작 상태 기준으로 판단한다.
 * 유효한 제안을 만들지 못하면 그 차수는 null (카드 소모 없음).
 */
export function makeAiOffers(state: GameState, agentIdx: number, rng: Rng): RoundSubmission {
  const agent = state.agents[agentIdx];
  if (!agent) throw new Error(`unknown agent ${agentIdx}`);
  const make = (agent.level ?? 'easy') === 'normal' ? makeNormalOffer : makeEasyOffer;
  const first = make(state, rng, ctxFor(state, agentIdx, null));
  // 1차가 없으면 2차는 1차 제약 없이 고르되 차수는 2차 (하이재킹 사용 가능)
  const ctx2 = first ? ctxFor(state, agentIdx, first) : { ...ctxFor(state, agentIdx, null), stage: 2 as const };
  const second = make(state, rng, ctx2);
  const ok = (o: Offer | null, stage: Stage) => o !== null && isEvaluation(validateOffer(state, agentIdx, o, stage, stage === 2 ? first : null));
  return { first: ok(first, 1) ? first : null, second: ok(second, 2) ? second : null };
}

/** 하위 호환: 1차 제안만 */
export const makeAiOffer = (state: GameState, agentIdx: number, rng: Rng): Offer | null => makeAiOffers(state, agentIdx, rng).first;

const availablePlayers = (state: GameState, ctx: Ctx) =>
  (ctx.stage === 1 ? stars(state) : state.market).filter((id) => !state.sold.includes(id) && id !== ctx.excludePlayer);
const roundClubs = (state: GameState, ctx: Ctx) => state.clubs.filter((id) => id !== ctx.excludeClub).map((id) => CLUBS[id]!);

/** 쉬움 AI: 무작위 선수 → 계약 가능한 구단 중 적합도 상위 3곳 → 요구 수수료 무작위 */
export function makeEasyOffer(state: GameState, rng: Rng, ctx: Ctx): Offer | null {
  const agent = ctx.agent;
  const available = availablePlayers(state, ctx);
  if (!available.length) return null;
  const p = player(available[rng.int(available.length)]!);

  const eligible = roundClubs(state, ctx)
    .filter((c) => offerValue(c, state.event) >= p.cost)
    .sort((a, b) => fitScore(p, b) - fitScore(p, a));
  if (!eligible.length) return null;
  const c = eligible[rng.int(Math.min(3, eligible.length))]!;

  const remaining = demandRemaining(agent);
  const demands = DEMANDS.filter((d) => remaining[d] > 0);
  if (!demands.length) return null;
  const demand = demands[rng.int(demands.length)]!;

  const tactics = usableTactics(ctx);
  const tactic = tactics.length && rng.next() < 0.45 ? tactics[rng.int(tactics.length)]! : null;
  return { playerId: p.id, clubId: c.id, demand, tactic };
}

/** 전략 카드를 아끼는 비용 (마지막 라운드는 0) */
const TACTIC_COST = 0.75;
/** 위협치 계산 시 가정하는 다른 에이전트의 요구 수수료·전략 카드 매력도 */
const ASSUMED_DEMAND = 2;
const ASSUMED_TACTIC = 1;

/**
 * 보통 AI: 모든 제안의 기대 수수료(수수료 × 추정 승률)를 비교해 선수별 최선안 상위 3개 중 가중 무작위 선택.
 * 2차는 다른 에이전트가 1차에 그 선수를 가져갈 확률 q만큼 무산 위험을 반영한다 (하이재킹은 예외).
 */
export function makeNormalOffer(state: GameState, rng: Rng, ctx: Ctx): Offer | null {
  const agent = ctx.agent;
  const available = availablePlayers(state, ctx);
  const allClubs = state.clubs.map((id) => CLUBS[id]!);
  const clubs = roundClubs(state, ctx);
  const remaining = demandRemaining(agent);
  const demands = DEMANDS.filter((d) => remaining[d] > 0);
  const tactics: (TacticKey | null)[] = [null, ...usableTactics(ctx)];
  const tacticCost = state.round >= TOTAL_ROUNDS ? 0 : TACTIC_COST;
  /** 인원이 많을수록 경쟁이 치열하다고 가정 (2인 0, 3인 +0.5, 4인 +1) */
  const crowd = (state.agents.length - 2) * 0.5;
  const q = ctx.stage === 2 ? Math.min(0.9, (1.5 * (state.agents.length - 1)) / Math.max(1, state.market.length)) : 0;

  const scored: { offer: Offer; value: number }[] = [];
  for (const pid of available) {
    const p = player(pid);
    const reach = allClubs.filter((c) => offerValue(c, state.event) >= p.cost);
    const threat = reach.length ? Math.max(...reach.map((c) => fitScore(p, c))) + ASSUMED_TACTIC - ASSUMED_DEMAND + crowd : 0;
    for (const c of clubs) {
      for (const demand of demands) {
        for (const tactic of tactics) {
          const offer: Offer = { playerId: pid, clubId: c.id, demand, tactic };
          const ev = evaluateOffer(offer, state.event);
          if (!isEvaluation(ev)) continue;
          const win = Math.min(1, Math.max(0.05, 0.5 + 0.15 * (ev.attract - threat)));
          const survive = tactic === 'hijack' ? 1 : 1 - q;
          scored.push({ offer, value: ev.fee * win * survive - (tactic ? tacticCost : 0) });
        }
      }
    }
  }
  if (!scored.length) return null;

  // 선수별 최선 제안 중 상위 N+1명 → 여러 AI가 같은 선수에 몰려 동률 상쇄되지 않게
  scored.sort((a, b) => b.value - a.value);
  const seen = new Set<number>();
  const top = scored.filter((s) => !seen.has(s.offer.playerId) && seen.add(s.offer.playerId)).slice(0, state.agents.length + 1);
  const pick = weightedPick(top, rng);
  // 그 선수에 대한 상위 3개 안(구단·요구 수수료·전략 조합) 중 다시 가중 선택 → 같은 제안끼리 동률 상쇄되는 일을 줄임
  const variants = scored.filter((s) => s.offer.playerId === pick.offer.playerId).slice(0, 3);
  return weightedPick(variants, rng).offer;
}

function weightedPick<T extends { value: number }>(items: T[], rng: Rng): T {
  const weights = items.map((s) => Math.max(0.01, s.value));
  let r = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[0]!;
}
