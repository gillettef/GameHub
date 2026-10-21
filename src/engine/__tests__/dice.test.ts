import { describe, expect, it } from 'vitest'
import {
  ALL_ORIENTATIONS,
  backFace,
  bottomFace,
  faceValue,
  FACES,
  isValidOrientation,
  leftFace,
  opposite,
  rightFace,
  sideFaces,
  TIME,
  tip,
  TIP_DIRECTIONS,
  withFront,
  type Orientation,
  type TipDirection,
} from '../dice'

const key = (o: Orientation) => `${String(o.top)}/${String(o.front)}`
const CANONICAL: Orientation = { top: 1, front: 2 }

describe('§2 전용 주사위 면 구성', () => {
  it('면은 1~5와 ⧗ 여섯 개', () => {
    expect(FACES).toEqual([1, 2, 3, 4, 5, TIME])
  })

  it('마주 보는 면: 1↔⧗, 2↔5, 3↔4', () => {
    expect(opposite(1)).toBe(TIME)
    expect(opposite(TIME)).toBe(1)
    expect(opposite(2)).toBe(5)
    expect(opposite(5)).toBe(2)
    expect(opposite(3)).toBe(4)
    expect(opposite(4)).toBe(3)
  })

  it('⧗은 합계에서 0', () => {
    expect(faceValue(TIME)).toBe(0)
    expect(faceValue(5)).toBe(5)
  })

  it('옆면은 윗면과 아랫면을 뺀 4개', () => {
    expect(sideFaces(1).sort()).toEqual([2, 3, 4, 5])
    expect(sideFaces(3)).toEqual(expect.arrayContaining([1, 2, 5, TIME]))
    expect(sideFaces(3)).toHaveLength(4)
  })
})

describe('§2 기준 배치 (전개도: 위 1, 앞 2, 왼 3, 오른 4, 아래 ⧗, 뒤 5)', () => {
  it('기준 방향의 모든 면', () => {
    expect(rightFace(CANONICAL)).toBe(4)
    expect(leftFace(CANONICAL)).toBe(3)
    expect(bottomFace(CANONICAL)).toBe(TIME)
    expect(backFace(CANONICAL)).toBe(5)
  })

  it('방향이 24가지이고 모두 다르며 유효하다', () => {
    expect(ALL_ORIENTATIONS).toHaveLength(24)
    expect(new Set(ALL_ORIENTATIONS.map(key)).size).toBe(24)
    expect(ALL_ORIENTATIONS.every(isValidOrientation)).toBe(true)
  })

  it('어떤 방향에서도 여섯 면이 한 번씩 보인다', () => {
    for (const o of ALL_ORIENTATIONS) {
      const all = [o.top, o.front, rightFace(o), leftFace(o), bottomFace(o), backFace(o)]
      expect(new Set(all).size).toBe(6)
    }
  })

  it('윗면과 같거나 마주 보는 면은 앞면이 될 수 없다', () => {
    expect(isValidOrientation({ top: 1, front: 1 })).toBe(false)
    expect(isValidOrientation({ top: 1, front: TIME })).toBe(false)
    expect(() => rightFace({ top: 2, front: 5 })).toThrow()
  })
})

describe('§9 ③ 돌리기 (90° 눕히기)', () => {
  it('기준 방향에서 각 방향으로 돌리면 그 반대쪽 옆면이 위로 온다', () => {
    expect(tip(CANONICAL, 'forward')).toEqual({ top: 5, front: 1 })
    expect(tip(CANONICAL, 'back')).toEqual({ top: 2, front: TIME })
    expect(tip(CANONICAL, 'right')).toEqual({ top: 3, front: 2 })
    expect(tip(CANONICAL, 'left')).toEqual({ top: 4, front: 2 })
  })

  it('돌린 뒤에도 항상 유효한 방향이다', () => {
    for (const o of ALL_ORIENTATIONS) {
      for (const d of TIP_DIRECTIONS) expect(isValidOrientation(tip(o, d))).toBe(true)
    }
  })

  it('반대 방향으로 돌리면 원래대로 돌아온다', () => {
    const inverse: Record<TipDirection, TipDirection> = {
      forward: 'back',
      back: 'forward',
      left: 'right',
      right: 'left',
    }
    for (const o of ALL_ORIENTATIONS) {
      for (const d of TIP_DIRECTIONS) expect(tip(tip(o, d), inverse[d])).toEqual(o)
    }
  })

  it('같은 방향으로 4번 돌리면 원래대로 돌아온다', () => {
    for (const o of ALL_ORIENTATIONS) {
      for (const d of TIP_DIRECTIONS) {
        expect(tip(tip(tip(tip(o, d), d), d), d)).toEqual(o)
      }
    }
  })

  it('한 번 돌리면 윗면은 반드시 옛 옆면 중 하나가 된다 (반대면으로 바로 갈 수 없음)', () => {
    for (const o of ALL_ORIENTATIONS) {
      for (const d of TIP_DIRECTIONS) expect(sideFaces(o.top)).toContain(tip(o, d).top)
    }
  })

  it('§3-2 1을 한 번 돌려 ⧗을 꺼낼 수는 없다', () => {
    for (const o of ALL_ORIENTATIONS.filter((x) => x.top === 1)) {
      for (const d of TIP_DIRECTIONS) expect(tip(o, d).top).not.toBe(TIME)
    }
  })

  it('돌리기만으로 24가지 방향에 모두 도달할 수 있다', () => {
    const seen = new Set([key(CANONICAL)])
    const queue = [CANONICAL]
    while (queue.length > 0) {
      const o = queue.shift() as Orientation
      for (const d of TIP_DIRECTIONS) {
        const n = tip(o, d)
        if (!seen.has(key(n))) {
          seen.add(key(n))
          queue.push(n)
        }
      }
    }
    expect(seen.size).toBe(24)
  })
})

describe('§2 놓기 방향 (윗면 유지, 앞면만 선택)', () => {
  it('윗면은 그대로 두고 앞면을 옆면 중 하나로 바꾼다', () => {
    expect(withFront(CANONICAL, 4)).toEqual({ top: 1, front: 4 })
  })

  it('옆면이 아닌 면은 앞면으로 고를 수 없다', () => {
    expect(() => withFront(CANONICAL, TIME)).toThrow()
    expect(() => withFront(CANONICAL, 1)).toThrow()
  })
})
