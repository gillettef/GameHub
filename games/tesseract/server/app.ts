/**
 * 온라인 대전 (WebSocket /ws, /health). 단독 서버(index.ts)와 GameHub 허브(scripts/aws/hub-entry.mjs → server-dist/app.cjs)가 함께 쓴다.
 * 방마다 행동 기록의 원본을 메모리에 두고, 들어온 행동을 엔진으로 검증해 방 안의 모두에게 보낸다. 봇은 서버가 둔다.
 * 자체 http 서버를 띄우지 않는다. 정적 파일(dist)은 부르는 쪽이 서빙한다.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { randomBytes, randomInt } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ClientMessage, ServerMessage } from '../src/app/protocol'
import { createRoom, joinRoom, onlineSeats, RoomError, seatsOf, snapshot, submitAction, claimed, type Room } from './room'

export function createApp() {
  /** 마지막 활동 뒤 이 시간이 지나면 방을 지운다 */
  const ROOM_TTL_MS = 6 * 60 * 60 * 1000

  interface Live {
    room: Room
    /** 연결 → 그 기기의 토큰 */
    sockets: Map<WebSocket, string>
    touchedAt: number
  }

  const rooms = new Map<string, Live>()

  function newCode(): string {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    for (;;) {
      const code = Array.from({ length: 5 }, () => letters[randomInt(letters.length)]).join('')
      if (!rooms.has(code)) return code
    }
  }

  function send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
  }

  function broadcast(live: Live, msg: ServerMessage): void {
    for (const ws of live.sockets.keys()) send(ws, msg)
  }

  const connectedTokens = (live: Live) => new Set(live.sockets.values())

  /** 자리 이름·주인·접속 상태가 바뀌었을 때 모두에게 알린다 */
  function broadcastSeats(live: Live): void {
    const { room } = live
    broadcast(live, { t: 'seats', room: room.code, seats: room.seats, claimed: claimed(room), online: onlineSeats(room, connectedTokens(live)) })
  }

  function enter(ws: WebSocket, live: Live, token: string): void {
    live.sockets.set(ws, token)
    live.touchedAt = Date.now()
    send(ws, { t: 'joined', room: live.room.code, snapshot: snapshot(live.room, connectedTokens(live)), you: seatsOf(live.room, token) })
    broadcastSeats(live)
  }

  function handle(ws: WebSocket, msg: ClientMessage): void {
    switch (msg.t) {
      case 'create': {
        const code = newCode()
        const room = createRoom(
          code,
          randomBytes(6).toString('hex'),
          Date.now(),
          randomInt(0x7fffffff),
          msg.seats,
          msg.law,
          msg.token,
        )
        const live: Live = { room, sockets: new Map(), touchedAt: Date.now() }
        rooms.set(code, live)
        enter(ws, live, msg.token)
        return
      }
      case 'join': {
        const live = rooms.get(msg.room.toUpperCase())
        if (!live) throw new RoomError('없는 방입니다.')
        joinRoom(live.room, msg.token, msg.name)
        enter(ws, live, msg.token)
        return
      }
      case 'action': {
        const live = rooms.get(msg.room)
        if (!live) throw new RoomError('없는 방입니다.')
        const index = live.room.actions.length
        const added = submitAction(live.room, msg.token, msg.index, msg.action)
        live.touchedAt = Date.now()
        broadcast(live, { t: 'actions', room: live.room.code, from: index, actions: added })
        return
      }
    }
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      let msg: ClientMessage
      try {
        msg = JSON.parse(String(data)) as ClientMessage
      } catch {
        send(ws, { t: 'error', message: '잘못된 메시지입니다.' })
        return
      }
      try {
        handle(ws, msg)
      } catch (e) {
        send(ws, { t: 'error', message: e instanceof RoomError ? e.message : '서버 오류가 났습니다.' })
        if (!(e instanceof RoomError)) console.error(e)
      }
    })
    ws.on('close', () => {
      for (const live of rooms.values()) if (live.sockets.delete(ws)) broadcastSeats(live)
    })
  })

  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [code, live] of rooms) if (live.sockets.size === 0 && now - live.touchedAt > ROOM_TTL_MS) rooms.delete(code)
  }, 60_000)
  sweep.unref()

  /** /health 를 맡으면 true */
  function handleHttp(req: IncomingMessage, res: ServerResponse): boolean {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/health') return false
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }))
    return true
  }

  /** /ws 업그레이드를 맡으면 true */
  function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/ws') return false
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    return true
  }

  function close(): void {
    clearInterval(sweep)
    for (const ws of wss.clients) ws.terminate()
    wss.close()
  }

  return { handle: handleHttp, upgrade, close }
}
