import { describe, expect, it } from 'vitest'
import {
  allOrientations,
  backFace,
  bottomFace,
  faceValue,
  facesOf,
  FACES,
  isValidLayout,
  isValidOrientation,
  leftFace,
  opposite,
  rightFace,
  sideFaces,
  STANDARD_LAYOUT,
  TIME,
  tip,
  TIP_DIRECTIONS,
  withFront,
  type DieLayout,
  type Face,
  type Orientation,
  type TipDirection,
} from '../dice'
import { createRng, type RngState } from '../rng'
import { randomLayout } from '../setup'
import { allLayouts, layoutKey } from './helpers'

const key = (o: Orientation) => `${String(o.top)}/${String(o.front)}`
const S = STANDARD_LAYOUT
const CANONICAL: Orientation = { top: 1, front: 2 }

const INVERSE: Record<TipDirection, TipDirection> = {
  forward: 'back',
  back: 'forward',
  left: 'right',
  right: 'left',
}

/** 고정 시드로 뽑은 무작위 배치 여러 개 + 기준 배치 */
function sampleLayouts(count: number, seed = 42): DieLayout[] {
  const out: DieLayout[] = [S]
  let r: RngState = createRng(seed)
  for (let i = 0; i < count; i++) {
    let layout: DieLayout
    ;[layout, r] = randomLayout(r)
    out.push(layout)
  }
  return out
}

const LAYOUTS = sampleLayouts(40)

/** 1과 ⧗이 마주 보지 않는 배치: 위 1, 아래 2, 앞 ⧗, 뒤 5, 오른 4, 왼 3 */
const ONE_NEXT_TO_TIME: DieLayout = [1, 2, TIME, 5, 4, 3]

describe('§2 전용 주사위 면 구성', () => {
  it('면은 1~5와 ⧗ 여섯 개', () => {
    expect(FACES).toEqual([1, 2, 3, 4, 5, TIME])
  })

  it('⧗은 합계에서 0', () => {
    expect(faceValue(TIME)).toBe(0)
    expect(faceValue(5)).toBe(5)
  })

  it('§2 여섯 면이 한 번씩 들어간 배치만 유효하다', () => {
    expect(isValidLayout(S)).toBe(true)
    expect(isValidLayout(ONE_NEXT_TO_TIME)).toBe(true)
    expect(isValidLayout([1, 1, 2, 3, 4, 5])).toBe(false)
    expect(isValidLayout([1, 2, 3, 4, 5])).toBe(false)
  })

  it('§2 여섯 면 배치는 회전을 같은 것으로 보면 30가지', () => {
    const layouts = allLayouts()
    expect(layouts).toHaveLength(720)
    expect(layouts.every(isValidLayout)).toBe(true)
    expect(new Set(layouts.map(layoutKey)).size).toBe(30)
  })

  it('§2 면 배치는 주사위마다 다르다: 무작위 배치에서 마주 보는 면 쌍이 여러 가지로 나온다', () => {
    const pairs = new Set(LAYOUTS.map((l) => `${String(opposite(l, 1))}`))
    // 1의 맞은편이 ⧗ 하나로 고정되지 않는다
    expect(pairs.size).toBeGreaterThan(1)
  })
})

