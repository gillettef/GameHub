import { describe, expect, it } from 'vitest'
import { sideFaces, TIME, type Face } from '../dice'
import { applyAction, getLegalActions, IllegalActionError, TURNS_PER_ROUND, type Action } from '../game'
import { createRng, nextInt } from '../rng'
import { scorePlane } from '../scoring'
import { createGame } from '../setup'
import type { GameState, RolledDie } from '../types'
import { die } from './helpers'

const take = (s: GameState, slot: number): GameState =>
  applyAction(s, { type: 'takeSlot', player: s.currentPlayer, slot })

const place = (s: GameState, d: RolledDie, row: number, col: number, front?: Face): GameState =>
  applyAction(s, { type: 'place', player: s.currentPlayer, dieId: d.id, row, col, front })

/** 시장을 원하는 주사위로 바꿔 끼운 상태 */
function withMarket(s: GameState, market: RolledDie[][]): GameState {
  return { ...s, market }
}

/** 시드 RNG로 합법 행동을 무작위 선택해 끝까지(4라운드 진입) 진행 */
function playRandomly(seed: number, playerCount: number): GameState[] {
  let s = createGame({ playerCount, seed })
  let r = createRng(seed + 1)
  const history = [s]
  for (let guard = 0; guard < 1000; guard++) {
    const actions = getLegalActions(s)
    if (actions.length === 0) break
    let i: number
    ;[i, r] = nextInt(r, actions.length)
    s = applyAction(s, actions[i] as Action)
    history.push(s)
  }
  return history
}

function countDice(s: GameState): number {
  const onBoards = s.players.reduce((n, p) => n + p.board.cells.flat(2).length, 0)
  const debris = s.players.reduce((n, p) => n + p.debris.length, 0)
  const market = s.market.reduce((n, slot) => n + (slot?.length ?? 0), 0)
  return s.bag.length + market + onBoards + debris + s.turn.hand.length
}

describe('§5 공통 턴 규칙', () => {
  it('차례가 아닌 사람은 행동할 수 없다', () => {
    const s = createGame({ playerCount: 3, seed: 1 })
    const other = (s.currentPlayer + 1) % 3
    expect(() => applyAction(s, { type: 'takeSlot', player: other, slot: 0 })).toThrow(IllegalActionError)
  })

  it('칸을 가져오기 전에는 놓을 수 없다', () => {
    const s = createGame({ playerCount: 3, seed: 1 })
    const d = s.market[0]?.[0] as RolledDie
    expect(() => place(s, d, 0, 2)).toThrow(IllegalActionError)
  })

  it('칸을 통째로 가져오고, 그 칸은 비워진다(null)', () => {
    const s0 = createGame({ playerCount: 4, seed: 2 })
    const s1 = applyAction(withMarket(s0, [[die('red', 1)], [die('blue', 2)], [die('green', 3)], [die('black', 4)]]), {
      type: 'takeSlot',
      player: s0.currentPlayer,
      slot: 1,
    })
    expect(s1.market[1]).toBeNull()
    expect(s1.turn.hand.map((d) => d.color)).toEqual(['blue'])
  })

  it('이미 가져간 칸은 다시 가져갈 수 없다', () => {
    let s = createGame({ playerCount: 3, seed: 3 })
    const first = s.market[0]?.[0] as RolledDie
    s = place(take(s, 0), first, 0, 2)
    expect(() => take(s, 0)).toThrow(IllegalActionError)
  })

  it('윗면은 바꿀 수 없고 앞면만 옆면 중에서 고른다', () => {
    const s0 = createGame({ playerCount: 2, seed: 4 })
    const d = die('red', 3)
    const s = take(withMarket(s0, [[d], [die('red', 1)]]), 0)
    expect(() => place(s, d, 0, 2, 4)).toThrow(IllegalActionError)
    const front = sideFaces(3)[2] as Face
    const after = place(s, d, 0, 2, front)
    expect(after.players[s0.currentPlayer]?.board.cells[0]?.[2]?.[0]?.orientation).toEqual({ top: 3, front })
  })

  it('턴이 끝나면 시계 방향 다음 사람의 차례', () => {
    let s = createGame({ playerCount: 3, seed: 5 })
    const lead = s.currentPlayer
    s = place(take(s, 0), s.market[0]?.[0] as RolledDie, 0, 2)
    expect(s.currentPlayer).toBe((lead + 1) % 3)
  })
})

