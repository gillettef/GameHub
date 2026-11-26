/**
 * 봇: 한 번에 행동 하나를 고른다. 언제나 규칙에 맞는 행동을 돌려주고, 할 게 없으면 차례를 끝낸다.
 * level: 0 쉬움(왕관을 신경 쓰지 않음), 1 보통(대관식 1위가 될 것 같으면 그림자를 피함), 2 어려움(마왕으로 이길 만하면 왕관을 노림)
 */
import { MONSTERS, ITEMS, CLASS_IDS, RITUALS, type ItemId, type RitualId } from './data'
import {
  actors, attackRange, coalition, coronationScores, demonRange, dist, handLimit, has, isDemon, isOpen, maxHp, moveCost, neighbors,
  pendingDamage, player, previewAttack, price, type Action, type Card, type Player, type State,
} from './game'

export type BotLevel = 0 | 1 | 2

function subsets<T>(arr: readonly T[], maxSize: number): T[][] {
  const out: T[][] = []
  const walk = (start: number, cur: T[]) => {
    if (cur.length > 0) out.push([...cur])
    if (cur.length >= maxSize) return
    for (let i = start; i < arr.length; i++) {
      cur.push(arr[i] as T)
      walk(i + 1, cur)
      cur.pop()
    }
  }
  walk(0, [])
  return out
}

/** 카드를 아끼는 비용: 높은 카드·그림자 카드일수록 아깝다 */
function cardCost(cards: readonly Card[]): number {
  return cards.reduce((t, c) => t + (c.suit === null ? 4 : 0.6 + c.rank * 0.08), 0)
}

interface AttackPlan {
  cards: number[]
  damage: number
  score: number
}

function bestAttack(s: State, seat: number, target: number, targetHp: number, counter: number, hp: number): AttackPlan | null {
  const p = player(s, seat)
  const max = Math.min(p.level, 5)
  let best: AttackPlan | null = null
  for (const sub of subsets(p.hand, max)) {
    const pv = previewAttack(s, seat, target, sub.map((c) => c.id))
    if (!pv || pv.blocked || pv.damage <= 0) continue
    const kills = pv.damage >= targetHp
    const noCounter = pv.hand.cat === 3 || pv.hand.cat === 6
    const takes = kills || noCounter ? 0 : counter
    if (takes >= hp - 1) continue
    const score = Math.min(pv.damage, targetHp) + (kills ? 6 : 0) - cardCost(sub) * 0.5 - takes * 0.4
    if (!best || score > best.score) best = { cards: sub.map((c) => c.id), damage: pv.damage, score }
  }
  return best
}

/** 열린 칸만 지나가는 최단 거리 첫걸음 */
function stepToward(s: State, from: number, goals: (i: number) => boolean, blocked: (i: number) => boolean = () => false): { step: number; d: number } | null {
  const prev = new Map<number, number>([[from, -1]])
  const queue = [from]
  while (queue.length) {
    const cur = queue.shift() as number
    if (cur !== from && goals(cur)) {
      let step = cur
      let d = 0
      while (prev.get(step) !== from) {
        step = prev.get(step) as number
        d++
      }
      return { step, d: d + 1 }
    }
    for (const n of neighbors(cur)) {
      if (prev.has(n) || !isOpen(s, n) || blocked(n)) continue
      prev.set(n, cur)
      queue.push(n)
    }
  }
  return null
}

function crownRisk(s: State, seat: number): boolean {
  // 공개 정보(레벨 + 명성 + 제단 횟수)로 대관식 1위가 될지 어림한다
  const est = coronationScores(s).map((x) => {
    const p = player(s, x.seat)
    const guess = x.seat === seat ? x.total : p.level + p.fame + p.altarVisits * 0.8 * 2
    return { seat: x.seat, guess }
  })
  const mine = est.find((e) => e.seat === seat)?.guess ?? 0
  return est.every((e) => e.seat === seat || e.guess < mine)
}

function wantCrown(s: State, seat: number, level: BotLevel): boolean {
  if (level < 2) return false
  const p = player(s, seat)
  return s.graveyard.filter((c) => c.rank >= 10).length >= 6 && p.level >= 5
}

function pickPending(s: State, seat: number, level: BotLevel): Action | null {
  const pd = s.pending[0]
  if (!pd || pd.seat !== seat) return null
  switch (pd.kind) {
    case 'upgrade':
      return { type: 'choose', option: (seat + pd.tier) % 2 }
    case 'altar': {
      const avoidShadow = level >= 1 && !wantCrown(s, seat, level)
      const i = pd.options.findIndex((o) => ('shadowId' in o ? !avoidShadow : true))
      return { type: 'choose', option: Math.max(0, i) }
    }
    case 'treasure': {
      const p = player(s, seat)
      const slot = ITEMS[pd.item].slot as 'weapon' | 'armor' | 'trinket'
      const old = p[slot]
      return { type: 'choose', option: !old || ITEMS[pd.item].price > ITEMS[old].price ? 1 : 0 }
    }
    case 'beast':
      return { type: 'choose', option: wantCrown(s, seat, level) || level === 0 ? 1 : 0 }
    case 'trade':
      return { type: 'tradeReply', card: null }
  }
}

