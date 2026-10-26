/**
 * 4라운드 — 시간의 세계 (§9, v0.8)
 *
 * 준비: 각자 윗면이 ⧗인 꼭대기 주사위(⧗ 주사위)를 정하고 사건 카드 2장을 공개한다.
 * 진행: 선부터 시계 방향으로, 자기 차례에 ⧗ 주사위 1개를 옆 칸으로 1칸 넘긴다(필수).
 * 넘길 수 없는 주사위를 고르면 잔해가 된다. 자유 넘기기(영원의 우주·역행)로는 ⧗이 아닌 꼭대기를 넘기거나 포기한다.
 * 모두 다 넘기면 끝 사건 → 4라운드 목표 → 4차원 점수 순서로 정산하고 게임이 끝난다 (§9 4라운드 끝, §10).
 */
import type { LawId } from './cards'
import { isTime, tip, TIP_DIRECTIONS, type Orientation, type TipDirection } from './dice'
import { fail } from './errors'
import { EVENTS, EVENTS_PER_GAME, eventFreeTips, resolveEndEvent, tipRules, type TipRules } from './events'
import { judgeRound4Goals } from './goals'
import { canStackOn, inBoard, topOf, type Cell } from './placement'
import { scoreTops } from './scoring'
import type { Board, DieId, EventId, GameState, PlayerState, RolledDie, TimeState } from './types'

/**
 * roll = 넘기기. dieId가 아직 넘기지 않은 ⧗ 주사위면 ⧗ 넘기기, 윗면이 ⧗이 아닌 꼭대기면 자유 넘기기.
 * pass = 남은 자유 넘기기를 모두 포기 (⧗ 주사위를 다 넘긴 뒤에만)
 */
export type TimeAction =
  | { type: 'roll'; player: number; dieId: DieId; direction: TipDirection }
  | { type: 'scrap'; player: number; dieId: DieId }
  | { type: 'pass'; player: number }

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

const NO_RULES: TipRules = { noVacuum: false, sidewaysOnly: false, noUphill: false }

/**
 * §9 넘기기: 이 꼭대기 주사위를 넘길 수 있는 방향과 결과.
 * 옆 칸이 진공이면 그 칸의 1층, 기둥이면 쌓기 규칙에 맞을 때만 그 꼭대기. 보드 밖은 안 됨.
 * 시작 사건(§11-4)이 있으면 그 규칙도 따른다.
 */
export function rollTargets(
  board: Board,
  from: Cell,
  law: LawId = 'standard',
  events: readonly EventId[] = [],
): RollTarget[] {
  const fromPillar = board.cells[from.row]?.[from.col] ?? []
  const die = topOf(fromPillar)
  if (!die) return []
  const rules = events.length > 0 ? tipRules(events) : NO_RULES
  return TIP_DIRECTIONS.flatMap((direction) => {
    if (rules.sidewaysOnly && direction !== 'left' && direction !== 'right') return []
    const to = stepCell(from, direction)
    if (!inBoard(to)) return []
    const orientation = tip(die.layout, die.orientation, direction)
    const toPillar = board.cells[to.row]?.[to.col] ?? []
    const below = topOf(toPillar)
    if (!below && rules.noVacuum) return []
    if (below && rules.noUphill && toPillar.length > fromPillar.length) return []
    // 해석: §9가 '3라운드 쌓기 규칙'을 따르라고 하므로 평평한·뒤집힌 우주도 4라운드에 적용한다
    if (below && !canStackOn(below.orientation.top, orientation.top, law)) return []
    return [{ direction, to, orientation }]
  })
}

function timeOf(state: GameState): TimeState {
  if (!state.time) throw new Error('4라운드 상태가 없습니다.')
  return state.time
}

/** 넘길 것(⧗ 주사위 또는 자유 넘기기)이 남았는지 */
function hasMoves(time: TimeState, p: number): boolean {
  return (time.pending[p]?.length ?? 0) > 0 || (time.free[p] ?? 0) > 0
}

/** 선부터 시계 방향으로, from 다음(포함 여부 선택) 넘길 것이 남은 사람. 없으면 null */
function nextRoller(time: TimeState, from: number, include: boolean): number | null {
  const n = time.pending.length
  for (let k = include ? 0 : 1; k <= n; k++) {
    const p = (from + k) % n
    if (hasMoves(time, p)) return p
  }
  return null
}

/** §9 4라운드 끝: 끝 사건(공개 순서) → 4라운드 목표 → 4차원 점수 확정 → 게임 끝 */
export function finishRound4(state: GameState): GameState {
  const events = state.time?.events ?? []
  const afterEvents = events.filter((e) => EVENTS[e].when === 'end').reduce(resolveEndEvent, state)
  const judged = judgeRound4Goals(afterEvents)
  const players = judged.players.map((p) => ({ ...p, timeScore: scoreTops(p.board, judged.law).total }))
  return { ...judged, players, phase: { kind: 'ended' } }
}

