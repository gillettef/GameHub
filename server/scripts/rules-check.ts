// 규칙 단위 검증: 엔진 규칙(자율활동 2인 제한·추가 비용, 주문 대결 매력 이전, 협력 탐험, 시험 주사위, 수업카드 토큰)이
// 기획대로 동작하는지 서버 없이 확인합니다. (사용법: npm run check)
import assert from "node:assert/strict";
import { BOT_PERSONALITIES, chooseActivityAction, chooseLabCard, playClassTurn } from "../src/game/bot.js";
import { explorationTemplates } from "../src/game/explorationCards.js";
import {
  availableActivities,
  chooseLabCard as submitLabChoice,
  createGame,
  openClassCard,
  selectActivity,
  submitClassChoice,
  submitRoll,
} from "../src/game/engine.js";
import type { GameState } from "../src/game/types.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function newGame(count: number): GameState {
  return createGame(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `p${i}` })));
}

// 정규수업을 아무도 습득하지 않고 넘겨 3주차(자율활동)로 간다
function toActivity(state: GameState): void {
  for (const id of state.turnOrder) submitClassChoice(state, id, []);
  assert.equal(state.phase, "activity");
}

// 지금 굴리는 중인 주사위 단계의 참가자만 모두 굴린다 (그 결과로 다음 굴림 단계가 시작돼도 이어서 굴리지 않는다)
function rollAll(state: GameState): void {
  const current = state.pendingRoll;
  if (!current) return;
  for (const entry of [...current.entries]) if (entry.dice === null) submitRoll(state, entry.playerId);
}

console.log("\n=== 규칙 검증 ===");

test("1주차에 지력·체력·주문력 수치만큼 토큰을 받는다", () => {
  const state = newGame(2);
  for (const p of Object.values(state.players)) {
    assert.equal(p.intelligenceTokens, 1);
    assert.equal(p.staminaTokens, 1);
    assert.equal(p.spellbookTokens, 1);
  }
});

test("수업카드는 지력토큰으로 열고 체력토큰으로 습득한다 (등급별 비용)", () => {
  const state = newGame(2);
  const id = state.turnOrder[0];
  const p = state.players[id];
  p.intelligenceTokens = 3;
  p.staminaTokens = 3;
  openClassCard(state, id, "normal"); // 지력토큰 1개
  assert.equal(p.intelligenceTokens, 2);
  assert.equal(p.offeredClassCards.length, 1);
  openClassCard(state, id, "rare"); // 지력토큰 2개
  assert.equal(p.intelligenceTokens, 0);
  assert.throws(() => openClassCard(state, id, "normal"), /지력토큰이 부족/);
  const [normal, rare] = p.offeredClassCards;
  assert.equal(normal.tier, "normal");
  assert.equal(rare.tier, "rare");
  p.staminaTokens = 2;
  assert.throws(() => submitClassChoice(state, id, [normal.id, rare.id]), /체력토큰이 부족/); // 1 + 2 = 3개 필요
  const before = p[rare.statBoost.stat];
  submitClassChoice(state, id, [rare.id]); // 체력토큰 2개
  assert.equal(p.staminaTokens, 0);
  assert.equal(p[rare.statBoost.stat], before + 2);
});

test("자율활동 구역은 최대 2명, 두 번째 참가자는 체력토큰 1개를 더 낸다", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b, c] = state.activityOrder;
  for (const id of state.turnOrder) state.players[id].staminaTokens = 0;
  selectActivity(state, a, "tournament");
  assert.deepEqual(state.activitySlots.tournament, [a]);
  assert.throws(() => selectActivity(state, b, "tournament"), /체력토큰 1개가 더 필요/);
  state.players[b].staminaTokens = 1;
  selectActivity(state, b, "tournament");
  assert.equal(state.players[b].staminaTokens, 0);
  assert.deepEqual(state.activitySlots.tournament, [a, b]);
  state.players[c].staminaTokens = 5;
  assert.throws(() => selectActivity(state, c, "tournament"), /이미 두 명/);
  assert.ok(!availableActivities(state, c).includes("tournament"));
});

