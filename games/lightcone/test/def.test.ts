// GameDef 와 공통 방 코드(RoomHub·Match·LocalGame)에 붙였을 때의 흐름: 동시 제출, 가리기, 봇·대리 진행, 거절
import { Match, RuleError, type RoomSnapshot, type ServerMessage, type Timers } from '@gamehub/net'
import { LocalGame } from '@gamehub/net/client'
import { RoomHub, type Conn } from '@gamehub/net/server'
import { describe, expect, it } from 'vitest'
import { def, parseAction, type Action, type Table, type View } from '../src/def'
import { STAY, makeRng } from '../src/engine/engine'

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
    get size() {
      return queue.length
    },
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
const ctx = { name: (i: number) => `${i}`, log: () => {}, byBot: false }
const fresh = (seed = 7) => def.setup({ seats: seats(['human', 'human']), seed, options: undefined })

/** 화면에 보이는 정보만으로 무작위 합법 행동을 고른다(옛 rooms.test 의 choose) */
function choose(v: View, rng: () => number): Action | null {
  const m = v.mine!
  const pick = <T>(a: T[]) => a[Math.floor(rng() * a.length)]!
  if (v.phase === 'plan') return { type: 'moves', moves: m.fleets.map((f) => pick(f.legal)) }
  if (v.phase === 'attack') return { type: 'attacks', fleets: m.fleets.filter(() => rng() < 0.3).map((f) => f.id) }
  if (v.phase === 'blockade') return m.blockades.length ? { type: 'blockades', idx: m.blockades.filter(() => rng() < 0.7).map((o) => o.idx) } : null
  if (v.phase === 'occupy') {
    const used = new Set<string>()
    const orders: { fid: number; kind: 'occupy' }[] = []
    for (const f of m.fleets) {
      if (f.canOccupy && !used.has(f.real)) {
        used.add(f.real)
        orders.push({ fid: f.id, kind: 'occupy' })
      }
    }
    return { type: 'occupy', orders }
  }
  return null
}

/** 진행 중인 보기에 상대 비밀이 없다 */
function expectHidden(v: View) {
  const json = JSON.stringify(v)
  expect(json).not.toContain('"seed"')
  expect(json).not.toContain('"pending"')
  if (v.phase === 'over') return
  for (const pid of ['A', 'B'] as const) {
    if (pid === v.me) continue
    expect(v.sides[pid].fleets.every((f) => f.real === null)).toBe(true)
    expect(v.log.filter((e) => e.type === 'place' && e.pid === pid).every((e) => e.type === 'place' && e.secret === undefined)).toBe(true)
  }
  expect(v.history).toEqual([])
}

