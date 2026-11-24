import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import * as engine from '../src/engine.js';
import { createRoomService } from '../../scripts/aws/rooms.mjs';

async function withServer(fn) {
  const svc = createRoomService(engine);
  const server = createServer((req, res) => svc.handle(req, res, new URL(req.url, 'http://x')));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, svc); } finally { server.closeAllConnections?.(); server.close(); }
}

async function api(base, path, body) {
  const res = await fetch(base + path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function choose(view) {
  if (view.phase === 'plan') return { kind: 'moves', payload: view.fleets.map((f) => pick(f.legal)) };
  if (view.phase === 'attack') return { kind: 'attacks', payload: view.fleets.filter(() => Math.random() < 0.3).map((f) => f.id) };
  if (view.phase === 'blockade') return { kind: 'blockades', payload: view.blockades.map((o) => o.idx) };
  const used = new Set();
  const orders = [];
  for (const f of view.fleets) {
    if (f.canOccupy && !used.has(f.real)) { used.add(f.real); orders.push({ fid: f.id, kind: 'occupy' }); }
  }
  return { kind: 'occupations', payload: orders };
}

test('온라인 방: 만들기·참가·한 판 완주, 상대 비밀 정보는 보내지 않는다', async () => {
  await withServer(async (base) => {
    const a = (await api(base, '/api/rooms', {})).json;
    assert.equal(a.pid, 'A');
    assert.equal(a.code.length, 5);
    const early = await api(base, `/api/rooms/${a.code}/action`, { token: a.token, kind: 'moves', payload: ['STAY', 'STAY', 'STAY'] });
    assert.equal(early.status, 409, '상대가 들어오기 전에는 제출할 수 없다');
    const b = (await api(base, `/api/rooms/${a.code.toLowerCase()}/join`, {})).json;
    assert.equal(b.pid, 'B');
    assert.equal((await api(base, `/api/rooms/${a.code}/join`, {})).status, 409, '세 번째 참가는 거절');
    assert.equal((await api(base, `/api/rooms/${a.code}/state?token=nope`)).status, 403);

    const players = [a, b];
    let guard = 0;
    for (;;) {
      if (++guard > 400) throw new Error('끝나지 않는다');
      const views = await Promise.all(players.map((p) => api(base, `/api/rooms/${a.code}/state?token=${p.token}`)));
      const [va, vb] = views.map((v) => v.json);
      if (va.phase === 'over') {
        assert.ok(va.opp.fleets.every((f) => f.real), '게임이 끝나면 상대 실체를 공개한다');
        assert.ok(va.history.length >= 1);
        break;
      }
      for (const [v, other] of [[va, 'B'], [vb, 'A']]) {
        assert.ok(v.opp.fleets.every((f) => f.real === null), '진행 중에는 상대 실체를 보내지 않는다');
        assert.ok(v.log.filter((e) => e.type === 'place' && e.pid === other).every((e) => e.secret === undefined));
        assert.equal(JSON.stringify(v).includes('"slots":[null,['), true);
      }
      for (const [p, v] of [[a, va], [b, vb]]) {
        if (v.online.waiting.me) continue;
        if (v.phase === 'blockade' && v.blockades.length === 0) continue;
        const { kind, payload } = choose(v);
        const r = await api(base, `/api/rooms/${a.code}/action`, { token: p.token, kind, payload });
        assert.equal(r.status, 200, JSON.stringify(r.json));
      }
    }
    // 다시 하기: 두 명 모두 요청하면 새 게임
    await api(base, `/api/rooms/${a.code}/action`, { token: a.token, kind: 'rematch' });
    const r2 = await api(base, `/api/rooms/${a.code}/action`, { token: b.token, kind: 'rematch' });
    assert.equal(r2.json.phase, 'plan');
    assert.equal(r2.json.round, 1);
  });
});

test('온라인 방: 잘못된 제출은 거절하고, 이벤트 스트림으로 화면 정보를 보낸다', async () => {
  await withServer(async (base) => {
    const a = (await api(base, '/api/rooms', {})).json;
    const b = (await api(base, `/api/rooms/${a.code}/join`, {})).json;
    const bad = await api(base, `/api/rooms/${a.code}/action`, { token: a.token, kind: 'moves', payload: ['9', 'STAY', 'STAY'] });
    assert.equal(bad.status, 400);
    const wrong = await api(base, `/api/rooms/${a.code}/action`, { token: a.token, kind: 'attacks', payload: [] });
    assert.equal(wrong.status, 409);
    assert.equal((await api(base, '/api/rooms/ZZZZZ/state?token=x')).status, 404);

    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/rooms/${a.code}/events?token=${b.token}`, { signal: ctrl.signal });
    const reader = res.body.getReader();
    let text = '';
    while (!text.includes('event: view')) text += new TextDecoder().decode((await reader.read()).value);
    const ok = await api(base, `/api/rooms/${a.code}/action`, { token: a.token, kind: 'moves', payload: ['STAY', 'STAY', 'STAY'] });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.online.waiting.me, true);
    ctrl.abort();
  });
});
