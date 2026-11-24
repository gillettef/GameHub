import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../prototype/engine.js';
import { chooseTurn } from '../prototype/bot.js';
import { RULES } from '../prototype/rules-config.js';
import { createRooms } from '../scripts/aws/rooms.mjs';

// 가짜 타이머: 예약된 함수를 직접 실행한다
function fakeTimers() {
  const queue = [];
  return {
    queue,
    setTimeout: (fn) => { const h = { fn }; queue.push(h); return h; },
    clearTimeout: (h) => { const i = queue.indexOf(h); if (i >= 0) queue.splice(i, 1); },
    flush(max = 5000) { let k = 0; while (queue.length && k++ < max) queue.shift().fn(); return k; },
  };
}
const fakeRes = () => ({ out: [], write(s) { this.out.push(s); } });
const lastSnap = (res) => JSON.parse(res.out.at(-1).replace(/^data: /, ''));

test('방 만들기, 참가, 시작, 내 차례 아닌 행동 거부', () => {
  const timers = fakeTimers();
  const R = createRooms({ engine, chooseTurn, RULES, timers });
  const host = R.create({ n: 2, name: '가람' });
  assert.match(host.code, /^[A-Z]{4}$/);
  const guest = R.join(host.code, { name: '나래' });
  assert.equal(guest.seat, 1);
  assert.throws(() => R.join(host.code, { name: '셋째' }), /빈자리/);
  assert.throws(() => R.start(host.code, guest.token), /방장/);
  R.start(host.code, host.token);
  assert.throws(() => R.act(host.code, guest.token, { type: 'end' }), /내 차례/);
  assert.throws(() => R.act(host.code, host.token, { type: 'step', to: [8, 4] }), /갈 수 없는/);
  R.act(host.code, host.token, { type: 'step', to: [0, 1] });
  R.act(host.code, host.token, { type: 'end' });
  const snap = R.snapshot(host.code, guest.token);
  assert.equal(snap.view.current, 1);
  assert.equal(snap.you, 1);
});

test('빈자리는 봇으로 채워지고, 봇만 남은 차례는 서버가 진행한다', () => {
  const timers = fakeTimers();
  const R = createRooms({ engine, chooseTurn, RULES, timers });
  const host = R.create({ n: 4, name: '가람', bots: [false, true, false, true] });
  const res = fakeRes();
  R.subscribe(host.code, host.token, res);
  R.start(host.code, host.token);
  R.act(host.code, host.token, { type: 'end' });
  timers.flush(200);
  const snap = lastSnap(res);
  assert.equal(snap.seats[2].kind, 'bot', '빈자리 → 봇');
  assert.equal(snap.view.current, 0, '봇 3명이 차례를 마치고 다시 방장 차례');
  assert.ok(snap.log.some((l) => l.text.includes('봇 2')));
});

test('연결이 끊긴 사람의 차례는 봇이 대신 진행한다', () => {
  const timers = fakeTimers();
  const R = createRooms({ engine, chooseTurn, RULES, timers });
  const host = R.create({ n: 2, name: '가람' });
  R.join(host.code, { name: '나래' });
  const res = fakeRes();
  const off = R.subscribe(host.code, host.token, res);
  R.start(host.code, host.token);
  R.act(host.code, host.token, { type: 'end' });
  // 나래는 접속하지 않았으므로 대리 진행 타이머가 걸린다
  timers.flush(50);
  assert.equal(lastSnap(res).view.current, 0);
  assert.ok(lastSnap(res).log.some((l) => l.text.includes('(대리)')));
  off();
});

test('봇만으로 한 판을 끝까지 진행할 수 있다', () => {
  const timers = fakeTimers();
  const R = createRooms({ engine, chooseTurn, RULES, timers });
  const host = R.create({ n: 3, name: '관전', bots: [false, true, true] });
  const res = fakeRes();
  const off = R.subscribe(host.code, host.token, res);
  off(); // 방장도 자리를 비우면 모두 봇처럼 진행된다
  R.start(host.code, host.token);
  timers.flush(20000);
  const snap = R.snapshot(host.code);
  assert.equal(snap.status, 'over');
  assert.ok(snap.view.winners.length >= 1);
});

test('이름은 길이와 제어 문자를 정리한다', () => {
  const R = createRooms({ engine, chooseTurn, RULES, timers: fakeTimers() });
  const host = R.create({ n: 2, name: '<script>아주아주아주아주긴이름입니다' });
  const snap = R.snapshot(host.code, host.token);
  assert.ok(!snap.seats[0].name.includes('<'));
  assert.ok(snap.seats[0].name.length <= 12);
});
