// GameHub 허브: 한 포트(기본 80)에서 로비를 보여 주고, /<slug>/... 요청을 게임에 넘긴다. 의존성 없음 — Node 22 내장 모듈만 쓴다.
//
// 게임을 넘기는 방식은 games.json 의 게임별 "mode" 로 정한다 (2단계 2a, docs/phase2-design.md).
// - "proxy"(기본): 게임은 각자 systemd 서비스로 돌고, 허브는 127.0.0.1:<port> 로 HTTP·WebSocket 을 프록시한다.
// - "inproc": 허브 프로세스가 게임 모듈을 직접 불러 실행한다(프로세스 하나로 합쳐 메모리 절약).
//   모듈은 <GAMES_DIR>/<slug>/<entry>(기본 scripts/aws/hub-entry.mjs). 운영은 GAMES_DIR=~ (게임마다 ~/<slug> 에 배포),
//   로컬은 저장소의 games/ 다. 모듈을 못 불러오면 port 가 있을 때 프록시로 대신한다(배포 순서와 상관없이 안전하게).
//
// inproc 게임 모듈 계약:
//   export async function mount(ctx) → {
//     staticRoot?: string,        // 정적 파일 루트. handle 이 응답하지 않은 GET 을 여기서 서빙한다(SPA 폴백·/assets/ 캐시)
//     staticDeny?: string[],      // staticRoot 아래에서 막을 최상위 디렉터리(서버 코드 등)
//     handle?(req, res): boolean | Promise<boolean>,   // req.url 은 /<slug> 를 뗀 경로. 응답을 맡았으면 true
//     upgrade?(req, socket, head): boolean,           // WebSocket. 맡았으면 true(아니면 허브가 소켓을 닫는다)
//     close?(): void | Promise<void>,                  // 종료 때 타이머·연결 정리
//   }
//   ctx = { slug, dir(게임 배포 디렉터리), log(...args) }
//   게임 코드는 자체 http 서버·listen·process.on·process.exit 를 쓰지 않는다. 클라이언트 IP 는 req.socket.remoteAddress 가 실제 주소다.
//
// 게임 하나의 예외가 다른 게임을 죽이지 않게: handle/upgrade 예외는 그 요청만 500 으로 끝내고,
// 게임 타이머 등에서 새어 나온 예외(uncaughtException)는 로그만 남기고 계속 돈다.
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createStatic, MIME } from './lib/static.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ENTRY = 'scripts/aws/hub-entry.mjs';
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** "/tesseract/assets/a.js?x=1" → { slug, bare: false, rest: "/assets/a.js?x=1" } */
function parseRoute(url) {
  const m = /^\/([a-z0-9-]+)(\/.*)?$/.exec(url.split('?')[0]);
  if (!m) return null;
  const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  return { slug: m[1], bare: m[2] === undefined, rest: (m[2] ?? '/') + query };
}

/**
 * @param {{ games: any[], gamesDir: string, publicDir?: string, upstreamHost?: string, log?: (...a: any[]) => void }} opts
 */
