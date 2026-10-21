/**
 * 기본 점수 (§6 1차원, §7 2차원, §8 3차원)
 */
import { isTime, type Face } from './dice'
import { neighbors, pillarAt, topOf, type Cell } from './placement'
import { BOARD_COLS, BOARD_ROWS } from './setup'
import type { Board, Color, RolledDie } from './types'

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
export function scoreLine(board: Board): LineScore {
  const dice = lineDice(board)

  let colorRuns = 0
  let run = 1
  for (let i = 1; i <= dice.length; i++) {
    const prev = dice[i - 1]
    const cur = dice[i]
    if (prev && cur && prev.color === cur.color) {
      run++
    } else {
      colorRuns += COLOR_RUN_POINTS[run] ?? 0
      run = 1
    }
  }

  const steps = stepRuns(dice.map((d) => (d ? numberOf(d.orientation.top) : null))).reduce(
    (a, b) => a + b,
    0,
  )
  return { colorRuns, stepRuns: steps, total: colorRuns + steps }
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

export interface PlaneScore {
  regions: number
  neighborSteps: number
  total: number
}

/** §7 2차원 기본 점수: 크기 3 이상 영역 + 이웃 계단(윗면 1 차이) 쌍 */
export function scorePlane(board: Board): PlaneScore {
  const regions = colorRegions((c) => planeDie(board, c)?.color)
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
      const b = planeDie(board, n)
      if (!b) continue
      const x = numberOf(a.orientation.top)
      const y = numberOf(b.orientation.top)
      if (x != null && y != null && Math.abs(x - y) === 1) neighborSteps++
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
