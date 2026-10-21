import { describe, expect, it } from 'vitest'
import { faceValue, isValidOrientation } from '../dice'
import { createRng } from '../rng'
import {
  BOARD_COLS,
  BOARD_ROWS,
  createDice,
  createGame,
  DICE_PER_COLOR,
  drawAndRoll,
  dicePerSlot,
  fillMarket,
  marketSlotCount,
  roll,
  rollForStartPlayer,
} from '../setup'
import { COLORS, type RolledDie } from '../types'

describe('§4 구성물', () => {
  it('주사위 120개 = 5색 × 24개, id가 모두 다르다', () => {
    const dice = createDice()
    expect(dice).toHaveLength(120)
    expect(new Set(dice.map((d) => d.id)).size).toBe(120)
    for (const color of COLORS) {
      expect(dice.filter((d) => d.color === color)).toHaveLength(DICE_PER_COLOR)
    }
  })
})

describe('굴리기', () => {
  it('굴린 주사위는 유효한 방향을 가지고 id와 색을 유지한다', () => {
    const [rolled] = roll(createRng(1), { id: 7, color: 'green' })
    expect(rolled.id).toBe(7)
    expect(rolled.color).toBe('green')
    expect(isValidOrientation(rolled.orientation)).toBe(true)
  })

  it('윗면 6가지가 대략 1/6씩 나온다 (⧗ 포함)', () => {
    const counts = new Map<string, number>()
    let rng = createRng(2024)
    for (let i = 0; i < 6000; i++) {
      let rolled: RolledDie
      ;[rolled, rng] = roll(rng, { id: 0, color: 'red' })
      const k = String(rolled.orientation.top)
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    expect(counts.size).toBe(6)
    for (const c of counts.values()) {
      expect(c).toBeGreaterThan(850)
      expect(c).toBeLessThan(1150)
    }
  })

  it('주머니에서 1개를 뽑아 굴리고, 나머지 주머니를 돌려준다', () => {
    const bag = createDice().slice(0, 10)
    const [rolled, rest] = drawAndRoll(createRng(4), bag)
    expect(rolled).not.toBeNull()
    expect(rest).toHaveLength(9)
    expect(rest.some((d) => d.id === rolled?.id)).toBe(false)
    expect(bag).toHaveLength(10)
  })

  it('빈 주머니에서는 null을 돌려준다', () => {
    const [rolled, bag] = drawAndRoll(createRng(1), [])
    expect(rolled).toBeNull()
    expect(bag).toEqual([])
  })
})

describe('§5-6 시작 플레이어 굴림', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => i)

  it('마지막 굴림에서 가장 높은 숫자(⧗ = 0)를 낸 단 한 사람이 시작한다', () => {
    for (const seed of seeds) {
      const [start, history] = rollForStartPlayer(createRng(seed), 4)
      const last = history[history.length - 1] ?? []
      const best = Math.max(...last.map((x) => faceValue(x.face)))
      const winners = last.filter((x) => faceValue(x.face) === best)
      expect(winners).toHaveLength(1)
      expect(winners[0]?.player).toBe(start)
    }
  })

  it('첫 굴림은 모두가, 다시 굴림은 직전 최고 동점자만 굴린다', () => {
    for (const seed of seeds) {
      const [, history] = rollForStartPlayer(createRng(seed), 4)
      expect(history[0]?.map((x) => x.player)).toEqual([0, 1, 2, 3])
      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1] ?? []
        const best = Math.max(...prev.map((x) => faceValue(x.face)))
        const tied = prev.filter((x) => faceValue(x.face) === best).map((x) => x.player)
        expect(tied.length).toBeGreaterThan(1)
        expect(history[i]?.map((x) => x.player)).toEqual(tied)
      }
    }
  })

  it('동점 다시 굴림이 실제로 일어나는 경우가 있다', () => {
    expect(seeds.some((seed) => rollForStartPlayer(createRng(seed), 4)[1].length > 1)).toBe(true)
  })

  it('시작 플레이어가 여러 사람에게 고르게 돌아간다', () => {
    const starts = new Set(seeds.map((seed) => rollForStartPlayer(createRng(seed), 4)[0]))
    expect(starts).toEqual(new Set([0, 1, 2, 3]))
  })

  it('게임 상태에 굴림 기록과 시작 플레이어가 남는다', () => {
    const game = createGame({ playerCount: 4, seed: 9 })
    const last = game.startRolls[game.startRolls.length - 1] ?? []
    const best = Math.max(...last.map((x) => faceValue(x.face)))
    expect(last.filter((x) => faceValue(x.face) === best).map((x) => x.player)).toEqual([
      game.startPlayer,
    ])
    expect(game.currentPlayer).toBe(game.startPlayer)
  })
})