describe('§5 바퀴 끝', () => {
  it('모두 한 턴씩 하면 시장을 새로 채우고 선이 왼쪽으로 넘어간다', () => {
    let s = createGame({ playerCount: 3, seed: 6 })
    const lead = s.leadPlayer
    for (let i = 0; i < 3; i++) {
      const slot = s.market.findIndex((m) => m !== null)
      s = take(s, slot)
      s = place(s, s.turn.hand[0] as RolledDie, 0, 2)
    }
    expect(s.turn.circuit).toBe(1)
    expect(s.leadPlayer).toBe((lead + 1) % 3)
    expect(s.currentPlayer).toBe(s.leadPlayer)
    expect(s.market.map((m) => m?.length)).toEqual([1, 1, 1])
  })

  it('마지막 사람에게는 남은 칸 하나만 합법이다', () => {
    let s = createGame({ playerCount: 3, seed: 7 })
    for (let i = 0; i < 2; i++) {
      s = take(s, s.market.findIndex((m) => m !== null))
      s = place(s, s.turn.hand[0] as RolledDie, 0, 2)
    }
    expect(getLegalActions(s)).toHaveLength(1)
  })
})

describe('§6 1라운드', () => {
  it('1라운드에는 잔해로 버릴 수 없다', () => {
    const s = take(createGame({ playerCount: 2, seed: 8 }), 0)
    expect(() =>
      applyAction(s, { type: 'discard', player: s.currentPlayer, dieId: s.turn.hand[0]?.id as number }),
    ).toThrow(IllegalActionError)
  })

  it('5바퀴가 끝나면 2라운드, 시장은 칸마다 2개', () => {
    const states = playRandomly(11, 3)
    const r2 = states.find((s) => s.phase.kind === 'round' && s.phase.round === 2) as GameState
    expect(r2.market.map((m) => m?.length)).toEqual([2, 2, 2])
    for (const p of r2.players) expect(p.board.cells[0]?.every((pillar) => pillar.length === 1)).toBe(true)
  })
})

describe('§7 2라운드', () => {
  it('한 턴에 2개를 놓고, 두 번째는 첫 번째에 맞닿아도 된다', () => {
    const states = playRandomly(12, 2)
    let s = states.find((x) => x.phase.kind === 'round' && x.phase.round === 2) as GameState
    const a = die('red', 2)
    const b = die('blue', 3)
    s = take(withMarket(s, [[a, b], [die('red', 1), die('red', 1)]]), 0)
    s = place(s, a, 1, 2)
    expect(s.turn.hand).toHaveLength(1)
    const p = s.currentPlayer
    s = place(s, b, 2, 2)
    expect(s.players[p]?.board.cells[2]?.[2]).toHaveLength(1)
  })

  it('잔해로 버리면 debris에 쌓이고 감점 대상이 된다', () => {
    const states = playRandomly(13, 2)
    let s = states.find((x) => x.phase.kind === 'round' && x.phase.round === 2) as GameState
    const p = s.currentPlayer
    s = take(s, 0)
    const [d1, d2] = s.turn.hand as [RolledDie, RolledDie]
    s = applyAction(s, { type: 'discard', player: p, dieId: d1.id })
    s = applyAction(s, { type: 'discard', player: p, dieId: d2.id })
    expect(s.players[p]?.debris.map((d) => d.id)).toEqual([d1.id, d2.id])
  })

  it('2라운드가 끝나면 평면 점수를 확정한다', () => {
    const states = playRandomly(14, 3)
    const r3 = states.find((x) => x.phase.kind === 'round' && x.phase.round === 3) as GameState
    for (const p of r3.players) expect(p.planeScore).toBe(scorePlane(p.board).total)
    const r2 = states.find((x) => x.phase.kind === 'round' && x.phase.round === 2) as GameState
    for (const p of r2.players) expect(p.planeScore).toBeNull()
  })
})

