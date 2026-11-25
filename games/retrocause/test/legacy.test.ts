// 옛 엔진(prototype/src/*.js, 이전 커밋 2be493c)과 같은 시드·행동에서 새 엔진·봇이 같은 수를 두고 같은 상태가 되는지 확인한다.
// fixtures/legacy-traces.json 은 옛 엔진+봇으로 3·4·5인, 봇 유형·적극성, 규칙 수치 변형, 고정 결말·목표 판을 끝까지 두며
// 행동마다 둔 수, 거절 이유, 합법 행동 목록 해시, 상태 해시, 좌석별 화면 정보(makeView, 관전 포함) 해시를 기록한 것이다.
// chaos 판은 아무 행동(손에 없는 카드, 찬 칸, 범위 밖 칸, 못 하는 패스·교체, 모르는 행동)을 섞어 거절 경로도 비교하고,
// 끝난 뒤 추리(봇 추리와 아무 추리)·득점까지 비교한다.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BOT_STYLES, chooseAction, guessMotives, type BotStyle } from '../src/engine/bots'
import { applyAction, finalScore, legalActions, makeRng, newGame, validGuess } from '../src/engine/engine'
import type { Action, Fact, Figure, Game, Guess, Rules, Score } from '../src/engine/types'
import { makeView } from '../src/engine/view'

interface Trace {
  variant: string
  n: number
  seed: number
  rules: Rules | null
  endings: Fact[] | null
  motives: Figure[] | null
  chaos: boolean
  start: string
  startViews: string
  /** [행동(아무 행동이면 ! 를 앞에), 거절 이유, 합법 행동 해시, 상태 해시, 화면 정보 해시] */
  turns: [string, string | null, string, string, string][]
  botGuesses: Guess[]
  guesses: Guess[]
  valid: boolean[]
  score: Score
}

const traces = JSON.parse(readFileSync(new URL('./fixtures/legacy-traces.json', import.meta.url), 'utf8')) as Trace[]

const h = (o: unknown) => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 12)
const views = (g: Game) => h([...g.names.map((_, s) => makeView(g, s)), makeView(g, -1)])
const enc = (a: Action) => (a.type === 'place' ? `place.${a.cardId}.${a.slot}` : a.type === 'exchange' ? `exchange.${a.cardId}` : a.type)

/** 아무 행동(형식이 틀린 것 포함)을 기록에서 그대로 되살린다 */
function dec(s: string): Action {
  const [type, a, b] = s.split('.')
  if (type === 'place') return { type, cardId: a!, slot: Number(b) }
  if (type === 'exchange') return { type, cardId: a! }
  return { type } as Action
}

/** 옛 기준을 만든 봇 유형(생성 스크립트와 같다) */
const KEYS = ['greedy', 'rival', 'bluffer'] as const
function styleOf(t: Trace, p: number): BotStyle {
  const v = t.variant
  if (v.endsWith('-random')) return BOT_STYLES.random
  if (v.endsWith('-online')) return { ...BOT_STYLES[KEYS[(p * 7 + t.seed) % 3]!], activity: 0.8 }
  if (v === '5p-rules-chaos') return BOT_STYLES[KEYS[p % 3]!]
  if (v.endsWith('-chaos')) return { ...BOT_STYLES[KEYS[(p + t.seed) % 3]!], activity: 0.8 }
  return BOT_STYLES[KEYS[(p + t.seed) % 3]!]
}

describe('옛 엔진과 같은 진행', () => {
  it('기록이 충분하다', () => {
    expect(traces.length).toBeGreaterThanOrEqual(150)
    expect(new Set(traces.map((t) => t.variant)).size).toBeGreaterThanOrEqual(15)
    expect(traces.reduce((s, t) => s + t.turns.length, 0)).toBeGreaterThan(5000)
    expect(traces.reduce((s, t) => s + t.turns.filter((x) => x[1] !== null).length, 0)).toBeGreaterThan(500)
  })

  for (const t of traces) {
    it(`${t.variant} 시드 ${t.seed}`, () => {
      let g = newGame({
        names: Array.from({ length: t.n }, (_, i) => `P${i}`),
        seed: t.seed,
        ...(t.rules ? { rules: t.rules } : {}),
        ...(t.endings ? { endings: t.endings } : {}),
        ...(t.motives ? { motives: t.motives } : {}),
      })
      const rng = makeRng(t.seed * 31 + 7)
      expect(h(g)).toBe(t.start)
      expect(views(g)).toBe(t.startViews)
      t.turns.forEach(([code, err, legal, sh, vh], k) => {
        expect([k, h(legalActions(g).map(enc))]).toEqual([k, legal])
        // 아무 행동(! 표시)은 기록에서 되살리고, 봇 행동은 새 봇이 직접 고른다
        const random = code.startsWith('!')
        if (random) expect(t.chaos).toBe(true)
        const a = random ? dec(code.slice(1)) : chooseAction(g, styleOf(t, g.current), rng)
        if (!random) expect([k, enc(a)]).toEqual([k, code])
        const before = h(g)
        let got: string | null = null
        try {
          g = applyAction(g, a)
        } catch (e) {
          got = (e as Error).message
          // 거절해도 받은 상태는 그대로다
          expect(h(g)).toBe(before)
        }
        expect([k, got]).toEqual([k, err])
        expect([k, h(g), views(g)]).toEqual([k, sh, vh])
      })
      expect(g.over).toBe(true)
      expect(g.names.map((_, p) => guessMotives(g, p))).toEqual(t.botGuesses)
      expect(t.guesses.map((gs, p) => validGuess(g, p, gs))).toEqual(t.valid)
      expect(finalScore(g, t.guesses)).toEqual(t.score)
    })
  }
})
