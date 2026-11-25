// 옛 엔진(src/engine/*.js, 이전 커밋 7183d82)과 같은 시드·행동에서 새 엔진·봇이 같은 수를 두고 같은 상태가 되는지 확인한다.
// fixtures/legacy-traces.json 은 옛 엔진+봇으로 판을 끝까지 두며 행동마다 둔 수, 거절 이유, 상태 해시,
// 좌석별 화면 정보(viewFor, 관전 포함) 해시를 기록한 것이다. chaos 판은 아무 행동이나 섞어 거절 경로도 비교한다.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Seat } from '../src/engine/board'
import { chooseAction } from '../src/engine/bot'
import { act, createGame, makeRng, viewFor, type Action, type Result, type State } from '../src/engine/rules'

interface Trace {
  variant: string
  seats: Seat[]
  firstSeat: Seat | null
  seed: number
  chaos: boolean
  start: string
  startViews: string
  /** [행동(아무 행동이면 ! 를 앞에), 거절 이유, 상태 해시, 화면 정보 해시] */
  turns: [string, string | null, string, string][]
  result: Result
}

const traces = JSON.parse(readFileSync(new URL('./fixtures/legacy-traces.json', import.meta.url), 'utf8')) as Trace[]

const h = (o: unknown) => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 12)
const views = (st: State) => h([...st.players.map((_, k) => viewFor(st, k)), viewFor(st, null)])

const enc = (a: Action) => {
  switch (a.type) {
    case 'move':
      return `move.${a.pieceId}.${a.dir}.${a.steps}`
    case 'accuse':
    case 'contact':
      return `${a.type}.${a.pieceId}`
    case 'scout':
      return `scout.${a.seat}`
    case 'scoutAccuse':
      return `scoutAccuse.${a.pieceId == null ? '-' : a.pieceId}`
    default:
      return a.type
  }
}

/** chaos 판의 아무 행동(형식이 틀린 것 포함)을 그대로 되살린다 */
function dec(s: string): Action {
  const [type, a, b, c] = s.split('.')
  if (type === 'move') return { type, pieceId: Number(a), dir: b as Seat, steps: Number(c) }
  if (type === 'accuse' || type === 'contact') return { type, pieceId: Number(a) }
  if (type === 'scout') return { type, seat: a as Seat }
  if (type === 'scoutAccuse') return { type, pieceId: a === '-' ? null : Number(a) }
  return { type } as Action
}

describe('옛 엔진과 같은 진행', () => {
  it('기록이 충분하다', () => {
    expect(traces.length).toBeGreaterThanOrEqual(120)
    expect(new Set(traces.map((t) => t.variant)).size).toBeGreaterThanOrEqual(8)
    expect(traces.reduce((s, t) => s + t.turns.length, 0)).toBeGreaterThan(3500)
  })

  for (const t of traces) {
    it(`${t.variant} 시드 ${t.seed}`, () => {
      const st = createGame({ seats: t.seats, firstSeat: t.firstSeat, seed: t.seed })
      const rng = makeRng(t.seed * 7919 + 13)
      expect(h(st)).toBe(t.start)
      expect(views(st)).toBe(t.startViews)
      t.turns.forEach(([code, err, sh, vh], k) => {
        // 아무 행동(! 표시)은 기록에서 되살리고, 봇 행동은 새 봇이 직접 고른다
        const a = code.startsWith('!') ? dec(code.slice(1)) : chooseAction(viewFor(st, st.turn), rng)
        if (code.startsWith('!')) expect(t.chaos).toBe(true)
        else expect([k, enc(a)]).toEqual([k, code])
        expect([k, act(st, st.turn, a)]).toEqual([k, err])
        expect([k, h(st), views(st)]).toEqual([k, sh, vh])
      })
      expect(st.phase).toBe('over')
      expect(st.result).toEqual(t.result)
    })
  }
})