function assistPlan(s: State, seat: number): Action {
  const at = s.attack
  const p = player(s, seat)
  if (!at) return { type: 'pass' }
  const targetHp = at.target === -1 ? (s.demon?.hp ?? 99) : (s.monsters.find((m) => m.id === at.target)?.hp ?? 0)
  const baseDmg = pendingDamage(s)
  let best: { cards: number[]; gain: number } | null = null
  for (const sub of subsets(p.hand, Math.min(p.level, 4))) {
    const pv = previewAttack(s, seat, at.target, sub.map((c) => c.id))
    if (!pv || pv.blocked) continue
    const gain = Math.min(pv.damage, targetHp) - Math.min(baseDmg, targetHp) + (pv.damage >= targetHp && baseDmg < targetHp ? 5 : 0) - cardCost(sub)
    if (gain > 1.5 && (!best || gain > best.gain)) best = { cards: sub.map((c) => c.id), gain }
  }
  return best ? { type: 'assist', cards: best.cards } : { type: 'pass' }
}

function shopBuy(s: State, p: Player): ItemId | null {
  const options = [...s.shop.equip, ...s.shop.cons].filter((it) => price(s, p, it) <= p.gold)
  let best: ItemId | null = null
  let bestV = 0
  for (const it of options) {
    const def = ITEMS[it]
    let v: number
    if (def.slot === 'consumable') v = p.consumables.length < 2 && p.gold >= 6 ? (it === 'potion' ? 2 : it === 'whetstone' ? 1.5 : 1) : 0
    else {
      const old = p[def.slot as 'weapon' | 'armor' | 'trinket']
      v = old ? def.price - ITEMS[old].price : def.price
    }
    if (v > bestV) {
      bestV = v
      best = it
    }
  }
  return best
}

function playTurn(s: State, seat: number, level: BotLevel): Action {
  const p = player(s, seat)
  if (s.tokens <= 0) return { type: 'end' }
  const tile = s.board[p.pos]
  const lowHp = p.hp <= maxHp(p) * 0.4

  if (lowHp && p.consumables.includes('potion') && !p.usedItem) return { type: 'use', item: 'potion' }
  if (p.cls === 'knight' && !p.guard) return { type: 'guard', on: true }

  // 공격
  let bestAtk: { target: number; plan: AttackPlan } | null = null
  for (const m of s.monsters) {
    if (dist(p.pos, m.pos) > attackRange(p)) continue
    const def = MONSTERS[m.kind]
    const plan = bestAttack(s, seat, m.id, m.hp, def.atk, p.hp)
    if (plan && plan.score > 0 && (!bestAtk || plan.score > bestAtk.plan.score)) bestAtk = { target: m.id, plan }
  }
  if (bestAtk) {
    if (p.cls === 'mage' && p.skillUses === 0 && bestAtk.plan.damage < 3 && s.monsters.some((m) => m.pos === p.pos)) return { type: 'skill' }
    return { type: 'attack', target: bestAtk.target, cards: bestAtk.plan.cards }
  }

  // 타일 이용
  if (tile?.revealed) {
    if (tile.kind === 'treasure') return { type: 'open' }
    if (tile.kind === 'shop') {
      const it = shopBuy(s, p)
      if (it) return { type: 'buy', item: it }
    }
    if (tile.kind === 'altar') {
      const avoid = level >= 1 && crownRisk(s, seat) && !wantCrown(s, seat, level)
      if (!avoid && p.altarVisits < 3 + level) return { type: 'pray' }
    }
    if (tile.kind === 'spring' && p.hand.length < handLimit(s, p) - 1) return { type: 'rest' }
    if (tile.kind === 'camp' && lowHp) return { type: 'rest' }
  }
  if (p.cls === 'priest' && p.skillUses === 0 && p.hand.length < handLimit(s, p) - 1) return { type: 'skill' }
  if (p.cls === 'rogue' && p.skillUses === 0 && s.graveyard.length > 0 && (s.graveyard.at(-1)?.rank ?? 0) >= 9 && p.hand.length < handLimit(s, p)) return { type: 'skill' }

  // 이동 목표
  const valueAt = (i: number): boolean => {
    const t = s.board[i]
    if (!t) return false
    if (!t.revealed) return true
    if (s.monsters.some((m) => m.pos === i && (MONSTERS[m.kind].grade !== 'boss' || p.level >= 4) && !(MONSTERS[m.kind].minCat !== undefined && (MONSTERS[m.kind].minCat ?? 0) + 1 > p.level + 1))) return true
    if (t.kind === 'treasure') return true
    if (t.kind === 'shop' && shopBuy(s, p)) return true
    if (t.kind === 'spring' && p.hand.length < handLimit(s, p) - 1) return true
    if (t.kind === 'altar' && level >= 0 && p.altarVisits < 2 && !(level >= 1 && crownRisk(s, seat))) return true
    return false
  }
  const go = stepToward(s, p.pos, valueAt)
  if (go && moveCost(s, p, go.step) <= s.tokens) return { type: 'move', to: go.step }
  if (p.hand.length < handLimit(s, p)) return { type: 'draw' }
  return { type: 'end' }
}

