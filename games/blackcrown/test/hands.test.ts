import { describe, expect, it } from 'vitest'
import { Cat, bestHand, type PCard, type Suit } from '../src/engine/hands'

let nextId = 0
const c = (rank: number, suit: Suit | null = 'blade'): PCard => ({ id: nextId++, suit, rank })

describe('족보 판정', () => {
  it('손패 1장은 일격, 공용 카드와 같으면 쌍격', () => {
    expect(bestHand([c(7)], [])?.cat).toBe(Cat.High)
    expect(bestHand([c(7)], [c(7, 'ward')])?.cat).toBe(Cat.Pair)
    expect(bestHand([c(7)], [c(9, 'ward')])?.cat).toBe(Cat.High)
  })

  it('족보에 들지 않는 카드를 섞어 내면 거절', () => {
    expect(bestHand([c(3), c(9, 'ward')], [])).toBeNull()
    expect(bestHand([c(3), c(3, 'ward'), c(9, 'coin')], [])).toBeNull()
  })

  it('일격은 공용 카드가 더 높으면 공용 카드를 쓰지 않는다', () => {
    const r = bestHand([c(4)], [c(12, 'coin')])
    expect(r?.cat).toBe(Cat.High)
    expect(r?.communityUsed).toEqual([])
  })

  it('스트레이트·플러시·풀하우스·포카드·스트레이트 플러시', () => {
    expect(bestHand([c(3), c(4, 'ward'), c(5), c(6, 'coin'), c(7)], [])?.cat).toBe(Cat.Straight)
    expect(bestHand([c(1), c(4), c(9), c(11), c(13)], [])?.cat).toBe(Cat.Flush)
    expect(bestHand([c(8), c(8, 'ward'), c(8, 'coin'), c(2), c(2, 'ward')], [])?.cat).toBe(Cat.Full)
    expect(bestHand([c(8), c(8, 'ward'), c(8, 'coin'), c(8, 'lantern')], [])?.cat).toBe(Cat.Quads)
    expect(bestHand([c(9), c(10), c(11), c(12), c(13)], [])?.cat).toBe(Cat.StraightFlush)
  })

  it('끝과 처음은 잇지 않는다', () => {
    expect(bestHand([c(11), c(12, 'ward'), c(13), c(1, 'coin'), c(2)], [])).toBeNull()
  })

  it('그림자 카드는 가장 좋은 값이 된다', () => {
    expect(bestHand([c(9), c(0, null)], [])?.cat).toBe(Cat.Pair)
    expect(bestHand([c(9), c(10), c(11), c(12), c(0, null)], [])?.cat).toBe(Cat.StraightFlush)
  })

  it('숫자 ±1 효과로 쌍격을 만든다', () => {
    expect(bestHand([c(5), c(6, 'ward')], [])).toBeNull()
    expect(bestHand([c(5), c(6, 'ward')], [], { shiftCards: 1, shiftAmt: 1 })?.cat).toBe(Cat.Pair)
  })

  it('6장 이상은 낼 수 없다', () => {
    expect(bestHand([c(1), c(2), c(3), c(4), c(5), c(6)], [])).toBeNull()
  })
})
