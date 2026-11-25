import { describe, expect, it } from 'vitest'
import { def } from '../src/def'
import { createGame, take } from '../src/engine/stones'

describe('마지막 돌', () => {
  it('마지막 돌을 가져간 사람이 이긴다', () => {
    let s = createGame(2)
    while (s.winner === null) s = take(s, Math.min(3, s.stones))
    expect(s).toMatchObject({ stones: 0, winner: 0 })
    expect(() => take(s, 1)).toThrow()
  })

  it('신뢰할 수 없는 행동은 걸러낸다', () => {
    expect(def.parseAction({ take: 1.5 })).toBeNull()
    expect(def.parseAction(null)).toBeNull()
    expect(def.parseAction({ take: 2, extra: 1 })).toEqual({ take: 2 })
  })
})
