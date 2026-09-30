// 규칙 단위 검증: 엔진 규칙(수업카드 지력·체력토큰, 카드를 여는 활동의 지력토큰, 자율활동 2인 제한·추가 비용,
// 주문 대결 매력 이전, 협력 탐험, 연구 카드 비용, 토너먼트 상한 폐지, 시험 주사위)이
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
import type { GameState, LabCard } from "../src/game/types.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function newGame(count: number): GameState {
  return createGame(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `p${i}` })));
}

// 정규수업을 아무도 습득하지 않고 넘겨 3주차(자율활동)로 간다. 지력토큰은 활동에서 쓸 수 있도록 넉넉히 채워 둔다
function toActivity(state: GameState, intTokens = 5): void {
  for (const id of state.turnOrder) submitClassChoice(state, id, []);
  assert.equal(state.phase, "activity");
  for (const id of state.turnOrder) state.players[id].intelligenceTokens = intTokens;
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
    assert.equal(p.intelligenceTokens, p.intelligence);
    assert.equal(p.staminaTokens, p.stamina);
    assert.equal(p.spellbookTokens, p.spellPower);
  }
});

test("수업카드는 덱 하나에서 지력토큰 1개로 한 장씩 열고, 카드마다 다른 체력토큰으로 습득한다", () => {
  const state = newGame(2);
  const id = state.turnOrder[0];
  const p = state.players[id];
  p.intelligenceTokens = 3;
  p.staminaTokens = 10;
  const before = state.classDeck.length;
  openClassCard(state, id);
  openClassCard(state, id);
  openClassCard(state, id);
  assert.equal(p.intelligenceTokens, 0);
  assert.equal(p.offeredClassCards.length, 3);
  assert.equal(state.classDeck.length, before - 3);
  assert.throws(() => openClassCard(state, id), /지력토큰이 부족/);
  const cards = p.offeredClassCards;
  const cost = cards.reduce((sum, c) => sum + c.takeCost, 0);
  assert.ok(cards.every((c) => c.takeCost >= 1));
  p.staminaTokens = cost - 1;
  assert.throws(() => submitClassChoice(state, id, cards.map((c) => c.id)), /체력토큰이 부족/);
  p.staminaTokens = cost;
  submitClassChoice(state, id, cards.map((c) => c.id));
  assert.equal(p.staminaTokens, 0);
  assert.equal(p.classCards.length, 3);
});

test("카드를 여는 활동(마법생물·비밀의 방·연구실)은 지력토큰이 필요하다", () => {
  const state = newGame(3);
  toActivity(state, 0);
  const [a] = state.activityOrder;
  const avail = availableActivities(state, a);
  assert.ok(avail.includes("tournament"));
  assert.ok(!avail.includes("creature") && !avail.includes("exploration") && !avail.includes("lab"));
  assert.throws(() => selectActivity(state, a, "creature"), /지력토큰/);
  state.players[a].intelligenceTokens = 1;
  selectActivity(state, a, "creature");
  assert.equal(state.players[a].intelligenceTokens, 0);
});

test("연구실은 펼치는 카드 한 장마다 지력토큰이 들고, 카드마다 체력토큰이 든다 (고르지 않고 넘어갈 수도 있다)", () => {
  const state = newGame(2);
  toActivity(state, 0);
  const [a, b] = state.activityOrder;
  state.players[a].intelligence = 3;
  state.players[a].intelligenceTokens = 2; // 3장을 펼치고 싶지만 토큰은 2개
  state.players[a].staminaTokens = 0;
  selectActivity(state, a, "lab");
  assert.equal(state.pendingLab?.cards.length, 2);
  assert.equal(state.players[a].intelligenceTokens, 0);
  const cards = state.pendingLab!.cards;
  const costly = cards.find((c: LabCard) => c.cost > 0);
  if (costly) assert.throws(() => submitLabChoice(state, a, costly.id), /체력토큰이 부족/);
  submitLabChoice(state, a, null); // 아무것도 고르지 않고 넘어감
  assert.equal(state.pendingLab, null);
  assert.equal(state.activityOrder[state.activityTurnPointer], b);
  assert.ok(state.log.some((l) => l.message.includes("고르지 않고 넘어갔어요")));
});

