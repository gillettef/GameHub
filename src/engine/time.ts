/**
 * 4라운드 — 시간의 세계 (§9, v0.6)
 *
 * 준비: 각자 윗면이 ⧗인 꼭대기 주사위(⧗ 주사위)를 정한다.
 * 진행: 선부터 시계 방향으로, 자기 차례에 ⧗ 주사위 1개를 옆 칸으로 1칸 넘긴다(필수).
 * 넘길 수 없는 주사위를 고르면 잔해가 된다. 모두 다 넘기면 게임이 끝난다 (§10).
 */
import type { LawId } from './cards'
import { isTime, tip, TIP_DIRECTIONS, type Orientation, type TipDirection } from './dice'
import { fail } from './errors'
import { canStackOn, inBoard, topOf, type Cell } from './placement'
import type { Board, DieId, GameState, PlayerState, RolledDie, TimeState } from './types'

export type TimeAction =
  | { type: 'roll'; player: number; dieId: DieId; direction: TipDirection }
  | { type: 'scrap'; player: number; dieId: DieId }

/** 넘긴 방향의 옆 칸. forward = 앞(1행) 쪽 */
export function stepCell({ row, col }: Cell, direction: TipDirection): Cell {
  switch (direction) {
    case 'forward':
      return { row: row - 1, col }
    case 'back':
      return { row: row + 1, col }
    case 'left':
      return { row, col: col - 1 }
    case 'right':
      return { row, col: col + 1 }
  }
}

/** 윗면이 ⧗인 꼭대기 주사위와 그 칸 */
export function timeTops(board: Board): { die: RolledDie; cell: Cell }[] {
  const out: { die: RolledDie; cell: Cell }[] = []
  board.cells.forEach((row, r) =>
    row.forEach((pillar, c) => {
      const top = topOf(pillar)
      if (top && isTime(top.orientation.top)) out.push({ die: top, cell: { row: r, col: c } })
    }),
  )
  return out
}

/** §9 준비: 윗면이 ⧗인 꼭대기의 수 */
export function countTimeTops(board: Board): number {
  return timeTops(board).length
}

/** 꼭대기 주사위의 칸. 꼭대기가 아니면 null */
export function findTop(board: Board, dieId: DieId): Cell | null {
  for (let row = 0; row < board.cells.length; row++) {
    const cols = board.cells[row] ?? []
    for (let col = 0; col < cols.length; col++) {
      if (topOf(cols[col] ?? [])?.id === dieId) return { row, col }
    }
  }
  return null
}

export interface RollTarget {
  direction: TipDirection
  to: Cell
  orientation: Orientation
}

/**
 * §9 넘기기: 이 꼭대기 주사위를 넘길 수 있는 방향과 결과.
 * 옆 칸이 진공이면 그 칸의 1층, 기둥이면 쌓기 규칙에 맞을 때만 그 꼭대기. 보드 밖은 안 됨.
 */
export function rollTargets(board: Board, from: Cell, law: LawId = 'standard'): RollTarget[] {
  const die = topOf(board.cells[from.row]?.[from.col] ?? [])
  if (!die) return []
  return TIP_DIRECTIONS.flatMap((direction) => {
    const to = stepCell(from, direction)
    if (!inBoard(to)) return []
    const orientation = tip(die.layout, die.orientation, direction)
    const below = topOf(board.cells[to.row]?.[to.col] ?? [])
    // 해석: §9가 '3라운드 쌓기 규칙'을 따르라고 하므로 평평한·뒤집힌 우주도 4라운드에 적용한다
    if (below && !canStackOn(below.orientation.top, orientation.top, law)) return []
    return [{ direction, to, orientation }]
  })
}

function timeOf(state: GameState): TimeState {
  if (!state.time) throw new Error('4라운드 상태가 없습니다.')
  return state.time
}

/** 선부터 시계 방향으로, from 다음(포함 여부 선택) 넘길 주사위가 남은 사람. 없으면 null */
function nextRoller(time: TimeState, from: number, include: boolean): number | null {
  const n = time.pending.length
  for (let k = include ? 0 : 1; k <= n; k++) {
    const p = (from + k) % n
    if ((time.pending[p]?.length ?? 0) > 0) return p
  }
  return null
}

