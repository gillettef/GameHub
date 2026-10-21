import { sideFaces, type Face } from '../dice'
import { createBoard } from '../setup'
import type { Board, Color, RolledDie } from '../types'

let nextId = 1000

/** 테스트용 굴린 주사위. 앞면을 생략하면 가능한 옆면 중 첫 번째 */
export function die(color: Color, top: Face, front?: Face): RolledDie {
  return { id: nextId++, color, orientation: { top, front: front ?? (sideFaces(top)[0] as Face) } }
}

/** 칸 → 기둥(아래부터) 지정으로 보드 만들기. 키는 'row,col' */
export function board(pillars: Record<string, RolledDie[]>): Board {
  const b = createBoard()
  for (const [k, dice] of Object.entries(pillars)) {
    const [row, col] = k.split(',').map(Number) as [number, number]
    const r = b.cells[row]
    if (!r) throw new Error(k)
    r[col] = dice
  }
  return b
}

/** 선(1행) 5칸을 한 번에 */
export function line(...dice: RolledDie[]): Record<string, RolledDie[]> {
  return Object.fromEntries(dice.map((d, col) => [`0,${col}`, [d]]))
}
