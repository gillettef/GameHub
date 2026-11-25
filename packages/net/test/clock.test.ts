// 실시간 게임의 시계: 행동 직전·주기적으로 흐르고, version 은 그대로, 일시정지하면 멈추고, 방 활동으로 치지 않는다
import { describe, expect, it } from 'vitest'
import { RuleError, type GameDef } from '../src/core/game'
import { Match } from '../src/core/match'
import { LocalGame } from '../src/client/local'
import { RoomHub } from '../src/server/hub'
import { FakeConn, fakeTimers } from './fixtures'

interface Fuse {
  /** 차례마다 남은 시간. 0 이 되면 차례가 넘어간다 */
  left: number
  turn: number
  burned: number
}

/** 차례마다 5초 안에 'go' 를 누르지 못하면 시간이 다 돼 차례가 넘어가는 시험용 게임. 3번 타면 끝 */
const fuseGame: GameDef<Fuse, { go: true }> = {
  slug: 'fuse',
  minSeats: 2,
  maxSeats: 2,
  setup: () => ({ left: 5000, turn: 0, burned: 0 }),
  parseAction: () => ({ go: true }),
  actors: (s) => (s.burned >= 3 ? [] : [s.turn]),
  apply(s) {
    if (s.left <= 0) throw new RuleError('이미 늦었습니다.')
    return { ...s, left: 5000, turn: 1 - s.turn }
  },
  view: (s) => s,
  isOver: (s) => s.burned >= 3,
  clock: {
    advance(s, ms, ctx) {
      const left = s.left - ms
      if (left > 0) return { ...s, left }
      ctx.log('시간 초과')
      return { left: 5000, turn: 1 - s.turn, burned: s.burned + 1 }
    },
    syncMs: 1000,
  },
}

function setup() {
  const t = fakeTimers()
  let clock = 0
  let changes: (string | undefined)[] = []
  let paused = false
  const match = new Match(fuseGame, {
    seats: [
      { kind: 'human', name: 'A' },
      { kind: 'human', name: 'B' },
    ],
    seed: 1,
    options: undefined,
    timers: t.timers,
    now: () => clock,
    clockRunning: () => !paused,
    autoDelay: () => null,
    onChange: (by) => changes.push(by),
  })
  match.schedule()
  return {
    match,
    t,
    advance: (ms: number) => (clock += ms),
    pause: (v: boolean) => (paused = v),
    changes: () => {
      const c = changes
      changes = []
      return c
    },
  }
}

