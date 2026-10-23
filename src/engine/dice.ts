/**
 * 전용 주사위 모델 (docs/rule.md §2)
 *
 * 면: 1, 2, 3, 4, 5, ⧗(time). 면 배치는 주사위마다 다르다 (v0.6).
 * 배치(DieLayout)는 기준 자세에서 위·아래·앞·뒤·오른·왼 자리에 있는 면을 적은 것이다.
 * 방향은 윗면 + 앞면으로 표현하고, 나머지 면은 모두 배치와 함께 여기서 계산한다.
 */

export const TIME = 'time' as const

export type NumberFace = 1 | 2 | 3 | 4 | 5
export type Face = NumberFace | typeof TIME

export const FACES: readonly Face[] = [1, 2, 3, 4, 5, TIME]

export interface Orientation {
  top: Face
  front: Face
}

/**
 * 면 배치: 기준 자세에서 [위, 아래, 앞, 뒤, 오른, 왼] 자리의 면.
 * 여섯 면이 한 번씩 들어간다. 회전으로 겹치는 배치를 하나로 치면 30가지 (§2).
 */
export type DieLayout = readonly [Face, Face, Face, Face, Face, Face]

/** v0.5까지의 공통 배치 (위 1, 아래 ⧗, 앞 2, 뒤 5, 오른 4, 왼 3). 테스트 기준용 */
export const STANDARD_LAYOUT: DieLayout = [1, TIME, 2, 5, 4, 3]

/** 넘기기 방향. forward = 플레이어(앞면, 1행) 쪽으로 넘기기 */
export type TipDirection = 'forward' | 'back' | 'left' | 'right'

export const TIP_DIRECTIONS: readonly TipDirection[] = ['forward', 'back', 'left', 'right']

type Vec = readonly [number, number, number]

// 배치 자리별 바깥 법선. x = 오른쪽, y = 앞(플레이어 쪽), z = 위
const SLOT_NORMALS: readonly Vec[] = [
  [0, 0, 1],
  [0, 0, -1],
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0],
]

export function isTime(face: Face): face is typeof TIME {
  return face === TIME
}

/** 여섯 면이 한 번씩 들어간 배치인지 */
export function isValidLayout(layout: readonly Face[]): layout is DieLayout {
  return layout.length === 6 && FACES.every((f) => layout.includes(f))
}

function normalOf(layout: DieLayout, face: Face): Vec {
  const n = SLOT_NORMALS[layout.indexOf(face)]
  if (!n) throw new Error(`배치에 없는 면: ${String(face)}`)
  return n
}

function faceAt(layout: DieLayout, normal: Vec): Face {
  const i = SLOT_NORMALS.findIndex((n) => n[0] === normal[0] && n[1] === normal[1] && n[2] === normal[2])
  const face = layout[i]
  if (face === undefined) throw new Error('법선에 해당하는 면이 없습니다.')
  return face
}

function negate(v: Vec): Vec {
  return [-v[0], -v[1], -v[2]]
}

function cross(a: Vec, b: Vec): Vec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** 이 배치에서 마주 보는 면 */
export function opposite(layout: DieLayout, face: Face): Face {
  return faceAt(layout, negate(normalOf(layout, face)))
}

/** 숫자 값. ⧗은 0 (합계 계산용, §2) */
export function faceValue(face: Face): number {
  return isTime(face) ? 0 : face
}

/** 윗면이 top일 때 옆면이 될 수 있는 4개 면 */
export function sideFaces(layout: DieLayout, top: Face): Face[] {
  const bottom = opposite(layout, top)
  return FACES.filter((f) => f !== top && f !== bottom)
}

export function isValidOrientation(layout: DieLayout, o: Orientation): boolean {
  return FACES.includes(o.top) && sideFaces(layout, o.top).includes(o.front)
}

function assertValid(layout: DieLayout, o: Orientation): void {
  if (!isValidOrientation(layout, o)) {
    throw new Error(`잘못된 주사위 방향: 윗면 ${String(o.top)}, 앞면 ${String(o.front)}`)
  }
}

/** 오른면. 기준 자세에서 오른쪽 = 앞 × 위 이고, 회전은 외적을 보존한다. */
export function rightFace(layout: DieLayout, o: Orientation): Face {
  assertValid(layout, o)
  return faceAt(layout, cross(normalOf(layout, o.front), normalOf(layout, o.top)))
}

export function leftFace(layout: DieLayout, o: Orientation): Face {
  return opposite(layout, rightFace(layout, o))
}

export function bottomFace(layout: DieLayout, o: Orientation): Face {
  assertValid(layout, o)
  return opposite(layout, o.top)
}

export function backFace(layout: DieLayout, o: Orientation): Face {
  assertValid(layout, o)
  return opposite(layout, o.front)
}

/** 90° 넘기기 (§9). 윗면이 그 방향의 옆면 쪽으로 넘어가고 반대쪽 옆면이 위로 온다. */
export function tip(layout: DieLayout, o: Orientation, direction: TipDirection): Orientation {
  assertValid(layout, o)
  switch (direction) {
    case 'forward':
      return { top: backFace(layout, o), front: o.top }
    case 'back':
      return { top: o.front, front: bottomFace(layout, o) }
    case 'right':
      return { top: leftFace(layout, o), front: o.front }
    case 'left':
      return { top: rightFace(layout, o), front: o.front }
  }
}

/** 윗면을 유지한 채 수평으로 돌려 앞면을 정한다 (1~3라운드 놓기 방향, §2) */
export function withFront(layout: DieLayout, o: Orientation, front: Face): Orientation {
  const next = { top: o.top, front }
  assertValid(layout, next)
  return next
}

/**
 * 윗면을 축으로 수평으로 한 바퀴 돌 때 앞에 오는 면 순서: 앞 → 오른 → 뒤 → 왼.
 * 주사위를 왼쪽으로 90° 돌릴 때마다 다음 면이 앞으로 온다 (화면의 3D 주사위 돌리기용).
 */
export function turnOrder(layout: DieLayout, o: Orientation): Face[] {
  return [o.front, rightFace(layout, o), backFace(layout, o), leftFace(layout, o)]
}

/** 이 배치로 가능한 24가지 방향 전부 (굴림 결과 후보) */
export function allOrientations(layout: DieLayout): Orientation[] {
  return FACES.flatMap((top) => sideFaces(layout, top).map((front) => ({ top, front })))
}

/** 화면 표시용: 이 방향에서 보이는 여섯 면 */
export function facesOf(
  layout: DieLayout,
  o: Orientation,
): { top: Face; bottom: Face; front: Face; back: Face; right: Face; left: Face } {
  return {
    top: o.top,
    bottom: bottomFace(layout, o),
    front: o.front,
    back: backFace(layout, o),
    right: rightFace(layout, o),
    left: leftFace(layout, o),
  }
}
