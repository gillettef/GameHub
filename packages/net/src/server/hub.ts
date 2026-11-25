/**
 * 방 관리(메모리). 통신 수단에 의존하지 않아 테스트할 수 있다. WebSocket 연결은 app.ts.
 * 신원: 서버가 좌석마다 비밀 token 을 발급하고, 다시 접속할 때 그 token 으로 자리를 되찾는다.
 */
import { RuleError, type GameDef } from '../core/game'
import { Match, realTimers, type Timers } from '../core/match'
import { cleanName } from '../core/names'
import type { ClientMessage, ErrorReason, RoomSnapshot, RoomStatus, ServerMessage } from '../core/protocol'

export interface Conn {
  send(msg: ServerMessage): void
}

export interface HubDeps {
  /** 0 이상 max 미만 */
  randomInt(max: number): number
  /** 추측할 수 없는 문자열 */
  token(): string
  now(): number
  timers?: Timers
  maxRooms?: number
  /** 접속자가 없는 방을 지우기까지의 시간 */
  idleMs?: number
  /** 접속이 끊긴 사람의 차례를 봇이 대신하기까지의 시간. null 이면 계속 기다린다 */
  awayMs?: number | null
}

interface Seat {
  kind: 'human' | 'bot' | 'open'
  name: string
  token: string | null
  conns: Set<Conn>
}

interface Room<S, A, V, O> {
  code: string
  seats: Seat[]
  host: number
  options: O
  match: Match<S, A, V, O> | null
  /** 좌석이 있든 없든 이 방을 보고 있는 연결 */
  conns: Set<Conn>
  touchedAt: number
}

export class HubError extends Error {
  constructor(
    readonly reason: ErrorReason,
    message: string,
  ) {
    super(message)
  }
}

