/**
 * 1~3라운드 배치 규칙 (§6, §7, §8)
 */
import { faceValue, isTime, type Face } from './dice'
import { BOARD_COLS, BOARD_ROWS } from './setup'
import type { Board, Pillar, RolledDie, Round } from './types'

export interface Cell {
  row: number
  col: number
}

/** §6 첫 주사위는 가운데 칸(3번) */
export const LINE_START_COL = 2

export function pillarAt(board: Board, { row, col }: Cell): Pillar {
  const pillar = board.cells[row]?.[col]
  if (!pillar) throw new Error(`보드 밖 칸: (${row}, ${col})`)
  return pillar
}

export function topOf(pillar: Pillar): RolledDie | undefined {
  return pillar[pillar.length - 1]
}

function inBoard({ row, col }: Cell): boolean {
  return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS
}

export function neighbors({ row, col }: Cell): Cell[] {
  return [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ].filter(inBoard)
}

/**
 * §8 쌓기 규칙: 올리는 윗면이 아래 윗면보다 큰 숫자.
 * ⧗은 어디 위에든 올릴 수 있고, ⧗ 위에는 무엇이든 올릴 수 있다.
 */
export function canStackOn(below: Face, top: Face): boolean {
  if (isTime(top) || isTime(below)) return true
  return faceValue(top) > faceValue(below)
}

/** §6 1라운드: 첫 주사위는 3번 칸, 그다음은 현재 선의 왼쪽 끝 또는 오른쪽 끝 */
function lineCells(board: Board): Cell[] {
  const filled: number[] = []
  for (let col = 0; col < BOARD_COLS; col++) {
    if (pillarAt(board, { row: 0, col }).length > 0) filled.push(col)
  }
  if (filled.length === 0) return [{ row: 0, col: LINE_START_COL }]
  const min = Math.min(...filled)
  const max = Math.max(...filled)
  return [min - 1, max + 1].filter((col) => col >= 0 && col < BOARD_COLS).map((col) => ({ row: 0, col }))
}

/** §7 2라운드: 2·3행의 빈 칸 중 이미 놓인 주사위와 변으로 맞닿는 칸 */
function planeCells(board: Board): Cell[] {
  const out: Cell[] = []
  for (let row = 1; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      const cell = { row, col }
      if (pillarAt(board, cell).length > 0) continue
      if (neighbors(cell).some((n) => pillarAt(board, n).length > 0)) out.push(cell)
    }
  }
  return out
}

/** §8 3라운드: 기둥 꼭대기에 쌓기 규칙을 지켜 올릴 수 있는 칸 (진공 제외) */
function towerCells(board: Board, top: Face): Cell[] {
  const out: Cell[] = []
  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      const below = topOf(pillarAt(board, { row, col }))
      if (below && canStackOn(below.orientation.top, top)) out.push({ row, col })
    }
  }
  return out
}

/** 이 주사위를 지금 놓을 수 있는 칸 목록 */
export function legalCells(board: Board, round: Round, die: RolledDie): Cell[] {
  switch (round) {
    case 1:
      return lineCells(board)
    case 2:
      return planeCells(board)
    case 3:
      return towerCells(board, die.orientation.top)
    case 4:
      return []
  }
}

export function isLegalCell(board: Board, round: Round, die: RolledDie, cell: Cell): boolean {
  return legalCells(board, round, die).some((c) => c.row === cell.row && c.col === cell.col)
}
