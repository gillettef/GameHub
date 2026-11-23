// 룰북 3장 표의 수치가 엔진 확정 수치(rules-config.js)와 같은지 검사한다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES } from '../prototype/rules-config.js';
import { cellName } from '../prototype/engine.js';

const book = readFileSync(new URL('../rules/rulebook.md', import.meta.url), 'utf8');

test('룰북 준비 표의 목표 점수와 닻 칸이 엔진과 같다', () => {
  for (const n of [2, 3, 4]) {
    const row = book.split('\n').find((l) => l.startsWith(`| ${n}인 |`));
    assert.ok(row, `${n}인 행이 없다`);
    const cells = row.split('|').map((x) => x.trim()).filter(Boolean);
    assert.equal(Number(cells[1]), RULES.target[n], `${n}인 목표 점수`);
    const anchors = RULES.anchors[n].map(([c, r]) => cellName(c, r));
    assert.deepEqual(cells.slice(2, 2 + n), anchors, `${n}인 닻 칸`);
  }
});

test('룰북의 걸음 수·들 수 있는 조각·초기 조각 수가 엔진과 같다', () => {
  assert.ok(book.includes(`최대 ${RULES.moveSteps}**걸음**`), '걸음 수');
  assert.ok(book.includes(`최대 ${RULES.carryLimit}개까지 들고`), '들 수 있는 조각');
  for (const n of [2, 3, 4]) assert.equal(RULES.initialShards[n], 6);
  assert.match(book, /별똥별 카드를 6장 뒤집어/);
  assert.equal(RULES.spawnPerTurn, 1);
  assert.equal(RULES.endMode, 'round');
});
