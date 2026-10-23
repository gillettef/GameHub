/**
 * 화면 연출용 도우미: 진동 피드백, 직전 행동으로 생긴 사건(라운드 전환, 목표 달성 등) 찾기.
 * 엔진 상태를 읽기만 한다.
 */
import { GOAL_ACHIEVED_POINTS, GOAL_FIRST_POINTS, goalPoints, ROUND_GOALS, scoreLine, scorePlane, scoreTower, type GameState } from '../engine'

/** 짧은 진동. 지원하지 않거나 막힌 기기에서는 아무것도 하지 않는다 */
export function buzz(pattern: number | number[] = 12): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
  } catch {
    // 무시
  }
}

/**
 * 지금까지의 점수 (공개 정보만). 개인 목표는 비공개라 빼고,
 * 평면은 확정 전이면 현재 평면으로 어림한다.
 */
export function liveScore(state: GameState, player: number): number {
  const p = state.players[player]
  if (!p) return 0
  const line = scoreLine(p.board, state.law).total
  const plane = state.phase.kind === 'round' && state.phase.round === 1 ? 0 : (p.planeScore ?? scorePlane(p.board, state.law).total)
  const tower = scoreTower(p.board).total
  return line + plane + tower + goalPoints(state, player) - p.debris.length
}

export type FxEvent =
  | { kind: 'round'; round: 1 | 2 | 3 | 4 }
  | { kind: 'turn'; player: number }
  | { kind: 'goal'; player: number; name: string; points: number; first: boolean }
  | { kind: 'debris'; player: number; count: number }
  | { kind: 'plane'; player: number; points: number }

/** 직전 상태와 비교해 연출할 사건을 찾는다 */
export function diffEvents(prev: GameState | null, next: GameState): FxEvent[] {
  if (!prev) return []
  const out: FxEvent[] = []
  const prevRound = prev.phase.kind === 'round' ? prev.phase.round : null
  const nextRound = next.phase.kind === 'round' ? next.phase.round : null
  const roundChanged = nextRound !== null && nextRound !== prevRound
  if (roundChanged) out.push({ kind: 'round', round: nextRound })

  for (const g of next.roundGoals) {
    const before = prev.roundGoals.find((x) => x.id === g.id)
    const name = ROUND_GOALS[g.id].name
    if (g.first !== null && before?.first !== g.first) {
      out.push({ kind: 'goal', player: g.first, name, points: GOAL_FIRST_POINTS, first: true })
    }
    for (const p of g.achieved) {
      if (!before?.achieved.includes(p)) out.push({ kind: 'goal', player: p, name, points: GOAL_ACHIEVED_POINTS, first: false })
    }
  }

  for (const p of next.players) {
    const before = prev.players[p.id]
    if (!before) continue
    const added = p.debris.length - before.debris.length
    if (added > 0) out.push({ kind: 'debris', player: p.id, count: added })
    if (before.planeScore === null && p.planeScore !== null) out.push({ kind: 'plane', player: p.id, points: p.planeScore })
  }

  if (!roundChanged && next.phase.kind === 'round' && prev.phase.kind === 'round' && prev.currentPlayer !== next.currentPlayer) {
    out.push({ kind: 'turn', player: next.currentPlayer })
  }
  return out
}
