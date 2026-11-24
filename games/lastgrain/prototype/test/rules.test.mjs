// 룰북 v0.4 판정 규칙 검사. 실행: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, tick, endTurn, summon, move, attack, moveOptions, attackOptions,
  onBoard, reserve, unitAt, canSummon, legalActions, apply,
} from '../src/rules.js';
import { chooseAction } from '../src/bot.js';

const NO_HANDLE = { handleMs: 0 };
const pick = (s, p, kind) => reserve(s, p).find((u) => u.kind === kind);
// 테스트용 배치: 비축의 모래병을 원하는 칸에 바로 놓는다
function place(s, p, kind, c, r, rem) {
  const u = pick(s, p, kind);
  u.pos = [c, r];
  if (rem !== undefined) u.rem = rem;
  return u;
}

test('준비: 선 0점, 후 2점, 첫 차례는 반드시 소환', () => {
  const s = newGame(NO_HANDLE);
  assert.deepEqual(s.scores, [0, 2]);
  assert.equal(s.active, 0);
  assert.equal(s.mustSummon, true);
  assert.equal(endTurn(s).ok, false, '소환 전에는 차례를 마칠 수 없다');
});

test('소환: 소환 줄 빈 칸에만, 차례당 1번, 소환한 차례에는 행동 불가', () => {
  const s = newGame(NO_HANDLE);
  const u = pick(s, 0, 'scout');
  assert.equal(summon(s, u.id, 2, 1).ok, false, '소환 줄 밖');
  assert.equal(summon(s, u.id, 2, 0).ok, true);
  assert.equal(summon(s, pick(s, 0, 'warrior').id, 3, 0).ok, false, '두 번째 소환');
  assert.equal(moveOptions(s, u.id).length, 0, '소환한 차례에는 행동 불가');
});

test('이동: 정찰병은 빈 칸 2칸까지, 다른 모래병을 지나갈 수 없다', () => {
  const s = newGame(NO_HANDLE);
  const sc = place(s, 0, 'scout', 0, 0);
  place(s, 0, 'warrior', 1, 0);
  s.mustSummon = false;
  const cells = moveOptions(s, sc.id).map((o) => `${o.c},${o.r}`).sort();
  assert.deepEqual(cells, ['0,1', '0,2', '1,1'].sort());
});

test('샘에서 뒤집기: 샘에서 이동을 마칠 때만, 샘에서 출발하면 불가, 거병 불가', () => {
  const s = newGame(NO_HANDLE);
  const w = place(s, 0, 'warrior', 2, 1, 20_000); // C2
  const g = place(s, 0, 'giant', 3, 0, 50_000);   // D1
  s.mustSummon = false;
  const o = moveOptions(s, w.id).find((x) => x.c === 1 && x.r === 1); // B2 샘
  assert.equal(o.canFlip, true);
  assert.equal(move(s, w.id, 1, 1, true).ok, true);
  assert.equal(w.rem, 100_000, '2분 전사 잔량 20초 → 1분 40초');
  assert.equal(moveOptions(s, g.id).find((x) => x.c === 3 && x.r === 1).canFlip, false, '거병');

  const s2 = newGame(NO_HANDLE);
  const sc = place(s2, 0, 'scout', 1, 1, 10_000); // B2 샘에서 출발
  s2.mustSummon = false;
  const toD2 = moveOptions(s2, sc.id).find((x) => x.c === 3 && x.r === 1);
  assert.equal(toD2.canFlip, false, '샘에서 샘으로 곧장 가면 뒤집기 불가');
});

test('강제 뒤집기: 잔량이 역전된다', () => {
  const s = newGame(NO_HANDLE);
  const a = place(s, 0, 'scout', 2, 2);
  const t = place(s, 1, 'warrior', 2, 3, 110_000);
  s.mustSummon = false;
  assert.equal(attack(s, a.id, t.id, 'flip').ok, true);
  assert.equal(t.rem, 10_000);
});

test('밀어내기: 맞은편 칸으로 1칸, 막혀 있으면 불가, 보드 밖이면 소멸', () => {
  const s = newGame(NO_HANDLE);
  const a = place(s, 0, 'warrior', 2, 1);       // C2
  const t = place(s, 1, 'scout', 2, 2, 15_000); // C3
  s.mustSummon = false;
  assert.equal(attack(s, a.id, t.id, 'push').ok, true);
  assert.deepEqual(t.pos, [2, 3], 'C3 → C4');

  const s2 = newGame(NO_HANDLE);
  const a2 = place(s2, 0, 'warrior', 0, 1);   // A2
  const t2 = place(s2, 1, 'warrior', 0, 2);   // A3
  place(s2, 1, 'scout', 0, 3);                // A4가 받침
  const a3 = place(s2, 0, 'scout', 1, 2);     // B3
  s2.mustSummon = false;
  const opt = attackOptions(s2, a2.id).find((o) => o.targetId === t2.id);
  assert.equal(opt.canPush, false, '뒤 칸이 막혀 있다');
  assert.equal(attack(s2, a3.id, t2.id, 'push').ok, true, '옆에서는 보드 밖으로 밀 수 있다');
  assert.equal(t2.pos, null, '보드 밖으로 밀리면 소멸');
  assert.ok(reserve(s2, 1).includes(t2), '비축으로 돌아간다');
});

