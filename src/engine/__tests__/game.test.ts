import { describe, expect, it } from 'vitest'
import { dieColor, sideFaces, STANDARD_LAYOUT, TIME, type Face } from '../dice'
import { applyAction, getLegalActions, IllegalActionError, TURNS_PER_ROUND, type Action } from '../game'
import { createRng, nextInt } from '../rng'
import { scoreLine, scorePlane, scoreTower } from '../scoring'
import { legalTimeActions, timeTops } from '../time'
import type { GameState, RolledDie } from '../types'
import { die, startGame } from './helpers'

const take = (s: GameState, slot: number): GameState =>
  applyAction(s, { type: 'takeSlot', player: s.currentPlayer, slot })

const place = (s: GameState, d: RolledDie, row: number, col: number, front?: Face): GameState =>
  applyAction(s, { type: 'place', player: s.currentPlayer, dieId: d.id, row, col, front })

/** 시장을 원하는 주사위로 바꿔 끼운 상태 */
function withMarket(s: GameState, market: RolledDie[][]): GameState {
  return { ...s, market }
}

/** 한 플레이어의 한 칸을 원하는 기둥으로 바꾼 상태 */
function withCell(s: GameState, player: number, row: number, col: number, pillar: RolledDie[]): GameState {
  return {
    ...s,
    players: s.players.map((pl) =>
      pl.id === player
        ? { ...pl, board: { cells: pl.board.cells.map((r, ri) => r.map((x, ci) => (ri === row && ci === col ? pillar : x))) } }
        : pl,
    ),
  }
}

