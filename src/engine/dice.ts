/**
 * 전용 주사위 모델 (docs/rule.md §2)
 *
 * 면: 1, 2, 3, 4, 5, ⧗(time). 마주 보는 면: 1↔⧗, 2↔5, 3↔4.
 * 방향은 윗면 + 앞면으로 표현한다. 나머지 면은 모두 여기서 계산한다.
 *
 * 기준 배치는 규칙서 §2의 전개도를 따른다.
 *   윗면 1, 앞면 2, 왼면 3, 오른면 4, 아랫면 ⧗, 뒷면 5
 */

export const TIME = 'time' as const

export type NumberFace = 1 | 2 | 3 | 4 | 5
export type Face = NumberFace | typeof TIME

export const FACES: readonly Face[] = [1, 2, 3, 4, 5, TIME]

export interface Orientation {
  top: Face
  front: Face
}

/** 돌리기 방향. forward = 플레이어(앞면) 쪽으로 눕히기 */
export type TipDirection = 'forward' | 'back' | 'left' | 'right'

export const TIP_DIRECTIONS: readonly TipDirection[] = ['forward', 'back', 'left', 'right']

type Vec = readonly [number, number, number]

// 기준 배치에서 각 면의 바깥 법선. x = 오른쪽, y = 앞(플레이어 쪽), z = 위
const NORMAL: Record<string, Vec> = {
  1: [0, 0, 1],
  [TIME]: [0, 0, -1],
  2: [0, 1, 0],
  5: [0, -1, 0],
  4: [1, 0, 0],
  3: [-1, 0, 0],
}

const OPPOSITE: Record<string, Face> = {
  1: TIME,
  [TIME]: 1,
  2: 5,
  5: 2,
  3: 4,
  4: 3,
}

export function isTime(face: Face): face is typeof TIME {
  return face === TIME
}

export function opposite(face: Face): Face {
  return OPPOSITE[face] as Face
}

/** 숫자 값. ⧗은 0 (합계 계산용, §2) */
export function faceValue(face: Face): number {
  return isTime(face) ? 0 : face
}

/** 윗면이 top일 때 옆면이 될 수 있는 4개 면 */
export function sideFaces(top: Face): Face[] {
  const bottom = opposite(top)
  return FACES.filter((f) => f !== top && f !== bottom)
}

export function isValidOrientation(o: Orientation): boolean {
  return FACES.includes(o.top) && sideFaces(o.top).includes(o.front)
}

function assertValid(o: Orientation): void {
  if (!isValidOrientation(o)) {
    throw new Error(`잘못된 주사위 방향: 윗면 ${String(o.top)}, 앞면 ${String(o.front)}`)
  }
}

function faceAt(normal: Vec): Face {
  const found = FACES.find((f) => {
    const n = NORMAL[f] as Vec
    return n[0] === normal[0] && n[1] === normal[1] && n[2] === normal[2]
  })
  if (found === undefined) throw new Error('법선에 해당하는 면이 없습니다.')
  return found
}

function cross(a: Vec, b: Vec): Vec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** 오른면. 기준 배치에서 오른쪽 = 앞 × 위 이고, 회전은 외적을 보존한다. */
export function rightFace(o: Orientation): Face {
  assertValid(o)
  return faceAt(cross(NORMAL[o.front] as Vec, NORMAL[o.top] as Vec))
}

export function leftFace(o: Orientation): Face {
  return opposite(rightFace(o))
}

export function bottomFace(o: Orientation): Face {
  assertValid(o)
  return opposite(o.top)
}

export function backFace(o: Orientation): Face {
  assertValid(o)
  return opposite(o.front)
}

/** 90° 돌리기 (§9 ③). 윗면이 그 방향의 옆면 쪽으로 넘어간다. */
export function tip(o: Orientation, direction: TipDirection): Orientation {
  assertValid(o)
  switch (direction) {
    case 'forward':
      return { top: backFace(o), front: o.top }
    case 'back':
      return { top: o.front, front: bottomFace(o) }
    case 'right':
      return { top: leftFace(o), front: o.front }
    case 'left':
      return { top: rightFace(o), front: o.front }
  }
}

/** 윗면을 유지한 채 수평으로 돌려 앞면을 정한다 (1~3라운드 놓기 방향, §2) */
export function withFront(o: Orientation, front: Face): Orientation {
  const next = { top: o.top, front }
  assertValid(next)
  return next
}

/** 가능한 24가지 방향 전부 (굴림 결과 후보) */
export const ALL_ORIENTATIONS: readonly Orientation[] = FACES.flatMap((top) =>
  sideFaces(top).map((front) => ({ top, front })),
)
