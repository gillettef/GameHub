// 옛 엔진(src/engine/*.js, 커밋 2be493c)과 같은 시드·시간 흐름·행동에서 새 엔진·봇이 같은 결정을 하고 같은 상태가 되는지 확인한다.
// fixtures/legacy-traces.json: 옛 엔진으로 구동기 난수가 고른 시간 흐름(시간 초과 포함)과 행동(봇의 결정, 사람 흉내의 무작위·잘못된 행동)을
// 끝까지 둔 기록. 단계마다 [흐른 시간, 좌석, 봇 함수, 행동, 성공 여부, 상태 해시]이고, 행동이 없는 단계는 [흐른 시간, 해시]다.
// 해시는 엔진 상태 전체·봇 두뇌(기억·회상)·모든 좌석과 관전의 view 를 담는다.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assertion, chooseClaim, chooseQuestion, newBrain, onForget, testimony, type Brain } from '../src/engine/bot'
import { RuleError, ask, claim, fist, newGame, say, start, tick, view, type Game, type PlayerInit } from '../src/engine/game'

type Step = [number, string] | [number, number, string | null, string | null, boolean, string]
interface Trace {
  variant: string
  n: number
  seed: number
  humans: number[]
  players: PlayerInit[]
  botSeeds: (number | null)[]
  start: string
  steps: Step[]
  scores: number[]
}

const traces = JSON.parse(readFileSync(new URL('./fixtures/legacy-traces.json', import.meta.url), 'utf8')) as Trace[]

const canon = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canon(x))).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}
const hash = (v: unknown) => createHash('sha1').update(canon(v)).digest('hex').slice(0, 12)

function project(g: Game, brains: (Brain | null)[], now: number) {
  const views = []
  for (let me = -1; me < g.n; me++) views.push(view(g, me, now))
  return {
    n: g.n,
    players: g.players,
    plots: g.plots.map((p) => p.id),
    truth: g.truth,
    chron: g.chron,
    forgotten: g.forgotten,
    season: g.season,
    phase: g.phase,
    questioner: g.questioner,
    deadline: g.deadline,
    version: g.version,
    chat: g.chat,
    chatSeq: g.chatSeq,
    claims: g.claims,
    claimReveal: g.claimReveal,
    council: g.council,
    drawn: g.drawn,
    question: g.question,
    fists: g.fists,
    result: g.result,
    questionNo: g.questionNo,
    brains: brains.map((b) => (b ? { memory: b.memory, recall: b.recall } : null)),
    views,
  }
}

type Act = { type: 'claim'; plot: string } | { type: 'ask'; plot: string; season: number } | { type: 'fist'; choice: string } | { type: 'say'; text: string; assert?: string | null }

describe('옛 엔진과 같은 진행', () => {
  it('기록이 충분하다(인원 4~6, 봇만·사람 섞임·사람만, 거절·시간 초과 포함)', () => {
    expect(traces.length).toBeGreaterThanOrEqual(20)
    expect(new Set(traces.map((t) => t.n))).toEqual(new Set([4, 5, 6]))
    const all = traces.flatMap((t) => t.steps)
    expect(all.filter((s) => s.length > 2 && s[3] && !s[4]).length).toBeGreaterThan(300)
    expect(all.filter((s) => s[0] >= 30_000).length).toBeGreaterThan(200)
  })

  for (const t of traces) {
    it(`${t.variant} ${t.n}인 시드 ${t.seed}`, () => {
      const g = newGame({ players: t.players, seed: t.seed })
      const brains = t.players.map((p, i) => (t.botSeeds[i] === null ? null : newBrain(p.persona ?? null, t.botSeeds[i]!)))
      const hook = (s: number, col: (number | null)[]) => brains.forEach((b, i) => b && onForget(g, b, i, s, col))
      let now = 0
      start(g, now)
      expect(hash(project(g, brains, now))).toBe(t.start)
      t.steps.forEach((step, k) => {
        now += step[0]
        tick(g, now, hook)
        if (step.length === 2) {
          expect([k, hash(project(g, brains, now))]).toEqual([k, step[1]])
          return
        }
        const [, seat, fn, recorded, ok, h] = step
        let action: Act | null = recorded === null ? null : (JSON.parse(recorded) as Act)
        // 봇 단계: 새 봇이 같은 결정을 내리는지
        if (fn !== null) {
          const b = brains[seat]!
          let mine: Act | null = null
          if (fn === 'claim') mine = { type: 'claim', plot: chooseClaim(g, b) }
          else if (fn === 'ask') mine = { type: 'ask', ...chooseQuestion(g, b, seat) }
          else if (fn === 'testify') mine = { type: 'fist', choice: testimony(g, b, seat) }
          else if (fn === 'assert') {
            const a = assertion(g, b, seat)
            mine = a ? { type: 'say', text: a.text, assert: a.answer } : null
          }
          expect([k, mine === null ? null : canon(mine)]).toEqual([k, recorded])
          action = mine
        }
        let applied = true
        if (action) {
          try {
            if (action.type === 'claim') claim(g, seat, action.plot, now)
            else if (action.type === 'ask') ask(g, seat, action.plot, action.season, now)
            else if (action.type === 'fist') fist(g, seat, action.choice, now)
            else say(g, seat, action.text, now, action.assert ? { answer: action.assert } : null)
          } catch (e) {
            if (!(e instanceof RuleError)) throw e
            applied = false
          }
        }
        expect([k, applied, hash(project(g, brains, now))]).toEqual([k, ok, h])
      })
      expect(g.phase).toBe('ended')
      expect(g.players.map((p) => p.score)).toEqual(t.scores)
    })
  }
})