test("연구 카드를 고르면 그 카드의 체력토큰이 빠진다", () => {
  const state = newGame(2);
  toActivity(state, 3);
  const [a] = state.activityOrder;
  state.players[a].intelligence = 3;
  state.players[a].staminaTokens = 5;
  selectActivity(state, a, "lab");
  const card = state.pendingLab!.cards[0];
  submitLabChoice(state, a, card.id);
  assert.equal(state.players[a].staminaTokens, 5 - card.cost);
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

test("마법 토너먼트 트랙에는 상한이 없다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  state.players[a].spellPower = 8;
  state.players[a].tournamentTrack = 9;
  selectActivity(state, a, "tournament");
  assert.equal(state.players[a].tournamentTrack, 17);
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

test("협력 탐험: 합류하면 둘의 합으로 판정하고 보상이 둘 다에게 적용된다 (합류자는 지력토큰이 들지 않는다)", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b] = state.activityOrder;
  for (const id of state.turnOrder) state.players[id].staminaTokens = 2;
  state.explorationPile.draw.push(coopCard());
  selectActivity(state, a, "exploration");
  assert.equal(state.players[a].intelligenceTokens, 4, "카드를 연 사람은 지력토큰 1개를 낸다");
  assert.equal(state.pendingRoll, null, "혼자서는 굴리지 않고 친구를 기다린다");
  assert.equal(state.coopWaiting?.playerId, a);
  assert.equal(state.activityOrder[state.activityTurnPointer], b, "차례는 다음 사람에게 넘어간다");
  // 판정을 확실히 성공시키기 위해 주문력을 크게 올려 둔다
  state.players[a].spellPower = 20;
  state.players[b].spellPower = 20;
  const staminaB = state.players[b].staminaTokens;
  state.players[b].intelligenceTokens = 0; // 합류에는 지력토큰이 필요 없다
  assert.ok(availableActivities(state, b).includes("exploration"));
  selectActivity(state, b, "exploration");
  assert.equal(state.players[b].staminaTokens, staminaB - 1, "두 번째 참가자는 체력토큰 1개를 더 낸다");
  assert.equal(state.coopWaiting, null);
  assert.deepEqual((state.pendingRoll as GameState["pendingRoll"])?.entries.map((e) => e.playerId).sort(), [a, b].sort());
  rollAll(state);
  assert.equal(state.players[a].spellPower, 21);
  assert.equal(state.players[b].spellPower, 21);
});

test("협력 탐험: 끝까지 친구가 없으면 무효가 된다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  for (const id of state.turnOrder) state.players[id].staminaTokens = 0;
  state.explorationPile.draw.push(coopCard());
  const before = { ...state.players[a] };
  selectActivity(state, a, "exploration");
  assert.equal(state.coopWaiting?.playerId, a);
  selectActivity(state, b, "tournament");
  assert.equal(state.pendingRoll, null, "혼자 굴리는 단계는 없다");
  assert.equal(state.phase, "class", "무효 처리 후 바로 다음 달로 넘어간다");
  assert.equal(state.round, 2);
  assert.equal(state.players[a].spellPower, before.spellPower, "무효이므로 아무 효과도 없다");
  assert.ok(state.log.some((l) => l.message.includes("무효가 되었어요")));
  assert.equal(state.coopWaiting, null);
});

test("협력 탐험: 두 번째 참가자가 뽑을 때는 합류할 자리가 없으니 협력 카드를 건너뛴다", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b] = state.activityOrder;
  for (const id of state.turnOrder) state.players[id].staminaTokens = 2;
  // 첫 참가자가 일반(판정 없는) 카드를 처리하고 나면, 두 번째 참가자 몫의 맨 위 카드가 협력 카드가 되도록 쌓아 둔다
  const safe = explorationTemplates().find((t) => !t.check && !t.coop);
  assert.ok(safe);
  state.explorationPile.draw.push(coopCard(), { ...safe, id: "safe-test" });
  selectActivity(state, a, "exploration");
  assert.equal(state.coopWaiting, null);
  selectActivity(state, b, "exploration"); // 이 구역은 이제 가득 찬다
  assert.equal(state.coopWaiting, null, "합류할 사람이 없으니 협력 카드가 열리면 안 된다");
  assert.ok(state.explorationPile.discard.some((c) => c.id === "coop-test"));
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
