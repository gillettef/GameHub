// 게임 빌드 산출물(dist)을 서빙하는 정적 파일 핸들러. 지금 게임마다 scripts/aws/serve.mjs 에 복사돼 있는 템플릿을 하나로 모은 것.
// - 확장자 없는 경로는 index.html (SPA 폴백), 확장자 있는데 없으면 404
// - /assets/ 아래(빌드 해시가 붙은 파일)는 1년 immutable, 나머지는 no-cache
// - 루트 밖 접근(../, dist2 등)과 deny 로 지정한 최상위 디렉터리(서버 코드 등)는 막는다
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.pdf': 'application/pdf',
};

/** @param {string} root 서빙할 디렉터리 @param {{ deny?: string[] }} [opts] */
export function createStatic(root, { deny = [] } = {}) {
  const ROOT = resolve(root);

  async function resolveFile(urlPath) {
    let decoded;
    try { decoded = decodeURIComponent(urlPath); } catch { return null; }
    const rel = normalize(decoded).replace(/^[/\\]+/, '');
    const top = rel.split(/[/\\]/)[0];
    if (deny.includes(top)) return null;
    const full = join(ROOT, rel);
    if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
    try {
      if ((await stat(full)).isFile()) return full;
    } catch { /* 없으면 아래로 */ }
    return extname(rel) ? null : join(ROOT, 'index.html');
  }

  /** 항상 응답한다(없으면 404). */
  return async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    const file = await resolveFile(pathname);
    let body;
    try {
      body = file && (await readFile(file));
    } catch { body = null; }
    if (!body) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    const hashed = /[/\\]assets[/\\]/.test(file.slice(ROOT.length));
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}
