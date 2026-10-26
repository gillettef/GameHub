/**
 * 라운드 목표 카드 진행 (§5 라운드 목표 카드): 공개, 달성 판정, 점수.
 */
import {
  GOAL_ACHIEVED_POINTS,
  GOAL_FIRST_POINTS,
  GOALS_PER_ROUND,
  PERSONAL_GOAL_POINTS,
  PERSONAL_GOALS,
  ROUND4_GOAL_POINTS,
  ROUND_GOALS,
} from './cards'
import type { GameState, PlayerState, Round } from './types'

/** 라운드 시작: 그 라운드의 목표 더미에서 2장 공개 */
export function revealRoundGoals(state: GameState, round: Round): GameState {
  const deck = state.goalDecks[round - 1] ?? []
  const shown = deck.slice(0, GOALS_PER_ROUND)
  return {
    ...state,
    goalDecks: state.goalDecks.map((d, i) => (i === round - 1 ? d.slice(shown.length) : d)),
    roundGoals: [...state.roundGoals, ...shown.map((id) => ({ id, round, first: null, achieved: [] }))],
  }
}

/**
 * 이 플레이어의 이번 라운드(1~3) 목표 달성을 확인해 마커를 놓는다.
 * 판정은 그 플레이어의 행동 뒤에만 한다. v0.8에서 다섯 빛·시간의 지붕·숫자 계단이 2층 이상 기둥을 요구하게 바꿔
 * 라운드 시작 때 이미 달성되는 목표가 없다.
 * 가장 먼저 달성하면 선착, 그 뒤로는 달성. 한 번 얻은 점수는 확정 (§5).
 * @param roundDone 이 플레이어가 이번 라운드의 마지막 턴을 마쳤는지 ('roundDone' 목표도 본다)
 */
export function checkRoundGoals(state: GameState, playerId: number, roundDone: boolean): GameState {
  if (state.phase.kind !== 'round' || state.phase.round === 4) return state
  const round = state.phase.round
  const player = state.players[playerId]
  if (!player) return state
  let changed = false
  const roundGoals = state.roundGoals.map((card) => {
    if (card.round !== round || card.first === playerId || card.achieved.includes(playerId)) return card
    const def = ROUND_GOALS[card.id]
    if (def.when === 'roundDone' && !roundDone) return card
    if (!def.check(player.board, state.law)) return card
    changed = true
    return card.first === null ? { ...card, first: playerId } : { ...card, achieved: [...card.achieved, playerId] }
  })
  return changed ? { ...state, roundGoals } : state
}

/**
 * §5 4라운드 목표: 4라운드 끝(끝 사건 뒤)에 한 번 판정해 달성한 사람 모두 달성 칸에 (선착 없음)
 */
export function judgeRound4Goals(state: GameState): GameState {
  const roundGoals = state.roundGoals.map((card) => {
    if (card.round !== 4) return card
    const def = ROUND_GOALS[card.id]
    const achieved = state.players.filter((p) => def.check(p.board, state.law)).map((p) => p.id)
    return { ...card, first: null, achieved }
  })
  return { ...state, roundGoals }
}

/** 라운드 목표 카드에 놓인 내 마커 점수 (4라운드 목표는 달성 3점) */
export function goalPoints(state: GameState, playerId: number): number {
  return state.roundGoals.reduce(
    (sum, card) =>
      sum +
      (card.first === playerId ? GOAL_FIRST_POINTS : 0) +
      (card.achieved.includes(playerId) ? (card.round === 4 ? ROUND4_GOAL_POINTS : GOAL_ACHIEVED_POINTS) : 0),
    0,
  )
}

/** 개인 목표 점수 (게임 끝 최종 상태로 판정, §10) */
export function personalGoalPoints(player: PlayerState): number {
  return player.personalGoal && PERSONAL_GOALS[player.personalGoal].check(player) ? PERSONAL_GOAL_POINTS : 0
}
