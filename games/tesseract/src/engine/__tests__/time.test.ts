import { describe, expect, it } from 'vitest'
import { dieColor, sideFaces, STANDARD_LAYOUT, TIME, tip, TIP_DIRECTIONS, type DieLayout, type Face, type TipDirection } from '../dice'
import { applyAction, getLegalActions, IllegalActionError } from '../game'
import { lineDice, scoreLine } from '../scoring'
import { createGame } from '../setup'
import {
  countTimeTops,
  findTop,
  legalTimeActions,
  rollTargets,
  startRound4,
  stepCell,
  timeTops,
} from '../time'
import type { LawId } from '../cards'
import type { Board, Color, EventId, GameState, RolledDie } from '../types'
import { board, colorsWith, die, line } from './helpers'

const S = STANDARD_LAYOUT

/**
 * 기준 배치의 ⧗ 주사위 (윗면 ⧗, 앞면 2).
 * 이 방향의 면: 아래 1, 뒤 5, 오른 3, 왼 4.
 * 넘기면 윗면: forward → 5, back → 2, left → 3, right → 4.
 */
const T = (color: Color = 'red', front: Face = 2, layout: DieLayout = S): RolledDie => die(color, TIME, front, layout)

/** 4라운드 직전 상태를 직접 만들고 4라운드 준비를 한다. 사건 카드는 주지 않으면 없음 */
const bases = new Map<number, GameState>()
function round4(boards: Board[], lead = 0, events: EventId[] = [], law: LawId = 'standard'): GameState {
  // createGame은 면 배치 30가지를 매번 계산해 느리므로 인원별로 한 번만 만든다 (상태는 불변이라 공유해도 안전)
  let base = bases.get(boards.length)
  if (!base) {
    base = createGame({ playerCount: boards.length, seed: 1, law: 'standard' })
    bases.set(boards.length, base)
  }
  return startRound4({
    ...base,
    phase: { kind: 'round', round: 4 },
    market: [],
    leadPlayer: lead,
    currentPlayer: lead,
    players: base.players.map((p, i) => ({ ...p, board: boards[i] as Board })),
    eventDeck: events,
    law,
  })
}

const rollDie = (s: GameState, d: RolledDie, direction: TipDirection): GameState =>
  applyAction(s, { type: 'roll', player: s.currentPlayer, dieId: d.id, direction })

const scrapDie = (s: GameState, d: RolledDie): GameState =>
  applyAction(s, { type: 'scrap', player: s.currentPlayer, dieId: d.id })

const cellOf = (s: GameState, player: number, row: number, col: number): RolledDie[] =>
  s.players[player]?.board.cells[row]?.[col] ?? []

const dirs = (b: Board, row: number, col: number) => rollTargets(b, { row, col }).map((t) => t.direction).sort()

/** 첫 번째 합법 행동을 계속 골라 끝까지. 행동 직전의 차례 플레이어 목록을 돌려준다 */
function playFirst(s0: GameState): { order: number[]; last: GameState } {
  let s = s0
  const order: number[] = []
  for (let guard = 0; guard < 100 && s.phase.kind === 'round'; guard++) {
    const action = getLegalActions(s)[0]
    if (!action) break
    order.push(s.currentPlayer)
    s = applyAction(s, action)
  }
  return { order, last: s }
}

describe('테스트 전제: 기준 배치 ⧗ 주사위(⧗/2)의 넘기기 결과', () => {
  it('forward → 5, back → 2, left → 3, right → 4', () => {
    const o = T().orientation
    expect(tip(S, o, 'forward').top).toBe(5)
    expect(tip(S, o, 'back').top).toBe(2)
    expect(tip(S, o, 'left').top).toBe(3)
    expect(tip(S, o, 'right').top).toBe(4)
  })
})

