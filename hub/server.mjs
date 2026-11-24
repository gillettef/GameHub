// GameHub 허브: 한 포트(기본 80)에서 로비를 보여 주고, /<slug>/... 요청을 각 게임 서버(127.0.0.1:<port>)로 넘긴다.
// HTTP 와 WebSocket(Upgrade) 모두 프록시한다. 의존성 없음 — Node 22 내장 모듈만 쓴다.
//
// 1단계(하이브리드) 동안 게임은 지금처럼 각자 systemd 서비스로 돌고, 허브는 앞단 라우터 역할만 한다.
// 게임은 경로 접두어(/<slug>/) 아래에서도 동작하도록 상대 경로를 써야 한다(games/*/ 의 base 설정 참고).
import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 80);
const UPSTREAM_HOST = process.env.UPSTREAM_HOST ?? '127.0.0.1';
const games = JSON.parse(readFileSync(path.join(here, 'games.json'), 'utf8'));
const bySlug = new Map(games.map((g) => [g.slug, g]));

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };

/** "/tesseract/assets/a.js?x=1" → { game, rest: "/assets/a.js?x=1" } */
function route(url) {
  const m = /^\/([a-z0-9-]+)(\/.*)?$/.exec(url.split('?')[0]);
  if (!m) return null;
  const game = bySlug.get(m[1]);
  if (!game) return null;
  const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  return { game, bare: m[2] === undefined, rest: (m[2] ?? '/') + query };
}

function forwardedHeaders(req, game) {
  const h = { ...req.headers };
  h['x-forwarded-for'] = [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', ');
  h['x-forwarded-host'] = req.headers.host ?? '';
  h['x-forwarded-prefix'] = `/${game.slug}`;
  return h;
}

async function serveLobby(req, res) {
  const p = req.url.split('?')[0];
  if (p === '/api/games') {
    res.writeHead(200, { 'content-type': MIME['.json'] });
    return res.end(JSON.stringify(games.map(({ port, ...pub }) => pub)));
  }
  if (p === '/healthz') return res.end('ok');
  const file = p === '/' ? 'index.html' : p.slice(1);
  if (file.includes('..')) { res.writeHead(400); return res.end(); }
  try {
    const body = await readFile(path.join(here, 'public', file));
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('없는 페이지입니다');
  }
}

const server = http.createServer((req, res) => {
  const r = route(req.url);
  if (!r) return serveLobby(req, res);
  if (r.bare) { // /tesseract → /tesseract/ (상대 경로가 올바르게 풀리도록)
    res.writeHead(308, { location: `/${r.game.slug}/${req.url.slice(r.game.slug.length + 1)}` });
    return res.end();
  }
  const up = http.request(
    { host: UPSTREAM_HOST, port: r.game.port, method: req.method, path: r.rest, headers: forwardedHeaders(req, r.game) },
    (upRes) => {
      const headers = { ...upRes.headers };
      // 게임이 절대 경로로 리다이렉트하면 접두어를 붙여 준다.
      if (typeof headers.location === 'string' && headers.location.startsWith('/')) headers.location = `/${r.game.slug}${headers.location}`;
      res.writeHead(upRes.statusCode ?? 502, headers);
      upRes.pipe(res);
    },
  );
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`${r.game.name} 서버가 응답하지 않습니다`);
  });
  req.pipe(up);
});

// WebSocket: 요청 줄의 경로만 바꿔서 원시 소켓을 그대로 잇는다.
server.on('upgrade', (req, socket, head) => {
  const r = route(req.url);
  if (!r || r.bare) return socket.destroy();
  const up = net.connect(r.game.port, UPSTREAM_HOST, () => {
    const headers = forwardedHeaders(req, r.game);
    const lines = [`${req.method} ${r.rest} HTTP/1.1`, ...Object.entries(headers).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => `${k}: ${x}`))];
    up.write(lines.join('\r\n') + '\r\n\r\n');
    if (head.length) up.write(head);
    up.pipe(socket).pipe(up);
  });
  const close = () => { up.destroy(); socket.destroy(); };
  up.on('error', close);
  socket.on('error', close);
});

server.listen(PORT, () => console.log(`GameHub 허브 :${PORT} — 게임 ${games.length}개`));