/** 시드 RNG로 합법 행동을 무작위 선택해 끝까지(4라운드 진입) 진행 */
function playRandomly(seed: number, playerCount: number): GameState[] {
  let s = startGame({ playerCount, seed })
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

/** 주사위가 놓인 칸 수 */
function first4Cells(row: RolledDie[][] | undefined): number {
  return (row ?? []).filter((x) => x.length > 0).length
}

function countDice(s: GameState): number {
  const onBoards = s.players.reduce((n, p) => n + p.board.cells.flat(2).length, 0)
  const debris = s.players.reduce((n, p) => n + p.debris.length, 0)
  const market = s.market.reduce((n, slot) => n + (slot?.length ?? 0), 0)
  return s.bag.length + market + onBoards + debris + s.turn.hand.length
}

describe('§5 공통 턴 규칙', () => {
  it('차례가 아닌 사람은 행동할 수 없다', () => {
    const s = startGame({ playerCount: 3, seed: 1 })
    const other = (s.currentPlayer + 1) % 3
    expect(() => applyAction(s, { type: 'takeSlot', player: other, slot: 0 })).toThrow(IllegalActionError)
  })

  it('칸을 가져오기 전에는 놓을 수 없다', () => {
    const s = startGame({ playerCount: 3, seed: 1 })
    const d = s.market[0]?.[0] as RolledDie
    expect(() => place(s, d, 0, 2)).toThrow(IllegalActionError)
  })

  it('칸을 통째로 가져오고, 그 칸은 비워진다(null)', () => {
    const s0 = startGame({ playerCount: 4, seed: 2 })
    const s1 = applyAction(withMarket(s0, [[die('red', 1)], [die('blue', 2)], [die('green', 3)], [die('black', 4)]]), {
      type: 'takeSlot',
      player: s0.currentPlayer,
      slot: 1,
    })
    expect(s1.market[1]).toBeNull()
    expect(s1.turn.hand.map(dieColor)).toEqual(['blue'])
  })

  it('이미 가져간 칸은 다시 가져갈 수 없다', () => {
    let s = startGame({ playerCount: 3, seed: 3 })
    const first = s.market[0]?.[0] as RolledDie
    s = place(take(s, 0), first, 0, 2)
    expect(() => take(s, 0)).toThrow(IllegalActionError)
  })

  it('윗면은 바꿀 수 없고 앞면만 옆면 중에서 고른다', () => {
    const s0 = startGame({ playerCount: 2, seed: 4 })
    const d = die('red', 3)
    const s = take(withMarket(s0, [[d], [die('red', 1)]]), 0)
    expect(() => place(s, d, 0, 2, 4)).toThrow(IllegalActionError)
    const front = sideFaces(STANDARD_LAYOUT, 3)[2] as Face
    const after = place(s, d, 0, 2, front)
    expect(after.players[s0.currentPlayer]?.board.cells[0]?.[2]?.[0]?.orientation).toEqual({ top: 3, front })
  })

  it('턴이 끝나면 시계 방향 다음 사람의 차례', () => {
    let s = startGame({ playerCount: 3, seed: 5 })
    const lead = s.currentPlayer
    s = place(take(s, 0), s.market[0]?.[0] as RolledDie, 0, 2)
    expect(s.currentPlayer).toBe((lead + 1) % 3)
  })
})

describe('§5 바퀴 끝', () => {
  it('모두 한 턴씩 하면 시장을 새로 채우고 선이 왼쪽으로 넘어간다', () => {
    let s = startGame({ playerCount: 3, seed: 6 })
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
    let s = startGame({ playerCount: 3, seed: 7 })
    for (let i = 0; i < 2; i++) {
      s = take(s, s.market.findIndex((m) => m !== null))
      s = place(s, s.turn.hand[0] as RolledDie, 0, 2)
    }
    expect(getLegalActions(s)).toHaveLength(1)
  })
})

describe('§6 1라운드', () => {
  it('1라운드에는 잔해로 버릴 수 없다', () => {
    const s = take(startGame({ playerCount: 2, seed: 8 }), 0)
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
    const before = s.players[p]?.debris.length ?? 0
    s = take(s, 0)
    const [d1, d2] = s.turn.hand as [RolledDie, RolledDie]
    s = applyAction(s, { type: 'discard', player: p, dieId: d1.id })
    s = applyAction(s, { type: 'discard', player: p, dieId: d2.id })
    expect(s.players[p]?.debris.slice(before).map((d) => d.id)).toEqual([d1.id, d2.id])
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
  it('§8 같은 턴에 방금 올린 주사위 위에 이어서 올릴 수 있다', () => {
    const states = playRandomly(15, 2)
    let s = states.find((x) => x.phase.kind === 'round' && x.phase.round === 3) as GameState
    s = withCell(s, s.currentPlayer, 0, 0, [die('red', 1)])
    const a = die('red', 2)
    const b = die('red', 3)
    const c = die('red', TIME)
    s = take(withMarket(s, [[a, b, c], [die('red', 1), die('red', 1), die('red', 1)]]), 0)
    const p = s.currentPlayer
    s = place(s, a, 0, 0)
    s = place(s, b, 0, 0)
    s = place(s, c, 0, 0)
    expect(s.players[p]?.board.cells[0]?.[0]?.map((d) => d.orientation.top)).toEqual([1, 2, 3, TIME])
  })

  it('§8 ⧗ 위는 끝: 같은 턴에 방금 올린 ⧗ 위에도 이어서 올릴 수 없다', () => {
    const states = playRandomly(15, 2)
    let s = states.find((x) => x.phase.kind === 'round' && x.phase.round === 3) as GameState
    s = withCell(s, s.currentPlayer, 0, 0, [die('red', 1)])
    const a = die('red', TIME)
    const b = die('red', 5)
    s = take(withMarket(s, [[a, b, die('red', TIME)], [die('red', 1), die('red', 1), die('red', 1)]]), 0)
    s = place(s, a, 0, 0)
    expect(() => place(s, b, 0, 0)).toThrow(IllegalActionError)
    expect(() => place(s, s.turn.hand[1] as RolledDie, 0, 0)).toThrow(IllegalActionError)
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

  it('2바퀴가 끝나면 4라운드로 넘어가고 시장은 비운다 (§9 시장을 쓰지 않음)', () => {
    const states = playRandomly(17, 4)
    const first4 = states.find((s) => s.time !== null) as GameState
    expect(first4.market).toEqual([])
    // §9 준비: 각자 윗면이 ⧗인 꼭대기 주사위가 ⧗ 주사위
    expect(first4.time?.pending).toEqual(first4.players.map((p) => timeTops(p.board).map((t) => t.die.id)))
    const last = states[states.length - 1] as GameState
    expect(last.phase).toEqual({ kind: 'ended' })
    expect(getLegalActions(last)).toEqual([])
    expect(() => applyAction(last, { type: 'takeSlot', player: last.currentPlayer, slot: 0 })).toThrow(
      IllegalActionError,
    )
  })
})

describe('§5 시장 다시 굴리기 (v0.7)', () => {
  const reroll = (s: GameState, d: RolledDie): GameState =>
    applyAction(s, { type: 'rerollHand', player: s.currentPlayer, dieId: d.id })

  it('가져온 주사위 1개를 다시 굴리고, 주머니의 주사위 1개가 내 잔해가 된다', () => {
    const s0 = take(startGame({ playerCount: 3, seed: 5 }), 0)
    const p = s0.currentPlayer
    const d = s0.turn.hand[0] as RolledDie
    const s1 = reroll(s0, d)
    const rolled = s1.turn.hand[0] as RolledDie
    // id·면 배치·면 색은 그대로, 방향만 새로
    expect({ id: rolled.id, colors: rolled.colors, layout: rolled.layout }).toEqual({ id: d.id, colors: d.colors, layout: d.layout })
    expect(s1.bag).toHaveLength(s0.bag.length - 1)
    expect(s1.players[p]?.debris).toHaveLength(1)
    const cost = s1.players[p]?.debris[0]
    expect(s0.bag.some((x) => x.id === cost?.id)).toBe(true)
    expect(s1.bag.some((x) => x.id === cost?.id)).toBe(false)
    expect(s1.turn.handRerolled).toBe(true)
    expect(s1.currentPlayer).toBe(p)
    // 결정적
    expect(reroll(s0, d)).toEqual(s1)
  })

  it('가져오기 전에는 할 수 없다', () => {
    const s = startGame({ playerCount: 2, seed: 6 })
    const d = s.market[0]?.[0] as RolledDie
    expect(() => reroll(s, d)).toThrow(IllegalActionError)
    expect(getLegalActions(s).some((a) => a.type === 'rerollHand')).toBe(false)
  })

  it('턴마다 1회만, 다음 턴에는 다시 할 수 있다', () => {
    let s = take(startGame({ playerCount: 2, seed: 7 }), 0)
    s = reroll(s, s.turn.hand[0] as RolledDie)
    expect(() => reroll(s, s.turn.hand[0] as RolledDie)).toThrow(IllegalActionError)
    expect(getLegalActions(s).some((a) => a.type === 'rerollHand')).toBe(false)
    // 1라운드 첫 주사위는 가운데에
    s = place(s, s.turn.hand[0] as RolledDie, 0, 2)
    s = take(s, 1)
    expect(s.turn.handRerolled).toBe(false)
    expect(getLegalActions(s).some((a) => a.type === 'rerollHand')).toBe(true)
  })

  it('2라운드: 하나를 놓은 뒤 남은 주사위를 다시 굴릴 수 있고, 다시 굴린 주사위는 그대로 손에 남는다', () => {
    const states = playRandomly(17, 2)
    let s = states.find((x) => x.phase.kind === 'round' && x.phase.round === 2 && !x.turn.taken) as GameState
    s = take(s, 0)
    const first = s.turn.hand[0] as RolledDie
    const cell = getLegalActions(s).find((a) => a.type === 'place' && a.dieId === first.id)
    if (cell?.type !== 'place') throw new Error('놓을 칸이 없음')
    s = applyAction(s, cell)
    const rest = s.turn.hand[0] as RolledDie
    expect(s.turn.hand).toHaveLength(1)
    s = reroll(s, rest)
    expect(s.turn.hand.map((d) => d.id)).toEqual([rest.id])
    expect(s.turn.handRerolled).toBe(true)
  })

  it('흔들리는 시장(가져오기 전, 대가 없음)과 시장 다시 굴리기(가져온 뒤, 잔해 1개)는 한 턴에 둘 다 쓸 수 있다', () => {
    let s = startGame({ playerCount: 2, seed: 11, law: 'shakyMarket' })
    const p = s.currentPlayer
    const d = s.market[0]?.[0] as RolledDie
    s = applyAction(s, { type: 'reroll', player: p, slot: 0, dieId: d.id })
    expect(s.players[p]?.debris).toHaveLength(0)
    s = take(s, 0)
    s = reroll(s, s.turn.hand[0] as RolledDie)
    expect(s.players[p]?.debris).toHaveLength(1)
  })

  it('손에 없는 주사위는 다시 굴릴 수 없다', () => {
    const s = take(startGame({ playerCount: 2, seed: 8 }), 0)
    expect(() => applyAction(s, { type: 'rerollHand', player: s.currentPlayer, dieId: 99999 })).toThrow(IllegalActionError)
  })

  it('주머니가 비었으면 할 수 없다', () => {
    const s = { ...take(startGame({ playerCount: 2, seed: 9 }), 0), bag: [] }
    expect(() => reroll(s, s.turn.hand[0] as RolledDie)).toThrow(IllegalActionError)
    expect(getLegalActions(s).some((a) => a.type === 'rerollHand')).toBe(false)
  })

  it('다른 사람 차례에는 할 수 없다', () => {
    const s = take(startGame({ playerCount: 2, seed: 10 }), 0)
    const other = (s.currentPlayer + 1) % 2
    expect(() => applyAction(s, { type: 'rerollHand', player: other, dieId: (s.turn.hand[0] as RolledDie).id })).toThrow(IllegalActionError)
  })
})

describe('§6~§8 기본 점수는 그 라운드 끝에 확정 (v0.7)', () => {
  it('1라운드 끝에 선, 2라운드 끝에 평면, 3라운드 끝에 탑 점수를 확정한다', () => {
    const states = playRandomly(16, 3)
    const at = (round: number) => states.find((x) => x.phase.kind === 'round' && x.phase.round === round) as GameState
    for (const p of at(1).players) expect([p.lineScore, p.planeScore, p.towerScore]).toEqual([null, null, null])
    for (const p of at(2).players) {
      expect(p.lineScore).toBe(scoreLine(p.board).total)
      expect(p.planeScore).toBeNull()
    }
    for (const p of at(3).players) expect(p.planeScore).toBe(scorePlane(p.board).total)
    const r4 = states.find((x) => x.time !== null) as GameState
    for (const p of r4.players) expect(p.towerScore).toBe(scoreTower(p.board).total)
    // 확정한 점수는 그 뒤로 바뀌지 않는다
    const last = states[states.length - 1] as GameState
    for (const p of last.players) {
      expect(p.lineScore).toBe(at(2).players[p.id]?.lineScore)
      expect(p.towerScore).toBe(r4.players[p.id]?.towerScore)
    }
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
    expect(last.phase).toEqual({ kind: 'ended' })

    // 4라운드 굴리기 전(3라운드 끝) 상태로 1~3라운드 불변식 확인
    const first4 = states.find((s) => s.time !== null) as GameState
    // §5 시장 다시 굴리기마다 주머니의 주사위 1개가 잔해로 더해진다
    const rerolls = first4.players.map(() => 0)
    states.forEach((s, i) => {
      const prev = states[i - 1]
      if (prev && !prev.turn.handRerolled && s.turn.handRerolled) rerolls[s.currentPlayer]!++
    })
    for (const p of first4.players) {
      expect(p.board.cells[0]?.every((pillar) => pillar.length >= 1)).toBe(true)
      // 평면 6개 + 쌓기 6개 중 놓은 것 + 잔해 = 12 + 다시 굴린 횟수
      const plane = (first4Cells(p.board.cells[1]) + first4Cells(p.board.cells[2]))
      const stacked = p.board.cells.flat().reduce((n, pillar) => n + Math.max(0, pillar.length - 1), 0)
      expect(plane + stacked + p.debris.length).toBe(12 + (rerolls[p.id] ?? 0))
    }

    // §9 4라운드에 ⧗ 주사위를 넘기는 횟수 = 준비 때 센 ⧗ 주사위 수.
    // v0.8: 그 밖의 행동은 자유 넘기기(자유 넘기기 1 감소) 또는 포기(남은 것 모두 0)뿐
    const r4 = states.slice(states.indexOf(first4))
    let timeTipCount = 0
    for (let i = 1; i < r4.length; i++) {
      const a = (r4[i - 1] as GameState).time as NonNullable<GameState['time']>
      const b = (r4[i] as GameState).time as NonNullable<GameState['time']>
      const pendingDrop = a.pending.flat().length - b.pending.flat().length
      const freeDrop = a.free.reduce((x, y) => x + y, 0) - b.free.reduce((x, y) => x + y, 0)
      expect(pendingDrop === 1 ? freeDrop === 0 : pendingDrop === 0 && freeDrop >= 1).toBe(true)
      timeTipCount += pendingDrop
    }
    expect(timeTipCount).toBe(first4.time?.pending.flat().length)
  })

  it('§9 4라운드 내내 아직 안 넘긴 ⧗ 주사위는 모두 보드의 ⧗ 꼭대기이고, 자유 넘기기를 쓰지 않은 사람은 둘이 같다 (드러난 아래 주사위는 ⧗일 수 없음)', () => {
    // v0.8: 자유 넘기기로 ⧗이 위로 온 주사위는 ⧗ 꼭대기지만 ⧗ 주사위가 아니다 (§9 준비)
    for (const [seed, n] of [[41, 2], [42, 3], [43, 4], [44, 4]] as const) {
      const states = playRandomly(seed, n)
      const first4 = states.find((x) => x.time !== null) as GameState
      for (const s of states.filter((x) => x.time !== null && x.phase.kind === 'round')) {
        s.players.forEach((p, i) => {
          const tops = timeTops(p.board).map((t) => t.die.id)
          const pending = s.time?.pending[i] ?? []
          for (const id of pending) expect(tops).toContain(id)
          if (s.time?.free[i] === first4.time?.free[i]) expect([...pending].sort()).toEqual([...tops].sort())
        })
        expect(getLegalActions(s)).toEqual(legalTimeActions(s))
        expect(getLegalActions(s).length).toBeGreaterThan(0)
      }
    }
  })

  it('§9 + §11-1 영원의 우주: 무작위 전체 진행에서도 같은 불변식 (자유 넘기기 사용 포함)', () => {
    for (const [seed, n] of [[51, 2], [52, 3]] as const) {
      let s = startGame({ playerCount: n, seed, law: 'eternal' })
      let r = createRng(seed + 1)
      const states = [s]
      for (let guard = 0; guard < 1000; guard++) {
        const actions = getLegalActions(s)
        if (actions.length === 0) break
        let i: number
        ;[i, r] = nextInt(r, actions.length)
        s = applyAction(s, actions[i] as Action)
        states.push(s)
      }
      expect(s.phase).toEqual({ kind: 'ended' })
      for (const x of states) expect(countDice(x)).toBe(120)
      const first4 = states.find((x) => x.time !== null) as GameState
      expect(first4.time?.free.every((f) => f >= 1)).toBe(true)
      for (const x of states.filter((y) => y.time !== null && y.phase.kind === 'round')) {
        x.players.forEach((p, i) => {
          const tops = timeTops(p.board).map((t) => t.die.id)
          for (const id of x.time?.pending[i] ?? []) expect(tops).toContain(id)
        })
      }
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
