// RETROCAUSE 규칙 엔진. 룰북(rules/rulebook.md) v0.2 를 그대로 옮긴다(옛 prototype/src/engine.js 와 같은 판정).
// 순수 함수로 작성해 봇·테스트·화면·서버가 같은 판정을 쓴다. React·DOM·시간·전역 난수를 쓰지 않는다(옛 엔진의 기본값 seed = Date.now(), rng = Math.random 은 없앴다. 호출하는 쪽이 늘 넘긴다).
import { CARDS, FIGURES, SUBJECTS } from './cards.ts'
import type { Action, Card, ContradictionKind, DecisiveInfo, Fact, Figure, Game, Guess, HistoryEntry, IllegalReason, Removed, Rules, Score, ScoreRow } from './types.ts'

export { CARDS, FIGURES, SUBJECTS }
export const CARD: Record<string, Card> = Object.fromEntries(CARDS.map((c) => [c.id, c]))
export const INITIAL: Record<string, string> = Object.fromEntries(SUBJECTS.map((s) => [s.id, s.states[0]]))
export const ENDING_POOL: Fact[] = SUBJECTS.flatMap((s) => s.states.map((state) => ({ subject: s.id, state })))

export const DEFAULT_RULES: Rules = {
  slotsByPlayers: { 3: 9, 4: 12, 5: 15 }, // 룰북 3장 2번 (가안)
  handSize: 4, // 3장 12번 (가안)
  points: { decisive: 3, card: 1, deduction: 1, paradox: -2 }, // 8.3 (가안)
}

/** 카드 번호인지(프로토타입 키 '__proto__' 같은 것을 막는다) */
export const isCardId = (id: unknown): id is string => typeof id === 'string' && Object.hasOwn(CARD, id)

// ---------- 난수 (시드 재현용) ----------
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(list: readonly T[], rng: () => number): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

// ---------- 판정 (5장·6장·7장) ----------
const card = (id: string | null | undefined): Card | null => (id ? (CARD[id] ?? null) : null)

/** 5.1 왼쪽 최근 사실 규칙: 칸 slot(0부터) 에서, 그 칸 카드가 일어나기 직전의 대상 상태 */
export function stateAt(timeline: readonly (string | null)[], slot: number, subject: string): string {
  for (let i = slot - 1; i >= 0; i--) {
    const c = card(timeline[i])
    if (c && c.effect.subject === subject) return c.effect.state
  }
  return INITIAL[subject]!
}

export function conditionHolds(timeline: readonly (string | null)[], slot: number, c: Card): boolean {
  return !c.cond || stateAt(timeline, slot, c.cond.subject) === c.cond.state
}

function rightmostEffectSlot(timeline: readonly (string | null)[], subject: string): number {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const c = card(timeline[i])
    if (c && c.effect.subject === subject) return i
  }
  return -1
}

/** 6.1 의 두 모순. 칸 slot 의 카드가 모순 카드인지와 그 종류 */
export function contradictionAt(timeline: readonly (string | null)[], slot: number, endings: readonly Fact[]): ContradictionKind | null {
  const c = card(timeline[slot])
  if (!c) return null
  if (!conditionHolds(timeline, slot, c)) return 'condition'
  const ending = endings.find((e) => e.subject === c.effect.subject)
  if (ending && rightmostEffectSlot(timeline, ending.subject) === slot && c.effect.state !== ending.state) {
    return 'ending'
  }
  return null
}

/** 5.2 금지 배치. 놓을 수 있으면 null, 아니면 이유 */
export function illegalReason(timeline: readonly (string | null)[], cardId: string, slot: number, endings: readonly Fact[]): IllegalReason | null {
  if (slot < 0 || slot >= timeline.length || timeline[slot]) return 'occupied'
  const c = CARD[cardId]!
  if (!conditionHolds(timeline, slot, c)) return 'condition'
  const next = [...timeline]
  next[slot] = cardId
  if (contradictionAt(next, slot, endings) === 'ending') return 'ending'
  return null
}

export function legalSlots(timeline: readonly (string | null)[], cardId: string, endings: readonly Fact[]): number[] {
  const out: number[] = []
  for (let i = 0; i < timeline.length; i++) if (!illegalReason(timeline, cardId, i, endings)) out.push(i)
  return out
}

