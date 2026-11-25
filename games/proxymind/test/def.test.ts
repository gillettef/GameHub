// GameDef 와 공통 방 코드(RoomHub·Match)에 붙였을 때의 흐름: 행동 검사, 좌석별 가리기, 봇 진행, 온라인 대국, 대리 진행
import { Match, RuleError, type RoomSnapshot, type ServerMessage, type Timers } from '@gamehub/net'
import { RoomHub, type Conn } from '@gamehub/net/server'
import { describe, expect, it } from 'vitest'
import { def, parseAction, parseOptions, type SeatView, type Table } from '../src/def'
import { createGame, currentBot, playTurn, submitDesign, targetOf } from '../src/engine/engine'

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
const setup = (n: number, seed = 5, level: 'normal' | 'easy' = 'normal') =>
  def.setup({ seats: seats(Array.from({ length: n }, () => 'human')), seed, options: { level } })

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
    expect(parseAction({ type: 'design', slots: [0, 5, 44], seat: 2 })).toEqual({ type: 'design', slots: [0, 5, 44] })
    expect(parseAction({ type: 'design', slots: [0, 5] })).toBeNull()
    expect(parseAction({ type: 'design', slots: [0, 5, 5] })).toBeNull()
    expect(parseAction({ type: 'design', slots: [0, 5, 45] })).toBeNull()
    expect(parseAction({ type: 'design', slots: [0, 5, 1.5] })).toBeNull()
    expect(parseAction({ type: 'design', slots: '0,1,2' })).toBeNull()
    expect(parseAction({ type: 'intervene', iv: { k: 'none', extra: 1 } })).toEqual({ type: 'intervene', iv: { k: 'none' } })
    expect(parseAction({ type: 'intervene', iv: { k: 'turn', dir: 'R' } })).toEqual({ type: 'intervene', iv: { k: 'turn', dir: 'R' } })
    expect(parseAction({ type: 'intervene', iv: { k: 'turn', dir: 'U' } })).toBeNull()
    expect(parseAction({ type: 'intervene', iv: { k: 'block', slot: 3 } })).toBeNull()
    expect(parseAction({ type: 'intervene', iv: { k: 'block', slot: 2 } })).toEqual({ type: 'intervene', iv: { k: 'block', slot: 2 } })
    expect(parseAction({ type: 'intervene' })).toBeNull()
    expect(parseAction(['design'])).toBeNull()
    expect(parseAction('design')).toBeNull()
    expect(parseAction({ type: '__proto__' })).toBeNull()
    expect(parseOptions(undefined)).toEqual({ level: 'normal' })
    expect(parseOptions({ level: 'easy' })).toEqual({ level: 'easy' })
    expect(parseOptions({ level: 'hard' })).toEqual({ level: 'normal' })
  })

  it('규칙 위반은 상태를 건드리지 않고 RuleError 로 거절한다', () => {
    const t = setup(4)
    const copy = structuredClone(t)
    const hand = t.game.players[0]!.hand
    const other = t.game.players[1]!.hand
    expect(() => def.apply(t, 0, { type: 'intervene', iv: { k: 'none' } }, ctx)).toThrow('실행 단계')
    expect(() => def.apply(t, 0, { type: 'design', slots: [other[0]!, other[1]!, other[2]!] }, ctx)).toThrow(RuleError)
    expect(() => def.apply(t, 0, { type: 'design', slots: [hand[0]!, hand[1]!, other[0]!] }, ctx)).toThrow('서로 다른 3개')
    expect(t).toEqual(copy)
    // 받아들인 행동도 이전 상태를 바꾸지 않는다
    const next = def.apply(t, 0, { type: 'design', slots: hand.slice(0, 3) }, ctx)
    expect(next.game.players[0]!.pending).toEqual(hand.slice(0, 3))
    expect(t).toEqual(copy)
    // 이미 놓았으면 다시 놓을 수 없고, 실행 단계에서 남의 로봇은 움직일 수 없다
    expect(() => def.apply(next, 0, { type: 'design', slots: hand.slice(0, 3) }, ctx)).toThrow('차례')
    let e = next
    for (let d = 1; d < 4; d++) e = def.apply(e, d, { type: 'design', slots: e.game.players[d]!.hand.slice(0, 3) }, ctx)
    expect(e.game.phase).toBe('exec')
    const cur = currentBot(e.game)
    expect(def.actors(e)).toEqual([cur])
    expect(() => def.apply(e, (cur + 1) % 4, { type: 'intervene', iv: { k: 'none' } }, ctx)).toThrow('차례')
    const noEnergy = structuredClone(e)
    noEnergy.game.players[cur]!.energy = 0
    expect(() => def.apply(noEnergy, cur, { type: 'intervene', iv: { k: 'thrust' } }, ctx)).toThrow('할 수 없는 개입')
    expect(noEnergy.game.players[cur]!.energy).toBe(0)
  })

  it('def 를 거친 진행이 엔진을 바로 부른 것과 같다', () => {
    const t0 = setup(3, 21)
    const g = createGame(seats(['human', 'human', 'human']).map((s) => ({ ...s, level: 'normal' as const })), 21)
    expect(t0.game).toEqual(g)
    let t = t0
    for (let k = 0; k < 40 && !def.isOver(t); k++) {
      const seat = def.actors(t)[0]!
      const a = def.bot!.next(t, seat, {})!
      t = def.apply(t, seat, a, ctx)
      if (a.type === 'design') submitDesign(g, seat, a.slots)
      else playTurn(g, a.iv)
      expect(t.game).toEqual(g)
    }
  })
})

