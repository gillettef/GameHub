// 규칙 단위 검증: 엔진 규칙(정규수업 공개 시장·지력 순서, 매력토큰 교환, 자율활동 구역의 공개 카드 2장·먼저 온 사람이 고르고 남는 카드는
// 두 번째 참가자, 2인 제한·추가 비용, 주문 대결 매력 이전과 마도서 선택, 협력 탐험, 토너먼트 상한 폐지, 시험 카드)이
// 기획대로 동작하는지 서버 없이 확인합니다. (사용법: npm run check)
import assert from "node:assert/strict";
import { BOT_PERSONALITIES, chooseActivityAction, choosePick, playClassTurn } from "../src/game/bot.js";
import { CREATURE_CARDS } from "../src/game/creatures.js";
import { explorationTemplates } from "../src/game/explorationCards.js";
import {
  availableActivities,
  charmRate,
  chooseActivityCard,
  createGame,
  selectActivity,
  submitRoll,
  takeClassCard,
} from "../src/game/engine.js";
import { grimoireTemplates } from "../src/game/grimoireCards.js";
import { labTemplates } from "../src/game/labCards.js";
import type { ExplorationCard, GameState, GrimoireCard, LabCard } from "../src/game/types.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function newGame(count: number): GameState {
  return createGame(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `p${i}` })));
}

// 정규수업을 아무도 카드를 가져가지 않고 넘겨 3주차(자율활동)로 간다. 지력토큰은 활동에서 쓸 수 있도록 넉넉히 채워 둔다
function toActivity(state: GameState, intTokens = 5): void {
  while (state.phase === "class") takeClassCard(state, state.classPickOrder[state.classPickPointer], null);
  assert.equal(state.phase, "activity");
  for (const id of state.turnOrder) state.players[id].intelligenceTokens = intTokens;
}

// 모든 플레이어의 체력토큰·매력토큰을 지정한 값으로 맞춘다
function setTokens(state: GameState, stamina: number, charm = 0): void {
  for (const id of state.turnOrder) Object.assign(state.players[id], { staminaTokens: stamina, charmTokens: charm });
}

// 지금 굴리는 중인 주사위 단계의 참가자만 모두 굴린다 (그 결과로 다음 굴림 단계가 시작돼도 이어서 굴리지 않는다)
function rollAll(state: GameState): void {
  const current = state.pendingRoll;
  if (!current) return;
  for (const entry of [...current.entries]) if (entry.dice === null) submitRoll(state, entry.playerId);
}

// 봇이 한 걸음 진행한다 (굴림 → 공개 카드 선택 → 수업카드 선택 → 구역 선택 순)
function botStep(state: GameState, strategy = BOT_PERSONALITIES[0]): void {
  if (state.pendingRoll) rollAll(state);
  else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, strategy));
  else if (state.phase === "class") playClassTurn(state, state.classPickOrder[state.classPickPointer], strategy);
  else {
    const id = state.activityOrder[state.activityTurnPointer];
    const pick = chooseActivityAction(state, id, strategy);
    selectActivity(state, id, pick.activityId, pick.targetPlayerId, pick.useStamina);
  }
}

// 카드 만들기 (이름으로 원본 카드를 찾아 테스트용 id를 붙인다)
function creature(name: string) {
  const t = CREATURE_CARDS.find((c) => c.name === name);
  assert.ok(t, name);
  return { ...t, id: `test-${name}` };
}
function labCard(name: string): LabCard {
  const t = labTemplates().find((c) => c.name === name);
  assert.ok(t, name);
  return { ...t, id: `test-${name}` };
}
function safeExploration(index: number): ExplorationCard {
  const t = explorationTemplates().filter((c) => !c.check && !c.coop)[index];
  assert.ok(t);
  return { ...t, id: `test-safe-${index}` };
}
function coopCard(): ExplorationCard {
  const template = explorationTemplates().find((t) => t.name === "쌍둥이 마법진");
  assert.ok(template);
  return { ...template, id: "coop-test" };
}
function grimoire(name: string): GrimoireCard {
  const t = grimoireTemplates().find((c) => c.name === name);
  assert.ok(t, name);
  return { ...t, id: `test-${name}` };
}

