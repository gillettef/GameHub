/**
 * 기본 점수 (§6 1차원, §7 2차원, §8 3차원, §9 4차원). v0.7: 라운드마다 같은 색 연결 하나만 센다.
 * 주사위의 색은 윗면의 색이고 ⧗ 윗면은 무색이라 연결을 끊는다 (§2 면의 색).
 */
import { colorsLink, type LawId } from './cards'
import { dieColor, isTime, type Face } from './dice'
import { neighbors, pillarAt, topOf, type Cell } from './placement'
import { BOARD_COLS, BOARD_ROWS } from './setup'
import { COLORS, type Board, type Color, type RolledDie } from './types'

/**
 * 1씩 오르거나 내리는 연속 구간 점수. ⧗(null)에서 끊긴다.
 * 방향이 바뀌는 지점의 칸은 앞뒤 구간에 모두 속한다. 예: 1-2-3-2-1 → 3칸 + 3칸.
 * @returns 3칸 이상인 구간의 칸 수 목록
 */
export function stepRuns(values: readonly (number | null)[]): number[] {
  const runs: number[] = []
  let length = 1
  let dir = 0
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1]
    const b = values[i]
    const step = a != null && b != null ? b - a : 0
    if (step === 1 || step === -1) {
      if (step === dir) {
        length++
      } else {
        if (length >= 3) runs.push(length)
        length = 2
        dir = step
      }
    } else {
      if (length >= 3) runs.push(length)
      length = 1
      dir = 0
    }
  }
  if (length >= 3) runs.push(length)
  return runs
}

function numberOf(face: Face): number | null {
  return isTime(face) ? null : face
}

/** 선 주사위(1행 1층) 5개. 아직 없는 칸은 undefined */
export function lineDice(board: Board): (RolledDie | undefined)[] {
  return Array.from({ length: BOARD_COLS }, (_, col) => pillarAt(board, { row: 0, col })[0])
}

/** 주사위의 색. 빈 칸이면 undefined, 윗면이 ⧗이어도 undefined */
const colorOf = (d: RolledDie | undefined): Color | undefined => (d ? dieColor(d) : undefined)

export interface LineScore {
  /** 가장 긴 같은 색 연속 칸 수 */
  longestRun: number
  /** 거울 우주: 좌우 대칭 칸이 같은 색인 쌍 수 (다른 우주에서는 0) */
  mirror: number
  total: number
}

/** 좌우 대칭 열 쌍 (1↔5열, 2↔4열) */
const MIRROR_COLS: readonly [number, number][] = [
  [0, 4],
  [1, 3],
]

/**
 * 거울 우주(§11-1): 주어진 행들에서 좌우 대칭 칸이 같은 색인 쌍 수. 다른 우주에서는 0.
 * 해석: 공허의 우주처럼 검정을 만능으로 보지 않는다 (색이 정확히 같아야 함)
 */
export function mirrorPairs(
  law: LawId,
  rows: readonly number[],
  dieAt: (cell: Cell) => RolledDie | undefined,
): number {
  if (law !== 'mirror') return 0
  let n = 0
  for (const row of rows) {
    for (const [a, b] of MIRROR_COLS) {
      const x = colorOf(dieAt({ row, col: a }))
      if (x !== undefined && x === colorOf(dieAt({ row, col: b }))) n++
    }
  }
  return n
}

/** §6 1차원 기본 점수: 선에서 가로로 이어진 같은 색 주사위 수의 최댓값 (1라운드 끝에 확정) */
export function scoreLine(board: Board, law: LawId = 'standard'): LineScore {
  const longestRun = Math.max(0, ...colorSegments(lineDice(board).map(colorOf), law))
  const mirror = mirrorPairs(law, [0], (c) => planeDie(board, c))
  return { longestRun, mirror, total: longestRun + mirror }
}

/**
 * 같은 색 연속 구간들의 길이 (빈 칸에서 끊김).
 * 공허의 우주(§11-1)에서는 검정이 모든 색과 이어지므로, 색마다 '그 색 또는 검정' 구간을 찾고
 * 다른 구간에 완전히 들어가는 구간은 뺀다. 해석: 검정 칸은 양쪽 구간에 모두 속할 수 있다.
 */
