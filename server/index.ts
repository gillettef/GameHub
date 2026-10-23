/**
 * 온라인 대전 서버 (로드맵 8단계).
 *
 * HTTP + WebSocket(/ws) 한 포트. 방마다 행동 기록의 원본을 메모리에 두고,
 * 들어온 행동을 엔진으로 검증해 방 안의 모두에게 보낸다. 봇은 서버가 둔다.
 * `dist/`가 있으면 빌드된 클라이언트도 함께 내보낸다 (배포용).
 *
 * 실행: PORT=8787 npm run dev:server
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { randomBytes, randomInt } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ClientMessage, ServerMessage } from '../src/app/protocol'
import { createRoom, joinRoom, RoomError, seatsOf, snapshot, submitAction, claimed, type Room } from './room'

const PORT = Number(process.env.PORT ?? 8787)
const DIST = resolve(import.meta.dirname, '..', 'dist')
/** 마지막 활동 뒤 이 시간이 지나면 방을 지운다 */
const ROOM_TTL_MS = 6 * 60 * 60 * 1000

interface Live {
  room: Room
  sockets: Set<WebSocket>
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
  for (const ws of live.sockets) send(ws, msg)
}

function enter(ws: WebSocket, live: Live, token: string): void {
  live.sockets.add(ws)
  live.touchedAt = Date.now()
  send(ws, { t: 'joined', room: live.room.code, snapshot: snapshot(live.room), you: seatsOf(live.room, token) })
  broadcast(live, { t: 'seats', room: live.room.code, seats: live.room.seats, claimed: claimed(live.room) })
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
      const live: Live = { room, sockets: new Set(), touchedAt: Date.now() }
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

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }))
    return
  }
  if (!existsSync(DIST)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('테서랙트 서버입니다. 클라이언트는 npm run dev(5173)로 여세요.')
    return
  }
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)))
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 })

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
    for (const live of rooms.values()) live.sockets.delete(ws)
  })
})

setInterval(() => {
  const now = Date.now()
  for (const [code, live] of rooms) if (live.sockets.size === 0 && now - live.touchedAt > ROOM_TTL_MS) rooms.delete(code)
}, 60_000).unref()

server.listen(PORT, () => {
  console.log(`테서랙트 서버: http://localhost:${PORT} (WebSocket /ws)`)
})
