// GameDef: 입력 검사, 좌석별로 가린 상태, 거절 시 상태 불변, 엔진과 같은 진행, 봇끼리 끝까지, 온라인 방 흐름(대리 포함)
import { Match, type RoomSnapshot, type ServerMessage, type Timers } from '@gamehub/net'
import { RoomHub, type Conn } from '@gamehub/net/server'
import { describe, expect, it } from 'vitest'
import { def, parseAction, parseOptions, redact, type Action, type View } from '../src/def'
import { createGame, createRng, makeAiBid, nextRound, resolveRound, type GameState, type RoundBid } from '../src/engine'

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
const setup = (kinds: ('human' | 'bot')[], seed = 7, level: 'easy' | 'normal' = 'normal') => def.setup({ seats: seats(kinds), seed, options: { level } })

/** 엔진의 AI 와 같은 방식으로 사람 자리의 제안을 만든다(테스트용, 판의 난수는 건드리지 않음) */
function humanBid(g: GameState, seat: number, salt: number): RoundBid {
  const agents = g.agents.map((a, i) => (i === seat ? { ...a, kind: 'ai' as const, level: 'normal' as const } : a))
  return makeAiBid({ ...g, agents }, seat, createRng(salt * 7919 + seat))
}
const bid = (g: GameState, b: RoundBid): Action => ({ type: 'bid', round: g.round, first: b.first, second: b.second })

describe('parseAction', () => {
  it('형식이 맞는 행동만, 필요한 키만 새로 만든다', () => {
    expect(parseAction({ type: 'ready', round: 2, seat: 3 })).toEqual({ type: 'ready', round: 2 })
    expect(parseAction({ type: 'bid', round: 1, first: { playerId: 3, clubId: 2, demand: 4, agent: 1 }, second: null })).toEqual({
      type: 'bid',
      round: 1,
      first: { playerId: 3, clubId: 2, demand: 4 },
      second: null,
    })
  })
  it('틀린 형식은 null', () => {
    for (const raw of [
      null,
      'ready',
      [],
      { type: 'ready' },
      { type: 'ready', round: 0 },
      { type: 'ready', round: 6 },
      { type: 'ready', round: 1.5 },
      { type: 'bid', round: 1, first: null },
      { type: 'bid', round: 1, first: { playerId: 1, clubId: 1, demand: 5 }, second: null },
      { type: 'bid', round: 1, first: { playerId: -1, clubId: 1, demand: 1 }, second: null },
      { type: 'bid', round: 1, first: { playerId: 999, clubId: 1, demand: 1 }, second: null },
      { type: 'bid', round: 1, first: { playerId: 1, clubId: 99, demand: 1 }, second: null },
      { type: 'bid', round: 1, first: { playerId: '1', clubId: 1, demand: 1 }, second: null },
      { type: 'bid', round: 1, first: [1, 2, 3], second: null },
      { type: 'act', round: 1 },
    ]) {
      expect(parseAction(raw)).toBeNull()
    }
  })
  it('옵션: 쉬움이 아니면 보통', () => {
    expect(parseOptions({ level: 'easy' })).toEqual({ level: 'easy' })
    expect(parseOptions({ level: 'hard' })).toEqual({ level: 'normal' })
    expect(parseOptions(undefined)).toEqual({ level: 'normal' })
  })
})

describe('setup', () => {
  it('봇 자리는 엔진 AI(옵션 난이도), 사람 자리는 사람', () => {
    const t = setup(['human', 'bot', 'human', 'bot'], 3, 'easy')
    expect(t.game.agents.map((a) => a.kind)).toEqual(['human', 'ai', 'human', 'ai'])
    expect(t.game.agents[1]!.level).toBe('easy')
    expect(t.game).toEqual(createGame([{ name: '1번', kind: 'human' }, { name: '2번', kind: 'ai', level: 'easy' }, { name: '3번', kind: 'human' }, { name: '4번', kind: 'ai', level: 'easy' }], 3))
  })
})