describe('§2 기준 배치 STANDARD_LAYOUT (v0.5: 위 1, 앞 2, 왼 3, 오른 4, 아래 ⧗, 뒤 5)', () => {
  it('마주 보는 면: 1↔⧗, 2↔5, 3↔4', () => {
    expect(opposite(S, 1)).toBe(TIME)
    expect(opposite(S, TIME)).toBe(1)
    expect(opposite(S, 2)).toBe(5)
    expect(opposite(S, 5)).toBe(2)
    expect(opposite(S, 3)).toBe(4)
    expect(opposite(S, 4)).toBe(3)
  })

  it('옆면은 윗면과 아랫면을 뺀 4개', () => {
    expect(sideFaces(S, 1).sort()).toEqual([2, 3, 4, 5])
    expect(sideFaces(S, 3)).toEqual(expect.arrayContaining([1, 2, 5, TIME]))
    expect(sideFaces(S, 3)).toHaveLength(4)
  })

  it('기준 방향의 모든 면', () => {
    expect(rightFace(S, CANONICAL)).toBe(4)
    expect(leftFace(S, CANONICAL)).toBe(3)
    expect(bottomFace(S, CANONICAL)).toBe(TIME)
    expect(backFace(S, CANONICAL)).toBe(5)
    expect(facesOf(S, CANONICAL)).toEqual({ top: 1, bottom: TIME, front: 2, back: 5, right: 4, left: 3 })
  })

  it('윗면과 같거나 마주 보는 면은 앞면이 될 수 없다', () => {
    expect(isValidOrientation(S, { top: 1, front: 1 })).toBe(false)
    expect(isValidOrientation(S, { top: 1, front: TIME })).toBe(false)
    expect(() => rightFace(S, { top: 2, front: 5 })).toThrow()
  })

  it('§9 굴리기: 기준 방향에서 각 방향으로 넘기면 반대쪽 옆면이 위로 온다', () => {
    expect(tip(S, CANONICAL, 'forward')).toEqual({ top: 5, front: 1 })
    expect(tip(S, CANONICAL, 'back')).toEqual({ top: 2, front: TIME })
    expect(tip(S, CANONICAL, 'right')).toEqual({ top: 3, front: 2 })
    expect(tip(S, CANONICAL, 'left')).toEqual({ top: 4, front: 2 })
  })

  it('§2 굴리기 예: 앞으로 굴리면 뒷면이 윗면이 되고, 옛 윗면은 앞면이 된다', () => {
    for (const o of allOrientations(S)) {
      const next = tip(S, o, 'forward')
      expect(next.top).toBe(backFace(S, o))
      expect(next.front).toBe(o.top)
    }
  })

  it('기준 배치에서는 1을 한 번 넘겨 ⧗을 꺼낼 수 없다 (1↔⧗이 마주 봄)', () => {
    for (const o of allOrientations(S).filter((x) => x.top === 1)) {
      for (const d of TIP_DIRECTIONS) expect(tip(S, o, d).top).not.toBe(TIME)
    }
  })
})

describe('§2 무작위 배치에서도 성립하는 주사위 성질', () => {
  it('배치마다 방향이 24가지이고 모두 다르며 유효하다', () => {
    for (const layout of LAYOUTS) {
      const all = allOrientations(layout)
      expect(all).toHaveLength(24)
      expect(new Set(all.map(key)).size).toBe(24)
      expect(all.every((o) => isValidOrientation(layout, o))).toBe(true)
    }
  })

  it('어떤 배치·방향에서도 여섯 면이 한 번씩 보인다', () => {
    for (const layout of LAYOUTS) {
      for (const o of allOrientations(layout)) {
        expect(new Set(Object.values(facesOf(layout, o))).size).toBe(6)
      }
    }
  })

  it('마주 보는 관계는 대칭이고 자기 자신이 아니다', () => {
    for (const layout of LAYOUTS) {
      for (const f of FACES) {
        expect(opposite(layout, f)).not.toBe(f)
        expect(opposite(layout, opposite(layout, f))).toBe(f)
      }
    }
  })

  it('기준 자세(배치 그대로)의 면이 배치 튜플과 같다', () => {
    for (const layout of LAYOUTS) {
      const [top, bottom, front, back, right, left] = layout
      expect(facesOf(layout, { top, front })).toEqual({ top, bottom, front, back, right, left })
    }
  })

  it('§9 넘긴 뒤에도 항상 유효한 방향이고, 윗면은 옛 옆면 중 하나', () => {
    for (const layout of LAYOUTS) {
      for (const o of allOrientations(layout)) {
        for (const d of TIP_DIRECTIONS) {
          const next = tip(layout, o, d)
          expect(isValidOrientation(layout, next)).toBe(true)
          expect(sideFaces(layout, o.top)).toContain(next.top)
        }
      }
    }
  })

  it('§9 넘기기는 실제 회전과 같다: 넘긴 방향의 면으로 윗면이 가고 반대쪽 옆면이 위로 온다', () => {
    for (const layout of LAYOUTS) {
      for (const o of allOrientations(layout)) {
        const b = facesOf(layout, o)
        const f = facesOf(layout, tip(layout, o, 'forward'))
        expect(f).toEqual({ top: b.back, bottom: b.front, front: b.top, back: b.bottom, right: b.right, left: b.left })
        const k = facesOf(layout, tip(layout, o, 'back'))
        expect(k).toEqual({ top: b.front, bottom: b.back, front: b.bottom, back: b.top, right: b.right, left: b.left })
        const l = facesOf(layout, tip(layout, o, 'left'))
        expect(l).toEqual({ top: b.right, bottom: b.left, front: b.front, back: b.back, right: b.bottom, left: b.top })
        const r = facesOf(layout, tip(layout, o, 'right'))
        expect(r).toEqual({ top: b.left, bottom: b.right, front: b.front, back: b.back, right: b.top, left: b.bottom })
      }
    }
  })

  it('§9 반대 방향으로 넘기면 원래대로 돌아온다 (forward 후 back = 원래 등 네 방향)', () => {
    for (const layout of LAYOUTS) {
      for (const o of allOrientations(layout)) {
        for (const d of TIP_DIRECTIONS) expect(tip(layout, tip(layout, o, d), INVERSE[d])).toEqual(o)
      }
    }
  })

  it('같은 방향으로 4번 넘기면 원래대로 돌아온다', () => {
    for (const layout of LAYOUTS) {
      for (const o of allOrientations(layout)) {
        for (const d of TIP_DIRECTIONS) {
          expect(tip(layout, tip(layout, tip(layout, tip(layout, o, d), d), d), d)).toEqual(o)
        }
      }
    }
  })

  it('넘기기만으로 24가지 방향에 모두 도달할 수 있다', () => {
    for (const layout of LAYOUTS) {
      const start = allOrientations(layout)[0] as Orientation
      const seen = new Set([key(start)])
      const queue = [start]
      while (queue.length > 0) {
        const o = queue.shift() as Orientation
        for (const d of TIP_DIRECTIONS) {
          const n = tip(layout, o, d)
          if (!seen.has(key(n))) {
            seen.add(key(n))
            queue.push(n)
          }
        }
      }
      expect(seen.size).toBe(24)
    }
  })

  it('§9 메모: ⧗을 90° 넘기면 ⧗은 옆면으로 가므로 다시 위로 오지 않는다 (모든 배치)', () => {
    for (const layout of allLayouts()) {
      for (const o of allOrientations(layout).filter((x) => x.top === TIME)) {
        for (const d of TIP_DIRECTIONS) expect(tip(layout, o, d).top).not.toBe(TIME)
      }
    }
  })

  it('잘못된 방향은 배치마다 판정한다: 같은 앞면도 배치에 따라 유효/무효가 갈린다', () => {
    // 기준 배치에서 1의 맞은편은 ⧗ → 무효, ONE_NEXT_TO_TIME에서는 ⧗이 옆면 → 유효
    expect(isValidOrientation(S, { top: 1, front: TIME })).toBe(false)
    expect(isValidOrientation(ONE_NEXT_TO_TIME, { top: 1, front: TIME })).toBe(true)
    expect(isValidOrientation(ONE_NEXT_TO_TIME, { top: 1, front: 2 })).toBe(false)
  })
})

