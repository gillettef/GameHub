import { CLUB_BONUS, player, club } from './data';
import type { Rng } from './rng';
import { currentEvent, evaluateOffer, fitScore, isEvaluation, offerValue, validateOffer } from './rules';
import type { EventKey, GameState, Guesses, Offer } from './types';

/** 게임 구단 중 이 선수와 계약할 수 있는 구단의 최고 적합도 */
const bestFit = (state: Pick<GameState, 'clubs'>, playerId: number, event: EventKey): number => {
  const p = player(playerId);
  const fits = state.clubs.map(club).filter((c) => offerValue(c, event) >= p.cost).map((c) => fitScore(p, c));
  return fits.length ? Math.max(...fits) : 0;
};

/**
 * 공개 기록으로 본 '이 에이전트가 각 구단을 밀어 준 정도'.
 * 제안 1건마다 +1, 더 잘 맞는 구단을 두고 그 구단을 골랐으면 차이만큼 더한다.
 */
export function evidence(state: Pick<GameState, 'results' | 'clubs'>, agentIdx: number): Map<number, number> {
  const m = new Map<number, number>(state.clubs.map((c) => [c, 0]));
  for (const r of state.results) {
    for (const e of r.entries) {
      if (e.agent !== agentIdx || !e.offer || e.status === 'invalid' || !m.has(e.offer.clubId)) continue;
      const loss = Math.max(0, bestFit(state, e.offer.playerId, r.event) - fitScore(player(e.offer.playerId), club(e.offer.clubId)));
      m.set(e.offer.clubId, m.get(e.offer.clubId)! + 1 + loss);
    }
  }
  return m;
}

/** 각 구단이 그 에이전트의 비밀 구단일 확률 추정 */
function suspicion(state: GameState, agentIdx: number): Map<number, number> {
  const e = evidence(state, agentIdx);
  const m = new Map<number, number>();
  let total = 0;
  for (const [c, v] of e) {
    m.set(c, v + 0.5);
    total += v + 0.5;
  }
  for (const [c, v] of m) m.set(c, v / total);
  return m;
}

/** AI 제안 생성 (라운드 시작 상태 기준). 유효한 제안이 없으면 null (패스) */
export function makeAiOffer(state: GameState, agentIdx: number, rng: Rng): Offer | null {
  const agent = state.agents[agentIdx];
  if (!agent) throw new Error(`unknown agent ${agentIdx}`);
  const offer = (agent.level ?? 'easy') === 'normal' ? makeNormalOffer(state, agentIdx, rng) : makeEasyOffer(state, agentIdx, rng);
  return offer && isEvaluation(validateOffer(state, agentIdx, offer)) ? offer : null;
}

/** 쉬움: 무작위 선수 → 계약 가능한 구단 중 적합도 상위 3곳 중 하나 → 손의 카드 중 무작위 */
export function makeEasyOffer(state: GameState, agentIdx: number, rng: Rng): Offer | null {
  const agent = state.agents[agentIdx]!;
  const event = currentEvent(state);
  const options = state.market.filter((id) => state.clubs.some((c) => offerValue(club(c), event) >= player(id).cost));
  if (!options.length || !agent.hand.length) return null;
  const p = player(options[rng.int(options.length)]!);
  const eligible = state.clubs
    .map(club)
    .filter((c) => offerValue(c, event) >= p.cost)
    .sort((a, b) => fitScore(p, b) - fitScore(p, a));
  const c = eligible[rng.int(Math.min(3, eligible.length))]!;
  return { playerId: p.id, clubId: c.id, demand: agent.hand[rng.int(agent.hand.length)]! };
}

/** 보통 AI 조정값 (시뮬레이션 실험용으로만 바꾼다) */
export const AI_TUNING = {
  /** 높은 요구 수수료 카드를 아끼는 비용 (손에 1장 남았으면 0) */
  save: 0.55,
  /** 상대 비밀 구단으로 보내는 것을 피하는 정도 */
  deny: 1,
  /** 비밀 구단을 밀어 주는 정도 (위장 조건 안에서) */
  push: 2,
  /** 선수별 최선안 중 상위 몇 개에서 고를지 */
  spread: 5,
  /** 고를 때 가치의 몇 제곱에 비례할지 (클수록 최선안 고집) */
  sharp: 1.5,
};

/**
 * 보통: 모든 (선수, 구단, 카드) 조합의 기대 가치를 비교한다.
 * - 가치 = 수수료 × 추정 승률 + 비밀 구단 가치 − 상대 비밀 구단으로 보낼 위험 − 카드 아끼기 비용
 * - 비밀 구단은 '위장'한다: 공개 기록에서 내 비밀 구단이 가장 의심스러운 구단이 되지 않는 선에서만 밀어 준다
 * - 같은 수에 여러 AI가 몰려 서로 상쇄되지 않도록 선수별 최선안 상위 3개 중 가치 제곱에 비례해 고른다
 */
