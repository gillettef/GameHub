// GameDef 와 공통 방 코드(RoomHub·Match)에 붙였을 때의 흐름: 행동 검사, 좌석별 가리기, 추리, 봇 진행, 온라인 대국, 대리 진행
import { Match, RuleError, type RoomSnapshot, type ServerMessage, type Timers } from '@gamehub/net'
import { RoomHub, type Conn } from '@gamehub/net/server'
import { describe, expect, it } from 'vitest'
import { def, parseAction, phaseOf, type Action, type SeatView, type Table } from '../src/def'
import { FIGURES, legalActions } from '../src/engine/engine'

function fakeTimers() {
  const queue: { fn: () => void }[] = []
  const timers: Timers = {
    set(fn) {
      const h = { fn }
      queue.push(h)
      return h
    },
    clear(h) {
      const i = queue.indexOf(h as (typeof queue)[number])
      if (i >= 0) queue.splice(i, 1)
    },
  }
  return {
    timers,
    flush(max = 5000) {
      let k = 0
      while (queue.length && k++ < max) queue.shift()!.fn()
      return k
    },
  }
}

class FakeConn implements Conn {
  readonly sent: ServerMessage[] = []
  send(msg: ServerMessage) {
    this.sent.push(msg)
  }
  get room(): RoomSnapshot<SeatView> {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const m = this.sent[i]!
      if (m.t === 'room') return m.room as RoomSnapshot<SeatView>
    }
    throw new Error('room 메시지가 없습니다')
  }
  get error() {
    const m = this.sent.at(-1)
    return m?.t === 'error' ? m : null
  }
}

const seats = (kinds: ('human' | 'bot')[]) => kinds.map((kind, i) => ({ kind, name: kind === 'bot' ? `봇 ${i + 1}` : `사람 ${i + 1}` }))
const ctx = { name: (i: number) => `${i}`, log: () => {}, byBot: false }
const setup = (n: number, seed = 5, kind: 'human' | 'bot' = 'human') => def.setup({ seats: seats(Array.from({ length: n }, () => kind)), seed, options: undefined })

/** 봇으로 k 번 둔다(추리 단계면 남은 사람 대신 추리) */
function advance(t: Table, k: number): Table {
  for (let j = 0; j < k && !def.isOver(t); j++) {
    const seat = def.actors(t)[0]!
    t = def.apply(t, seat, def.bot!.next(t, seat, {})!, ctx)
  }
  return t
}

/** 놀이 단계가 끝날 때까지 */
function toGuess(t: Table): Table {
  while (phaseOf(t) === 'play') t = advance(t, 1)
  return t
}

