// 옛 엔진(prototype/src/*.js, 커밋 7183d82)과 같은 시드·시간 흐름에서 새 엔진·봇이 같은 수를 두고 같은 상태가 되는지 확인한다.
// fixtures/legacy-traces.json: 옛 엔진으로 행동 사이마다 시드 난수 시간을 흘리며(tick) 봇끼리 끝까지 둔 기록(단계마다 상태 해시).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { chooseAction, type Level } from '../src/engine/bot'
import { apply, newGame, tick, type Config } from '../src/engine/rules'
import { mulberry32 } from '../src/engine/random'

interface Trace {
  variant: string
  cfg: Partial<Config>
  levels: [Level, Level]
  gap: [number, number]
  seed: number
  start: string
  steps: [number, string | null, string][]
  over: boolean
  winner: number | null
  scores: [number, number]
}

const traces = JSON.parse(readFileSync(new URL('./fixtures/legacy-traces.json', import.meta.url), 'utf8')) as Trace[]
const hash = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 12)

describe('옛 엔진과 같은 진행', () => {
  it('기록이 충분하다', () => {
    expect(traces.length).toBeGreaterThanOrEqual(25)
    expect(traces.every((t) => t.over)).toBe(true)
  })

  for (const t of traces) {
    it(`${t.variant} 시드 ${t.seed}`, () => {
      const s = newGame(t.cfg)
      const rand = mulberry32(t.seed * 101 + 7)
      expect(hash(s)).toBe(t.start)
      t.steps.forEach(([dt, action, h], i) => {
        const gap = t.gap[0] + Math.floor(rand() * (t.gap[1] - t.gap[0]))
        expect(gap).toBe(dt)
        tick(s, gap)
        if (action === null) {
          expect([i, s.over, hash(s)]).toEqual([i, true, h])
          return
        }
        const a = chooseAction(s, t.levels[s.active]!, rand)
        apply(s, a)
        expect([i, JSON.stringify(a), hash(s)]).toEqual([i, action, h])
      })
      expect({ over: s.over, winner: s.winner, scores: s.scores }).toEqual({ over: t.over, winner: t.winner, scores: t.scores })
    })
  }
})
