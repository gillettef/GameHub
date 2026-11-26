/**
 * 마왕의 패 규칙 엔진. 순수 함수: 상태를 복사해 바꾼 뒤 돌려주고, 규칙 위반이면 IllegalAction 을 던진다.
 * 규칙 문서: games/blackcrown/docs/design.md
 */
import * as R from './rng'
import { Cat, HAND_NAMES, bestHand, handLabel, power, type HandResult, type Mods, type PCard, type Suit } from './hands'
import {
  BASE_HP, BLESSINGS, CENTER, CHAPTERS, CLASSES, CLASS_IDS, CONSUMABLES, CURSES, DEMON_TOKENS, EQUIPMENT,
  FINAL_ROUNDS, HP_PER_LEVEL, ITEMS, LAST_HIT_BONUS, MAX_CONSUMABLES, MAX_LEVEL, MONSTERS, REWARDS, RING_BOSS, RING_MONSTERS,
  RITUALS, ROUNDS_PER_CHAPTER, SHADOW_CARDS, SHADOW_ID_BASE, SIZE, START_GOLD, SUIT_NAMES, TILE_NAMES, TOKENS_PER_TURN, XP_TABLE, ringTiles,
  type Blessing, type ClassId, type ItemId, type MonsterId, type RitualId, type TileKind,
} from './data'

export class IllegalAction extends Error {}

// ───────────────────────── 타입 ─────────────────────────

export interface Card {
  id: number
  /** null = 그림자 카드(와일드) */
  suit: Suit | null
  rank: number
  forged?: boolean
}

export interface Tile {
  kind: TileKind
  /** 1 바깥, 2 가운데, 3 안쪽, 4 옥좌 */
  ring: number
  revealed: boolean
  /** 아직 뒤집히지 않은 몬스터 타일의 몬스터(비공개) */
  monster?: MonsterId
}

export interface Monster {
  id: number
  kind: MonsterId
  pos: number
  hp: number
  community: Card | null
  contributors: number[]
}

export interface Player {
  seat: number
  cls: ClassId | null
  level: number
  xp: number
  hp: number
  gold: number
  fame: number
  hand: Card[]
  pos: number
  weapon: ItemId | null
  armor: ItemId | null
  trinket: ItemId | null
  consumables: ItemId[]
  /** 저주 유물(비공개, 쓰는 순간 공개) */
  curses: { id: ItemId; revealed: boolean }[]
  /** 그림자 카드 사용·정화로 바뀌는 값(비공개). 판정 때는 손의 그림자 카드·저주 유물을 더한다 */
  shadow: number
  /** 모두에게 보이는 제단 기도 횟수(그림자 망토를 입고 한 기도는 빠짐) */
  altarVisits: number
  /** [3레벨, 5레벨] 강화 선택(0 = A, 1 = B) */
  upgrades: [number | null, number | null]
  skillUses: number
  purifyUsed: boolean
  mirrorUsed: boolean
  reserve: number
  bonusTokens: number
  guard: boolean
  ironwall: boolean
  peeked: number[]
  out: boolean
  finalDamage: number
  /** 이번 차례에만 */
  smoke: boolean
  whetstone: boolean
  usedItem: boolean
  movedOnce: boolean
}

export type Pending =
  | { kind: 'upgrade'; seat: number; tier: 0 | 1 }
  | { kind: 'altar'; seat: number; options: AltarDraw[] }
  | { kind: 'treasure'; seat: number; item: ItemId }
  | { kind: 'beast'; seat: number }
  | { kind: 'trade'; seat: number; from: number; card: Card }

export type AltarDraw = { blessing: Blessing } | { shadowId: number }

export interface PendingAttack {
  attacker: number
  /** 몬스터 id, 마왕이면 -1 */
  target: number
  cards: number[]
  assists: { seat: number; cards: number[] }[]
  waiting: number[]
  /** 지금까지 낸 카드(공개 정보, 화면 미리보기용) */
  shown: { owner: number; card: Card }[]
}

export interface Demon {
  seat: number
  hp: number
  maxHp: number
  deck: Card[]
  discard: Card[]
  holyWater: number
  chained: boolean
  mirrorUsedRound: boolean
  riverTwisted: boolean
}

export interface CoronationScore {
  seat: number
  level: number
  fame: number
  shadow: number
  total: number
}

export interface LastAttack {
  attacker: number
  target: string
  cat: Cat
  damage: number
  killed: boolean
  lastHitter: number | null
}

export type Phase = 'draft' | 'play' | 'final' | 'over'

export interface State {
  rng: R.Rng
  seats: number
  phase: Phase
  round: number
  /** 1~3, 최종전은 4 */
  chapter: number
  firstSeat: number
  turn: number
  tokens: number
  board: Tile[]
  monsters: Monster[]
  nextMonsterId: number
  deck: Card[]
  discard: Card[]
  graveyard: Card[]
  shadowFree: number[]
  shop: { equip: ItemId[]; cons: ItemId[] }
  itemPool: ItemId[]
  cursePool: ItemId[]
  players: Player[]
  pending: Pending[]
  attack: PendingAttack | null
  lastAttack: LastAttack | null
  demon: Demon | null
  community: Card[]
  coronation: { king: number; scores: CoronationScore[] } | null
  treasury: number
  ritualsUsed: RitualId[]
  pierce: boolean
  winner: 'demon' | 'coalition' | null
  lastHitter: number | null
  ranking: { seat: number; score: number }[] | null
}

export interface Ctx {
  log(text: string, kind?: string): void
  name(seat: number): string
}

export type Action =
  | { type: 'pickClass'; cls: ClassId }
  | { type: 'move'; to: number }
  | { type: 'attack'; target: number; cards: number[] }
  | { type: 'assist'; cards: number[] }
  | { type: 'pass' }
  | { type: 'draw' }
  | { type: 'buy'; item: ItemId }
  | { type: 'reroll' }
  | { type: 'forge'; card: number; mode: 'rank' | 'suit'; suit?: Suit }
  | { type: 'rest' }
  | { type: 'pray' }
  | { type: 'open' }
  | { type: 'trade'; to: number; card: number }
  | { type: 'tradeReply'; card: number | null }
  | { type: 'skill'; target?: number }
  | { type: 'purify' }
  | { type: 'use'; item: ItemId }
  | { type: 'guard'; on: boolean }
  | { type: 'ritual'; ritual: RitualId }
  | { type: 'push'; target: number }
  | { type: 'smite'; cards: number[] }
  | { type: 'twist' }
  | { type: 'choose'; option: number }
  | { type: 'end' }

// ───────────────────────── 보드 도우미 ─────────────────────────

export const idx = (r: number, c: number) => r * SIZE + c
export const rowOf = (i: number) => Math.floor(i / SIZE)
export const colOf = (i: number) => i % SIZE
export const CAMP = idx(SIZE - 1, CENTER)
export const THRONE = idx(CENTER, CENTER)
export function ringOf(i: number): number {
  const d = Math.max(Math.abs(rowOf(i) - CENTER), Math.abs(colOf(i) - CENTER))
  return 4 - d
}
export function dist(a: number, b: number): number {
  return Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b))
}
export function neighbors(i: number): number[] {
  const r = rowOf(i)
  const c = colOf(i)
  const out: number[] = []
  if (r > 0) out.push(idx(r - 1, c))
  if (r < SIZE - 1) out.push(idx(r + 1, c))
  if (c > 0) out.push(idx(r, c - 1))
  if (c < SIZE - 1) out.push(idx(r, c + 1))
  return out
}

export function isOpen(s: State, i: number): boolean {
  const ring = ringOf(i)
  if (s.phase === 'final') return ring >= 3
  return ring <= s.chapter
}

// ───────────────────────── 플레이어 도우미 ─────────────────────────

export function player(s: State, seat: number): Player {
  const p = s.players[seat]
  if (!p) throw new IllegalAction('없는 자리입니다.')
  return p
}

export const has = (p: Player, item: ItemId) => p.weapon === item || p.armor === item || p.trinket === item
export const hasCurse = (p: Player, item: ItemId) => p.curses.some((c) => c.id === item)
export const upg = (p: Player, tier: 0 | 1, opt: number) => p.upgrades[tier] === opt
export const isDemon = (s: State, seat: number) => s.demon?.seat === seat

export function maxHp(p: Player): number {
  return BASE_HP + (p.level - 1) * HP_PER_LEVEL + (p.cls === 'knight' && upg(p, 1, 1) ? 6 : 0)
}

export function handLimit(s: State, p: Player): number {
  if (isDemon(s, p.seat)) return p.level + 2 + (hasCurse(p, 'bloodMask') ? 4 : 0)
  return p.level + (hasCurse(p, 'bloodMask') ? 2 : 0)
}

export function reserveCap(p: Player): number {
  if (p.cls !== 'rogue') return 1
  return upg(p, 1, 1) ? 3 : 2
}

export function skillLimit(p: Player): number {
  if ((p.cls === 'mage' || p.cls === 'rogue') && upg(p, 1, 0)) return 2
  return 1
}

export function attackRange(p: Player): number {
  let r = 0
  if (p.cls === 'hunter') r = upg(p, 1, 0) ? 2 : 1
  if (has(p, 'longbow')) r = Math.max(r + 1, 1)
  return r
}

