// 온라인 멀티: WebSocket(/ws) 과 /health. 단독 서버(index.ts)와 GameHub 허브(hub-entry → server-dist/app.cjs)가 함께 쓴다.
// 자체 http 서버를 띄우지 않는다. 정적 파일(dist)은 부르는 쪽이 서빙한다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { Hub, type Conn } from './hub';

export function createApp() {
  const hub = new Hub();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const alive = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (ws) => {
    alive.set(ws, true);
    const conn: Conn = { send: (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg)) };
    // 소켓당 속도 제한: 버스트 30, 초당 10
    let tokens = 30;
    let last = Date.now();
    ws.on('pong', () => alive.set(ws, true));
    ws.on('message', (data) => {
      const now = Date.now();
      tokens = Math.min(30, tokens + ((now - last) / 1000) * 10);
      last = now;
      if (tokens < 1) return conn.send({ t: 'error', msg: '요청이 너무 많습니다. 잠시 뒤 다시 시도하세요.' });
      tokens--;
      let msg: unknown;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return conn.send({ t: 'error', msg: '잘못된 요청입니다.' });
      }
      hub.handle(conn, msg);
    });
    ws.on('close', () => hub.disconnect(conn));
  });

  // 30초 하트비트: pong 이 없으면 끊는다 (모바일에서 앱 전환 시 죽은 연결 정리)
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

  /** /health 를 맡으면 true */
  function handle(req: IncomingMessage, res: ServerResponse): boolean {
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/health') return false;
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, rooms: hub.roomCount }));
    return true;
  }

  /** /ws 업그레이드를 맡으면 true */
  function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws') return false;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    return true;
  }

  function close(): void {
    clearInterval(beat);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  }

  return { hub, handle, upgrade, close };
}
