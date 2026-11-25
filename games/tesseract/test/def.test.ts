// GameDef: 행동 검사, 좌석별로 가린 상태, 봇끼리 끝까지, 온라인 방 흐름
import { Match, type RoomSnapshot, type ServerMessage, type Timers } from '@gamehub/net'
import { RoomHub, type Conn } from '@gamehub/net/server'
import { describe, expect, it } from 'vitest'
import { replay } from '../src/app/session'
import { def, parseAction, type View } from '../src/def'
import { getLegalActions } from '../src/engine'

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
      for (let k = 0; queue.length && k < max; k++) queue.shift()!.fn()
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

const seats = (kinds: ('human' | 'bot')[]) => kinds.map((kind, i) => ({ kind, name: `${i + 1}번` }))
const ctx = { name: (i: number) => `${i + 1}번`, log: () => {}, byBot: false }

function botMatch(n: number, seed: number) {
  const t = fakeTimers()
  const match = new Match(def, {
    seats: seats(Array.from({ length: n }, () => 'bot')),
    seed,
    options: { law: 'random' },
    timers: t.timers,
    autoDelay: () => 0,
    onChange: () => {},
  })
  match.schedule()
  t.flush(5000)
  return match
}

describe('행동 검사', () => {
  it('신뢰할 수 없는 입력은 걸러낸다', () => {
    expect(parseAction({ type: 'takeSlot', player: 0, slot: 1 })).toEqual({ type: 'takeSlot', player: 0, slot: 1 })
    expect(parseAction({ type: 'takeSlot', player: 5, slot: 1 })).toBeNull()
    expect(parseAction({ type: 'place', player: 0, dieId: 3, row: 3, col: 0 })).toBeNull()
    expect(parseAction({ type: 'place', player: 0, dieId: 3, row: 0, col: 4, front: 6 })).toBeNull()
    expect(parseAction({ type: 'place', player: 0, dieId: 3, row: 0, col: 4, front: 'time' })).toMatchObject({ front: 'time' })
    expect(parseAction({ type: 'roll', player: 1, dieId: 2, direction: 'up' })).toBeNull()
    expect(parseAction({ type: 'choosePersonalGoal', player: 0, goal: 'toString' })).toBeNull()
    expect(parseAction({ type: 'pass', player: 1, extra: true })).toEqual({ type: 'pass', player: 1 })
  })

  it('남의 자리 행동은 거절하고 상태를 건드리지 않는다', () => {
    const t = def.setup({ seats: seats(['human', 'human']), seed: 7, options: { law: 'random' } })
    const copy = structuredClone(t)
    const goal = t.game.players[1]!.personalOffer[0]!
    expect(() => def.apply(t, 0, { type: 'choosePersonalGoal', player: 1, goal }, ctx)).toThrow('내 자리')
    expect(() => def.apply(t, 0, { type: 'choosePersonalGoal', player: 0, goal: 'nope' as never }, ctx)).toThrow()
    expect(t).toEqual(copy)
  })

  it('우주 법칙 옵션은 아는 이름만 받는다', () => {
    expect(def.parseOptions!({ law: 'shakyMarket' })).toEqual({ law: 'shakyMarket' })
    expect(def.parseOptions!({ law: '__proto__' })).toEqual({ law: 'random' })
    expect(def.setup({ seats: seats(['human', 'bot']), seed: 1, options: { law: 'shakyMarket' } }).game.law).toBe('shakyMarket')
  })
})

describe('좌석별로 가린 상태', () => {
  it('난수·시드·덱 순서·남의 개인 목표를 가린다', () => {
    let t = def.setup({ seats: seats(['human', 'human']), seed: 11, options: { law: 'random' } })
    t = def.apply(t, 0, { type: 'choosePersonalGoal', player: 0, goal: t.game.players[0]!.personalOffer[0]! }, ctx)
    const mine = def.view(t, 0)
    const theirs = def.view(t, 1)
    expect(mine.game.rng.s).toBe(0)
    expect(mine.game.config.seed).toBe(0)
    expect(mine.game.players[0]!.personalGoal).not.toBeNull()
    expect(theirs.game.players[0]).toMatchObject({ personalGoal: null, personalOffer: [] })
    expect(theirs.game.players[1]!.personalOffer).toHaveLength(2)
    expect(theirs.last).toBeNull()
    expect(mine.last).toMatchObject({ type: 'choosePersonalGoal' })
    for (const d of mine.game.goalDecks) expect(d).toEqual([...d].sort())
    expect(mine.game.goalDecks.map((d) => d.length)).toEqual(t.game.goalDecks.map((d) => d.length))
    expect(mine.record).toBeNull()
  })

  it('가린 상태로도 화면이 쓰는 합법 행동은 같다', () => {
    let t = def.setup({ seats: seats(['human', 'human']), seed: 5, options: { law: 'random' } })
    for (const p of [0, 1]) t = def.apply(t, p, { type: 'choosePersonalGoal', player: p, goal: t.game.players[p]!.personalOffer[0]! }, ctx)
    expect(getLegalActions(def.view(t, 0).game)).toEqual(getLegalActions(t.game))
  })
})

describe('진행', () => {
  it('봇끼리 한 판을 끝까지 두고, 끝나면 전체 기록으로 다시 만들 수 있다', () => {
    for (const [n, seed] of [
      [2, 3],
      [4, 9],
    ] as const) {
      const match = botMatch(n, seed)
      expect(match.over).toBe(true)
      const v = def.view(match.state, null)
      expect(v.record).not.toBeNull()
      expect(replay(v.record!)).toEqual(match.state.game)
      expect(v.game.config.seed).toBe(seed)
    }
  })

  it('온라인: 개인 목표는 동시에 고르고, 남의 것은 보이지 않는다', () => {
    const t = fakeTimers()
    let n = 0
    const hub = new RoomHub(def, { randomInt: (max) => ++n % max, token: () => `t${++n}`, now: () => 0, timers: t.timers })
    const a = new FakeConn()
    hub.receive(a, { t: 'create', name: '가람', seats: 2, options: { law: 'shakyMarket' } })
    const b = new FakeConn()
    hub.receive(b, { t: 'join', code: a.room.code!, name: '나래' })
    hub.receive(a, { t: 'start' })
    expect(a.room.actors).toEqual([0, 1])
    expect(a.room.view!.game.law).toBe('shakyMarket')

    const offerB = b.room.view!.game.players[1]!.personalOffer
    hub.receive(b, { t: 'act', action: { type: 'choosePersonalGoal', player: 1, goal: offerB[0] } })
    expect(a.room.actors).toEqual([0])
    expect(a.room.view!.game.players[1]!.personalGoal).toBeNull()
    expect(b.room.view!.game.players[1]!.personalGoal).toBe(offerB[0])

    hub.receive(b, { t: 'act', action: { type: 'choosePersonalGoal', player: 0, goal: a.room.view!.game.players[0]!.personalOffer[0] } })
    expect(b.error?.message).toMatch(/차례|자리/)
  })
})
