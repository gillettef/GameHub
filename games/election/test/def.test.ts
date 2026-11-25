// GameDef 와 공통 방 코드(RoomHub·Match)에 붙였을 때의 흐름: 행동 검사, 거절, 보기, 봇 진행, 온라인 대국, 대리 진행
import { Match, type RoomSnapshot, type ServerMessage, type Timers } from '@gamehub/net'
import { RoomHub, type Conn } from '@gamehub/net/server'
import { describe, expect, it } from 'vitest'
import { colorOf, def, parseAction, seatOf, type View } from '../src/def'
import { legalActions } from '../src/engine/rules'

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
  get room(): RoomSnapshot<View> {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const m = this.sent[i]!
      if (m.t === 'room') return m.room as RoomSnapshot<View>
    }
    throw new Error('room 메시지가 없습니다')
  }
  get error() {
    const m = this.sent.at(-1)
    return m?.t === 'error' ? m : null
  }
}

const seats = (kinds: ('human' | 'bot')[]) => kinds.map((kind, i) => ({ kind, name: kind === 'bot' ? `봇 ${i + 1}` : `사람 ${i + 1}` }))
const ctx = { name: (i: number) => `${i}번`, log: () => {}, byBot: false }

describe('행동 검사', () => {
  it('신뢰할 수 없는 입력은 걸러내고 알려진 필드만 남긴다', () => {
    expect(parseAction({ type: 'setup', hole: 2, seat: 1 })).toEqual({ type: 'setup', hole: 2 })
    expect(parseAction({ type: 'place', hole: 5 })).toEqual({ type: 'place', hole: 5 })
    expect(parseAction({ type: 'pick', hole: 6 })).toBeNull()
    expect(parseAction({ type: 'pick', hole: -1 })).toBeNull()
    expect(parseAction({ type: 'pick', hole: 1.5 })).toBeNull()
    expect(parseAction({ type: 'pick', hole: '1' })).toBeNull()
    expect(parseAction({ type: 'drop', color: 2 })).toBeNull()
    expect(parseAction({ type: 'drop', color: 1, player: 0 })).toEqual({ type: 'drop', color: 1 })
    expect(parseAction({ type: 'endPlace', hole: 3 })).toEqual({ type: 'endPlace' })
    expect(parseAction({ type: 'nope' })).toBeNull()
    expect(parseAction(null)).toBeNull()
    expect(parseAction('pick')).toBeNull()
  })

  it('규칙 위반·남의 차례는 상태를 건드리지 않고 거절한다', () => {
    const t = def.setup({ seats: seats(['human', 'human']), seed: 3, options: undefined })
    const copy = structuredClone(t)
    const first = seatOf(t.blue, 0)
    expect(() => def.apply(t, 1 - first, { type: 'setup', hole: 0 }, ctx)).toThrow('내 차례')
    expect(() => def.apply(t, first, { type: 'pick', hole: 0 }, ctx)).toThrow('포화되지 않은 권역')
    expect(t).toEqual(copy)
    const next = def.apply(t, first, { type: 'setup', hole: 0 }, ctx)
    expect(next.game.holes[0]).toEqual([0])
    expect(next.last).toEqual({ type: 'setup', hole: 0 })
    expect(t).toEqual(copy)
  })

  it('파랑(선공) 좌석은 시드로 추첨한다', () => {
    const blues = new Set(Array.from({ length: 40 }, (_, seed) => def.setup({ seats: seats(['human', 'bot']), seed, options: undefined }).blue))
    expect(blues).toEqual(new Set([0, 1]))
    for (const blue of [0, 1] as const) {
      expect(colorOf(blue, seatOf(blue, 0))).toBe(0)
      expect(colorOf(blue, seatOf(blue, 1))).toBe(1)
    }
  })

  it('보기에는 시드가 없다(완전 정보라 나머지는 모두 공개)', () => {
    const t = def.setup({ seats: seats(['human', 'bot']), seed: 1, options: undefined })
    for (const seat of [0, 1, null]) {
      const v = def.view(t, seat) as unknown as Record<string, unknown>
      expect(v).not.toHaveProperty('seed')
      expect(v.game).toEqual(t.game)
    }
  })
})

describe('진행', () => {
  it('봇끼리 여러 판을 끝까지 둔다', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const t = fakeTimers()
      const match = new Match(def, { seats: seats(['bot', 'bot']), seed, options: undefined, timers: t.timers, autoDelay: () => 0, onChange: () => {} })
      match.schedule()
      t.flush(5000)
      expect(match.over).toBe(true)
      expect(match.log.at(-1)?.kind).toBe('over')
      expect(match.log.at(-1)?.text).toMatch(/^개표 /)
    }
  })

  it('봇 계획이 어긋나도(남이 끼어든 상태) 다시 정해 멈추지 않는다', () => {
    const t = def.setup({ seats: seats(['bot', 'bot']), seed: 9, options: undefined })
    const memory = { plan: { from: 0, actions: [{ type: 'pick', hole: 3 }] } }
    const a = def.bot!.next(t, seatOf(t.blue, 0), memory)!
    expect(a.type).toBe('setup')
    expect(def.bot!.fallback!(t, 0)).toEqual(legalActions(t.game)[0])
  })

  it('온라인: 만들기·참가·시작, 차례가 아니면 거절, 끊긴 사람은 대리 진행', () => {
    const t = fakeTimers()
    let n = 0
    const hub = new RoomHub(def, { randomInt: (max) => ++n % max, token: () => `t${++n}`, now: () => 0, timers: t.timers })
    const a = new FakeConn()
    hub.receive(a, { t: 'create', name: '가람', seats: 2 })
    const code = a.room.code!
    const b = new FakeConn()
    hub.receive(b, { t: 'join', code, name: '나래' })
    hub.receive(a, { t: 'start' })
    expect(a.room.status).toBe('playing')

    const blue = a.room.view!.blue
    const [first, second] = blue === 0 ? [a, b] : [b, a]
    hub.receive(second, { t: 'act', action: { type: 'setup', hole: 0 } })
    expect(second.error?.message).toMatch(/차례/)
    hub.receive(first, { t: 'act', action: { type: 'setup', hole: 0 } })
    expect(a.room.view!.game.holes[0]).toEqual([0])
    expect(b.room.view!.last).toEqual({ type: 'setup', hole: 0 })
    expect(a.room.log.at(-1)?.text).toMatch(/A 사전 배치$/)

    hub.disconnect(second)
    t.flush(50)
    expect(a.room.view!.game.version).toBeGreaterThan(1)
    expect(a.room.log.some((l) => l.text.endsWith('(대리)'))).toBe(true)
  })
})