describe('view', () => {
  it('남의 목표 카드·이후 이벤트·더미 순서·난수·남의 제안을 가린다', () => {
    let t = setup(['human', 'human', 'bot'])
    const b0 = humanBid(t.game, 0, 1)
    t = def.apply(t, 0, bid(t.game, b0), ctx)
    const v1 = def.view(t, 1)
    const v0 = def.view(t, 0)
    const raw = JSON.stringify(v1)
    expect(v1.game.rng).toBe(0)
    expect(v1.game.events).toHaveLength(2)
    expect(v1.game.agents[0]!.goals.every((x) => x === -1)).toBe(true)
    expect(v1.game.agents[1]!.goals).toEqual(t.game.agents[1]!.goals)
    expect(Object.values(v1.game.needDecks).flat().every((x) => x === -1)).toBe(true)
    expect(v1.done).toEqual([0])
    expect(v1.myBid).toBeNull()
    expect(raw).not.toContain('"subs"')
    expect(v0.myBid).toEqual(b0)
    const watch = def.view(t, null)
    expect(watch.me).toBeNull()
    expect(watch.myBid).toBeNull()
    expect(watch.game.agents.every((a) => a.goals.every((x) => x === -1))).toBe(true)
  })
  it('끝나면 모두 공개한다', () => {
    let t = setup(['bot', 'bot', 'bot'])
    while (!def.isOver(t)) t = def.apply(t, 0, def.bot!.next(t, 0, {})!, ctx)
    expect(def.view(t, null).game).toEqual(t.game)
    expect(redact(t.game, 1)).toBe(t.game)
  })
})

describe('apply', () => {
  it('거절할 때 상태를 건드리지 않는다', () => {
    let t = setup(['human', 'human', 'bot'])
    t = def.apply(t, 0, bid(t.game, { first: null, second: null }), ctx)
    const before = JSON.stringify(t)
    const bad: [number, Action][] = [
      [0, bid(t.game, { first: null, second: null })], // 두 번 제출
      [1, { type: 'ready', round: 1 }], // 아직 결과 전
      [1, { type: 'bid', round: 2, first: null, second: null }], // 지난·다른 라운드
      [2, bid(t.game, { first: null, second: null })], // 엔진 AI 자리(사람이 있으면 행동하지 않음)
    ]
    for (const [seat, action] of bad) expect(() => def.apply(t, seat, action, ctx)).toThrow()
    expect(JSON.stringify(t)).toBe(before)
  })
  it('엔진을 직접 부른 것과 같은 진행(같은 시드·같은 제안)', () => {
    for (const seed of [1, 42, 2026]) {
      for (const kinds of [['human', 'bot', 'bot'], ['human', 'human', 'bot', 'human'], ['human', 'human', 'human']] as ('human' | 'bot')[][]) {
        let t = def.setup({ seats: seats(kinds), seed, options: { level: 'normal' } })
        let g = createGame(kinds.map((k, i) => ({ name: `${i + 1}번`, kind: k === 'bot' ? 'ai' : 'human', ...(k === 'bot' ? { level: 'normal' as const } : {}) })), seed)
        expect(t.game).toEqual(g)
        while (g.phase !== 'done') {
          const subs: Record<number, RoundBid> = {}
          kinds.forEach((k, i) => {
            if (k === 'human') subs[i] = humanBid(g, i, seed + g.round)
          })
          for (const [i, b] of Object.entries(subs)) t = def.apply(t, Number(i), bid(t.game, b), ctx)
          g = resolveRound(g, subs)
          expect(t.game).toEqual(g)
          for (const i of def.actors(t)) t = def.apply(t, i, { type: 'ready', round: g.round }, ctx)
          g = nextRound(g)
          expect(t.game).toEqual(g)
        }
        expect(def.isOver(t)).toBe(true)
        expect(def.actors(t)).toEqual([])
      }
    }
  })
  it('대리 제안은 판의 난수를 건드리지 않고, 같은 상태면 같은 제안', () => {
    const t = setup(['human', 'human', 'bot'])
    const a = def.bot!.next(t, 1, {})
    const b = def.bot!.next(t, 1, {})
    expect(a).toEqual(b)
    expect(a?.type).toBe('bid')
    const after = def.apply(t, 1, a!, { ...ctx, byBot: true })
    expect(after.game.rng).toBe(t.game.rng)
  })
})

