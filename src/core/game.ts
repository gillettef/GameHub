import { makeAiGuesses } from './ai';
import { CLUBS, CLUBS_IN_GAME, DEMANDS, EVENT_POOL, MAX_AGENTS, RULES, MIN_AGENTS, OVERSEAS_EXTRA, PLAYERS, TOTAL_ROUNDS, marketSize } from './data';
import { createRng } from './rng';
import { currentEvent } from './rules';
import type { AgentKind, AiLevel, FinalScore, GameState, Guesses, PersonaKey } from './types';

export interface AgentSetup {
  name: string;
  kind: AgentKind;
  level?: AiLevel;
  persona?: PersonaKey;
}

/** 시장을 N+1명으로 채운다 (해외파 귀국은 +2). 지난 라운드에 계약되지 않은 선수는 그대로 남는다. */
export function dealRound(state: GameState): GameState {
  const rng = createRng(state.rng);
  const want = marketSize(state.agents.length) + (currentEvent(state) === 'overseas' ? OVERSEAS_EXTRA : 0);
  const held = new Set([...state.market, ...state.signings.map((s) => s.playerId)]);
  const deck = rng.shuffle(PLAYERS.map((p) => p.id).filter((id) => !held.has(id)));
  const market = [...state.market, ...deck.slice(0, Math.max(0, want - state.market.length))];
  return { ...state, rng: rng.state, market, phase: 'bid' };
}

export function createGame(setup: readonly AgentSetup[], seed: number): GameState {
  if (setup.length < MIN_AGENTS || setup.length > MAX_AGENTS) throw new Error(`agents must be ${MIN_AGENTS}~${MAX_AGENTS}`);
  const rng = createRng(seed);
  const clubs = rng.shuffle(CLUBS.map((c) => c.id)).slice(0, CLUBS_IN_GAME);
  const secrets = rng.shuffle(clubs);
  const events = [...rng.shuffle(EVENT_POOL).slice(0, TOTAL_ROUNDS - 1), 'deadline' as const];
  const agents = setup.map((a, i) => ({
    name: a.name,
    kind: a.kind,
    ...(a.kind === 'ai' ? { level: a.level ?? 'easy' } : {}),
    ...(a.kind === 'ai' && a.persona ? { persona: a.persona } : {}),
    score: 0,
    deals: 0,
    hand: [...DEMANDS],
    secret: secrets[i]!,
  }));
  return dealRound({ v: 5, rng: rng.state, round: 1, phase: 'bid', events, market: [], clubs, signings: [], agents, results: [] });
}

/** 다음 라운드로. 마지막 라운드 뒤에는 비밀 구단 지목 단계로 넘어간다. */
export function nextRound(state: GameState): GameState {
  if (state.phase !== 'result') throw new Error('round not resolved');
  if (state.round >= TOTAL_ROUNDS) return { ...state, phase: 'guess' };
  return dealRound({ ...state, round: state.round + 1 });
}

/** 공개 기록: 에이전트별로 각 구단에 제안한 횟수 (계약 성공·실패 모두. 실물에서는 구단 카드 위의 색 큐브) */
export function clubMarks(state: Pick<GameState, 'results' | 'agents' | 'clubs'>): Record<number, number>[] {
  const marks = state.agents.map(() => Object.fromEntries(state.clubs.map((c) => [c, 0])) as Record<number, number>);
  for (const r of state.results) for (const e of r.entries) if (e.offer && e.status !== 'invalid' && marks[e.agent]![e.offer.clubId] !== undefined) marks[e.agent]![e.offer.clubId]!++;
  return marks;
}

/** 구단 아래 놓인 선수 수 (스폰서 데이 계약은 2명으로 셈) */
export const clubWeight = (state: Pick<GameState, 'signings'>, clubId: number, agent?: number): number =>
  state.signings.filter((s) => s.clubId === clubId && (agent === undefined || s.agent === agent)).reduce((n, s) => n + s.weight, 0);

/**
 * 게임 종료: 모든 에이전트가 다른 에이전트의 비밀 구단을 하나씩 지목한다.
 * 맞히면 지목한 사람 +GUESS_BONUS. 한 명에게라도 들킨 에이전트는 비밀 구단 보너스를 받지 못한다.
 * 들키지 않았으면 비밀 구단 아래 선수 1명당 +CLUB_BONUS.
 */
export function finishGame(state: GameState, humanGuesses: Readonly<Record<number, Guesses>>): GameState {
  if (state.phase !== 'guess') throw new Error('not in guess phase');
  const rng = createRng(state.rng);
  const guesses: Guesses[] = state.agents.map((a, i) => {
    if (a.kind === 'ai') return makeAiGuesses(state, i, rng);
    const g = humanGuesses[i];
    if (!g) throw new Error(`missing guesses for agent ${i}`);
    // 한 명만 지목하는 규칙이면 첫 지목만 인정
    if (RULES.guessOne) {
      const first = Object.entries(g)[0];
      return first ? { [Number(first[0])]: first[1] } : {};
    }
    return g;
  });
  const exposed = state.agents.map((_, i) => guesses.some((g, k) => k !== i && g[i] === state.agents[i]!.secret));
  const agents = state.agents.map((a, i) => {
    const hits = state.agents.filter((o, k) => k !== i && guesses[i]![k] === o.secret).length;
    const misses = state.agents.filter((o, k) => k !== i && guesses[i]![k] !== undefined && guesses[i]![k] !== o.secret).length;
    const clubDeals = clubWeight(state, a.secret, RULES.clubOwnOnly ? i : undefined);
    const final: FinalScore = {
      guesses: guesses[i]!,
      guessPoints: hits * RULES.guessBonus - misses * RULES.wrongGuess,
      exposed: exposed[i]!,
      clubDeals,
      clubPoints: exposed[i] ? 0 : clubDeals * RULES.clubBonus,
      total: 0,
    };
    final.total = a.score + final.guessPoints + final.clubPoints;
    return { ...a, final };
  });
  return { ...state, rng: rng.state, agents, phase: 'done' };
}

export const isFinished = (state: GameState): boolean => state.phase === 'done';

/** 현재 점수: 종료 후에는 최종 점수, 진행 중에는 공개된 계약 수수료 */
export const totalOf = (a: GameState['agents'][number]): number => a.final?.total ?? a.score;

/** 점수 내림차순 순위. 동점은 같은 순위. */
export function rankings(state: GameState): { agent: number; rank: number; score: number }[] {
  const sorted = state.agents.map((a, agent) => ({ agent, score: totalOf(a) })).sort((a, b) => b.score - a.score || a.agent - b.agent);
  return sorted.map((r) => ({ ...r, rank: sorted.findIndex((x) => x.score === r.score) + 1 }));
}

export const winners = (state: GameState): number[] =>
  rankings(state)
    .filter((r) => r.rank === 1)
    .map((r) => r.agent);