test("주문 대결: 도전자가 지목당한 친구에게 매력 1을 건네고, 지목당한 친구는 비용이 없다", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b, c] = state.activityOrder;
  for (const id of state.turnOrder) state.players[id].staminaTokens = 0;
  // 승자가 받는 마도서가 매력을 올리면 결과가 흔들리므로 마도서 더미를 비워 둔다
  state.grimoirePile = { draw: [], discard: [] };
  const charmA = state.players[a].charm;
  const charmB = state.players[b].charm;
  selectActivity(state, a, "duel", b);
  assert.ok(state.pendingRoll, "주사위 굴리기 단계가 시작돼야 한다");
  assert.equal(state.pendingRoll.kind, "duel");
  assert.deepEqual(state.duels, [{ challengerId: a, targetId: b }]);
  assert.deepEqual(state.activitySlots.duel, [a]); // 지목당한 사람은 구역을 차지하지 않는다
  assert.equal(state.players[a].charm, charmA, "결과가 나오기 전에는 매력이 옮겨지지 않는다");
  assert.throws(() => selectActivity(state, c, "lab"), /주사위를 먼저 굴려야/);
  submitRoll(state, a);
  assert.throws(() => submitRoll(state, a), /이미 주사위를 굴렸습니다/);
  submitRoll(state, b);
  assert.equal(state.pendingRoll, null);
  assert.equal(state.players[a].charm, charmA - 1);
  assert.equal(state.players[b].charm, charmB + 1);
  assert.match(state.log[state.log.length - 1].message, /매력 1을 건넸어요/);
  // 다음 차례는 지목당한 b를 건너뛰고 c
  assert.equal(state.activityOrder[state.activityTurnPointer], c);
});

test("주문 대결은 건넬 매력이 없으면 고를 수 없다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  state.players[a].charm = 0;
  assert.ok(!availableActivities(state, a).includes("duel"));
  assert.throws(() => selectActivity(state, a, "duel", b), /매력/);
});

function coopCard() {
  const template = explorationTemplates().find((t) => t.name === "쌍둥이 마법진");
  assert.ok(template);
  return { ...template, id: "coop-test" };
}

test("협력 탐험: 함께할 친구가 합류하면 둘의 합으로 판정하고 보상이 둘 다에게 적용된다", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b] = state.activityOrder;
  for (const id of state.turnOrder) state.players[id].staminaTokens = 2;
  state.explorationPile.draw.push(coopCard());
  selectActivity(state, a, "exploration");
  assert.equal(state.pendingRoll, null, "혼자서는 굴리지 않고 친구를 기다린다");
  assert.equal(state.coopWaiting?.playerId, a);
  assert.equal(state.activityOrder[state.activityTurnPointer], b, "차례는 다음 사람에게 넘어간다");
  // 판정을 확실히 성공시키기 위해 주문력을 크게 올려 둔다
  state.players[a].spellPower = 20;
  state.players[b].spellPower = 20;
  const staminaB = state.players[b].staminaTokens;
  selectActivity(state, b, "exploration");
  assert.equal(state.players[b].staminaTokens, staminaB - 1, "두 번째 참가자는 체력토큰 1개를 더 낸다");
  assert.equal(state.coopWaiting, null);
  assert.deepEqual(state.pendingRoll?.entries.map((e) => e.playerId).sort(), [a, b].sort());
  rollAll(state);
  assert.equal(state.players[a].spellPower, 21);
  assert.equal(state.players[b].spellPower, 21);
});

test("협력 탐험: 끝까지 친구가 없으면 3주차 마지막에 혼자 도전한다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  for (const id of state.turnOrder) state.players[id].staminaTokens = 0;
  state.explorationPile.draw.push(coopCard());
  selectActivity(state, a, "exploration");
  assert.equal(state.coopWaiting?.playerId, a);
  selectActivity(state, b, "tournament");
  assert.equal(state.phase, "activity", "협력 카드가 남아 있으면 정리로 넘어가지 않는다");
  assert.deepEqual(state.pendingRoll?.entries.map((e) => e.playerId), [a]);
  rollAll(state);
  assert.equal(state.phase, "class", "혼자 도전을 마치면 다음 달 정규수업으로 넘어간다");
  assert.equal(state.round, 2);
});

