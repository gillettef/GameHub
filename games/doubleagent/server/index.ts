// 게임 서버: 빌드된 프론트(dist)와 온라인 멀티 WebSocket(/ws)을 한 포트로 서빙한다.
//   개발: npm run server (8091) + npm run dev (Vite 가 /ws 를 8091 로 프록시)
//   배포: npm run build 가 server-dist/server.cjs 로 묶고, EC2 systemd 가 scripts/aws/serve.mjs 로 실행한다.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { Hub, type Conn } from './hub';

const PORT = Number(process.env.PORT ?? 8091);
const ROOT = resolve(process.env.DIST_DIR ?? join(process.cwd(), 'dist'));
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

async function resolveFile(urlPath: string): Promise<string | null> {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^[/\\]+/, '');
  const full = join(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null; // dist 밖(예: dist2) 접근 차단
  try {
    if ((await stat(full)).isFile()) return full;
  } catch {
    /* 없으면 index.html 로 */
  }
  return extname(rel) ? null : join(ROOT, 'index.html');
}

const hub = new Hub();

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, rooms: hub.roomCount }));
      return;
    }
    const file = await resolveFile(path);
    if (!file) return void res.writeHead(404).end('Not found');
    const body = await readFile(file);
    const hashed = /[/\\]assets[/\\]/.test(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    }).end(body);
  } catch {
    res.writeHead(500).end('Server error');
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
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
wss.on('close', () => clearInterval(beat));

server.listen(PORT, () => console.log(`DoubleAgent server on :${PORT} (static ${ROOT}, ws /ws)`));
