import { describe, expect, it } from 'vitest'
import { dieColor, faceColor, faceValue, isValidLayout, isValidOrientation, opposite, STANDARD_LAYOUT, TIME, type DieLayout } from '../dice'
import { createRng } from '../rng'
import {
  BOARD_COLS,
  BOARD_ROWS,
  createDice,
  createGame,
  DICE_COUNT,
  drawAndRoll,
  dicePerSlot,
  fillMarket,
  marketSlotCount,
  roll,
  randomLayout,
  rollForStartPlayer,
} from '../setup'
import { COLORS, type Die, type RolledDie } from '../types'
import { colorsWith, layoutKey } from './helpers'

const dice = (seed = 1): Die[] => createDice(createRng(seed))[0]

describe('§4 구성물', () => {
  it('주사위 120개, id가 모두 다르다', () => {
    const all = dice()
    expect(all).toHaveLength(DICE_COUNT)
    expect(DICE_COUNT).toBe(120)
    expect(new Set(all.map((d) => d.id)).size).toBe(120)
  })

  it('§2 v0.7 숫자 면 1~5에 다섯 색이 한 번씩, 숫자·색 짝은 주사위마다 다르다', () => {
    const all = dice()
    for (const d of all) expect([...d.colors].sort()).toEqual([...COLORS].sort())
    // 5! = 120가지 짝이 고루 섞여 여러 가지가 나온다
    expect(new Set(all.map((d) => d.colors.join())).size).toBeGreaterThan(50)
    // 각 색이 1의 면에 오는 주사위가 대략 1/5씩
    for (const color of COLORS) expect(all.filter((d) => d.colors[0] === color).length).toBeGreaterThan(10)
  })

  it('§2 v0.7 주사위의 색은 윗면의 색이고, ⧗ 윗면은 무색', () => {
    const colors = colorsWith('green', 3)
    expect(faceColor(colors, 3)).toBe('green')
    expect(faceColor(colors, TIME)).toBeUndefined()
    expect(dieColor({ colors, orientation: { top: 3, front: 2 } })).toBe('green')
    expect(dieColor({ colors, orientation: { top: TIME, front: 2 } })).toBeUndefined()
  })

  it('§2 모든 주사위의 면 배치가 유효하다 (여섯 면이 한 번씩)', () => {
    for (const seed of [1, 2, 3]) expect(dice(seed).every((d) => isValidLayout(d.layout))).toBe(true)
  })

  it('같은 시드면 같은 배치, 다른 시드면 다른 배치', () => {
    expect(dice(7)).toEqual(dice(7))
    expect(dice(7).map((d) => d.layout)).not.toEqual(dice(8).map((d) => d.layout))
  })

  it('createDice는 다음 RNG 상태를 돌려준다', () => {
    const r0 = createRng(5)
    const [, r1] = createDice(r0)
    expect(r1).not.toEqual(r0)
  })

  it('§2 면 배치가 다양하다: 120개에 30종 중 여러 종류가 나오고 1↔⧗ 고정이 아니다', () => {
    const all = dice(11)
    const kinds = new Set(all.map((d) => layoutKey(d.layout)))
    expect(kinds.size).toBeGreaterThanOrEqual(20)
    expect(kinds.size).toBeLessThanOrEqual(30)
    expect(all.some((d) => opposite(d.layout, 1) !== TIME)).toBe(true)
  })

  it('randomLayout은 30종을 모두 낼 수 있다 (고정 시드 3000회)', () => {
    let r = createRng(99)
    const kinds = new Set<string>()
    for (let i = 0; i < 3000; i++) {
      let layout: DieLayout
      ;[layout, r] = randomLayout(r)
      expect(isValidLayout(layout)).toBe(true)
      kinds.add(layoutKey(layout))
    }
    expect(kinds.size).toBe(30)
  })
})

describe('굴리기', () => {
  it('굴린 주사위는 유효한 방향을 가지고 id와 면 색을 유지한다', () => {
    const colors = colorsWith('green', 1)
    const [rolled] = roll(createRng(1), { id: 7, colors, layout: STANDARD_LAYOUT })
    expect(rolled.id).toBe(7)
    expect(rolled.colors).toEqual(colors)
    expect(rolled.layout).toEqual(STANDARD_LAYOUT)
    expect(isValidOrientation(rolled.layout, rolled.orientation)).toBe(true)
  })

  it('굴린 방향은 그 주사위 자신의 배치에서 유효하다 (배치 유지)', () => {
    let r = createRng(3)
    for (const d of dice(3)) {
      let rolled: RolledDie
      ;[rolled, r] = roll(r, d)
      expect(rolled.layout).toEqual(d.layout)
      expect(isValidOrientation(d.layout, rolled.orientation)).toBe(true)
    }
  })

  it('한 주사위를 여러 번 굴리면 24방향이 모두 나온다', () => {
    const d = dice(4)[0] as Die
    let r = createRng(4)
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      let rolled: RolledDie
      ;[rolled, r] = roll(r, d)
      seen.add(`${String(rolled.orientation.top)}/${String(rolled.orientation.front)}`)
    }
    expect(seen.size).toBe(24)
  })

  it('윗면 6가지가 대략 1/6씩 나온다 (⧗ 포함)', () => {
    const counts = new Map<string, number>()
    let rng = createRng(2024)
    for (let i = 0; i < 6000; i++) {
      let rolled: RolledDie
      ;[rolled, rng] = roll(rng, { id: 0, colors: colorsWith('red', 1), layout: [3, TIME, 5, 1, 2, 4] })
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
    const bag = dice().slice(0, 10)
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
    const [m1] = fillMarket(createRng(1), dice(), marketSlotCount(3), dicePerSlot(1))
    expect(m1.map((s) => s.length)).toEqual([1, 1, 1])
    const [m2, bag2] = fillMarket(createRng(1), dice(), marketSlotCount(4), dicePerSlot(2))
    expect(m2.map((s) => s.length)).toEqual([2, 2, 2, 2])
    expect(bag2).toHaveLength(112)
  })

  it('4인 3라운드 = 4칸 × 3개 = 12개, 모두 굴려져 유효한 방향', () => {
    const [m] = fillMarket(createRng(2), dice(), 4, 3)
    expect(m.flat()).toHaveLength(12)
    expect(m.flat().every((d) => isValidOrientation(d.layout, d.orientation))).toBe(true)
  })

  it('주머니가 모자라면 남은 만큼만 채운다', () => {
    const [m, bag] = fillMarket(createRng(3), dice().slice(0, 5), 4, 2)
    expect(m.map((s) => s.length)).toEqual([2, 2, 1, 0])
    expect(bag).toEqual([])
  })
})

describe('§5 게임 준비', () => {
  it.each([2, 3, 4])('%i인 1라운드: 시장 칸 = 플레이어 수, 칸마다 1개', (playerCount) => {
    const game = createGame({ playerCount, seed: 1, law: 'standard' })
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

  it('§5-3 개인 목표를 고르는 준비 단계(setup)로 시작하고, 시작 플레이어의 차례다', () => {
    const game = createGame({ playerCount: 3, seed: 1 })
    expect(game.phase).toEqual({ kind: 'setup' })
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
