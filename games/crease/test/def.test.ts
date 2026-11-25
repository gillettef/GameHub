// GameDef 와 공통 방 코드(RoomHub·Match)에 붙였을 때의 흐름: 온라인 대국, 봇 진행, 대리 진행, 거절
import { Match, type RoomSnapshot, type ServerMessage, type Timers } from '@gamehub/net'
import { RoomHub, type Conn } from '@gamehub/net/server'
import { describe, expect, it } from 'vitest'
import { def, parseAction } from '../src/def'
import { legalSteps, type View } from '../src/engine/engine'

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

function makeHub() {
  const t = fakeTimers()
  let n = 0
  const hub = new RoomHub(def, { randomInt: (max) => ++n % max, token: () => `t${++n}`, now: () => 0, timers: t.timers })
  return { hub, t }
}

const seats = (kinds: ('human' | 'bot')[]) => kinds.map((kind, i) => ({ kind, name: kind === 'bot' ? `봇 ${i + 1}` : `사람 ${i + 1}` }))

describe('행동 검사', () => {
  it('신뢰할 수 없는 입력은 걸러낸다', () => {
    expect(parseAction({ type: 'step', to: [1, 2] })).toEqual({ type: 'step', to: [1, 2] })
    expect(parseAction({ type: 'step', to: [9, 0] })).toBeNull()
    expect(parseAction({ type: 'step', to: [1.5, 0] })).toBeNull()
    expect(parseAction({ type: 'fold', side: 'L', width: 4 })).toBeNull()
    expect(parseAction({ type: 'fold', side: 'X', width: 1 })).toBeNull()
    expect(parseAction({ type: 'unfold', side: 'R', width: 9 })).toEqual({ type: 'unfold', side: 'R' })
    expect(parseAction({ type: 'end', extra: 1 })).toEqual({ type: 'end' })
    expect(parseAction('end')).toBeNull()
  })

  it('규칙 위반은 상태를 건드리지 않고 거절한다', () => {
    const t = def.setup({ seats: seats(['human', 'human']), seed: 3, options: { profiles: [] } })
    const copy = structuredClone(t)
    const ctx = { name: (i: number) => `${i}`, log: () => {}, byBot: false }
    expect(() => def.apply(t, 0, { type: 'step', to: [8, 4] }, ctx)).toThrow('갈 수 없는 칸')
    const folded = def.apply(t, 0, { type: 'fold', side: 'L', width: 1 }, ctx)
    expect(() => def.apply(folded, 0, { type: 'unfold', side: 'L' }, ctx)).toThrow('지금 할 수 없는 접기')
    expect(t).toEqual(copy)
  })

  it('보기에는 카드 더미 순서와 난수 상태가 없다', () => {
    const t = def.setup({ seats: seats(['human', 'bot']), seed: 1, options: { profiles: [] } })
    const v = def.view(t, 0) as unknown as Record<string, unknown>
    expect(v.deckLeft).toBe(t.game.deck.length)
    expect(v).not.toHaveProperty('deck')
    expect(v).not.toHaveProperty('rng')
    expect(v).not.toHaveProperty('seed')
  })
})

describe('진행', () => {
  it('봇끼리 한 판을 끝까지 둔다(좌석별 성향)', () => {
    const t = fakeTimers()
    const match = new Match(def, {
      seats: seats(['bot', 'bot', 'bot']),
      seed: 11,
      options: { profiles: ['greedy', 'spiteful', 'balanced'] },
      timers: t.timers,
      autoDelay: () => 0,
      onChange: () => {},
    })
    match.schedule()
    t.flush(20000)
    expect(match.over).toBe(true)
    expect(match.log.at(-1)?.kind).toBe('over')
    expect(match.state.profiles).toEqual(['greedy', 'spiteful', 'balanced'])
  })

  it('온라인: 만들기·참가·시작, 내 차례가 아니면 거절, 끊긴 사람은 대리 진행', () => {
    const { hub, t } = makeHub()
    const a = new FakeConn()
    hub.receive(a, { t: 'create', name: '가람', seats: 2 })
    const code = a.room.code!
    const b = new FakeConn()
    hub.receive(b, { t: 'join', code, name: '나래' })
    hub.receive(a, { t: 'start' })
    expect(a.room.status).toBe('playing')

    hub.receive(b, { t: 'act', action: { type: 'end' } })
    expect(b.error?.message).toMatch(/차례/)
    const to = legalSteps(a.room.view!)[0]!
    hub.receive(a, { t: 'act', action: { type: 'step', to } })
    expect(a.room.view!.turnSteps).toBe(1)
    hub.receive(a, { t: 'act', action: { type: 'end' } })
    expect(a.room.view!.current).toBe(1)
    expect(a.room.log.some((l) => l.kind === 'spawn')).toBe(true)

    hub.disconnect(b)
    t.flush(50)
    expect(a.room.view!.current).toBe(0)
    expect(a.room.log.some((l) => l.text.startsWith('나래(대리)'))).toBe(true)
  })
})