describe('행동 검사', () => {
  it('신뢰할 수 없는 입력은 걸러낸다', () => {
    expect(parseAction({ type: 'place', cardId: 'C01', slot: 3, extra: 1 })).toEqual({ type: 'place', cardId: 'C01', slot: 3 })
    expect(parseAction({ type: 'place', cardId: 'C61', slot: 3 })).toBeNull()
    expect(parseAction({ type: 'place', cardId: '__proto__', slot: 3 })).toBeNull()
    expect(parseAction({ type: 'place', cardId: 'toString', slot: 3 })).toBeNull()
    expect(parseAction({ type: 'place', cardId: 'C01', slot: 1.5 })).toBeNull()
    expect(parseAction({ type: 'place', cardId: 'C01', slot: -1 })).toBeNull()
    expect(parseAction({ type: 'place', cardId: 'C01', slot: 15 })).toBeNull()
    expect(parseAction({ type: 'place', cardId: 'C01', slot: '3' })).toBeNull()
    expect(parseAction({ type: 'exchange', cardId: 'C60', seat: 2 })).toEqual({ type: 'exchange', cardId: 'C60' })
    expect(parseAction({ type: 'exchange' })).toBeNull()
    expect(parseAction({ type: 'pass', player: 3 })).toEqual({ type: 'pass' })
    expect(parseAction({ type: 'guess', guess: { 1: '하인', 2: '광대' }, seat: 0 })).toEqual({ type: 'guess', guess: { 1: '하인', 2: '광대' } })
    expect(parseAction({ type: 'guess', guess: { 1: '왕' } })).toBeNull()
    expect(parseAction({ type: 'guess', guess: { 5: '하인' } })).toBeNull()
    expect(parseAction({ type: 'guess', guess: { __proto__: '하인' } })).toEqual({ type: 'guess', guess: {} })
    expect(parseAction({ type: 'guess', guess: ['하인'] })).toBeNull()
    expect(parseAction({ type: 'guess' })).toBeNull()
    expect(parseAction(['pass'])).toBeNull()
    expect(parseAction('pass')).toBeNull()
    expect(parseAction(null)).toBeNull()
    expect(parseAction({ type: 'constructor' })).toBeNull()
  })

  it('규칙 위반은 상태를 건드리지 않고 RuleError 로 거절한다', () => {
    const t = setup(4)
    const copy = structuredClone(t)
    const seat = def.actors(t)[0]!
    const p = t.order.indexOf(seat)
    const other = t.order[(p + 1) % 4]!
    const notMine = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06'].find((id) => !t.g.hands[p]!.includes(id))!
    expect(() => def.apply(t, seat, { type: 'pass' }, ctx)).toThrow('패스할 수 없습니다')
    expect(() => def.apply(t, seat, { type: 'exchange', cardId: notMine }, ctx)).toThrow('손에 없는 카드')
    expect(() => def.apply(t, seat, { type: 'place', cardId: notMine, slot: 0 }, ctx)).toThrow(RuleError)
    expect(() => def.apply(t, seat, { type: 'guess', guess: {} }, ctx)).toThrow('추리는 게임이 끝난 뒤')
    expect(() => def.apply(t, other, { type: 'exchange', cardId: t.g.hands[(p + 1) % 4]![0]! }, ctx)).toThrow('내 차례')
    expect(() => def.apply(t, 9, { type: 'pass' }, ctx)).toThrow('플레이어가 아닙니다')
    // 찬 칸·조건이 거짓인 칸·결말과 어긋나는 칸
    const placed = def.apply(t, seat, legalActions(t.g).find((a) => a.type === 'place')!, ctx)
    const seat2 = def.actors(placed)[0]!
    const filled = placed.g.timeline.findIndex(Boolean)
    expect(() => def.apply(placed, seat2, { type: 'place', cardId: placed.g.hands[placed.g.current]![0]!, slot: filled }, ctx)).toThrow('빈 칸이 아닙니다')
    expect(t).toEqual(copy)
    expect(placed.g.history.length).toBe(1)
  })

  it('추리: 모두에게 하나씩, 같은 인물 두 번 금지, 한 번만', () => {
    let t = toGuess(setup(3, 8))
    expect(phaseOf(t)).toBe('guess')
    expect(def.actors(t).sort()).toEqual([0, 1, 2])
    const seat = def.actors(t)[0]!
    const p = t.order.indexOf(seat)
    const [q1, q2] = [0, 1, 2].filter((q) => q !== p) as [number, number]
    const before = structuredClone(t)
    expect(() => def.apply(t, seat, { type: 'pass' }, ctx)).toThrow('추리하세요')
    expect(() => def.apply(t, seat, { type: 'guess', guess: { [q1]: '하인' } }, ctx)).toThrow('모든 플레이어')
    expect(() => def.apply(t, seat, { type: 'guess', guess: { [q1]: '하인', [q2]: '하인' } }, ctx)).toThrow('두 번')
    expect(t).toEqual(before)
    t = def.apply(t, seat, { type: 'guess', guess: { [q1]: '하인', [q2]: '광대', [p]: '왕비' } }, ctx)
    expect(t.guesses[p]).toEqual({ [q1]: '하인', [q2]: '광대' }) // 내 자리 칸은 버린다
    expect(def.actors(t)).not.toContain(seat)
    expect(() => def.apply(t, seat, { type: 'guess', guess: { [q1]: '대신', [q2]: '광대' } }, ctx)).toThrow('이미 추리')
    t = advance(t, 5)
    expect(def.isOver(t)).toBe(true)
    expect(def.actors(t)).toEqual([])
    expect(t.result!.rows.length).toBe(3)
    expect(() => def.apply(t, seat, { type: 'pass' }, ctx)).toThrow('끝난 게임')
  })

  it('시작 플레이어는 시드로 섞는다(1번 자리가 늘 먼저가 아니다)', () => {
    const firsts = new Set<number>()
    for (let seed = 1; seed <= 30; seed++) {
      const t = setup(4, seed)
      expect([...t.order].sort()).toEqual([0, 1, 2, 3])
      expect(t.g.names).toEqual(t.order.map((s) => `사람 ${s + 1}`))
      firsts.add(def.actors(t)[0]!)
    }
    expect(firsts.size).toBe(4)
  })
})

