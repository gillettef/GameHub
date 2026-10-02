// 빌드 결과(dist)를 서빙하는 의존성 없는 정적 서버. EC2 에서 systemd 로 실행한다.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../dist', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8090);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

async function resolveFile(urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^[/\\]+/, '');
  const full = join(ROOT, rel);
  if (!full.startsWith(ROOT)) return null;
  try {
    if ((await stat(full)).isFile()) return full;
  } catch { /* 없으면 index.html 로 */ }
  return extname(rel) ? null : join(ROOT, 'index.html');
}

createServer(async (req, res) => {
  try {
    const file = await resolveFile(new URL(req.url, 'http://x').pathname);
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
}).listen(PORT, () => console.log(`SmilePark static server on :${PORT}`));