console.log("\n=== 규칙 검증 ===");

test("1주차에 지력·체력·매력·주문력 수치만큼 토큰을 받는다", () => {
  const state = newGame(2);
  for (const p of Object.values(state.players)) {
    assert.equal(p.intelligenceTokens, p.intelligence);
    assert.equal(p.staminaTokens, p.stamina);
    assert.equal(p.charmTokens, p.charm);
    assert.equal(p.spellbookTokens, p.spellPower);
  }
});

// ── 2주차: 정규수업 ──

test("정규수업: 인원수 + 1장이 공개되고 선택 순서가 정해진다", () => {
  for (const n of [2, 3, 4, 5]) {
    const state = newGame(n);
    assert.equal(state.phase, "class");
    assert.equal(state.classMarket.length, n + 1);
    assert.equal(state.classPickOrder.length, n);
    assert.equal(new Set(state.classPickOrder).size, n);
    assert.equal(state.classPickPointer, 0);
  }
});

test("정규수업 덱은 인원 × 14장(능력치별 같은 장수)이다", () => {
  for (const n of [2, 3, 4, 5]) {
    const state = newGame(n);
    const all = [...state.classDeck, ...state.classMarket];
    assert.equal(all.length, Math.ceil((n * 14) / 4) * 4);
    const perStat = all.length / 4;
    for (const stat of ["intelligence", "stamina", "charm", "spellPower"] as const) {
      assert.equal(all.filter((c) => c.statBoost.stat === stat).length, perStat);
    }
  }
});

test("정규수업: 내 차례에만 공개된 카드 1장을 체력토큰을 내고 가져가고, 안 가져가도 된다", () => {
  const state = newGame(2);
  const [first, second] = state.classPickOrder;
  const card = state.classMarket[0];
  const leftover = state.classMarket.length - 1;
  assert.throws(() => takeClassCard(state, second, card.id), /차례가 아닙니다/);
  setTokens(state, 10);
  const stat = card.statBoost.stat;
  const before = state.players[first][stat];
  takeClassCard(state, first, card.id);
  assert.equal(state.players[first][stat], before + card.statBoost.amount);
  assert.equal(state.players[first].staminaTokens, 10 - card.takeCost);
  assert.equal(state.players[first].classCards.length, 1);
  assert.ok(!state.classMarket.some((c) => c.id === card.id));
  assert.throws(() => takeClassCard(state, second, card.id), /공개된 수업카드 중에서만/);
  const other = state.classMarket[0];
  state.players[second].staminaTokens = other.takeCost - 1;
  assert.throws(() => takeClassCard(state, second, other.id), /체력토큰이 부족/);
  takeClassCard(state, second, null); // 가져가지 않고 넘어간다
  assert.equal(state.phase, "activity");
  assert.equal(state.classMarket.length, 0);
  assert.equal(state.classDiscard.length, leftover, "아무도 가져가지 않은 카드는 버림 더미로 간다");
});

test("정규수업: 체력토큰이 모자라면 매력토큰 3개가 1개를 대신한다", () => {
  const state = newGame(2);
  const id = state.classPickOrder[0];
  const p = state.players[id];
  const card = state.classMarket[0];
  p.staminaTokens = 0;
  p.charmTokens = card.takeCost * 3 - 1;
  assert.throws(() => takeClassCard(state, id, card.id), /체력토큰이 부족/);
  p.charmTokens = card.takeCost * 3;
  takeClassCard(state, id, card.id);
  assert.equal(p.charmTokens, 0);
  assert.equal(p.classCards.length, 1);
});

