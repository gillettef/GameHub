/**
 * 게임 서버: WebSocket `/ws` 와 `/health`. GameHub 허브의 inproc 계약(handle·upgrade·close)에 맞춘다.
 * 자체 http 서버를 띄우지 않고, 정적 파일은 부르는 쪽(허브·Vite)이 서빙한다.
 */
import { randomBytes, randomInt } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import type { GameDef } from '../core/game'
import type { ServerMessage } from '../core/protocol'
import { RoomHub, type Conn, type HubDeps } from './hub'

export interface RoomAppOptions extends Partial<HubDeps> {
  /** 연결 하나가 10초에 보낼 수 있는 메시지 수 */
  messageLimit?: number
  /** 같은 주소가 1분에 만들 수 있는 방 수 */
  createLimit?: number
}

export interface RoomApp {
  handle(req: IncomingMessage, res: ServerResponse): boolean
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean
  close(): void
}

const HEARTBEAT_MS = 30_000
const SWEEP_MS = 10 * 60 * 1000

/** 일정 시간 창 안의 횟수 제한 */
function limiter(max: number, windowMs: number) {
  const hits = new Map<string, { since: number; n: number }>()
  return (key: string): boolean => {
    const now = Date.now()
    let h = hits.get(key)
    if (!h || now - h.since > windowMs) {
      if (hits.size > 5000) hits.clear()
      h = { since: now, n: 0 }
      hits.set(key, h)
    }
    return ++h.n <= max
  }
}

export function createRoomApp<S, A, V, O>(def: GameDef<S, A, V, O>, options: RoomAppOptions = {}): RoomApp {
  const hub = new RoomHub(def, {
    randomInt: (max) => randomInt(max),
    token: () => randomBytes(18).toString('base64url'),
    now: () => Date.now(),
    ...options,
  })
  const allowCreate = limiter(options.createLimit ?? 20, 60_000)
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 })
  const alive = new WeakSet<WebSocket>()

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const ip = req.socket.remoteAddress ?? '?'
    const allowMessage = limiter(options.messageLimit ?? 60, 10_000)
    const conn: Conn = {
      send(msg: ServerMessage) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
      },
    }
    alive.add(ws)
    ws.on('pong', () => alive.add(ws))
    ws.on('error', () => ws.terminate())
    ws.on('close', () => hub.disconnect(conn))
    ws.on('message', (data) => {
      if (!allowMessage('')) return conn.send({ t: 'error', reason: 'busy', message: '요청이 너무 잦습니다.' })
      let msg: unknown
      try {
        msg = JSON.parse(String(data))
      } catch {
        return conn.send({ t: 'error', reason: 'bad-request', message: '잘못된 메시지입니다.' })
      }
      if ((msg as { t?: unknown } | null)?.t === 'create' && !allowCreate(ip)) {
        return conn.send({ t: 'error', reason: 'busy', message: '방을 너무 자주 만들었습니다. 잠시 뒤 다시 해 주세요.' })
      }
      hub.receive(conn, msg)
    })
  })

  // 모바일은 연결이 소리 없이 끊긴다. 답 없는 연결은 정리해 접속 표시와 대리 진행이 맞게 한다
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate()
        continue
      }
      alive.delete(ws)
      ws.ping()
    }
  }, HEARTBEAT_MS)
  heartbeat.unref()
  const sweep = setInterval(() => hub.sweep(), SWEEP_MS)
  sweep.unref()

  const pathOf = (req: IncomingMessage) => new URL(req.url ?? '/', 'http://localhost').pathname

  return {
    handle(req, res) {
      if (pathOf(req) !== '/health') return false
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ ok: true, rooms: hub.size }))
      return true
    },
    upgrade(req, socket, head) {
      if (pathOf(req) !== '/ws') return false
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
      return true
    },
    close() {
      clearInterval(heartbeat)
      clearInterval(sweep)
      hub.close()
      for (const ws of wss.clients) ws.terminate()
      wss.close()
    },
  }
}