export function colorSegments(colors: readonly (Color | undefined)[], law: LawId = 'standard'): number[] {
  const segments: [number, number][] = []
  for (const color of COLORS) {
    let start = -1
    let hasColor = false
    for (let i = 0; i <= colors.length; i++) {
      const c = colors[i]
      const fits = c !== undefined && (color === 'black' ? c === 'black' : colorsLink(c, color, law))
      if (fits) {
        if (start === -1) start = i
        if (c === color) hasColor = true
      } else {
        if (start !== -1 && hasColor) segments.push([start, i - 1])
        start = -1
        hasColor = false
      }
    }
  }
  return segments
    .filter(([a, b]) => !segments.some(([c, d]) => c <= a && d >= b && (c !== a || d !== b)))
    .map(([a, b]) => b - a + 1)
}

/** 평면 주사위(모든 칸의 1층) */
function planeDie(board: Board, cell: Cell): RolledDie | undefined {
  return pillarAt(board, cell)[0]
}

function allCells(): Cell[] {
  const out: Cell[] = []
  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) out.push({ row, col })
  }
  return out
}

const key = (c: Cell) => `${c.row},${c.col}`

/** 같은 색으로 변이 이어진 영역들의 크기 */
function colorRegions(colorAt: (cell: Cell) => Color | undefined): number[] {
  const seen = new Set<string>()
  const sizes: number[] = []
  for (const start of allCells()) {
    const color = colorAt(start)
    if (!color || seen.has(key(start))) continue
    let size = 0
    const stack = [start]
    seen.add(key(start))
    while (stack.length > 0) {
      const cell = stack.pop() as Cell
      size++
      for (const n of neighbors(cell)) {
        if (!seen.has(key(n)) && colorAt(n) === color) {
          seen.add(key(n))
          stack.push(n)
        }
      }
    }
    sizes.push(size)
  }
  return sizes
}

/**
 * 평면의 같은 색 영역 크기들.
 * 공허의 우주: 색마다 '그 색 또는 검정'으로 이어진 무리(그 색이 하나 이상 있는 것)를 영역으로 보고,
 * 다른 색과 맞닿지 않은 검정만의 무리도 영역으로 센다. 해석: 검정 칸은 여러 색 영역에 함께 속할 수 있다.
 */
export function planeRegions(board: Board, law: LawId = 'standard'): number[] {
  return regionsWithLaw((c) => colorOf(planeDie(board, c)), law)
}

/** 칸마다 정해진 색으로 같은 색 영역 크기들을 센다 (공허의 우주 반영, planeRegions 설명 참고) */
function regionsWithLaw(colorAt: (cell: Cell) => Color | undefined, law: LawId): number[] {
  if (law !== 'void') return colorRegions(colorAt)
  const out: number[] = []
  for (const color of COLORS) {
    if (color === 'black') continue
    const seen = new Set<string>()
    for (const start of allCells()) {
      if (colorAt(start) !== color || seen.has(key(start))) continue
      let size = 0
      const stack = [start]
      seen.add(key(start))
      while (stack.length > 0) {
        const cell = stack.pop() as Cell
        size++
        for (const n of neighbors(cell)) {
          const c = colorAt(n)
          if (!seen.has(key(n)) && c !== undefined && colorsLink(c, color, law)) {
            seen.add(key(n))
            stack.push(n)
          }
        }
      }
      out.push(size)
    }
  }
  // 다른 색과 맞닿지 않은 검정 무리
  const seen = new Set<string>()
  for (const start of allCells()) {
    if (colorAt(start) !== 'black' || seen.has(key(start))) continue
    let size = 0
    let touches = false
    const stack = [start]
    seen.add(key(start))
    while (stack.length > 0) {
      const cell = stack.pop() as Cell
      size++
      for (const n of neighbors(cell)) {
        const c = colorAt(n)
        if (c === 'black' && !seen.has(key(n))) {
          seen.add(key(n))
          stack.push(n)
        } else if (c !== undefined && c !== 'black') touches = true
      }
    }
    if (!touches) out.push(size)
  }
  return out
}

