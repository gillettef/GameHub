// 단독 게임 서버(로컬 개발·예전 systemd): 빌드된 프론트(dist)와 온라인 멀티(app.ts)를 한 포트로 서빙한다.
// 운영은 GameHub 허브 안에서 실행된다(scripts/aws/hub-entry.mjs → server-dist/app.cjs).
//   개발: npm run server (8091) + npm run dev (Vite 가 /ws 를 8091 로 프록시)
//   배포: npm run build 가 server-dist/server.cjs 로 묶고, EC2 systemd 가 scripts/aws/serve.mjs 로 실행한다.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { createApp } from './app';

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

const app = createApp();

const server = createServer(async (req, res) => {
  try {
    if (app.handle(req, res)) return;
    const path = new URL(req.url ?? '/', 'http://x').pathname;
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

server.on('upgrade', (req, socket, head) => {
  if (!app.upgrade(req, socket, head)) socket.destroy();
});

server.listen(PORT, () => console.log(`DoubleAgent server on :${PORT} (static ${ROOT}, ws /ws)`));
