// GameDef: 행동·설정 검사, 좌석별로 가린 보기, 거절 시 상태 보존, 시계(제한 시간), 봇끼리 끝까지, 온라인 방 흐름.
// 옛 test/server.test.mjs(봇 대전이 서버 타이머만으로 끝남, 방장만 시작·빈자리는 봇, 행동 본문 처리)를 이 구조로 옮겼다.
import { Match, type RoomSnapshot, type SeatInfo, type ServerMessage, type Timers } from '@gamehub/net'
import { RoomHub, type Conn } from '@gamehub/net/server'
import { describe, expect, it } from 'vitest'
import { BOT_FIST_AFTER_MS, def, parseAction, parseOptions, type Action, type Table, type View } from '../src/def'
import { UNKNOWN } from '../src/engine/game'

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
    run(untilMs: number, max = 200_000) {
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
      now = Math.max(now, untilMs)
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
const clockCtx = { log: () => {} }
const seats = (...kinds: ('human' | 'bot')[]): SeatInfo[] => kinds.map((kind, i) => ({ kind, name: kind === 'bot' ? `봇 ${i + 1}` : `사람${i + 1}` }))
const setup = (n = 4, passPlay = false, seed = 7) =>
  def.setup({ seats: seats(...Array.from({ length: n }, (_, i) => (i < 2 ? 'human' : 'bot'))), seed, options: parseOptions({ passPlay }) })

/** 모두 점유해 점유 공개로, 시간을 흘려 다음 단계로 */
function claimAll(t: Table, plots: string[]): Table {
  plots.forEach((plot, i) => {
    t = def.apply(t, i, { type: 'claim', plot } as Action, ctx)
  })
  return t
}
function advanceTo(t: Table, phase: string, step = 1000): Table {
  for (let k = 0; k < 500 && t.g.phase !== phase; k++) t = def.clock!.advance(t, step, clockCtx)
  return t
}

describe('행동·설정 검사', () => {
  it('신뢰할 수 없는 입력은 걸러낸다', () => {
    expect(parseAction({ type: 'claim', plot: 'river', seat: 3 })).toEqual({ type: 'claim', plot: 'river' })
    expect(parseAction({ type: 'claim', plot: 'moon' })).toBeNull()
    expect(parseAction({ type: 'ask', plot: 'river', season: 0 })).toBeNull()
    expect(parseAction({ type: 'ask', plot: 'river', season: 2.5 })).toBeNull()
    expect(parseAction({ type: 'ask', plot: 'river', season: '2' })).toBeNull()
    expect(parseAction({ type: 'ask', plot: 'harbor', season: 7 })).toEqual({ type: 'ask', plot: 'harbor', season: 7 })
    expect(parseAction({ type: 'fist', choice: 'grey', token: 'x' })).toEqual({ type: 'fist', choice: 'grey' })
    expect(parseAction({ type: 'fist', choice: 'pink' })).toBeNull()
    expect(parseAction({ type: 'say', text: '  \u0007강가는 내 땅  ' })).toEqual({ type: 'say', text: '강가는 내 땅', assert: null })
    expect(parseAction({ type: 'say', text: '말'.repeat(300) })).toEqual({ type: 'say', text: '말'.repeat(140), assert: null })
    expect(parseAction({ type: 'say', text: '   ' })).toBeNull()
    expect(parseAction({ type: 'say', text: 5 })).toBeNull()
    expect(parseAction({ type: 'say', text: '파랑', assert: 'empty' })).toBeNull()
    expect(parseAction({ type: 'say', text: '파랑', assert: 'blue' })).toEqual({ type: 'say', text: '파랑', assert: 'blue' })
    expect(parseAction({ type: 'quiet', seat: 0 })).toEqual({ type: 'quiet' })
    expect(parseAction(null)).toBeNull()
    expect(parseAction([{ type: 'quiet' }])).toBeNull()
    expect(parseOptions({ passPlay: 'yes' })).toEqual({ passPlay: false })
    expect(parseOptions({ passPlay: true })).toEqual({ passPlay: true })
    expect(parseOptions(undefined)).toEqual({ passPlay: false })
  })

  it('규칙 위반은 상태를 건드리지 않고 거절한다', () => {
    let t = setup()
    t = def.apply(t, 0, { type: 'claim', plot: 'river' }, ctx)
    const copy = structuredClone(t)
    expect(() => def.apply(t, 0, { type: 'claim', plot: 'harbor' }, ctx)).toThrow('바꿀 수 없습니다')
    expect(() => def.apply(t, 1, { type: 'claim', plot: 'mud' }, ctx)).toThrow('쓰지 않는 구역')
    expect(() => def.apply(t, 1, { type: 'fist', choice: 'grey' }, ctx)).toThrow('증언할 때가 아닙니다')
    expect(() => def.apply(t, 1, { type: 'quiet' }, ctx)).toThrow('속삭임')
    expect(t).toEqual(copy)
  })

  it('봇 이름·성격은 시드로 정하고, 사람 이름은 그대로 둔다', () => {
    const a = setup(6, false, 3)
    const b = setup(6, false, 3)
    expect(a.g.players).toEqual(b.g.players)
    expect(a.g.players.slice(0, 2).map((p) => [p.name, p.isBot, p.persona])).toEqual([
      ['사람1', false, null],
      ['사람2', false, null],
    ])
    expect(a.g.players.slice(2).every((p) => p.isBot && p.persona && !p.name.startsWith('봇 '))).toBe(true)
    expect(new Set(a.g.players.map((p) => p.name)).size).toBe(6)
  })
})

describe('좌석별로 가린 보기', () => {
  it('남이 고른 구역 카드, 쥔 증언 토큰, 난수·봇의 기억은 보이지 않는다', () => {
    let t = setup()
    t = def.apply(t, 0, { type: 'claim', plot: 'river' }, ctx)
    t = def.apply(t, 2, { type: 'claim', plot: 'salt' }, ctx)
    const v1 = def.view(t, 1)
    const spect = def.view(t, null)
    expect(def.view(t, 0).me!.claim).toBe('river')
    expect(v1.me!.claim).toBeNull()
    expect(v1.players.map((p) => p.ready)).toEqual([true, false, true, false])
    expect(spect.me).toBeNull()
    for (const v of [v1, spect]) {
      const s = JSON.stringify(v)
      expect(s).not.toMatch(/"claim":"(river|salt)"/)
      expect(s).not.toMatch(/rng|memory|recall|brains|seed/)
    }
  })

  it('망각된 열은 보기에도 상태에도 없다. 봇의 기억은 상태에만 있고 보기에는 없다', () => {
    let t = setup()
    t = claimAll(t, ['river', 'harbor', 'salt', 'hill'])
    t = advanceTo(t, 'claim')
    t = claimAll(t, ['harbor', 'river', 'hill', 'salt'])
    t = advanceTo(t, 'choose')
    expect(t.g.forgotten).toBe(1)
    expect(t.g.truth.every((row) => row[1] === UNKNOWN)).toBe(true)
    expect(Object.keys(t.brains[2]!.memory).length + Object.keys(t.brains[3]!.memory).length).toBeGreaterThan(0)
    for (const seat of [0, 1, 2, 3, null]) {
      const v = def.view(t, seat)
      expect(v.board.every((b) => b.cells[0]!.tile === null && b.cells[0]!.forgotten)).toBe(true)
      expect(JSON.stringify(v)).not.toMatch(/memory|conf/)
    }
  })

  it('속삭임 중에는 내 주먹만 보이고, 공개 뒤에는 모두의 증언이 보인다', () => {
    let t = setup()
    t = claimAll(t, ['river', 'harbor', 'salt', 'hill'])
    t = advanceTo(t, 'claim')
    t = claimAll(t, ['harbor', 'river', 'hill', 'salt'])
    t = advanceTo(t, 'choose')
    const q = t.g.questioner
    const d = def.view(t, q).drawn!.find((x) => x.askable.length)!
    t = def.apply(t, q, { type: 'ask', plot: d.id, season: d.askable[0]! }, ctx)
    const other = (q + 1) % 4
    const token = def.view(t, other).me!.tokens[0]!
    t = def.apply(t, other, { type: 'fist', choice: token }, ctx)
    expect(def.view(t, other).me!.fist).toBe(token)
    for (const seat of [0, 1, 2, 3, null].filter((s) => s !== other)) {
      const v = def.view(t, seat)
      expect(v.me?.fist ?? null).toBeNull()
      expect(v.result).toBeNull()
      expect(v.players[other]!.ready).toBe(true)
    }
    t = advanceTo(t, 'result')
    expect(def.view(t, null).result!.fists[other]).toBe(token)
  })
})

describe('차례(actors)와 시계', () => {
  it('온라인: 사람은 말할 수 있는 단계 내내 들어 있고, 할 일이 남은 좌석이 앞에 온다', () => {
    let t = setup()
    expect(def.actors(t)).toEqual([0, 1, 2, 3])
    t = def.apply(t, 0, { type: 'claim', plot: 'river' }, ctx)
    expect(def.actors(t)).toEqual([1, 2, 3, 0])
    t = def.apply(t, 1, { type: 'claim', plot: 'harbor' }, ctx)
    t = def.apply(t, 2, { type: 'claim', plot: 'salt' }, ctx)
    t = def.apply(t, 3, { type: 'claim', plot: 'hill' }, ctx)
    expect(t.g.phase).toBe('claimResult')
    expect(def.actors(t)).toEqual([0, 1])
  })

  it('돌려 하기: 할 일을 마친 좌석은 빠진다', () => {
    let t = setup(4, true)
    t = def.apply(t, 0, { type: 'claim', plot: 'river' }, ctx)
    expect(def.actors(t)).toEqual([1, 2, 3])
    t = claimAll(setup(4, true), ['river', 'harbor', 'salt', 'hill'])
    expect(def.actors(t)).toEqual([])
  })

  it('속삭임: 봇은 말을 마치고 9초가 지나야 증언 차례에 들어온다', () => {
    let t = setup()
    t = claimAll(t, ['river', 'harbor', 'salt', 'hill'])
    t = advanceTo(t, 'claim')
    t = claimAll(t, ['harbor', 'river', 'hill', 'salt'])
    t = advanceTo(t, 'choose')
    const q = t.g.questioner
    const d = def.view(t, q).drawn!.find((x) => x.askable.length)!
    t = def.apply(t, q, { type: 'ask', plot: d.id, season: d.askable[0]! }, ctx)
    expect(def.actors(t)).toEqual([0, 1, 2, 3])
    t = def.apply(t, 2, def.bot!.next(t, 2, {})!, ctx)
    expect(def.actors(t)).toEqual([0, 1, 3])
    expect(def.bot!.next(t, 2, {})!.type).toBe('fist')
    t = def.clock!.advance(t, BOT_FIST_AFTER_MS, clockCtx)
    expect(def.actors(t)).toEqual([0, 1, 3, 2])
  })

  it('시계: 제한 시간 전에는 시계만 옮기고, 끝나면 같은 상태를 돌려준다', () => {
    const t = setup()
    const later = def.clock!.advance(t, 5000, clockCtx)
    expect(later).not.toBe(t)
    expect(later.g).toBe(t.g)
    expect(def.view(later, 0).deadlineIn).toBe(85_000)
    // 90초가 지나면 고르지 않은 사람의 구역 카드가 무작위로 놓인다(옛 서버의 시간 초과)
    const timedOut = def.clock!.advance(later, 85_000, clockCtx)
    expect(timedOut.g.phase).toBe('claimResult')
    expect(t.g.phase).toBe('claim')
    const ended = { ...t, g: { ...t.g, phase: 'ended' as const, deadline: null } }
    expect(def.clock!.advance(ended, 5000, clockCtx)).toBe(ended)
  })

  it('말은 20초 뒤 보기에서 흩어진다', () => {
    let t = setup()
    t = def.apply(t, 0, { type: 'say', text: '강가 간다', assert: null }, ctx)
    expect(def.view(t, 1).chat.map((m) => m.text)).toEqual(['강가 간다'])
    t = def.clock!.advance(t, 20_000, clockCtx)
    expect(def.view(t, 1).chat).toEqual([])
  })
})

describe('진행', () => {
  for (const n of [4, 5, 6]) {
    it(`${n}인 봇끼리 가상 시간으로 한 판을 끝까지 둔다(기록은 남기지 않는다)`, () => {
      const time = simTime()
      const match = new Match(def, {
        seats: seats(...Array.from({ length: n }, () => 'bot' as const)),
        seed: n * 11,
        options: parseOptions(undefined),
        timers: time.timers,
        now: time.now,
        autoDelay: () => def.bot!.delayMs,
        onChange: () => {},
      })
      match.schedule()
      time.run(60 * 60_000)
      expect(match.over).toBe(true)
      expect(match.log).toEqual([])
      const v = def.view(match.state, null)
      expect(v.board.some((b) => b.cells.some((c) => c.chron !== null && c.chron !== 'grey'))).toBe(true)
      expect(match.state.g.truth.every((row) => row.every((x) => x === UNKNOWN))).toBe(true)
      // 봇이 실제로 증언했다(시간 초과만으로 끝나지 않았다)
      expect(v.players.reduce((a, p) => a + p.score, 0)).toBeGreaterThan(10)
    })
  }

  it('사람 1 + 봇 3: 사람이 아무것도 하지 않아도 시간 초과로 끝까지 진행된다', () => {
    const time = simTime()
    const match = new Match(def, {
      seats: seats('human', 'bot', 'bot', 'bot'),
      seed: 5,
      options: parseOptions(undefined),
      timers: time.timers,
      now: time.now,
      autoDelay: (i) => (i === 0 ? null : def.bot!.delayMs),
      onChange: () => {},
    })
    match.schedule()
    time.run(3 * 60 * 60_000)
    expect(match.over).toBe(true)
    expect(def.view(match.state, 0).board.every((b) => b.cells.every((c) => c.tile === null))).toBe(true)
  })

  it('온라인: 참가, 방장만 시작, 빈자리는 봇, 행동은 접속한 자리로만, 끊긴 사람은 대리가 둔다', () => {
    const time = simTime()
    let k = 0
    const hub = new RoomHub(def, { randomInt: (m) => ++k % m, token: () => `t${++k}`, now: time.now, timers: time.timers })
    const a = new FakeConn()
    hub.receive(a, { t: 'create', name: '방장', seats: 5 })
    const b = new FakeConn()
    hub.receive(b, { t: 'join', code: a.room.code!, name: '손님' })
    hub.receive(b, { t: 'start' })
    expect(b.error?.message).toMatch(/방장/)
    hub.receive(a, { t: 'start' })
    expect(a.room.status).toBe('playing')
    expect(a.room.seats.filter((s) => s.kind === 'bot').length).toBe(3)
    const late = new FakeConn()
    hub.receive(late, { t: 'join', code: a.room.code!, name: '늦은 사람' })
    expect(late.error?.message).toMatch(/관전/)
    const vb = b.room.view!
    expect(vb.me!.index).toBe(1)
    expect(vb.me!.tokens).not.toContain(vb.me!.color)
    expect(a.room.log).toEqual([])
    // 손님이 다른 자리를 사칭할 수 없다: 행동의 seat 필드는 무시된다
    hub.receive(b, { t: 'act', action: { type: 'claim', plot: 'river', seat: 0 } })
    expect(a.room.view!.me!.claim).toBeNull()
    expect(b.room.view!.me!.claim).toBe('river')
    // 방장이 끊기면 45초 뒤 대리가 구역 카드를 놓는다
    const joined = a.sent.find((m) => m.t === 'joined')
    const token = joined?.t === 'joined' ? joined.token! : ''
    hub.disconnect(a)
    time.run(time.now() + 30_000)
    expect(b.room.view!.players[0]!.ready).toBe(false)
    time.run(time.now() + 20_000)
    expect(b.room.view!.phase === 'claim' ? b.room.view!.players[0]!.ready : true).toBe(true)
    expect(b.room.view!.phase).not.toBe('claim')
    // 새로고침: 같은 자리로 돌아온다
    const back = new FakeConn()
    hub.receive(back, { t: 'resume', code: b.room.code!, token })
    expect(back.error).toBeNull()
    expect(back.room.you).toBe(0)
  })
})