/** 6.2 연쇄 정리. 버려진 카드를 순서대로 돌려준다 */
export function cascade(timeline: readonly (string | null)[], endings: readonly Fact[]): { timeline: (string | null)[]; removed: Removed[] } {
  const tl = [...timeline]
  const removed: Removed[] = []
  for (;;) {
    let hit = -1
    let kind: ContradictionKind | null = null
    for (let i = 0; i < tl.length; i++) {
      kind = contradictionAt(tl, i, endings)
      if (kind) {
        hit = i
        break
      }
    }
    if (hit < 0 || !kind) break
    removed.push({ slot: hit, cardId: tl[hit]!, kind })
    tl[hit] = null
  }
  return { timeline: tl, removed }
}

/** 7.1 결정 원인: 결과가 결말과 같고 조건 아이콘이 있는 카드 중 가장 오른쪽 */
export function decisiveCause(timeline: readonly (string | null)[], ending: Fact): { slot: number; cardId: string } | null {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const c = card(timeline[i])
    if (c && c.cond && c.effect.subject === ending.subject && c.effect.state === ending.state) {
      return { slot: i, cardId: c.id }
    }
  }
  return null
}

/** 8.2 1번 미해결 결말 */
export function isUnresolved(timeline: readonly (string | null)[], ending: Fact): boolean {
  return rightmostEffectSlot(timeline, ending.subject) < 0 && INITIAL[ending.subject] !== ending.state
}

// ---------- 게임 진행 (3장·4장·8장) ----------

export interface NewGameOptions {
  names: readonly string[]
  seed: number
  rules?: Rules
  endings?: Fact[]
  motives?: Figure[]
}

/** 3장 준비. names 길이가 인원수다. 시작 플레이어는 0번 자리다. */
export function newGame({ names, seed, rules = DEFAULT_RULES, endings: fixedEndings, motives: fixedMotives }: NewGameOptions): Game {
  const n = names.length
  if (n < 3 || n > 5) throw new Error('인원은 3~5명이다')
  const rng = makeRng(seed)
  let endings = fixedEndings
  if (!endings) {
    endings = []
    for (const e of shuffle(ENDING_POOL, rng)) {
      if (!endings.some((x) => x.subject === e.subject)) endings.push(e)
      if (endings.length === 3) break
    }
  }
  const motives = fixedMotives ?? shuffle(FIGURES, rng).slice(0, n)
  let deck = shuffle(
    CARDS.map((c) => c.id),
    rng,
  )
  const hands = names.map(() => {
    const h = deck.slice(0, rules.handSize)
    deck = deck.slice(rules.handSize)
    return h
  })
  return {
    rules,
    seed,
    rngState: Math.floor(rng() * 2 ** 32),
    names: [...names],
    endings,
    motives,
    timeline: Array<string | null>(rules.slotsByPlayers[n]!).fill(null),
    deck,
    discard: [],
    hands,
    paradox: names.map(() => 0),
    current: 0,
    round: 1,
    turns: names.map(() => 0),
    finalRound: false,
    over: false,
    history: [], // 공개 정보: {player, type, cardId?, slot?, removed?}
    stats: { cascades: 0, removedCards: 0, endTrigger: null },
  }
}

export function canPass(g: Game): boolean {
  return g.deck.length === 0 || g.timeline.every(Boolean)
}
export function canExchange(g: Game): boolean {
  return g.deck.length > 0
}

/** 활성 플레이어의 가능한 행동 목록 */
export function legalActions(g: Game): Action[] {
  if (g.over) return []
  const p = g.current
  const acts: Action[] = []
  for (const cardId of g.hands[p]!) {
    for (const slot of legalSlots(g.timeline, cardId, g.endings)) acts.push({ type: 'place', cardId, slot })
  }
  if (canExchange(g)) for (const cardId of g.hands[p]!) acts.push({ type: 'exchange', cardId })
  if (canPass(g)) acts.push({ type: 'pass' })
  return acts
}

