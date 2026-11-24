// 온라인 대전(WebSocket /ws)과 /health. 단독 서버(index.ts)와 GameHub 허브(scripts/aws/hub-entry.mjs → server-dist/app.cjs)가 함께 쓴다.
// 자체 http 서버를 띄우지 않고 process 처리기도 걸지 않는다. 정적 파일(dist)은 부르는 쪽이 서빙한다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { onConnection, roomCount, sweep } from './hub';

export function createApp() {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const alive = new WeakMap<WebSocket, boolean>();
  wss.on('connection', (ws) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    onConnection(ws);
  });

  /** /health 를 맡으면 true */
  function handle(req: IncomingMessage, res: ServerResponse): boolean {
    if ((req.url ?? '/').split('?')[0] !== '/health') return false;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: roomCount() }));
    return true;
  }

  /** /ws 업그레이드를 맡으면 true */
  function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/ws') return false;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
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
  const sweeper = setInterval(() => sweep(), 15_000);
  sweeper.unref();

  function close(): void {
    clearInterval(beat);
    clearInterval(sweeper);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  }

  return { handle, upgrade, close };
}
