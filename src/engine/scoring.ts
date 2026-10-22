/**
 * 기본 점수 (§6 1차원, §7 2차원, §8 3차원)
 */
import { colorsLink, type LawId } from './cards'
import { isTime, type Face } from './dice'
import { neighbors, pillarAt, topOf, type Cell } from './placement'
import { BOARD_COLS, BOARD_ROWS } from './setup'
import { COLORS, type Board, type Color, type RolledDie } from './types'

/** §6 같은 색 연속 2 / 3 / 4 / 5칸 */
const COLOR_RUN_POINTS: Record<number, number> = { 2: 1, 3: 3, 4: 6, 5: 10 }

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

export interface LineScore {
  colorRuns: number
  stepRuns: number
  total: number
}

/** §6 1차원 기본 점수 (최종 선 기준) */
export function scoreLine(board: Board, law: LawId = 'standard'): LineScore {
  const dice = lineDice(board)
  const colorRuns = colorSegments(
    dice.map((d) => d?.color),
    law,
  )
    .map((n) => COLOR_RUN_POINTS[n] ?? 0)
    .reduce((a, b) => a + b, 0)

  const steps = stepRuns(dice.map((d) => (d ? numberOf(d.orientation.top) : null))).reduce(
    (a, b) => a + b,
    0,
  )
  return { colorRuns, stepRuns: steps, total: colorRuns + steps }
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
  const colorAt = (c: Cell) => planeDie(board, c)?.color
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
  regions: number
  neighborSteps: number
  total: number
}

/**
 * §7 2차원 기본 점수: 크기 3 이상 영역 + 이웃 계단(윗면 1 차이) 쌍.
 * 이웃 계단은 선(1행) 안의 가로 쌍을 빼고, 2·3행 주사위가 들어간 쌍만 센다.
 */
export function scorePlane(board: Board, law: LawId = 'standard'): PlaneScore {
  const regions = planeRegions(board, law)
    .filter((size) => size >= 3)
    .reduce((a, b) => a + b, 0)

  let neighborSteps = 0
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
      // §11-1 거울 우주: 1 차이 대신 같은 숫자
      if (x != null && y != null && (law === 'mirror' ? x === y : Math.abs(x - y) === 1)) neighborSteps++
    }
  }
  return { regions, neighborSteps, total: regions + neighborSteps }
}

/** §8 높은 기둥: 3 / 4 / 5 / 6층 이상 */
export function pillarHeightPoints(height: number): number {
  if (height >= 6) return 15
  if (height === 5) return 10
  if (height === 4) return 6
  if (height === 3) return 3
  return 0
}

export interface TowerScore {
  pillars: number
  frontLine: number
  total: number
}

/** 맨 앞줄 5개 기둥 꼭대기의 앞면 (왼쪽부터) */
export function frontFaces(board: Board): (Face | undefined)[] {
  return Array.from({ length: BOARD_COLS }, (_, col) => topOf(pillarAt(board, { row: 0, col }))?.orientation.front)
}

/** §8 3차원 기본 점수 (최종 탑 기준) */
export function scoreTower(board: Board): TowerScore {
  const pillars = allCells()
    .map((c) => pillarHeightPoints(pillarAt(board, c).length))
    .reduce((a, b) => a + b, 0)
  const frontLine =
    stepRuns(frontFaces(board).map((f) => (f === undefined ? null : numberOf(f)))).reduce(
      (a, b) => a + b,
      0,
    ) * 2
  return { pillars, frontLine, total: pillars + frontLine }
}
