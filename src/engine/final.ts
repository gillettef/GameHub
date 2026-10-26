/**
 * 게임 종료와 최종 점수 (§10)
 */
import { goalPoints, personalGoalPoints } from './goals'
import { scoreLine, scorePlane, scoreTower } from './scoring'
import type { GameState, PlayerState } from './types'

export interface FinalScore {
  player: number
  /** 1라운드 끝에 확정한 점수 (§6) */
  line: number
  /** 2라운드 끝에 확정한 점수 (§7) */
  plane: number
  /** 3라운드 끝에 확정한 점수 (§8) */
  tower: number
  /** 라운드 목표 카드 점수 (선착 4 / 달성 2) */
  goals: number
  /** 개인 목표 달성 시 6점 */
  personalGoal: number
  /** 잔해 1개당 -1점 (음수로 기록) */
  debris: number
  total: number
  /** 동점 처리용: 가장 높은 기둥의 높이 */
  tallestPillar: number
  /** 순위 (1부터). 동점 처리 후에도 완전히 같으면 같은 순위 */
  rank: number
}

function tallest(player: PlayerState): number {
  return Math.max(0, ...player.board.cells.flat().map((pillar) => pillar.length))
}

function scorePlayer(state: GameState, player: PlayerState): Omit<FinalScore, 'rank'> {
  // 기본 점수는 라운드 끝에 확정한 값을 쓴다 (v0.7). 확정 전(테스트 등)이면 지금 보드로 계산
  const line = player.lineScore ?? scoreLine(player.board, state.law).total
  const plane = player.planeScore ?? scorePlane(player.board, state.law).total
  const tower = player.towerScore ?? scoreTower(player.board, state.law).total
  const goals = goalPoints(state, player.id)
  const personalGoal = personalGoalPoints(player)
  const debris = -player.debris.length
  return {
    player: player.id,
    line,
    plane,
    tower,
    goals,
    personalGoal,
    debris,
    total: line + plane + tower + goals + personalGoal + debris,
    tallestPillar: tallest(player),
  }
}

/** a가 b보다 앞이면 음수. 점수 높은 순 → 잔해 적은 순 → 가장 높은 기둥이 높은 순 (§10) */
function compare(a: Omit<FinalScore, 'rank'>, b: Omit<FinalScore, 'rank'>): number {
  return b.total - a.total || b.debris - a.debris || b.tallestPillar - a.tallestPillar
}

/** 모든 플레이어의 최종 점수를 순위순으로 */
export function finalScores(state: GameState): FinalScore[] {
  const sorted = state.players.map((p) => scorePlayer(state, p)).sort((a, b) => compare(a, b) || a.player - b.player)
  return sorted.map((s, i) => {
    const firstEqual = sorted.findIndex((o) => compare(o, s) === 0)
    return { ...s, rank: (firstEqual === -1 ? i : firstEqual) + 1 }
  })
}

/** 승자 (동점 처리 후에도 완전히 같으면 여럿) */
export function winners(state: GameState): number[] {
  return finalScores(state)
    .filter((s) => s.rank === 1)
    .map((s) => s.player)
}
