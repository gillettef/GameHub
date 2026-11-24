/**
 * 사건 카드 (§11-4, v0.8). 4라운드 준비 때 2장 공개한다.
 *
 * 시작 사건은 4라운드 내내 넘기기 규칙을 바꾸고(TipRules), 끝 사건은 4라운드가 끝날 때
 * 공개한 순서대로 발동한다(resolveEndEvent). 모든 사건은 고를 것 없이 정해진 대로 처리한다.
 */
import { dieColor } from './dice'
import { goalPoints } from './goals'
import { pillarAt, topOf, type Cell } from './placement'
import { drawOne } from './rng'
import { BOARD_COLS, BOARD_ROWS } from './setup'
import type { Board, EventId, GameState, PlayerState } from './types'

export interface EventDef {
  id: EventId
  name: string
  /** start = 공개한 때부터 4라운드 내내, end = 4라운드 끝에 발동 */
  when: 'start' | 'end'
  text: string
}

export const EVENTS: Record<EventId, EventDef> = {
  regression: { id: 'regression', name: '역행', when: 'start', text: '각자 자유 넘기기 1회를 받음' },
  timeRift: { id: 'timeRift', name: '시간 균열', when: 'start', text: '진공으로는 넘길 수 없음 (옆 기둥 위로만)' },
  rotation: { id: 'rotation', name: '자전', when: 'start', text: '왼쪽·오른쪽으로만 넘길 수 있음' },
  earthquake: {
    id: 'earthquake',
    name: '지진',
    when: 'start',
    text: '넘기는 주사위가 있던 기둥(그 주사위 포함)보다 높은 옆 기둥 위로는 넘길 수 없음',
  },
  erosion: { id: 'erosion', name: '침식', when: 'end', text: '각자 가장 높은 기둥이 하나뿐이면 그 꼭대기 주사위를 잔해로' },
  gravityWave: { id: 'gravityWave', name: '중력파', when: 'end', text: '각자 4층 이상인 기둥마다 꼭대기 주사위 1개를 잔해로' },
  crownCurse: {
    id: 'crownCurse',
    name: '왕관의 저주',
    when: 'end',
    text: '목표 점수가 1점 이상이고 가장 높은 사람(동점이면 모두)은 주머니에서 1개를 잔해로',
  },
  bigBang: { id: 'bigBang', name: '빅뱅', when: 'end', text: '목표 점수가 가장 낮은 사람(동점이면 모두)은 잔해 1개를 주머니로 돌려보냄' },
  proliferation: { id: 'proliferation', name: '대번식', when: 'end', text: '꼭대기 초록이 3개 이상인 사람은 잔해 1개를 주머니로 돌려보냄' },
  flood: { id: 'flood', name: '대홍수', when: 'end', text: '진공(1행 포함)이 5칸 이상인 사람은 주머니에서 1개를 잔해로' },
}

export const EVENT_DECK: readonly EventId[] = Object.keys(EVENTS) as EventId[]

/** 4라운드 준비 때 공개하는 사건 카드 수 (§9) */
export const EVENTS_PER_GAME = 2

/** 시작 사건이 바꾸는 넘기기 규칙 (§11-4) */
export interface TipRules {
  /** 시간 균열: 진공으로 넘길 수 없음 */
  noVacuum: boolean
  /** 자전: 왼쪽·오른쪽으로만 */
  sidewaysOnly: boolean
  /** 지진: 원래 기둥보다 높은 옆 기둥 위로 넘길 수 없음 */
  noUphill: boolean
}

export function tipRules(events: readonly EventId[]): TipRules {
  return {
    noVacuum: events.includes('timeRift'),
    sidewaysOnly: events.includes('rotation'),
    noUphill: events.includes('earthquake'),
  }
}

/** 역행으로 받는 자유 넘기기 수 */
export function eventFreeTips(events: readonly EventId[]): number {
  return events.filter((e) => e === 'regression').length
}

function allCells(): Cell[] {
  const out: Cell[] = []
  for (let row = 0; row < BOARD_ROWS; row++) for (let col = 0; col < BOARD_COLS; col++) out.push({ row, col })
  return out
}