export function shadowTotal(p: Player): number {
  return p.shadow + p.hand.filter((c) => c.suit === null).length + p.curses.length
}

export function coalition(s: State): Player[] {
  return s.players.filter((p) => !isDemon(s, p.seat))
}

function revealCurse(p: Player, id: ItemId, ctx: Ctx) {
  const c = p.curses.find((x) => x.id === id)
  if (c && !c.revealed) {
    c.revealed = true
    ctx.log(`${ctx.name(p.seat)}의 저주 유물 「${ITEMS[id].name}」이 드러났습니다.`, 'shadow')
  }
}

function mods(s: State, p: Player): Mods {
  let shiftCards = 0
  let shiftAmt = 1
  let suitCards = 0
  if (isDemon(s, p.seat)) {
    if (has(p, 'runeStaff')) shiftCards += 1
    if (has(p, 'shiftRing')) suitCards += 1
    return { shiftCards, shiftAmt, suitCards }
  }
  if (p.cls === 'mage') {
    shiftCards = upg(p, 0, 1) ? 2 : 1
    if (upg(p, 0, 0)) shiftAmt = 2
  }
  if (has(p, 'runeStaff')) shiftCards += 1
  if (has(p, 'shiftRing')) suitCards += 1
  if (p.cls === 'hunter' && upg(p, 1, 1)) suitCards += 1
  return { shiftCards, shiftAmt, suitCards }
}

/** 판정 전에 바뀌는 카드 값(용사의 검) */
function asPCard(p: Player | null, c: Card, demonSide: boolean): PCard {
  if (c.suit === null) return { id: c.id, suit: null, rank: 0 }
  if (p && !demonSide && has(p, 'heroSword') && c.suit === 'blade') return { id: c.id, suit: c.suit, rank: Math.min(13, c.rank + 2) }
  return { id: c.id, suit: c.suit, rank: c.rank }
}

// ───────────────────────── 카드 더미 ─────────────────────────

function drawCard(s: State): Card | null {
  if (s.deck.length === 0 && s.discard.length > 0) {
    s.deck = R.shuffle(s.rng, s.discard)
    s.discard = []
  }
  if (s.deck.length === 0 && s.graveyard.length > 0) {
    const n = Math.max(1, Math.floor(s.graveyard.length / 2))
    s.deck = R.shuffle(s.rng, s.graveyard.splice(0, n))
  }
  return s.deck.pop() ?? null
}

function cardValueForHand(hand: readonly Card[], c: Card): number {
  const match = hand.some((h) => h.suit !== null && h.rank === c.rank) ? 20 : 0
  const suit = hand.filter((h) => h.suit === c.suit).length * 2
  return match + suit + c.rank
}

function drawTo(s: State, p: Player, n: number, ctx: Ctx | null) {
  const demon = isDemon(s, p.seat)
  for (let i = 0; i < n; i++) {
    if (p.hand.length >= handLimit(s, p)) break
    let c: Card | null
    if (demon && s.demon) {
      if (s.demon.deck.length === 0 && s.demon.discard.length > 0) {
        s.demon.deck = R.shuffle(s.rng, s.demon.discard)
        s.demon.discard = []
      }
      c = s.demon.deck.pop() ?? drawCard(s)
    } else {
      c = drawCard(s)
      if (c && has(p, 'prophetEye')) {
        const d = drawCard(s)
        if (d) {
          const keep = cardValueForHand(p.hand, d) > cardValueForHand(p.hand, c) ? d : c
          s.deck.unshift(keep === d ? c : d)
          c = keep
        }
      }
    }
    if (!c) break
    p.hand.push(c)
  }
  if (ctx && p.hand.length > p.level + (demon ? 2 : 0)) revealCurse(p, 'bloodMask', ctx)
}

function fillHand(s: State, p: Player, ctx: Ctx | null) {
  drawTo(s, p, 99, ctx)
}

function takeFromHand(p: Player, ids: readonly number[]): Card[] {
  const out: Card[] = []
  for (const id of ids) {
    const i = p.hand.findIndex((c) => c.id === id)
    if (i < 0) throw new IllegalAction('손에 없는 카드입니다.')
    out.push(...p.hand.splice(i, 1))
  }
  return out
}

function checkInHand(p: Player, ids: readonly number[]) {
  if (new Set(ids).size !== ids.length) throw new IllegalAction('같은 카드를 두 번 낼 수 없습니다.')
  for (const id of ids) if (!p.hand.some((c) => c.id === id)) throw new IllegalAction('손에 없는 카드입니다.')
}

// ───────────────────────── 준비 ─────────────────────────

function spawn(s: State, kind: MonsterId, pos: number): Monster {
  const m: Monster = { id: s.nextMonsterId++, kind, pos, hp: MONSTERS[kind].hp, community: drawCard(s), contributors: [] }
  s.monsters.push(m)
  return m
}

export function createGame(seats: number, seed: number): State {
  if (seats < 3 || seats > 5) throw new IllegalAction('3~5석만 가능합니다.')
  const rng: R.Rng = { seed: seed | 0 }
  const deck: Card[] = []
  const suits: Suit[] = ['blade', 'ward', 'lantern', 'coin']
  suits.forEach((suit, si) => {
    for (let rank = 1; rank <= 13; rank++) deck.push({ id: si * 13 + rank - 1, suit, rank })
  })
  R.shuffle(rng, deck)

  const board: Tile[] = Array.from({ length: SIZE * SIZE }, (_, i) => ({ kind: 'empty' as TileKind, ring: ringOf(i), revealed: false }))
  for (const ring of [1, 2, 3] as const) {
    const cells = board.map((t, i) => (t.ring === ring && i !== CAMP ? i : -1)).filter((i) => i >= 0)
    const kinds = R.shuffle(rng, ringTiles(ring, seats))
    const monsters = R.shuffle(rng, [...RING_MONSTERS[ring]])
    cells.forEach((cell, k) => {
      const t = board[cell] as Tile
      t.kind = kinds[k] ?? 'empty'
      if (t.kind === 'monster') t.monster = monsters.pop() ?? 'slime'
      if (t.kind === 'boss') t.monster = RING_BOSS[ring]
    })
  }
  const camp = board[CAMP] as Tile
  camp.kind = 'camp'
  camp.revealed = true
  const throne = board[THRONE] as Tile
  throne.kind = 'throne'

  const itemPool = R.shuffle(rng, [...EQUIPMENT])
  const firstSeat = R.int(rng, seats)
  const s: State = {
    rng, seats, phase: 'draft', round: 1, chapter: 1, firstSeat, turn: firstSeat, tokens: 0,
    board, monsters: [], nextMonsterId: 1, deck, discard: [], graveyard: [],
    shadowFree: Array.from({ length: SHADOW_CARDS }, (_, i) => SHADOW_ID_BASE + i),
    shop: { equip: [], cons: [] }, itemPool, cursePool: R.shuffle(rng, [...CURSES]),
    players: Array.from({ length: seats }, (_, seat): Player => ({
      seat, cls: null, level: 1, xp: 0, hp: BASE_HP, gold: START_GOLD, fame: 0, hand: [], pos: CAMP,
      weapon: null, armor: null, trinket: null, consumables: [], curses: [], shadow: 0, altarVisits: 0,
      upgrades: [null, null], skillUses: 0, purifyUsed: false, mirrorUsed: false, reserve: 0, bonusTokens: 0,
      guard: false, ironwall: false, peeked: [], out: false, finalDamage: 0,
      smoke: false, whetstone: false, usedItem: false, movedOnce: false,
    })),
    pending: [], attack: null, lastAttack: null, demon: null, community: [], coronation: null,
    treasury: 0, ritualsUsed: [], pierce: false, winner: null, lastHitter: null, ranking: null,
  }
  // 방랑 몬스터는 처음부터 보인다
  board.forEach((t, i) => {
    if (t.kind === 'wander') {
      t.kind = 'empty'
      t.revealed = true
      spawn(s, 'troll', i)
    }
  })
  for (const p of s.players) drawTo(s, p, 1, null)
  return s
}

// ───────────────────────── 진행 ─────────────────────────

function refreshShop(s: State) {
  s.itemPool.push(...s.shop.equip)
  s.shop.equip = []
  const n = s.seats <= 3 ? 2 : 3
  for (let i = 0; i < n && s.itemPool.length > 0; i++) s.shop.equip.push(s.itemPool.shift() as ItemId)
  s.shop.cons = R.shuffle(s.rng, [...CONSUMABLES]).slice(0, 2)
}

function startChapter(s: State, ctx: Ctx) {
  for (const p of s.players) {
    p.skillUses = 0
    p.purifyUsed = false
    p.mirrorUsed = false
  }
  if (s.chapter > CHAPTERS) return
  s.board.forEach((t, i) => {
    if (t.ring === s.chapter && t.kind === 'boss' && !t.revealed) {
      t.revealed = true
      spawn(s, t.monster ?? 'forestLord', i)
      delete t.monster
    }
  })
  refreshShop(s)
  const names = ['', '1장 · 숲', '2장 · 폐허', '3장 · 마왕성']
  ctx.log(`${names[s.chapter]} — 새 고리가 열렸습니다.`, 'chapter')
}

