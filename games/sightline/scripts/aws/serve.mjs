// SIGHTLINE 웹 시뮬레이터 서버 (의존성 없음). EC2 에서 systemd 로 실행한다.
// - dist/ 정적 파일 서빙
// - /api/* 온라인 대전 방(rooms.mjs). 게임 상태는 서버 메모리에만 있다.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../dist', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8102);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};

const api = await import('./rooms.mjs');

async function resolveFile(urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^[/\\]+/, '');
  const full = join(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null; // dist 밖 접근 차단
  try {
    if ((await stat(full)).isFile()) return full;
  } catch { /* 없으면 index.html 로 */ }
  return extname(rel) ? null : join(ROOT, 'index.html');
}

function readJson(req) {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 16 * 1024) { fail(new api.ApiError(413, '요청이 너무 큽니다.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { fail(new api.ApiError(400, 'JSON 형식이 아닙니다.')); }
    });
    req.on('error', fail);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(obj));
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'rooms', code, cmd]
  try {
    if (req.method === 'GET' && parts[1] === 'health') return sendJson(res, 200, { ok: true, ...api.stats() });
    if (parts[1] !== 'rooms') throw new api.ApiError(404, '없는 API 입니다.');
    if (req.method === 'POST' && parts.length === 2) return sendJson(res, 200, api.createRoom(await readJson(req)));
    const code = parts[2];
    if (req.method === 'GET' && parts[3] === 'stream') {
      api.openStream(code, url.searchParams.get('seat'), url.searchParams.get('token'), res);
      return undefined;
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      if (parts[3] === 'join') return sendJson(res, 200, api.joinRoom(code, body));
      if (parts[3] === 'host') return sendJson(res, 200, api.hostCommand(code, body));
      if (parts[3] === 'action') return sendJson(res, 200, api.doAction(code, body));
      if (parts[3] === 'rematch') return sendJson(res, 200, api.rematch(code, body));
    }
    throw new api.ApiError(404, '없는 API 입니다.');
  } catch (e) {
    const status = e instanceof api.ApiError ? e.status : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? '서버 오류' : e.message });
    return undefined;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) { await handleApi(req, res, url); return; }
  try {
    const file = await resolveFile(url.pathname);
    if (!file) { res.writeHead(404).end('Not found'); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    }).end(body);
  } catch {
    res.writeHead(500).end('Server error');
  }
}).listen(PORT, () => console.log(`Sightline server on :${PORT}`));
