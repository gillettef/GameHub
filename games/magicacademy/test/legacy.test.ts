// 옛 서버와 같은 진행인지: test/fixtures/legacy-games.json 은 옛 server/src/game(엔진·봇)과 server/src/app.ts 의 봇 진행으로
// 2~5인 12판을 끝까지 두며 만든 기록이다(생성 스크립트는 저장소 밖, 게임 난수 mulberry32(seed)·카드 id c1..로 바꾼 것만 다르다).
// 같은 시드로 새 GameDef 를 만들고 같은 행동을 두어, 단계마다 판 전체(덱·숨은 정보 포함)와 좌석마다 보내던 상태가 같은지 해시로 비교한다.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { def, parseAction, RESOLVE_STEP_MS, type Table } from '../src/def'

interface Step {
  seat: number
  action: Record<string, unknown>
  state: string
  views: string[]
}
interface Game {
  seats: number
  seed: number
  kinds: ('bot' | 'human')[]
  names: string[]
  init: { state: string; views: string[] }
  steps: Step[]
  final: Record<string, number>
  winnerIds: string[]
}

const fixture = JSON.parse(readFileSync(new URL('./fixtures/legacy-games.json', import.meta.url), 'utf8')) as { games: Game[] }

function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : canon(x)))
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .filter((k) => o[k] !== undefined)
        .map((k) => [k, canon(o[k])]),
    )
  }
  return v
}
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(canon(v))).digest('hex').slice(0, 16)
const views = (t: Table) => t.game.turnOrder.map((_, i) => hash(def.view(t, i).game))
const ctx = { log: () => {}, name: (i: number) => `${i + 1}번`, byBot: false }

describe('옛 서버와 같은 진행', () => {
  test('비교 기준이 여러 인원·시드를 담고 있다', () => {
    expect(fixture.games.map((g) => g.seats).sort()).toEqual([2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5])
    expect(fixture.games.reduce((n, g) => n + g.steps.length, 0)).toBeGreaterThan(3000)
  })

  for (const g of fixture.games) {
    test(`${g.seats}인 시드 ${g.seed}: ${g.steps.length}단계`, () => {
      let t = def.setup({ seats: g.names.map((name, i) => ({ kind: g.kinds[i]!, name })), seed: g.seed, options: undefined })
      expect(hash(t.game)).toBe(g.init.state)
      expect(views(t)).toEqual(g.init.views)
      g.steps.forEach((step, i) => {
        const where = `${i}번째 단계 ${JSON.stringify(step.action)}`
        if (step.action.type === 'advance') {
          expect(def.actors(t), where).toEqual([])
          t = def.clock!.advance(t, RESOLVE_STEP_MS, ctx)
        } else {
          expect(def.actors(t), where).toEqual([step.seat])
          const action = parseAction(step.action)
          expect(action, where).not.toBeNull()
          t = def.apply(t, step.seat, action!, ctx)
        }
        expect(hash(t.game), where).toBe(step.state)
        expect(views(t), where).toEqual(step.views)
      })
      expect(def.isOver(t)).toBe(true)
      expect(t.game.winnerIds).toEqual(g.winnerIds)
      expect(Object.fromEntries(t.game.turnOrder.map((id) => [id, t.game.players[id]!.credit]))).toEqual(g.final)
    }, 60_000)
  }
})