function startTurn(s: State, ctx: Ctx) {
  const p = player(s, s.turn)
  if (p.out) return endTurn(s, ctx)
  p.reserve = 0
  p.ironwall = false
  p.smoke = false
  p.whetstone = false
  p.usedItem = false
  p.movedOnce = false
  if (isDemon(s, p.seat) && s.demon) {
    s.tokens = Math.max(1, DEMON_TOKENS - s.demon.holyWater)
    drawTo(s, p, 2 + (has(p, 'prophetEye') ? 1 : 0) + (hasCurse(p, 'blackChalice') ? 2 : 0), ctx)
  } else {
    const duo = s.phase === 'final' && coalition(s).filter((c) => !c.out).length === 2
    s.tokens = TOKENS_PER_TURN + p.bonusTokens + (duo ? 1 : 0)
    p.bonusTokens = 0
    drawTo(s, p, s.phase === 'final' ? 2 : 1, ctx)
    if (hasCurse(p, 'blackChalice') && p.hand.length < handLimit(s, p)) {
      drawTo(s, p, 1, ctx)
      revealCurse(p, 'blackChalice', ctx)
    }
    if (p.cls === 'hunter' && upg(p, 0, 0)) for (const n of neighbors(p.pos)) if (!s.board[n]?.revealed && !p.peeked.includes(n)) p.peeked.push(n)
  }
}

function endTurn(s: State, ctx: Ctx) {
  if (s.phase === 'over') return
  const p = player(s, s.turn)
  if (!p.out && !isDemon(s, p.seat)) p.reserve = Math.min(s.tokens, reserveCap(p))
  s.tokens = 0
  s.turn = (s.turn + 1) % s.seats
  if (s.turn === s.firstSeat) endRound(s, ctx)
  if ((s.phase as Phase) === 'over') return
  startTurn(s, ctx)
}

function nearestStep(s: State, from: number, targets: number[]): number {
  let best = from
  let bestD = Math.min(...targets.map((t) => dist(from, t)))
  for (const n of neighbors(from)) {
    if (!isOpen(s, n)) continue
    const d = Math.min(...targets.map((t) => dist(n, t)))
    if (d < bestD) {
      bestD = d
      best = n
    }
  }
  return best
}

function endRound(s: State, ctx: Ctx) {
  if (s.phase === 'play') {
    for (const m of s.monsters) {
      if (m.kind === 'troll') {
        const targets = s.players.map((p) => p.pos)
        if (!targets.includes(m.pos)) m.pos = nearestStep(s, m.pos, targets)
        for (const p of s.players.filter((q) => q.pos === m.pos)) {
          ctx.log(`떠돌이 트롤이 ${ctx.name(p.seat)}를 덮쳤습니다.`, 'monster')
          hurt(s, p, MONSTERS.troll.atk, ctx)
        }
      }
      if (m.kind === 'lich') m.hp = Math.min(MONSTERS.lich.hp, m.hp + 3)
    }
  }
  if (s.phase === 'final' && s.demon) {
    const king = player(s, s.demon.seat)
    if (has(king, 'pilgrimRobe')) s.demon.hp = Math.min(s.demon.maxHp, s.demon.hp + 3)
    s.demon.chained = false
    s.demon.mirrorUsedRound = false
  }
  s.round++
  const lastPlay = CHAPTERS * ROUNDS_PER_CHAPTER
  if (s.phase === 'play') {
    if (s.round > lastPlay) return coronate(s, ctx)
    if ((s.round - 1) % ROUNDS_PER_CHAPTER === 0) {
      s.chapter++
      startChapter(s, ctx)
    }
  } else if (s.phase === 'final') {
    if (s.round > lastPlay + FINAL_ROUNDS) return finish(s, 'demon', ctx)
    dealCommunity(s, ctx)
  }
}

function dealCommunity(s: State, ctx: Ctx) {
  const n = s.community.length === 0 ? 3 : 1
  for (let i = 0; i < n; i++) {
    const c = drawCard(s)
    if (c) s.community.push(c)
  }
  const label = s.community.length <= 3 ? '플롭' : s.community.length === 4 ? '턴' : '리버'
  ctx.log(`${label}: 공용 카드가 열렸습니다.`, 'final')
}

// ───────────────────────── 대관식 · 최종전 ─────────────────────────

export function coronationScores(s: State): CoronationScore[] {
  return s.players.map((p) => {
    const shadow = shadowTotal(p)
    return { seat: p.seat, level: p.level, fame: p.fame, shadow, total: p.level + p.fame + shadow * 2 }
  })
}

function coronate(s: State, ctx: Ctx) {
  const scores = coronationScores(s)
  const king = [...scores].sort((a, b) => b.total - a.total || b.shadow - a.shadow || b.fame - a.fame || a.seat - b.seat)[0] as CoronationScore
  s.coronation = { king: king.seat, scores }
  const kp = player(s, king.seat)
  const allies = s.players.filter((p) => p.seat !== king.seat)
  const hp = demonHp(kp.level, allies.length) + (has(kp, 'leather') ? 5 : 0)
  s.demon = {
    seat: king.seat, hp, maxHp: hp, deck: R.shuffle(s.rng, s.graveyard), discard: [], holyWater: 0,
    chained: false, mirrorUsedRound: false, riverTwisted: false,
  }
  s.graveyard = []
  for (const c of kp.curses) c.revealed = true
  s.treasury = allies.reduce((t, p) => t + p.gold, 0)
  for (const p of allies) p.gold = 0
  for (const m of s.monsters) if (m.community) s.discard.push(m.community)
  s.monsters = []
  s.pending = []
  s.phase = 'final'
  s.chapter = 4
  kp.pos = THRONE
  const corners = [idx(2, 2), idx(2, 4), idx(4, 2), idx(4, 4)]
  allies.forEach((p, i) => {
    p.pos = corners[i] ?? (corners[0] as number)
    p.hp = maxHp(p)
    p.reserve = 0
  })
  for (const p of s.players) {
    p.skillUses = 0
    p.purifyUsed = false
    p.mirrorUsed = false
  }
  for (const t of s.board) {
    t.revealed = true
    delete t.monster
    if (t.kind === 'monster' || t.kind === 'boss') t.kind = 'empty'
  }
  ctx.log(`대관식 — 검은 왕관이 ${ctx.name(king.seat)}에게 내려앉았습니다! (판정 ${king.total}점, 그림자 ${king.shadow})`, 'crown')
  ctx.log(`마왕 체력 ${hp}. 묘지의 카드 ${s.demon.deck.length}장이 마왕의 덱이 되었습니다. 연합 금고 ${s.treasury}골드.`, 'crown')
  dealCommunity(s, ctx)
}

/** 마왕 체력(어둠 면 보너스 제외) */
export function demonHp(level: number, allies: number): number {
  return 10 + level * 3 + allies * 4
}

export function finalScore(s: State, p: Player): number {
  const king = s.demon ? player(s, s.demon.seat) : null
  const bonus = king && has(king, 'coinCharm') ? LAST_HIT_BONUS / 2 : LAST_HIT_BONUS
  return p.fame + Math.floor(p.finalDamage / 2) + (s.lastHitter === p.seat ? bonus : 0)
}

function finish(s: State, winner: 'demon' | 'coalition', ctx: Ctx) {
  s.phase = 'over'
  s.winner = winner
  s.pending = []
  s.attack = null
  const king = s.demon?.seat ?? -1
  const allies = s.players
    .filter((p) => p.seat !== king)
    .map((p) => ({ seat: p.seat, score: finalScore(s, p), dmg: p.finalDamage, level: p.level }))
    .sort((a, b) => b.score - a.score || b.dmg - a.dmg || b.level - a.level || a.seat - b.seat)
    .map(({ seat, score }) => ({ seat, score }))
  const kingRow = { seat: king, score: 0 }
  s.ranking = winner === 'demon' ? [kingRow, ...allies] : [...allies, kingRow]
  ctx.log(winner === 'demon' ? `마왕 ${ctx.name(king)}의 승리!` : `연합의 승리! 막타: ${s.lastHitter !== null ? ctx.name(s.lastHitter) : '-'}`, 'end')
}

// ───────────────────────── 피해 · 성장 ─────────────────────────

function hurt(s: State, target: Player, amount: number, ctx: Ctx) {
  if (amount <= 0 || target.out) return
  let p = target
  if (p.ironwall) return
  const ironAlly = s.players.find((k) => k.cls === 'knight' && k.ironwall && upg(k, 1, 0) && k.pos === p.pos && !isDemon(s, k.seat))
  if (ironAlly && !isDemon(s, p.seat)) return
  const guard = s.players.find((k) => k.cls === 'knight' && k.guard && k.seat !== p.seat && k.pos === p.pos && !k.out && !isDemon(s, k.seat))
  if (guard && !isDemon(s, p.seat)) {
    ctx.log(`${ctx.name(guard.seat)}가 ${ctx.name(p.seat)} 대신 피해를 받았습니다.`)
    p = guard
    if (p.ironwall) return
  }
  const dmg = Math.max(0, amount - (has(p, 'knightArmor') ? 1 : 0))
  p.hp -= dmg
  if (p.hp <= 0) knockOut(s, p, ctx)
}

