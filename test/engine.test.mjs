import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, RuleError } from '../src/engine/game.js';
import { BotBrain, PERSONA_IDS } from '../src/engine/bot.js';
import { plotsFor, questionsFor, GREY, EMPTY } from '../src/engine/rules.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isBot: true, persona: PERSONA_IDS[i % 4] }));

/** 봇만으로 한 판을 끝까지 돌린다 (가상 시계) */
function playOut(n, seed) {
  const g = new Game({ players: players(n), seed });
  const brains = g.players.map((p, i) => new BotBrain(g, i, p.persona, seed + i));
  g.hooks.onForget = (s, col) => brains.forEach((b) => b.onForget(s, col));
  let now = 0;
  let questions = 0;
  g.start(now);
  for (let step = 0; step < 5000 && g.phase !== 'ended'; step++) {
    now += 1000;
    if (g.phase === 'claim') brains.forEach((b, i) => g.phase === 'claim' && g.claim(i, b.chooseClaim(), now));
    else if (g.phase === 'choose') { const q = brains[g.questioner].chooseQuestion(); g.ask(g.questioner, q.plot, q.season, now); questions++; }
    else if (g.phase === 'whisper') {
      brains.forEach((b, i) => { const a = b.assertion(); if (a) g.say(i, a.text, now, a.answer ? { answer: a.answer } : null); });
      brains.forEach((b, i) => g.phase === 'whisper' && g.fist(i, b.testimony(), now));
    } else g.tick(now + 60_000);
  }
  return { g, questions };
}

test('인원별 구역 수와 질문 수', () => {
  assert.equal(plotsFor(4).length, 5);
  assert.equal(plotsFor(5).length, 6);
  assert.equal(plotsFor(6).length, 7);
  const total = (n) => [2, 3, 4, 5, 6, 7].reduce((a, s) => a + questionsFor(n, s), 0) + questionsFor(n, 'final');
  assert.equal(total(4), 16);
  assert.equal(total(5), 15);
  assert.equal(total(6), 12);
});

test('점유: 겹치면 다툼, 혼자면 땅 타일', () => {
  const g = new Game({ players: players(4), seed: 1 });
  g.start(0);
  g.claim(0, 'river', 0); g.claim(1, 'river', 0); g.claim(2, 'harbor', 0); g.claim(3, 'bamboo', 0);
  assert.equal(g.phase, 'claimResult');
  assert.deepEqual(g.claimReveal.feuds, ['river']);
  const v = g.view(0, 0);
  const cell = (id) => v.board.find((b) => b.id === id).cells[0].tile;
  assert.equal(cell('river'), null);
  assert.equal(cell('harbor'), 'yellow');
  assert.equal(cell('bamboo'), 'green');
  assert.throws(() => g.claim(0, 'salt', 0), RuleError);
});

test('망각: 엔진에서도 진실이 지워지고 보기에도 나오지 않는다', () => {
  const g = new Game({ players: players(4), seed: 2 });
  let seen = null;
  g.hooks.onForget = (s, col) => { seen = { s, col }; };
  g.start(0);
  ['river', 'harbor', 'salt', 'hill'].forEach((p, i) => g.claim(i, p, 0));
  g.tick(10_000); // 1계절 결과 → 2계절 점유
  assert.equal(g.phase, 'claim');
  assert.equal(g.view(0, 10_000).board[0].cells[0].tile, 'red', '점유 중에는 직전 열이 보인다');
  ['river', 'harbor', 'salt', 'hill'].forEach((p, i) => g.claim(i, p, 10_000));
  g.tick(20_000); // 2계절 결과 → 1계절 망각 → 회의
  assert.equal(seen.s, 1);
  assert.equal(g.forgotten, 1);
  assert.ok(g.truth.every((row) => row[1] === undefined), '엔진의 진실도 지워짐');
  const v = g.view(0, 20_000);
  assert.ok(v.board.every((b) => b.cells[0].tile === null && b.cells[0].forgotten));
  assert.equal(JSON.stringify(v).includes('"tile":"red"'), true, '이번 계절 열은 보인다');
  assert.equal(g.phase, 'choose');
});

test('질문 칸 선언 전에는 말할 수 없다', () => {
  const { g } = (() => {
    const g = new Game({ players: players(4), seed: 3 });
    g.start(0);
    for (let k = 0; k < 2; k++) { ['river', 'harbor', 'salt', 'hill'].forEach((p, i) => g.claim(i, p, 0)); g.tick(1e9 * (k + 1)); }
    return { g };
  })();
  assert.equal(g.phase, 'choose');
  assert.throws(() => g.say(0, '강가 물어 줘', 0), RuleError);
});

test('자기 집안 색 증언은 낼 수 없다', () => {
  const g = new Game({ players: players(4), seed: 4 });
  assert.ok(!g.allowedTokens(0).includes('red'));
  assert.ok(g.allowedTokens(0).includes(GREY));
  assert.ok(g.allowedTokens(0).includes(EMPTY));
});

test('집계: 룰북 6-4 예시', () => {
  const T = Game.tally;
  assert.equal(T(['blue', 'blue', 'red', 'yellow', GREY], 0).official, 'blue');
  assert.equal(T([GREY, GREY, GREY, 'blue', 'blue'], 0).official, GREY);
  assert.equal(T(['blue', 'blue', 'yellow', 'yellow'], 0).official, 'blue', '동점, 질문자(0)가 파랑');
  assert.equal(T([GREY, 'blue', 'blue', 'yellow', 'yellow'], 0).official, null, '동점, 질문자 답이 동점 밖');
  assert.equal(T([EMPTY, 'blue', 'yellow', EMPTY], 0).official, null, '질문자 빈 주먹');
  assert.equal(T(['green', 'blue', 'yellow', GREY], 0).official, 'green', '전원 다른 답');
  assert.equal(T([EMPTY, EMPTY, EMPTY, EMPTY], 0).official, null, '유효 증언 없음');
});

test('득점: 주인 구역 값 + 일치한 증언자 평판', () => {
  const g = new Game({ players: players(4), seed: 5 });
  g.start(0);
  for (let k = 0; k < 2; k++) { ['river', 'harbor', 'salt', 'hill'].forEach((p, i) => g.claim(i, p, 0)); g.tick(1e9 * (k + 1)); }
  const pi = g.drawn.find((d) => g.askableSeasons(d).length);
  g.ask(g.questioner, g.plots[pi].id, 1, 0);
  const owner = 0;
  const others = [1, 2, 3];
  g.fist(owner, EMPTY, 0);
  others.forEach((i) => g.fist(i, 'red', 0));
  assert.equal(g.phase, 'result');
  assert.equal(g.result.official, 'red');
  assert.equal(g.players[0].score, g.plots[pi].value);
  others.forEach((i) => assert.equal(g.players[i].score, 1));
});

for (const n of [4, 5, 6]) {
  test(`봇 ${n}인 한 판이 끝까지 진행된다`, () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { g, questions } = playOut(n, seed * 97);
      assert.equal(g.phase, 'ended');
      assert.equal(questions, { 4: 16, 5: 15, 6: 12 }[n]);
      assert.equal(g.forgotten, 7);
      assert.ok(g.truth.every((row) => row.every((t) => t === undefined)), '끝나면 진실은 하나도 남지 않는다');
    }
  });
}