describe('좌석별로 가린 화면 정보', () => {
  it('남의 손패·비밀 목표·추리·덱·시드는 게임 내내 새지 않는다(3·4·5인, 추리 단계 포함)', () => {
    let guessStates = 0
    for (const n of [3, 4, 5]) {
      for (let seed = 1; seed <= 4; seed++) {
        let t = setup(n, seed * 13 + n)
        while (!def.isOver(t)) {
          if (phaseOf(t) === 'guess') guessStates++
          for (let seat = 0; seat < n; seat++) {
            const v = def.view(t, seat)
            const p = t.order.indexOf(seat)
            const json = JSON.stringify(v)
            expect(v.me).toBe(p)
            expect(v.hand).toEqual(t.g.hands[p])
            expect(v.motive).toBe(t.g.motives[p])
            // 남의 손에 든 카드 번호는 어디에도 없다(놓거나 버린 카드는 손에서 나가므로 기록과 겹치지 않는다)
            for (let q = 0; q < n; q++) if (q !== p) for (const id of t.g.hands[q]!) expect(json, `${seat}번 자리에 남의 손패 ${id}`).not.toContain(`"${id}"`)
            // 인물 이름은 내 목표와 내가 낸 추리에만 나온다
            const allowed = new Set<string>([t.g.motives[p]!, ...Object.values(t.guesses[p] ?? {})])
            for (const f of FIGURES) if (!allowed.has(f)) expect(json, `${seat}번 자리에 ${f}`).not.toContain(`"${f}"`)
            for (const key of ['seed', 'deck', 'motives', 'rngState', 'discard', 'hands', 'guesses']) expect(json).not.toContain(`"${key}":`)
            expect(v.result).toBeNull()
            expect(v.myGuess).toEqual(t.guesses[p])
          }
          const spectator = def.view(t, null)
          expect(spectator.me).toBeNull()
          expect(spectator.hand).toEqual([])
          expect(spectator.motive).toBeNull()
          expect(spectator.myGuess).toBeNull()
          for (const f of FIGURES) expect(JSON.stringify(spectator)).not.toContain(`"${f}"`)
          t = advance(t, 1)
        }
        // 끝나면 목표와 추리를 모두 공개한다
        const v = def.view(t, null)
        expect(v.phase).toBe('over')
        expect(v.result!.motives).toEqual(t.g.motives)
        expect(v.result!.guesses).toEqual(t.guesses)
        expect(JSON.stringify(v)).not.toContain('"seed"')
      }
    }
    expect(guessStates, '추리 단계 상태도 검사했다').toBeGreaterThan(0)
  })
})