describe('실시간 시계', () => {
  it('행동 직전에 흐른 시간을 반영하고, 시간이 흐르기만 해서는 version 이 오르지 않는다(차례가 바뀔 때만)', () => {
    const { match, advance } = setup()
    advance(3000)
    match.act(0, { go: true })
    expect(match.state).toMatchObject({ turn: 1, left: 5000, burned: 0 })
    expect(match.version).toBe(1)
    advance(3000)
    match.refresh()
    expect(match.version).toBe(1)
    advance(3000)
    match.refresh()
    expect(match.state).toMatchObject({ turn: 0, burned: 1 })
    expect(match.version).toBe(2)
    expect(match.log.at(-1)?.text).toBe('시간 초과')
  })

  it('주기적으로 시계를 흘려 clock 으로 알리고, 끝나면 멈춘다', () => {
    const { match, t, advance, changes } = setup()
    for (let i = 0; i < 20 && t.queue.length; i++) {
      advance(1000)
      t.next()
    }
    expect(match.over).toBe(true)
    expect(changes().every((c) => c === 'clock')).toBe(true)
    expect(t.queue).toHaveLength(0)
  })

  it('일시정지한 동안 흐른 시간은 버린다', () => {
    const { match, advance, pause } = setup()
    pause(true)
    advance(60_000)
    match.refresh()
    pause(false)
    advance(1000)
    match.refresh()
    expect(match.state).toMatchObject({ left: 4000, burned: 0 })
  })

  it('한 기기 게임은 일시정지하면 시계도 멈춘다', () => {
    const t = fakeTimers()
    let clock = 0
    const game = new LocalGame(fuseGame, {
      seats: [
        { kind: 'human', name: 'A' },
        { kind: 'human', name: 'B' },
      ],
      timers: t.timers,
      now: () => clock,
    })
    game.start()
    game.setPaused(true)
    clock += 30_000
    t.next()
    game.setPaused(false)
    clock += 2000
    t.next()
    expect(game.getState().room.view).toMatchObject({ left: 3000, burned: 0 })
  })

  it('온라인: 시계만 흐른 것은 방 활동이 아니라 빈 방은 정리된다', () => {
    const t = fakeTimers()
    let clock = 0
    let n = 0
    const hub = new RoomHub(fuseGame, { randomInt: (m) => ++n % m, token: () => `t${++n}`, now: () => clock, timers: t.timers, idleMs: 10_000 })
    const a = new FakeConn()
    hub.receive(a, { t: 'create', name: 'A', seats: 2 })
    const b = new FakeConn()
    hub.receive(b, { t: 'join', code: a.room.code!, name: 'B' })
    hub.receive(a, { t: 'start' })
    clock += 2500
    t.next()
    expect((a.room.view as unknown as Fuse).left).toBe(2500)
    hub.disconnect(a)
    hub.disconnect(b)
    for (let i = 0; i < 30 && t.queue.length; i++) {
      clock += 1000
      t.next()
    }
    hub.sweep()
    expect(hub.size).toBe(0)
  })
})

describe('리뷰에서 찾은 경로', () => {
  it('시계가 게임을 끝낸 직후의 행동은 거절되지만 끝남은 알린다', () => {
    const { match, advance, changes } = setup()
    advance(4999)
    match.act(0, { go: true }) // 1번 차례
    changes()
    for (let i = 0; i < 2; i++) {
      advance(5001) // 시간 초과
      match.refresh()
    }
    advance(5001) // 세 번째 시간 초과는 행동 직전에 시계가 반영한다 → 끝
    expect(() => match.act(1, { go: true })).toThrow()
    expect(match.over).toBe(true)
    expect(changes()).toContain('clock')
  })

  it('시계로 차례가 바뀌면 version 이 올라 이전 차례에 고른 행동을 막는다', () => {
    const { match, advance } = setup()
    const v = match.version
    advance(5001)
    match.refresh()
    expect(match.version).toBe(v + 1)
  })

  it('온라인: 아무도 보고 있지 않으면 시계가 멈춘다', () => {
    const t = fakeTimers()
    let clock = 0
    let n = 0
    const hub = new RoomHub(fuseGame, { randomInt: (m) => ++n % m, token: () => `t${++n}`, now: () => clock, timers: t.timers })
    const a = new FakeConn()
    hub.receive(a, { t: 'create', name: 'A', seats: 2 })
    const b = new FakeConn()
    hub.receive(b, { t: 'join', code: a.joined.code, name: 'B' })
    hub.receive(a, { t: 'start' })
    hub.disconnect(a)
    hub.disconnect(b)
    clock += 60_000
    t.next()
    const back = new FakeConn()
    hub.receive(back, { t: 'resume', code: a.joined.code, token: a.joined.token! })
    expect((back.room.view as unknown as Fuse).burned).toBe(0)
  })
})

describe('행동 기록', () => {
  it('keepHistory: false 면 지난 행동을 남기지 않는다', () => {
    const t = fakeTimers()
    const forget = new Match({ ...fuseGame, keepHistory: false }, {
      seats: [
        { kind: 'human', name: 'A' },
        { kind: 'human', name: 'B' },
      ],
      seed: 1,
      options: undefined,
      timers: t.timers,
      now: () => 0,
      autoDelay: () => null,
      onChange: () => {},
    })
    forget.act(0, { go: true })
    expect(forget.history).toEqual([])
    expect(forget.version).toBe(1)
  })
})
