import { allOrientations, COLORS, facesOf, FACES, isTime, sideFaces, STANDARD_LAYOUT, type DieLayout, type Face, type FaceColors } from '../dice'
import { applyAction } from '../game'
import { createBoard, createGame } from '../setup'
import type { Board, Color, GameConfig, GameState, RolledDie } from '../types'

let nextId = 1000

/** face 면이 color인 숫자 면 색 배치. 나머지 면은 남은 색을 COLORS 순서대로. ⧗이면 color를 1의 면에 */
export function colorsWith(color: Color, face: Face): FaceColors {
  const rest = COLORS.filter((c) => c !== color)
  rest.splice(isTime(face) ? 0 : face - 1, 0, color)
  return rest as unknown as FaceColors
}

/**
 * 테스트용 굴린 주사위. 윗면의 색이 color가 되게 면 색을 정한다 (윗면이 ⧗이면 주사위는 무색).
 * 앞면을 생략하면 가능한 옆면 중 첫 번째. 배치를 생략하면 STANDARD_LAYOUT
 */
export function die(color: Color, top: Face, front?: Face, layout: DieLayout = STANDARD_LAYOUT): RolledDie {
  return {
    id: nextId++,
    colors: colorsWith(color, top),
    layout,
    orientation: { top, front: front ?? (sideFaces(layout, top)[0] as Face) },
  }
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

/**
 * 게임을 만들고 모두 개인 목표를 골라(받은 2장 중 첫 장) 1라운드로 넘긴 상태 (§5-3).
 * 법칙을 주지 않으면 표준 우주로 고정한다 (법칙에 따라 결과가 달라지는 테스트를 막기 위해).
 */
export function startGame(config: GameConfig): GameState {
  let s = createGame({ law: 'standard', ...config })
  for (const p of s.players) {
    s = applyAction(s, { type: 'choosePersonalGoal', player: p.id, goal: p.personalOffer[0] as NonNullable<typeof p.personalGoal> })
  }
  return s
}