describe('진행', () => {
  it('봇끼리 3·4·5인 한 판을 끝까지 두고 바로 득점한다', () => {
    for (const n of [3, 4, 5]) {
      const t = fakeTimers()
      const match = new Match(def, { seats: seats(Array.from({ length: n }, () => 'bot')), seed: 11 + n, options: undefined, timers: t.timers, autoDelay: () => 0, onChange: () => {} })
      match.schedule()
      t.flush(20000)
      expect(match.over).toBe(true)
      expect(match.log.at(-1)?.text).toMatch(/^득점 · 승리 /)
      expect(match.state.result!.winners.length).toBeGreaterThanOrEqual(1)
      expect(match.history.every((m) => m.action.type !== 'guess')).toBe(true) // 봇 자리는 추리 단계에 들어가며 바로 추리한다
    }
  })

  it('사람 자리는 추리를 내야 끝난다(봇 대신 추리는 대리 진행 때만)', () => {
    const t = fakeTimers()
    const match = new Match(def, { seats: seats(['human', 'bot', 'bot']), seed: 3, options: undefined, timers: t.timers, autoDelay: (i) => (i === 0 ? null : 0), onChange: () => {} })
    match.schedule()
    for (let k = 0; k < 400 && phaseOf(match.state) === 'play'; k++) {
      if (match.actors()[0] === 0) {
        const a = legalActions(match.state.g).at(-1)!
        match.act(0, a)
      } else t.flush(1)
    }
    expect(phaseOf(match.state)).toBe('guess')
    expect(match.actors()).toEqual([0])
    const p = match.state.order.indexOf(0)
    const others = [0, 1, 2].filter((q) => q !== p)
    match.act(0, parseAction({ type: 'guess', guess: { [others[0]!]: '하인', [others[1]!]: '왕비' } }) as Action)
    expect(match.over).toBe(true)
  })

  it('저장한 행동 기록으로 같은 판을 다시 만든다(한 기기 이어하기)', () => {
    const t = fakeTimers()
    const opts = { seats: seats(['bot', 'bot', 'bot', 'bot']), seed: 77, options: undefined, timers: t.timers, autoDelay: () => 0, onChange: () => {} }
    const a = new Match(def, opts)
    a.schedule()
    t.flush(15)
    const b = new Match(def, { ...opts, replay: a.history })
    expect(b.state).toEqual(a.state)
  })

  it('온라인: 만들기·참가·시작, 내 차례가 아니면 거절, 끊긴 사람은 대리 진행, 추리 후 결과', () => {
    const t = fakeTimers()
    let n = 0
    const hub = new RoomHub(def, { randomInt: (max) => ++n % max, token: () => `t${++n}`, now: () => 0, timers: t.timers })
    const a = new FakeConn()
    hub.receive(a, { t: 'create', name: '가람', seats: 3 })
    const code = a.room.code!
    const b = new FakeConn()
    hub.receive(b, { t: 'join', code, name: '나래' })
    hub.receive(a, { t: 'start' })
    expect(a.room.status).toBe('playing')
    expect(a.room.view!.hand.length).toBe(4)
    expect(a.room.view!.hand).not.toEqual(b.room.view!.hand)
    expect(a.room.view!.motive).not.toBe(b.room.view!.motive)

    // 봇(3번 자리) 차례면 봇이 둘 때까지
    let guard = 0
    while (!a.room.actors.some((s) => s === 0 || s === 1) && guard++ < 10) t.flush(1)
    const turn = a.room.actors[0]!
    const [me, other] = turn === 0 ? [a, b] : [b, a]
    hub.receive(other, { t: 'act', action: { type: 'pass' } })
    expect(other.error?.message).toMatch(/차례/)
    hub.receive(me, { t: 'act', action: { type: 'place', cardId: 'C99', slot: 0 } })
    expect(me.error?.reason).toBe('bad-request')
    const v = me.room.view!
    hub.receive(me, { t: 'act', action: { type: 'exchange', cardId: v.hand[0] } })
    expect(me.room.view!.history.length).toBe(v.history.length + 1)
    expect(me.room.log.at(-1)!.text).toMatch(/교체 — 「/)

    // 나래가 나가지 않고 연결만 끊기면 그 차례는 봇이 대신 둔다. 가람은 계속 둔다
    hub.disconnect(b)
    for (let k = 0; k < 400 && a.room.view!.phase === 'play'; k++) {
      const r = a.room
      if (r.actors[0] === 0) hub.receive(a, { t: 'act', action: { type: 'pass' } })
      if (a.room.version === r.version) {
        if (r.actors[0] === 0) {
          const hand = r.view!.hand
          hub.receive(a, { t: 'act', action: { type: 'exchange', cardId: hand[0] } })
        }
        if (a.room.version === r.version) t.flush(1)
      }
    }
    expect(a.room.log.some((l) => l.text.endsWith('(대리)'))).toBe(true)
    expect(a.room.view!.phase).toBe('guess')
    const va = a.room.view!
    const guess = Object.fromEntries(
      va.names
        .map((_, q) => q)
        .filter((q) => q !== va.me)
        .map((q, k) => [q, FIGURES.filter((f) => f !== va.motive)[k]!]),
    )
    hub.receive(a, { t: 'act', action: { type: 'guess', guess } })
    expect(a.room.view!.myGuess).toEqual(guess)
    // 나래(끊김)의 추리는 대리가 낸다
    t.flush(5)
    expect(a.room.status).toBe('over')
    expect(a.room.view!.result!.rows.length).toBe(3)
    expect(a.room.view!.result!.guesses[va.me!]).toEqual(guess)
  })
})
