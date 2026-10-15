import { CLUBS, EVENT_KEYS, HIJACK, MAX_AGENTS, MIN_AGENTS, PLAYERS, TACTICS_PER_AGENT, TACTIC_KEYS, TOTAL_ROUNDS, marketSize } from './data';
import { createRng } from './rng';
import type { AgentKind, AiLevel, GameState } from './types';

export interface AgentSetup {
  name: string;
  kind: AgentKind;
  level?: AiLevel;
}

/** 이벤트·선수 시장·구단을 새로 뽑아 입찰 단계로 */
export function dealRound(state: GameState): GameState {
  const rng = createRng(state.rng);
  const size = marketSize(state.agents.length);
  const event = EVENT_KEYS[rng.int(EVENT_KEYS.length)]!;
  const market = rng.shuffle(PLAYERS.map((p) => p.id).filter((id) => !state.sold.includes(id))).slice(0, size.players);
  const clubs = rng.shuffle(CLUBS.map((c) => c.id)).slice(0, size.clubs);
  return { ...state, rng: rng.state, event, market, clubs, phase: 'bid' };
}

export function createGame(setup: readonly AgentSetup[], seed: number): GameState {
  if (setup.length < MIN_AGENTS || setup.length > MAX_AGENTS) throw new Error(`agents must be ${MIN_AGENTS}~${MAX_AGENTS}`);
  const rng = createRng(seed);
  const agents = setup.map((a) => ({
    name: a.name,
    kind: a.kind,
    ...(a.kind === 'ai' ? { level: a.level ?? 'easy' } : {}),
    score: 0,
    deals: 0,
    demandUsed: [],
    tactics: [...rng.shuffle(TACTIC_KEYS).slice(0, TACTICS_PER_AGENT), HIJACK],
  }));
  return dealRound({
    v: 3,
    rng: rng.state,
    round: 1,
    phase: 'bid',
    event: 'normal',
    market: [],
    clubs: [],
    sold: [],
    agents,
    results: [],
  });
}

export function nextRound(state: GameState): GameState {
  if (state.phase !== 'result') throw new Error('round not resolved');
  if (state.round >= TOTAL_ROUNDS) return { ...state, phase: 'done' };
  return dealRound({ ...state, round: state.round + 1 });
}

export const isFinished = (state: GameState): boolean => state.phase === 'done';

/** 점수 내림차순 순위. 동점은 같은 순위. */
export function rankings(state: GameState): { agent: number; rank: number; score: number }[] {
  const sorted = state.agents.map((a, agent) => ({ agent, score: a.score })).sort((a, b) => b.score - a.score || a.agent - b.agent);
  return sorted.map((r) => ({ ...r, rank: sorted.findIndex((x) => x.score === r.score) + 1 }));
}

export const winners = (state: GameState): number[] => rankings(state).filter((r) => r.rank === 1).map((r) => r.agent);
