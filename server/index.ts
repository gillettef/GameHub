// Neoterra 서버: 정적 dist + /ws(온라인 대전) + /health. 포트 8094
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { onConnection, roomCount, sweep } from './hub';

const PORT = Number(process.env.PORT ?? 8094);
const DIST = resolve(process.cwd(), 'dist');
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
    const ext = extname(file);
    res.writeHead(200, {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'cache-control': file.includes(`${join('dist', 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('빌드된 화면이 없습니다. npm run build 를 먼저 실행하세요.');
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const alive = new WeakMap<WebSocket, boolean>();
wss.on('connection', (ws) => {
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));
  onConnection(ws);
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
setInterval(() => sweep(), 15_000).unref();
process.on('uncaughtException', (e) => console.error('처리되지 않은 예외', e));
process.on('unhandledRejection', (e) => console.error('처리되지 않은 거부', e));

server.listen(PORT, () => {
  console.log(`Neoterra 서버 http://localhost:${PORT} (ws /ws, /health)`);
});
