// 허브 동작 검사: 로비, 프록시 모드, 허브 안 실행(inproc) 모드, 모듈 실패 시 대체, 오류 격리, 종료 정리.
// 실행: node --test hub/test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHub } from '../server.mjs';

const listen = (server) => new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server.address().port)));

function request(port, urlPath, { method = 'GET', headers = {} } = {}) {
  return new Promise((ok, fail) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (body += d));
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', fail);
    req.end();
  });
}

/** WebSocket 대신 Upgrade 요청을 보내고 첫 응답 줄 또는 연결 종료를 받는다 */
function upgrade(port, urlPath) {
  return new Promise((ok) => {
    const sock = net.connect(port, '127.0.0.1', () => {
      sock.write(`GET ${urlPath} HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`);
    });
    let data = '';
    sock.on('data', (d) => { data += d; if (data.includes('\r\n\r\n')) { sock.destroy(); ok(data.split('\r\n')[0]); } });
    sock.on('close', () => ok(data ? data.split('\r\n')[0] : 'closed'));
    sock.on('error', () => ok('closed'));
  });
}

let dir, upstream, upstreamPort, hub, port, logs, closed;

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'hub-test-'));
  // inproc 게임: handle + 정적 파일 + upgrade + close
  const g = path.join(dir, 'alpha');
  mkdirSync(path.join(g, 'dist/assets'), { recursive: true });
  mkdirSync(path.join(g, 'dist/server'), { recursive: true });
  mkdirSync(path.join(g, 'scripts/aws'), { recursive: true });
  writeFileSync(path.join(g, 'dist/index.html'), '<h1>alpha</h1>');
  writeFileSync(path.join(g, 'dist/assets/app-123.js'), 'console.log(1)');
  writeFileSync(path.join(g, 'dist/server/secret.js'), 'secret');
  writeFileSync(path.join(g, 'dist/rules.html'), 'rules');
  writeFileSync(path.join(g, 'scripts/aws/hub-entry.mjs'), `
    import { fileURLToPath } from 'node:url';
    export async function mount(ctx) {
      globalThis.__alphaCtx = { slug: ctx.slug, dir: ctx.dir };
      return {
        staticRoot: fileURLToPath(new URL('../../dist', import.meta.url)),
        staticDeny: ['server'],
        handle(req, res) {
          if (req.url.startsWith('/api/echo')) {
            res.end(JSON.stringify({ url: req.url, prefix: req.headers['x-forwarded-prefix'], ip: req.socket.remoteAddress }));
            return true;
          }
          if (req.url === '/api/boom') throw new Error('boom');
          if (req.url === '/api/async-boom') return Promise.reject(new Error('async boom'));
          return false;
        },
        upgrade(req, socket) {
          if (req.url !== '/ws') return false;
          socket.end('HTTP/1.1 101 Switching Protocols\\r\\nX-Path: ' + req.url + '\\r\\n\\r\\n');
          return true;
        },
        close() { globalThis.__alphaClosed = true; },
      };
    }
  `);
  // 모듈 없는 inproc 게임(포트 있음 → 프록시로 대체 / 포트 없음 → 503)
  mkdirSync(path.join(dir, 'gamma'), { recursive: true });

  upstream = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { location: '/somewhere' }); return res.end(); }
    res.end(JSON.stringify({ url: req.url, prefix: req.headers['x-forwarded-prefix'], xff: req.headers['x-forwarded-for'] }));
  });
  upstream.on('upgrade', (req, socket) => socket.end(`HTTP/1.1 101 Switching Protocols\r\nX-Path: ${req.url}\r\n\r\n`));
  upstreamPort = await listen(upstream);

  logs = [];
  hub = await createHub({
    games: [
      { slug: 'alpha', name: '알파', mode: 'inproc' },
      { slug: 'beta', name: '베타', port: upstreamPort, aliases: ['oldbeta'] },
      { slug: 'gamma', name: '감마', port: upstreamPort, mode: 'inproc' },
      { slug: 'delta', name: '델타', mode: 'inproc' },
    ],
    gamesDir: dir,
    publicDir: path.join(dir, 'public-missing'),
    log: (...a) => logs.push(a.join(' ')),
  });
  port = await listen(hub.server);
});

after(async () => {
  await hub.close();
  closed = globalThis.__alphaClosed;
  upstream.close();
  rmSync(dir, { recursive: true, force: true });
  assert.equal(closed, true, '종료 때 게임 close() 를 부른다');
});

test('게임 목록 API 는 포트·실행 방식을 숨긴다', async () => {
  const r = await request(port, '/api/games');
  assert.equal(r.status, 200);
  const list = JSON.parse(r.body);
  assert.deepEqual(list.map((g) => g.slug), ['alpha', 'beta', 'gamma', 'delta']);
  for (const g of list) assert.ok(!('port' in g) && !('mode' in g) && !('entry' in g));
});