function knockOut(s: State, p: Player, ctx: Ctx) {
  if (s.phase === 'final') {
    p.out = true
    p.hp = 0
    p.reserve = 0
    if (s.turn === p.seat) s.tokens = 0
    ctx.log(`${ctx.name(p.seat)}가 쓰러졌습니다.`, 'ko')
    if (coalition(s).every((c) => c.out)) finish(s, 'demon', ctx)
    return
  }
  const springs = s.board.map((t, i) => (t.kind === 'spring' && t.revealed && isOpen(s, i) ? i : -1)).filter((i) => i >= 0)
  const dest = springs.length ? springs.reduce((a, b) => (dist(p.pos, b) < dist(p.pos, a) ? b : a)) : CAMP
  p.pos = dest
  p.hp = Math.ceil(maxHp(p) / 2)
  p.reserve = 0
  if (s.turn === p.seat) s.tokens = 0
  if (hasCurse(p, 'deadRing')) {
    revealCurse(p, 'deadRing', ctx)
  } else {
    p.gold -= Math.floor(p.gold / 2)
    p.fame = Math.max(0, p.fame - 1)
  }
  ctx.log(`${ctx.name(p.seat)}가 쓰러져 ${dest === CAMP ? '야영지' : '샘'}에서 다시 일어납니다.`, 'ko')
}

function heal(s: State, p: Player, amount: number) {
  if (amount <= 0 || p.out) return
  let a = amount
  const king = s.demon ? player(s, s.demon.seat) : null
  if (s.demon && king && !isDemon(s, p.seat)) {
    if (has(king, 'lanternNecklace')) a = Math.max(0, a - 1)
    if (king.cls === 'priest') s.demon.hp = Math.min(s.demon.maxHp, s.demon.hp + a)
  }
  p.hp = Math.min(maxHp(p), p.hp + a)
}

function gainGold(s: State, p: Player, n: number) {
  if (n <= 0) return
  if (s.phase === 'final' && !isDemon(s, p.seat)) s.treasury += n
  else p.gold += n
}

function gainXp(s: State, p: Player, n: number, ctx: Ctx) {
  if (s.phase !== 'play') return
  p.xp += n
  while (p.level < MAX_LEVEL && p.xp >= (XP_TABLE[p.level] ?? Infinity)) {
    p.level++
    p.hp = maxHp(p)
    fillHand(s, p, ctx)
    ctx.log(`${ctx.name(p.seat)} 레벨 ${p.level}! 손패 ${p.level}장`, 'level')
    if (p.level === 3) s.pending.push({ kind: 'upgrade', seat: p.seat, tier: 0 })
    if (p.level === 5) s.pending.push({ kind: 'upgrade', seat: p.seat, tier: 1 })
  }
}

// ───────────────────────── 전투 ─────────────────────────

interface Played {
  owner: number
  card: Card
}

function communityFor(s: State, target: number): Card[] {
  if (target === -1) return s.community
  const m = s.monsters.find((x) => x.id === target)
  return m?.community ? [m.community] : []
}

function evaluate(s: State, attacker: Player, played: readonly Played[], target: number): HandResult | null {
  const pcs = played.map((x) => asPCard(player(s, x.owner), x.card, isDemon(s, x.owner)))
  const comm = communityFor(s, target).map((c) => asPCard(null, c, false))
  return bestHand(pcs, comm, mods(s, attacker))
}

/** 지금 이 카드로 공격하면 어떤 족보·피해가 되는지(화면 미리보기와 봇용) */
export function previewAttack(s: State, seat: number, target: number, cards: readonly number[]): { hand: HandResult; damage: number; blocked: boolean } | null {
  const p = s.players[seat]
  if (!p) return null
  const played: Played[] = []
  for (const id of cards) {
    const c = p.hand.find((h) => h.id === id)
    if (!c) return null
    played.push({ owner: seat, card: c })
  }
  if (s.attack && s.attack.attacker !== seat) {
    const atk = player(s, s.attack.attacker)
    const all = [...collectPlayed(s, s.attack), ...played]
    const hand = evaluate(s, atk, all, s.attack.target)
    if (!hand) return null
    const { damage, blocked } = damageOf(s, atk, hand, s.attack.target)
    return { hand, damage, blocked }
  }
  if (played.length > p.level) return null
  const hand = evaluate(s, p, played, target)
  if (!hand) return null
  const { damage, blocked } = damageOf(s, p, hand, target)
  return { hand, damage, blocked }
}

/** 진행 중인 공격(공격자 + 지금까지의 협공)의 피해 */
export function pendingDamage(s: State): number {
  const at = s.attack
  if (!at) return 0
  const atk = player(s, at.attacker)
  const hand = evaluate(s, atk, collectPlayed(s, at), at.target)
  return hand ? damageOf(s, atk, hand, at.target).damage : 0
}

function suitCount(hand: HandResult, suit: Suit): number {
  return hand.pattern.filter((c) => c.suit === suit).length
}

function damageOf(s: State, attacker: Player, hand: HandResult, target: number): { damage: number; blocked: boolean } {
  const def = target === -1 ? null : MONSTERS[s.monsters.find((m) => m.id === target)?.kind ?? 'slime']
  if (def?.minCat !== undefined && hand.cat < def.minCat) return { damage: 0, blocked: true }
  const mult = hand.cat === Cat.Flush || hand.cat === Cat.StraightFlush ? 3 : 1
  let dmg = power(hand.cat, hand.pattern)
  if (def?.resist !== 'blade') {
    dmg += suitCount(hand, 'blade') * mult
    if (attacker.cls === 'mage' && upg(attacker, 1, 1)) dmg += suitCount(hand, 'blade') * 2
  }
  if (has(attacker, 'warHammer')) dmg += suitCount(hand, 'ward')
  if (def?.weak) dmg += suitCount(hand, def.weak)
  if (attacker.whetstone) dmg += 3
  if (hasCurse(attacker, 'hungryBlade')) dmg += 3
  if (hand.cat === Cat.High && has(attacker, 'twinBlades')) dmg *= 2
  if (target === -1 && s.demon && !s.pierce) {
    const king = player(s, s.demon.seat)
    if (king.cls === 'knight') dmg = Math.floor(dmg / 2)
    if (has(king, 'knightArmor')) dmg = Math.max(0, dmg - 1)
  }
  return { damage: dmg, blocked: false }
}

function attackTargetPos(s: State, target: number): number {
  if (target === -1) return s.demon ? player(s, s.demon.seat).pos : -1
  const m = s.monsters.find((x) => x.id === target)
  if (!m) throw new IllegalAction('그 몬스터는 없습니다.')
  return m.pos
}

function startAttack(s: State, p: Player, a: { target: number; cards: number[] }, ctx: Ctx) {
  if (s.tokens < 1) throw new IllegalAction('행동 토큰이 없습니다.')
  if (isDemon(s, p.seat)) throw new IllegalAction('마왕은 광역 공격을 씁니다.')
  if (a.target === -1 && s.phase !== 'final') throw new IllegalAction('아직 마왕이 없습니다.')
  if (a.target !== -1 && s.phase !== 'play') throw new IllegalAction('지금은 몬스터가 없습니다.')
  const pos = attackTargetPos(s, a.target)
  const range = a.target === -1 ? Math.max(1, attackRange(p)) : attackRange(p)
  if (dist(p.pos, pos) > range) throw new IllegalAction('사거리 밖입니다.')
  checkInHand(p, a.cards)
  if (a.cards.length === 0) throw new IllegalAction('카드를 1장 이상 내야 합니다.')
  if (a.cards.length > p.level) throw new IllegalAction(`레벨 ${p.level}은 ${p.level}장까지 낼 수 있습니다.`)
  const played = a.cards.map((id) => ({ owner: p.seat, card: p.hand.find((c) => c.id === id) as Card }))
  if (!evaluate(s, p, played, a.target)) throw new IllegalAction('족보를 이루지 않는 카드가 섞여 있습니다.')
  s.tokens--
  const king = s.demon ? player(s, s.demon.seat) : null
  const noAssist = a.target === -1 && king?.cls === 'rogue'
  const waiting = noAssist
    ? []
    : s.players
        .filter((q) => q.seat !== p.seat && !q.out && !isDemon(s, q.seat) && q.reserve > 0 && q.hand.length > 0 && dist(q.pos, pos) <= 1)
        .map((q) => q.seat)
  s.attack = { attacker: p.seat, target: a.target, cards: [...a.cards], assists: [], waiting, shown: played.map((x) => ({ owner: x.owner, card: { ...x.card } })) }
  if (waiting.length === 0) resolveAttack(s, ctx)
}

function assist(s: State, seat: number, cards: number[] | null, ctx: Ctx) {
  const at = s.attack
  if (!at || !at.waiting.includes(seat)) throw new IllegalAction('지금은 협공할 수 없습니다.')
  if (cards) {
    const p = player(s, seat)
    checkInHand(p, cards)
    if (cards.length === 0) throw new IllegalAction('카드를 1장 이상 내야 합니다.')
    if (cards.length > p.level) throw new IllegalAction(`레벨 ${p.level}은 ${p.level}장까지 낼 수 있습니다.`)
    const atk = player(s, at.attacker)
    const all = collectPlayed(s, at)
    all.push(...cards.map((id) => ({ owner: seat, card: p.hand.find((c) => c.id === id) as Card })))
    if (!evaluate(s, atk, all, at.target)) throw new IllegalAction('합친 카드가 족보를 이루지 않습니다.')
    p.reserve--
    at.assists.push({ seat, cards: [...cards] })
    for (const id of cards) at.shown.push({ owner: seat, card: { ...(p.hand.find((c) => c.id === id) as Card) } })
    ctx.log(`${ctx.name(seat)} 협공!`)
  }
  at.waiting = at.waiting.filter((x) => x !== seat)
  if (at.waiting.length === 0) resolveAttack(s, ctx)
}

