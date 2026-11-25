/**
 * 온라인 방 접속. 끊기면 다시 붙고, 저장해 둔 token 으로 자리를 되찾는다.
 * iOS 는 앱을 벗어나면 소켓을 끊으므로 화면이 다시 보일 때 바로 다시 접속한다.
 */
import type { ClientMessage, RoomSnapshot, ServerMessage } from '../core/protocol'

export type Connection = 'idle' | 'connecting' | 'open' | 'reconnecting'

export interface RoomState<V> {
  connection: Connection
  room: RoomSnapshot<V> | null
  /** 마지막으로 거절된 이유(사용자에게 보여 줄 문장) */
  error: string | null
}

export interface Session {
  code: string
  token: string
}

export type SocketLike = Pick<WebSocket, 'send' | 'close' | 'readyState' | 'onopen' | 'onclose' | 'onmessage'>

export interface RoomClientOptions {
  slug: string
  /** 기본: 현재 페이지 디렉터리의 ws */
  url?: string
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  socket?: (url: string) => SocketLike
}

const OPEN = 1
const RETRY_MS = [500, 1000, 2000, 4000, 5000]

/** 허브의 /<slug>/ 아래에서도 루트에서도 맞는 WebSocket 주소 */
export function socketUrl(pageUrl: string): string {
  const url = new URL('ws', pageUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.href
}

export class RoomClient<V = unknown, A = unknown> {
  private state: RoomState<V> = { connection: 'idle', room: null, error: null }
  private readonly listeners = new Set<() => void>()
  private socket: SocketLike | null = null
  private retry: ReturnType<typeof setTimeout> | null = null
  private attempts = 0
  /** 연결되면 보낼 요청(create·join·watch). 자리를 얻으면 resume 이 대신한다 */
  private entry: ClientMessage | null = null
  private readonly key: string

  constructor(private readonly opts: RoomClientOptions) {
    this.key = `${opts.slug}:session`
  }

  getState = (): RoomState<V> => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<RoomState<V>>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  private get storage() {
    return this.opts.storage ?? localStorage
  }

  savedSession(): Session | null {
    try {
      const s = JSON.parse(this.storage.getItem(this.key) ?? 'null') as Partial<Session> | null
      return s && typeof s.code === 'string' && typeof s.token === 'string' ? { code: s.code, token: s.token } : null
    } catch {
      return null
    }
  }

  forgetSession(): void {
    this.storage.removeItem(this.key)
  }

  create(name: string, seats: number, bots: number[] = [], options?: unknown): void {
    this.begin({ t: 'create', name, seats, bots, options })
  }

  join(code: string, name: string): void {
    this.begin({ t: 'join', code, name })
  }

  watch(code: string): void {
    this.begin({ t: 'watch', code })
  }

  resume(session: Session | null = this.savedSession()): boolean {
    if (!session) return false
    this.begin({ t: 'resume', ...session })
    return true
  }

  private begin(entry: ClientMessage): void {
    this.entry = entry
    this.set({ error: null, room: null })
    if (this.socket?.readyState === OPEN) this.post(entry)
    else this.connect()
  }

  private connect(): void {
    this.drop()
    this.set({ connection: this.attempts > 0 ? 'reconnecting' : 'connecting' })
    const url = this.opts.url ?? socketUrl(location.href)
    const socket = this.opts.socket?.(url) ?? new WebSocket(url)
    this.socket = socket
    socket.onopen = () => {
      this.attempts = 0
      this.set({ connection: 'open' })
      if (this.entry) this.post(this.entry)
    }
    socket.onmessage = (e: MessageEvent) => this.receive(JSON.parse(String(e.data)) as ServerMessage)
    socket.onclose = () => {
      this.socket = null
      if (!this.entry) return this.set({ connection: 'idle' })
      this.set({ connection: 'reconnecting' })
      const wait = RETRY_MS[Math.min(this.attempts++, RETRY_MS.length - 1)]!
      this.retry = setTimeout(() => this.connect(), wait)
    }
  }

  /** 지금 소켓과 예약을 버린다(콜백이 다시 불리지 않게) */
  private drop(): void {
    if (this.retry !== null) clearTimeout(this.retry)
    this.retry = null
    const old = this.socket
    this.socket = null
    if (!old) return
    old.onopen = old.onmessage = old.onclose = null
    old.close()
  }

  /** 화면이 다시 보일 때: 죽었을 수 있는 소켓을 버리고 새로 붙는다 */
  refresh(): void {
    if (!this.entry) return
    this.attempts = 1
    this.connect()
  }

  private receive(msg: ServerMessage): void {
    switch (msg.t) {
      case 'joined':
        if (msg.token) {
          this.storage.setItem(this.key, JSON.stringify({ code: msg.code, token: msg.token }))
          this.entry = { t: 'resume', code: msg.code, token: msg.token }
        } else this.entry = { t: 'watch', code: msg.code }
        return
      case 'room':
        return this.set({ room: msg.room as RoomSnapshot<V>, error: null })
      case 'left':
        this.forgetSession()
        return this.end(null)
      case 'error':
        // 방에 들어가지 못했으면 접속을 끝낸다. 게임 중의 거절은 알리기만 한다
        if (msg.reason === 'no-room' || msg.reason === 'bad-token') {
          if (this.entry?.t === 'resume') this.forgetSession()
          return this.end(msg.message)
        }
        if (!this.state.room) return this.end(msg.message)
        return this.set({ error: msg.message })
    }
  }

  private end(error: string | null): void {
    this.entry = null
    this.attempts = 0
    this.drop()
    this.set({ connection: 'idle', room: null, error })
  }

  private post(msg: ClientMessage): boolean {
    if (this.socket?.readyState !== OPEN) return false
    this.socket.send(JSON.stringify(msg))
    return true
  }

  private command(msg: ClientMessage): void {
    if (!this.post(msg)) this.set({ error: '연결이 끊겼습니다. 다시 접속하는 중입니다.' })
  }

  start(): void {
    this.command({ t: 'start' })
  }

  setSeat(seat: number, kind: 'bot' | 'open'): void {
    this.command({ t: 'seat', seat, kind })
  }

  act(action: A): void {
    this.command({ t: 'act', action, version: this.state.room?.version })
  }

  /** 자리를 버리고 나간다 */
  leave(): void {
    if (this.post({ t: 'leave' })) return
    this.forgetSession()
    this.end(null)
  }

  /** 화면을 닫는다(자리는 남는다) */
  dispose(): void {
    this.end(null)
  }
}
