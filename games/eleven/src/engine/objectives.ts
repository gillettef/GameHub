import { cards } from './cards';
import type { GameState, PlayerState } from './state';
import type { ObjectiveCheck, StaffSet } from './types';

// 목표 카드 달성 판정 (p.27): 목표 달성 2승점, 완벽 달성이면 추가 2승점.
// 규칙서는 달성한 순간 카드를 공개하고 토큰을 받지만, 결과가 같으므로 게임 종료 때 기록(matchHistory 등)으로 한 번에 판정한다.
// 상태와 뷰(본인 진행 상황 표시) 양쪽에서 쓸 수 있게 필요한 필드만 받는다

export const OBJECTIVE_VP = 2;
export const OBJECTIVE_PERFECT_VP = 2;

export type ObjectiveHolder = Pick<
  PlayerState,
  'id' | 'resources' | 'staff' | 'roster' | 'sponsors' | 'infrastructure' | 'office' | 'matchHistory' | 'matchDieInjured' | 'kitSponsors'
>;
type League = GameState['league'];

function longestWinStreak(history: ObjectiveHolder['matchHistory']): number {
  let best = 0;
  let run = 0;
  for (const m of [...history].sort((a, b) => a.week - b.week)) {
    run = m.outcome === 'win' ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function checkObjective(player: ObjectiveHolder, league: League, check: ObjectiveCheck): boolean {
  switch (check.kind) {
    case 'weekWin': {
      const m = player.matchHistory.find((h) => h.week === check.week);
      if (!m || m.outcome !== 'win') return false;
      if (check.margin !== undefined && m.myGoals - m.theirGoals < check.margin) return false;
      return !(check.cleanSheet && m.theirGoals > 0);
    }
    case 'winStreak':
      return longestWinStreak(player.matchHistory) >= check.count;
    case 'leagueFirst': {
      // 같은 위치는 같은 등수(p.26)이므로 공동 1위도 1위. lead 는 나를 뺀 모든 팀과의 칸 차이
      const mine = league.players[player.id] ?? 0;
      const others = [...Object.entries(league.players).filter(([id]) => id !== player.id).map(([, p]) => p), ...league.opponents.map((o) => o.position)];
      const top = Math.max(0, ...others);
      return check.lead !== undefined ? mine - top >= check.lead : mine >= top;
    }
    case 'staffSet': {
      const counts = new Map<StaffSet, number>();
      for (const s of player.staff) counts.set(cards.staff(s.cardId).set, (counts.get(cards.staff(s.cardId).set) ?? 0) + 1);
      return Math.max(0, ...counts.values()) >= check.count;
    }
    case 'infrastructure':
      return player.infrastructure.length >= check.count;
    case 'trainedPlayers':
      return player.roster.filter((r) => r.trained).length >= check.count;
    case 'trainedProspects':
      return player.roster.filter((r) => r.trained && cards.player(r.cardId).kind === 'prospect').length >= check.count;
    case 'prospectGoalVP':
      return player.roster.some((r) => r.trained && cards.player(r.cardId).kind === 'prospect' && r.careerUsed.goals > 0);
    case 'money':
      return player.resources.money >= check.amount;
    case 'noInjuryTokens':
      return player.roster.every((r) => r.tokens.injury === 0);
    case 'noMatchDieInjury':
      return !player.matchDieInjured;
    case 'office':
      return player.office >= check.index;
    case 'sponsors':
      return player.kitSponsors + player.sponsors.billboards.length + (player.sponsors.naming ? 1 : 0) >= check.count;
    case 'sponsorTypes':
      return player.kitSponsors > 0 && player.sponsors.billboards.length > 0 && !!player.sponsors.naming;
  }
}

// 0 = 미달성, 1 = 목표 달성, 2 = 완벽 달성 (완벽 조건은 목표를 달성한 위에 "추가로"만 인정)
export function objectiveLevel(player: ObjectiveHolder, league: League, cardId: string | undefined): 0 | 1 | 2 {
  if (!cardId) return 0;
  const card = cards.objective(cardId);
  if (!checkObjective(player, league, card.goalCheck)) return 0;
  return checkObjective(player, league, card.perfectCheck) ? 2 : 1;
}

export function objectivePoints(level: 0 | 1 | 2): number {
  return level === 0 ? 0 : OBJECTIVE_VP + (level === 2 ? OBJECTIVE_PERFECT_VP : 0);
}
