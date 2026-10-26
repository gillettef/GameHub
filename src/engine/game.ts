/**
 * 게임 준비(개인 목표 고르기)와 1~3라운드 턴 진행 (§5, §6~§8)
 *
 * 한 턴: 시장 칸 하나를 통째로 가져옴(takeSlot) → 가져온 주사위를 하나씩 놓거나(place) 잔해로(discard).
 * 놓기 전에 턴마다 1번, 주머니의 주사위 1개를 잔해로 내고 손의 주사위 1개를 다시 굴릴 수 있다(rerollHand).
 * 손에 든 주사위가 없어지면 턴이 끝나고, 모두 한 턴씩 하면 바퀴가 끝난다.
 * 라운드 목표는 행동마다 확인하고, 라운드가 바뀔 때 새 목표를 공개한다.
 */
import type { PersonalGoalId } from './cards'
import { withFront, type Face } from './dice'
import { fail } from './errors'
import { checkRoundGoals, revealRoundGoals } from './goals'
import { isLegalCell, legalCells, pillarAt, type Cell } from './placement'
import { scoreLine, scorePlane, scoreTower } from './scoring'
import { drawOne } from './rng'
import { dicePerSlot, fillMarket, marketSlotCount, roll } from './setup'
import { applyTimeAction, legalTimeActions, startRound4, type TimeAction } from './time'
import type { Die, GameState, PlayerState, RolledDie, Round } from './types'

/** 라운드별 1인 턴 수 = 바퀴 수 (§1) */
export const TURNS_PER_ROUND: Record<1 | 2 | 3, number> = { 1: 5, 2: 3, 3: 2 }

export { IllegalActionError } from './errors'

export type SetupAction = { type: 'choosePersonalGoal'; player: number; goal: PersonalGoalId }

export type DraftAction =
  | { type: 'reroll'; player: number; slot: number; dieId: number }
  | { type: 'takeSlot'; player: number; slot: number }
  | { type: 'rerollHand'; player: number; dieId: number }
  | { type: 'place'; player: number; dieId: number; row: number; col: number; front?: Face }
  | { type: 'discard'; player: number; dieId: number }

export type Action = SetupAction | DraftAction | TimeAction

export function currentRound(state: GameState): Round | null {
  return state.phase.kind === 'round' ? state.phase.round : null
}

/** 1~3라운드 중이면 라운드 번호, 아니면 null */
function draftRound(state: GameState): 1 | 2 | 3 | null {
  const round = currentRound(state)
  return round === 1 || round === 2 || round === 3 ? round : null
}

function updatePlayer(
  players: readonly PlayerState[],
  id: number,
  fn: (p: PlayerState) => PlayerState,
): PlayerState[] {
  return players.map((p) => (p.id === id ? fn(p) : p))
}

function placeOnBoard(player: PlayerState, die: RolledDie, cell: Cell): PlayerState {
  const cells = player.board.cells.map((row, r) =>
    row.map((pillar, c) => (r === cell.row && c === cell.col ? [...pillar, die] : pillar)),
  )
  return { ...player, board: { cells } }
}

function takeFromHand(state: GameState, dieId: number): [RolledDie, RolledDie[]] {
  const die = state.turn.hand.find((d) => d.id === dieId)
  if (!die) fail(`손에 없는 주사위입니다 (${dieId})`)
  return [die, state.turn.hand.filter((d) => d.id !== dieId)]
}

const unrolled = (d: RolledDie): Die => ({ id: d.id, colors: d.colors, layout: d.layout })

const freshTurn = (circuit: number) => ({ circuit, picks: 0, hand: [], taken: false, rerolled: false, handRerolled: false })

/** 손이 비면 턴 끝 → 바퀴 끝 → 라운드 끝 순서로 진행 */
function advance(state: GameState): GameState {
  if (state.turn.hand.length > 0 || !state.turn.taken) return state
  const round = draftRound(state) as 1 | 2 | 3
  const n = state.config.playerCount

  // 이 플레이어의 이번 라운드 마지막 턴이면 '라운드를 마친 뒤' 판정하는 목표도 확인
  const lastTurn = state.turn.circuit === TURNS_PER_ROUND[round] - 1
  const checked = lastTurn ? checkRoundGoals(state, state.currentPlayer, true) : state

  const picks = state.turn.picks + 1
  if (picks < n) {
    return {
      ...checked,
      currentPlayer: (state.leadPlayer + picks) % n,
      turn: { ...state.turn, picks, taken: false, rerolled: false, handRerolled: false },
    }
  }

  // 바퀴 끝: 선을 왼쪽으로 넘기고 시장을 새로 채운다
  // 풍요의 우주: 남은 칸의 주사위는 주머니로 돌아간다 (§11-1)
  const leftovers = checked.market.flatMap((slot) => slot ?? []).map(unrolled)
  const leadPlayer = (state.leadPlayer + 1) % n
  const circuit = state.turn.circuit + 1
  const base: GameState = {
    ...checked,
    bag: [...checked.bag, ...leftovers],
    market: checked.market.map(() => null),
    leadPlayer,
    currentPlayer: leadPlayer,
    turn: freshTurn(circuit),
  }
  if (circuit < TURNS_PER_ROUND[round]) return refillMarket(base, round)
  return endRound(base, round)
}