function collectPlayed(_s: State, at: PendingAttack): Played[] {
  return at.shown.map((x) => ({ owner: x.owner, card: x.card }))
}

function resolveAttack(s: State, ctx: Ctx) {
  const at = s.attack
  if (!at) return
  s.attack = null
  const attacker = player(s, at.attacker)
  const played = collectPlayed(s, at)
  const hand = evaluate(s, attacker, played, at.target)
  if (!hand) throw new IllegalAction('족보를 이루지 않습니다.')
  const { damage: rawDamage, blocked } = damageOf(s, attacker, hand, at.target)
  let damage = rawDamage
  const ownerOf = new Map<number, number>(played.map((x) => [x.card.id, x.owner]))
  const mult = hand.cat === Cat.Flush || hand.cat === Cat.StraightFlush ? 3 : 1

  // 낸 카드 정리
  takeFromHand(attacker, at.cards)
  for (const a of at.assists) takeFromHand(player(s, a.seat), a.cards)
  for (const x of played) {
    if (x.card.suit === null) {
      s.shadowFree.push(x.card.id)
      player(s, x.owner).shadow++
    } else if (isDemon(s, x.owner) && s.demon) s.demon.discard.push(x.card)
    else if (hand.cat >= Cat.Pair) s.graveyard.push(x.card)
    else s.discard.push(x.card)
  }

  const monster = at.target === -1 ? null : (s.monsters.find((m) => m.id === at.target) ?? null)
  const def = monster ? MONSTERS[monster.kind] : null
  const targetName = monster ? (def?.name ?? '') : '마왕'
  const king = s.demon ? player(s, s.demon.seat) : null

  // 마왕 쪽 방어
  if (at.target === -1 && s.demon && king) {
    if (s.pierce) s.pierce = false
    else if (has(king, 'mirrorShield') && !s.demon.mirrorUsedRound) {
      s.demon.mirrorUsedRound = true
      damage = 0
      ctx.log('거울 방패(어둠)가 공격을 튕겨 냈습니다.', 'demon')
    }
    if (has(king, 'thornArmor')) hurt(s, attacker, 1, ctx)
    if (has(king, 'dagger')) s.treasury = Math.max(0, s.treasury - 1)
  }

  // 문양 효과(카드 주인에게)
  const lanternMul = (q: Player) => (q.cls === 'priest' && upg(q, 0, 0) ? 2 : 1) * (has(q, 'lanternNecklace') ? 2 : 1) * (hand.cat === Cat.Full ? 2 : 1)
  let charmUsed = false
  for (const c of hand.pattern) {
    const owner = player(s, ownerOf.get(c.id) ?? attacker.seat)
    if (c.suit === 'lantern') heal(s, owner, mult * lanternMul(owner))
    if (c.suit === 'coin') {
      if (has(owner, 'coinCharm') && !charmUsed && s.phase === 'play') {
        charmUsed = true
        owner.fame += 1
      } else gainGold(s, owner, mult * (monster?.kind === 'goblin' ? 2 : 1))
    }
  }
  if (hasCurse(attacker, 'hungryBlade')) revealCurse(attacker, 'hungryBlade', ctx)

  // 피해
  const contributors = [attacker.seat, ...at.assists.map((a) => a.seat)]
  let killed = false
  let lastHitter: number | null = null
  const lastHitOf = (): number => {
    let best = attacker.seat
    let bestRank = -1
    for (const c of hand.pattern) {
      const o = ownerOf.get(c.id)
      if (o === undefined) continue
      const q = player(s, o)
      const r = c.rank + (q.cls === 'rogue' && upg(q, 0, 0) ? 2 : 0)
      if (r > bestRank || (r === bestRank && o === attacker.seat)) {
        bestRank = r
        best = o
      }
    }
    return best
  }
  if (monster && def) {
    monster.hp -= damage
    for (const c of contributors) if (!monster.contributors.includes(c)) monster.contributors.push(c)
    if (monster.hp <= 0) {
      killed = true
      lastHitter = lastHitOf()
    }
  } else if (s.demon) {
    s.demon.hp -= damage
    for (const c of contributors) player(s, c).finalDamage += Math.floor(damage / contributors.length) + (c === attacker.seat ? damage % contributors.length : 0)
    if (s.demon.hp <= 0) {
      s.demon.hp = 0
      killed = true
      lastHitter = lastHitOf()
    }
  }
  s.lastAttack = { attacker: attacker.seat, target: targetName, cat: hand.cat, damage, killed, lastHitter }
  ctx.log(`${ctx.name(attacker.seat)} → ${targetName}: ${handLabel(hand.cat)} ${blocked ? '— 통하지 않음!' : `피해 ${damage}`}${killed ? ' · 처치!' : ''}`, 'attack')

  if (hand.cat === Cat.StraightFlush) attacker.fame += 2
  if (hand.cat === Cat.Straight) for (const q of s.players) if (q.pos === attacker.pos && !isDemon(s, q.seat) && !q.out) q.bonusTokens++

  if (at.target === -1) {
    attacker.whetstone = false
    if (killed) {
      s.lastHitter = lastHitter
      finish(s, 'coalition', ctx)
    }
    return
  }
  if (!monster || !def) return

  // 사방: 주변 몬스터에게 절반
  if (hand.cat === Cat.Quads) {
    for (const m of s.monsters) {
      if (m.id === monster.id || dist(m.pos, monster.pos) > 1) continue
      m.hp -= Math.floor(damage / 2)
      if (!m.contributors.includes(attacker.seat)) m.contributors.push(attacker.seat)
      if (m.hp <= 0) killMonster(s, m, attacker.seat, ctx)
    }
  }

  // 반격
  if (!killed) {
    const counterless = hand.cat === Cat.Trips || hand.cat === Cat.Full || attacker.smoke
    if (!counterless) {
      const wardMul = (attacker.cls === 'knight' && upg(attacker, 0, 0) ? 2 : 1) * mult
      const wardCut = def.resist === 'ward' ? 0 : suitCount(hand, 'ward') * wardMul
      let counter = Math.max(0, def.atk - wardCut)
      if (counter > 0 && has(attacker, 'mirrorShield') && !attacker.mirrorUsed) {
        attacker.mirrorUsed = true
        counter = 0
        ctx.log(`${ctx.name(attacker.seat)}의 거울 방패가 반격을 막았습니다.`)
      }
      if (counter > 0) {
        if (has(attacker, 'thornArmor')) monster.hp -= 1
        if (attacker.cls === 'knight' && upg(attacker, 0, 1)) monster.hp -= 1
        hurt(s, attacker, counter, ctx)
        if (monster.hp <= 0) {
          killed = true
          lastHitter = attacker.seat
        }
      }
    }
    attacker.smoke = false
  }
  attacker.whetstone = false
  if (killed) killMonster(s, monster, lastHitter ?? attacker.seat, ctx)
}

function killMonster(s: State, m: Monster, lastHitter: number, ctx: Ctx) {
  if (!s.monsters.includes(m)) return
  const def = MONSTERS[m.kind]
  const rw = REWARDS[def.grade]
  s.monsters = s.monsters.filter((x) => x !== m)
  if (m.community) s.discard.push(m.community)
  const tile = s.board[m.pos]
  if (tile && (tile.kind === 'monster' || tile.kind === 'boss') && !s.monsters.some((x) => x.pos === m.pos)) tile.kind = 'empty'
  const last = player(s, lastHitter)
  for (const c of m.contributors) {
    const q = player(s, c)
    gainXp(s, q, rw.xpEach, ctx)
    if (m.kind === 'dragon') q.fame += 2
  }
  if (!m.contributors.includes(lastHitter)) gainXp(s, last, rw.xpEach, ctx)
  last.fame += rw.fame
  let gold = rw.gold * (last.cls === 'rogue' ? 2 : 1)
  if (has(last, 'dagger')) gold += 2
  if (has(last, 'merchantPouch')) gold += 1
  gainGold(s, last, gold)
  gainXp(s, last, rw.xpLast, ctx)
  ctx.log(`${ctx.name(lastHitter)}가 ${def.name}의 막타! 명성 +${rw.fame}, 골드 +${gold}`, 'kill')
  if (m.kind === 'mimic') {
    openTreasure(s, last, ctx)
    openTreasure(s, last, ctx)
  }
  if (m.kind === 'beast' && s.shadowFree.length > 0) s.pending.push({ kind: 'beast', seat: lastHitter })
}

// ───────────────────────── 타일 행동 ─────────────────────────

function spend(s: State, n = 1) {
  if (s.tokens < n) throw new IllegalAction('행동 토큰이 모자랍니다.')
  s.tokens -= n
}

function here(s: State, p: Player): Tile {
  return s.board[p.pos] as Tile
}

