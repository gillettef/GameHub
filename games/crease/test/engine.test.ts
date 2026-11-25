import { describe, expect, it } from 'vitest'
import { chooseTurn } from '../src/engine/bot'
import {
  COL_NAMES,
  distTable,
  foldActions,
  isCoveredCol,
  key,
  neighbors,
  newGame,
  physPos,
  playTurn,
  startTurn,
  validFold,
  visibleLayout,
  winners,
  type Fold,
} from '../src/engine/engine'
import { DEFAULT_CONFIG, RULES } from '../src/engine/rules'
import { runGame } from '../src/engine/sim'

const layoutNames = (fold: Fold) => visibleLayout(fold).map((v) => COL_NAMES[v.col] + (v.flipped ? "'" : '')).join(' ')

describe('접기 판정', () => {
  it('펼친 보드는 A~I 순서로 보인다', () => {
    expect(layoutNames({ L: 0, R: 0 })).toBe('A B C D E F G H I')
  })

  it('왼쪽 3열 접기: A~C가 뒤집혀 D~F를 덮고 A가 G와 이웃한다', () => {
    const f = { L: 3, R: 0 }
    expect(layoutNames(f)).toBe("C' B' A' G H I")
    expect([3, 4, 5].map((c) => isCoveredCol(f, c))).toEqual([true, true, true])
    expect(physPos(f, 0)).toBe(5)
    expect(neighbors(f, 0, 2)).toContainEqual([6, 2])
  })

  it('오른쪽 1열 접기: I가 H를 덮고 G와 이웃한다', () => {
    const f = { L: 0, R: 1 }
    expect(layoutNames(f)).toBe("A B C D E F G I'")
    expect(isCoveredCol(f, 7)).toBe(true)
  })

  it('양쪽 2열 접기: B A E I H만 보인다', () => {
    expect(layoutNames({ L: 2, R: 2 })).toBe("B' A' E I' H'")
  })

  it('양쪽 접기 폭의 합은 4를 넘을 수 없다', () => {
    expect(validFold(1, 3)).toBe(true)
    expect(validFold(2, 3)).toBe(false)
    const widths = foldActions({ L: 3, R: 0 }).flatMap((a) => (a.type === 'fold' ? [a.width] : []))
    expect(widths).toEqual([1])
  })

  it('모서리 대각선 거리: 펼침 12, 양쪽 2열 접기 6', () => {
    expect(distTable({ L: 0, R: 0 })[key(0, 0)]![key(8, 4)]).toBe(12)
    expect(distTable({ L: 2, R: 2 })[key(0, 0)]![key(8, 4)]).toBe(6)
  })
})

describe('차례', () => {
  it('부재 중인 길잡이는 이동할 수 없고, 가려진 조각은 주울 수 없다', () => {
    const s = newGame(2, 3, DEFAULT_CONFIG)
    s.shards.fill(0)
    s.players[0]!.c = 4
    s.players[0]!.r = 2 // E3
    s.shards[key(4, 1)] = 1
    s.current = 1
    playTurn(s, [{ type: 'fold', side: 'L', width: 3 }])
    expect(isCoveredCol(s.fold, 4)).toBe(true)
    expect(() => playTurn(s, [{ type: 'step', to: [4, 1] }])).toThrow()
    // 펼치면 바로 돌아와 이동하고 줍는다
    playTurn(s, [{ type: 'unfold', side: 'L' }, { type: 'step', to: [4, 1] }])
    expect(s.players[0]!.carried).toBe(1)
  })

  it('접기 펼치기는 차례에 한 번, 걸음은 3까지', () => {
    const s = newGame(2, 5, DEFAULT_CONFIG)
    expect(() => playTurn(s, [{ type: 'fold', side: 'L', width: 1 }, { type: 'unfold', side: 'L' }])).toThrow()
    const s2 = newGame(2, 5, DEFAULT_CONFIG)
    expect(() =>
      playTurn(s2, [
        { type: 'step', to: [0, 1] },
        { type: 'step', to: [0, 2] },
        { type: 'step', to: [0, 3] },
        { type: 'step', to: [0, 4] },
      ]),
    ).toThrow()
  })

  it('닻 칸에 들어가면 들고 있던 조각이 점수가 된다', () => {
    const s = newGame(2, 9, DEFAULT_CONFIG)
    s.shards.fill(0)
    Object.assign(s.players[0]!, { carried: 2, c: 0, r: 1 })
    playTurn(s, [{ type: 'step', to: [0, 0] }])
    expect(s.players[0]).toMatchObject({ score: 2, carried: 0 })
  })

  it('동점은 들고 있는 조각으로, 그래도 같으면 공동 승리', () => {
    const s = newGame(2, 1, DEFAULT_CONFIG)
    s.players[0]!.score = 5
    s.players[1]!.score = 5
    expect(winners(s)).toEqual([0, 1])
    s.players[1]!.carried = 1
    expect(winners(s)).toEqual([1])
  })

  it('가려진 칸에 별똥별이 떨어지면 그 날개가 펼쳐진다(날개 터뜨리기)', () => {
    const s = newGame(2, 4, RULES)
    s.fold = { L: 3, R: 0 }
    s.deck.push(key(4, 2)) // 다음 카드: E3 (왼쪽 날개 아래)
    playTurn(s, [])
    expect(s.fold).toEqual({ L: 0, R: 0 })
    expect(s.lastBurst).toBe('L')
    expect(s.shards[key(4, 2)]).toBeGreaterThan(0)
  })
})

describe('봇', () => {
  it('항상 규칙상 가능한 차례를 고르고 게임이 끝난다', () => {
    for (const n of [2, 3, 4]) {
      for (let seed = 1; seed <= 15; seed++) expect(runGame(n, seed, RULES, ['balanced']).timeout).toBe(false)
    }
    const s = newGame(3, 2, RULES)
    expect(() => playTurn(s, chooseTurn(s, 'balanced', () => 0.5))).not.toThrow()
  })

  it('차례 중간에 맡아도 남은 걸음·접기 안에서 고른다', () => {
    const s = newGame(2, 7, RULES)
    startTurn(s)
    s.turnSteps = 2
    s.turnFolded = true
    const acts = chooseTurn(s, 'balanced', () => 0.5)
    expect(acts.filter((a) => a.type === 'step').length).toBeLessThanOrEqual(1)
    expect(acts.some((a) => a.type !== 'step')).toBe(false)
  })
})