function refillMarket(state: GameState, round: 1 | 2 | 3): GameState {
  const [market, bag, rng] = fillMarket(
    state.rng,
    state.bag,
    marketSlotCount(state.config.playerCount, state.law),
    dicePerSlot(round),
  )
  return { ...state, market, bag, rng }
}

function endRound(state: GameState, round: 1 | 2 | 3): GameState {
  // §6~§8 기본 점수는 그 라운드가 끝날 때 확정 (v0.7)
  const players = state.players.map((p) => {
    if (round === 1) return { ...p, lineScore: scoreLine(p.board, state.law).total }
    if (round === 2) return { ...p, planeScore: scorePlane(p.board, state.law).total }
    return { ...p, towerScore: scoreTower(p.board, state.law).total }
  })
  const next = (round + 1) as Round
  const base = revealRoundGoals(
    {
      ...state,
      players,
      phase: { kind: 'round', round: next },
      turn: freshTurn(0),
    },
    next,
  )
  if (next === 4) return startRound4({ ...base, market: [] })
  return refillMarket(base, next)
}

function applySetupAction(state: GameState, action: SetupAction): GameState {
  const player = state.players[action.player]
  if (!player) fail(`없는 플레이어입니다 (${action.player})`)
  if (player.personalGoal !== null) fail('이미 개인 목표를 골랐습니다.')
  if (!player.personalOffer.includes(action.goal)) fail('받은 개인 목표 카드 중에서 골라야 합니다.')
  const players = updatePlayer(state.players, action.player, (p) => ({ ...p, personalGoal: action.goal }))
  const ready = players.every((p) => p.personalGoal !== null)
  return { ...state, players, phase: ready ? { kind: 'round', round: 1 } : state.phase }
}

export function applyAction(state: GameState, action: Action): GameState {
  if (state.phase.kind === 'ended') fail('게임이 끝났습니다.')
  if (action.type === 'choosePersonalGoal') {
    if (state.phase.kind !== 'setup') fail('개인 목표는 게임 준비 때 고릅니다.')
    return applySetupAction(state, action)
  }
  if (state.phase.kind === 'setup') fail('먼저 모두 개인 목표를 골라야 합니다.')
  if (action.type === 'roll' || action.type === 'scrap') {
    if (currentRound(state) !== 4) fail('4라운드에만 할 수 있는 행동입니다.')
    return applyTimeAction(state, action)
  }
  const round = draftRound(state)
  if (round === null) fail('1~3라운드에만 할 수 있는 행동입니다.')
  if (action.player !== state.currentPlayer) fail(`지금은 ${state.currentPlayer}번 플레이어의 차례입니다.`)

  switch (action.type) {
    case 'reroll': {
      // §11-1 흔들리는 시장: 가져오기 전 시장 주사위 1개를 다시 굴림 (턴마다 1회)
      if (state.law !== 'shakyMarket') fail('흔들리는 시장 우주에서만 다시 굴릴 수 있습니다.')
      if (state.turn.taken) fail('가져오기 전에만 다시 굴릴 수 있습니다.')
      if (state.turn.rerolled) fail('이번 턴에 이미 다시 굴렸습니다.')
      const slot = state.market[action.slot]
      const die = slot?.find((d) => d.id === action.dieId)
      if (!slot || !die) fail('시장에 없는 주사위입니다.')
      const [rolled, rng] = roll(state.rng, unrolled(die))
      const market = state.market.map((s, i) =>
        i === action.slot && s ? s.map((d) => (d.id === action.dieId ? rolled : d)) : s,
      )
      return { ...state, rng, market, turn: { ...state.turn, rerolled: true } }
    }

    case 'takeSlot': {
      if (state.turn.taken) fail('이번 턴에 이미 칸을 가져왔습니다.')
      const slot = state.market[action.slot]
      if (slot === undefined) fail(`없는 시장 칸입니다 (${action.slot})`)
      if (slot === null) fail('이미 가져간 칸입니다.')
      const market = state.market.map((s, i) => (i === action.slot ? null : s))
      return advance({ ...state, market, turn: { ...state.turn, hand: slot, taken: true } })
    }

    case 'rerollHand': {
      // §5 시장 다시 굴리기: 주머니에서 1개를 잔해로 내고, 손의 주사위 1개를 다시 굴림 (턴마다 1회)
      if (!state.turn.taken) fail('먼저 시장 칸을 가져와야 합니다.')
      if (state.turn.handRerolled) fail('이번 턴에 이미 다시 굴렸습니다.')
      if (state.bag.length === 0) fail('주머니가 비어 다시 굴릴 수 없습니다.')
      const [die] = takeFromHand(state, action.dieId)
      const [cost, bag, r1] = drawOne(state.rng, state.bag)
      const [rolled, rng] = roll(r1, unrolled(die))
      const players = updatePlayer(state.players, action.player, (p) => ({
        ...p,
        debris: [...p.debris, cost],
      }))
      const hand = state.turn.hand.map((d) => (d.id === action.dieId ? rolled : d))
      return { ...state, rng, bag, players, turn: { ...state.turn, hand, handRerolled: true } }
    }

    case 'place': {
      if (!state.turn.taken) fail('먼저 시장 칸을 가져와야 합니다.')
      const [die, hand] = takeFromHand(state, action.dieId)
      let placed = die
      if (action.front !== undefined) {
        try {
          placed = { ...die, orientation: withFront(die.layout, die.orientation, action.front) }
        } catch {
          fail('윗면은 바꿀 수 없고, 앞면은 옆면 중에서만 고를 수 있습니다.')
        }
      }
      const player = state.players[action.player] as PlayerState
      const cell = { row: action.row, col: action.col }
      if (!isLegalCell(player.board, round, placed, cell, state.law)) {
        fail(`(${cell.row}, ${cell.col})에는 놓을 수 없습니다.`)
      }
      const players = updatePlayer(state.players, action.player, (p) => placeOnBoard(p, placed, cell))
      const checked = checkRoundGoals({ ...state, players, turn: { ...state.turn, hand } }, action.player, false)
      return advance(checked)
    }

    case 'discard': {
      if (!state.turn.taken) fail('먼저 시장 칸을 가져와야 합니다.')
      if (round === 1) fail('1라운드에는 잔해로 버릴 수 없습니다.')
      const [die, hand] = takeFromHand(state, action.dieId)
      const players = updatePlayer(state.players, action.player, (p) => ({
        ...p,
        debris: [...p.debris, unrolled(die)],
      }))
      return advance({ ...state, players, turn: { ...state.turn, hand } })
    }
  }
}

