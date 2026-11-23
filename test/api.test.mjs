// 서버 API 통합 테스트: 실제 서버를 띄우고 봇 대전 방에서 사람 좌석으로 끝까지 둔다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chooseAction } from '../src/engine/bot.js';

const PORT = 18102;
const base = `http://127.0.0.1:${PORT}`;
const post = async (path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
};

function readStream(url, onData) {
  const ctrl = new AbortController();
  (async () => {
    const r = await fetch(url, { signal: ctrl.signal });
    const dec = new TextDecoder();
    let buf = '';
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true });
      let k;
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const msg = buf.slice(0, k); buf = buf.slice(k + 2);
        const line = msg.split('\n').find((l) => l.startsWith('data: '));
        if (line) onData(JSON.parse(line.slice(6)));
      }
    }
  })().catch(() => {});
  return ctrl;
}

test('API: 봇 대전 한 판을 끝까지, 다른 좌석 정체는 새지 않는다', { skip: !existsSync('dist/engine/rules.js') && 'npm run build 먼저' }, async () => {
  const srv = spawn(process.execPath, ['scripts/aws/serve.mjs'], { env: { ...process.env, PORT: String(PORT), BOT_DELAY_MS: '5' }, stdio: 'pipe' });
  try {
    await new Promise((ok) => srv.stdout.on('data', (d) => { if (String(d).includes('server on')) ok(); }));
    const h = await (await fetch(base + '/api/health')).json();
    assert.equal(h.ok, true);
    const html = await (await fetch(base + '/')).text();
    assert.match(html, /SIGHTLINE/);

    const r = await post('/api/rooms', { size: 4, name: '테스터', vsBots: true, seat: 'S' });
    assert.equal(r.status, 200);
    const { code, seat, token } = r.data;
    const bad = await post(`/api/rooms/${code}/action`, { seat, token: 'x', action: { type: 'pass' } });
    assert.equal(bad.status, 403);

    let last = null;
    const done = new Promise((resolve) => {
      const ctrl = readStream(`${base}/api/rooms/${code}/stream?seat=${seat}&token=${token}`, async (p) => {
        last = p;
        const v = p.view;
        for (const pc of v.pieces) {
          if (pc.crest && pc.present && v.phase !== 'over') {
            assert.ok(['mine', 'now', 'memory', 'scout'].includes(pc.known));
          }
        }
        if (v.phase === 'over') { ctrl.abort(); resolve(); return; }
        if (v.turn === v.me) {
          const a = chooseAction(v);
          const res = await post(`/api/rooms/${code}/action`, { seat, token, action: a });
          assert.equal(res.status, 200, JSON.stringify(res.data));
        }
      });
    });
    await Promise.race([done, new Promise((_, no) => setTimeout(() => no(new Error('시간 초과')), 20000))]);
    assert.equal(last.view.phase, 'over');
    assert.ok(last.view.result.winners.length >= 1);
  } finally {
    srv.kill();
  }
});

test('API: 방 만들기 → 참가 → 봇 채우기 → 시작', { skip: !existsSync('dist/engine/rules.js') && 'npm run build 먼저' }, async () => {
  const srv = spawn(process.execPath, ['scripts/aws/serve.mjs'], { env: { ...process.env, PORT: String(PORT + 1), BOT_DELAY_MS: '5' }, stdio: 'pipe' });
  const b = `http://127.0.0.1:${PORT + 1}`;
  const p2 = async (path, body) => (await fetch(b + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  try {
    await new Promise((ok) => srv.stdout.on('data', (d) => { if (String(d).includes('server on')) ok(); }));
    const host = await p2('/api/rooms', { size: 3, name: 'A' });
    const guest = await p2(`/api/rooms/${host.code}/join`, { name: 'B' });
    assert.notEqual(guest.seat, host.seat);
    const notHost = await p2(`/api/rooms/${host.code}/host`, { seat: guest.seat, token: guest.token, cmd: 'start' });
    assert.ok(notHost.error);
    const early = await p2(`/api/rooms/${host.code}/host`, { seat: host.seat, token: host.token, cmd: 'start' });
    assert.ok(early.error, '빈 자리가 있으면 시작 불가');
    assert.equal((await p2(`/api/rooms/${host.code}/host`, { seat: host.seat, token: host.token, cmd: 'addBot' })).ok, true);
    assert.equal((await p2(`/api/rooms/${host.code}/host`, { seat: host.seat, token: host.token, cmd: 'start' })).ok, true);
    const late = await p2(`/api/rooms/${host.code}/join`, { name: 'C' });
    assert.ok(late.error);
  } finally {
    srv.kill();
  }
});