describe('행동 검사', () => {
  it('신뢰할 수 없는 입력은 걸러낸다', () => {
    expect(parseAction({ type: 'moves', moves: ['1', STAY, 'A'] })).toEqual({ type: 'moves', moves: ['1', STAY, 'A'] })
    expect(parseAction({ type: 'moves', moves: ['1', STAY] })).toBeNull()
    expect(parseAction({ type: 'moves', moves: ['18', STAY, STAY] })).toBeNull()
    expect(parseAction({ type: 'moves', moves: [1, STAY, STAY] })).toBeNull()
    expect(parseAction({ type: 'moves', moves: ['__proto__', STAY, STAY] })).toBeNull()
    expect(parseAction({ type: 'attacks', fleets: [1, 1, 3] })).toEqual({ type: 'attacks', fleets: [1, 3] })
    expect(parseAction({ type: 'attacks', fleets: [4] })).toBeNull()
    expect(parseAction({ type: 'attacks', fleets: [1.5] })).toBeNull()
    expect(parseAction({ type: 'attacks', fleets: '1' })).toBeNull()
    expect(parseAction({ type: 'blockades', idx: [0, 2] })).toEqual({ type: 'blockades', idx: [0, 2] })
    expect(parseAction({ type: 'blockades', idx: [-1] })).toBeNull()
    expect(parseAction({ type: 'occupy', orders: [{ fid: 1, kind: 'occupy' }, { fid: 2, kind: 'decoy', slot: 4, x: 1 }] })).toEqual({
      type: 'occupy',
      orders: [
        { fid: 1, kind: 'occupy' },
        { fid: 2, kind: 'decoy', slot: 4 },
      ],
    })
    expect(parseAction({ type: 'occupy', orders: [{ fid: 1, kind: 'decoy', slot: 2 }] })).toBeNull()
    expect(parseAction({ type: 'occupy', orders: [{ fid: 1, kind: 'steal' }] })).toBeNull()
    expect(parseAction({ type: 'occupy', orders: [{}, {}, {}, {}] })).toBeNull()
    expect(parseAction({ type: 'rematch' })).toBeNull()
    expect(parseAction(null)).toBeNull()
    expect(parseAction([])).toBeNull()
  })

  it('규칙 위반은 상태를 건드리지 않고 거절한다', () => {
    const t = fresh()
    const copy = structuredClone(t)
    expect(() => def.apply(t, 0, { type: 'moves', moves: ['9', STAY, STAY] }, ctx)).toThrow(RuleError)
    expect(() => def.apply(t, 0, { type: 'attacks', fleets: [] }, ctx)).toThrow('지금 단계')
    const a = def.apply(t, 0, { type: 'moves', moves: ['1', '2', STAY] }, ctx)
    expect(t).toEqual(copy)
    const aCopy = structuredClone(a)
    expect(() => def.apply(a, 0, { type: 'moves', moves: [STAY, STAY, STAY] }, ctx)).toThrow('이미 제출')
    expect(a).toEqual(aCopy)
    expect(def.actors(a)).toEqual([1])
    const both = def.apply(a, 1, { type: 'moves', moves: ['17', STAY, STAY] }, ctx)
    expect(a).toEqual(aCopy)
    expect(both.game.phase).toBe('attack')
    expect(both.pending).toEqual({})
    expect(def.actors(both)).toEqual([0, 1])
    // 공격한 함대는 점령·위장할 수 없다
    let s = def.apply(both, 0, { type: 'attacks', fleets: [1] }, ctx)
    s = def.apply(s, 1, { type: 'attacks', fleets: [] }, ctx)
    expect(s.game.phase).toBe('occupy')
    const sCopy = structuredClone(s)
    expect(() => def.apply(s, 0, { type: 'occupy', orders: [{ fid: 1, kind: 'decoy', slot: 3 }] }, ctx)).toThrow(RuleError)
    expect(() => def.apply(s, 0, { type: 'occupy', orders: [{ fid: 3, kind: 'occupy' }] }, ctx)).toThrow('3 는 점령할 수 없다')
    expect(() => def.apply(s, 0, { type: 'blockades', idx: [0] }, ctx)).toThrow('지금 단계')
    expect(s).toEqual(sCopy)
  })

  it('먼저 낸 행동은 상대·관전자에게 보이지 않고, 냈다는 사실만 보인다', () => {
    const t = fresh()
    const a = def.apply(t, 0, { type: 'moves', moves: ['1', '2', '3'] }, ctx)
    const before = def.view(t, 1)
    const after = def.view(a, 1)
    expect(after.submitted).toEqual({ A: true, B: false })
    expect({ ...after, submitted: before.submitted }).toEqual(before)
    const watch = def.view(a, null)
    expect({ ...watch, submitted: def.view(t, null).submitted }).toEqual(def.view(t, null))
    expectHidden(after)
    expectHidden(watch)
  })

  it('관전 보기에는 어느 쪽 비밀도 없다', () => {
    let t = fresh(11)
    t = def.apply(t, 0, { type: 'moves', moves: ['2', STAY, STAY] }, ctx)
    t = def.apply(t, 1, { type: 'moves', moves: ['16', STAY, STAY] }, ctx)
    t = def.apply(t, 0, { type: 'attacks', fleets: [] }, ctx)
    t = def.apply(t, 1, { type: 'attacks', fleets: [] }, ctx)
    t = def.apply(t, 0, { type: 'occupy', orders: [{ fid: 1, kind: 'occupy' }, { fid: 2, kind: 'decoy', slot: 3 }] }, ctx)
    t = def.apply(t, 1, { type: 'occupy', orders: [{ fid: 1, kind: 'occupy' }] }, ctx)
    const w = def.view(t, null)
    expect(w.me).toBeNull()
    expect(w.mine).toBeNull()
    expect(w.sides.A.fleets.every((f) => f.real === null) && w.sides.B.fleets.every((f) => f.real === null)).toBe(true)
    expect(w.log.filter((e) => e.type === 'place')).toHaveLength(3)
    expect(w.log.every((e) => e.type !== 'place' || e.secret === undefined)).toBe(true)
    expect(w.sides.A.slotCounts).toEqual([null, 0, 0, 1, 0, 1])
    const mine = def.view(t, 0)
    expect(mine.mine!.slots[5]).toEqual([{ kind: 'planet', planet: '2', round: 1 }])
    expect(mine.log.filter((e) => e.type === 'place' && e.secret !== undefined)).toHaveLength(2)
    expectHidden(mine)
  })
})