describe('Match', () => {
  it('봇끼리 끝까지 둔다(3·4인, 쉬움·보통)', () => {
    for (const n of [3, 4]) {
      for (const level of ['easy', 'normal'] as const) {
        const ft = fakeTimers()
        const match = new Match(def, { seats: seats(Array.from({ length: n }, () => 'bot')), seed: n * 11, options: { level }, timers: ft.timers, autoDelay: () => 0, onChange: () => {} })
        match.schedule()
        ft.flush()
        expect(match.over).toBe(true)
        expect(match.state.game.agents.every((a) => a.final)).toBe(true)
      }
    }
  })
  it('사람 하나 + 봇: 사람이 내면 바로 정산(봇 차례 없음)', () => {
    const ft = fakeTimers()
    const match = new Match(def, { seats: seats(['human', 'bot', 'bot']), seed: 5, options: { level: 'normal' }, timers: ft.timers, autoDelay: () => null, onChange: () => {} })
    expect(match.actors()).toEqual([0])
    match.act(0, bid(match.state.game, { first: null, second: null }))
    expect(match.state.game.phase).toBe('result')
    match.act(0, { type: 'ready', round: 1 })
    expect(match.state.game.round).toBe(2)
    expect(match.state.game.phase).toBe('bid')
  })
})

describe('온라인 방', () => {
  function hub() {
    const ft = fakeTimers()
    let n = 0
    const h = new RoomHub(def, { randomInt: (max) => (n++ * 7) % max, token: () => `t${n++}`, now: () => 0, timers: ft.timers })
    return { h, ft }
  }

  it('두 사람 + 봇: 각자 내고, 결과를 본 뒤 다음, 나간 자리는 봇이 이어받아 끝까지', () => {
    const { h, ft } = hub()
    const a = new FakeConn()
    const b = new FakeConn()
    h.receive(a, { t: 'create', name: '가람', seats: 3, bots: [2], options: { level: 'easy' } })
    const code = a.room.code!
    h.receive(b, { t: 'join', code, name: '나래' })
    h.receive(a, { t: 'start' })
    expect(a.room.status).toBe('playing')
    expect(a.room.actors).toEqual([0, 1])
    const g = a.room.view!.game
    // 남의 목표 카드는 가려져 있다
    expect(a.room.view!.game.agents[1]!.goals.every((x) => x === -1)).toBe(true)
    expect(b.room.view!.game.agents[1]!.goals.every((x) => x >= 0)).toBe(true)
    // 남의 자리를 사칭할 수 없다: 좌석은 연결로 정해지고 행동 안의 좌석 필드는 버린다
    h.receive(a, { t: 'act', action: { type: 'bid', round: 1, first: null, second: null, seat: 1 } })
    expect(a.room.view!.done).toEqual([0])
    expect(b.room.view!.myBid).toBeNull()
    h.receive(a, { t: 'act', action: { type: 'bid', round: 1, first: null, second: null } })
    expect(a.error?.reason).toBe('rejected')
    h.receive(b, { t: 'act', action: { type: 'bid', round: g.round, first: null, second: null } })
    expect(a.room.view!.game.phase).toBe('result')
    expect(a.room.actors).toEqual([0, 1])
    // 나래가 나간다 → 그 자리는 봇이 대신 낸다
    h.receive(b, { t: 'leave' })
    expect(a.room.seats[1]!.kind).toBe('bot')
    h.receive(a, { t: 'act', action: { type: 'ready', round: 1 } })
    ft.flush()
    expect(a.room.view!.game.round).toBe(2)
    for (let k = 0; k < 40 && a.room.status !== 'over'; k++) {
      const r = a.room
      const ph = r.view!.game.phase
      if (r.actors.includes(0)) h.receive(a, { t: 'act', action: ph === 'bid' ? { type: 'bid', round: r.view!.game.round, first: null, second: null } : { type: 'ready', round: r.view!.game.round } })
      ft.flush()
    }
    expect(a.room.status).toBe('over')
    expect(a.room.view!.game.agents[1]!.goals.every((x) => x >= 0)).toBe(true)
  })

  it('관전자는 아무의 목표 카드도 보지 못한다', () => {
    const { h } = hub()
    const a = new FakeConn()
    const w = new FakeConn()
    h.receive(a, { t: 'create', name: '가람', seats: 3, bots: [1, 2] })
    h.receive(a, { t: 'start' })
    h.receive(w, { t: 'watch', code: a.room.code })
    expect(w.room.you).toBeNull()
    expect(w.room.view!.game.agents.every((x) => x.goals.every((id) => id === -1))).toBe(true)
    h.receive(w, { t: 'act', action: { type: 'ready', round: 1 } })
    expect(w.error?.reason).toBe('rejected')
  })
})

