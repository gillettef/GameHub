/**
 * 간단한 휴리스틱 봇 (로드맵 7단계).
 *
 * 순수 함수: 같은 상태면 같은 행동을 고른다 (난수 없음).
 * 할 수 있는 행동마다 한 수 앞을 적용해 보고, 그 결과를 평가 함수로 비교한다.
 * 시장 칸 고르기는 가져온 묶음을 욕심껏 다 놓아 본 결과로 평가한다.
 */
import {
  applyAction,
  countTimeTops,
  getLegalActions,
  scoreLine,
  scorePlane,
  scoreTower,
  goalPoints,
  PERSONAL_GOALS,
  type Action,
  type GameState,
  type PlayerState,
} from '../engine'

/** ⧗ 꼭대기 하나의 가치 (4라운드에 굴릴 수 있는 기회) */
const TIME_TOP_VALUE = 1.5
const PERSONAL_GOAL_WEIGHT = 0.5

/** 플레이어 입장의 상태 평가 (높을수록 좋음) */
export function evaluate(state: GameState, playerId: number): number {
  const player = state.players[playerId] as PlayerState
  const plane = player.planeScore ?? scorePlane(player.board, state.law).total
  let value =
    scoreLine(player.board, state.law).total +
    plane +
    scoreTower(player.board).total +
    goalPoints(state, playerId) -
    player.debris.length
  // 4라운드 전에는 ⧗ 꼭대기가 앞으로의 굴리기 기회다
  if (state.phase.kind !== 'ended' && state.time === null) value += TIME_TOP_VALUE * countTimeTops(player.board)
  if (player.personalGoal && PERSONAL_GOALS[player.personalGoal].check(player)) value += 6 * PERSONAL_GOAL_WEIGHT
  return value
}

/** 행동 하나를 적용한 뒤, 같은 플레이어의 턴이 이어지면 욕심껏 끝까지 둔 결과 */
function playout(state: GameState, playerId: number, depth: number): GameState {
  let s = state
  for (let i = 0; i < depth; i++) {
    if (s.phase.kind !== 'round' || s.currentPlayer !== playerId) break
    const actions = getLegalActions(s).filter((a) => a.type !== 'reroll')
    if (actions.length === 0) break
    let best = s
    let bestValue = -Infinity
    for (const a of actions) {
      const next = applyAction(s, a)
      const v = evaluate(next, playerId)
      if (v > bestValue) {
        bestValue = v
        best = next
      }
    }
    s = best
  }
  return s
}

/** 봇이 고를 행동. 할 행동이 없으면 null */
export function chooseBotAction(state: GameState, playerId: number): Action | null {
  const actions = getLegalActions(state).filter((a) => a.player === playerId)
  if (actions.length === 0) return null

  // 개인 목표는 지금 보드로 더 가까워 보이는 쪽보다, 단순히 덜 어려운 쪽을 고른다
  const choose = actions.filter((a) => a.type === 'choosePersonalGoal')
  if (choose.length > 0) return choose.find((a) => a.type === 'choosePersonalGoal' && EASY_GOALS.includes(a.goal)) ?? (choose[0] as Action)

  let best: Action = actions[0] as Action
  let bestValue = -Infinity
  for (const action of actions) {
    if (action.type === 'reroll') continue
    const next = applyAction(state, action)
    // 칸을 가져온 직후에는 손에 든 주사위를 다 놓아 본 결과로 평가
    const settled = action.type === 'takeSlot' ? playout(next, playerId, 6) : next
    const value = evaluate(settled, playerId)
    if (value > bestValue) {
      bestValue = value
      best = action
    }
  }
  return best
}

const EASY_GOALS: readonly string[] = ['cleanHands', 'symmetry', 'voidCollector', 'redWorship', 'timeLord']