test("정규수업 선택 순서는 지력이 높은 순 (동점이면 매력 순)이다", () => {
  const state = newGame(4);
  const strategy = BOT_PERSONALITIES[0];
  let guard = 0;
  while (state.round < 3 && guard++ < 3000) {
    if (state.phase === "class" && state.classPickPointer === 0) {
      const key = (id: string) => [state.players[id].intelligence + (state.players[id].tempBoosts.intelligence ?? 0), state.players[id].charm + (state.players[id].tempBoosts.charm ?? 0)];
      for (let i = 1; i < state.classPickOrder.length; i++) {
        const [pi, pc] = key(state.classPickOrder[i - 1]);
        const [ci, cc] = key(state.classPickOrder[i]);
        assert.ok(pi > ci || (pi === ci && pc >= cc), "앞 순서일수록 지력(같으면 매력)이 높다");
      }
    }
    botStep(state, strategy);
  }
  assert.ok(state.round >= 3);
});

// ── 3주차: 자율활동 ──

test("카드를 여는 구역은 지력토큰이 필요하다 (매력토큰 3개가 1개를 대신한다)", () => {
  const state = newGame(3);
  toActivity(state, 0);
  setTokens(state, 0);
  const [a] = state.activityOrder;
  const avail = availableActivities(state, a);
  assert.ok(avail.includes("tournament"));
  assert.ok(!avail.includes("creature") && !avail.includes("exploration") && !avail.includes("lab") && !avail.includes("duel"));
  assert.throws(() => selectActivity(state, a, "creature"), /지력토큰/);
  state.players[a].intelligenceTokens = 1;
  state.creatureDeck.push(creature("하늘의 꽃마녀"), creature("하늘의 신비"));
  selectActivity(state, a, "creature");
  assert.equal(state.players[a].intelligenceTokens, 0);
});

test("구역에 처음 들어온 사람이 카드 2장을 열고 지력토큰 1개를 낸다. 두 번째 참가자는 지력토큰을 내지 않는다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 3);
  const [a, b] = state.activityOrder;
  state.creatureDeck.push(creature("하늘의 꽃마녀"), creature("하늘의 신비"));
  state.players[a].spellbookTokens = 0;
  state.players[b].spellbookTokens = 0;
  selectActivity(state, a, "creature");
  assert.equal(state.players[a].intelligenceTokens, 4);
  assert.equal(state.activityOffers.creature?.cards.length, 2, "공개된 카드는 모두가 볼 수 있다");
  selectActivity(state, b, "creature");
  assert.equal(state.players[b].intelligenceTokens, 5, "이미 열린 카드라 지력토큰이 들지 않는다");
});

test("마법생물 조련: 먼저 온 사람이 원하는 카드를 주문서를 내고 가져가고, 남는 카드는 두 번째 참가자가 가져간다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 2);
  const [a, b] = state.activityOrder;
  state.creatureDeck.push(creature("하늘의 신비"), creature("하늘의 꽃마녀")); // 요구 주문서 5개 / 2개
  state.players[a].spellbookTokens = 2;
  state.players[b].spellbookTokens = 5;
  selectActivity(state, a, "creature");
  assert.deepEqual(state.pendingPick, { playerId: a, activityId: "creature", mode: "take", boost: 0 });
  assert.throws(() => selectActivity(state, b, "creature"), /먼저 골라야/);
  assert.throws(() => chooseActivityCard(state, b, "test-하늘의 꽃마녀"), /고를 수 없습니다/);
  assert.throws(() => chooseActivityCard(state, a, "test-하늘의 신비"), /비용이 모자라서/);
  chooseActivityCard(state, a, "test-하늘의 꽃마녀");
  assert.equal(state.players[a].spellbookTokens, 0);
  assert.deepEqual(state.players[a].creatures.map((c) => c.name), ["하늘의 꽃마녀"]);
  assert.equal(state.pendingPick, null);
  assert.equal(state.activityOrder[state.activityTurnPointer], b, "다음 사람 차례로 넘어간다");
  selectActivity(state, b, "creature"); // 남은 1장은 자동으로 가져간다 (체력토큰 참가비는 매력토큰이 없어 체력토큰으로)
  assert.deepEqual(state.players[b].creatures.map((c) => c.name), ["하늘의 신비"]);
  assert.equal(state.players[b].spellbookTokens, 0);
  assert.equal(state.activityOffers.creature?.cards.length, 0);
});

