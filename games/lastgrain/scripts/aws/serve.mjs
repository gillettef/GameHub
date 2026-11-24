// 빌드 결과(dist)를 서빙하고 온라인 대전 API(/api)를 제공하는 의존성 없는 서버. EC2 에서 systemd 로 실행한다.
//   POST /api/rooms                 방 만들기        → { code, token, seat }
//   GET  /api/rooms/:code           방 정보          → { phase, full, cfg }
//   POST /api/rooms/:code/join      참가             → { code, token, seat }
//   GET  /api/rooms/:code/events    상태 스트림(SSE, ?token=)
//   POST /api/rooms/:code/action    행동 { token, action }
//   POST /api/rooms/:code/rematch   다시 하기 { token }
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRooms, loadRules, HttpError } from './online.mjs';
import { clientIp } from './client-ip.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../dist', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const MAX_BODY = 4096;

async function resolveFile(urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^[/\\]+/, '');
  const full = join(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null; // dist 밖(예: dist2) 접근 차단
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
      if (size > MAX_BODY) { fail(new HttpError(413, '요청이 너무 크다.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return ok({});
      try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { fail(new HttpError(400, 'JSON 형식이 아니다.')); }
    });
    req.on('error', fail);
  });
}

const sendJson = (res, status, body) => res.writeHead(status, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' }).end(JSON.stringify(body));

// 방 만들기 남용 방지: IP 당 1분에 10개
const createHits = new Map();
function allowCreate(ip, t) {
  const list = (createHits.get(ip) || []).filter((x) => t - x < 60_000);
  if (list.length >= 10) return false;
  list.push(t);
  createHits.set(ip, list);
  return true;
}

async function handleApi(req, res, url, rooms) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','rooms',code?,verb?]
  if (parts[1] !== 'rooms') throw new HttpError(404, 'Not found');
  const [code, verb] = [parts[2], parts[3]];

  if (!code && req.method === 'POST') {
    if (!allowCreate(clientIp(req), Date.now())) throw new HttpError(429, '방을 너무 자주 만들었다. 잠시 뒤에 다시 시도하라.');
    return sendJson(res, 200, rooms.create(await readJson(req)));
  }
  if (code && !verb && req.method === 'GET') return sendJson(res, 200, rooms.info(code));
  if (verb === 'join' && req.method === 'POST') return sendJson(res, 200, rooms.join(code));
  if (verb === 'action' && req.method === 'POST') {
    const body = await readJson(req);
    return sendJson(res, 200, rooms.act(code, body.token, body.action));
  }
  if (verb === 'rematch' && req.method === 'POST') {
    const body = await readJson(req);
    return sendJson(res, 200, rooms.rematch(code, body.token));
  }
  if (verb === 'events' && req.method === 'GET') {
    const token = url.searchParams.get('token');
    let unsubscribe = null;
    const send = (snap) => res.write(`event: state\ndata: ${JSON.stringify(snap)}\n\n`);
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 1500\n\n');
    try { unsubscribe = rooms.subscribe(code, token, send); } catch (e) {
      res.write(`event: fatal\ndata: ${JSON.stringify({ error: e.message, status: e.status || 500 })}\n\n`);
      return res.end();
    }
    const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.on('close', () => { clearInterval(ping); unsubscribe(); });
    return undefined;
  }
  throw new HttpError(404, 'Not found');
}

/** 온라인 대전 API. 단독 서버(startServer)와 GameHub 허브(hub-entry.mjs)가 함께 쓴다. 200ms 마다 방 시계를 돌린다 */
export async function createApp() {
  const rules = await loadRules();
  const rooms = createRooms({ rules });
  const timer = setInterval(() => rooms.step(), 200);
  return {
    rooms,
    /** /api/* 를 맡으면 true. 나머지(정적 파일)는 호출한 쪽이 서빙한다 */
    async handle(req, res) {
      const url = new URL(req.url, 'http://x');
      if (!url.pathname.startsWith('/api/')) return false;
      try {
        await handleApi(req, res, url, rooms);
      } catch (e) {
        if (res.headersSent) res.end();
        else if (e instanceof HttpError) sendJson(res, e.status, { error: e.message });
        else { console.error(e); sendJson(res, 500, { error: 'Server error' }); }
      }
      return true;
    },
    close() { clearInterval(timer); },
  };
}

export async function startServer(port = Number(process.env.PORT ?? 8104)) {
  const app = await createApp();
  const server = createServer(async (req, res) => {
    if (await app.handle(req, res)) return undefined;
    const url = new URL(req.url, 'http://x');
    try {
      const file = await resolveFile(url.pathname);
      if (!file) { res.writeHead(404).end('Not found'); return undefined; }
      const body = await readFile(file);
      const hashed = /[/\\]assets[/\\]/.test(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      }).end(body);
    } catch (e) {
      if (res.headersSent) { res.end(); return undefined; }
      console.error(e); sendJson(res, 500, { error: 'Server error' });
    }
    return undefined;
  });
  server.on('close', () => app.close());
  await new Promise((ok) => server.listen(port, ok));
  return { server, rooms: app.rooms, port: server.address().port };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { port } = await startServer();
  console.log(`Lastgrain server on :${port}`);
}
