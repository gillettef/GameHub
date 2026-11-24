// 온라인 대전방 API(/api/*). 단독 서버(serve.mjs)와 GameHub 허브(hub-entry.mjs)가 함께 쓴다.
// 대전방은 메모리에만 있으므로 재시작하면 진행 중인 방은 사라진다.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRooms } from './rooms.mjs';
import { clientIp } from './client-ip.mjs';

/** @param {{ root: string }} opts root = 빌드 결과(dist). 규칙 엔진은 브라우저와 같은 파일을 쓴다 */
export async function createApp({ root }) {
  const engine = await import(pathToFileURL(join(root, 'engine.js')).href);
  const { chooseTurn } = await import(pathToFileURL(join(root, 'bot.js')).href);
  const { RULES } = await import(pathToFileURL(join(root, 'rules-config.js')).href);
  const rooms = createRooms({ engine, chooseTurn, RULES });
  const sweep = setInterval(() => rooms.sweep(), 10 * 60 * 1000);
  sweep.unref();
  const streams = new Set();

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
      streams.add(res);
      req.on('close', () => { clearInterval(ping); unsubscribe(); streams.delete(res); });
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

  return {
    rooms,
    /** /api/* 를 맡으면 true. 나머지(정적 파일)는 호출한 쪽이 서빙한다 */
    async handle(req, res) {
      const url = new URL(req.url, 'http://x');
      if (!url.pathname.startsWith('/api/')) return false;
      try {
        await api(req, res, url);
      } catch (e) {
        if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : '서버 오류' });
        if (!e.status) console.error(e);
      }
      return true;
    },
    close() {
      clearInterval(sweep);
      for (const res of streams) res.end();
      streams.clear();
    },
  };
}
