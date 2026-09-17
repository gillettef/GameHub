// 리그 성적표 순위별 승점 (규칙서 p.26)
const LEAGUE_RANK_POINTS = [15, 10, 8, 6, 4, 2, 0, -2] as const;

export function leagueRankPoints(rank: number): number {
  if (!Number.isInteger(rank) || rank < 1) {
    throw new RangeError(`invalid league rank: ${rank}`);
  }
  return LEAGUE_RANK_POINTS[rank - 1] ?? -4;
}