describe('§8 3라운드', () => {
  it('같은 턴에 방금 올린 주사위 위에 이어서 올릴 수 있다', () => {
    const states = playRandomly(15, 2)
    let s = states.find((x) => x.phase.kind === 'round' && x.phase.round === 3) as GameState
    const a = die('red', TIME)
    const b = die('red', 1)
    const c = die('red', 2)
    s = take(withMarket(s, [[a, b, c], [die('red', 1), die('red', 1), die('red', 1)]]), 0)
    const p = s.currentPlayer
    s = place(s, a, 0, 0)
    s = place(s, b, 0, 0)
    s = place(s, c, 0, 0)
    expect(s.players[p]?.board.cells[0]?.[0]?.slice(-3).map((d) => d.orientation.top)).toEqual([TIME, 1, 2])
  })

  it('쌓기 규칙을 어기는 칸에는 놓을 수 없다', () => {
    const states = playRandomly(16, 2)
    let s = states.find((x) => x.phase.kind === 'round' && x.phase.round === 3) as GameState
    const p = s.currentPlayer
    const five = die('red', 5)
    const one = die('red', 1)
    // (0,0) 꼭대기를 5로 만든 뒤, 그 위에 1은 놓을 수 없다
    s = { ...s, players: s.players.map((pl) => (pl.id === p ? { ...pl, board: { cells: pl.board.cells.map((row, r) => row.map((pillar, c) => (r === 0 && c === 0 ? [five] : pillar))) } } : pl)) }
    s = take(withMarket(s, [[one, die('red', TIME), die('red', TIME)], [die('red', 1), die('red', 1), die('red', 1)]]), 0)
    expect(() => place(s, one, 0, 0)).toThrow(IllegalActionError)
  })

  it('2바퀴가 끝나면 4라운드로 넘어가고 시장은 비운다', () => {
    const states = playRandomly(17, 4)
    const first4 = states.find((s) => s.time !== null) as GameState
    expect(first4.market).toEqual([])
    expect(first4.time?.timeline).toHaveLength(3)
    const last = states[states.length - 1] as GameState
    expect(last.phase).toEqual({ kind: 'ended' })
    expect(getLegalActions(last)).toEqual([])
    expect(() => applyAction(last, { type: 'takeSlot', player: last.currentPlayer, slot: 0 })).toThrow(
      IllegalActionError,
    )
  })
})

describe('무작위 전체 진행 (불변식)', () => {
  it.each([
    [2, 21],
    [3, 22],
    [4, 23],
  ])('%i인: 주사위 120개 보존, 턴 수와 선 이동이 규칙대로', (playerCount, seed) => {
    const states = playRandomly(seed, playerCount)
    for (const s of states) expect(countDice(s)).toBe(120)

    const last = states[states.length - 1] as GameState
    const totalCircuits = TURNS_PER_ROUND[1] + TURNS_PER_ROUND[2] + TURNS_PER_ROUND[3]
    expect(last.leadPlayer).toBe((last.startPlayer + totalCircuits) % playerCount)
    for (const p of last.players) {
      expect(p.board.cells[0]?.every((pillar) => pillar.length >= 1)).toBe(true)
      // 평면 6개 + 쌓기 6개 중 놓은 것 + 잔해 = 12
      const plane = (p.board.cells[1] ?? []).concat(p.board.cells[2] ?? []).filter((x) => x.length > 0).length
      const stacked = p.board.cells.flat().reduce((n, pillar) => n + Math.max(0, pillar.length - 1), 0)
      expect(plane + stacked + p.debris.length).toBe(12)
    }
  })

  it('같은 시드와 같은 행동은 같은 결과 (결정적)', () => {
    expect(playRandomly(30, 3)).toEqual(playRandomly(30, 3))
  })

  it('모든 상태가 JSON 직렬화 가능', () => {
    const states = playRandomly(31, 4)
    const last = states[states.length - 1]
    expect(JSON.parse(JSON.stringify(last))).toEqual(last)
  })
})