describe('§5 시장 채우기', () => {
  it('쓰는 칸 수는 플레이어 수, 칸마다 라운드 번호만큼', () => {
    expect(marketSlotCount(3)).toBe(3)
    expect(dicePerSlot(1)).toBe(1)
    expect(dicePerSlot(2)).toBe(2)
    expect(dicePerSlot(3)).toBe(3)
    expect(() => dicePerSlot(4)).toThrow()
  })

  it('규칙서 예: 3인 1라운드 = 3칸 × 1개, 4인 2라운드 = 4칸 × 2개 = 8개', () => {
    const [m1] = fillMarket(createRng(1), createDice(), marketSlotCount(3), dicePerSlot(1))
    expect(m1.map((s) => s.length)).toEqual([1, 1, 1])
    const [m2, bag2] = fillMarket(createRng(1), createDice(), marketSlotCount(4), dicePerSlot(2))
    expect(m2.map((s) => s.length)).toEqual([2, 2, 2, 2])
    expect(bag2).toHaveLength(112)
  })

  it('4인 3라운드 = 4칸 × 3개 = 12개, 모두 굴려져 유효한 방향', () => {
    const [m] = fillMarket(createRng(2), createDice(), 4, 3)
    expect(m.flat()).toHaveLength(12)
    expect(m.flat().every((d) => isValidOrientation(d.orientation))).toBe(true)
  })

  it('주머니가 모자라면 남은 만큼만 채운다', () => {
    const [m, bag] = fillMarket(createRng(3), createDice().slice(0, 5), 4, 2)
    expect(m.map((s) => s.length)).toEqual([2, 2, 1, 0])
    expect(bag).toEqual([])
  })
})

describe('§5 게임 준비', () => {
  it.each([2, 3, 4])('%i인 1라운드: 시장 칸 = 플레이어 수, 칸마다 1개', (playerCount) => {
    const game = createGame({ playerCount, seed: 1 })
    expect(game.market).toHaveLength(playerCount)
    expect(game.market.every((slot) => slot?.length === 1)).toBe(true)
    expect(game.bag).toHaveLength(120 - playerCount)
    expect(game.players).toHaveLength(playerCount)
  })

  it('시장과 주머니의 주사위를 합치면 120개이고 중복이 없다', () => {
    const game = createGame({ playerCount: 4, seed: 3 })
    const ids = [...game.bag.map((d) => d.id), ...game.market.flatMap((s) => s ?? []).map((d) => d.id)]
    expect(new Set(ids).size).toBe(120)
  })

  it('개인 보드는 5×3이고 모두 비어 있다', () => {
    const game = createGame({ playerCount: 2, seed: 1 })
    for (const p of game.players) {
      expect(p.board.cells).toHaveLength(BOARD_ROWS)
      for (const row of p.board.cells) {
        expect(row).toHaveLength(BOARD_COLS)
        for (const pillar of row) expect(pillar).toEqual([])
      }
      expect(p.debris).toEqual([])
    }
  })

  it('1라운드, 시작 플레이어의 차례로 시작한다', () => {
    const game = createGame({ playerCount: 3, seed: 1 })
    expect(game.phase).toEqual({ kind: 'round', round: 1 })
    expect(game.currentPlayer).toBe(game.startPlayer)
    expect(game.leadPlayer).toBe(game.startPlayer)
  })

  it('플레이어 수는 2~4명만 허용한다', () => {
    expect(() => createGame({ playerCount: 1, seed: 1 })).toThrow()
    expect(() => createGame({ playerCount: 5, seed: 1 })).toThrow()
  })

  it('같은 시드는 같은 게임을, 다른 시드는 다른 시장을 만든다', () => {
    expect(createGame({ playerCount: 4, seed: 10 })).toEqual(createGame({ playerCount: 4, seed: 10 }))
    expect(createGame({ playerCount: 4, seed: 10 }).market).not.toEqual(
      createGame({ playerCount: 4, seed: 11 }).market,
    )
  })

  it('상태는 JSON으로 직렬화해도 그대로다', () => {
    const game = createGame({ playerCount: 4, seed: 5 })
    expect(JSON.parse(JSON.stringify(game))).toEqual(game)
  })
})