describe('공통 방 코드와 함께', () => {
  it('온라인: 두 사람이 화면 정보만으로 끝까지 두고, 진행 중에는 상대 비밀을 받지 않는다', () => {
    const t = fakeTimers()
    let n = 0
    const hub = new RoomHub(def, { randomInt: (max) => ++n % max, token: () => `t${++n}`, now: () => 0, timers: t.timers })
    const a = new FakeConn()
    const b = new FakeConn()
    hub.receive(a, { t: 'create', name: '가람', seats: 2 })
    const code = a.room.code!
    hub.receive(b, { t: 'join', code: code.toLowerCase(), name: '나래' })
    hub.receive(a, { t: 'start' })
    expect(a.room.status).toBe('playing')
    expect(a.room.actors).toEqual([0, 1])
    const rng = makeRng(5)
    let guard = 0
    while (a.room.status !== 'over') {
      if (++guard > 300) throw new Error('끝나지 않는다')
      for (const conn of [a, b]) {
        const room = conn.room
        expectHidden(room.view!)
        if (!room.actors.includes(room.you!)) continue
        const action = choose(room.view!, rng)
        if (action) hub.receive(conn, { t: 'act', action })
        expect(conn.error).toBeNull()
      }
    }
    const end = a.room.view!
    expect(end.sides.B.fleets.every((f) => f.real !== null)).toBe(true)
    expect(end.history.length).toBeGreaterThan(0)
    expect(['A', 'B', 'draw']).toContain(end.winner)
  })

  it('온라인: 형식이 틀리거나 두 번 낸 행동은 그 연결에만 거절을 알린다', () => {
    let n = 0
    const hub = new RoomHub(def, { randomInt: (max) => ++n % max, token: () => `t${++n}`, now: () => 0, timers: fakeTimers().timers })
    const a = new FakeConn()
    const b = new FakeConn()
    hub.receive(a, { t: 'create', name: '가람', seats: 2 })
    hub.receive(b, { t: 'join', code: a.room.code, name: '나래' })
    hub.receive(a, { t: 'start' })
    hub.receive(a, { t: 'act', action: { type: 'moves', moves: ['9', STAY, STAY] } })
    expect(a.error?.reason).toBe('rejected')
    hub.receive(a, { t: 'act', action: { type: 'moves', moves: 'x' } })
    expect(a.error?.reason).toBe('bad-request')
    hub.receive(a, { t: 'act', action: { type: 'moves', moves: [STAY, STAY, STAY] } })
    expect(a.error).toBeNull()
    expect(b.room.view!.submitted.A).toBe(true)
    hub.receive(a, { t: 'act', action: { type: 'moves', moves: [STAY, STAY, STAY] } })
    expect(a.error?.message).toContain('지금은 내 차례가 아닙니다')
  })

  it('접속이 끊긴 사람의 단계는 정해진 시간 뒤 봇이 대신 내고 기록에 남긴다', () => {
    const t = fakeTimers()
    let n = 0
    const hub = new RoomHub(def, { randomInt: (max) => ++n % max, token: () => `t${++n}`, now: () => 0, timers: t.timers, awayMs: 1000 })
    const a = new FakeConn()
    const b = new FakeConn()
    hub.receive(a, { t: 'create', name: '가람', seats: 2 })
    hub.receive(b, { t: 'join', code: a.room.code, name: '나래' })
    hub.receive(a, { t: 'start' })
    hub.receive(a, { t: 'act', action: { type: 'moves', moves: [STAY, STAY, STAY] } })
    hub.disconnect(b)
    t.flush(1)
    expect(a.room.view!.phase).toBe('attack')
    expect(a.room.log.some((l) => l.kind === 'proxy' && l.text.startsWith('나래'))).toBe(true)
  })

  it('봇끼리 두면 끝까지 간다(봇 실패 없이)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const t = fakeTimers()
      const m = new Match(def, { seats: seats(['bot', 'bot']), seed, options: undefined, timers: t.timers, autoDelay: () => 0, onChange: () => {} })
      m.schedule()
      t.flush()
      expect(m.over).toBe(true)
      expect(m.history.every((h) => h.byBot)).toBe(true)
    }
  })

  it('한 기기 봇 대전: 화면 경로(LocalGame)로 15판을 끝까지 둔다(옛 ?selftest)', () => {
    const rng = makeRng(99)
    for (let k = 0; k < 15; k++) {
      const t = fakeTimers()
      const game = new LocalGame(def, { seats: seats(['human', 'bot']), seed: 100 + k, timers: t.timers })
      game.start()
      let guard = 0
      while (game.getState().room.status !== 'over') {
        if (++guard > 400) throw new Error('끝나지 않는다')
        const room = game.getState().room
        expect(room.you).toBe(0)
        expectHidden(room.view!)
        const action = room.actors.includes(0) ? choose(room.view!, rng) : null
        if (action) game.act(action)
        else t.flush(1)
        expect(game.getState().error).toBeNull()
      }
      expect(game.getState().room.view!.winner).not.toBeNull()
    }
  })

  it('저장한 행동 기록을 다시 두면 같은 상태가 된다(봇 실체 보기가 쓰는 재생)', () => {
    const t = fakeTimers()
    const game = new LocalGame(def, { seats: seats(['human', 'bot']), seed: 3, timers: t.timers })
    game.start()
    const rng = makeRng(1)
    for (let i = 0; i < 12; i++) {
      const room = game.getState().room
      const action = room.actors.includes(0) ? choose(room.view!, rng) : null
      if (action) game.act(action)
      else t.flush(1)
    }
    const save = game.save()
    let s: Table = def.setup({ seats: save.seats, seed: save.seed, options: undefined })
    for (const mv of save.history) s = def.apply(s, mv.seat, mv.action, { ...ctx, byBot: mv.byBot })
    expect(def.view(s, 0)).toEqual(game.getState().room.view)
  })
})