function requireTile(s: State, p: Player, kinds: TileKind[], label: string) {
  const t = here(s, p)
  if (!t.revealed || !kinds.includes(t.kind)) throw new IllegalAction(`${label}에서만 할 수 있습니다.`)
}

export function moveCost(s: State, p: Player, to: number): number {
  const t = s.board[to]
  if (!t) return Infinity
  let cost = 1
  // 숲은 미리 보였던 경우에만 추가 비용(뒤집으며 들어가면 몰랐던 것이므로 면제)
  if (t.kind === 'forest' && t.revealed && !has(p, 'leather') && !(p.cls === 'hunter' && upg(p, 0, 1))) cost++
  const boots = has(p, 'windBoots') && !p.movedOnce
  if (boots) cost--
  return Math.max(0, cost)
}

function move(s: State, p: Player, to: number, ctx: Ctx) {
  if (!neighbors(p.pos).includes(to)) throw new IllegalAction('이웃 칸으로만 움직일 수 있습니다.')
  if (!isOpen(s, to)) throw new IllegalAction('아직 열리지 않은 고리입니다.')
  if (isDemon(s, p.seat) && s.demon?.chained) throw new IllegalAction('봉인 사슬에 묶여 움직일 수 없습니다.')
  if (s.phase === 'final' && !isDemon(s, p.seat) && s.demon && player(s, s.demon.seat).pos === to) throw new IllegalAction('마왕의 칸에는 들어갈 수 없습니다.')
  spend(s, moveCost(s, p, to))
  p.movedOnce = true
  p.pos = to
  const t = s.board[to] as Tile
  if (!t.revealed) {
    t.revealed = true
    if (t.kind === 'monster' && t.monster) {
      const m = spawn(s, t.monster, to)
      delete t.monster
      ctx.log(`${ctx.name(p.seat)}가 ${MONSTERS[m.kind].name}을(를) 만났습니다.`, 'reveal')
    } else ctx.log(`${ctx.name(p.seat)}가 ${tileName(t.kind)}을(를) 발견했습니다.`, 'reveal')
  }
  for (const q of s.players) q.peeked = q.peeked.filter((i) => i !== to)
}

export function tileName(k: TileKind): string {
  return TILE_NAMES[k]
}

export function price(_s: State, p: Player, item: ItemId): number {
  let v = ITEMS[item].price
  if (has(p, 'merchantPouch')) v--
  if (p.cls === 'rogue' && upg(p, 0, 1)) v--
  return Math.max(1, v)
}

function equip(s: State, p: Player, item: ItemId) {
  const slot = ITEMS[item].slot
  if (slot !== 'weapon' && slot !== 'armor' && slot !== 'trinket') return
  const old = p[slot]
  if (old) s.itemPool.push(old)
  p[slot] = item
}

function buy(s: State, p: Player, item: ItemId, ctx: Ctx) {
  requireTile(s, p, ['shop'], '상점')
  const def = ITEMS[item]
  if (!def) throw new IllegalAction('없는 아이템입니다.')
  const cons = def.slot === 'consumable'
  if (cons ? !s.shop.cons.includes(item) : !s.shop.equip.includes(item)) throw new IllegalAction('진열되지 않은 아이템입니다.')
  if (cons && p.consumables.length >= MAX_CONSUMABLES) throw new IllegalAction(`소모품은 ${MAX_CONSUMABLES}개까지 가질 수 있습니다.`)
  const cost = price(s, p, item)
  if (p.gold < cost) throw new IllegalAction('골드가 모자랍니다.')
  spend(s)
  p.gold -= cost
  if (cons) p.consumables.push(item)
  else {
    s.shop.equip = s.shop.equip.filter((x) => x !== item)
    equip(s, p, item)
  }
  ctx.log(`${ctx.name(p.seat)}가 ${def.name}을(를) 샀습니다.`, 'shop')
}

function reroll(s: State, p: Player) {
  requireTile(s, p, ['shop'], '상점')
  if (p.gold < 1) throw new IllegalAction('골드가 모자랍니다.')
  p.gold--
  refreshShop(s)
}

function forge(s: State, p: Player, a: { card: number; mode: 'rank' | 'suit'; suit?: Suit }, ctx: Ctx) {
  requireTile(s, p, ['forge'], '대장간')
  const c = p.hand.find((h) => h.id === a.card)
  if (!c || c.suit === null) throw new IllegalAction('강화할 수 없는 카드입니다.')
  const cost = a.mode === 'rank' ? 3 : 2
  if (p.gold < cost) throw new IllegalAction('골드가 모자랍니다.')
  if (a.mode === 'rank' && c.rank >= 13) throw new IllegalAction('이미 가장 높은 숫자입니다.')
  if (a.mode === 'suit' && (!a.suit || a.suit === c.suit)) throw new IllegalAction('바꿀 문양을 고르세요.')
  spend(s)
  p.gold -= cost
  if (a.mode === 'rank') c.rank = Math.min(13, c.rank + 2)
  else c.suit = a.suit as Suit
  c.forged = true
  ctx.log(`${ctx.name(p.seat)}가 대장간에서 카드를 강화했습니다.`)
}

function rest(s: State, p: Player, ctx: Ctx) {
  requireTile(s, p, ['spring', 'camp'], '샘이나 야영지')
  spend(s)
  if (here(s, p).kind === 'camp') heal(s, p, 3)
  else {
    fillHand(s, p, ctx)
    if (has(p, 'pilgrimRobe')) {
      heal(s, p, 99)
      p.gold++
    }
  }
}

function altarDraws(s: State, n: number): AltarDraw[] {
  const bag: AltarDraw[] = [...BLESSINGS.map((b) => ({ blessing: b })), ...s.shadowFree.map((id) => ({ shadowId: id }))]
  return R.shuffle(s.rng, bag).slice(0, n)
}

function applyAltar(s: State, p: Player, d: AltarDraw, ctx: Ctx) {
  if ('shadowId' in d) {
    s.shadowFree = s.shadowFree.filter((x) => x !== d.shadowId)
    p.hand.push({ id: d.shadowId, suit: null, rank: 0 })
    return
  }
  switch (d.blessing) {
    case 'heal': heal(s, p, 5); break
    case 'xp': gainXp(s, p, 2, ctx); break
    case 'gold': gainGold(s, p, 3); break
    case 'fill': fillHand(s, p, ctx); break
    case 'fame': p.fame += 1; break
    case 'token': if (s.turn === p.seat) s.tokens += 1; break
  }
}

function pray(s: State, p: Player, ctx: Ctx) {
  requireTile(s, p, ['altar'], '제단')
  spend(s)
  if (!has(p, 'shadowCloak')) p.altarVisits++
  ctx.log(has(p, 'shadowCloak') ? '누군가 제단에서 조용히 기도했습니다.' : `${ctx.name(p.seat)}가 제단에서 기도했습니다.`, 'altar')
  if (p.cls === 'priest') {
    s.pending.push({ kind: 'altar', seat: p.seat, options: altarDraws(s, 2) })
    return
  }
  const d = altarDraws(s, 1)[0]
  if (d) applyAltar(s, p, d, ctx)
}

function openTreasure(s: State, p: Player, ctx: Ctx) {
  if (R.next(s.rng) < 0.2 && s.cursePool.length > 0) {
    const id = s.cursePool.shift() as ItemId
    p.curses.push({ id, revealed: false })
    ctx.log(`${ctx.name(p.seat)}가 보물상자에서 무언가를 챙겼습니다.`, 'treasure')
    return
  }
  const item = s.itemPool.shift()
  if (!item) return
  const slot = ITEMS[item].slot as 'weapon' | 'armor' | 'trinket'
  ctx.log(`${ctx.name(p.seat)}가 보물상자에서 ${ITEMS[item].name}을(를) 찾았습니다.`, 'treasure')
  if (p[slot] === null) equip(s, p, item)
  else s.pending.push({ kind: 'treasure', seat: p.seat, item })
}

function openChest(s: State, p: Player, ctx: Ctx) {
  requireTile(s, p, ['treasure'], '보물상자')
  spend(s)
  here(s, p).kind = 'empty'
  openTreasure(s, p, ctx)
}

function trade(s: State, p: Player, to: number, cardId: number) {
  const q = player(s, to)
  if (q.seat === p.seat || q.pos !== p.pos || q.out || isDemon(s, q.seat)) throw new IllegalAction('같은 칸의 아군과만 교환할 수 있습니다.')
  if (q.hand.length === 0) throw new IllegalAction('상대 손패가 없습니다.')
  const i = p.hand.findIndex((c) => c.id === cardId)
  if (i < 0) throw new IllegalAction('손에 없는 카드입니다.')
  spend(s)
  const [card] = p.hand.splice(i, 1)
  s.pending.push({ kind: 'trade', seat: q.seat, from: p.seat, card: card as Card })
}

function tradeReply(s: State, seat: number, cardId: number | null, ctx: Ctx) {
  const pd = s.pending[0]
  if (!pd || pd.kind !== 'trade' || pd.seat !== seat) throw new IllegalAction('교환 요청이 없습니다.')
  const from = player(s, pd.from)
  const q = player(s, seat)
  if (cardId === null) {
    from.hand.push(pd.card)
    ctx.log(`${ctx.name(seat)}가 교환을 거절했습니다.`)
  } else {
    const i = q.hand.findIndex((c) => c.id === cardId)
    if (i < 0) throw new IllegalAction('손에 없는 카드입니다.')
    const [give] = q.hand.splice(i, 1)
    from.hand.push(give as Card)
    q.hand.push(pd.card)
    ctx.log(`${ctx.name(pd.from)}와 ${ctx.name(seat)}가 카드를 바꿨습니다.`)
  }
  s.pending.shift()
}