export function makeNormalOffer(state: GameState, agentIdx: number, rng: Rng): Offer | null {
  const agent = state.agents[agentIdx]!;
  const n = state.agents.length;
  const event = currentEvent(state);
  const clubBonus = (event === 'sponsor' ? 2 : 1) * CLUB_BONUS;
  // 선두가 한 명일 때만 그 에이전트의 비밀 구단을 더 피한다
  const top = Math.max(...state.agents.map((a) => a.score));
  const leaders = state.agents.flatMap((a, i) => (a.score === top ? [i] : []));
  const leader = leaders.length === 1 ? leaders[0]! : -1;
  const sus = state.agents.map((_, k) => (k === agentIdx ? null : suspicion(state, k)));
  const own = evidence(state, agentIdx);
  const maxOther = Math.max(0, ...state.clubs.filter((c) => c !== agent.secret).map((c) => own.get(c)!));
  const ownDeals = state.signings.filter((s) => s.clubId === agent.secret).reduce((x, s) => x + s.weight, 0);
  const rivals = predictRivals(state, agentIdx);
  const lastCard = agent.hand.length === 1;

  const scored: { offer: Offer; value: number }[] = [];
  for (const pid of state.market) {
    const best = bestFit(state, pid, event);
    for (const clubId of state.clubs) {
      for (const demand of agent.hand) {
        const offer: Offer = { playerId: pid, clubId, demand };
        const ev = evaluateOffer(offer, event);
        if (!isEvaluation(ev)) continue;
        const win = winChance(rivals, pid, ev.attract);
        let value = ev.fee * win;
        const fit = ev.attract + demand;
        if (clubId === agent.secret) {
          if (own.get(clubId)! + 1 + (best - fit) < maxOther) value += AI_TUNING.push * clubBonus * win;
          else value -= 0.8 * CLUB_BONUS * (ownDeals + 1);
        } else if (own.get(clubId)! >= maxOther) {
          value += 0.3; // 미끼 구단을 가장 의심스러운 구단으로 유지
        }
        for (let k = 0; k < n; k++) {
          if (k !== agentIdx) value -= AI_TUNING.deny * clubBonus * win * sus[k]!.get(clubId)! * (k === leader ? 1.3 : 0.7);
        }
        if (!lastCard) value -= AI_TUNING.save * demand;
        scored.push({ offer, value });
      }
    }
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.value - a.value);
  const seen = new Set<number>();
  const picks = scored.filter((s) => !seen.has(s.offer.playerId) && seen.add(s.offer.playerId)).slice(0, AI_TUNING.spread);
  return weightedPick(picks, rng).offer;
}

/** 상대 한 명의 예상 제안: 선수별 노릴 확률과 그때의 매력도 분포 */
interface RivalModel {
  target: Map<number, number>;
  attract: Map<number, Map<number, number>>;
}

/**
 * 상대의 수 예측 (한 단계 추론): 상대는 '기본 수수료 + 최고 적합도'가 큰 선수를 더 자주 노리고,
 * 매력도는 그 선수의 최고 적합도 − 손에 남은 카드 중 하나(균등)라고 본다.
 */
function predictRivals(state: GameState, agentIdx: number): RivalModel[] {
  const event = currentEvent(state);
  const reachable = state.market.filter((id) => state.clubs.some((c) => offerValue(club(c), event) >= player(id).cost));
  return state.agents.flatMap((o, k) => {
    if (k === agentIdx || !reachable.length) return [];
    const appeal = reachable.map((id) => Math.exp((player(id).base + bestFit(state, id, event)) / 1.5));
    const sum = appeal.reduce((a, b) => a + b, 0);
    const target = new Map(reachable.map((id, i) => [id, appeal[i]! / sum]));
    const attract = new Map(
      reachable.map((id) => {
        const dist = new Map<number, number>();
        for (const d of o.hand) {
          const a = bestFit(state, id, event) - d;
          dist.set(a, (dist.get(a) ?? 0) + 1 / o.hand.length);
        }
        return [id, dist];
      }),
    );
    return [{ target, attract }];
  });
}

/** 내 매력도로 이 선수를 계약할 확률: 모든 상대가 안 노리거나 더 낮은 매력도로 노려야 이긴다 (같으면 상쇄) */
function winChance(rivals: RivalModel[], playerId: number, attract: number): number {
  let p = 1;
  for (const r of rivals) {
    const t = r.target.get(playerId) ?? 0;
    let lower = 0;
    for (const [a, q] of r.attract.get(playerId) ?? []) if (a < attract) lower += q;
    p *= 1 - t + t * lower;
  }
  return Math.min(0.97, Math.max(0.03, p));
}

/**
 * 비밀 구단 지목. 쉬움은 가장 많이 밀어 준 구단, 보통은 위장을 의심해 절반은 두 번째 구단을 지목한다.
 */
export function makeAiGuesses(state: GameState, agentIdx: number, rng: Rng): Guesses {
  const agent = state.agents[agentIdx]!;
  const out: Guesses = {};
  state.agents.forEach((_, k) => {
    if (k === agentIdx) return;
    const e = evidence(state, k);
    // 내 비밀 구단은 남의 것이 아니므로 제외
    const order = state.clubs.filter((c) => c !== agent.secret).sort((a, b) => e.get(b)! - e.get(a)! || rng.next() - 0.5);
    const second = (agent.level ?? 'easy') === 'normal' && rng.next() < 0.5;
    out[k] = (second ? order[1] : order[0]) ?? order[0]!;
  });
  return out;
}

function weightedPick<T extends { value: number }>(items: T[], rng: Rng): T {
  const weights = items.map((s) => Math.max(0.05, s.value) ** AI_TUNING.sharp);
  let r = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[0]!;
}
