import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

// 빌드된 클라이언트(client/dist)를 서버가 직접 서빙한다. 배포 시 프론트와 WebSocket 이 한 origin 이 되어
// 클라이언트의 `${location.host}/ws` 가 그대로 동작한다. SPA 이므로 파일이 없는 경로는 index.html 로 돌린다.

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

export type StaticHandler = (req: IncomingMessage, res: ServerResponse) => boolean;

// 정적 디렉터리가 없으면 null (개발 모드: Vite 가 프론트를 따로 서빙)
export function createStaticHandler(dir: string | undefined): StaticHandler | null {
  if (!dir) return null;
  const root = resolve(dir);
  const index = join(root, 'index.html');
  if (!existsSync(index)) return null;

  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const pathname = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    // 경로 탈출 방지: normalize 후 root 안에 있는지 확인
    const candidate = normalize(join(root, pathname));
    if (candidate !== root && !candidate.startsWith(root + sep)) return false;

    let file = candidate;
    let stat = safeStat(file);
    if (!stat || stat.isDirectory()) {
      // 파일이 없거나 디렉터리면 SPA 진입점으로 (확장자가 있는 요청은 진짜 404)
      if (extname(pathname) && pathname !== '/') return false;
      file = index;
      stat = safeStat(index);
      if (!stat) return false;
    }

    const ext = extname(file).toLowerCase();
    const immutable = pathname.startsWith('/assets/'); // Vite 가 해시를 붙인 파일
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    createReadStream(file).pipe(res);
    return true;
  };
}

function safeStat(path: string) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}
