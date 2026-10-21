/**
 * 1~3라운드 턴 진행 (§5 공통 턴 규칙, 바퀴 끝, §6~§8)
 *
 * 한 턴: 시장 칸 하나를 통째로 가져옴(takeSlot) → 가져온 주사위를 하나씩 놓거나(place) 잔해로(discard).
 * 손에 든 주사위가 없어지면 턴이 끝나고, 모두 한 턴씩 하면 바퀴가 끝난다.
 */
import { withFront, type Face } from './dice'
import { isLegalCell, legalCells, pillarAt, type Cell } from './placement'
import { scorePlane } from './scoring'
import { dicePerSlot, fillMarket, marketSlotCount } from './setup'
import type { GameState, PlayerState, RolledDie, Round } from './types'

/** 라운드별 1인 턴 수 = 바퀴 수 (§1) */
export const TURNS_PER_ROUND: Record<1 | 2 | 3, number> = { 1: 5, 2: 3, 3: 2 }

export type Action =
  | { type: 'takeSlot'; player: number; slot: number }
  | { type: 'place'; player: number; dieId: number; row: number; col: number; front?: Face }
  | { type: 'discard'; player: number; dieId: number }

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IllegalActionError'
  }
}

function fail(message: string): never {
  throw new IllegalActionError(message)
}

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

/** 손이 비면 턴 끝 → 바퀴 끝 → 라운드 끝 순서로 진행 */
function advance(state: GameState): GameState {
  if (state.turn.hand.length > 0 || !state.turn.taken) return state
  const n = state.config.playerCount
  const picks = state.turn.picks + 1

  if (picks < n) {
    return {
      ...state,
      currentPlayer: (state.leadPlayer + picks) % n,
      turn: { ...state.turn, picks, taken: false },
    }
  }

  // 바퀴 끝: 선을 왼쪽으로 넘기고 시장을 새로 채운다
  const round = draftRound(state) as 1 | 2 | 3
  const leadPlayer = (state.leadPlayer + 1) % n
  const circuit = state.turn.circuit + 1
  const base: GameState = {
    ...state,
    leadPlayer,
    currentPlayer: leadPlayer,
    turn: { circuit, picks: 0, hand: [], taken: false },
  }
  if (circuit < TURNS_PER_ROUND[round]) return refillMarket(base, round)
  return endRound(base, round)
}

function refillMarket(state: GameState, round: 1 | 2 | 3): GameState {
  const [market, bag, rng] = fillMarket(
    state.rng,
    state.bag,
    marketSlotCount(state.config.playerCount),
    dicePerSlot(round),
  )
  return { ...state, market, bag, rng }
}

function endRound(state: GameState, round: 1 | 2 | 3): GameState {
  let players = state.players
  // §7 2라운드 점수는 라운드가 끝날 때 확정
  if (round === 2) {
    players = players.map((p) => ({ ...p, planeScore: scorePlane(p.board).total }))
  }
  const next = (round + 1) as Round
  const base: GameState = {
    ...state,
    players,
    phase: { kind: 'round', round: next },
    turn: { circuit: 0, picks: 0, hand: [], taken: false },
  }
  if (next === 4) return { ...base, market: [] }
  return refillMarket(base, next)
}

export function applyAction(state: GameState, action: Action): GameState {
  const round = draftRound(state)
  if (round === null) fail('1~3라운드에만 할 수 있는 행동입니다.')
  if (action.player !== state.currentPlayer) fail(`지금은 ${state.currentPlayer}번 플레이어의 차례입니다.`)

  switch (action.type) {
    case 'takeSlot': {
      if (state.turn.taken) fail('이번 턴에 이미 칸을 가져왔습니다.')
      const slot = state.market[action.slot]
      if (slot === undefined) fail(`없는 시장 칸입니다 (${action.slot})`)
      if (slot === null) fail('이미 가져간 칸입니다.')
      const market = state.market.map((s, i) => (i === action.slot ? null : s))
      return advance({ ...state, market, turn: { ...state.turn, hand: slot, taken: true } })
    }

    case 'place': {
      if (!state.turn.taken) fail('먼저 시장 칸을 가져와야 합니다.')
      const [die, hand] = takeFromHand(state, action.dieId)
      let placed = die
      if (action.front !== undefined) {
        try {
          placed = { ...die, orientation: withFront(die.orientation, action.front) }
        } catch {
          fail('윗면은 바꿀 수 없고, 앞면은 옆면 중에서만 고를 수 있습니다.')
        }
      }
      const player = state.players[action.player] as PlayerState
      const cell = { row: action.row, col: action.col }
      if (!isLegalCell(player.board, round, placed, cell)) {
        fail(`(${cell.row}, ${cell.col})에는 놓을 수 없습니다.`)
      }
      const players = updatePlayer(state.players, action.player, (p) => placeOnBoard(p, placed, cell))
      return advance({ ...state, players, turn: { ...state.turn, hand } })
    }

    case 'discard': {
      if (!state.turn.taken) fail('먼저 시장 칸을 가져와야 합니다.')
      if (round === 1) fail('1라운드에는 잔해로 버릴 수 없습니다.')
      const [die, hand] = takeFromHand(state, action.dieId)
      const players = updatePlayer(state.players, action.player, (p) => ({
        ...p,
        debris: [...p.debris, { id: die.id, color: die.color }],
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
  return legalCells(player.board, round, die)
}

/** 현재 플레이어가 할 수 있는 행동 목록. 놓기는 앞면을 바꾸지 않은 형태로만 나열한다. */
export function getLegalActions(state: GameState): Action[] {
  const round = draftRound(state)
  if (round === null) return []
  const player = state.currentPlayer
  if (!state.turn.taken) {
    return state.market.flatMap((slot, i) => (slot === null ? [] : [{ type: 'takeSlot', player, slot: i } as const]))
  }
  return state.turn.hand.flatMap((die) => [
    ...legalPlacements(state, die.id).map(
      (c) => ({ type: 'place', player, dieId: die.id, row: c.row, col: c.col }) as const,
    ),
    ...(round === 1 ? [] : [{ type: 'discard', player, dieId: die.id } as const]),
  ])
}

/** 보드 위 한 칸의 주사위 수 (테스트·UI 편의) */
export function heightAt(state: GameState, player: number, cell: Cell): number {
  return pillarAt((state.players[player] as PlayerState).board, cell).length
}
