// 온라인 대전 API(/api/*). 단독 서버(serve.mjs)와 GameHub 허브(hub-entry.mjs)가 함께 쓴다. 방 관리는 rooms.mjs.
import * as api from './rooms.mjs';

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

export async function handleApi(req, res, url) {
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

export const shutdown = api.shutdown;