describe('§9 준비: ⧗ 주사위 정하기', () => {
  it('윗면이 ⧗인 꼭대기가 ⧗ 주사위: 쌓은 ⧗과 1·2라운드 바닥의 ⧗은 포함, 묻힌 ⧗과 옆면 ⧗은 제외', () => {
    const tower = T()
    const floor = T()
    const b = board({
      '0,0': [die('red', 1), tower],
      '1,2': [floor],
      '2,0': [T(), die('red', 3)], // 묻힌 ⧗ (직접 구성한 상태)
      '2,4': [die('red', 1, TIME, [1, 2, TIME, 5, 4, 3])], // ⧗이 앞면
      '0,4': [die('red', 2)],
    })
    expect(timeTops(b).map((t) => t.die.id)).toEqual([tower.id, floor.id])
    expect(timeTops(b).map((t) => t.cell)).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 2 },
    ])
    expect(countTimeTops(b)).toBe(2)

    const other = T()
    const s = round4([b, board({ '1,1': [other] })])
    expect(s.time?.pending).toEqual([[tower.id, floor.id], [other.id]])
  })

  it('§9 준비 때 센 ⧗ 주사위 수를 플레이어마다 기록한다 (§11-3 시간 지배자). 다 굴린 뒤에도 남는다', () => {
    const s = round4([board({ '1,1': [T()], '1,3': [T()] }), board({})])
    expect(s.players.map((p) => p.timeDice)).toEqual([2, 0])
    const { last } = playFirst(s)
    expect(last.phase.kind).toBe('ended')
    expect(last.players.map((p) => p.timeDice)).toEqual([2, 0])
  })

  it('§9 이 라운드에는 시장을 쓰지 않는다', () => {
    const s = round4([board({ '1,1': [T()] }), board({})])
    expect(s.market).toEqual([])
  })

  it('findTop: 꼭대기 주사위의 칸, 꼭대기가 아니면 null', () => {
    const under = die('red', 1)
    const top = T()
    const b = board({ '2,3': [under, top] })
    expect(findTop(b, top.id)).toEqual({ row: 2, col: 3 })
    expect(findTop(b, under.id)).toBeNull()
  })
})

describe('§9 진행: 선부터 시계 방향, ⧗ 주사위가 남은 사람만', () => {
  const mine = () => board({ '2,0': [T()], '2,2': [T()], '2,4': [T()] })
  const theirs = () => board({ '2,0': [T()], '2,2': [T()] })

  it('규칙서 예: 나 3개, 상대 2개, 내가 선이면 나 → 상대 → 나 → 상대 → 나', () => {
    const { order, last } = playFirst(round4([mine(), theirs()], 0))
    expect(order).toEqual([0, 1, 0, 1, 0])
    expect(last.phase).toEqual({ kind: 'ended' })
  })

  it('규칙서 예: 상대가 선이면 상대 → 나 → 상대 → 나 → 나', () => {
    const { order, last } = playFirst(round4([mine(), theirs()], 1))
    expect(order).toEqual([1, 0, 1, 0, 0])
    expect(last.phase).toEqual({ kind: 'ended' })
  })

  it('선부터 시작한다', () => {
    expect(round4([mine(), theirs()], 1).currentPlayer).toBe(1)
    expect(round4([mine(), theirs()], 0).currentPlayer).toBe(0)
  })

  it('굴릴 ⧗ 주사위가 없는 사람은 차례를 건너뛴다 (선이어도)', () => {
    // 3인: 선(1번)은 ⧗ 주사위 없음 → 2번 → 0번 → 끝
    const s = round4([board({ '1,1': [T()] }), board({ '0,0': [die('red', 3)] }), board({ '1,3': [T()] })], 1)
    expect(s.currentPlayer).toBe(2)
    const { order } = playFirst(s)
    expect(order).toEqual([2, 0])
  })

  it('4인: 선 다음부터 시계 방향으로 돌고, 다 쓴 사람은 빠진다', () => {
    const s = round4(
      [
        board({ '1,0': [T()] }),
        board({ '1,0': [T()], '1,2': [T()], '1,4': [T()] }),
        board({}),
        board({ '1,0': [T()], '1,2': [T()] }),
      ],
      3,
    )
    expect(playFirst(s).order).toEqual([3, 0, 1, 3, 1, 1])
  })

  it('굴리기는 반드시 해야 한다: 합법 행동은 굴리기·잔해뿐이고 넘기기는 없다', () => {
    const s = round4([mine(), theirs()], 0)
    const actions = legalTimeActions(s)
    expect(actions.length).toBeGreaterThan(0)
    expect(actions.every((a) => (a.type === 'roll' || a.type === 'scrap') && a.player === 0)).toBe(true)
    expect(getLegalActions(s)).toEqual(actions)
  })

  it('차례가 아닌 사람은 굴릴 수 없다', () => {
    const d = T()
    const s = round4([board({ '1,1': [T()] }), board({ '1,1': [d] })], 0)
    expect(() => applyAction(s, { type: 'roll', player: 1, dieId: d.id, direction: 'forward' })).toThrow(
      IllegalActionError,
    )
  })

  it('⧗ 주사위가 아닌 주사위(숫자 꼭대기, 남의 주사위)는 굴릴 수 없다', () => {
    const num = die('red', 3)
    const others = T()
    const s = round4([board({ '1,1': [T()], '1,3': [num] }), board({ '1,1': [others] })], 0)
    expect(() => rollDie(s, num, 'forward')).toThrow(IllegalActionError)
    expect(() => rollDie(s, others, 'forward')).toThrow(IllegalActionError)
  })

  it('한 번 굴린 ⧗ 주사위는 다시 굴릴 수 없다', () => {
    const d = T()
    let s = round4([board({ '1,1': [d], '2,4': [T()] }), board({})], 0)
    s = rollDie(s, d, 'forward')
    expect(s.currentPlayer).toBe(0)
    expect(() => rollDie(s, d, 'back')).toThrow(IllegalActionError)
    expect(legalTimeActions(s).every((a) => (a.type === 'pass' || a.dieId !== d.id))).toBe(true)
  })
})

