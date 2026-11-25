// 옛 엔진(prototype/*.js, 커밋 d369b59)과 같은 시드·설정에서 새 엔진·봇이 같은 수를 두고 같은 상태가 되는지 확인한다.
// fixtures/legacy-traces.json 은 옛 엔진으로 판을 끝까지 두며 차례마다 둔 수와 상태(toView) 해시를 기록한 것이다.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ProfileName } from '../src/engine/bot'
import { mulberry32, newGame, toView, winners, type State, type TurnAction } from '../src/engine/engine'
import { DEFAULT_CONFIG, RULES, mergeConfig } from '../src/engine/rules'
import { playBotTurn } from '../src/engine/sim'

interface Trace {
  variant: string
  base: 'rules' | 'default'
  over: Record<string, unknown>
  profiles: ProfileName[]
  n: number
  seed: number
  start: string
  turns: [string, string][]
  final: unknown
  winners: number[]
}

const traces = JSON.parse(readFileSync(new URL('./fixtures/legacy-traces.json', import.meta.url), 'utf8')) as Trace[]

/** 옛 toView 와 같은 키·순서 */
function legacyView(s: State) {
  const v = toView(s)
  return {
    n: v.n,
    fold: v.fold,
    players: v.players,
    shards: v.shards,
    current: v.current,
    round: v.round,
    turnSteps: v.turnSteps,
    turnMaxSteps: v.turnMaxSteps,
    turnFolded: v.turnFolded,
    deckLeft: v.deckLeft,
    supplyLeft: v.supplyLeft,
    over: v.over,
    winners: v.winners,
    activeIds: v.activeIds,
    lastSpawn: v.lastSpawn,
    lastBurst: v.lastBurst,
  }
}

const hash = (s: State) => createHash('sha1').update(JSON.stringify(legacyView(s))).digest('hex').slice(0, 12)
const enc = (a: TurnAction) => (a.type === 'step' ? `s${a.to[0]}${a.to[1]}` : a.type === 'fold' ? `f${a.side}${a.width}` : `u${a.side}`)

describe('옛 엔진과 같은 진행', () => {
  it('기록이 충분하다', () => {
    expect(traces.length).toBeGreaterThanOrEqual(90)
    expect(new Set(traces.map((t) => t.variant)).size).toBeGreaterThanOrEqual(6)
  })

  for (const t of traces) {
    it(`${t.variant} ${t.n}인 시드 ${t.seed}`, () => {
      const config = mergeConfig(t.base === 'default' ? DEFAULT_CONFIG : RULES, t.over)
      const s = newGame(t.n, t.seed, config)
      const rnd = mulberry32(t.seed * 7919 + 13)
      expect(hash(s)).toBe(t.start)
      t.turns.forEach(([acts, h], i) => {
        const played = playBotTurn(s, t.profiles[s.current % t.profiles.length]!, rnd).map(enc).join(' ')
        expect([i, played, hash(s)]).toEqual([i, acts, h])
      })
      expect(legacyView(s)).toEqual(t.final)
      expect(winners(s)).toEqual(t.winners)
    })
  }
})
