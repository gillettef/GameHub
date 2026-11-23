// 온라인 방: 입장, 시작, 정보 숨김, 차례 검증, 봇 진행, 추리, 결과, 대리 진행
import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomHub } from '../src/rooms.js';
import { legalActions } from '../src/engine.js';

/** 타이머를 직접 돌리는 허브 */
function makeHub() {
  const queue = [];
  let t = 0;
  let k = 0;
  const hub = new RoomHub({
    schedule: (fn) => { queue.push(fn); return queue.length; },
    now: () => t,
    token: () => `tok${++k}`,
    random: (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(),
  });
  const flush = () => { while (queue.length) queue.shift()(); };
  return { hub, flush, advance: (ms) => { t += ms; } };
}

test('방 만들기·입장·인원 설정·시작', () => {
  const { hub } = makeHub();
  const a = hub.createRoom('철수');
  const b = hub.join(a.code, '영희');
  assert.equal(a.code.length, 4);
  assert.throws(() => hub.configure(a.code, b.token, { players: 3 }), /방장/);
  hub.configure(a.code, a.token, { players: 3 });
  hub.start(a.code, a.token);
  const va = hub.view(a.code, a.token);
  assert.equal(va.phase, 'play');
  assert.equal(va.names.length, 3);
  assert.equal(va.seatBots.filter(Boolean).length, 1);
  assert.throws(() => hub.join(a.code, '민수'), /이미 시작/);
});

test('정보 숨김: 남의 손패와 비밀 목표는 보내지 않는다', () => {
  const { hub } = makeHub();
  const a = hub.createRoom('철수');
  const b = hub.join(a.code, '영희');
  hub.start(a.code, a.token);
  const va = hub.view(a.code, a.token);
  const vb = hub.view(a.code, b.token);
  assert.equal(va.hand.length, 4);
  assert.notDeepEqual(va.hand, vb.hand);
  assert.ok(va.motive && vb.motive && va.motive !== vb.motive);
  const json = JSON.stringify(va);
  for (const id of vb.hand) assert.ok(!va.hand.includes(id) && !json.includes(`"hand":["${id}`));
  assert.equal(va.motives, undefined);
  assert.equal(va.deck, undefined);
  assert.equal(va.result, null);
});

test('사람 2 + 봇 2: 끝까지 진행하고 추리 후 결과가 나온다', () => {
  const { hub, flush } = makeHub();
  const a = hub.createRoom('철수');
  const b = hub.join(a.code, '영희');
  hub.configure(a.code, a.token, { players: 4 });
  hub.start(a.code, a.token);
  const tokens = [a.token, b.token];
  for (let guard = 0; guard < 500; guard++) {
    flush();
    const room = hub.get(a.code);
    if (room.phase !== 'play') break;
    const seat = room.g.current;
    const tok = room.seats[seat].token;
    assert.ok(tokens.includes(tok), '봇 차례는 flush 로 진행된다');
    const other = tokens.find((t) => t !== tok);
    assert.throws(() => hub.act(a.code, other, { type: 'pass' }), /차례가 아닙니다/);
    const acts = legalActions(room.g);
    hub.act(a.code, tok, acts.find((x) => x.type === 'place') ?? acts[0]);
  }
  assert.equal(hub.get(a.code).phase, 'guess');
  const va = hub.view(a.code, a.token);
  const vb = hub.view(a.code, b.token);
  const pick = (v) => {
    const others = v.names.map((_, q) => q).filter((q) => q !== v.seat);
    const figs = ['하인', '왕비', '대신', '경비대장', '궁정 의사', '광대'].filter((f) => f !== v.motive);
    return Object.fromEntries(others.map((q, i) => [q, figs[i]]));
  };
  assert.throws(() => hub.guess(a.code, a.token, { 0: '하인' }), /골라/);
  hub.guess(a.code, a.token, pick(va));
  assert.equal(hub.get(a.code).phase, 'guess');
  hub.guess(a.code, b.token, pick(vb));
  const res = hub.view(a.code, a.token);
  assert.equal(res.phase, 'result');
  assert.equal(res.result.rows.length, 4);
  assert.equal(res.result.motives.length, 4);
  hub.rematch(a.code, a.token);
  assert.equal(hub.view(a.code, b.token).phase, 'lobby');
});

test('자리를 비우면 45초 뒤 봇에게 넘기고, 돌아오면 되찾는다', () => {
  const { hub, flush, advance } = makeHub();
  const a = hub.createRoom('철수');
  const b = hub.join(a.code, '영희');
  hub.configure(a.code, a.token, { players: 3 });
  hub.start(a.code, a.token);
  flush();
  const room = hub.get(a.code);
  const seat = room.g.current;
  const idleTok = room.seats[seat].token;
  const other = idleTok === a.token ? b.token : a.token;
  assert.throws(() => hub.takeover(a.code, other), /초가 지나야/);
  advance(46_000);
  hub.takeover(a.code, other);
  assert.equal(hub.view(a.code, other).seatBots[seat], true);
  hub.join(a.code, '돌아옴', idleTok);
  assert.equal(hub.view(a.code, other).seatBots[seat], false);
});