describe('§9 굴리기: 방향과 옆 칸', () => {
  it('방향별 옆 칸: forward = 앞(1행 쪽), back = 뒤, left = 왼, right = 오른', () => {
    const from = { row: 1, col: 2 }
    expect(stepCell(from, 'forward')).toEqual({ row: 0, col: 2 })
    expect(stepCell(from, 'back')).toEqual({ row: 2, col: 2 })
    expect(stepCell(from, 'left')).toEqual({ row: 1, col: 1 })
    expect(stepCell(from, 'right')).toEqual({ row: 1, col: 3 })
  })

  it('진공으로: 옆 칸이 진공이면 그 칸의 1층이 되고, 원래 1층 칸은 진공이 된다', () => {
    for (const direction of TIP_DIRECTIONS) {
      const d = T()
      let s = round4([board({ '1,2': [d] }), board({})])
      const to = stepCell({ row: 1, col: 2 }, direction)
      s = rollDie(s, d, direction)
      expect(cellOf(s, 0, 1, 2)).toEqual([])
      const moved = cellOf(s, 0, to.row, to.col)
      expect(moved).toHaveLength(1)
      expect(moved[0]?.id).toBe(d.id)
    }
  })

  it('굴린 결과 방향은 그 주사위 배치의 tip과 같다 (기준이 아닌 배치 포함)', () => {
    const layouts: DieLayout[] = [S, [2, 4, TIME, 1, 5, 3], [TIME, 3, 1, 5, 2, 4], [5, 1, 4, TIME, 3, 2]]
    for (const layout of layouts) {
      for (const front of sideFaces(layout, TIME)) {
        for (const direction of TIP_DIRECTIONS) {
          const d = T('blue', front, layout)
          const s = rollDie(round4([board({ '1,2': [d] }), board({})]), d, direction)
          const to = stepCell({ row: 1, col: 2 }, direction)
          const moved = cellOf(s, 0, to.row, to.col)[0] as RolledDie
          expect(moved.orientation).toEqual(tip(layout, d.orientation, direction))
          expect(moved.layout).toEqual(layout)
          expect(moved.colors).toEqual(d.colors)
          // §9 메모: ⧗은 옆면으로 가므로 다시 위로 오지 않는다
          expect(moved.orientation.top).not.toBe(TIME)
        }
      }
    }
  })

  it('§3-2 같은 방향으로 굴려도 주사위 배치에 따라 새 윗면이 다르다', () => {
    const a = T('red', 2, S)
    const layout: DieLayout = [TIME, 3, 1, 5, 2, 4]
    const b = T('red', 1, layout)
    expect(tip(S, a.orientation, 'back').top).toBe(2)
    expect(tip(layout, b.orientation, 'back').top).toBe(1)
  })

  it('보드 밖으로는 굴릴 수 없다 (모서리 칸)', () => {
    const d = T()
    const b = board({ '0,0': [d] })
    expect(dirs(b, 0, 0)).toEqual(['back', 'right'])
    const s = round4([b, board({})])
    expect(() => rollDie(s, d, 'forward')).toThrow(IllegalActionError)
    expect(() => rollDie(s, d, 'left')).toThrow(IllegalActionError)
    expect(dirs(board({ '2,4': [T()] }), 2, 4)).toEqual(['forward', 'left'])
  })

  it('빈 칸에서는 굴릴 대상이 없다', () => {
    expect(rollTargets(board({}), { row: 1, col: 1 })).toEqual([])
  })
})

