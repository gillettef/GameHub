import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  physPos, isCoveredCol, visibleLayout, neighbors, foldActions, validFold, distTable, key,
  newGame, playTurn, winners, COL_NAMES,
} from '../prototype/engine.js';
import { chooseTurn } from '../prototype/bot.js';
import { runGame } from '../prototype/sim.js';
import { RULES } from '../prototype/rules-config.js';

const layoutNames = (fold) => visibleLayout(fold).map((v) => COL_NAMES[v.col] + (v.flipped ? "'" : '')).join(' ');

test('펼친 보드는 A~I 순서로 보인다', () => {
  assert.equal(layoutNames({ L: 0, R: 0 }), 'A B C D E F G H I');
});

test('왼쪽 3열 접기: A~C가 뒤집혀 D~F를 덮고 A가 G와 이웃한다', () => {
  const f = { L: 3, R: 0 };
  assert.equal(layoutNames(f), "C' B' A' G H I");
  assert.deepEqual([3, 4, 5].map((c) => isCoveredCol(f, c)), [true, true, true]);
  assert.equal(physPos(f, 0), 5);
  assert.ok(neighbors(f, 0, 2).some(([c, r]) => c === 6 && r === 2), 'A3과 G3은 이웃');
});

test('오른쪽 1열 접기: I가 H를 덮고 G와 이웃한다', () => {
  const f = { L: 0, R: 1 };
  assert.equal(layoutNames(f), "A B C D E F G I'");
  assert.ok(isCoveredCol(f, 7));
});

test('양쪽 2열 접기: B A E I H만 보인다', () => {
  assert.equal(layoutNames({ L: 2, R: 2 }), "B' A' E I' H'");
});

test('양쪽 접기 폭의 합은 4를 넘을 수 없다', () => {
  assert.ok(validFold(1, 3));
  assert.ok(!validFold(2, 3));
  const acts = foldActions({ L: 3, R: 0 });
  assert.deepEqual(acts.filter((a) => a.type === 'fold').map((a) => a.width), [1]);
});

test('모서리 대각선 거리: 펼침 12, 양쪽 2열 접기 6', () => {
  assert.equal(distTable({ L: 0, R: 0 })[key(0, 0)][key(8, 4)], 12);
  assert.equal(distTable({ L: 2, R: 2 })[key(0, 0)][key(8, 4)], 6);
});

test('부재 중인 길잡이는 이동할 수 없고, 가려진 조각은 주울 수 없다', () => {
  const s = newGame(2, 3);
  s.shards.clear();
  s.players[0].c = 4; s.players[0].r = 2; // E3
  s.shards.set(key(4, 1), 1);
  s.current = 1;
  playTurn(s, [{ type: 'fold', side: 'L', width: 3 }]);
  assert.ok(isCoveredCol(s.fold, 4));
  assert.throws(() => playTurn(s, [{ type: 'step', to: [4, 1] }]));
  // 펼치면 바로 돌아와 이동하고 줍는다
  playTurn(s, [{ type: 'unfold', side: 'L' }, { type: 'step', to: [4, 1] }]);
  assert.equal(s.players[0].carried, 1);
});

test('접기 펼치기는 차례에 한 번, 걸음은 3까지', () => {
  const s = newGame(2, 5);
  assert.throws(() => playTurn(s, [{ type: 'fold', side: 'L', width: 1 }, { type: 'unfold', side: 'L' }]));
  const s2 = newGame(2, 5);
  assert.throws(() => playTurn(s2, [
    { type: 'step', to: [0, 1] }, { type: 'step', to: [0, 2] }, { type: 'step', to: [0, 3] }, { type: 'step', to: [0, 4] },
  ]));
});

test('닻 칸에 들어가면 들고 있던 조각이 점수가 된다', () => {
  const s = newGame(2, 9);
  s.shards.clear();
  s.players[0].carried = 2; s.players[0].c = 0; s.players[0].r = 1;
  playTurn(s, [{ type: 'step', to: [0, 0] }]);
  assert.equal(s.players[0].score, 2);
  assert.equal(s.players[0].carried, 0);
});

test('동점은 들고 있는 조각으로, 그래도 같으면 공동 승리', () => {
  const s = newGame(2, 1);
  s.players[0].score = 5; s.players[1].score = 5;
  assert.deepEqual(winners(s), [0, 1]);
  s.players[1].carried = 1;
  assert.deepEqual(winners(s), [1]);
});

test('봇은 항상 규칙상 가능한 차례를 고르고 게임이 끝난다', () => {
  for (const n of [2, 3, 4]) {
    for (let seed = 1; seed <= 15; seed++) {
      const r = runGame(n, seed, RULES, ['balanced']);
      assert.equal(r.timeout, false);
    }
  }
  const s = newGame(3, 2, RULES);
  assert.doesNotThrow(() => playTurn(s, chooseTurn(s, 'balanced', () => 0.5)));
});