test('옛 slug(aliases)는 새 주소로 영구 이동', async () => {
  let r = await request(port, '/oldbeta/assets/a.js?v=2');
  assert.equal(r.status, 301);
  assert.equal(r.headers.location, '/beta/assets/a.js?v=2');
  r = await request(port, '/oldbeta');
  assert.equal(r.headers.location, '/beta/');
  r = await request(port, '/oldbeta?room=AB');
  assert.equal(r.headers.location, '/beta/?room=AB');
  const list = JSON.parse((await request(port, '/api/games')).body);
  assert.ok(list.every((g) => !('aliases' in g)), '목록 API 는 별칭을 숨긴다');
});

test('접두어 없는 게임 경로는 / 를 붙여 리다이렉트', async () => {
  const r = await request(port, '/beta?x=1');
  assert.equal(r.status, 308);
  assert.equal(r.headers.location, '/beta/?x=1');
});

test('프록시: 접두어를 떼고 넘기며 X-Forwarded-* 를 붙이고, 절대 경로 리다이렉트에 접두어를 붙인다', async () => {
  const r = JSON.parse((await request(port, '/beta/api/x?y=2', { headers: { 'x-forwarded-for': '6.6.6.6' } })).body);
  assert.equal(r.url, '/api/x?y=2');
  assert.equal(r.prefix, '/beta');
  assert.equal(r.xff.split(',').pop().trim(), '127.0.0.1', '실제 접속 주소가 맨 끝');
  const red = await request(port, '/beta/redirect');
  assert.equal(red.headers.location, '/beta/somewhere');
  assert.match(await upgrade(port, '/beta/ws'), /101/);
});

test('inproc: handle 이 접두어를 뗀 경로를 받는다', async () => {
  const r = JSON.parse((await request(port, '/alpha/api/echo?q=1')).body);
  assert.equal(r.url, '/api/echo?q=1');
  assert.equal(r.prefix, '/alpha');
  assert.equal(r.ip, '127.0.0.1');
  assert.deepEqual(globalThis.__alphaCtx, { slug: 'alpha', dir: path.join(dir, 'alpha') });
});

test('inproc: 정적 파일 — SPA 폴백, /assets/ 캐시, 막힌 경로, 루트 밖 접근', async () => {
  const index = await request(port, '/alpha/');
  assert.equal(index.body, '<h1>alpha</h1>');
  assert.equal(index.headers['cache-control'], 'no-cache');
  assert.equal((await request(port, '/alpha/room/ABCD')).body, '<h1>alpha</h1>', '확장자 없는 경로는 index.html');
  const asset = await request(port, '/alpha/assets/app-123.js');
  assert.equal(asset.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.match(asset.headers['content-type'], /javascript/);
  assert.equal((await request(port, '/alpha/rules.html')).body, 'rules');
  assert.equal((await request(port, '/alpha/missing.js')).status, 404);
  assert.equal((await request(port, '/alpha/server/secret.js')).status, 404, 'staticDeny');
  assert.equal((await request(port, '/alpha/%2e%2e/%2e%2e/package.json')).status, 404);
  assert.equal((await request(port, '/alpha/%E0%A4%A')).status, 404, '깨진 퍼센트 인코딩');
  assert.equal((await request(port, '/alpha/x', { method: 'POST' })).status, 405);
});

test('inproc: 게임 오류는 그 요청만 500 으로 끝나고 허브는 계속 돈다', async () => {
  assert.equal((await request(port, '/alpha/api/boom')).status, 500);
  assert.equal((await request(port, '/alpha/api/async-boom')).status, 500);
  assert.equal((await request(port, '/beta/api/ok')).status, 200);
  assert.equal((await request(port, '/alpha/api/echo')).status, 200);
  assert.ok(logs.some((l) => l.includes('[alpha]') && l.includes('/api/boom')));
});

test('inproc: WebSocket upgrade 는 게임이 맡고, 맡지 않으면 닫는다', async () => {
  assert.match(await upgrade(port, '/alpha/ws'), /101/);
  assert.equal(await upgrade(port, '/alpha/other'), 'closed');
  assert.equal(await upgrade(port, '/nope/ws'), 'closed');
});

test('모듈을 못 불러오면 포트가 있으면 프록시로, 없으면 503', async () => {
  assert.equal(JSON.parse((await request(port, '/gamma/hi')).body).url, '/hi');
  assert.equal((await request(port, '/delta/')).status, 503);
  const st = JSON.parse((await request(port, '/healthz/status')).body);
  const mode = Object.fromEntries(st.games.map((g) => [g.slug, g.mode]));
  assert.deepEqual(mode, { alpha: 'inproc', beta: 'proxy', gamma: 'proxy', delta: 'down' });
  assert.ok(st.games.find((g) => g.slug === 'gamma').error);
  assert.ok(st.memory.rss > 0);
});