describe('§9 굴리기: 옆 기둥 위로 (3라운드 쌓기 규칙)', () => {
  // (1,1)의 ⧗/2 주사위: forward → 5, back → 2, left → 3, right → 4
  const setup = () => {
    const d = T()
    const base = die('red', 1)
    const b = board({
      '1,1': [base, d],
      '0,1': [die('red', 4)], // 5 > 4 → 가능
      '2,1': [die('red', 2)], // 2 > 2 아님 → 불가
      '1,0': [die('red', 3)], // 3 > 3 아님 → 불가
      '1,2': [die('red', 1), T()], // ⧗ 위는 끝 → 불가
    })
    return { d, base, b }
  }

  it('아래보다 큰 숫자일 때만 올라가고, 같은 숫자나 ⧗ 꼭대기 위로는 못 간다', () => {
    const { d, b } = setup()
    expect(dirs(b, 1, 1)).toEqual(['forward'])
    const s = round4([b, board({})])
    for (const dir of ['back', 'left', 'right'] as const) {
      expect(() => rollDie(s, d, dir)).toThrow(IllegalActionError)
    }
  })

  it('옆 기둥 꼭대기에 올라가고, 원래 기둥은 한 층 낮아져 아래 주사위가 새 꼭대기가 된다', () => {
    const { d, base, b } = setup()
    const s = rollDie(round4([b, board({})]), d, 'forward')
    expect(cellOf(s, 0, 0, 1).map((x) => x.orientation.top)).toEqual([4, 5])
    expect(cellOf(s, 0, 0, 1)[1]?.id).toBe(d.id)
    expect(cellOf(s, 0, 1, 1).map((x) => x.id)).toEqual([base.id])
  })

  it('⧗ 꼭대기 위로는 어떤 배치·방향으로도 못 간다', () => {
    for (const layout of [S, [2, 4, TIME, 1, 5, 3], [TIME, 3, 1, 5, 2, 4]] as DieLayout[]) {
      for (const front of sideFaces(layout, TIME)) {
        const b = board({
          '1,2': [T('red', front, layout)],
          '0,2': [T()],
          '2,2': [T()],
          '1,1': [die('red', 1), T()],
          '1,3': [T()],
        })
        expect(dirs(b, 1, 2)).toEqual([])
      }
    }
  })

  it('5 꼭대기 위로는 못 간다 (굴린 윗면은 5 이하의 숫자)', () => {
    const b = board({ '1,2': [T()], '0,2': [die('red', 5)], '2,2': [die('red', 5)], '1,1': [die('red', 5)], '1,3': [die('red', 5)] })
    expect(dirs(b, 1, 2)).toEqual([])
  })

  it('기둥 높이 차이는 따지지 않는다: 1층에서 4층 위로, 4층에서 1층 위로', () => {
    const up = T()
    const b1 = board({ '1,1': [up], '0,1': [die('red', 1), die('red', 2), die('red', 3), die('red', 4)] })
    expect(dirs(b1, 1, 1)).toContain('forward')
    const s1 = rollDie(round4([b1, board({})]), up, 'forward')
    expect(cellOf(s1, 0, 0, 1)).toHaveLength(5)
    expect(cellOf(s1, 0, 1, 1)).toEqual([])

    const down = T() // right → 4
    const b2 = board({ '1,1': [die('red', 1), die('red', 2), die('red', 3), down], '1,2': [die('red', 1)] })
    expect(dirs(b2, 1, 1)).toContain('right')
    const s2 = rollDie(round4([b2, board({})]), down, 'right')
    expect(cellOf(s2, 0, 1, 2).map((x) => x.orientation.top)).toEqual([1, 4])
    expect(cellOf(s2, 0, 1, 1)).toHaveLength(3)
  })
})

