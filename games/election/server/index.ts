// 유세 대작전 단독 서버(로컬 개발·예전 systemd): 정적 dist + 온라인 대결(app.ts: /api/room/:code WebSocket, /health).
// 운영은 GameHub 허브 안에서 실행된다(scripts/aws/hub-entry.mjs).
// 운영 포트 8096(systemd 가 PORT 지정), 로컬 개발 38637(Vite 가 /api 를 프록시)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { createApp } from './app';

const PORT = Number(process.env.PORT ?? (process.env.NODE_ENV === 'production' ? 8096 : 38637));
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

const app = createApp();

const server = createServer(async (req, res) => {
  let path: string;
  try {
    path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (app.handle(req, res)) return;
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

server.on('upgrade', (req, socket, head) => {
  if (!app.upgrade(req, socket, head)) socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
});

process.on('uncaughtException', (e) => console.error('처리되지 않은 예외', e));
process.on('unhandledRejection', (e) => console.error('처리되지 않은 거부', e));

server.listen(PORT, () => {
  console.log(`유세 대작전 서버 http://localhost:${PORT} (ws /api/room/:code, /health)`);
});
