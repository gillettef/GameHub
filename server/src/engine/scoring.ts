import { cards } from './cards';
import { objectiveLevel, objectivePoints } from './objectives';
import type { GameState, PlayerId, PlayerState } from './state';
import type { StaffSet } from './types';

// 리그 성적표 순위별 승점 (규칙서 p.26)
const LEAGUE_RANK_POINTS = [15, 10, 8, 6, 4, 2, 0, -2] as const;

export function leagueRankPoints(rank: number): number {
  if (!Number.isInteger(rank) || rank < 1) {
    throw new RangeError(`invalid league rank: ${rank}`);
  }
  return LEAGUE_RANK_POINTS[rank - 1] ?? -4;
}

// 같은 위치는 같은 등수 (p.26 1): 등수 = 1 + 더 높은 위치의 팀 수
export function leagueRank(state: GameState, pid: PlayerId): number {
  const mine = state.league.players[pid]!;
  const positions = [...Object.values(state.league.players), ...state.league.opponents.map((o) => o.position)];
  return 1 + positions.filter((p) => p > mine).length;
}

export interface ScoreBreakdown {
  leagueRank: number;
  league: number;
  tokens: number;
  staffSets: number;
  infrastructure: number;
  office: number;
  suspensions: number; // 음수
  objective: number; // 목표 카드 (p.27): 달성 2, 완벽 달성 4
  objectiveCard?: string; // 게임 종료 때 공개
  objectiveLevel: 0 | 1 | 2;
  total: number;
}

// p.17, p.28: 세트별 보유 수에 따른 승점, 출장정지 카드는 제외
export function staffSetPoints(player: PlayerState): number {
  const counts = new Map<StaffSet, { n: number; table: readonly number[] }>();
  for (const s of player.staff) {
    if (s.suspension > 0) continue;
    const card = cards.staff(s.cardId);
    const entry = counts.get(card.set) ?? { n: 0, table: card.setPoints };
    entry.n++;
    counts.set(card.set, entry);
  }
  let total = 0;
  for (const { n, table } of counts.values()) total += table[Math.min(n, table.length) - 1] ?? 0;
  return total;
}

export function scorePlayer(state: GameState, pid: PlayerId): ScoreBreakdown {
  const player = state.players[pid]!;
  const rank = leagueRank(state, pid);
  const league = leagueRankPoints(rank);
  const tokens = player.vp + player.roster.reduce((n, r) => n + r.careerVP, 0);
  const staffSets = staffSetPoints(player);
  const infrastructure = player.infrastructure.reduce((n, t) => n + (cards.boardData.infrastructure.find((i) => i.type === t)?.vp ?? 0), 0);
  const office = cards.boardData.office[player.office]?.vp ?? 0;
  const suspensions = -(player.roster.reduce((n, r) => n + r.tokens.suspension, 0) + player.staff.reduce((n, s) => n + s.suspension, 0));
  const level = objectiveLevel(player, state.league, player.objective);
  const objective = objectivePoints(level);
  return {
    leagueRank: rank,
    league,
    tokens,
    staffSets,
    infrastructure,
    office,
    suspensions,
    objective,
    objectiveCard: player.objective,
    objectiveLevel: level,
    total: league + tokens + staffSets + infrastructure + office + suspensions + objective,
  };
}

// 동점이면 리그 순위가 높은 쪽, 그래도 같으면 공동 승리 (p.26)
export function finalScores(state: GameState): { scores: Record<PlayerId, ScoreBreakdown>; winners: PlayerId[] } {
  const scores = Object.fromEntries(state.seats.map((id) => [id, scorePlayer(state, id)]));
  const best = Math.max(...state.seats.map((id) => scores[id]!.total));
  const top = state.seats.filter((id) => scores[id]!.total === best);
  const bestRank = Math.min(...top.map((id) => scores[id]!.leagueRank));
  return { scores, winners: top.filter((id) => scores[id]!.leagueRank === bestRank) };
}
