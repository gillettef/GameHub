// 빌드 결과(dist)를 서빙하고, 온라인 대전방 API(app.mjs)를 붙이는 의존성 없는 단독 서버(로컬 실행용).
// 운영은 GameHub 허브 안에서 실행된다(hub-entry.mjs).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../dist', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8101);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const app = await createApp({ root: ROOT });

async function resolveFile(urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^[/\\]+/, '');
  const full = join(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null; // dist 밖(예: dist2) 접근 차단
  try {
    if ((await stat(full)).isFile()) return full;
  } catch { /* 없으면 index.html 로 */ }
  return extname(rel) ? null : join(ROOT, 'index.html');
}

createServer(async (req, res) => {
  if (await app.handle(req, res)) return;
  const url = new URL(req.url, 'http://x');
  try {
    const file = await resolveFile(url.pathname);
    if (!file) { res.writeHead(404).end('Not found'); return; }
    const body = await readFile(file);
    const hashed = /[/\\]assets[/\\]/.test(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    }).end(body);
  } catch {
    res.writeHead(500).end('Server error');
  }
}).listen(PORT, () => console.log(`Crease server on :${PORT}`));