/** 손에 든 주사위를 지금 놓을 수 있는 칸 (UI·봇용) */
export function legalPlacements(state: GameState, dieId: number): Cell[] {
  const round = draftRound(state)
  const die = state.turn.hand.find((d) => d.id === dieId)
  if (round === null || !die) return []
  const player = state.players[state.currentPlayer] as PlayerState
  return legalCells(player.board, round, die, state.law)
}

/**
 * 할 수 있는 행동 목록. 게임 준비 때는 아직 고르지 않은 모든 사람의 개인 목표 고르기,
 * 그 뒤로는 현재 플레이어의 행동. 놓기는 앞면을 바꾸지 않은 형태로만 나열한다.
 */
export function getLegalActions(state: GameState): Action[] {
  if (state.phase.kind === 'setup') {
    return state.players.flatMap((p) =>
      p.personalGoal !== null
        ? []
        : p.personalOffer.map((goal) => ({ type: 'choosePersonalGoal', player: p.id, goal }) as const),
    )
  }
  if (currentRound(state) === 4) return legalTimeActions(state)
  const round = draftRound(state)
  if (round === null) return []
  const player = state.currentPlayer
  if (!state.turn.taken) {
    const takes: Action[] = state.market.flatMap((slot, i) =>
      slot === null ? [] : [{ type: 'takeSlot', player, slot: i } as const],
    )
    if (state.law !== 'shakyMarket' || state.turn.rerolled) return takes
    const rerolls: Action[] = state.market.flatMap((slot, i) =>
      (slot ?? []).map((d) => ({ type: 'reroll', player, slot: i, dieId: d.id }) as const),
    )
    return [...takes, ...rerolls]
  }
  const rerolls: Action[] =
    state.turn.handRerolled || state.bag.length === 0
      ? []
      : state.turn.hand.map((die) => ({ type: 'rerollHand', player, dieId: die.id }) as const)
  const moves: Action[] = state.turn.hand.flatMap((die) => [
    ...legalPlacements(state, die.id).map(
      (c) => ({ type: 'place', player, dieId: die.id, row: c.row, col: c.col }) as const,
    ),
    ...(round === 1 ? [] : [{ type: 'discard', player, dieId: die.id } as const]),
  ])
  return [...moves, ...rerolls]
}

/** 보드 위 한 칸의 주사위 수 (테스트·UI 편의) */
export function heightAt(state: GameState, player: number, cell: Cell): number {
  return pillarAt((state.players[player] as PlayerState).board, cell).length
}