test("마법생물 조련: 비용을 못 내면 카드를 가져가지 못하고, 남은 카드는 두 번째 참가자가 고른다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 2);
  const [a, b] = state.activityOrder;
  state.creatureDeck.push(creature("하늘의 신비"), creature("하늘의 감시자")); // 요구 주문서 5개 / 3개
  state.players[a].spellbookTokens = 1;
  state.players[b].spellbookTokens = 5;
  selectActivity(state, a, "creature");
  assert.equal(state.pendingPick, null, "가져올 수 있는 카드가 없으면 고를 것도 없다");
  assert.equal(state.players[a].creatures.length, 0);
  assert.equal(state.activityOrder[state.activityTurnPointer], b);
  selectActivity(state, b, "creature");
  assert.equal(state.pendingPick?.playerId, b, "두 장이 그대로 남아 있으니 두 번째 참가자가 고른다");
  chooseActivityCard(state, b, "test-하늘의 신비");
  assert.equal(state.players[b].creatures[0].name, "하늘의 신비");
});

test("체력토큰 집중은 마법생물에 필요한 주문서를 1개 줄여 준다 (최소 1개)", () => {
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  state.creatureDeck.push(creature("하늘의 신비"), creature("하늘의 꽃마녀"));
  Object.assign(state.players[a], { staminaTokens: 3, charmTokens: 0, spellbookTokens: 1 });
  selectActivity(state, a, "creature", undefined, true);
  assert.equal(state.pendingPick?.boost, 1);
  chooseActivityCard(state, a, "test-하늘의 꽃마녀"); // 요구 2 - 집중 1 = 1개
  assert.equal(state.players[a].spellbookTokens, 0);
});

test("연구실 실험: 카드 2장을 열어 원하는 카드를 체력토큰을 내고 가져가고, 남는 카드는 두 번째 참가자가 가져간다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 2);
  const [a, b] = state.activityOrder;
  state.labPile.draw.push(labCard("든든 도시락"), labCard("마법 안경")); // 체력토큰 0개 / 1개
  selectActivity(state, a, "lab");
  assert.equal(state.activityOffers.lab?.cards.length, 2);
  chooseActivityCard(state, a, "test-마법 안경");
  assert.equal(state.players[a].staminaTokens, 1);
  assert.ok(state.players[a].equipment.some((c) => c.name === "마법 안경"), "시험 대비 카드는 다음 시험까지 보관한다");
  selectActivity(state, b, "lab"); // 남은 "든든 도시락"(무료)을 자동으로 가져간다
  assert.equal(state.players[b].pendingStaminaTokens, 2);
  assert.equal(state.activityOffers.lab?.cards.length, 0);
});

test("연구실 실험: 비용이 모자란 카드는 못 고르고, 가져가지 않고 넘어가면 두 번째 참가자가 고른다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 0);
  const [a, b] = state.activityOrder;
  state.labPile.draw.push(labCard("든든 도시락"), labCard("마법약 실험")); // 체력토큰 0개 / 2개
  selectActivity(state, a, "lab");
  assert.equal(state.pendingPick?.playerId, a);
  assert.throws(() => chooseActivityCard(state, a, "test-마법약 실험"), /비용이 모자라서/);
  chooseActivityCard(state, a, null); // 가져가지 않고 넘어감
  assert.equal(state.pendingPick, null);
  assert.equal(state.activityOffers.lab?.cards.length, 2);
  state.players[b].staminaTokens = 3; // 참가비 1개 + 카드 2개
  selectActivity(state, b, "lab");
  assert.equal(state.pendingPick?.playerId, b);
  chooseActivityCard(state, b, "test-마법약 실험");
  assert.equal(state.players[b].staminaTokens, 0);
});

test("체력토큰 집중으로 연구실은 카드를 3장 연다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  Object.assign(state.players[a], { staminaTokens: 2, charmTokens: 0 });
  selectActivity(state, a, "lab", undefined, true);
  assert.equal(state.activityOffers.lab?.cards.length, 3);
});

