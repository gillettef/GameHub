// GameDef: 행동 검사, 시계(카운트다운 → 모래), 봇끼리 가상 시간으로 끝까지, 온라인 방 흐름
import { Match, type RoomSnapshot, type ServerMessage, type Timers } from '@gamehub/net'
import { RoomHub, type Conn } from '@gamehub/net/server'
import { describe, expect, it } from 'vitest'
import { def, parseAction, parseOptions, type View } from '../src/def'
import { reserve } from '../src/engine/rules'

/** 가상 시간: 예약한 함수를 시각 순서로 실행하며 시계를 그만큼 옮긴다 */
function simTime() {
  let now = 0
  let queue: { at: number; fn: () => void }[] = []
  const timers: Timers = {
    set(fn, ms) {
      const h = { at: now + ms, fn }
      queue.push(h)
      return h
    },
    clear(h) {
      queue = queue.filter((x) => x !== h)
    },
  }
  return {
    timers,
    now: () => now,
    run(untilMs: number, max = 100_000) {
      for (let k = 0; k < max && queue.length; k++) {
        queue.sort((a, b) => a.at - b.at)
        const h = queue.shift()!
        if (h.at > untilMs) {
          queue.unshift(h)
          break
        }
        now = h.at
        h.fn()
      }
    },
    skip(ms: number) {
      now += ms
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

const ctx = { name: (i: number) => `${i + 1}번`, log: () => {}, byBot: false }
const seats = (a: 'human' | 'bot', b: 'human' | 'bot') => [
  { kind: a, name: 'A' },
  { kind: b, name: 'B' },
]

describe('행동·설정 검사', () => {
  it('신뢰할 수 없는 입력은 걸러낸다', () => {
    expect(parseAction({ type: 'move', unitId: 'p0-scout-0', c: 1, r: 1, flip: 'yes' })).toEqual({ type: 'move', unitId: 'p0-scout-0', c: 1, r: 1, flip: false })
    expect(parseAction({ type: 'move', unitId: 'p0-scout-0', c: 5, r: 1 })).toBeNull()
    expect(parseAction({ type: 'attack', unitId: 'a', targetId: 'b', mode: 'smash' })).toBeNull()
    expect(parseAction({ type: 'summon', unitId: '', c: 0, r: 0 })).toBeNull()
    expect(parseAction({ type: 'resign', seat: 1 })).toEqual({ type: 'resign' })
    expect(parseOptions({ greatMin: 7, target: 15, handleMs: 5, level: 'god', countdown: 99 })).toEqual({
      greatMin: 20,
      target: 15,
      handleMs: 1000,
      level: 'normal',
      countdown: 3000,
    })
  })

  it('규칙 위반은 상태를 건드리지 않고 거절한다', () => {
    const t = def.setup({ seats: seats('human', 'human'), seed: 1, options: parseOptions({ countdown: 0 }) })
    const copy = structuredClone(t)
    expect(() => def.apply(t, 0, { type: 'end' }, ctx)).toThrow('먼저 소환')
    expect(() => def.apply(t, 0, { type: 'summon', unitId: 'p0-scout-0', c: 2, r: 3 }, ctx)).toThrow('소환 줄')
    expect(t).toEqual(copy)
  })
})

describe('시계', () => {
  it('카운트다운을 먼저 쓰고, 그 뒤로 대모래시계와 활성 플레이어의 모래가 흐른다', () => {
    let t = def.setup({ seats: seats('human', 'human'), seed: 1, options: parseOptions({ countdown: 3000, handleMs: 0 }) })
    expect(def.actors(t)).toEqual([])
    expect(() => def.apply(t, 0, { type: 'end' }, ctx)).toThrow('시작 전')
    const great = t.game.greatRem
    t = def.clock!.advance(t, 2000, ctx)
    expect([t.countdown, t.game.greatRem]).toEqual([1000, great])
    const scout = reserve(t.game, 0).find((u) => u.kind === 'scout')!
    t = def.clock!.advance(t, 3000, ctx)
    expect([t.countdown, t.game.greatRem]).toEqual([0, great - 2000])
    expect(def.actors(t)).toEqual([0])
    t = def.apply(t, 0, { type: 'summon', unitId: scout.id, c: 2, r: 0 }, ctx)
    t = def.clock!.advance(t, 10_000, ctx)
    expect(t.game.units[scout.id]!.rem).toBe(50_000)
  })

  it('시간 때문에 생긴 일도 누구의 일인지와 함께 기록한다', () => {
    let t = def.setup({ seats: seats('human', 'human'), seed: 1, options: parseOptions({ countdown: 0, handleMs: 0 }) })
    const scout = reserve(t.game, 0).find((u) => u.kind === 'scout')!
    t = def.apply(t, 0, { type: 'summon', unitId: scout.id, c: 2, r: 0 }, ctx)
    const logs: { text: string; kind?: string }[] = []
    def.clock!.advance(t, 61_000, { log: (text, kind) => logs.push(kind === undefined ? { text } : { text, kind }) })
    expect(logs.some((l) => l.kind === 'p0' && l.text.includes('소멸'))).toBe(true)
  })
})

describe('진행', () => {
  it('봇끼리 가상 시간으로 한 판을 끝까지 둔다', () => {
    const time = simTime()
    const match = new Match(def, {
      seats: seats('bot', 'bot'),
      seed: 1,
      options: parseOptions({ greatMin: 5, target: 10, countdown: 3000 }),
      timers: time.timers,
      now: time.now,
      autoDelay: () => 1500,
      onChange: () => {},
    })
    match.schedule()
    time.run(60 * 60_000)
    expect(match.over).toBe(true)
    expect(match.log.at(-1)?.text).toMatch(/승리/)
  })

  it('온라인: 카운트다운 뒤 선 플레이어부터, 시간은 서버 시계로 흐르고 보기에는 엔진 기록이 없다', () => {
    const time = simTime()
    let n = 0
    const hub = new RoomHub(def, { randomInt: (m) => ++n % m, token: () => `t${++n}`, now: time.now, timers: time.timers })
    const a = new FakeConn()
    hub.receive(a, { t: 'create', name: '가람', seats: 2, options: { greatMin: 10, handleMs: 0 } })
    const b = new FakeConn()
    hub.receive(b, { t: 'join', code: a.room.code!, name: '나래' })
    hub.receive(a, { t: 'start' })
    expect(a.room.actors).toEqual([])
    hub.receive(a, { t: 'act', action: { type: 'end' } })
    expect(a.error?.message).toMatch(/차례|시작/)
    time.run(3500)
    expect(a.room.actors).toEqual([0])
    expect(a.room.view!.game.log).toEqual([])
    const scout = reserve(a.room.view!.game, 0).find((u) => u.kind === 'scout')!
    hub.receive(a, { t: 'act', action: { type: 'summon', unitId: scout.id, c: 0, r: 0 } })
    time.skip(5000)
    hub.receive(a, { t: 'act', action: { type: 'end' } })
    expect(a.room.view!.game.active).toBe(1)
    expect(a.room.view!.game.units[scout.id]!.rem).toBe(55_000)
    expect(b.room.log.some((l) => l.kind === 'p0' && l.text.includes('소환'))).toBe(true)
  })
})