describe('좌석별로 가린 화면 정보', () => {
  it('남의 손패·공개 전 배치·주머니 순서·난수·시드는 게임 내내 새지 않는다(3~5인)', () => {
    let checkedPending = 0
    for (const n of [3, 4, 5]) {
      for (let seed = 1; seed <= 3; seed++) {
        let t = setup(n, seed)
        while (!def.isOver(t)) {
          for (let seat = 0; seat < n; seat++) {
            const v = def.view(t, seat)
            expect(v.rng).toBe(0)
            expect(v).not.toHaveProperty('seed')
            expect(v.bag.every((x) => x === -1)).toBe(true)
            expect(v.bag.length).toBe(t.game.bag.length)
            v.players.forEach((p, i) => {
              const real = t.game.players[i]!
              if (i === seat) {
                expect(p.hand).toEqual(real.hand)
                expect(p.pending).toEqual(real.pending)
              } else {
                expect(p.hand.every((x) => x === -1)).toBe(true)
                if (real.pending) {
                  checkedPending++
                  expect(p.pending).toEqual([-1, -1, -1])
                } else expect(p.pending).toBeNull()
              }
              // 공개된 두뇌는 그대로 보인다
              expect(p.brain).toEqual(real.brain)
            })
            // 사건 기록은 이번 라운드 것만
            expect(v.log.filter((e) => e.t === 'round').length).toBeLessThanOrEqual(1)
          }
          const spectator = def.view(t, null)
          for (const p of spectator.players) {
            expect(p.hand.every((x) => x === -1)).toBe(true)
            expect(p.pending === null || p.pending.every((x) => x === -1)).toBe(true)
          }
          t = advance(t, 1)
        }
        expect(def.view(t, null).rng).toBe(0)
      }
    }
    expect(checkedPending, '먼저 놓은 배치를 가린 상태도 검사했다').toBeGreaterThan(0)
  })

  it('설계 중인 상대의 대상 로봇 정보는 공개, 내 손패로 판정할 수 있다', () => {
    const t = setup(4, 8)
    const v = def.view(t, 2)
    expect(targetOf(v, 2)).toBe(1)
    expect(v.players[2]!.hand.length).toBe(5)
    expect(v.players[2]!.hand.every((x) => x >= 0)).toBe(true)
  })
})