test("비밀의 방: 먼저 온 사람이 겪을 카드를 고르고(반드시 골라야 함), 남는 카드는 두 번째 참가자가 겪는다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 2);
  const [a, b] = state.activityOrder;
  state.explorationPile.draw.push(safeExploration(1), safeExploration(0));
  selectActivity(state, a, "exploration");
  assert.equal(state.pendingPick?.playerId, a);
  assert.throws(() => chooseActivityCard(state, a, null), /골라야 해요/);
  chooseActivityCard(state, a, "test-safe-0");
  assert.equal(state.pendingPick, null);
  assert.ok(state.log.some((l) => l.message.includes("비밀의 방") && l.message.startsWith(state.players[a].name)));
  assert.equal(state.activityOffers.exploration?.cards.length, 1);
  selectActivity(state, b, "exploration");
  assert.equal(state.activityOffers.exploration?.cards.length, 0, "남은 카드를 두 번째 참가자가 가져갔다");
});

test("협력 탐험: 협력 카드를 고르면 기다리고, 합류하면 둘의 합으로 판정하며 남은 카드는 버려진다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 2);
  const [a, b] = state.activityOrder;
  state.explorationPile.draw.push(safeExploration(0), coopCard());
  selectActivity(state, a, "exploration");
  assert.equal(state.players[a].intelligenceTokens, 4, "카드를 연 사람은 지력토큰 1개를 낸다");
  chooseActivityCard(state, a, "coop-test");
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
  assert.ok(state.explorationPile.discard.some((c) => c.id === "test-safe-0"), "남은 카드는 버려진다");
  assert.deepEqual((state.pendingRoll as GameState["pendingRoll"])?.entries.map((e) => e.playerId).sort(), [a, b].sort());
  rollAll(state);
  assert.equal(state.players[a].spellPower, 21);
  assert.equal(state.players[b].spellPower, 21);
});

test("협력 탐험: 끝까지 친구가 없으면 무효가 된다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  setTokens(state, 0);
  state.explorationPile.draw.push(safeExploration(0), coopCard());
  const before = { ...state.players[a] };
  selectActivity(state, a, "exploration");
  chooseActivityCard(state, a, "coop-test");
  assert.equal(state.coopWaiting?.playerId, a);
  selectActivity(state, b, "tournament");
  assert.equal(state.pendingRoll, null, "혼자 굴리는 단계는 없다");
  assert.equal(state.phase, "class", "무효 처리 후 바로 다음 달로 넘어간다");
  assert.equal(state.round, 2);
  assert.equal(state.players[a].spellPower, before.spellPower, "무효이므로 아무 효과도 없다");
  assert.ok(state.log.some((l) => l.message.includes("무효가 되었어요")));
  assert.equal(state.coopWaiting, null);
});

test("협력 탐험: 두 번째 참가자는 협력 카드를 받을 수 없어 남은 협력 카드는 새 카드로 바뀐다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 2);
  const [a, b] = state.activityOrder;
  state.explorationPile.draw.push(safeExploration(1), safeExploration(0), coopCard()); // 맨 위 두 장: 협력 카드와 일반 카드
  selectActivity(state, a, "exploration");
  chooseActivityCard(state, a, "test-safe-0");
  assert.equal(state.coopWaiting, null);
  selectActivity(state, b, "exploration"); // 이 구역은 이제 가득 찬다
  assert.equal(state.coopWaiting, null, "합류할 사람이 없으니 협력 카드가 열리면 안 된다");
  assert.ok(state.explorationPile.discard.some((c) => c.id === "coop-test"));
});

