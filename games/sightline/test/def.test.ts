// GameDef 와 공통 방 코드(RoomHub·Match)에 붙였을 때의 흐름: 행동 검사, 좌석별 가리기, 봇 진행, 온라인 대국, 대리 진행
import { Match, RuleError, type RoomSnapshot, type ServerMessage, type Timers } from '@gamehub/net'
import { RoomHub, type Conn } from '@gamehub/net/server'
import { describe, expect, it } from 'vitest'
import { def, parseAction, playerOf, type SeatView, type Table } from '../src/def'
import { legalMoves, visibleIds } from '../src/engine/rules'

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
const setup = (n: 3 | 4, seed = 5) => def.setup({ seats: seats(Array.from({ length: n }, () => 'human')), seed, options: undefined })

/** 봇으로 k 번 둔다 */
function advance(t: Table, k: number): Table {
  for (let j = 0; j < k && !def.isOver(t); j++) {
    const seat = def.actors(t)[0]!
    t = def.apply(t, seat, def.bot!.next(t, seat, {})!, ctx)
  }
  return t
}

describe('행동 검사', () => {
  it('신뢰할 수 없는 입력은 걸러낸다', () => {
    expect(parseAction({ type: 'move', pieceId: 3, dir: 'N', steps: 2, extra: 1 })).toEqual({ type: 'move', pieceId: 3, dir: 'N', steps: 2 })
    expect(parseAction({ type: 'move', pieceId: 3, dir: 'X', steps: 1 })).toBeNull()
    expect(parseAction({ type: 'move', pieceId: 3, dir: 'N', steps: 3 })).toBeNull()
    expect(parseAction({ type: 'move', pieceId: 3.5, dir: 'N', steps: 1 })).toBeNull()
    expect(parseAction({ type: 'accuse', pieceId: 17 })).toBeNull()
    expect(parseAction({ type: 'contact', pieceId: '3' })).toBeNull()
    expect(parseAction({ type: 'scout', seat: 'S' })).toEqual({ type: 'scout', seat: 'S' })
    expect(parseAction({ type: 'scout', seat: 'north' })).toBeNull()
    expect(parseAction({ type: 'scoutAccuse', pieceId: null })).toEqual({ type: 'scoutAccuse', pieceId: null })
    expect(parseAction({ type: 'scoutAccuse' })).toBeNull()
    expect(parseAction({ type: 'pass', x: 1 })).toEqual({ type: 'pass' })
    expect(parseAction(['pass'])).toBeNull()
    expect(parseAction('pass')).toBeNull()
    expect(parseAction({ type: '__proto__' })).toBeNull()
  })

  it('규칙 위반은 상태를 건드리지 않고 RuleError 로 거절한다', () => {
    const t = setup(4)
    const copy = structuredClone(t)
    const seat = def.actors(t)[0]!
    expect(() => def.apply(t, seat, { type: 'pass' }, ctx)).toThrow(RuleError)
    expect(() => def.apply(t, seat, { type: 'contact', pieceId: 1 }, ctx)).toThrow('접선 지점')
    expect(() => def.apply(t, seat, { type: 'scoutAccuse', pieceId: null }, ctx)).toThrow(RuleError)
    expect(() => def.apply(t, seat, { type: 'scout', seat: t.seats[seat]! }, ctx)).toThrow('다른 플레이어')
    expect(() => def.apply(t, (seat + 1) % 4, { type: 'pass' }, ctx)).toThrow('내 차례')
    expect(t).toEqual(copy)
    // 받아들인 행동도 이전 상태를 바꾸지 않는다
    const m = legalMoves(t.game.pieces, t.seats[seat]!, t.game.emptySeats)[0]!
    const next = def.apply(t, seat, { type: 'move', pieceId: m.pieceId, dir: m.dir, steps: m.steps }, ctx)
    expect(next.game.seq).toBe(1)
    expect(t).toEqual(copy)
  })

  it('1번 자리는 남쪽, 시계 방향으로 앉는다', () => {
    expect(setup(4).seats).toEqual(['S', 'W', 'N', 'E'])
    expect(setup(3).seats).toEqual(['S', 'N', 'E'])
    expect(setup(3).game.emptySeats).toEqual(['W'])
  })
})