function skill(s: State, p: Player, target: number | undefined, ctx: Ctx) {
  if (isDemon(s, p.seat)) throw new IllegalAction('마왕은 직업 액티브를 쓸 수 없습니다.')
  if (p.skillUses >= skillLimit(p)) throw new IllegalAction('이번 장에는 더 쓸 수 없습니다.')
  const name = p.cls ? CLASSES[p.cls].active.split(':')[0] : ''
  switch (p.cls) {
    case 'knight':
      p.ironwall = true
      break
    case 'mage': {
      if (s.phase === 'final') {
        const i = target ?? s.community.length - 1
        if (i < 0 || i >= s.community.length) throw new IllegalAction('바꿀 공용 카드가 없습니다.')
        const c = drawCard(s)
        if (!c) throw new IllegalAction('카드가 없습니다.')
        s.discard.push(s.community[i] as Card)
        s.community[i] = c
      } else {
        const m = s.monsters.find((x) => x.id === target && x.pos === p.pos) ?? s.monsters.find((x) => x.pos === p.pos)
        if (!m) throw new IllegalAction('같은 칸에 몬스터가 없습니다.')
        if (m.community) s.discard.push(m.community)
        m.community = drawCard(s)
      }
      break
    }
    case 'priest': {
      const range = upg(p, 1, 1) ? 2 : 1
      for (const q of s.players) {
        if (q.out || isDemon(s, q.seat) || dist(q.pos, p.pos) > range) continue
        drawTo(s, q, 1, ctx)
        if (upg(p, 0, 1)) heal(s, q, 3)
      }
      break
    }
    case 'rogue': {
      const c = s.graveyard.pop()
      if (!c) throw new IllegalAction('묘지가 비었습니다.')
      p.hand.push(c)
      break
    }
    case 'hunter': {
      const troll = s.monsters.find((m) => m.kind === 'troll')
      if (!troll) throw new IllegalAction('방랑 몬스터가 없습니다.')
      if (target === undefined || !s.board[target] || !isOpen(s, target)) throw new IllegalAction('열린 칸을 고르세요.')
      troll.pos = target
      break
    }
    default:
      throw new IllegalAction('직업이 없습니다.')
  }
  p.skillUses++
  ctx.log(`${ctx.name(p.seat)}: ${name}`, 'skill')
}

function consumeItem(s: State, p: Player, item: ItemId, ctx: Ctx) {
  const i = p.consumables.indexOf(item)
  if (i < 0) throw new IllegalAction('가지고 있지 않은 소모품입니다.')
  if (p.usedItem) throw new IllegalAction('소모품은 차례마다 1개만 쓸 수 있습니다.')
  switch (item) {
    case 'potion': heal(s, p, 4); break
    case 'scroll': {
      const hidden = s.board.map((t, k) => (!t.revealed && !p.peeked.includes(k) ? k : -1)).filter((k) => k >= 0)
      hidden.sort((a, b) => dist(p.pos, a) - dist(p.pos, b))
      p.peeked.push(...hidden.slice(0, 2))
      break
    }
    case 'smoke': p.smoke = true; break
    case 'whetstone': p.whetstone = true; break
    case 'feather': {
      const springs = s.board.map((t, k) => (t.kind === 'spring' && t.revealed && isOpen(s, k) ? k : -1)).filter((k) => k >= 0)
      if (springs.length === 0) throw new IllegalAction('열린 샘이 없습니다.')
      p.pos = springs.reduce((a, b) => (dist(p.pos, b) < dist(p.pos, a) ? b : a))
      break
    }
    case 'holyWater': p.shadow = Math.max(0, p.shadow - 1); break
    default: throw new IllegalAction('쓸 수 없는 아이템입니다.')
  }
  p.consumables.splice(i, 1)
  p.usedItem = true
  ctx.log(`${ctx.name(p.seat)}가 ${ITEMS[item].name}을(를) 썼습니다.`, 'item')
}

function choose(s: State, seat: number, option: number, ctx: Ctx) {
  const pd = s.pending[0]
  if (!pd || pd.seat !== seat || pd.kind === 'trade') throw new IllegalAction('고를 것이 없습니다.')
  const p = player(s, seat)
  switch (pd.kind) {
    case 'upgrade':
      if (option !== 0 && option !== 1) throw new IllegalAction('A 또는 B를 고르세요.')
      p.upgrades[pd.tier] = option
      if (p.cls) ctx.log(`${ctx.name(seat)} 강화: ${CLASSES[p.cls].upgrades[pd.tier][option]}`, 'level')
      if (p.cls === 'knight' && pd.tier === 1 && option === 1) p.hp += 6
      break
    case 'altar': {
      const d = pd.options[option]
      if (!d) throw new IllegalAction('없는 선택지입니다.')
      s.pending.shift()
      applyAltar(s, p, d, ctx)
      return
    }
    case 'treasure':
      if (option === 1) equip(s, p, pd.item)
      else s.itemPool.push(pd.item)
      break
    case 'beast':
      if (option === 1 && s.shadowFree.length > 0) {
        const id = s.shadowFree.shift() as number
        p.hand.push({ id, suit: null, rank: 0 })
      }
      break
  }
  s.pending.shift()
}

function ritual(s: State, p: Player, r: RitualId, ctx: Ctx) {
  if (s.phase !== 'final' || !s.demon || isDemon(s, p.seat)) throw new IllegalAction('최종전의 연합만 쓸 수 있습니다.')
  const def = RITUALS[r]
  if (!def) throw new IllegalAction('없는 의식입니다.')
  if (s.ritualsUsed.includes(r)) throw new IllegalAction('이미 쓴 의식입니다.')
  const cost = def.price + (has(player(s, s.demon.seat), 'merchantPouch') ? 2 : 0)
  if (s.treasury < cost) throw new IllegalAction('연합 금고가 모자랍니다.')
  s.treasury -= cost
  s.ritualsUsed.push(r)
  switch (r) {
    case 'holyWater': s.demon.holyWater++; break
    case 'chain': s.demon.chained = true; break
    case 'lantern': for (const q of coalition(s)) heal(s, q, 3); break
    case 'pierce': s.pierce = true; break
  }
  ctx.log(`봉인 의식: ${def.name} — ${def.text}`, 'ritual')
}

export function demonRange(_s: State, king: Player): number {
  return 1 + (king.cls === 'hunter' ? 1 : 0) + (has(king, 'longbow') ? 1 : 0)
}

function smiteDamage(king: Player, hand: HandResult): number {
  const mult = hand.cat === Cat.Flush || hand.cat === Cat.StraightFlush ? 3 : 1
  let dmg = power(hand.cat, hand.pattern) + suitCount(hand, 'blade') * mult
  if (hasCurse(king, 'hungryBlade')) dmg += 6
  if (hand.cat === Cat.High && has(king, 'twinBlades')) dmg *= 2
  if (has(king, 'heroSword')) dmg += 1
  return dmg
}

/** 마왕 광역 공격 미리보기 */
export function previewSmite(s: State, seat: number, cards: readonly number[]): { hand: HandResult; damage: number; targets: number[] } | null {
  const king = s.players[seat]
  if (!king || !isDemon(s, seat) || cards.length === 0 || cards.length > 5) return null
  const played: Played[] = []
  for (const id of cards) {
    const c = king.hand.find((h) => h.id === id)
    if (!c) return null
    played.push({ owner: seat, card: c })
  }
  const hand = evaluate(s, king, played, -1)
  if (!hand) return null
  const range = demonRange(s, king)
  const targets = coalition(s).filter((q) => !q.out && dist(q.pos, king.pos) <= range).map((q) => q.seat)
  return { hand, damage: smiteDamage(king, hand), targets }
}

function smite(s: State, king: Player, cards: number[], ctx: Ctx) {
  if (!s.demon || !isDemon(s, king.seat)) throw new IllegalAction('마왕만 쓸 수 있습니다.')
  checkInHand(king, cards)
  if (cards.length === 0 || cards.length > 5) throw new IllegalAction('카드를 1~5장 내세요.')
  const range = demonRange(s, king)
  const targets = coalition(s).filter((q) => !q.out && dist(q.pos, king.pos) <= range)
  if (targets.length === 0) throw new IllegalAction('사거리 안에 연합이 없습니다.')
  const played = cards.map((id) => ({ owner: king.seat, card: king.hand.find((c) => c.id === id) as Card }))
  const hand = evaluate(s, king, played, -1)
  if (!hand) throw new IllegalAction('족보를 이루지 않는 카드가 섞여 있습니다.')
  spend(s)
  const dmg = smiteDamage(king, hand)
  const mult = hand.cat === Cat.Flush || hand.cat === Cat.StraightFlush ? 3 : 1
  takeFromHand(king, cards)
  for (const x of played) {
    if (x.card.suit === null) s.shadowFree.push(x.card.id)
    else s.demon.discard.push(x.card)
  }
  s.demon.hp = Math.min(s.demon.maxHp, s.demon.hp + suitCount(hand, 'lantern') * mult)
  s.lastAttack = { attacker: king.seat, target: '연합', cat: hand.cat, damage: dmg, killed: false, lastHitter: null }
  ctx.log(`마왕의 광역 공격: ${handLabel(hand.cat)} 피해 ${dmg} → ${targets.map((t) => ctx.name(t.seat)).join(', ')}`, 'demon')
  for (const t of targets) {
    hurt(s, t, dmg, ctx)
    if (s.phase === 'over') return
  }
}

