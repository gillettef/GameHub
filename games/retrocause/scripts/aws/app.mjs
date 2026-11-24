// 온라인 방 API(/api/*, SSE). 단독 서버(serve.mjs)와 GameHub 허브(hub-entry.mjs)가 함께 쓴다.
// 방 상태는 메모리에만 있다(재시작하면 진행 중인 방이 사라진다).
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** @param {{ root: string }} opts root = 빌드 결과(dist). 방 로직(dist/src/rooms.js)은 브라우저와 같은 엔진을 쓴다 */
export async function createApp({ root }) {
  const { RoomHub, RoomError } = await import(pathToFileURL(join(root, 'src', 'rooms.js')).href);
  const hub = new RoomHub();
  const streams = new Map(); // code -> Set<{token, res}>

  function push(code) {
    const subs = streams.get(code);
    if (!subs) return;
    for (const s of subs) {
      try {
        s.res.write(`data: ${JSON.stringify(hub.view(code, s.token))}\n\n`);
      } catch {
        subs.delete(s);
      }
    }
  }
  hub.onChange(push);
  const tick = setInterval(() => {
    for (const subs of streams.values()) for (const s of subs) s.res.write(': ping\n\n');
    hub.sweep();
    for (const code of streams.keys()) if (!hub.rooms.has(code)) streams.delete(code);
  }, 20_000);
  tick.unref();

  function sendJSON(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
  }

  async function readBody(req) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > 8192) throw new RoomError('요청이 너무 큽니다');
      chunks.push(c);
    }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new RoomError('잘못된 요청입니다'); }
  }

  async function api(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean); // ['api', 'rooms', code?, verb?]
    if (parts[1] === 'health') return sendJSON(res, 200, { ok: true, rooms: hub.rooms.size });
    if (parts[1] !== 'rooms') return sendJSON(res, 404, { error: '없는 주소입니다' });
    const [code, verb] = [parts[2], parts[3]];

    if (req.method === 'GET' && verb === 'stream') {
      const token = url.searchParams.get('token');
      const first = hub.view(code, token); // 참가자가 아니면 여기서 예외
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store',
        Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
      });
      res.write(`retry: 2000\ndata: ${JSON.stringify(first)}\n\n`);
      const key = first.code;
      if (!streams.has(key)) streams.set(key, new Set());
      const sub = { token, res };
      streams.get(key).add(sub);
      req.on('close', () => streams.get(key)?.delete(sub));
      return;
    }
    if (req.method !== 'POST') return sendJSON(res, 405, { error: '허용하지 않는 방식입니다' });
    const body = await readBody(req);
    if (!code) return sendJSON(res, 200, hub.createRoom(body.name));
    switch (verb) {
      case 'join': return sendJSON(res, 200, hub.join(code, body.name, body.token));
      case 'leave': hub.leave(code, body.token); return sendJSON(res, 200, { ok: true });
      case 'config': hub.configure(code, body.token, body); return sendJSON(res, 200, { ok: true });
      case 'start': hub.start(code, body.token); return sendJSON(res, 200, { ok: true });
      case 'action': hub.act(code, body.token, body.action); return sendJSON(res, 200, { ok: true });
      case 'guess': hub.guess(code, body.token, body.guess); return sendJSON(res, 200, { ok: true });
      case 'takeover': hub.takeover(code, body.token); return sendJSON(res, 200, { ok: true });
      case 'rematch': hub.rematch(code, body.token); return sendJSON(res, 200, { ok: true });
      case 'view': return sendJSON(res, 200, hub.view(code, body.token));
      default: return sendJSON(res, 404, { error: '없는 주소입니다' });
    }
  }

  return {
    hub,
    /** /api/* 를 맡으면 true. 나머지(정적 파일)는 호출한 쪽이 서빙한다 */
    async handle(req, res) {
      const url = new URL(req.url, 'http://x');
      if (!url.pathname.startsWith('/api/')) return false;
      try {
        await api(req, res, url);
      } catch (e) {
        if (!res.headersSent) sendJSON(res, e instanceof RoomError ? 400 : 500, { error: e instanceof RoomError ? e.message : '서버 오류' });
        if (!(e instanceof RoomError)) console.error(e);
      }
      return true;
    },
    close() {
      clearInterval(tick);
      for (const subs of streams.values()) for (const s of subs) s.res.end();
      streams.clear();
    },
  };
}