test("주문 대결: 이긴 사람이 공개된 마도서 중 1장을 고른다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 0);
  const [a, b, c] = state.activityOrder;
  state.grimoirePile.draw.push(grimoire("초급 주문집"), grimoire("반짝 연습장"));
  selectActivity(state, a, "duel", b);
  assert.equal(state.players[a].intelligenceTokens, 4, "도전자가 마도서를 열며 지력토큰 1개를 낸다");
  assert.equal(state.activityOffers.duel?.cards.length, 2);
  rollAll(state);
  const pick = state.pendingPick;
  assert.ok(pick && pick.mode === "reward" && [a, b].includes(pick.playerId), "이긴 사람이 마도서를 고른다");
  assert.throws(() => chooseActivityCard(state, pick.playerId, null), /골라야 해요/);
  const winner = state.players[pick.playerId];
  const stat = grimoire("초급 주문집").statBoost.stat;
  const before = winner[stat];
  chooseActivityCard(state, winner.id, "test-초급 주문집");
  assert.equal(winner[stat], before + 1);
  assert.deepEqual(winner.grimoires.map((g) => g.name), ["초급 주문집"]);
  assert.equal(state.pendingPick, null);
  assert.equal(state.activityOrder[state.activityTurnPointer], c, "보상을 고른 뒤 다음 차례로 넘어간다");
  assert.equal(state.activityOffers.duel?.cards.length, 1);
});

test("자율활동이 끝나면 아무도 가져가지 않은 공개 카드는 버림 더미로 돌아간다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  setTokens(state, 0);
  state.players[a].spellbookTokens = 0;
  selectActivity(state, a, "creature"); // 주문서가 없어 아무것도 못 가져간다
  selectActivity(state, b, "tournament");
  assert.equal(state.round, 2);
  assert.deepEqual(state.activityOffers, {});
  assert.equal(state.creatureDeck.length + state.creatureDiscard.length + state.players[a].creatures.length + state.players[b].creatures.length, CREATURE_CARDS.length);
});

test("자율활동 구역은 최대 2명, 두 번째 참가자는 체력토큰 1개를 더 낸다", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b, c] = state.activityOrder;
  setTokens(state, 0);
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
  setTokens(state, 0);
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
  assert.ok(state.log.some((l) => l.message.includes("매력 1을 건넸어요")));
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

// ── 매력토큰 ──

test("구역 두 번째 참가비는 매력토큰 1개로 낼 수 있다", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b] = state.activityOrder;
  setTokens(state, 0);
  selectActivity(state, a, "tournament");
  assert.throws(() => selectActivity(state, b, "tournament"), /체력토큰 1개가 더 필요/);
  state.players[b].charmTokens = 1;
  selectActivity(state, b, "tournament");
  assert.equal(state.players[b].charmTokens, 0);
  assert.deepEqual(state.activitySlots.tournament, [a, b]);
});

test("참가비를 매력토큰으로 내면 체력토큰은 그대로 남는다", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b] = state.activityOrder;
  setTokens(state, 2);
  selectActivity(state, a, "tournament");
  state.players[b].charmTokens = 1;
  selectActivity(state, b, "tournament");
  assert.equal(state.players[b].staminaTokens, 2, "참가비는 매력토큰이 냈다");
});

test("구역 카드를 열 지력토큰이 모자라면 매력토큰 3개가 1개를 대신한다", () => {
  const state = newGame(2);
  toActivity(state, 0);
  setTokens(state, 0);
  const [a] = state.activityOrder;
  state.players[a].charmTokens = 2;
  assert.ok(!availableActivities(state, a).includes("lab"));
  state.players[a].charmTokens = 3;
  assert.ok(availableActivities(state, a).includes("lab"));
  selectActivity(state, a, "lab");
  assert.equal(state.players[a].charmTokens, 0);
});

test("마도서 '매혹의 화술서'·'반짝 스타일북'이 있으면 매력토큰 2개가 다른 토큰 1개를 대신한다 (최소 2개)", () => {
  const state = newGame(2);
  const id = state.classPickOrder[0];
  const p = state.players[id];
  assert.equal(charmRate(p), 3);
  const books = grimoireTemplates().filter((g) => g.ability?.effect === "charmRate");
  assert.equal(books.length, 2);
  p.grimoires.push({ ...books[0], id: "g1" });
  assert.equal(charmRate(p), 2);
  p.grimoires.push({ ...books[1], id: "g2" });
  assert.equal(charmRate(p), 2, "환율은 2 아래로 내려가지 않는다");
  const card = state.classMarket[0];
  p.staminaTokens = 0;
  p.charmTokens = card.takeCost * 2;
  takeClassCard(state, id, card.id);
  assert.equal(p.charmTokens, 0);
});

