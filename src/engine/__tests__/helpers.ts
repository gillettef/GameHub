import { allOrientations, facesOf, FACES, sideFaces, STANDARD_LAYOUT, type DieLayout, type Face } from '../dice'
import { createBoard } from '../setup'
import type { Board, Color, RolledDie } from '../types'

let nextId = 1000

/** 테스트용 굴린 주사위. 앞면을 생략하면 가능한 옆면 중 첫 번째. 배치를 생략하면 STANDARD_LAYOUT */
export function die(color: Color, top: Face, front?: Face, layout: DieLayout = STANDARD_LAYOUT): RolledDie {
  return { id: nextId++, color, layout, orientation: { top, front: front ?? (sideFaces(layout, top)[0] as Face) } }
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

/**
 * 회전으로 겹치는 배치를 하나로 보는 대표 키 (§2: 30가지).
 * 24방향에서 보이는 여섯 면 [위, 아래, 앞, 뒤, 오른, 왼] 중 사전순으로 가장 앞선 것.
 */
export function layoutKey(layout: DieLayout): string {
  return allOrientations(layout)
    .map((o) => {
      const f = facesOf(layout, o)
      return [f.top, f.bottom, f.front, f.back, f.right, f.left].map(String).join('')
    })
    .sort()[0] as string
}

/** 여섯 면의 모든 순열 720가지 (배치 자리에 넣는 모든 경우) */
export function allLayouts(): DieLayout[] {
  const out: DieLayout[] = []
  const walk = (prefix: Face[], rest: Face[]) => {
    if (rest.length === 0) {
      out.push(prefix as unknown as DieLayout)
      return
    }
    rest.forEach((f, i) => walk([...prefix, f], rest.filter((_, j) => j !== i)))
  }
  walk([], [...FACES])
  return out
}