function proceed(state: GameState, from: number, include: boolean): GameState {
  const time = timeOf(state)
  const next = nextRoller(time, from, include)
  if (next === null) return finishRound4(state)
  return { ...state, currentPlayer: next }
}

/** 4라운드 준비 (§9 준비): ⧗ 주사위를 정하고 사건 카드 2장을 공개한 뒤 선부터 시작. 넘길 것이 없으면 바로 정산 */
export function startRound4(state: GameState): GameState {
  const events = state.eventDeck.slice(0, EVENTS_PER_GAME)
  const free = (state.law === 'eternal' ? 1 : 0) + eventFreeTips(events)
  const time: TimeState = {
    pending: state.players.map((p) => timeTops(p.board).map((t) => t.die.id)),
    free: state.players.map(() => free),
    events,
  }
  const players = state.players.map((p, i) => ({ ...p, timeDice: time.pending[i]?.length ?? 0 }))
  return proceed({ ...state, players, time, eventDeck: state.eventDeck.slice(events.length) }, state.leadPlayer, true)
}

/** 자유 넘기기로 넘길 수 있는 꼭대기: 윗면이 ⧗이 아니고 넘길 곳이 있는 것 (§9 자유 넘기기) */
function freeTops(board: Board, law: LawId, events: readonly EventId[]): { die: RolledDie; cell: Cell }[] {
  const out: { die: RolledDie; cell: Cell }[] = []
  board.cells.forEach((row, r) =>
    row.forEach((pillar, c) => {
      const top = topOf(pillar)
      const cell = { row: r, col: c }
      if (top && !isTime(top.orientation.top) && rollTargets(board, cell, law, events).length > 0) out.push({ die: top, cell })
    }),
  )
  return out
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
  const free = time.free[action.player] ?? 0

  if (action.type === 'pass') {
    // §9 자유 넘기기는 쓰지 않아도 된다. ⧗ 주사위를 다 넘긴 뒤에만 남은 것을 모두 포기
    if (pending.length > 0) fail('⧗ 주사위는 반드시 넘겨야 합니다.')
    if (free === 0) fail('포기할 자유 넘기기가 없습니다.')
    const next: TimeState = { ...time, free: setAt(time.free, action.player, 0) }
    return proceed({ ...state, time: next }, action.player, false)
  }

  const isPending = pending.includes(action.dieId)
  const from = findTop(player.board, action.dieId)
  if (!from) fail('꼭대기 주사위가 아닙니다.')
  const die = topOf(player.board.cells[from.row]?.[from.col] ?? []) as RolledDie
  if (!isPending) {
    // 자유 넘기기: 윗면이 ⧗이 아닌 꼭대기만, 잔해로는 만들 수 없음
    if (action.type === 'scrap') fail('넘길 ⧗ 주사위가 아닙니다.')
    if (free === 0 || isTime(die.orientation.top)) fail('넘길 ⧗ 주사위가 아닙니다.')
  }
  const targets = rollTargets(player.board, from, state.law, time.events)

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
      updated = { ...player, board, debris: [...player.debris, { id: die.id, colors: die.colors, layout: die.layout }] }
      break
    }
  }

  const next: TimeState = isPending
    ? { ...time, pending: setAt(time.pending, action.player, pending.filter((id) => id !== action.dieId)) }
    : { ...time, free: setAt(time.free, action.player, free - 1) }
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
  const pending = time.pending[playerId] ?? []
  const timeMoves = pending.flatMap((dieId): TimeAction[] => {
    const from = findTop(player.board, dieId)
    if (!from) return []
    const targets = rollTargets(player.board, from, state.law, time.events)
    if (targets.length === 0) return [{ type: 'scrap', player: playerId, dieId }]
    return targets.map((t) => ({ type: 'roll', player: playerId, dieId, direction: t.direction }))
  })
  if ((time.free[playerId] ?? 0) === 0) return timeMoves
  const freeMoves = freeTops(player.board, state.law, time.events).flatMap(({ die, cell }): TimeAction[] =>
    rollTargets(player.board, cell, state.law, time.events).map((t) => ({
      type: 'roll',
      player: playerId,
      dieId: die.id,
      direction: t.direction,
    })),
  )
  const pass: TimeAction[] = pending.length === 0 ? [{ type: 'pass', player: playerId }] : []
  return [...timeMoves, ...freeMoves, ...pass]
}

/** 이 주사위가 자유 넘기기 대상인지 (UI용): 현재 플레이어에게 자유 넘기기가 남았고 윗면이 ⧗이 아닌 꼭대기 */
export function isFreeTipDie(state: GameState, dieId: DieId): boolean {
  const time = state.time
  const player = state.players[state.currentPlayer]
  if (!time || !player || (time.free[state.currentPlayer] ?? 0) === 0) return false
  return freeTops(player.board, state.law, time.events).some((t) => t.die.id === dieId)
}
