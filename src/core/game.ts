import { HAND_SIZE, CLUBS, EVENT_KEYS, HIJACK, MAX_AGENTS, MIN_AGENTS, PLAYERS, TACTICS_PER_AGENT, TACTIC_KEYS, TOTAL_ROUNDS, marketSize } from './data';
import { createRng } from './rng';
import type { AgentKind, AiLevel, ClientOutcome, GameState } from './types';

export interface AgentSetup {
  name: string;
  kind: AgentKind;
  level?: AiLevel;
}

/**
 * 예고된 이벤트를 적용하고 다음 이벤트를 예고한 뒤 시장을 만든다.
 * 시장 = 각 에이전트가 등록한 의뢰 선수 N장 + 덱에서 N+1장 (섞어서 누구 것인지 모름).
 * 등록하지 않은 에이전트(pending 없음)는 손패에서 무작위로 등록한다. 그 뒤 손패를 HAND_SIZE장으로 채운다.
 */
export function dealRound(state: GameState): GameState {
  const rng = createRng(state.rng);
  const size = marketSize(state.agents.length);
  const event = state.nextEvent;
  const nextEvent = EVENT_KEYS[rng.int(EVENT_KEYS.length)]!;
  let agents = state.agents.map((a) => {
    if (!a.hand.length) return { ...a, pending: null };
    const reg = a.pending !== null && a.hand.includes(a.pending) ? a.pending : a.hand[rng.int(a.hand.length)]!;
    return { ...a, hand: a.hand.filter((id) => id !== reg), clients: [...a.clients, { playerId: reg, round: state.round }], pending: null };
  });
  const regs = agents.flatMap((a) => {
    const last = a.clients.at(-1);
    return last && last.round === state.round ? [last.playerId] : [];
  });
  const held = new Set([...state.sold, ...regs, ...agents.flatMap((a) => a.hand)]);
  const deck = rng.shuffle(PLAYERS.map((p) => p.id).filter((id) => !held.has(id)));
  const drawn = deck.splice(0, Math.max(0, size.players - regs.length));
  const market = rng.shuffle([...regs, ...drawn]);
  agents = agents.map((a) => ({ ...a, hand: [...a.hand, ...deck.splice(0, Math.max(0, HAND_SIZE - a.hand.length))] }));
  const clubs = rng.shuffle(CLUBS.map((c) => c.id)).slice(0, size.clubs);
  return { ...state, rng: rng.state, event, nextEvent, market, clubs, agents, phase: 'bid' };
}

export function createGame(setup: readonly AgentSetup[], seed: number): GameState {
  if (setup.length < MIN_AGENTS || setup.length > MAX_AGENTS) throw new Error(`agents must be ${MIN_AGENTS}~${MAX_AGENTS}`);
  const rng = createRng(seed);
  const handDeck = rng.shuffle(PLAYERS.map((p) => p.id));
  const agents = setup.map((a, i) => ({
    name: a.name,
    kind: a.kind,
    ...(a.kind === 'ai' ? { level: a.level ?? 'easy' } : {}),
    score: 0,
    deals: 0,
    demandUsed: [],
    tactics: [...rng.shuffle(TACTIC_KEYS).slice(0, TACTICS_PER_AGENT), HIJACK],
    // 첫 라운드 등록분 1장 + 손패 HAND_SIZE장
    hand: handDeck.slice(i * (HAND_SIZE + 1), (i + 1) * (HAND_SIZE + 1)),
    clients: [],
    pending: null,
  }));
  return dealRound({
    v: 4,
    rng: rng.state,
    round: 1,
    phase: 'bid',
    event: 'normal',
    nextEvent: EVENT_KEYS[rng.int(EVENT_KEYS.length)]!,
    market: [],
    clubs: [],
    sold: [],
    agents,
    results: [],
  });
}

export function nextRound(state: GameState): GameState {
  if (state.phase !== 'result') throw new Error('round not resolved');
  if (state.round >= TOTAL_ROUNDS) {
    const agents = state.agents.map((a, i) => {
      const bonus = clientOutcomes(state, i).reduce((s, o) => s + o.bonus, 0);
      return { ...a, score: a.score + bonus, clientBonus: bonus };
    });
    return { ...state, agents, phase: 'done' };
  }
  return dealRound({ ...state, round: state.round + 1 });
}

/** 계약된 선수 → 계약한 에이전트 (하이재킹 반영된 최종 계약) */
export function signedBy(state: Pick<GameState, 'results'>): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of state.results) for (const e of r.entries) if (e.status === 'won' && e.offer) m.set(e.offer.playerId, e.agent);
  return m;
}

/**
 * 의뢰 선수 결과: 등록한 라운드에 다른 에이전트가 계약하면 그 선수의 기본 수수료만큼 의뢰 보너스.
 * 직접 계약하면 보너스 없음 (이해충돌 금지 — 수수료만 받는다), 미계약 0.
 */
export function clientOutcomes(state: Pick<GameState, 'results' | 'agents'>, agentIdx: number): ClientOutcome[] {
  return (state.agents[agentIdx]?.clients ?? []).map(({ playerId, round }): ClientOutcome => {
    const won = state.results[round - 1]?.entries.find((e) => e.status === 'won' && e.offer?.playerId === playerId);
    if (!won) return { playerId, round, result: 'unsigned', bonus: 0 };
    return won.agent === agentIdx
      ? { playerId, round, result: 'self', by: won.agent, bonus: 0 }
      : { playerId, round, result: 'other', by: won.agent, bonus: PLAYERS[playerId]!.base };
  });
}

export const isFinished = (state: GameState): boolean => state.phase === 'done';

/** 점수 내림차순 순위. 동점은 같은 순위. */
export function rankings(state: GameState): { agent: number; rank: number; score: number }[] {
  const sorted = state.agents.map((a, agent) => ({ agent, score: a.score })).sort((a, b) => b.score - a.score || a.agent - b.agent);
  return sorted.map((r) => ({ ...r, rank: sorted.findIndex((x) => x.score === r.score) + 1 }));
}

export const winners = (state: GameState): number[] => rankings(state).filter((r) => r.rank === 1).map((r) => r.agent);
