/**
 * 족보 판정. 낸 카드(played) + 공용 카드(community) 중 고른 것으로 가장 좋은 족보 하나를 만든다.
 * 규칙: 낸 카드는 모두 족보를 이루는 카드여야 하고, 합쳐 5장 이하다. 공용 카드는 쓰지 않아도 된다.
 * 와일드(그림자 카드)와 숫자·문양 바꾸기 효과는 판정이 가장 좋은 값을 알아서 고른다.
 */
export const SUITS = ['blade', 'ward', 'lantern', 'coin'] as const
export type Suit = (typeof SUITS)[number]

export const MAX_RANK = 13

/** 족보 등급: 0 일격(하이카드) … 8 각성(스트레이트 플러시) */
export const HAND_NAMES = ['일격', '쌍격', '연환', '삼연', '진군', '공명', '결진', '사방', '각성'] as const
export const HAND_POKER = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시'] as const
export const HAND_POWER = [2, 4, 6, 7, 9, 9, 11, 14, 20] as const
export const Cat = {
  High: 0,
  Pair: 1,
  TwoPair: 2,
  Trips: 3,
  Straight: 4,
  Flush: 5,
  Full: 6,
  Quads: 7,
  StraightFlush: 8,
} as const
export type Cat = (typeof Cat)[keyof typeof Cat]

export interface PCard {
  id: number
  /** null = 와일드 */
  suit: Suit | null
  rank: number
}

export interface Resolved {
  id: number
  suit: Suit
  rank: number
}

export interface Mods {
  /** 숫자를 ±shiftAmt 까지 바꿀 수 있는 카드 수 */
  shiftCards?: number
  shiftAmt?: number
  /** 문양을 바꿀 수 있는 카드 수 */
  suitCards?: number
}

export interface HandResult {
  cat: Cat
  /** 족보를 이루는 카드(바뀐 값) */
  pattern: Resolved[]
  /** 그중 공용 카드 id */
  communityUsed: number[]
  /** 같은 등급끼리 비교용 */
  score: number
}

export function power(cat: Cat, pattern: readonly Resolved[]): number {
  if (cat === Cat.High) return (pattern[0]?.rank ?? 0) >= 11 ? 3 : 2
  return HAND_POWER[cat]
}

/** 정확히 이 카드들로 만든 족보와 그 족보를 이루는 카드 */
export function evalSet(cards: readonly Resolved[]): { cat: Cat; pattern: Resolved[]; score: number } {
  const byRank = new Map<number, Resolved[]>()
  for (const c of cards) {
    const list = byRank.get(c.rank)
    if (list) list.push(c)
    else byRank.set(c.rank, [c])
  }
  const groups = [...byRank.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0])
  const n = cards.length
  let flush = false
  let straight = false
  if (n === 5) {
    flush = cards.every((c) => c.suit === cards[0]?.suit)
    const ranks = cards.map((c) => c.rank).sort((a, b) => a - b)
    straight = byRank.size === 5 && (ranks[4] ?? 0) - (ranks[0] ?? 0) === 4
  }
  const sum = (cs: readonly Resolved[]) => cs.reduce((t, c) => t + c.rank, 0)
  const all = [...cards]
  if (straight && flush) return { cat: Cat.StraightFlush, pattern: all, score: sum(all) }
  const g0 = groups[0]?.[1] ?? []
  const g1 = groups[1]?.[1] ?? []
  if (g0.length >= 4) return { cat: Cat.Quads, pattern: g0.slice(0, 4), score: (groups[0]?.[0] ?? 0) * 4 }
  if (g0.length === 3 && g1.length >= 2) return { cat: Cat.Full, pattern: [...g0, ...g1.slice(0, 2)], score: sum(g0) * 20 + sum(g1) }
  if (flush) return { cat: Cat.Flush, pattern: all, score: sum(all) }
  if (straight) return { cat: Cat.Straight, pattern: all, score: sum(all) }
  if (g0.length === 3) return { cat: Cat.Trips, pattern: g0, score: sum(g0) }
  if (g0.length === 2 && g1.length === 2) return { cat: Cat.TwoPair, pattern: [...g0, ...g1], score: sum(g0) * 20 + sum(g1) }
  if (g0.length === 2) return { cat: Cat.Pair, pattern: g0, score: sum(g0) }
  const hi = [...cards].sort((a, b) => b.rank - a.rank)[0]
  return { cat: Cat.High, pattern: hi ? [hi] : [], score: hi?.rank ?? 0 }
}

