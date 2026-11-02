// 유세 대작전 서버: 정적 dist + /api/room/:code(온라인 대결 WebSocket) + /health.
// 운영 포트 8096(systemd 가 PORT 지정), 로컬 개발 38637(Vite 가 /api 를 프록시)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_MESSAGE_BYTES, isRoomCode } from '../src/net/protocol';
import { connect, roomCount, sweep } from './hub';

const PORT = Number(process.env.PORT ?? (process.env.NODE_ENV === 'production' ? 8096 : 38637));
const DIST = resolve(process.cwd(), 'dist');
const ROOM_RE = /^\/api\/room\/([^/]+)$/;
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  let path: string;
  try {
    path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (path === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: roomCount() }));
    return;
  }
  if (path.startsWith('/api/')) {
    res.writeHead(ROOM_RE.test(path) ? 426 : 404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('WebSocket 연결만 받습니다');
    return;
  }
  // 경로 이탈 방지: dist 안의 파일만
  let file = normalize(join(DIST, path));
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const st = await stat(file).catch(() => null);
    if (!st || st.isDirectory()) file = join(DIST, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      // 해시가 붙은 assets/ 만 오래 캐시. sw.js·index.html 등은 매번 확인
      'cache-control': file.startsWith(join(DIST, 'assets') + sep) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('빌드된 화면이 없습니다. npm run build 를 먼저 실행하세요.');
  }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
const alive = new WeakMap<WebSocket, boolean>();

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const m = ROOM_RE.exec(url.pathname);
  if (!m || !isRoomCode(m[1])) {
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
    return;
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
});

// 죽은 연결 감지: 30초마다 ping, 응답이 없으면 끊는다(모바일 망 전환 대비)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
}, 30_000).unref();
setInterval(() => sweep(), 10 * 60_000).unref();
process.on('uncaughtException', (e) => console.error('처리되지 않은 예외', e));
process.on('unhandledRejection', (e) => console.error('처리되지 않은 거부', e));

server.listen(PORT, () => {
  console.log(`유세 대작전 서버 http://localhost:${PORT} (ws /api/room/:code, /health)`);
});
