import { describe, expect, it } from 'vitest'
import { createRng, drawOne, nextFloat, nextInt, shuffle, type RngState } from '../rng'

function sequence(rng: RngState, n: number): number[] {
  const out: number[] = []
  let r = rng
  for (let i = 0; i < n; i++) {
    let v: number
    ;[v, r] = nextFloat(r)
    out.push(v)
  }
  return out
}

describe('시드 RNG', () => {
  it('같은 시드는 같은 수열을 만든다', () => {
    expect(sequence(createRng(42), 20)).toEqual(sequence(createRng(42), 20))
  })

  it('다른 시드는 다른 수열을 만든다', () => {
    expect(sequence(createRng(1), 5)).not.toEqual(sequence(createRng(2), 5))
  })

  it('입력 상태를 바꾸지 않는다', () => {
    const rng = createRng(7)
    nextFloat(rng)
    expect(rng).toEqual(createRng(7))
  })

  it('nextFloat는 [0, 1) 범위', () => {
    for (const v of sequence(createRng(3), 1000)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('nextInt는 [0, n) 범위이고 대략 균등하다', () => {
    const counts = [0, 0, 0, 0, 0, 0]
    let r = createRng(99)
    for (let i = 0; i < 6000; i++) {
      let v: number
      ;[v, r] = nextInt(r, 6)
      counts[v] = (counts[v] ?? 0) + 1
    }
    for (const c of counts) expect(c).toBeGreaterThan(850)
    for (const c of counts) expect(c).toBeLessThan(1150)
  })

  it('nextInt는 잘못된 n을 거부한다', () => {
    expect(() => nextInt(createRng(1), 0)).toThrow()
    expect(() => nextInt(createRng(1), 2.5)).toThrow()
  })

  it('drawOne은 원소 하나를 꺼내고 원본을 바꾸지 않는다', () => {
    const items = [1, 2, 3, 4]
    const [picked, rest] = drawOne(createRng(5), items)
    expect(items).toEqual([1, 2, 3, 4])
    expect(rest).toHaveLength(3)
    expect([...rest, picked].sort()).toEqual([1, 2, 3, 4])
  })

  it('shuffle은 같은 원소의 순열을 돌려준다', () => {
    const items = Array.from({ length: 30 }, (_, i) => i)
    const [out] = shuffle(createRng(8), items)
    expect(out.slice().sort((a, b) => a - b)).toEqual(items)
    expect(out).not.toEqual(items)
  })
})