function better(a: HandResult | null, b: HandResult): boolean {
  if (!a) return true
  if (b.cat !== a.cat) return b.cat > a.cat
  if (b.score !== a.score) return b.score > a.score
  // 같으면 공용 카드를 덜 쓰는 쪽
  return b.communityUsed.length < a.communityUsed.length
}

/** 카드 하나가 될 수 있는 값들과 그 비용 */
interface Option {
  suit: Suit
  rank: number
  shift: number
  suitChange: number
}

function optionsFor(c: PCard, mods: Mods, others: readonly PCard[]): Option[] {
  if (c.suit === null) {
    // 와일드: 다른 카드 근처 숫자와 다른 카드 문양만 보면 충분하다(+ 13)
    const fixed = others.filter((o) => o.suit !== null)
    const ranks = new Set<number>([MAX_RANK])
    for (const o of fixed) for (let d = -4; d <= 4; d++) if (o.rank + d >= 1 && o.rank + d <= MAX_RANK) ranks.add(o.rank + d)
    if (fixed.length === 0) for (let r = 1; r <= MAX_RANK; r++) ranks.add(r)
    const suits = new Set<Suit>(fixed.map((o) => o.suit as Suit))
    if (suits.size === 0) suits.add('blade')
    const out: Option[] = []
    for (const r of ranks) for (const s of suits) out.push({ suit: s, rank: r, shift: 0, suitChange: 0 })
    return out
  }
  const out: Option[] = [{ suit: c.suit, rank: c.rank, shift: 0, suitChange: 0 }]
  const amt = mods.shiftCards ? (mods.shiftAmt ?? 1) : 0
  const suitAlts = mods.suitCards ? SUITS.filter((s) => s !== c.suit) : []
  for (let d = -amt; d <= amt; d++) {
    const r = c.rank + d
    if (d === 0 || r < 1 || r > MAX_RANK) continue
    out.push({ suit: c.suit, rank: r, shift: 1, suitChange: 0 })
    for (const s of suitAlts) out.push({ suit: s, rank: r, shift: 1, suitChange: 1 })
  }
  for (const s of suitAlts) out.push({ suit: s, rank: c.rank, shift: 0, suitChange: 1 })
  return out
}

function bestVariant(set: readonly PCard[], mods: Mods, mustIds: ReadonlySet<number>, communityIds: ReadonlySet<number>): HandResult | null {
  const opts = set.map((c) => optionsFor(c, mods, set))
  let best: HandResult | null = null
  const cur: Resolved[] = []
  const maxShift = mods.shiftCards ?? 0
  const maxSuit = mods.suitCards ?? 0
  const walk = (i: number, shiftUsed: number, suitUsed: number) => {
    if (i === set.length) {
      const e = evalSet(cur)
      if (![...mustIds].every((id) => e.pattern.some((p) => p.id === id))) return
      const r: HandResult = { cat: e.cat, pattern: e.pattern.map((p) => ({ ...p })), communityUsed: e.pattern.filter((p) => communityIds.has(p.id)).map((p) => p.id), score: e.score }
      if (better(best, r)) best = r
      return
    }
    const c = set[i] as PCard
    for (const o of opts[i] ?? []) {
      if (shiftUsed + o.shift > maxShift || suitUsed + o.suitChange > maxSuit) continue
      cur.push({ id: c.id, suit: o.suit, rank: o.rank })
      walk(i + 1, shiftUsed + o.shift, suitUsed + o.suitChange)
      cur.pop()
    }
  }
  walk(0, 0, 0)
  return best
}

/** 낸 카드 + 공용 카드로 만들 수 있는 가장 좋은 족보. 낸 카드가 족보에 다 들어가지 못하면 null */
export function bestHand(played: readonly PCard[], community: readonly PCard[], mods: Mods = {}): HandResult | null {
  if (played.length === 0 || played.length > 5) return null
  const ids = new Set(played.map((c) => c.id))
  if (ids.size !== played.length) return null
  const comm = community.filter((c) => !ids.has(c.id))
  const commIds = new Set(comm.map((c) => c.id))
  const room = 5 - played.length
  let best: HandResult | null = null
  const total = 1 << comm.length
  for (let mask = 0; mask < total; mask++) {
    const sub: PCard[] = []
    for (let i = 0; i < comm.length; i++) if (mask & (1 << i)) sub.push(comm[i] as PCard)
    if (sub.length > room) continue
    const r = bestVariant([...played, ...sub], mods, ids, commIds)
    if (r && better(best, r)) best = r
  }
  return best
}

export function handLabel(cat: Cat): string {
  return `${HAND_NAMES[cat]}(${HAND_POKER[cat]})`
}