// ── 시험 ──

test("시험: 시험 카드가 정한 능력치만큼 주사위를 굴리고 보너스 능력치를 더한다", () => {
  const state = newGame(3);
  let guard = 0;
  while (state.phase !== "midterm_exam" && guard++ < 3000) botStep(state);
  assert.equal(state.phase, "midterm_exam");
  assert.equal(state.round, 6);
  assert.equal(state.examResults.length, 0, "주사위를 굴리기 전에는 결과가 없다");
  const pending = state.pendingRoll;
  assert.ok(pending && pending.kind === "exam");
  // 주사위 수 = 시험 카드의 주사위 능력치 + 연구 카드로 받은 임시 능력치 (시험이 끝나면 임시분은 사라지므로 미리 저장해 둔다)
  const card = state.exams.midterm;
  assert.ok(card, "중간고사 카드는 3라운드 뒤에 공개되어 있다");
  const diceCounts = new Map<string, number>();
  const bonuses = new Map<string, number>();
  for (const entry of pending.entries) {
    const p = state.players[entry.playerId];
    diceCounts.set(entry.playerId, p[card.diceStat] + (p.tempBoosts[card.diceStat] ?? 0));
    bonuses.set(entry.playerId, card.bonusStat ? p[card.bonusStat] + (p.tempBoosts[card.bonusStat] ?? 0) : 0);
    assert.equal(entry.diceCount, diceCounts.get(entry.playerId));
  }
  rollAll(state);
  assert.equal(state.examResults.length, 1);
  for (const score of state.examResults[0].scores) {
    assert.equal(score.dice.length, diceCounts.get(score.playerId));
    assert.equal(score.bonus, bonuses.get(score.playerId));
    assert.equal(score.score, score.dice.reduce((a, b) => a + b, 0) + score.bonus);
    assert.ok(score.dice.every((d) => d >= 1 && d <= 6));
  }
  assert.equal(state.phase, "class");
  assert.equal(state.round, 7);
});

test("시험 카드: 게임마다 서로 다른 능력치를 겨냥하는 두 장이 정해지고, 3·9라운드 종료 후에 공개된다", () => {
  for (let i = 0; i < 30; i++) {
    const plan = newGame(2).hidden.examPlan;
    assert.notEqual(plan.midterm.diceStat, plan.final.diceStat);
    assert.notEqual(plan.midterm.id, plan.final.id);
  }
  const state = newGame(3);
  assert.deepEqual(state.exams, { midterm: null, final: null });
  const plan = state.hidden.examPlan;
  const seen: Record<number, { midterm: unknown; final: unknown }> = {};
  let guard = 0;
  while (state.phase !== "ended" && guard++ < 6000) {
    seen[state.round] ??= { midterm: state.exams.midterm, final: state.exams.final };
    botStep(state);
  }
  assert.equal(state.phase, "ended");
  assert.equal(seen[3].midterm, null, "3라운드 중에는 아직 비공개");
  assert.equal(seen[4].midterm, plan.midterm, "3라운드가 끝나면 중간고사 카드가 공개된다");
  assert.equal(seen[4].final, null);
  assert.equal(seen[9].final, null, "9라운드 중에는 기말고사 카드가 비공개");
  assert.equal(seen[10].final, plan.final, "9라운드가 끝나면 기말고사 카드가 공개된다");
  assert.equal(state.examResults.length, 2);
  assert.equal(state.examResults[0].card.id, plan.midterm.id);
  assert.equal(state.examResults[1].card.id, plan.final.id);
});

console.log(`\n${passed}개 검증 통과\n`);
