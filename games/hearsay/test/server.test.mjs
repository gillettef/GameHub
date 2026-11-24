import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, rooms } from '../src/server/rooms.mjs';

const FAST = { whisperMs: 400, claimRevealMs: 20, resultMs: 20, chooseMs: 300, claimMs: 300, chatTtlMs: 1000, botScale: 0.002 };

test('사람 1 + 봇 3 봇 대전이 서버 타이머만으로 끝까지 진행된다', async () => {
  const { code, token } = createRoom({ name: '사람', size: 4, mode: 'solo', timing: FAST });
  const room = rooms.get(code);
  assert.equal(room.seats.filter((s) => s.isBot).length, 3);
  const seat = room.seatOf(token);
  // 사람은 아무것도 하지 않는다: 시간 초과 처리(무작위 점유, 자동 질문, 무효 증언)로 진행돼야 한다
  const t0 = Date.now();
  while (room.game.phase !== 'ended' && Date.now() - t0 < 60_000) await new Promise((r) => setTimeout(r, 50));
  assert.equal(room.game.phase, 'ended');
  const v = room.viewFor(seat);
  assert.equal(v.phase, 'ended');
  assert.ok(v.board.every((b) => b.cells.every((c) => c.tile === null)), '끝나면 보드에 땅 타일이 없다');
  room.close();
});

test('다른 플레이어와 대전: 참가, 방장만 시작, 빈자리는 봇', () => {
  const { code, token } = createRoom({ name: '방장', size: 5, mode: 'multi', timing: FAST });
  const room = rooms.get(code);
  const guest = room.addHuman('손님');
  assert.equal(room.seats.length, 2);
  assert.notEqual(guest.token, token);
  assert.equal(room.viewFor(room.seatOf(guest.token)).isHost, false);
  room.start();
  assert.equal(room.seats.length, 5);
  assert.equal(room.seats.filter((s) => !s.isBot).length, 2);
  assert.throws(() => room.addHuman('늦은 사람'));
  const v = room.viewFor(room.seatOf(guest.token));
  assert.equal(v.me.index, 1);
  assert.ok(!v.me.tokens.includes(v.me.color), '자기 색 토큰 없음');
  room.close();
});

test('사람의 행동이 HTTP 본문 그대로 처리된다 (인증 토큰과 증언 선택이 섞이지 않음)', async () => {
  const { handleApi } = await import('../src/server/rooms.mjs');
  const { createServer } = await import('node:http');
  const srv = createServer((req, res) => handleApi(req, res, new URL(req.url, 'http://x')));
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const { body: created } = await post('/api/rooms', { name: '사람', size: 4, mode: 'multi' });
  const room = rooms.get(created.code);
  room.timing = { ...room.timing, claimRevealMs: 10, resultMs: 10, botScale: 0.001 };
  await post(`/api/rooms/${created.code}/start`, { token: created.token });
  const seat = room.seatOf(created.token);
  for (let k = 0; k < 2; k++) {
    const r = await post(`/api/rooms/${created.code}/act`, { token: created.token, type: 'claim', plot: 'river' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const t0 = Date.now();
    while (room.game.phase !== (k === 0 ? 'claim' : 'choose') && room.game.phase !== 'whisper' && Date.now() - t0 < 5000) await new Promise((x) => setTimeout(x, 20));
  }
  if (room.game.phase === 'choose' && room.game.questioner === seat) {
    const d = room.game.drawn.find((pi) => room.game.askableSeasons(pi).length);
    await post(`/api/rooms/${created.code}/act`, { token: created.token, type: 'ask', plot: room.game.plots[d].id, season: 1 });
  }
  const t0 = Date.now();
  while (room.game.phase !== 'whisper' && Date.now() - t0 < 5000) await new Promise((x) => setTimeout(x, 20));
  assert.equal(room.game.phase, 'whisper');
  const r = await post(`/api/rooms/${created.code}/act`, { token: created.token, type: 'fist', choice: 'grey' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(room.game.fists?.[seat] ?? room.game.result?.fists[seat], 'grey');
  room.close();
  srv.close();
});