test("협력 탐험: 두 번째 참가자가 뽑을 때는 합류할 자리가 없으니 협력 카드를 건너뛴다", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b] = state.activityOrder;
  for (const id of state.turnOrder) state.players[id].staminaTokens = 2;
  // 첫 참가자가 일반(판정 없는) 카드를 처리하고 나면, 두 번째 참가자 몫의 맨 위 카드가 협력 카드가 되도록 쌓아 둔다
  const safe = explorationTemplates().find((t) => !t.check);
  assert.ok(safe);
  state.explorationPile.draw.push(coopCard(), { ...safe, id: "safe-test" });
  selectActivity(state, a, "exploration");
  assert.equal(state.coopWaiting, null);
  selectActivity(state, b, "exploration"); // 이 구역은 이제 가득 찬다
  assert.equal(state.coopWaiting, null, "합류할 사람이 없으니 협력 카드가 열리면 안 된다");
  assert.ok(state.explorationPile.discard.some((c) => c.id === "coop-test"));
});

test("협력 탐험: 혼자 도전해 실패해도 손해는 없다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  for (const id of state.turnOrder) state.players[id].staminaTokens = 0;
  state.players[a].spellPower = 0; // 단독 목표값(11)에 도저히 닿을 수 없게 한다
  state.explorationPile.draw.push(coopCard()); // 실패 효과: 다음 달 체력토큰 -1
  selectActivity(state, a, "exploration");
  selectActivity(state, b, "tournament");
  const pendingBefore = state.players[a].pendingStaminaTokens;
  rollAll(state);
  assert.equal(state.players[a].pendingStaminaTokens, pendingBefore, "혼자 도전 실패는 페널티가 없다");
  assert.match(state.log.find((l) => l.message.includes("문이 열리지 않았어요"))?.message ?? "", /손해는 없어요/);
});

test("시험: 지력만큼 주사위를 굴려야 결과가 나온다", () => {
  const state = newGame(3);
  const strategy = BOT_PERSONALITIES[0];
  let guard = 0;
  while (state.phase !== "midterm_exam" && guard++ < 3000) {
    if (state.pendingRoll) rollAll(state);
    else if (state.phase === "class") {
      for (const id of state.turnOrder) if (!state.players[id].hasActedThisPhase) playClassTurn(state, id, strategy);
    } else {
      const id = state.activityOrder[state.activityTurnPointer];
      const pick = chooseActivityAction(state, id, strategy);
      selectActivity(state, id, pick.activityId, pick.targetPlayerId, pick.useStamina);
      if (state.pendingLab) submitLabChoice(state, id, chooseLabCard(state, strategy));
    }
  }
  assert.equal(state.phase, "midterm_exam");
  assert.equal(state.round, 6);
  assert.equal(state.examResults.length, 0, "주사위를 굴리기 전에는 결과가 없다");
  const pending = state.pendingRoll;
  assert.ok(pending && pending.kind === "exam");
  // 주사위 수 = 지력 + 연구 카드로 받은 임시 지력 (시험이 끝나면 임시분은 사라지므로 미리 저장해 둔다)
  const diceCounts = new Map<string, number>();
  for (const entry of pending.entries) {
    const p = state.players[entry.playerId];
    diceCounts.set(entry.playerId, p.intelligence + (p.tempBoosts.intelligence ?? 0));
    assert.equal(entry.diceCount, diceCounts.get(entry.playerId));
  }
  rollAll(state);
  assert.equal(state.examResults.length, 1);
  for (const score of state.examResults[0].scores) {
    assert.equal(score.dice.length, diceCounts.get(score.playerId));
    assert.equal(score.score, score.dice.reduce((a, b) => a + b, 0));
    assert.ok(score.dice.every((d) => d >= 1 && d <= 6));
  }
  assert.equal(state.phase, "class");
  assert.equal(state.round, 7);
});

console.log(`\n${passed}개 검증 통과\n`);
