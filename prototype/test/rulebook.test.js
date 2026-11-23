// 룰북 v0.2 의 예시를 그대로 옮긴 테스트. 룰북 예시를 바꾸면 여기도 바꾼다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARDS, stateAt, illegalReason, cascade, decisiveCause, isUnresolved, newGame, applyAction, finalScore,
} from '../src/engine.js';

const ID = Object.fromEntries(CARDS.map((c) => [c.title, c.id]));
/** 룰북식 칸 번호(1부터)로 시간선을 만든다 */
function tl(size, placed) {
  const t = Array(size).fill(null);
  for (const [slot, title] of Object.entries(placed)) {
    assert.ok(ID[title], `카드 없음: ${title}`);
    t[Number(slot) - 1] = ID[title];
  }
  return t;
}
const E = (subject, state) => ({ subject, state });

test('5.1 왼쪽 최근 사실 규칙', () => {
  const t = tl(12, { 1: '수면초 넣은 술', 4: '기상 나팔' });
  assert.equal(stateAt(t, 0, '경비'), '깨어 있음'); // 칸 1
  for (const s of [1, 2, 3]) assert.equal(stateAt(t, s, '경비'), '잠듦'); // 칸 2~4
  assert.equal(stateAt(t, 4, '경비'), '깨어 있음'); // 칸 5
});

test('5.2 금지 배치 1: 조건이 거짓', () => {
  const t = tl(12, {});
  assert.equal(illegalReason(t, ID['열쇠 훔치기'], 1, []), 'condition');
});

test('5.2 금지 배치 2: 결말과 다른 가장 오른쪽 결과', () => {
  const endings = [E('성', '불탐')];
  const t = tl(12, {});
  for (let s = 0; s < 12; s++) assert.equal(illegalReason(t, ID['보수 공사'], s, endings), 'ending');
  const t2 = tl(12, { 8: '엎어진 촛대' });
  assert.equal(illegalReason(t2, ID['보수 공사'], 6, endings), null); // 칸 7
  assert.equal(illegalReason(t2, ID['보수 공사'], 8, endings), 'ending'); // 칸 9
});

test('6.2 조건 모순 연쇄', () => {
  const endings = [E('성', '불탐'), E('왕', '중독'), E('금고', '빔')];
  const t = tl(12, { 2: '수면초 넣은 술', 4: '기상 나팔', 5: '열쇠 훔치기', 7: '보석 반출' });
  const r = cascade(t, endings);
  assert.deepEqual(r.removed.map((x) => [x.slot + 1, x.kind]), [[5, 'condition'], [7, 'condition']]);
  assert.equal(isUnresolved(r.timeline, E('금고', '빔')), true); // 진행 중에는 모순이 아니고, 종료 시 미해결
});

test('6.2 결말 모순 연쇄', () => {
  const endings = [E('금고', '빔')];
  const before = tl(12, { 1: '수면초 넣은 술', 2: '열쇠 훔치기', 3: '지참금 입고', 6: '보석 반출' });
  assert.equal(cascade(before, endings).removed.length, 0); // 놓기 전에는 모순 없음
  assert.equal(illegalReason(before, ID['장난삼아 잠금'], 4, endings), null);
  const t = [...before];
  t[4] = ID['장난삼아 잠금'];
  const r = cascade(t, endings);
  assert.deepEqual(r.removed.map((x) => [x.slot + 1, x.kind]), [[6, 'condition'], [3, 'ending']]);
});

test('7.1 결정 원인: 조건 있는 카드 중 가장 오른쪽', () => {
  const ending = E('성', '불탐');
  const t = tl(12, { 7: '엎어진 촛대', 10: '분노의 횃불', 12: '불꽃놀이' });
  assert.equal(decisiveCause(t, ending).slot + 1, 12);
  // 불꽃놀이가 버려지면 분노의 횃불이 이어받는다
  const t2 = [...t];
  t2[11] = null;
  assert.equal(decisiveCause(t2, ending).slot + 1, 10);
  // 조건 없는 카드만 있으면 결정 원인이 없다
  assert.equal(decisiveCause(tl(12, { 7: '엎어진 촛대' }), ending), null);
});

test('9 FAQ 연쇄 탈취', () => {
  const endings = [E('성', '멀쩡')];
  const t = tl(12, { 5: '엎어진 촛대', 9: '소화 지휘', 12: '보수 공사' });
  assert.equal(decisiveCause(t, endings[0]).cardId, ID['소화 지휘']);
  assert.equal(illegalReason(t, ID['물동이 행렬'], 6, endings), null);
  const t2 = [...t];
  t2[6] = ID['물동이 행렬'];
  const r = cascade(t2, endings);
  assert.deepEqual(r.removed.map((x) => x.cardId), [ID['소화 지휘']]);
  assert.equal(decisiveCause(r.timeline, endings[0]).cardId, ID['물동이 행렬']);
});

test('8.2 시작 상태와 같은 결말은 결과가 없어도 미해결이 아니다', () => {
  assert.equal(isUnresolved(tl(12, {}), E('왕', '건강')), false);
  assert.equal(isUnresolved(tl(12, {}), E('왕', '중독')), true);
});

test('8.3 득점 예시: 하인 6점', () => {
  const endings = [E('성', '불탐'), E('왕', '건강'), E('금고', '빔')];
  const g = newGame({ names: ['나', 'B', 'C'], seed: 1, endings, motives: ['하인', '왕비', '대신'] });
  // 하인 카드 3장(결정 원인 포함): 수면초(경비 잠듦) → 몰래 빼돌리기(금고 빔, 조건) + 엎어진 촛대
  g.timeline = tl(9, { 1: '수면초 넣은 술', 3: '몰래 빼돌리기', 5: '엎어진 촛대' });
  g.paradox[0] = 1;
  const s = finalScore(g, [{ 1: '왕비', 2: '대신' }, {}, {}]);
  // 결정 원인: 금고=빔 → 몰래 빼돌리기(하인). 성=불탐 → 조건 있는 카드 없음
  assert.equal(s.rows[0].decisive, 1);
  assert.equal(s.rows[0].cards, 3);
  assert.equal(s.rows[0].correct, 2);
  assert.equal(s.rows[0].total, 6);
});

test('8.1 종료 라운드: 모두 같은 횟수의 차례', () => {
  let g = newGame({ names: ['A', 'B', 'C', 'D'], seed: 7 });
  // 덱을 거의 비워 2번 자리 차례에 종료가 시작되게 한다
  g.deck = g.deck.slice(0, 2);
  g = applyAction(g, { type: 'exchange', cardId: g.hands[0][0] });
  g = applyAction(g, { type: 'exchange', cardId: g.hands[1][0] });
  assert.equal(g.finalRound, true);
  assert.equal(g.over, false);
  g = applyAction(g, { type: 'pass' });
  g = applyAction(g, { type: 'pass' });
  assert.equal(g.over, true);
  assert.deepEqual(g.turns, [1, 1, 1, 1]);
});