function proceed(state: GameState, from: number, include: boolean): GameState {
  const time = timeOf(state)
  const next = nextRoller(time, from, include)
  if (next === null) return { ...state, phase: { kind: 'ended' } }
  return { ...state, currentPlayer: next }
}

/** 4라운드 준비 (§9 준비): ⧗ 주사위를 정하고 선부터 시작. 아무도 없으면 바로 게임 끝 */
export function startRound4(state: GameState): GameState {
  const time: TimeState = { pending: state.players.map((p) => timeTops(p.board).map((t) => t.die.id)) }
  const players = state.players.map((p, i) => ({ ...p, timeDice: time.pending[i]?.length ?? 0 }))
  return proceed({ ...state, players, time }, state.leadPlayer, true)
}

function setAt<T>(items: readonly T[], i: number, value: T): T[] {
  return items.map((x, j) => (j === i ? value : x))
}

function mapCell(board: Board, cell: Cell, fn: (pillar: RolledDie[]) => RolledDie[]): Board {
  return {
    cells: board.cells.map((row, r) => row.map((p, c) => (r === cell.row && c === cell.col ? fn(p) : p))),
  }
}

export function applyTimeAction(state: GameState, action: TimeAction): GameState {
  const time = timeOf(state)
  if (action.player !== state.currentPlayer) fail(`지금은 ${state.currentPlayer}번 플레이어의 차례입니다.`)
  const player = state.players[action.player] as PlayerState
  const pending = time.pending[action.player] ?? []
  if (!pending.includes(action.dieId)) fail('넘길 ⧗ 주사위가 아닙니다.')
  const from = findTop(player.board, action.dieId)
  if (!from) throw new Error(`⧗ 주사위가 꼭대기에 없습니다 (${action.dieId})`)
  const die = topOf(player.board.cells[from.row]?.[from.col] ?? []) as RolledDie
  const targets = rollTargets(player.board, from, state.law)

  let updated: PlayerState
  switch (action.type) {
    case 'roll': {
      const target = targets.find((t) => t.direction === action.direction)
      if (!target) fail('그 방향으로는 넘길 수 없습니다.')
      const lifted = mapCell(player.board, from, (p) => p.slice(0, -1))
      const board = mapCell(lifted, target.to, (p) => [...p, { ...die, orientation: target.orientation }])
      updated = { ...player, board }
      break
    }
    case 'scrap': {
      // §9 네 방향 모두 넘길 수 없는 ⧗ 주사위만 골라 잔해로 만들 수 있다
      if (targets.length > 0) fail('넘길 수 있는 주사위는 잔해로 만들 수 없습니다.')
      const board = mapCell(player.board, from, (p) => p.slice(0, -1))
      updated = { ...player, board, debris: [...player.debris, { id: die.id, color: die.color, layout: die.layout }] }
      break
    }
  }

  const next: TimeState = {
    pending: setAt(
      time.pending,
      action.player,
      pending.filter((id) => id !== action.dieId),
    ),
  }
  return proceed(
    { ...state, players: setAt(state.players, action.player, updated), time: next },
    action.player,
    false,
  )
}

/** 현재 플레이어가 지금 할 수 있는 4라운드 행동 */
export function legalTimeActions(state: GameState): TimeAction[] {
  const time = state.time
  if (state.phase.kind !== 'round' || state.phase.round !== 4 || !time) return []
  const playerId = state.currentPlayer
  const player = state.players[playerId]
  if (!player) return []
  return (time.pending[playerId] ?? []).flatMap((dieId): TimeAction[] => {
    const from = findTop(player.board, dieId)
    if (!from) return []
    const targets = rollTargets(player.board, from, state.law)
    if (targets.length === 0) return [{ type: 'scrap', player: playerId, dieId }]
    return targets.map((t) => ({ type: 'roll', player: playerId, dieId, direction: t.direction }))
  })
}
