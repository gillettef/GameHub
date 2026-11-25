// 화면에서 고르는 중인 것(단계가 바뀌면 처음으로)
import type { View } from '../def'
import { STAY } from '../engine/engine'

export type Order = 'none' | 'occupy' | 'decoy3' | 'decoy4' | 'decoy5'

export interface Picks {
  key: string
  moves: string[]
  sel: number
  attacks: number[]
  blocks: number[]
  orders: Record<number, Order>
}

export function freshPicks(v: View, key: string): Picks {
  const m = v.mine
  const used = new Set<string>()
  const orders: Record<number, Order> = {}
  for (const f of m?.fleets ?? []) {
    // 아직 내 것이 아닌 행성에 있으면 점령을 기본으로(같은 행성은 한 함대만)
    const occupy = f.canOccupy && v.holds[f.real] !== v.me && !used.has(f.real)
    if (occupy) used.add(f.real)
    orders[f.id] = occupy ? 'occupy' : 'none'
  }
  return {
    key,
    moves: (m?.fleets ?? []).map(() => STAY),
    sel: m?.fleets[0]?.id ?? 1,
    attacks: [],
    blocks: (m?.blockades ?? []).map((o) => o.idx),
    orders,
  }
}
