// 빌드 결과(dist)를 서빙하는 의존성 없는 서버. EC2 에서 systemd 로 실행한다.
// dist/server/rooms.mjs 가 있으면 /api/* (방·대전, SSE) 를 그 모듈에 넘긴다. 게임 상태는 메모리에만 있어 재시작하면 진행 중인 방은 사라진다.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../dist', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8103);
let handleApi = null;
try {
  ({ handleApi } = await import(new URL('../../dist/server/rooms.mjs', import.meta.url)));
} catch (e) {
  console.warn('API 모듈 없음 — 정적 파일만 서빙합니다:', e.message);
}
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

async function resolveFile(urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^[/\\]+/, '');
  if (/^(server|engine)([/\\]|$)/.test(rel)) return null; // 서버 코드는 서빙하지 않는다
  const full = join(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null; // dist 밖(예: dist2) 접근 차단
  try {
    if ((await stat(full)).isFile()) return full;
  } catch { /* 없으면 index.html 로 */ }
  return extname(rel) ? null : join(ROOT, 'index.html');
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (handleApi && await handleApi(req, res, url)) return;
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
}).listen(PORT, () => console.log(`Hearsay server on :${PORT}`));