/** 헷갈리는 글자(I, O, 0, 1)를 뺀 방 코드 문자 */
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 4
const LOG_SENT = 40

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export class RoomHub<S, A, V, O> {
  private readonly rooms = new Map<string, Room<S, A, V, O>>()
  private readonly where = new Map<Conn, { room: Room<S, A, V, O>; seat: number | null }>()
  private readonly timers: Timers
  private readonly maxRooms: number
  private readonly idleMs: number
  private readonly awayMs: number | null

  constructor(
    private readonly def: GameDef<S, A, V, O>,
    private readonly deps: HubDeps,
  ) {
    this.timers = deps.timers ?? realTimers
    this.maxRooms = deps.maxRooms ?? 300
    this.idleMs = deps.idleMs ?? 3 * 60 * 60 * 1000
    this.awayMs = deps.awayMs === undefined ? 45_000 : deps.awayMs
  }

  get size(): number {
    return this.rooms.size
  }

  /** 신뢰할 수 없는 메시지 하나를 처리한다. 실패는 보낸 연결에만 알린다 */
  receive(conn: Conn, raw: unknown): void {
    try {
      if (!isObject(raw) || typeof raw.t !== 'string') throw new HubError('bad-request', '잘못된 요청입니다.')
      this.dispatch(conn, raw as ClientMessage)
    } catch (e) {
      if (e instanceof HubError) conn.send({ t: 'error', reason: e.reason, message: e.message })
      else if (e instanceof RuleError) conn.send({ t: 'error', reason: 'rejected', message: e.message })
      else {
        console.error(`[${this.def.slug}] 요청 처리 중 오류`, e)
        conn.send({ t: 'error', reason: 'rejected', message: '서버 오류가 났습니다.' })
      }
    }
  }

  private dispatch(conn: Conn, msg: ClientMessage): void {
    switch (msg.t) {
      case 'create':
        return this.create(conn, msg)
      case 'join':
        return this.join(conn, msg)
      case 'resume':
        return this.resume(conn, msg)
      case 'watch':
        return this.enter(conn, this.room(msg.code), null)
      case 'seat':
        return this.setSeat(conn, msg)
      case 'start':
        return this.start(conn)
      case 'act':
        return this.act(conn, msg)
      case 'leave':
        return this.leave(conn)
      default:
        throw new HubError('bad-request', '알 수 없는 요청입니다.')
    }
  }

  private room(code: unknown): Room<S, A, V, O> {
    const room = this.rooms.get(String(code ?? '').trim().toUpperCase())
    if (!room) throw new HubError('no-room', '없는 방입니다.')
    return room
  }

  private newCode(): string {
    for (let tries = 0; tries < 100; tries++) {
      let code = ''
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_CHARS[this.deps.randomInt(CODE_CHARS.length)]
      if (!this.rooms.has(code)) return code
    }
    throw new HubError('busy', '방을 더 만들 수 없습니다.')
  }

  private create(conn: Conn, msg: Extract<ClientMessage, { t: 'create' }>): void {
    this.sweep()
    if (this.rooms.size >= this.maxRooms) throw new HubError('busy', '서버가 붐빕니다. 잠시 뒤 다시 시도해 주세요.')
    const n = msg.seats
    if (!Number.isInteger(n) || n < this.def.minSeats || n > this.def.maxSeats) {
      throw new HubError('bad-request', `인원은 ${this.def.minSeats}~${this.def.maxSeats}명입니다.`)
    }
    const options = this.def.parseOptions?.(msg.options) as O
    const bots = new Set(this.def.bot && Array.isArray(msg.bots) ? msg.bots : [])
    const token = this.deps.token()
    const seats: Seat[] = Array.from({ length: n }, (_, i): Seat => {
      if (i === 0) return { kind: 'human', name: cleanName(msg.name, '방장'), token, conns: new Set() }
      return bots.has(i) ? botSeat(i) : openSeat()
    })
    const room: Room<S, A, V, O> = {
      code: this.newCode(),
      seats,
      host: 0,
      options,
      match: null,
      conns: new Set(),
      touchedAt: this.deps.now(),
    }
    this.rooms.set(room.code, room)
    this.enter(conn, room, 0)
  }

  private join(conn: Conn, msg: Extract<ClientMessage, { t: 'join' }>): void {
    const room = this.room(msg.code)
    // 같은 연결이 다시 참가를 보내면 지금 자리를 그대로 둔다
    const here = this.where.get(conn)
    if (here?.room === room && here.seat !== null) return this.enter(conn, room, here.seat)
    if (room.match) throw new HubError('rejected', '이미 시작한 게임입니다. 관전만 할 수 있습니다.')
    const i = room.seats.findIndex((s) => s.kind === 'open')
    if (i < 0) throw new HubError('full', '빈자리가 없습니다.')
    room.seats[i] = { kind: 'human', name: cleanName(msg.name, `${i + 1}번`), token: this.deps.token(), conns: new Set() }
    this.enter(conn, room, i)
  }

  private resume(conn: Conn, msg: Extract<ClientMessage, { t: 'resume' }>): void {
    const room = this.room(msg.code)
    const i = room.seats.findIndex((s) => s.token !== null && s.token === msg.token)
    if (i < 0) throw new HubError('bad-token', '이 방의 참가자가 아닙니다.')
    this.enter(conn, room, i)
  }

  private enter(conn: Conn, room: Room<S, A, V, O>, seat: number | null): void {
    const here = this.where.get(conn)
    if (here && (here.room !== room || here.seat !== seat)) this.detach(conn)
    const wasEmptyRoom = room.conns.size === 0
    const wasEmptySeat = seat !== null && room.seats[seat]!.conns.size === 0
    this.where.set(conn, { room, seat })
    room.conns.add(conn)
    if (seat !== null) room.seats[seat]!.conns.add(conn)
    room.touchedAt = this.deps.now()
    conn.send({ t: 'joined', code: room.code, seat, token: seat === null ? null : room.seats[seat]!.token })
    this.broadcast(room)
    // 자동 진행은 접속 상태에 달려 있다. 상관없는 연결로 대리 대기 시간이 처음으로 돌아가지 않게 한다
    if (room.match && (wasEmptyRoom || (wasEmptySeat && room.match.actors().includes(seat!)))) room.match.schedule()
  }

  /** 연결을 방에서 뗀다(자리는 그대로) */
  private detach(conn: Conn): void {
    const here = this.where.get(conn)
    if (!here) return
    this.where.delete(conn)
    const { room, seat } = here
    room.conns.delete(conn)
    room.touchedAt = this.deps.now()
    let emptiedSeat = false
    if (seat !== null) {
      const conns = room.seats[seat]!.conns
      conns.delete(conn)
      emptiedSeat = conns.size === 0
    }
    this.broadcast(room)
    if (room.match && (room.conns.size === 0 || (emptiedSeat && room.match.actors().includes(seat!)))) {
      room.match.schedule()
    }
  }

  disconnect(conn: Conn): void {
    this.detach(conn)
  }

  private seated(conn: Conn): { room: Room<S, A, V, O>; seat: number } {
    const here = this.where.get(conn)
    if (!here || here.seat === null) throw new HubError('rejected', '참가한 방이 없습니다.')
    return { room: here.room, seat: here.seat }
  }

  private hostOnly(conn: Conn): Room<S, A, V, O> {
    const { room, seat } = this.seated(conn)
    if (seat !== room.host) throw new HubError('rejected', '방장만 할 수 있습니다.')
    if (room.match) throw new HubError('rejected', '이미 시작한 게임입니다.')
    return room
  }

  private setSeat(conn: Conn, msg: Extract<ClientMessage, { t: 'seat' }>): void {
    const room = this.hostOnly(conn)
    const seat = room.seats[msg.seat]
    if (!seat || msg.seat === room.host) throw new HubError('bad-request', '바꿀 수 없는 자리입니다.')
    if (seat.kind === 'human' && seat.conns.size > 0) throw new HubError('rejected', '사람이 앉은 자리입니다.')
    if (msg.kind === 'bot' && !this.def.bot) throw new HubError('rejected', '봇이 없는 게임입니다.')
    room.seats[msg.seat] = msg.kind === 'bot' ? botSeat(msg.seat) : openSeat()
    room.touchedAt = this.deps.now()
    this.broadcast(room)
  }

  private start(conn: Conn): void {
    const room = this.hostOnly(conn)
    if (!this.def.bot && room.seats.some((s) => s.kind === 'open')) throw new HubError('rejected', '빈자리가 있습니다.')
    room.seats = room.seats.map((s, i) => (s.kind === 'open' ? botSeat(i) : s))
    room.match = new Match(this.def, {
      seats: room.seats.map((s) => ({ kind: s.kind === 'bot' ? 'bot' : 'human', name: s.name })),
      seed: this.deps.randomInt(2 ** 31 - 1) + 1,
      options: room.options,
      timers: this.timers,
      autoDelay: (i) => this.autoDelay(room, i),
      now: () => this.deps.now(),
      onChange: (by) => {
        // 시계만 흐른 것은 방의 활동이 아니다(아무도 없는 방이 정리되도록)
        if (by !== 'clock') room.touchedAt = this.deps.now()
        this.broadcast(room)
      },
    })
    room.touchedAt = this.deps.now()
    this.broadcast(room)
    room.match.schedule()
  }

  private autoDelay(room: Room<S, A, V, O>, i: number): number | null {
    // 아무도 보고 있지 않으면 멈춘다(휴대폰에서 다른 앱을 잠깐 여는 사이에 봇끼리 끝내지 않는다)
    if (room.conns.size === 0) return null
    const seat = room.seats[i]
    if (!seat) return null
    if (seat.kind === 'bot') return this.def.bot?.delayMs ?? null
    return seat.conns.size === 0 ? this.awayMs : null
  }

  private act(conn: Conn, msg: Extract<ClientMessage, { t: 'act' }>): void {
    const { room, seat } = this.seated(conn)
    const match = room.match
    if (!match || match.over) throw new HubError('rejected', '진행 중인 게임이 아닙니다.')
    if (msg.version !== undefined && msg.version !== match.version && match.actors().length === 1) {
      this.send(conn, room, seat)
      throw new HubError('rejected', '상태가 바뀌었습니다. 다시 골라 주세요.')
    }
    const action = this.def.parseAction(msg.action)
    if (action === null) throw new HubError('bad-request', '알 수 없는 행동입니다.')
    match.act(seat, action)
  }

  private leave(conn: Conn): void {
    const here = this.where.get(conn)
    if (!here) return void conn.send({ t: 'left' })
    const { room, seat } = here
    if (seat === null) {
      this.where.delete(conn)
      room.conns.delete(conn)
      conn.send({ t: 'left' })
    } else {
      const old = room.seats[seat]!
      // 같은 자리를 연 다른 창도 함께 내보낸다
      for (const other of old.conns) {
        this.where.delete(other)
        room.conns.delete(other)
        other.send({ t: 'left' })
      }
      if (!room.match) room.seats[seat] = openSeat()
      else if (this.def.bot) room.seats[seat] = { ...botSeat(seat), name: old.name }
      else room.seats[seat] = { ...old, token: null, conns: new Set() }
      const humans = room.seats.flatMap((s, i) => (s.kind === 'human' && s.token !== null ? [{ s, i }] : []))
      if (humans.length === 0) return this.remove(room)
      if (seat === room.host) room.host = (humans.find(({ s }) => s.conns.size > 0) ?? humans[0]!).i
    }
    room.touchedAt = this.deps.now()
    this.broadcast(room)
    room.match?.schedule()
  }

  private snapshot(room: Room<S, A, V, O>, you: number | null): RoomSnapshot<V> {
    const match = room.match
    const status: RoomStatus = !match ? 'lobby' : match.over ? 'over' : 'playing'
    return {
      code: room.code,
      status,
      seats: room.seats.map((s) => ({ kind: s.kind, name: s.name, online: s.kind === 'bot' || s.conns.size > 0 })),
      you,
      host: room.host,
      version: match?.version ?? 0,
      actors: match?.actors() ?? [],
      view: match ? this.def.view(match.state, you) : null,
      log: match?.log.slice(-LOG_SENT) ?? [],
      options: room.options ?? null,
    }
  }

  private send(conn: Conn, room: Room<S, A, V, O>, seat: number | null): void {
    room.match?.refresh()
    conn.send({ t: 'room', room: this.snapshot(room, seat) })
  }

  private broadcast(room: Room<S, A, V, O>): void {
    room.match?.refresh()
    for (const conn of room.conns) this.send(conn, room, this.where.get(conn)?.seat ?? null)
  }

  private remove(room: Room<S, A, V, O>): void {
    room.match?.stop()
    for (const conn of room.conns) {
      this.where.delete(conn)
      conn.send({ t: 'left' })
    }
    this.rooms.delete(room.code)
  }

  /** 접속자가 없이 오래된 방을 지운다 */
  sweep(): void {
    const now = this.deps.now()
    for (const room of this.rooms.values()) {
      if (room.conns.size === 0 && now - room.touchedAt > this.idleMs) this.remove(room)
    }
  }

  close(): void {
    for (const room of this.rooms.values()) room.match?.stop()
    this.rooms.clear()
    this.where.clear()
  }
}

function botSeat(i: number): Seat {
  return { kind: 'bot', name: `봇 ${i + 1}`, token: null, conns: new Set() }
}

function openSeat(): Seat {
  return { kind: 'open', name: '', token: null, conns: new Set() }
}
