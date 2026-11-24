// 온라인 대전 서버 API 검사. 실행: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../scripts/aws/serve.mjs';

const post = async (base, path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json() };
};

test('방 만들기 → 참가 → 행동 → 기권', async () => {
  const { server, rooms, port } = await startServer(0);
  const base = `http://127.0.0.1:${port}`;
  try {
    const host = await post(base, '/api/rooms', { side: '0', greatMin: 5, target: 10 });
    assert.equal(host.status, 200);
    assert.match(host.body.code, /^[A-Z2-9]{5}$/);
    assert.equal(host.body.seat, 0);

    const guest = await post(base, `/api/rooms/${host.body.code}/join`);
    assert.equal(guest.body.seat, 1);
    assert.equal((await post(base, `/api/rooms/${host.body.code}/join`)).status, 409, '가득 찬 방');

    const room = rooms.rooms.get(host.body.code);
    room.startAt = Date.now() - 1; room.lastTick = Date.now(); // 카운트다운 건너뛰기
    const s = room.state;
    const unit = Object.values(s.units).find((u) => u.owner === 0 && !u.pos);
    assert.equal((await post(base, `/api/rooms/${host.body.code}/action`, { token: guest.body.token, action: { type: 'end' } })).status, 409, '상대 차례');
    assert.equal((await post(base, `/api/rooms/${host.body.code}/action`, { token: 'nope', action: { type: 'end' } })).status, 403);
    const sm = await post(base, `/api/rooms/${host.body.code}/action`, { token: host.body.token, action: { type: 'summon', unitId: unit.id, c: 2, r: 0 } });
    assert.equal(sm.body.ok, true);
    assert.deepEqual(s.units[unit.id].pos, [2, 0]);

    const rs = await post(base, `/api/rooms/${host.body.code}/action`, { token: guest.body.token, action: { type: 'resign' } });
    assert.equal(rs.body.ok, true);
    assert.equal(s.over, true);
    assert.equal(s.winner, 0);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});
