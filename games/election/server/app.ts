// 온라인 대결(WebSocket /api/room/:code)과 /health. 단독 서버(index.ts)와 GameHub 허브(scripts/aws/hub-entry.mjs → server-dist/app.cjs)가 함께 쓴다.
// 자체 http 서버를 띄우지 않고 process 처리기도 걸지 않는다. 정적 파일(dist)은 부르는 쪽이 서빙한다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_MESSAGE_BYTES, isRoomCode } from '../src/net/protocol';
import { connect, roomCount, sweep } from './hub';

const ROOM_RE = /^\/api\/room\/([^/]+)$/;

export function createApp() {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const alive = new WeakMap<WebSocket, boolean>();

  /** /health 와 /api/* 를 맡으면 true (/api/room/:code 는 WebSocket 만 받는다) */
  function handle(req: IncomingMessage, res: ServerResponse): boolean {
    const path = (req.url ?? '/').split('?')[0];
    if (path === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: roomCount() }));
      return true;
    }
    if (path.startsWith('/api/')) {
      let decoded = path;
      try { decoded = decodeURIComponent(path); } catch { /* 그대로 */ }
      res.writeHead(ROOM_RE.test(decoded) ? 426 : 404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('WebSocket 연결만 받습니다');
      return true;
    }
    return false;
  }

  /** /api/room/:code 업그레이드를 맡으면 true (코드가 틀리면 404 로 닫고 true) */
  function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const m = ROOM_RE.exec(url.pathname);
    if (!m) return false;
    if (!isRoomCode(m[1])) {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return true;
    }
    const code = m[1];
    wss.handleUpgrade(req, socket, head, (ws) => {
      alive.set(ws, true);
      ws.on('pong', () => alive.set(ws, true));
      // 방장 자리(🔵 선공 / 🔴 후공)는 무작위
      const hostSeat = Math.random() < 0.5 ? 0 : 1;
      const ev = connect(code, ws, url.searchParams.get('id') ?? '', url.searchParams.get('create') === '1', hostSeat);
      if (!ev) return;
      ws.on('message', (data, isBinary) => {
        if (!isBinary) ev.onMessage(data.toString());
      });
      ws.on('close', () => ev.onClose());
      ws.on('error', () => ev.onClose());
    });
    return true;
  }

  // 죽은 연결 감지: 30초마다 ping, 응답이 없으면 끊는다(모바일 망 전환 대비)
  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, 30_000);
  beat.unref();
  const sweeper = setInterval(() => sweep(), 10 * 60_000);
  sweeper.unref();

  function close(): void {
    clearInterval(beat);
    clearInterval(sweeper);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  }

  return { handle, upgrade, close };
}
