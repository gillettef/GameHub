// 봇 전략(옛 prototype/src/bots.js 와 같은 판단). 봇은 자기 손패·비밀 목표 인물과 공개 정보(시간선, 기록)만 본다.
import { CARD, FIGURES, applyAction, cascade, decisiveCause, illegalReason, legalActions, makeRng } from './engine.ts'
import type { Action, Fact, Figure, Game, Guess, Rules } from './types.ts'

export interface BotStyle {
  label: string
  greedy: number
  harm: number
  bluff: number
  noise: number
  activity?: number
  lookahead?: number
}

/** 시간선에서 인물 f 가 지금 얻는 점수(결정 원인 + 카드) */
export function figureValue(timeline: readonly (string | null)[], endings: readonly Fact[], f: Figure, points: Rules['points']): number {
  let v = 0
  for (const e of endings) {
    const d = decisiveCause(timeline, e)
    if (d && CARD[d.cardId]!.figure === f) v += points.decisive
  }
  for (const id of timeline) if (id && CARD[id]!.figure === f) v += points.card
  return v
}

export const BOT_STYLES = {
  // 무작위로 합법적인 놓기를 고른다(놓을 게 없으면 교체·패스)
  random: { label: '무작위', greedy: 0, harm: 0, bluff: 0, noise: 1 },
  // 자기 점수만 본다
  greedy: { label: '직진형', greedy: 1, harm: 0, bluff: 0, noise: 0.15, activity: 0 },
  // 자기 점수 + 남의 점수 깎기
  rival: { label: '견제형', greedy: 1, harm: 0.35, bluff: 0, noise: 0.15, activity: 0 },
  // 견제 + 남의 인물 카드로 위장
  bluffer: { label: '위장형', greedy: 1, harm: 0.25, bluff: 0.5, noise: 0.2, activity: 0 },
} satisfies Record<string, BotStyle>

export type BotKey = keyof typeof BOT_STYLES

/** 놓기를 시간선에만 적용한다(빠른 평가용) */
function placeOn(timeline: readonly (string | null)[], endings: readonly Fact[], cardId: string, slot: number) {
  const t = [...timeline]
  t[slot] = cardId
  return cascade(t, endings)
}

/** 손패 cards 중 인물 me 의 카드를 다음에 놓았을 때 얻을 수 있는 최대 이득(1수 앞보기) */
function bestFollowUp(timeline: readonly (string | null)[], endings: readonly Fact[], cards: readonly string[], me: Figure, pts: Rules['points']): number {
  const base = figureValue(timeline, endings, me, pts)
  let best = 0
  for (const id of cards) {
    if (CARD[id]!.figure !== me) continue
    for (let s = 0; s < timeline.length; s++) {
      if (illegalReason(timeline, id, s, endings)) continue
      const r = placeOn(timeline, endings, id, s)
      const v = figureValue(r.timeline, endings, me, pts) - base + r.removed.length * pts.paradox
      if (v > best) best = v
    }
  }
  return best
}

/** 행동 하나를 고른다 */
export function chooseAction(g: Game, style: BotStyle = BOT_STYLES.rival, rng: () => number): Action {
  const p = g.current
  const me = g.motives[p]!
  const pts = g.rules.points
  const acts = legalActions(g)
  if (!acts.length) throw new Error('가능한 행동이 없다')
  if (style.greedy === 0) {
    const places = acts.filter((a) => a.type === 'place')
    const pool = places.length ? places : acts
    return pool[Math.floor(rng() * pool.length)]!
  }
  const { timeline, endings } = g
  const hand = g.hands[p]!
  const others = FIGURES.filter((f) => f !== me)
  const before = Object.fromEntries(FIGURES.map((f) => [f, figureValue(timeline, endings, f, pts)])) as Record<Figure, number>
  const look = g.finalRound ? 0 : (style.lookahead ?? 0.6)
  const without = (id: string) => {
    const h = [...hand]
    h.splice(h.indexOf(id), 1)
    return h
  }
  const placeable = new Set(acts.flatMap((a) => (a.type === 'place' ? [a.cardId] : [])))

  let best: Action | null = null
  let bestV = -Infinity
  for (const a of acts) {
    let v: number
    if (a.type === 'place') {
      const r = placeOn(timeline, endings, a.cardId, a.slot)
      const gainMe = figureValue(r.timeline, endings, me, pts) - before[me]
      const paradox = r.removed.length * pts.paradox
      let harm = 0
      for (const f of others) harm += before[f] - figureValue(r.timeline, endings, f, pts)
      const follow = look * bestFollowUp(r.timeline, endings, without(a.cardId), me, pts)
      const fig = CARD[a.cardId]!.figure
      const bluff = fig === me ? (gainMe <= pts.card ? -style.bluff : 0) : style.bluff * 0.6
      v = gainMe + paradox + style.harm * harm + follow + bluff
    } else if (a.type === 'exchange') {
      const follow = look * bestFollowUp(timeline, endings, without(a.cardId), me, pts)
      // activity: 놓을 수 있는 카드를 두고 교체하기를 꺼리는 정도(사람다운 적극성)
      const act = style.activity ?? 0
      const dig = !placeable.has(a.cardId) ? 0.3 - act * 0.15 : CARD[a.cardId]!.figure === me ? -0.6 : 0.1 - act
      v = follow + dig
    } else {
      v = look * bestFollowUp(timeline, endings, hand, me, pts) + 0.05
    }
    v += (rng() - 0.5) * style.noise
    if (v > bestV) {
      bestV = v
      best = a
    }
  }
  return best!
}

/** 8.2 추리: 공개 기록으로 상대마다 서로 다른 인물을 추정한다 */
export function guessMotives(g: Game, p: number): Guess {
  const n = g.names.length
  const score: Record<number, Record<Figure, number>> = {}
  for (let q = 0; q < n; q++) score[q] = Object.fromEntries(FIGURES.map((f) => [f, 0])) as Record<Figure, number>
  for (const h of g.history) {
    if (h.player === p || !h.cardId) continue
    const f = CARD[h.cardId]!.figure
    if (h.type === 'place') score[h.player]![f] += CARD[h.cardId]!.cond ? 1.2 : 0.8
    if (h.type === 'exchange') score[h.player]![f] -= 0.6
  }
  const pairs: { q: number; f: Figure; s: number }[] = []
  for (let q = 0; q < n; q++) {
    if (q === p) continue
    for (const f of FIGURES) if (f !== g.motives[p]) pairs.push({ q, f, s: score[q]![f] })
  }
  pairs.sort((a, b) => b.s - a.s)
  const guess: Guess = {}
  const used = new Set<Figure>()
  for (const { q, f } of pairs) {
    if (guess[q] !== undefined || used.has(f)) continue
    guess[q] = f
    used.add(f)
  }
  return guess
}

/** 봇끼리 한 판을 끝까지 진행한다(시뮬레이터·테스트용) */
export function playBotGame(g: Game, styles: readonly BotStyle[], seed: number): Game {
  const rng = makeRng(seed)
  let state = g
  let guard = 0
  while (!state.over) {
    state = applyAction(state, chooseAction(state, styles[state.current], rng))
    if (++guard > 500) throw new Error('게임이 끝나지 않는다')
  }
  return state
}