export async function createHub({ games, gamesDir, publicDir = path.join(here, 'public'), upstreamHost = '127.0.0.1', log = console.log }) {
  const bySlug = new Map(games.map((g) => [g.slug, g]));
  /** slug → { mode: 'inproc'|'proxy'|'down', mounted?, serveStatic?, error? } */
  const runtime = new Map();

  for (const game of games) {
    if (game.mode !== 'inproc') { runtime.set(game.slug, { mode: 'proxy' }); continue; }
    const dir = path.resolve(gamesDir, game.slug);
    const entry = path.join(dir, game.entry ?? DEFAULT_ENTRY);
    try {
      const mod = await import(pathToFileURL(entry).href);
      const mounted = (await mod.mount({ slug: game.slug, dir, log: (...a) => log(`[${game.slug}]`, ...a) })) ?? {};
      const serveStatic = mounted.staticRoot ? createStatic(mounted.staticRoot, { deny: mounted.staticDeny }) : null;
      runtime.set(game.slug, { mode: 'inproc', mounted, serveStatic });
      log(`[hub] ${game.slug}: 허브 안에서 실행 (${path.relative(gamesDir, entry)})`);
    } catch (err) {
      const mode = game.port ? 'proxy' : 'down';
      runtime.set(game.slug, { mode, error: String(err?.message ?? err) });
      log(`[hub] ${game.slug}: 모듈을 불러오지 못해 ${mode === 'proxy' ? `프록시(:${game.port})로 대신합니다` : '서비스할 수 없습니다'} — ${err?.message ?? err}`);
    }
  }

  function forwardedHeaders(req, slug) {
    const h = { ...req.headers };
    h['x-forwarded-for'] = [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', ');
    h['x-forwarded-host'] = req.headers.host ?? '';
    h['x-forwarded-prefix'] = `/${slug}`;
    return h;
  }

  function status() {
    return {
      uptimeSec: Math.round(process.uptime()),
      memory: Object.fromEntries(Object.entries(process.memoryUsage()).map(([k, v]) => [k, Math.round(v / 1048576)])),
      games: games.map((g) => ({ slug: g.slug, ...runtime.get(g.slug), mounted: undefined, serveStatic: undefined })),
    };
  }

  async function serveLobby(req, res) {
    const p = req.url.split('?')[0];
    if (p === '/api/games') {
      res.writeHead(200, { 'content-type': MIME['.json'] });
      return res.end(JSON.stringify(games.map(({ port, mode, entry, ...pub }) => pub)));
    }
    if (p === '/healthz') return res.end('ok');
    // 운영 점검용(메모리·게임별 실행 방식). 서버 안에서만 본다
    if (p === '/healthz/status' && LOOPBACK.has(req.socket.remoteAddress ?? '')) {
      res.writeHead(200, { 'content-type': MIME['.json'] });
      return res.end(JSON.stringify(status(), null, 2));
    }
    const file = p === '/' ? 'index.html' : p.slice(1);
    if (file.includes('..')) { res.writeHead(400); return res.end(); }
    try {
      const body = await readFile(path.join(publicDir, file));
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('없는 페이지입니다');
    }
  }

  function fail(res, code, text) {
    if (!res.headersSent) res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(text);
  }

  function proxyHttp(req, res, game, rest) {
    const up = http.request(
      { host: upstreamHost, port: game.port, method: req.method, path: rest, headers: forwardedHeaders(req, game.slug) },
      (upRes) => {
        const headers = { ...upRes.headers };
        // 게임이 절대 경로로 리다이렉트하면 접두어를 붙여 준다.
        if (typeof headers.location === 'string' && headers.location.startsWith('/')) headers.location = `/${game.slug}${headers.location}`;
        res.writeHead(upRes.statusCode ?? 502, headers);
        upRes.pipe(res);
      },
    );
    up.on('error', () => fail(res, 502, `${game.name} 서버가 응답하지 않습니다`));
    req.pipe(up);
  }

  async function inprocHttp(req, res, game, rt, rest) {
    req.url = rest;
    req.headers['x-forwarded-prefix'] = `/${game.slug}`;
    try {
      if (rt.mounted.handle && (await rt.mounted.handle(req, res))) return;
      if (rt.serveStatic) return await rt.serveStatic(req, res, new URL(rest, 'http://x').pathname);
      fail(res, 404, 'Not found');
    } catch (err) {
      log(`[${game.slug}] 요청 처리 중 오류 ${req.method} ${rest}:`, err);
      fail(res, 500, '서버 오류');
    }
  }

  const server = http.createServer((req, res) => {
    const r = parseRoute(req.url);
    const game = r && bySlug.get(r.slug);
    if (!game) return serveLobby(req, res);
    if (r.bare) { // /tesseract → /tesseract/ (상대 경로가 올바르게 풀리도록)
      res.writeHead(308, { location: `/${game.slug}/${req.url.slice(game.slug.length + 1)}` });
      return res.end();
    }
    const rt = runtime.get(game.slug);
    if (rt.mode === 'inproc') return void inprocHttp(req, res, game, rt, r.rest);
    if (rt.mode === 'proxy') return proxyHttp(req, res, game, r.rest);
    fail(res, 503, `${game.name}을(를) 지금 열 수 없습니다`);
  });

  server.on('upgrade', (req, socket, head) => {
    const r = parseRoute(req.url);
    const game = r && !r.bare && bySlug.get(r.slug);
    if (!game) return socket.destroy();
    const rt = runtime.get(game.slug);
    if (rt.mode === 'inproc') {
      req.url = r.rest;
      req.headers['x-forwarded-prefix'] = `/${game.slug}`;
      try {
        if (rt.mounted.upgrade?.(req, socket, head)) return;
      } catch (err) {
        log(`[${game.slug}] WebSocket 연결 처리 중 오류:`, err);
      }
      return socket.destroy();
    }
    if (rt.mode !== 'proxy') return socket.destroy();
    // 프록시: 요청 줄의 경로만 바꿔서 원시 소켓을 그대로 잇는다.
    const up = net.connect(game.port, upstreamHost, () => {
      const headers = forwardedHeaders(req, game.slug);
      const lines = [`${req.method} ${r.rest} HTTP/1.1`, ...Object.entries(headers).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => `${k}: ${x}`))];
      up.write(lines.join('\r\n') + '\r\n\r\n');
      if (head.length) up.write(head);
      up.pipe(socket).pipe(up);
    });
    const close = () => { up.destroy(); socket.destroy(); };
    up.on('error', close);
    socket.on('error', close);
  });

  async function close() {
    await new Promise((ok) => { server.close(() => ok()); server.closeAllConnections?.(); });
    for (const [slug, rt] of runtime) {
      try { await rt.mounted?.close?.(); } catch (err) { log(`[${slug}] 종료 중 오류:`, err); }
    }
  }

  return { server, runtime, status, close };
}

function defaultGamesDir() {
  if (process.env.GAMES_DIR) return path.resolve(process.env.GAMES_DIR);
  const repoGames = path.resolve(here, '../games'); // 저장소에서 실행(로컬)
  return existsSync(repoGames) ? repoGames : os.homedir(); // 운영: 게임마다 ~/<slug>
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const PORT = Number(process.env.PORT ?? 80);
  const games = JSON.parse(readFileSync(path.join(here, 'games.json'), 'utf8'));
  process.on('uncaughtException', (err) => console.error('[hub] 처리되지 않은 예외(계속 실행):', err));
  process.on('unhandledRejection', (err) => console.error('[hub] 처리되지 않은 Promise 거부(계속 실행):', err));
  const hub = await createHub({ games, gamesDir: defaultGamesDir(), upstreamHost: process.env.UPSTREAM_HOST ?? '127.0.0.1' });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => process.exit(0), 5000).unref();
    await hub.close();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  hub.server.listen(PORT, () => {
    const inproc = [...hub.runtime].filter(([, rt]) => rt.mode === 'inproc').map(([s]) => s);
    console.log(`GameHub 허브 :${PORT} — 게임 ${games.length}개 (허브 안에서 실행: ${inproc.join(', ') || '없음'})`);
  });
}