test('소멸: 활성 플레이어의 모래만 흐르고, 소멸한 모래병은 그 차례에 다시 소환할 수 없다', () => {
  const s = newGame(NO_HANDLE);
  const mine = place(s, 0, 'scout', 0, 0, 5_000);
  const theirs = place(s, 1, 'scout', 4, 4, 5_000);
  s.mustSummon = false;
  tick(s, 6_000);
  assert.equal(mine.pos, null, '내 모래병 소멸');
  assert.equal(theirs.rem, 5_000, '눕힌 상대 모래는 흐르지 않는다');
  assert.equal(s.mustSummon, true, '보드가 비면 반드시 소환');
  assert.equal(summon(s, mine.id, 0, 0).ok, false, '방금 소멸한 모래병은 소환 불가');
  assert.equal(summon(s, pick(s, 0, 'warrior').id, 0, 0).ok, true);
});

test('소환 뒤 보드가 비면 차례가 즉시 끝난다', () => {
  const s = newGame(NO_HANDLE);
  const u = pick(s, 0, 'scout');
  summon(s, u.id, 0, 0);
  tick(s, 61_000);
  assert.equal(s.active, 1, '후 플레이어 차례로 넘어갔다');
});

test('점수: 차례 시작 시 자기 모래병이 놓인 유적마다 1점, 목표 점수면 즉시 승리', () => {
  const s = newGame({ ...NO_HANDLE, target: 5 });
  place(s, 0, 'warrior', 0, 2);
  place(s, 0, 'scout', 2, 2);
  s.mustSummon = false;
  s.scores[0] = 3;
  endTurn(s); // 후 차례
  summon(s, pick(s, 1, 'scout').id, 0, 4);
  endTurn(s); // 선 차례 시작 → 2점
  assert.equal(s.scores[0], 5);
  assert.equal(s.over, true);
  assert.equal(s.winner, 0);
});

test('대모래시계: 선 차례 뒤에 끝나면 후가 마지막 차례를 하고 마지막 점수 계산', () => {
  const s = newGame({ ...NO_HANDLE, greatMs: 1_000 });
  summon(s, pick(s, 0, 'scout').id, 0, 0);
  tick(s, 2_000);
  endTurn(s);
  assert.equal(s.over, false);
  assert.equal(s.active, 1);
  assert.equal(s.finalTurn, true);
  summon(s, pick(s, 1, 'warrior').id, 0, 4);
  endTurn(s);
  assert.equal(s.over, true);
  assert.equal(s.endReason, 'time');
  assert.equal(s.winner, 1, '0 : 2 → 후 승리');
});

test('동점이면 보드 위 모래병 수, 그것도 같으면 선 플레이어 승', () => {
  const s = newGame({ ...NO_HANDLE, greatMs: 1, handicap: 0 });
  summon(s, pick(s, 0, 'scout').id, 0, 0);
  tick(s, 10);
  endTurn(s);
  summon(s, pick(s, 1, 'scout').id, 0, 4);
  endTurn(s);
  assert.equal(s.winner, 0);
});

test('조작 시간: 세우기·눕히기마다 모래시계 하나당 handleMs만큼 흐른다', () => {
  const s = newGame({ handleMs: 1000 });
  const u = pick(s, 0, 'scout');
  summon(s, u.id, 0, 0);
  endTurn(s); // 눕히기 -1초
  assert.equal(u.rem, 59_000);
});

test('legalActions의 모든 행동은 적용할 수 있다', () => {
  const s = newGame(NO_HANDLE);
  place(s, 0, 'warrior', 2, 1);
  place(s, 0, 'scout', 1, 2);
  place(s, 1, 'scout', 2, 2, 20_000);
  s.mustSummon = false;
  for (const a of legalActions(s)) {
    const t = JSON.parse(JSON.stringify(s));
    assert.equal(apply(t, a).ok, true, JSON.stringify(a));
  }
});

test('봇끼리 한 판을 끝까지 둔다 (가상 시간)', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const s = newGame({ greatMs: 6 * 60_000, target: 25 });
  let guard = 0;
  while (!s.over && guard++ < 5000) {
    tick(s, 1500); // 행동 하나 고르는 데 1.5초
    if (s.over) break;
    const a = chooseAction(s, 'normal', rand);
    const res = apply(s, a);
    assert.ok(res === undefined || res.ok !== false, `거부된 행동: ${JSON.stringify(a)} ${res && res.error}`);
  }
  assert.equal(s.over, true, '게임이 끝나야 한다');
  assert.ok([0, 1].includes(s.winner));
});
