import { describe, expect, it } from 'vitest'
import { isValidOrientation } from '../dice'
import { createRng } from '../rng'
import {
  BOARD_COLS,
  BOARD_ROWS,
  createDice,
  createGame,
  DICE_PER_COLOR,
  drawAndRoll,
  marketSize,
  roll,
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

describe('§5 게임 준비', () => {
  it.each([2, 3, 4])('%i인: 시장에 플레이어 수 + 2개, 나머지는 주머니', (playerCount) => {
    const game = createGame({ playerCount, seed: 1 })
    expect(game.market).toHaveLength(marketSize(playerCount))
    expect(game.market.every((d) => d !== null)).toBe(true)
    expect(game.bag).toHaveLength(120 - marketSize(playerCount))
    expect(game.players).toHaveLength(playerCount)
  })

  it('시장과 주머니의 주사위를 합치면 120개이고 중복이 없다', () => {
    const game = createGame({ playerCount: 4, seed: 3 })
    const ids = [...game.bag.map((d) => d.id), ...game.market.map((d) => d?.id)]
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

  it('1라운드, 0번 플레이어부터 시작한다', () => {
    const game = createGame({ playerCount: 3, seed: 1 })
    expect(game.phase).toEqual({ kind: 'round', round: 1 })
    expect(game.currentPlayer).toBe(0)
    expect(game.startPlayer).toBe(0)
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
