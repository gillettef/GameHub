import { RuleError, type GameDef } from '../src/core/game'
import type { Timers } from '../src/core/match'
import type { RoomSnapshot, ServerMessage } from '../src/core/protocol'
import { RoomHub, type Conn, type HubDeps } from '../src/server/hub'

export interface Count {
  total: number
  turn: number
  seats: number
}

export interface Add {
  n: number
}

/** 돌아가며 1 또는 2 를 더해 먼저 10 을 채우는 시험용 게임. 좌석마다 자기 번호가 view 에 들어간다 */
export const countGame: GameDef<Count, Add, { total: number; turn: number; me: number | null }> = {
  slug: 'count',
  minSeats: 2,
  maxSeats: 4,
  setup: ({ seats }) => ({ total: 0, turn: 0, seats: seats.length }),
  parseAction: (raw) => {
    const n = (raw as { n?: unknown } | null)?.n
    return typeof n === 'number' ? { n } : null
  },
  actors: (s) => (s.total >= 10 ? [] : [s.turn]),
  apply(s, seat, { n }, ctx) {
    if (n !== 1 && n !== 2) throw new RuleError('1 또는 2만 더할 수 있습니다.')
    ctx.log(`${ctx.name(seat)}: +${n}${ctx.byBot ? ' (봇)' : ''}`)
    return { ...s, total: s.total + n, turn: (s.turn + 1) % s.seats }
  },
  view: (s, me) => ({ total: s.total, turn: s.turn, me }),
  isOver: (s) => s.total >= 10,
  bot: { next: () => ({ n: 1 }), delayMs: 500 },
}

/** 예약된 함수를 직접 실행하는 가짜 타이머 */
export function fakeTimers() {
  const queue: { fn: () => void; ms: number }[] = []
  const timers: Timers = {
    set(fn, ms) {
      const h = { fn, ms }
      queue.push(h)
      return h
    },
    clear(handle) {
      const i = queue.indexOf(handle as (typeof queue)[number])
      if (i >= 0) queue.splice(i, 1)
    },
  }
  return {
    queue,
    timers,
    next() {
      const h = queue.shift()
      h?.fn()
      return h?.ms
    },
    flush(max = 200) {
      for (let k = 0; queue.length && k < max; k++) queue.shift()!.fn()
    },
  }
}

export class FakeConn implements Conn {
  readonly sent: ServerMessage[] = []
  send(msg: ServerMessage): void {
    this.sent.push(msg)
  }
  get room(): RoomSnapshot<{ total: number; turn: number; me: number | null }> {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const m = this.sent[i]!
      if (m.t === 'room') return m.room as never
    }
    throw new Error('room 메시지가 없습니다')
  }
  get joined() {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const m = this.sent[i]!
      if (m.t === 'joined') return m
    }
    throw new Error('joined 메시지가 없습니다')
  }
  get error() {
    const m = this.sent.at(-1)
    return m?.t === 'error' ? m : null
  }
}

export function makeHub(extra: Partial<HubDeps> = {}) {
  const t = fakeTimers()
  let clock = 0
  let tokens = 0
  let seed = 0
  const hub = new RoomHub(countGame, {
    randomInt: (max) => ++seed % max,
    token: () => `token-${++tokens}`,
    now: () => clock,
    timers: t.timers,
    ...extra,
  })
  const advance = (ms: number) => (clock += ms)
  /** 방을 만들고 연결을 돌려준다 */
  const host = (seats = 2, bots: number[] = []) => {
    const c = new FakeConn()
    hub.receive(c, { t: 'create', name: '가람', seats, bots })
    return c
  }
  const guest = (code: string, name = '나래') => {
    const c = new FakeConn()
    hub.receive(c, { t: 'join', code, name })
    return c
  }
  return { hub, t, advance, host, guest }
}