describe('§3-2 주사위마다 면 배치가 달라 굴릴 방향을 그 주사위를 보고 판단', () => {
  it('1↔⧗이 마주 보지 않는 배치에서는 1을 한 번 넘겨 ⧗이 위로 올 수 있다', () => {
    const o: Orientation = { top: 1, front: TIME }
    // 뒤로 넘기면 앞면이 위로 온다
    expect(tip(ONE_NEXT_TO_TIME, o, 'back').top).toBe(TIME)
    // 같은 1 윗면이라도 기준 배치에서는 어느 방향으로도 ⧗이 나오지 않는다
    for (const so of allOrientations(S).filter((x) => x.top === 1)) {
      expect(TIP_DIRECTIONS.map((d) => tip(S, so, d).top)).not.toContain(TIME)
    }
  })

  it('1의 맞은편이 ⧗이 아닌 배치라면 윗면 1에서 ⧗이 나오는 방향이 반드시 하나 있다', () => {
    for (const layout of allLayouts().filter((l) => opposite(l, 1) !== TIME)) {
      for (const o of allOrientations(layout).filter((x) => x.top === 1)) {
        const tops = TIP_DIRECTIONS.map((d) => tip(layout, o, d).top)
        expect(tops.filter((t) => t === TIME)).toHaveLength(1)
      }
    }
  })
})

describe('§2 놓기 방향 (윗면 유지, 앞면만 선택)', () => {
  it('윗면은 그대로 두고 앞면을 옆면 중 하나로 바꾼다', () => {
    expect(withFront(S, CANONICAL, 4)).toEqual({ top: 1, front: 4 })
  })

  it('옆면이 아닌 면은 앞면으로 고를 수 없다', () => {
    expect(() => withFront(S, CANONICAL, TIME)).toThrow()
    expect(() => withFront(S, CANONICAL, 1)).toThrow()
  })

  it('고를 수 있는 앞면은 그 주사위 배치의 옆면이다', () => {
    for (const layout of LAYOUTS) {
      for (const top of FACES) {
        const o = { top, front: sideFaces(layout, top)[0] as Face }
        for (const f of sideFaces(layout, top)) expect(withFront(layout, o, f)).toEqual({ top, front: f })
        expect(() => withFront(layout, o, opposite(layout, top))).toThrow()
      }
    }
  })
})