function finalTurn(s: State, seat: number): Action {
  const p = player(s, seat)
  if (s.tokens <= 0) return { type: 'end' }
  const demon = s.demon
  if (!demon) return { type: 'end' }
  const king = player(s, demon.seat)
  if (isDemon(s, seat)) {
    const range = demonRange(s, p)
    const inRange = coalition(s).filter((q) => !q.out && dist(q.pos, p.pos) <= range)
    if (inRange.length > 0 && p.hand.length > 0) {
      let best: { cards: number[]; v: number } | null = null
      for (const sub of subsets(p.hand, 5)) {
        const pv = previewAttack(s, seat, -1, sub.map((c) => c.id))
        if (!pv) continue
        const v = pv.damage * inRange.length - cardCost(sub) * 0.3
        if (!best || v > best.v) best = { cards: sub.map((c) => c.id), v }
      }
      if (best) return { type: 'smite', cards: best.cards }
    }
    if (!demon.chained) {
      const targets = coalition(s).filter((q) => !q.out).map((q) => q.pos)
      const go = stepToward(s, p.pos, (i) => targets.some((t) => dist(i, t) <= range))
      if (go && moveCost(s, p, go.step) <= s.tokens) return { type: 'move', to: go.step }
    }
    if (p.hand.length < handLimit(s, p)) return { type: 'draw' }
    return { type: 'end' }
  }
  // 연합
  const order: RitualId[] = ['holyWater', 'pierce', 'chain', 'lantern']
  for (const r of order) {
    const cost = RITUALS[r].price + (has(king, 'merchantPouch') ? 2 : 0)
    if (!s.ritualsUsed.includes(r) && s.treasury >= cost && (r !== 'lantern' || p.hp < maxHp(p) / 2)) return { type: 'ritual', ritual: r }
  }
  const range = Math.max(1, attackRange(p))
  if (dist(p.pos, king.pos) <= range && p.hand.length > 0) {
    const plan = bestAttack(s, seat, -1, demon.hp ?? 99, 0, 99)
    if (plan) return { type: 'attack', target: -1, cards: plan.cards }
  } else {
    const go = stepToward(s, p.pos, (i) => dist(i, king.pos) <= range, (i) => i === king.pos)
    if (go && moveCost(s, p, go.step) <= s.tokens) return { type: 'move', to: go.step }
  }
  if (p.hand.length < handLimit(s, p)) return { type: 'draw' }
  return { type: 'end' }
}

export function botAction(s: State, seat: number, level: BotLevel = 1): Action {
  if (!actors(s).includes(seat)) return { type: 'end' }
  const pend = pickPending(s, seat, level)
  if (pend) return pend
  if (s.attack) return assistPlan(s, seat)
  if (s.phase === 'draft') {
    const taken = new Set(s.players.map((q) => q.cls))
    const free = CLASS_IDS.filter((c) => !taken.has(c))
    return { type: 'pickClass', cls: free[(seat * 7 + s.round) % free.length] ?? 'knight' }
  }
  if (s.phase === 'final') return finalTurn(s, seat)
  return playTurn(s, seat, level)
}

/** 거절됐을 때 대신 둘 안전한 행동 */
export function botFallback(s: State, seat: number): Action {
  const pd = s.pending[0]
  if (pd && pd.seat === seat) return pd.kind === 'trade' ? { type: 'tradeReply', card: null } : { type: 'choose', option: 0 }
  if (s.attack) return { type: 'pass' }
  if (s.phase === 'draft') {
    const taken = new Set(s.players.map((q) => q.cls))
    return { type: 'pickClass', cls: CLASS_IDS.find((c) => !taken.has(c)) ?? 'knight' }
  }
  return { type: 'end' }
}
