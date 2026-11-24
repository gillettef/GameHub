import { NORMAL_FIELD } from './ai';
import { CLUBS, CLUBS_IN_GAME, EVENT_POOL, GOALS, MAX_AGENTS, RULES, MIN_AGENTS, OVERSEAS_EXTRA, PLAYERS, TOTAL_ROUNDS, goal, initialHand, marketSize, needsOf } from './data';
import { createRng } from './rng';
import { currentEvent, goalProgress, ownSignings } from './rules';
import type { AgentKind, AiLevel, FinalScore, GameState, GoalResult, PersonaKey } from './types';

export interface AgentSetup {
  name: string;
  kind: AgentKind;
  level?: AiLevel;
  persona?: PersonaKey;
}

/** 시장을 2N+1명으로 채운다 (해외파 귀국은 +2). 지난 라운드에 계약되지 않은 선수는 그대로 남는다. */
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
  // 구단마다 요구 카드 3장을 섞어 맨 위를 공개 (교체하지 않는 실험 규칙이면 첫 카드 고정)
  const decks = clubs.map((c) => (RULES.needRotate ? rng.shuffle(needsOf(c)) : needsOf(c)));
  const needs = Object.fromEntries(clubs.map((c, i) => [c, decks[i]![0]!]));
  const needDecks = Object.fromEntries(clubs.map((c, i) => [c, decks[i]!.slice(1)]));
  // 목표 카드를 섞어 각자 비공개로 나눠 준다 (남은 카드는 쓰지 않음)
  const goalDeck = rng.shuffle(GOALS.map((g) => g.id));
  const per = Math.max(1, Math.min(RULES.goalsPerAgent, Math.floor(GOALS.length / setup.length)));
  const events = [...rng.shuffle(EVENT_POOL).slice(0, TOTAL_ROUNDS - 1), 'deadline' as const];
  let normals = 0;
  const agents = setup.map((a, i) => {
    // 보통 AI는 자리 순서대로 서로 다른 성향 (rules-spec 8)
    const persona = a.kind !== 'ai' ? undefined : (a.persona ?? (a.level === 'normal' ? NORMAL_FIELD[normals++ % NORMAL_FIELD.length] : undefined));
    return {
      name: a.name,
      kind: a.kind,
      ...(a.kind === 'ai' ? { level: a.level ?? 'easy' } : {}),
      ...(persona ? { persona } : {}),
      score: 0,
      deals: 0,
      hand: initialHand(),
      goals: goalDeck.slice(i * per, (i + 1) * per),
    };
  });
  return dealRound({ v: 8, rng: rng.state, round: 1, phase: 'bid', events, market: [], clubs, needs, needDecks, signings: [], agents, results: [] });
}

/** 이번 라운드에 선수가 계약된 구단: 공개된 요구 카드를 더미 맨 아래로 넣고 맨 위 카드를 공개한다 */
export function rotateNeeds(state: GameState): Pick<GameState, 'needs' | 'needDecks'> {
  if (!RULES.needRotate) return { needs: state.needs, needDecks: state.needDecks };
  const signed = new Set(state.signings.filter((s) => s.round === state.round).map((s) => s.clubId));
  const needs = { ...state.needs };
  const needDecks = { ...state.needDecks };
  for (const c of signed) {
    const deck = needDecks[c];
    if (!deck?.length) continue;
    needDecks[c] = [...deck.slice(1), needs[c]!];
    needs[c] = deck[0]!;
  }
  return { needs, needDecks };
}

/** 다음 라운드로. 마지막 라운드 뒤에는 목표 카드를 공개하고 게임을 끝낸다. */
export function nextRound(state: GameState): GameState {
  if (state.phase !== 'result') throw new Error('round not resolved');
  if (state.round >= TOTAL_ROUNDS) return finishGame(state);
  return dealRound({ ...state, ...rotateNeeds(state), round: state.round + 1 });
}

/** 이 에이전트의 목표 카드별 진척·달성 여부 (직접 계약한 선수만 센다) */
export function goalResults(state: Pick<GameState, 'signings' | 'agents'>, agentIdx: number): GoalResult[] {
  const own = ownSignings(state, agentIdx);
  return state.agents[agentIdx]!.goals.map((id) => {
    const progress = goalProgress(id, own);
    const done = progress >= goal(id).n;
    return { goal: id, progress, done, points: done ? RULES.goalBonus : 0 };
  });
}

/** 구단에 계약된 선수 수 */
export const clubWeight = (state: Pick<GameState, 'signings'>, clubId: number, agent?: number): number =>
  state.signings.filter((s) => s.clubId === clubId && (agent === undefined || s.agent === agent)).length;

/** 게임 종료: 모두 목표 카드를 공개하고, 직접 계약한 선수로 조건을 채웠으면 보너스를 더한다. */
export function finishGame(state: GameState): GameState {
  if (state.phase === 'done') return state;
  const agents = state.agents.map((a, i) => {
    const goals = goalResults(state, i);
    const goalPoints = goals.reduce((n, g) => n + g.points, 0);
    const final: FinalScore = { goals, goalPoints, total: a.score + goalPoints };
    return { ...a, final };
  });
  return { ...state, agents, phase: 'done' };
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