/** 행동을 적용한 새 상태를 돌려준다. 잘못된 행동은 예외(받은 상태는 바꾸지 않는다). */
export function applyAction(g0: Game, action: Action): Game {
  if (g0.over) throw new Error('게임이 끝났다')
  const g = structuredClone(g0)
  const p = g.current
  const hand = g.hands[p]!
  const entry: HistoryEntry = { player: p, type: action.type, round: g.round }

  if (action.type === 'place') {
    const idx = hand.indexOf(action.cardId)
    if (idx < 0) throw new Error('손에 없는 카드')
    const why = illegalReason(g.timeline, action.cardId, action.slot, g.endings)
    if (why) throw new Error(`금지 배치: ${why}`)
    hand.splice(idx, 1)
    g.timeline[action.slot] = action.cardId
    const res = cascade(g.timeline, g.endings)
    g.timeline = res.timeline
    g.discard.push(...res.removed.map((r) => r.cardId))
    g.paradox[p]! += res.removed.length
    if (res.removed.length) {
      g.stats.cascades += 1
      g.stats.removedCards += res.removed.length
    }
    if (g.deck.length) hand.push(g.deck.shift()!)
    Object.assign(entry, { cardId: action.cardId, slot: action.slot, removed: res.removed })
  } else if (action.type === 'exchange') {
    if (!canExchange(g)) throw new Error('덱이 비어 교체할 수 없다')
    const idx = hand.indexOf(action.cardId)
    if (idx < 0) throw new Error('손에 없는 카드')
    hand.splice(idx, 1)
    g.discard.push(action.cardId)
    hand.push(g.deck.shift()!)
    entry.cardId = action.cardId
  } else if (action.type === 'pass') {
    if (!canPass(g)) throw new Error('지금은 패스할 수 없다')
  } else {
    throw new Error(`알 수 없는 행동 ${(action as { type: string }).type}`)
  }
  g.history.push(entry)
  g.turns[p]! += 1

  // 8.1 종료 조건
  if (!g.finalRound && (g.timeline.every(Boolean) || g.deck.length === 0)) {
    g.finalRound = true
    g.stats.endTrigger = g.timeline.every(Boolean) ? 'timeline' : 'deck'
  }
  if (p === g.names.length - 1) {
    if (g.finalRound) g.over = true
    else g.round += 1
  }
  g.current = (p + 1) % g.names.length
  return g
}

/** 8.2~8.4 종료 절차. guesses[p] = {상대번호: 인물} */
export function finalScore(g: Game, guesses: readonly (Guess | null | undefined)[] = []): Score {
  const pts = g.rules.points
  const n = g.names.length
  const unresolved = g.endings.filter((e) => isUnresolved(g.timeline, e))
  const paradox = g.paradox.map((x) => x + unresolved.length)
  const decisive: DecisiveInfo[] = g.endings.map((e) => {
    const d = decisiveCause(g.timeline, e)
    return { ending: e, ...(d ?? {}), figure: d ? CARD[d.cardId]!.figure : null }
  })
  const rows: ScoreRow[] = []
  for (let p = 0; p < n; p++) {
    const fig = g.motives[p]!
    const dc = decisive.filter((d) => d.figure === fig).length
    const cards = g.timeline.filter((id) => id && CARD[id]!.figure === fig).length
    const guess = guesses[p] ?? {}
    const correct = Object.entries(guess).filter(([q, f]) => Number(q) !== p && g.motives[Number(q)] === f).length
    const total = dc * pts.decisive + cards * pts.card + correct * pts.deduction + paradox[p]! * pts.paradox
    rows.push({ player: p, name: g.names[p]!, figure: fig, decisive: dc, cards, correct, paradox: paradox[p]!, total })
  }
  const best = Math.max(...rows.map((r) => r.total))
  let top = rows.filter((r) => r.total === best)
  const fewest = Math.min(...top.map((r) => r.paradox))
  top = top.filter((r) => r.paradox === fewest)
  return { rows, winners: top.map((r) => r.player), decisive, unresolved }
}

/** 8.2 2번 검사: 한 인물은 한 번만, 자기 자신은 적지 않는다 */
export function validGuess(_g: Game, p: number, guess: Guess): boolean {
  const figs = Object.entries(guess)
    .filter(([q]) => Number(q) !== p)
    .map(([, f]) => f)
  return new Set(figs).size === figs.length && figs.every((f) => FIGURES.includes(f))
}