export interface PlaneScore {
  /** 가장 넓은 같은 색 영역의 크기 */
  largestRegion: number
  /** 거울 우주: 2·3행 평면 주사위의 대칭 같은 색 쌍 수 */
  mirror: number
  total: number
}

/** §7 2차원 기본 점수: 선을 포함한 평면에서 가장 큰 같은 색 영역의 크기 (2라운드 끝에 확정) */
export function scorePlane(board: Board, law: LawId = 'standard'): PlaneScore {
  const largestRegion = Math.max(0, ...planeRegions(board, law))
  const mirror = mirrorPairs(law, [1, 2], (c) => planeDie(board, c))
  return { largestRegion, mirror, total: largestRegion + mirror }
}

/**
 * 이웃 계단 쌍 수: 변으로 맞닿은 두 평면 주사위의 윗면이 1 차이.
 * 선(1행) 안의 가로 쌍은 빼고 2·3행 주사위가 들어간 쌍만 센다. (v0.7부터 점수가 아니라 목표 '계단 사슬'에만 씀)
 */
export function neighborSteps(board: Board): number {
  let count = 0
  for (const cell of allCells()) {
    const a = planeDie(board, cell)
    if (!a) continue
    // 오른쪽과 뒤쪽 이웃만 세어 쌍을 한 번씩만 센다
    for (const n of [
      { row: cell.row + 1, col: cell.col },
      { row: cell.row, col: cell.col + 1 },
    ]) {
      if (n.row >= BOARD_ROWS || n.col >= BOARD_COLS) continue
      if (cell.row === 0 && n.row === 0) continue
      const b = planeDie(board, n)
      if (!b) continue
      const x = numberOf(a.orientation.top)
      const y = numberOf(b.orientation.top)
      if (x != null && y != null && Math.abs(x - y) === 1) count++
    }
  }
  return count
}

/** 맨 앞줄 5개 기둥 꼭대기의 앞면 (왼쪽부터). v0.7부터 목표 '숫자 계단'에만 씀 */
export function frontFaces(board: Board): (Face | undefined)[] {
  return Array.from({ length: BOARD_COLS }, (_, col) => topOf(pillarAt(board, { row: 0, col }))?.orientation.front)
}

export interface TowerScore {
  /** 한 기둥 안 가장 높은 같은 색 세로 연속 */
  tallestRun: number
  /** 거울 우주: 모든 행 꼭대기의 대칭 같은 색 쌍 수 */
  mirror: number
  total: number
}

/** §8 3차원 기본 점수: 한 기둥 안에서 위아래로 이어진 같은 색 주사위 수(1층 포함)의 최댓값 (3라운드 끝에 확정) */
export function scoreTower(board: Board, law: LawId = 'standard'): TowerScore {
  const tallestRun = Math.max(
    0,
    ...allCells().flatMap((c) => colorSegments(pillarAt(board, c).map(colorOf), law)),
  )
  const mirror = mirrorPairs(law, [0, 1, 2], (c) => topOf(pillarAt(board, c)))
  return { tallestRun, mirror, total: tallestRun + mirror }
}

/** 꼭대기 지도의 같은 색 영역 크기들: 위에서 내려다본 각 칸의 맨 위 주사위 색 (진공·⧗ 꼭대기는 끊김) */
export function topRegions(board: Board, law: LawId = 'standard'): number[] {
  return regionsWithLaw((c) => colorOf(topOf(pillarAt(board, c))), law)
}

export interface TimeScore {
  /** 가장 넓은 같은 색 꼭대기 영역의 크기 */
  largestRegion: number
  total: number
}

/** §9 4차원 기본 점수: 가장 넓은 같은 색 꼭대기 영역의 크기 (4라운드 끝에 확정). 기둥 높이는 따지지 않는다 */
export function scoreTops(board: Board, law: LawId = 'standard'): TimeScore {
  const largestRegion = Math.max(0, ...topRegions(board, law))
  return { largestRegion, total: largestRegion }
}
