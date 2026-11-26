/** 화면 계산 도우미(컴포넌트가 아닌 것) */
import type { CSSProperties } from 'react'
import type { ClassId, TileKind } from '../engine/data'
import { dist, moveCost, neighbors, ringOf, type State, type View } from '../engine/game'

export const seatVar = (seat: number) => ({ '--seat': `var(--bc-seat-${seat + 1})` }) as CSSProperties
export const classIcon = (cls: ClassId | null) => `bc-class-${cls === 'priest' ? 'cleric' : (cls ?? 'knight')}`
export function tileIcon(kind: TileKind | 'hidden'): string | null {
  if (kind === 'hidden') return 'bc-tile-back'
  if (kind === 'ruin') return 'bc-tile-ruins'
  if (kind === 'empty') return null
  return `bc-tile-${kind}`
}
export const tileClass = (kind: TileKind | 'hidden') => (kind === 'ruin' ? 'ruins' : kind === 'empty' ? 'ruins' : kind)
/** 엔진의 미리보기 함수는 State 를 받지만 쓰는 필드는 View 에도 있다(남의 숨긴 값은 비어 있을 뿐) */
export const asState = (v: View) => v as unknown as State

export function isOpenView(v: View, i: number): boolean {
  const ring = ringOf(v, i)
  return v.phase === 'final' ? ring >= 3 : ring <= v.chapter
}

/** 내가 지금 이 칸으로 옮길 때 드는 토큰(엔진 moveCost 와 같은 계산) */
export function moveCostView(v: View, seat: number, to: number): number {
  const p = asState(v).players[seat]
  if (!p || !v.board[to]) return Infinity
  return moveCost(asState(v), p, to)
}

export function reachable(v: View, seat: number, canAct: boolean): Set<number> {
  const out = new Set<number>()
  const p = v.players[seat]
  if (!p || !canAct || p.out) return out
  if (v.demon?.seat === seat && v.demon.chained) return out
  const demonPos = v.demon ? v.players[v.demon.seat]?.pos : -1
  for (const n of neighbors(v, p.pos)) {
    if (!isOpenView(v, n)) continue
    if (v.phase === 'final' && v.demon?.seat !== seat && n === demonPos) continue
    if (moveCostView(v, seat, n) <= v.tokens) out.add(n)
  }
  return out
}

/** 내 위치에서 공격할 수 있는 칸 */
export function attackTargets(view: View, me: number | null, range: number): Set<number> {
  const out = new Set<number>()
  const p = me === null ? undefined : view.players[me]
  if (!p || p.out) return out
  if (view.phase === 'play') for (const m of view.monsters) if (dist(view, p.pos, m.pos) <= range) out.add(m.pos)
  if (view.phase === 'final' && view.demon && view.demon.seat !== me) {
    const d = view.players[view.demon.seat]
    if (d && dist(view, p.pos, d.pos) <= Math.max(1, range)) out.add(d.pos)
  }
  return out
}