describe('진행', () => {
  it('봇끼리 3~5인 한 판을 끝까지 둔다(쉬움 포함)', () => {
    for (const [n, level] of [
      [3, 'normal'],
      [4, 'easy'],
      [5, 'normal'],
    ] as const) {
      const t = fakeTimers()
      const match = new Match(def, { seats: seats(Array.from({ length: n }, () => 'bot')), seed: 11 + n, options: { level }, timers: t.timers, autoDelay: () => 0, onChange: () => {} })
      match.schedule()
      t.flush(20000)
      expect(match.over).toBe(true)
      expect(match.state.game.round).toBe(8)
      expect(match.state.game.players.every((p) => p.level === level)).toBe(true)
      expect(match.log.at(-1)?.text).toMatch(/게임 종료/)
      const g = match.state.game
      expect(g.players.reduce((a, p) => a + p.cores, 0) + g.cores.length + g.coreSupply).toBe(20)
    }
  })

  it('저장한 행동 기록으로 같은 판을 다시 만든다(한 기기 이어하기)', () => {
    const t = fakeTimers()
    const opts = { seats: seats(['bot', 'bot', 'bot', 'bot']), seed: 77, options: { level: 'normal' as const }, timers: t.timers, autoDelay: () => 0, onChange: () => {} }
    const a = new Match(def, opts)
    a.schedule()
    t.flush(30)
    const b = new Match(def, { ...opts, replay: a.history })
    expect(b.state).toEqual(a.state)
  })

  it('온라인: 만들기·참가·시작, 동시 설계, 내 차례가 아니면 거절, 끊긴 사람은 대리 진행', () => {
    const t = fakeTimers()
    let n = 0
    const hub = new RoomHub(def, { randomInt: (max) => ++n % max, token: () => `t${++n}`, now: () => 0, timers: t.timers })
    const a = new FakeConn()
    hub.receive(a, { t: 'create', name: '가람', seats: 3, options: { level: 'easy' } })
    const code = a.room.code!
    const b = new FakeConn()
    hub.receive(b, { t: 'join', code, name: '나래' })
    hub.receive(a, { t: 'start' })
    expect(a.room.status).toBe('playing')
    expect(a.room.options).toEqual({ level: 'easy' })
    expect(a.room.actors).toEqual(expect.arrayContaining([0, 1]))
    // 서로의 손패는 가려져 있다
    expect(a.room.view!.players[1]!.hand.every((x) => x === -1)).toBe(true)
    expect(b.room.view!.players[0]!.hand.every((x) => x === -1)).toBe(true)

    hub.receive(a, { t: 'act', action: { type: 'design', slots: [99, 1, 2] } })
    expect(a.error?.reason).toBe('bad-request')
    const mine = a.room.view!.players[0]!.hand
    hub.receive(a, { t: 'act', action: { type: 'design', slots: mine.slice(0, 3) } })
    expect(a.room.view!.players[0]!.pending).toEqual(mine.slice(0, 3))
    expect(b.room.view!.players[0]!.pending).toEqual([-1, -1, -1])
    expect(a.room.log.at(-1)!.text).toMatch(/가람 설계 완료/)
    hub.receive(a, { t: 'act', action: { type: 'design', slots: mine.slice(0, 3) } })
    expect(a.error?.message).toMatch(/차례/)
    hub.receive(b, { t: 'act', action: { type: 'design', slots: b.room.view!.players[1]!.hand.slice(0, 3) } })
    // 봇 설계자가 남았으면 봇이 놓을 때까지
    let guard = 0
    while (a.room.view!.phase === 'design' && guard++ < 10) t.flush(1)
    expect(a.room.view!.phase).toBe('exec')
    expect(a.room.view!.players.every((p) => p.brain.every((x) => x !== null))).toBe(true)

    hub.disconnect(b)
    // 가람은 계속 두고, 나래 차례는 봇이 대신 둔다
    for (let k = 0; k < 60 && !a.room.log.some((l) => l.text.endsWith('(대리)')); k++) {
      const r = a.room
      if (r.actors.includes(0)) {
        const v = r.view!
        const action = v.phase === 'design' ? { type: 'design', slots: v.players[0]!.hand.slice(0, 3) } : { type: 'intervene', iv: { k: 'none' } }
        hub.receive(a, { t: 'act', action })
      } else t.flush(1)
    }
    expect(a.room.log.some((l) => l.text.endsWith('(대리)'))).toBe(true)
  })
})
