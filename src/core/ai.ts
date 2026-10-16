import { RULES, player, club } from './data';
import type { Rng } from './rng';
import { currentEvent, demandPenalty, evaluateOffer, fitScore, isEvaluation, offerValue, validateOffer } from './rules';
import type { AgentState, Demand, EventKey, GameState, Guesses, Offer, PersonaKey } from './types';

/** 게임 구단 중 이 선수와 계약할 수 있는 구단의 최고 적합도 */
const bestFit = (state: Pick<GameState, 'clubs'>, playerId: number, event: EventKey): number => {
  const p = player(playerId);
  const fits = state.clubs.map(club).filter((c) => offerValue(c, event) >= p.cost).map((c) => fitScore(p, c));
  return fits.length ? Math.max(...fits) : 0;
};

/**
 * 공개 기록으로 본 '이 에이전트가 각 구단을 밀어 준 정도'.
 * 제안 1건마다 +1, 더 잘 맞는 구단을 두고 그 구단을 골랐으면 차이 × lossWeight 만큼 더한다.
 */
export function evidence(state: Pick<GameState, 'results' | 'clubs'>, agentIdx: number, lossWeight = 1): Map<number, number> {
  const m = new Map<number, number>(state.clubs.map((c) => [c, 0]));
  for (const r of state.results) {
    for (const e of r.entries) {
      if (e.agent !== agentIdx || !e.offer || e.status === 'invalid' || !m.has(e.offer.clubId)) continue;
      const loss = Math.max(0, bestFit(state, e.offer.playerId, r.event) - fitScore(player(e.offer.playerId), club(e.offer.clubId)));
      m.set(e.offer.clubId, m.get(e.offer.clubId)! + 1 + loss * lossWeight);
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

/**
 * AI 성향(페르소나). 앱의 '보통'은 balanced, '쉬움'은 random 이다.
 * 나머지는 AI 플레이테스터 리그(scripts/league.ts)에서 규칙의 허점을 찾는 데 쓴다.
 */
export interface Persona {
  name: string;
  kind: 'random' | 'value' | 'spoiler' | 'pass';
  /** 비밀 구단을 밀어 주는 정도 */
  push: number;
  /** true: 공개 기록에서 비밀 구단이 1위가 되지 않게만 민다 (위장) */
  stealth: boolean;
  /** 상대 비밀 구단으로 보내는 것을 피하는 정도 */
  deny: number;
  /** 높은 요구 수수료 카드를 아끼는 비용 (손에 1장 남았으면 0) */
  save: number;
  /** 요구 수수료 1억당 가치 가산 (욕심) */
  greed: number;
  /** 승률에 붙이는 지수 (1보다 크면 확실한 계약을 선호) */
  risk: number;
  /** 선수별 최선안 중 상위 몇 개에서 고를지 */
  spread: number;
  /** 가치의 몇 제곱에 비례해 고를지 */
  sharp: number;
  /** 지목 방식: 공개 기록 1위 / 반반 / 2위 */
  guess: 'top' | 'mix' | 'second';
  /** 지목할 때 '더 맞는 구단을 두고 고른' 증거에 주는 가중치 */
  tell: number;
  /** 요구 수수료를 강제로 고른다 (퇴화 전략 검사용) */
  demand?: 'min' | 'max';
  /** 상대 예측: 1 = 단순 기대값 softmax, 2 = 상대도 나를 1단계로 예측, 3 = 상대의 실제 선택 방식(상위 후보 가중 선택) 모방 */
  depth: 1 | 2 | 3;
}

const base: Persona = { name: '균형형', kind: 'value', push: 2, stealth: true, deny: 1, save: 0, greed: 0, risk: 1, spread: 5, sharp: 1.5, guess: 'mix', tell: 1, depth: 1 };

export const PERSONAS: Record<PersonaKey, Persona> = {
  random: { ...base, name: '무작위', kind: 'random', guess: 'top' },
  balanced: base,
  greedy: { ...base, name: '욕심형', greed: 1.5 },
  cautious: { ...base, name: '신중형', risk: 2, greed: 0 },
  blatant: { ...base, name: '노골형', push: 3, stealth: false, guess: 'top' },
  stealth: { ...base, name: '위장형', push: 2.5 },
  /** 비밀 구단을 밀어 주지 않는다 (그 외는 균형형과 같음) — 핵심 장치의 영향 측정용 */
  ignore: { ...base, name: '무시형', push: 0 },
  deducer: { ...base, name: '추리형', deny: 2, tell: 2 },
  spoiler: { ...base, name: '방해형', kind: 'spoiler' },
  pass: { ...base, name: '항상 패스', kind: 'pass' },
  low: { ...base, name: '항상 최저 카드', demand: 'min' },
  high: { ...base, name: '항상 최고 카드', demand: 'max' },
};

/** 상대 예측 모델의 집중도 (클수록 상대가 좋은 수에 몰린다고 본다). 보정: scripts/calibrate.ts */
export const AI_MODEL = { beta1: 1 / 1.2, beta2: 1 };

/** 시뮬레이션 진단용: 켜면 가치형 AI가 고른 수의 예측 승률을 기록한다 */
export const AI_TRACE = { on: false, items: [] as { round: number; agent: number; playerId: number; predicted: number }[] };

/** 보통 AI 조정값 = balanced 페르소나 (시뮬레이션 --tune 으로만 바꾼다) */
export const AI_TUNING = PERSONAS.balanced;

export const personaOf = (a: AgentState): Persona => PERSONAS[a.persona ?? ((a.level ?? 'easy') === 'normal' ? 'balanced' : 'random')];

/** AI 제안 생성 (라운드 시작 상태 기준). 유효한 제안이 없으면 null (패스) */
export function makeAiOffer(state: GameState, agentIdx: number, rng: Rng): Offer | null {
  const agent = state.agents[agentIdx];
  if (!agent) throw new Error(`unknown agent ${agentIdx}`);
  const ps = personaOf(agent);
  let offer: Offer | null = null;
  if (ps.kind === 'random') offer = makeEasyOffer(state, agentIdx, rng);
  else if (ps.kind === 'spoiler') offer = makeSpoilerOffer(state, agentIdx, rng) ?? makeNormalOffer(state, agentIdx, rng, ps);
  else if (ps.kind === 'value') offer = makeNormalOffer(state, agentIdx, rng, ps);
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

/**
 * 가치형 AI: 모든 (선수, 구단, 카드) 조합의 기대 가치를 비교한다.
 * - 가치 = 수수료 × 승률^risk + 욕심 + 비밀 구단 가치 − 상대 비밀 구단 회피 − 카드 아끼기
 * - 승률은 상대들의 수를 한 단계 예측해서 구한다 (predictRivals)
 * - 같은 수에 여러 AI가 몰려 서로 상쇄되지 않도록 선수별 최선안 상위 spread 개 중 가치^sharp 에 비례해 고른다
 */
export function makeNormalOffer(state: GameState, agentIdx: number, rng: Rng, ps: Persona = PERSONAS.balanced): Offer | null {
  const rivals = rivalsFor(state, agentIdx, ps.depth);
  const picks = scoreOffers(state, agentIdx, ps, rivals);
  if (!picks.length) return null;
  const chosen = weightedPick(picks, rng, ps.sharp).offer;
  if (AI_TRACE.on) {
    const ev = evaluateOffer(chosen, currentEvent(state));
    if (isEvaluation(ev)) AI_TRACE.items.push({ round: state.round, agent: agentIdx, playerId: chosen.playerId, predicted: winChance(rivals, chosen.playerId, ev.attract) });
  }
  return chosen;
}

const rivalsFor = (state: GameState, agentIdx: number, depth: Persona['depth']): RivalModel[] =>
  depth === 3 ? policyRivals(state, agentIdx) : depth === 2 ? predictRivals2(state, agentIdx) : predictRivals(state, agentIdx);

/** 가치형 AI의 후보: 선수별 최선안 상위 spread 개 (가치 내림차순) */
function scoreOffers(state: GameState, agentIdx: number, ps: Persona, rivals: RivalModel[]): { offer: Offer; value: number }[] {
  const agent = state.agents[agentIdx]!;
  const n = state.agents.length;
  const event = currentEvent(state);
  const clubBonus = (event === 'sponsor' ? 2 : 1) * RULES.clubBonus;
  const leader = soleLeader(state);
  const sus = state.agents.map((_, k) => (k === agentIdx ? null : suspicion(state, k)));
  const own = evidence(state, agentIdx);
  const maxOther = Math.max(0, ...state.clubs.filter((c) => c !== agent.secret).map((c) => own.get(c)!));
  const ownDeals = state.signings.filter((s) => s.clubId === agent.secret && (!RULES.clubOwnOnly || s.agent === agentIdx)).reduce((x, s) => x + s.weight, 0);
  const lastCard = agent.hand.length === 1;
  const hand: Demand[] = ps.demand === 'min' ? [Math.min(...agent.hand) as Demand] : ps.demand === 'max' ? [Math.max(...agent.hand) as Demand] : agent.hand;

  const scored: { offer: Offer; value: number }[] = [];
  for (const pid of state.market) {
    const best = bestFit(state, pid, event);
    for (const clubId of state.clubs) {
      for (const demand of hand) {
        const offer = { playerId: pid, clubId, demand } as Offer;
        const ev = evaluateOffer(offer, event);
        if (!isEvaluation(ev)) continue;
        const win = winChance(rivals, pid, ev.attract) ** ps.risk;
        let value = ev.fee * win + ps.greed * demand * win;
        const fit = ev.attract + demandPenalty(demand);
        if (clubId === agent.secret && ps.push > 0) {
          if (!ps.stealth || own.get(clubId)! + 1 + (best - fit) < maxOther) value += ps.push * clubBonus * win;
          else value -= 0.8 * RULES.clubBonus * (ownDeals + 1);
        } else if (ps.stealth && ps.push > 0 && own.get(clubId)! >= maxOther) {
          value += 0.3; // 미끼 구단을 가장 의심스러운 구단으로 유지
        }
        for (let k = 0; k < n; k++) {
          if (k !== agentIdx && !RULES.clubOwnOnly) value -= ps.deny * clubBonus * win * sus[k]!.get(clubId)! * (k === leader ? 1.3 : 0.7);
        }
        if (!lastCard) value -= ps.save * demand;
        scored.push({ offer, value });
      }
    }
  }
  scored.sort((a, b) => b.value - a.value);
  const seen = new Set<number>();
  return scored.filter((s) => !seen.has(s.offer.playerId) && seen.add(s.offer.playerId)).slice(0, ps.spread);
}

/**
 * 정책 모방 예측 (depth 3): 각 상대가 '한 단계 예측을 쓰는 균형형'처럼 실제로 후보를 뽑고
 * 가치^sharp 에 비례해 고른다고 보고, 그 선택 확률을 그대로 쓴다.
 */
function policyRivals(state: GameState, agentIdx: number): RivalModel[] {
  return state.agents.flatMap((_, k) => (k === agentIdx ? [] : cached(state, `3:${k}`, () => [policyModel(state, k)])));
}

function policyModel(state: GameState, k: number): RivalModel {
  const ps: Persona = { ...PERSONAS.balanced, depth: 1 };
  const picks = scoreOffers(state, k, ps, predictRivals(state, k));
  const event = currentEvent(state);
  return toModel(
    k,
    picks.flatMap((p) => {
      const ev = evaluateOffer(p.offer, event);
      return isEvaluation(ev) ? [{ pid: p.offer.playerId, attract: ev.attract, w: Math.max(0.05, p.value) ** ps.sharp }] : [];
    }),
  );
}

/** 단독 선두 (공동이면 -1) */
function soleLeader(state: GameState): number {
  const top = Math.max(...state.agents.map((a) => a.score));
  const leaders = state.agents.flatMap((a, i) => (a.score === top ? [i] : []));
  return leaders.length === 1 ? leaders[0]! : -1;
}

/**
 * 방해형: 단독 선두가 가장 노릴 법한 선수에 같은 매력도로 들어가 상쇄시킨다 (킹메이킹 검사용).
 * 같은 매력도를 만들 수 없거나 선두가 자기 자신이면 null.
 */
function makeSpoilerOffer(state: GameState, agentIdx: number, rng: Rng): Offer | null {
  const leader = soleLeader(state);
  if (leader < 0 || leader === agentIdx) return null;
  const model = predictRivals(state, agentIdx).find((r) => r.agent === leader);
  if (!model) return null;
  const [pid] = [...model.target].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (pid === undefined) return null;
  const dist = [...(model.attract.get(pid) ?? [])].sort((a, b) => b[1] - a[1]);
  const want = dist[0]?.[0];
  if (want === undefined) return null;
  const event = currentEvent(state);
  const agent = state.agents[agentIdx]!;
  const options: Offer[] = [];
  for (const clubId of state.clubs)
    for (const demand of agent.hand) {
      const o = { playerId: pid, clubId, demand } as Offer;
      const ev = evaluateOffer(o, event);
      if (isEvaluation(ev) && ev.attract === want) options.push(o);
    }
  return options.length ? options[rng.int(options.length)]! : null;
}

/** 상대 한 명의 예상 제안: 선수별 노릴 확률과 그때의 매력도 분포 */
interface RivalModel {
  agent: number;
  target: Map<number, number>;
  attract: Map<number, Map<number, number>>;
}

/**
 * 상대의 수 예측 (한 단계 추론): 상대는 모든 (선수, 구단, 카드) 조합 중
 * '수수료 × 단순 승률'이 큰 수를 softmax 확률로 고른다고 본다.
 */
/** 같은 라운드 상태에서 여러 AI가 같은 예측을 반복 계산하지 않도록 캐시 (상태 객체는 불변) */
const rivalCache = new WeakMap<GameState, Map<string, RivalModel[]>>();
function cached(state: GameState, key: string, make: () => RivalModel[]): RivalModel[] {
  let m = rivalCache.get(state);
  if (!m) rivalCache.set(state, (m = new Map()));
  let v = m.get(key);
  if (!v) m.set(key, (v = make()));
  return v;
}

function predictRivals(state: GameState, agentIdx: number): RivalModel[] {
  return cached(state, `1:${agentIdx}`, () => predictRivals1(state, agentIdx));
}

function predictRivals1(state: GameState, agentIdx: number): RivalModel[] {
  const event = currentEvent(state);
  return state.agents.flatMap((o, k) => {
    if (k === agentIdx) return [];
    const combos: { pid: number; attract: number; w: number }[] = [];
    for (const pid of state.market) {
      const best = bestFit(state, pid, event);
      for (const clubId of state.clubs)
        for (const demand of o.hand) {
          const ev = evaluateOffer({ playerId: pid, clubId, demand } as Offer, event);
          if (!isEvaluation(ev)) continue;
          const w0 = Math.min(0.95, Math.max(0.05, 0.5 + 0.2 * (ev.attract - (best - 2.5))));
          combos.push({ pid, attract: ev.attract, w: Math.exp(ev.fee * w0 * AI_MODEL.beta1) });
        }
    }
    const sum = combos.reduce((a, c) => a + c.w, 0);
    const target = new Map<number, number>();
    const attract = new Map<number, Map<number, number>>();
    for (const c of combos) {
      const q = c.w / sum;
      target.set(c.pid, (target.get(c.pid) ?? 0) + q);
      const d = attract.get(c.pid) ?? new Map<number, number>();
      d.set(c.attract, (d.get(c.attract) ?? 0) + q);
      attract.set(c.pid, d);
    }
    // 매력도 분포는 그 선수를 노린다는 조건부 확률로 정규화
    for (const [pid, d] of attract) {
      const t = target.get(pid)!;
      for (const [a, q] of d) d.set(a, q / t);
    }
    return [{ agent: k, target, attract }];
  });
}

/**
 * 두 단계 추론: 각 상대 k 는 '나머지 모두가 한 단계 예측대로 둔다'고 보고 수수료 × 승률이 큰 수를 고른다.
 * 그 선택 분포(softmax)를 내 승률 계산에 쓴다.
 */
function predictRivals2(state: GameState, agentIdx: number): RivalModel[] {
  return state.agents.flatMap((_, k) => (k === agentIdx ? [] : cached(state, `2:${k}`, () => [level2Model(state, k)])));
}

/** 에이전트 k 의 두 단계 모델: k 는 나머지 모두가 한 단계 예측대로 둔다고 보고 고른다 (누가 묻든 같으므로 k 별로 캐시) */
function level2Model(state: GameState, k: number): RivalModel {
  const event = currentEvent(state);
  const others = predictRivals(state, k);
  const combos: { pid: number; attract: number; w: number }[] = [];
  for (const pid of state.market)
    for (const clubId of state.clubs)
      for (const demand of state.agents[k]!.hand) {
        const ev = evaluateOffer({ playerId: pid, clubId, demand } as Offer, event);
        if (!isEvaluation(ev)) continue;
        combos.push({ pid, attract: ev.attract, w: Math.exp(ev.fee * winChance(others, pid, ev.attract) * AI_MODEL.beta2) });
      }
  return toModel(k, combos);
}

function toModel(agent: number, combos: { pid: number; attract: number; w: number }[]): RivalModel {
  const sum = combos.reduce((a, c) => a + c.w, 0) || 1;
  const target = new Map<number, number>();
  const attract = new Map<number, Map<number, number>>();
  for (const c of combos) {
    const q = c.w / sum;
    target.set(c.pid, (target.get(c.pid) ?? 0) + q);
    const d = attract.get(c.pid) ?? new Map<number, number>();
    d.set(c.attract, (d.get(c.attract) ?? 0) + q);
    attract.set(c.pid, d);
  }
  for (const [pid, d] of attract) {
    const t = target.get(pid)!;
    for (const [a, q] of d) d.set(a, q / t);
  }
  return { agent, target, attract };
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

/** 비밀 구단 지목: 페르소나의 방식대로 공개 기록 1위 또는 2위(위장 의심) 구단 */
export function makeAiGuesses(state: GameState, agentIdx: number, rng: Rng): Guesses {
  const agent = state.agents[agentIdx]!;
  const ps = personaOf(agent);
  const out: Guesses = {};
  const picks: { k: number; club: number; conf: number }[] = [];
  state.agents.forEach((_, k) => {
    if (k === agentIdx) return;
    const e = evidence(state, k, ps.tell);
    // 내 비밀 구단은 남의 것이 아니므로 제외
    const order = state.clubs.filter((c) => c !== agent.secret).sort((a, b) => e.get(b)! - e.get(a)! || rng.next() - 0.5);
    const second = ps.guess === 'second' || (ps.guess === 'mix' && rng.next() < 0.5);
    const pick = (second ? order[1] : order[0]) ?? order[0]!;
    const total = order.reduce((s, c) => s + e.get(c)! + 0.5, 0);
    picks.push({ k, club: pick, conf: (e.get(pick)! + 0.5) / total });
  });
  // 틀리면 감점이 있으면 기대값이 양수인 지목만 한다
  const worth = (p: { conf: number }) => !RULES.wrongGuess || p.conf * RULES.guessBonus > (1 - p.conf) * RULES.wrongGuess;
  if (!RULES.guessOne) {
    for (const p of picks) if (worth(p)) out[p.k] = p.club;
    return out;
  }
  // 한 명만: 확신 × (비밀 구단 아래 선수 수 + 1) 이 가장 큰 상대
  const stake = (c: number) => state.signings.filter((s) => s.clubId === c).reduce((x, s) => x + s.weight, 0) + 1;
  const best = picks.reduce((a, b) => (b.conf * stake(b.club) > a.conf * stake(a.club) ? b : a));
  if (worth(best)) out[best.k] = best.club;
  return out;
}

function weightedPick<T extends { value: number }>(items: T[], rng: Rng, sharp: number): T {
  const weights = items.map((s) => Math.max(0.05, s.value) ** sharp);
  let r = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[0]!;
}