describe('§9 굴릴 수 없는 주사위 → 잔해', () => {
  /** (0,0)의 ⧗ 주사위: 앞·왼은 보드 밖, 오른·뒤는 5 꼭대기 → 네 방향 모두 불가 */
  const stuckBoard = (stuck: RolledDie, extra: Record<string, RolledDie[]> = {}) =>
    board({ '0,0': [stuck], '0,1': [die('red', 5)], '1,0': [die('red', 5)], ...extra })

  it('네 방향 모두 못 굴리는 주사위는 잔해 행동만 합법이다', () => {
    const stuck = T()
    const s = round4([stuckBoard(stuck), board({})])
    expect(rollTargets(s.players[0]?.board as Board, { row: 0, col: 0 })).toEqual([])
    expect(legalTimeActions(s)).toEqual([{ type: 'scrap', player: 0, dieId: stuck.id }])
    for (const d of TIP_DIRECTIONS) expect(() => rollDie(s, stuck, d)).toThrow(IllegalActionError)
  })

  it('잔해가 되면 보드에서 빠지고(1층이면 진공) 잔해에 쌓이며, 그것으로 차례를 마친다', () => {
    const stuck = T('green', 2, [2, 4, TIME, 1, 5, 3])
    const theirs = T()
    let s = round4([stuckBoard(stuck), board({ '1,1': [theirs] })], 0)
    expect(s.players[0]?.board.cells[0]?.[0]).toHaveLength(1)
    s = scrapDie(s, stuck)
    expect(cellOf(s, 0, 0, 0)).toEqual([])
    expect(s.players[0]?.debris).toEqual([{ id: stuck.id, colors: stuck.colors, layout: stuck.layout }])
    expect(s.time?.pending[0]).toEqual([])
    expect(s.currentPlayer).toBe(1)
  })

  it('쌓인 ⧗ 주사위가 잔해가 되면 기둥이 한 층 낮아진다', () => {
    const stuck = T()
    const base = die('red', 1)
    const b = board({ '0,0': [base, stuck], '0,1': [die('red', 5)], '1,0': [die('red', 5)] })
    const s = scrapDie(round4([b, board({})]), stuck)
    expect(cellOf(s, 0, 0, 0).map((x) => x.id)).toEqual([base.id])
  })

  it('굴릴 수 있는 주사위는 잔해로 만들 수 없다', () => {
    const free = T()
    const s = round4([board({ '1,2': [free] }), board({})])
    expect(() => scrapDie(s, free)).toThrow(IllegalActionError)
  })

  it('굴릴 수 있는 주사위가 남아 있어도 굴릴 수 없는 주사위를 골라 일부러 잔해로 만들 수 있다', () => {
    const stuck = T()
    const free = T()
    const s0 = round4([stuckBoard(stuck, { '2,4': [free] }), board({})])
    const actions = legalTimeActions(s0)
    expect(actions).toContainEqual({ type: 'scrap', player: 0, dieId: stuck.id })
    expect(actions.some((a) => a.type === 'roll' && a.dieId === free.id)).toBe(true)
    const s = scrapDie(s0, stuck)
    expect(s.players[0]?.debris.map((d) => d.id)).toEqual([stuck.id])
    expect(s.time?.pending[0]).toEqual([free.id])
  })

  it('⧗ 꼭대기에 막혀 못 굴리는 주사위도 잔해 대상 (옆 ⧗ 주사위는 굴릴 수 있음)', () => {
    const stuck = T()
    const a = T()
    const b = T()
    const s = round4([board({ '0,0': [stuck], '0,1': [a], '1,0': [b] }), board({})])
    const actions = legalTimeActions(s)
    expect(actions.filter((x) => x.type !== 'pass' && x.dieId === stuck.id)).toEqual([{ type: 'scrap', player: 0, dieId: stuck.id }])
    expect(actions.filter((x) => x.type !== 'pass' && x.dieId === a.id).every((x) => x.type === 'roll')).toBe(true)
  })

  it('굴리기로 막힌 주사위가 다음 차례에는 풀릴 수 있다 (판정은 그때그때)', () => {
    // (0,0)은 (0,1)의 ⧗ 때문에 오른쪽이 막혀 있고 뒤는 5 → 막힘. (0,1)을 뒤로 굴려 치우면 오른쪽 진공으로 풀림
    const stuck = T()
    const blocker = T()
    let s = round4([board({ '0,0': [stuck], '0,1': [blocker], '1,0': [die('red', 5)] }), board({})])
    expect(dirs(s.players[0]?.board as Board, 0, 0)).toEqual([])
    s = rollDie(s, blocker, 'back')
    expect(dirs(s.players[0]?.board as Board, 0, 0)).toEqual(['right'])
  })
})

