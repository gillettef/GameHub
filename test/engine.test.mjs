import test from 'node:test';
import assert from 'node:assert/strict';
import { HEDGES, START, hasHedge } from '../src/engine/board.js';
import { createGame, act, viewFor, isCovered, visibleIds, moveError, legalMoves, accusableIds } from '../src/engine/rules.js';
import { chooseAction } from '../src/engine/bot.js';

const P = (id, x, y, facing, extra = {}) => ({ id, x, y, facing, present: true, token: null, moves: { N: 0, E: 0, S: 0, W: 0 }, ...extra });

test('설계도 A: 생울타리 12개, 시작 칸은 모두 생울타리를 향한다', () => {
  assert.equal(HEDGES.size, 24);
  for (const [x, y, d] of START) assert.ok(hasHedge(x, y, d), `${x},${y},${d}`);
});

test('게임 생성: 4인 16개, 3인 12개, 각자 첩자 3 + 중립 1', () => {
  for (const seats of [['N', 'E', 'S', 'W'], ['N', 'E', 'S']]) {
    const st = createGame({ seats, seed: 7 });
    assert.equal(st.pieces.length, seats.length === 4 ? 16 : 12);
    const all = new Set();
    for (const pl of st.players) {
      assert.equal(pl.roster.agents.length, 3);
      for (const id of [...pl.roster.agents, pl.roster.neutral]) all.add(id);
      for (const id of pl.roster.agents) assert.equal(st.pieces[id - 1].crest, pl.seat);
      assert.equal(st.pieces[pl.roster.neutral - 1].crest, 'X');
    }
    assert.equal(all.size, st.pieces.length);
    for (const s of seats) assert.deepEqual(visibleIds(st.pieces, s), [], '시작 시 아무것도 보이지 않는다');
  }
});

test('가림: 바로 앞의 생울타리·정자·손님 말, 멀리 있는 것은 가리지 않는다', () => {
  const pcs = [P(1, 6, 2, 'W'), P(2, 3, 4, 'E'), P(3, 4, 2, 'E'), P(4, 5, 2, 'N'), P(5, 1, 6, 'N'), P(6, 1, 4, 'S')];
  assert.ok(isCovered(pcs, pcs[0]), '생울타리');
  assert.ok(isCovered(pcs, pcs[1]), '정자');
  assert.equal(isCovered(pcs, pcs[2]), true, '바로 앞 e2의 손님 말');
  assert.equal(isCovered(pcs, pcs[4]), false, 'a6 북향: a4의 말은 바로 앞이 아님');
});

test('예시 3: 막던 말을 치우면 드러난다, 그 이동을 동쪽은 할 수 없다', () => {
  const pcs = [P(2, 4, 2, 'E'), P(3, 5, 2, 'E')];
  assert.equal(moveError(pcs, 'S', [], 3, 'N', 1), null);
  assert.match(moveError(pcs, 'E', [], 3, 'N', 1), /새로 드러나는/);
});

test('예시 4: 자기 쪽 이동은 가려질 때만', () => {
  const pcs = [P(2, 4, 2, 'E'), P(11, 5, 6, 'N')];
  assert.equal(moveError(pcs, 'S', [], 2, 'S', 1), null, 'd3에서 정자에 가려짐');
  assert.ok(moveError(pcs, 'S', [], 11, 'S', 1), 'e7에서 남쪽에 드러남');
});

test('초대장 토큰이 올려진 말은 옮길 수 없다', () => {
  const pcs = [P(1, 3, 3, 'N', { token: 0 })];
  assert.match(moveError(pcs, 'S', [], 1, 'S', 1), /초대장/);
});

test('지목은 지금 앉은 좌석을 향한 말에만 (가려져도 가능)', () => {
  const pcs = [P(1, 3, 3, 'N'), P(2, 5, 5, 'W')];
  assert.deepEqual(accusableIds(pcs, 'N', 'N', []), [1]);
  assert.deepEqual(accusableIds(pcs, 'S', 'S', ['W']), [2], '3인: 빈 발코니를 향한 말');
});

test('봇 4인·3인 각 150판이 규칙 위반 없이 끝난다', () => {
  for (const seats of [['N', 'E', 'S', 'W'], ['N', 'E', 'S']]) {
    let contacts = 0, captures = 0;
    for (let g = 0; g < 150; g++) {
      const st = createGame({ seats, seed: 1000 + g });
      let guard = 0;
      while (st.phase !== 'over') {
        const a = chooseAction(viewFor(st, st.turn));
        const err = act(st, st.turn, a);
        assert.equal(err, null, `${JSON.stringify(a)} → ${err}`);
        assert.ok(++guard < 500);
      }
      for (const pl of st.players) { contacts += pl.contacted.length; captures += pl.captured.length; }
    }
    assert.ok(contacts > 0, '접선이 한 번도 없으면 봇이 고장');
    console.log(`${seats.length}인: 게임당 접선 ${(contacts / 150).toFixed(2)}, 포획 ${(captures / 150).toFixed(2)}`);
  }
});

test('화면 정보는 남의 정체를 새지 않는다', () => {
  const st = createGame({ seats: ['N', 'E', 'S', 'W'], seed: 3 });
  const v = viewFor(st, 0);
  const mine = new Set([...v.roster.agents, v.roster.neutral]);
  for (const p of v.pieces) if (!mine.has(p.id)) assert.equal(p.crest, undefined);
  assert.equal(JSON.stringify(v).includes('roster":{"agents":[' + st.players[1].roster.agents.join(',')), false);
});