function push(s: State, king: Player, target: number, ctx: Ctx) {
  if (!s.demon || !isDemon(s, king.seat)) throw new IllegalAction('마왕만 쓸 수 있습니다.')
  if (s.demon.chained) throw new IllegalAction('봉인 사슬에 묶여 있습니다.')
  const q = player(s, target)
  if (q.out || isDemon(s, q.seat) || dist(q.pos, king.pos) !== 1) throw new IllegalAction('이웃 칸의 연합만 밀칠 수 있습니다.')
  spend(s)
  const dr = rowOf(q.pos) - rowOf(king.pos)
  const dc = colOf(q.pos) - colOf(king.pos)
  const steps = has(king, 'warHammer') ? 2 : 1
  for (let i = 0; i < steps; i++) {
    const r = rowOf(q.pos) + dr
    const c = colOf(q.pos) + dc
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) break
    q.pos = idx(r, c)
  }
  ctx.log(`마왕이 ${ctx.name(q.seat)}를 밀쳐 냈습니다.`, 'demon')
}

function twist(s: State, king: Player, ctx: Ctx) {
  if (!s.demon || !isDemon(s, king.seat) || king.cls !== 'mage') throw new IllegalAction('마법사 마왕만 쓸 수 있습니다.')
  if (s.demon.riverTwisted) throw new IllegalAction('이미 썼습니다.')
  if (s.community.length < 5) throw new IllegalAction('리버가 아직 열리지 않았습니다.')
  const c = drawCard(s)
  if (!c) throw new IllegalAction('카드가 없습니다.')
  s.discard.push(s.community[4] as Card)
  s.community[4] = c
  s.demon.riverTwisted = true
  ctx.log('마왕이 운명을 비틀어 리버를 다시 뽑았습니다!', 'demon')
}

// ───────────────────────── 누가 둘 차례인가 ─────────────────────────

export function actors(s: State): number[] {
  if (s.phase === 'over') return []
  const pd = s.pending[0]
  if (pd) return [pd.seat]
  if (s.attack) return [...s.attack.waiting]
  return [s.turn]
}

// ───────────────────────── 적용 ─────────────────────────

export function apply(prev: State, seat: number, a: Action, ctx: Ctx): State {
  if (!actors(prev).includes(seat)) throw new IllegalAction('지금은 차례가 아닙니다.')
  const s: State = structuredClone(prev)
  const p = player(s, seat)
  const pd = s.pending[0]

  if (pd) {
    if (a.type === 'tradeReply') tradeReply(s, seat, a.card, ctx)
    else if (a.type === 'choose') choose(s, seat, a.option, ctx)
    else throw new IllegalAction('먼저 고를 것을 고르세요.')
    return s
  }
  if (s.attack) {
    if (a.type === 'assist') assist(s, seat, a.cards, ctx)
    else if (a.type === 'pass') assist(s, seat, null, ctx)
    else throw new IllegalAction('협공할지 먼저 정하세요.')
    return s
  }
  if (s.phase === 'draft') {
    if (a.type !== 'pickClass') throw new IllegalAction('직업을 먼저 고르세요.')
    if (!CLASS_IDS.includes(a.cls) || s.players.some((q) => q.cls === a.cls)) throw new IllegalAction('고를 수 없는 직업입니다.')
    p.cls = a.cls
    ctx.log(`${ctx.name(seat)}: ${CLASSES[a.cls].name}`)
    s.turn = (s.turn + 1) % s.seats
    if (s.players.every((q) => q.cls !== null)) {
      s.phase = 'play'
      s.turn = s.firstSeat
      startChapter(s, ctx)
      startTurn(s, ctx)
    }
    return s
  }

  const demonTurn = isDemon(s, seat)
  switch (a.type) {
    case 'move': move(s, p, a.to, ctx); break
    case 'attack': startAttack(s, p, a, ctx); break
    case 'draw':
      if (p.hand.length >= handLimit(s, p)) throw new IllegalAction('손패가 가득 찼습니다.')
      spend(s)
      drawTo(s, p, 1, ctx)
      break
    case 'buy': if (s.phase !== 'play') throw new IllegalAction('지금은 살 수 없습니다.'); buy(s, p, a.item, ctx); break
    case 'reroll': if (s.phase !== 'play') throw new IllegalAction('지금은 할 수 없습니다.'); reroll(s, p); break
    case 'forge': if (s.phase !== 'play') throw new IllegalAction('지금은 할 수 없습니다.'); forge(s, p, a, ctx); break
    case 'rest': if (s.phase !== 'play') throw new IllegalAction('지금은 할 수 없습니다.'); rest(s, p, ctx); break
    case 'pray': if (s.phase !== 'play') throw new IllegalAction('지금은 할 수 없습니다.'); pray(s, p, ctx); break
    case 'open': if (s.phase !== 'play') throw new IllegalAction('지금은 할 수 없습니다.'); openChest(s, p, ctx); break
    case 'trade': if (demonTurn) throw new IllegalAction('마왕은 교환할 수 없습니다.'); trade(s, p, a.to, a.card); break
    case 'skill': skill(s, p, a.target, ctx); break
    case 'purify':
      if (p.cls !== 'priest' || !upg(p, 1, 0) || p.purifyUsed) throw new IllegalAction('정화를 쓸 수 없습니다.')
      p.purifyUsed = true
      p.shadow = Math.max(0, p.shadow - 1)
      ctx.log(`${ctx.name(seat)}가 정화를 올렸습니다.`, 'skill')
      break
    case 'use': consumeItem(s, p, a.item, ctx); break
    case 'guard':
      if (p.cls !== 'knight') throw new IllegalAction('기사만 쓸 수 있습니다.')
      p.guard = a.on
      break
    case 'ritual': ritual(s, p, a.ritual, ctx); break
    case 'smite': smite(s, p, a.cards, ctx); break
    case 'push': push(s, p, a.target, ctx); break
    case 'twist': twist(s, p, ctx); break
    case 'end': endTurn(s, ctx); break
    default: throw new IllegalAction('지금은 할 수 없는 행동입니다.')
  }
  return s
}

// ───────────────────────── 보이는 상태 ─────────────────────────

export type HiddenTile = Omit<Tile, 'monster' | 'kind'> & { kind: TileKind | 'hidden' }
export interface PlayerView extends Omit<Player, 'hand' | 'shadow' | 'curses'> {
  hand: Card[] | null
  handCount: number
  shadow: number | null
  curses: { id: ItemId | null; revealed: boolean }[]
}
export interface View extends Omit<State, 'rng' | 'board' | 'deck' | 'players' | 'pending' | 'itemPool' | 'cursePool' | 'shadowFree' | 'demon'> {
  board: HiddenTile[]
  deckCount: number
  shadowFreeCount: number
  players: PlayerView[]
  pending: (Pending | { kind: Pending['kind']; seat: number })[]
  demon: (Omit<Demon, 'deck' | 'hp'> & { deckCount: number; hp: number | null }) | null
  me: number | null
}

export function view(s: State, seat: number | null): View {
  const me = seat === null ? null : (s.players[seat] ?? null)
  const over = s.phase === 'over'
  const board: HiddenTile[] = s.board.map((t, i) => {
    const { monster: _m, ...rest } = t
    void _m
    if (t.revealed || over || me?.peeked.includes(i)) return { ...rest }
    return { ...rest, kind: 'hidden' }
  })
  const players: PlayerView[] = s.players.map((p) => {
    const mine = p.seat === seat || over
    return {
      ...p,
      hand: mine ? p.hand : null,
      handCount: p.hand.length,
      shadow: mine || s.coronation ? p.shadow : null,
      curses: p.curses.map((c) => (mine || c.revealed ? c : { id: null, revealed: false })),
      peeked: p.seat === seat ? p.peeked : [],
      altarVisits: p.altarVisits,
    }
  })
  const king = s.demon ? s.players[s.demon.seat] : undefined
  const hideHp = !!(king && has(king, 'shadowCloak') && seat !== s.demon?.seat && !over)
  const { rng: _r, deck, itemPool: _i, cursePool: _c, shadowFree, demon, pending, ...rest } = s
  void _r
  void _i
  void _c
  return {
    ...rest,
    board,
    deckCount: deck.length,
    shadowFreeCount: shadowFree.length,
    players,
    pending: pending.map((x) => (x.seat === seat ? x : { kind: x.kind, seat: x.seat })),
    demon: demon ? { ...(({ deck: _d, ...d }) => (void _d, d))(demon), deckCount: demon.deck.length, hp: hideHp ? null : demon.hp } : null,
    me: seat,
  }
}

export { HAND_NAMES, SUIT_NAMES }