/** 진공(주사위가 없는 칸, 1행 포함) 수 */
export function vacuumCount(board: Board): number {
  return allCells().filter((c) => pillarAt(board, c).length === 0).length
}

/** 꼭대기 주사위를 잔해로 */
function scrapTop(player: PlayerState, cell: Cell): PlayerState {
  const top = topOf(pillarAt(player.board, cell))
  if (!top) return player
  const cells = player.board.cells.map((row, r) =>
    row.map((p, c) => (r === cell.row && c === cell.col ? p.slice(0, -1) : p)),
  )
  return {
    ...player,
    board: { cells },
    debris: [...player.debris, { id: top.id, colors: top.colors, layout: top.layout }],
  }
}

/** 주머니에서 1개를 이 플레이어의 잔해로 (주머니가 비면 그대로) */
function debrisFromBag(state: GameState, playerId: number): GameState {
  if (state.bag.length === 0) return state
  const [die, bag, rng] = drawOne(state.rng, state.bag)
  const players = state.players.map((p) => (p.id === playerId ? { ...p, debris: [...p.debris, die] } : p))
  return { ...state, bag, rng, players }
}

/** 이 플레이어의 잔해 1개(마지막 것)를 주머니로 (잔해가 없으면 그대로) */
function debrisToBag(state: GameState, playerId: number): GameState {
  const player = state.players[playerId]
  const die = player?.debris[player.debris.length - 1]
  if (!player || !die) return state
  const players = state.players.map((p) => (p.id === playerId ? { ...p, debris: p.debris.slice(0, -1) } : p))
  return { ...state, bag: [...state.bag, die], players }
}

function mapPlayers(state: GameState, fn: (p: PlayerState) => PlayerState): GameState {
  return { ...state, players: state.players.map(fn) }
}

/** 여러 사람에게 차례로 적용한다. 주머니가 모자랄 때를 위해 선부터 시계 방향 순서로 (§11-4) */
function forEachPlayer(state: GameState, ids: readonly number[], fn: (s: GameState, id: number) => GameState): GameState {
  const n = state.players.length
  const order = [...ids].sort((a, b) => ((a - state.leadPlayer + n) % n) - ((b - state.leadPlayer + n) % n))
  return order.reduce(fn, state)
}

/** 끝 사건 하나를 발동한다 (§11-4). 시작 사건이면 그대로 */
export function resolveEndEvent(state: GameState, id: EventId): GameState {
  switch (id) {
    case 'erosion':
      return mapPlayers(state, (p) => {
        const heights = allCells().map((c) => ({ c, h: pillarAt(p.board, c).length }))
        const max = Math.max(...heights.map((x) => x.h))
        const tallest = heights.filter((x) => x.h === max)
        return max > 0 && tallest.length === 1 ? scrapTop(p, (tallest[0] as { c: Cell }).c) : p
      })
    case 'gravityWave':
      return mapPlayers(state, (p) =>
        allCells()
          .filter((c) => pillarAt(p.board, c).length >= 4)
          .reduce(scrapTop, p),
      )
    case 'crownCurse': {
      const points = state.players.map((p) => goalPoints(state, p.id))
      const max = Math.max(...points)
      if (max < 1) return state
      return forEachPlayer(state, state.players.filter((_, i) => points[i] === max).map((p) => p.id), debrisFromBag)
    }
    case 'bigBang': {
      const points = state.players.map((p) => goalPoints(state, p.id))
      const min = Math.min(...points)
      return forEachPlayer(state, state.players.filter((_, i) => points[i] === min).map((p) => p.id), debrisToBag)
    }
    case 'proliferation': {
      const ids = state.players
        .filter((p) => allCells().filter((c) => {
          const top = topOf(pillarAt(p.board, c))
          return top !== undefined && dieColor(top) === 'green'
        }).length >= 3)
        .map((p) => p.id)
      return forEachPlayer(state, ids, debrisToBag)
    }
    case 'flood':
      return forEachPlayer(state, state.players.filter((p) => vacuumCount(p.board) >= 5).map((p) => p.id), debrisFromBag)
    case 'regression':
    case 'timeRift':
    case 'rotation':
    case 'earthquake':
      return state
  }
}