describe('§9 굴리기 횟수와 게임 끝 (§10)', () => {
  it('굴리는 횟수 = 준비 때 센 ⧗ 주사위 수 (잔해 포함)', () => {
    const boards = () => [
      board({ '0,0': [T()], '0,1': [die('red', 5)], '1,0': [die('red', 5)], '1,2': [die('red', 1), T()], '2,4': [T()] }),
      board({ '1,1': [T()], '2,1': [T()], '2,2': [die('red', 2), die('red', 3), T()] }),
    ]
    for (const lead of [0, 1]) {
      const s = round4(boards(), lead)
      const count = s.players.reduce((n, p) => n + countTimeTops(p.board), 0)
      expect(count).toBe(6)
      expect(playFirst(s).order).toHaveLength(count)
    }
  })

  it('모두 다 굴리면 게임이 끝나고, 더는 행동할 수 없다', () => {
    const d = T()
    const s = rollDie(round4([board({ '1,1': [d] }), board({})]), d, 'forward')
    expect(s.phase).toEqual({ kind: 'ended' })
    expect(getLegalActions(s)).toEqual([])
    expect(legalTimeActions(s)).toEqual([])
    expect(() => rollDie(s, d, 'back')).toThrow(IllegalActionError)
  })

  it('아무도 ⧗ 주사위가 없으면 4라운드 준비 즉시 게임이 끝난다', () => {
    const s = round4([board(line(die('red', 1), die('red', 2), die('red', 3), die('red', 4), die('red', 5))), board({})])
    expect(s.phase).toEqual({ kind: 'ended' })
    expect(s.time?.pending).toEqual([[], []])
    expect(getLegalActions(s)).toEqual([])
  })
})

describe('§9 선(1행)이 바뀔 때', () => {
  it('선 주사위가 굴러 나가면 그 칸은 빈 칸이 되고, 빈 칸에서 색 연속이 끊긴다', () => {
    const t = T('red')
    const b = board(line(die('red', 1), die('red', 2), t, die('red', 4), die('red', 5)))
    // §2 v0.7: ⧗ 윗면은 무색이라 이미 끊겨 있다
    expect(scoreLine(b).total).toBe(2)
    const s = rollDie(round4([b, board({})]), t, 'back')
    const after = s.players[0]?.board as Board
    expect(lineDice(after)[2]).toBeUndefined()
    expect(scoreLine(after).total).toBe(2)
  })

  it('1행 진공 칸으로 굴러 들어오면 새 선 주사위가 되고, 새 윗면의 색이 그 주사위의 색이 된다', () => {
    // ⧗/4 (기준 배치): 뒤 3 → forward로 굴리면 윗면 3. 3의 면을 빨강으로
    const t: RolledDie = { ...T('red', 4), colors: colorsWith('red', 3) }
    expect(tip(S, t.orientation, 'forward').top).toBe(3)
    const b = board({
      '0,0': [die('red', 1)],
      '0,1': [die('red', 2)],
      '0,3': [die('red', 4)],
      '0,4': [die('red', 5)],
      '1,2': [t],
    })
    expect(scoreLine(b).total).toBe(2)
    const s = rollDie(round4([b, board({})]), t, 'forward')
    const after = s.players[0]?.board as Board
    expect(lineDice(after)[2]?.id).toBe(t.id)
    expect(dieColor(lineDice(after)[2] as RolledDie)).toBe('red')
    expect(scoreLine(after).total).toBe(5)
  })

  it('선 기둥 위로 굴러 올라가면 선 주사위(1층)는 그대로다', () => {
    const t = T('blue') // forward → 5
    const first = die('red', 1)
    const b = board({ ...line(die('red', 1), first, die('red', 3), die('red', 4), die('red', 5)), '1,1': [t] })
    const s = rollDie(round4([b, board({})]), t, 'forward')
    const after = s.players[0]?.board as Board
    expect(lineDice(after)[1]?.id).toBe(first.id)
    expect(after.cells[0]?.[1]).toHaveLength(2)
  })
})
