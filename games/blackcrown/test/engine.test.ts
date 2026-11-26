import { describe, expect, it } from 'vitest'
import { def, parseAction } from '../src/def'
import { botAction, botFallback } from '../src/engine/bot'
import { IllegalAction, actors, apply, createGame, view, type Ctx, type State } from '../src/engine/game'

const quiet: Ctx = { log: () => {}, name: (i) => `P${i}` }

function countCards(s: State): number {
  let n = s.deck.length + s.discard.length + s.graveyard.length + s.community.length
  n += s.players.reduce((t, p) => t + p.hand.filter((c) => c.suit !== null).length, 0)
  n += s.monsters.reduce((t, m) => t + (m.community ? 1 : 0), 0)
  if (s.demon) n += s.demon.deck.length + s.demon.discard.length
  if (s.attack) n += 0
  return n
}

function countShadow(s: State): number {
  return s.shadowFree.length + s.players.reduce((t, p) => t + p.hand.filter((c) => c.suit === null).length, 0)
}

/** 봇끼리 끝까지 둔다. 거절되면 fallback */
function playOut(seats: number, seed: number, check?: (s: State) => void): { s: State; steps: number; rejected: number } {
  let s = createGame(seats, seed)
  let steps = 0
  let rejected = 0
  while (s.phase !== 'over') {
    const seat = actors(s)[0] as number
    const a = botAction(s, seat, ((seed + seat) % 3) as 0 | 1 | 2)
    try {
      s = apply(s, seat, a, quiet)
    } catch (e) {
      if (!(e instanceof IllegalAction)) throw e
      rejected++
      s = apply(s, seat, botFallback(s, seat), quiet)
    }
    check?.(s)
    if (++steps > 5000) throw new Error(`끝나지 않음 seed=${seed}`)
  }
  return { s, steps, rejected }
}

describe('마왕의 패 엔진', () => {
  it('3~5석, 여러 시드에서 봇끼리 끝까지 둔다(카드 수 보존)', () => {
    for (const seats of [3, 4, 5]) {
      for (let seed = 1; seed <= 12; seed++) {
        const { s, rejected } = playOut(seats, seed, (st) => {
          expect(countCards(st)).toBe(52)
          expect(countShadow(st)).toBe(4)
          for (const p of st.players) expect(p.hp).toBeLessThanOrEqual(40)
        })
        expect(s.phase).toBe('over')
        expect(s.winner).not.toBeNull()
        expect(s.coronation).not.toBeNull()
        expect(s.ranking?.length).toBe(seats)
        expect(rejected).toBeLessThan(5)
      }
    }
  }, 120_000)

  it('같은 시드·같은 행동이면 같은 결과', () => {
    const a = playOut(4, 77).s
    const b = playOut(4, 77).s
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('남의 손패·그림자·뒤집히지 않은 타일·난수는 보이지 않는다', () => {
    let s = createGame(4, 5)
    while (s.phase === 'draft') s = apply(s, actors(s)[0] as number, botAction(s, actors(s)[0] as number), quiet)
    const v = view(s, 0)
    expect(v.players[0]?.hand).not.toBeNull()
    expect(v.players[1]?.hand).toBeNull()
    expect(v.players[1]?.shadow).toBeNull()
    expect(JSON.stringify(v)).not.toContain('"rng"')
    expect(JSON.stringify(v)).not.toContain('"monster"')
    expect(v.board.some((t) => t.kind === 'hidden')).toBe(true)
    expect('deck' in v).toBe(false)
  })

  it('규칙 위반은 상태를 건드리지 않고 거절', () => {
    let s = createGame(3, 9)
    while (s.phase === 'draft') s = apply(s, actors(s)[0] as number, botAction(s, actors(s)[0] as number), quiet)
    const before = JSON.stringify(s)
    const seat = actors(s)[0] as number
    const other = (seat + 1) % 3
    expect(() => apply(s, other, { type: 'end' }, quiet)).toThrow(IllegalAction)
    expect(() => apply(s, seat, { type: 'move', to: 0 }, quiet)).toThrow(IllegalAction)
    expect(() => apply(s, seat, { type: 'pray' }, quiet)).toThrow(IllegalAction)
    expect(JSON.stringify(s)).toBe(before)
  })

  it('def 는 형식이 틀린 입력을 걸러낸다', () => {
    expect(parseAction(null)).toBeNull()
    expect(parseAction({ type: 'move', to: 1.5 })).toBeNull()
    expect(parseAction({ type: 'attack', target: 1, cards: [1, 'x'] })).toBeNull()
    expect(parseAction({ type: 'buy', item: 'nope' })).toBeNull()
    expect(parseAction({ type: 'end', extra: 1 })).toEqual({ type: 'end' })
    expect(def.minSeats).toBe(3)
  })
})