describe('좌석별로 가린 화면 정보', () => {
  /** 그 좌석이 알아도 되는 말: 내 명단, 지금 보이는 것, 예전에 본 것, 정원을 떠난 것 */
  function allowed(t: Table, seat: number): Set<number> {
    const pl = t.game.players[playerOf(t, seat)]!
    const ids = new Set([...pl.roster.agents, pl.roster.neutral, ...visibleIds(t.game.pieces, pl.seat), ...Object.keys(pl.seen).map(Number)])
    if (t.game.phase === 'scout' && t.game.scout!.player === playerOf(t, seat)) for (const id of t.game.scout!.visible) ids.add(id)
    for (const p of t.game.pieces) if (!p.present) ids.add(p.id)
    return ids
  }

  it('남의 명단·문양·시드는 게임 내내 새지 않는다(4인·3인, 정찰 중 포함)', () => {
    let scouts = 0
    for (const n of [4, 3] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        let t = setup(n, seed)
        while (!def.isOver(t)) {
          if (t.game.phase === 'scout') scouts++
          for (let seat = 0; seat < n; seat++) {
            const v = def.view(t, seat)
            const ok = allowed(t, seat)
            for (const p of v.pieces) if (p.crest !== undefined) expect(ok.has(p.id), `${seat}번 자리에 ${p.id}번 문양`).toBe(true)
            const others = t.game.players.filter((_, k) => k !== playerOf(t, seat))
            expect(v.roster).toEqual(t.game.players[playerOf(t, seat)]!.roster)
            const json = JSON.stringify(v)
            for (const o of others) expect(json).not.toContain(`"agents":${JSON.stringify(o.roster.agents)}`)
            expect(v).not.toHaveProperty('seed')
            expect(v).not.toHaveProperty('log')
            // 남이 정찰 중이면 정찰한 좌석만 알고, 그 좌석에서 보인 말 목록은 모른다
            if (v.scout && t.game.scout!.player !== playerOf(t, seat)) expect(v.scout).not.toHaveProperty('visible')
          }
          const spectator = def.view(t, null)
          expect(spectator.roster).toBeNull()
          for (const p of spectator.pieces) if (p.present) expect(p.crest).toBeUndefined()
          t = advance(t, 1)
        }
        // 끝나면 모두 공개한다
        for (const p of def.view(t, null).pieces) expect(p.crest).toBe(t.game.pieces[p.id - 1]!.crest)
      }
    }
    expect(scouts, '정찰 중인 상태도 검사했다').toBeGreaterThan(0)
  })
})

describe('진행', () => {
  it('봇끼리 3인·4인 한 판을 끝까지 둔다', () => {
    for (const n of [3, 4]) {
      const t = fakeTimers()
      const match = new Match(def, { seats: seats(Array.from({ length: n }, () => 'bot')), seed: 11 + n, options: undefined, timers: t.timers, autoDelay: () => 0, onChange: () => {} })
      match.schedule()
      t.flush(20000)
      expect(match.over).toBe(true)
      expect(match.log.at(-1)?.text).toMatch(/게임 종료/)
      expect(match.state.game.result!.winners.length).toBeGreaterThanOrEqual(1)
    }
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

  it('온라인: 만들기·참가·시작, 내 차례가 아니면 거절, 끊긴 사람은 대리 진행', () => {
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
    expect(a.room.view!.seats).toEqual(['S', 'N', 'E'])
    expect(a.room.view!.roster).not.toEqual(b.room.view!.roster)

    // 봇(3번 자리) 차례면 봇이 둘 때까지
    let guard = 0
    while (!a.room.actors.some((s) => s === 0 || s === 1) && guard++ < 10) t.flush(1)
    const turn = a.room.actors[0]!
    const [me, other] = turn === 0 ? [a, b] : [b, a]
    hub.receive(other, { t: 'act', action: { type: 'pass' } })
    expect(other.error?.message).toMatch(/차례/)
    hub.receive(me, { t: 'act', action: { type: 'move', pieceId: 99 } })
    expect(me.error?.reason).toBe('bad-request')
    const v = me.room.view!
    const mySeat = v.players[v.me!]!.seat
    const m = legalMoves(v.pieces, mySeat, v.emptySeats)[0]!
    hub.receive(me, { t: 'act', action: { type: 'move', pieceId: m.pieceId, dir: m.dir, steps: m.steps } })
    expect(me.room.view!.seq).toBe(v.seq + 1)
    expect(me.room.log.at(-1)!.kind).toBe(mySeat)

    hub.disconnect(b)
    // 가람은 계속 두고, 나래 차례는 봇이 대신 둔다
    for (let k = 0; k < 12; k++) {
      const r = a.room
      if (r.actors[0] === 0) {
        const mv = legalMoves(r.view!.pieces, 'S', r.view!.emptySeats)[0]!
        hub.receive(a, { t: 'act', action: { type: 'move', pieceId: mv.pieceId, dir: mv.dir, steps: mv.steps } })
      } else t.flush(1)
    }
    expect(a.room.log.some((l) => l.text.endsWith('(대리)'))).toBe(true)
  })
})
