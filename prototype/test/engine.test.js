// 구성물 문서와 카드 데이터 일치, 봇 대전 불변식 검사
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARDS, FIGURES, newGame, applyAction, cascade, legalActions, finalScore } from '../src/engine.js';
import { chooseAction, guessMotives, BOT_STYLES } from '../src/bots.js';
import { makeRng } from '../src/engine.js';

test('카드 데이터가 components/components.md 표와 일치한다', () => {
  const md = readFileSync(new URL('../../components/components.md', import.meta.url), 'utf8');
  const rows = md.split('\n').filter((l) => /^\| C\d\d /.test(l));
  assert.equal(rows.length, 60);
  for (const row of rows) {
    const [id, title, figure, cond, effect] = row.split('|').slice(1, 6).map((s) => s.trim());
    const c = CARDS.find((x) => x.id === id);
    assert.ok(c, id);
    assert.equal(c.title, title, id);
    assert.equal(c.figure, figure, id);
    assert.equal(c.cond ? `${c.cond.subject} = ${c.cond.state}` : '—', cond, id);
    assert.equal(`${c.effect.subject} = ${c.effect.state}`, effect, id);
  }
});

test('인물 대칭: 인물마다 사실 10개에 1장씩, 무조건 3장', () => {
  for (const f of FIGURES) {
    const mine = CARDS.filter((c) => c.figure === f);
    assert.equal(mine.length, 10);
    assert.equal(new Set(mine.map((c) => `${c.effect.subject}=${c.effect.state}`)).size, 10);
    assert.equal(mine.filter((c) => !c.cond).length, 3);
  }
});

test('봇 대전 300판: 시간선은 늘 모순이 없고, 게임은 끝나며, 차례 수가 같다', () => {
  const styles = Object.values(BOT_STYLES);
  for (let seed = 1; seed <= 300; seed++) {
    const n = 3 + (seed % 3);
    let g = newGame({ names: Array.from({ length: n }, (_, i) => `P${i}`), seed });
    const rng = makeRng(seed * 31);
    let guard = 0;
    while (!g.over) {
      const acts = legalActions(g);
      assert.ok(acts.length > 0, `행동 없음 seed=${seed}`);
      g = applyAction(g, chooseAction(g, styles[(g.current + seed) % styles.length], rng));
      assert.equal(cascade(g.timeline, g.endings).removed.length, 0, `모순 남음 seed=${seed}`);
      assert.ok(++guard < 400);
    }
    assert.ok(g.turns.every((t) => t === g.turns[0]), `차례 수 불일치 seed=${seed}`);
    const guesses = g.names.map((_, p) => guessMotives(g, p));
    const s = finalScore(g, guesses);
    assert.equal(s.rows.length, n);
    assert.ok(s.winners.length >= 1);
  }
});
