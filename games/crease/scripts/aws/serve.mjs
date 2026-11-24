// 빌드 결과(dist)를 서빙하고, 온라인 대전방 API(/api/*)를 제공하는 의존성 없는 서버. EC2 에서 systemd 로 실행한다.
// 대전방은 메모리에만 있으므로 재시작하면 진행 중인 방은 사라진다.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRooms } from './rooms.mjs';
import { clientIp } from './client-ip.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../dist', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8101);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

// 규칙 엔진은 브라우저와 같은 파일(dist)을 쓴다
const engine = await import(pathToFileURL(join(ROOT, 'engine.js')).href);
const { chooseTurn } = await import(pathToFileURL(join(ROOT, 'bot.js')).href);
const { RULES } = await import(pathToFileURL(join(ROOT, 'rules-config.js')).href);
const rooms = createRooms({ engine, chooseTurn, RULES });
setInterval(() => rooms.sweep(), 10 * 60 * 1000).unref();

async function resolveFile(urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^[/\\]+/, '');
  const full = join(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null; // dist 밖(예: dist2) 접근 차단
  try {
    if ((await stat(full)).isFile()) return full;
  } catch { /* 없으면 index.html 로 */ }
  return extname(rel) ? null : join(ROOT, 'index.html');
}

// IP별 간단한 요청 빈도 제한 (10초에 60번)
const hits = new Map();
function limited(ip) {
  const t = Date.now();
  const h = hits.get(ip) || { t, n: 0 };
  if (t - h.t > 10_000) { h.t = t; h.n = 0; }
  h.n++;
  hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.n > 60;
}

function readJson(req) {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 4096) { fail(Object.assign(new Error('요청이 너무 큽니다'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { fail(Object.assign(new Error('JSON 형식이 아닙니다'), { status: 400 })); }
    });
    req.on('error', fail);
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'rooms', CODE, action]
  const ip = clientIp(req);
  if (req.method === 'GET' && parts[1] === 'health') return json(res, 200, { ok: true, rooms: rooms.rooms.size });
  if (parts[1] !== 'rooms') return json(res, 404, { error: '없는 API' });
  const code = parts[2];
  const action = parts[3];

  // 실시간 상태 (Server-Sent Events)
  if (req.method === 'GET' && code && action === 'events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    const unsubscribe = rooms.subscribe(code, url.searchParams.get('token'), res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => { clearInterval(ping); unsubscribe(); });
    return undefined;
  }
  if (req.method === 'GET' && code && !action) return json(res, 200, rooms.snapshot(code, url.searchParams.get('token')));

  if (req.method !== 'POST') return json(res, 405, { error: '허용하지 않는 방식' });
  if (limited(ip)) return json(res, 429, { error: '요청이 너무 잦습니다' });
  const body = await readJson(req);
  if (!code) return json(res, 200, rooms.create(body));
  if (action === 'join') return json(res, 200, rooms.join(code, body));
  if (action === 'seat') { rooms.setSeat(code, body.token, body); return json(res, 200, { ok: true }); }
  if (action === 'start') { rooms.start(code, body.token); return json(res, 200, { ok: true }); }
  if (action === 'act') { rooms.act(code, body.token, body.action); return json(res, 200, { ok: true }); }
  return json(res, 404, { error: '없는 API' });
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    try {
      await api(req, res, url);
    } catch (e) {
      if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : '서버 오류' });
      if (!e.status) console.error(e);
    }
    return;
  }
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
