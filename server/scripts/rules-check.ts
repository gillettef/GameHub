// 규칙 단위 검증: 엔진 규칙(게임 시작 선 정하기, 선부터 시계방향 진행과 매달 선 교체, 정규수업 공개 시장, 매력토큰 참가비,
// 자율활동의 "모두 고르기 → 순서대로 하나씩 진행", 구역의 공개 카드 2장·2인 제한·추가 비용, 주문 대결(주문력만큼 주사위·무승부)과 마도서 선택,
// 협력 탐험, 주사위 결과 확인 단계, 토너먼트(주문력만큼 주사위·상한 폐지), 시험 카드, 동점 공동 순위, 최종 점수)가 기획대로 동작하는지 서버 없이 확인합니다. (사용법: npm run check)
import assert from "node:assert/strict";
import { BOT_PERSONALITIES, chooseActivityAction, choosePick, playClassTurn } from "../src/game/bot.js";
import { CREATURE_CARDS } from "../src/game/creatures.js";
import { explorationTemplates } from "../src/game/explorationCards.js";
import {
  advanceResolution,
  availableActivities,
  chooseKeepToken,
  keepOptions,
  canAdvanceResolution,
  chooseActivityCard,
  confirmRoll,
  createGame,
  creatureSets,
  creatureTokenCaps,
  creatureTokenTypes,
  finalScore,
  nextStarterIndex,
  rerollDice,
  rollRevealed,
  selectActivity,
  submitRoll,
  takeClassCard,
} from "../src/game/engine.js";
import { grimoireTemplates } from "../src/game/grimoireCards.js";
import { labTemplates } from "../src/game/labCards.js";
import { effectiveStat, type ExplorationCard, type GameState, type GrimoireCard, type LabCard, type PlayerGameState } from "../src/game/types.js";
import { BALANCE } from "../src/game/config.js";
import { createClassDeck } from "../src/game/classCards.js";
import { rollAndConfirm } from "./_drive.js";

// 지력토큰 카드 공개 비용 장치는 남아 있으므로(현재 config는 빈 배열), 비용 규칙을 켜서 검증할 때 쓴다
function withOpenCost(fn: () => void): () => void {
  return () => {
    const saved = BALANCE.openCardCostActivities;
    BALANCE.openCardCostActivities = ["duel", "lab"];
    try {
      fn();
    } finally {
      BALANCE.openCardCostActivities = saved;
    }
  };
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// 게임을 만들고 선 정하기 주사위를 굴려 1라운드 정규수업이 시작된 상태로 돌려준다
function newGame(count: number): GameState {
  const state = createGame(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `p${i}`, isBot: true })));
  let guard = 0;
  while (state.phase === "setup" && guard++ < 100) rollAndConfirm(state);
  assert.equal(state.phase, "class");
  return state;
}

// 정규수업을 아무도 카드를 가져가지 않고 넘겨 3주차(자율활동)로 간다. 지력토큰은 활동에서 쓸 수 있도록 넉넉히 채워 둔다
function toActivity(state: GameState, intTokens = 5): void {
  while (state.phase === "class") takeClassCard(state, state.classPickOrder[state.classPickPointer], null);
  assert.equal(state.phase, "activity");
  for (const id of state.turnOrder) state.players[id].intelligenceTokens = intTokens;
}

// 모든 플레이어의 체력토큰·매력토큰(두 번째 참가비용, 기본 3개)을 지정한 값으로 맞춘다
function setTokens(state: GameState, stamina: number, charm = 3): void {
  for (const id of state.turnOrder) Object.assign(state.players[id], { staminaTokens: stamina, charmTokens: charm });
}

// 지금 굴리는 중인 주사위 단계의 참가자만 모두 굴리고 확인한다 (그 결과로 다음 굴림 단계가 시작돼도 이어서 굴리지 않는다)
const rollAll = rollAndConfirm;

// 지금 굴리는 중인 주사위 단계에서 참가자별 주사위 눈을 정해 놓고 모두 확인한다 (눈이 정해지지 않은 사람은 굴린 대로 둔다)
function rollWith(state: GameState, dice: Record<string, number[]>): void {
  const pending = state.pendingRoll!;
  for (const entry of pending.entries) if (entry.dice === null) submitRoll(state, entry.playerId);
  for (const entry of pending.entries) if (dice[entry.playerId]) entry.dice = dice[entry.playerId];
  for (const entry of [...pending.entries]) if (!entry.confirmed) confirmRoll(state, entry.playerId);
}

// 아직 활동을 고르지 않은 사람들이 (가능한 첫 활동을) 고르게 해서 선택 단계를 끝낸다
function finishChoosing(state: GameState): void {
  while (state.phase === "activity" && state.activityStage === "choose") {
    const id = state.activityOrder[state.activityTurnPointer];
    selectActivity(state, id, availableActivities(state, id)[0]);
  }
}

// 봇이 한 걸음 진행한다 (굴림 → 공개 카드 선택 → 수업카드 선택 → 활동 진행/선택 순)
function botStep(state: GameState, strategy = BOT_PERSONALITIES[0]): void {
  if (state.pendingRoll) rollAll(state);
  else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, strategy));
  else if (state.phase === "class") playClassTurn(state, state.classPickOrder[state.classPickPointer], strategy);
  else if (state.activityStage === "resolve") advanceResolution(state);
  else {
    const id = state.activityOrder[state.activityTurnPointer];
    const pick = chooseActivityAction(state, id, strategy);
    selectActivity(state, id, pick.activityId, pick.targetPlayerId);
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
function explorationByName(name: string): ExplorationCard {
  const t = explorationTemplates().find((c) => c.name === name);
  assert.ok(t, name);
  return { ...t, id: `test-${name}` };
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

// ── 게임 시작과 선 플레이어 ──

test("게임 시작: 좌석은 참가 순서이고, 주사위를 굴려 가장 높은 친구가 첫 달의 선이 된다 (동점이면 동점자끼리 다시)", () => {
  for (const n of [2, 3, 4, 5]) {
    for (let i = 0; i < 20; i++) {
      const state = createGame(Array.from({ length: n }, (_, k) => ({ id: `p${k}`, name: `p${k}`, isBot: true })));
      assert.deepEqual(state.turnOrder, Array.from({ length: n }, (_, k) => `p${k}`), "좌석 순서는 참가 순서");
      assert.equal(state.phase, "setup");
      assert.equal(state.pendingRoll?.kind, "first");
      let last = state.pendingRoll!;
      let guard = 0;
      while (state.phase === "setup" && guard++ < 100) {
        last = state.pendingRoll!;
        assert.equal(rollRevealed(state), false);
        for (const e of [...last.entries]) submitRoll(state, e.playerId);
        assert.equal(rollRevealed(state), true);
        if (state.phase === "setup") assert.ok(state.pendingRoll, "확인하기 전에는 결과가 적용되지 않는다");
        for (const e of [...last.entries]) confirmRoll(state, e.playerId);
      }
      assert.equal(state.phase, "class");
      const top = Math.max(...last.entries.map((e) => e.dice![0]));
      const winners = last.entries.filter((e) => e.dice![0] === top);
      assert.equal(winners.length, 1, "마지막 굴림에서는 단독 1위");
      assert.equal(state.turnOrder[state.startingPlayerIndex], winners[0].playerId);
    }
  }
});

test("정규수업·자율활동 선택 순서는 선 플레이어부터 시계방향(좌석 순서)이다", () => {
  const state = newGame(4);
  const strategy = BOT_PERSONALITIES[0];
  let guard = 0;
  let checked = 0;
  while (state.round < 4 && guard++ < 3000) {
    const n = state.turnOrder.length;
    const expected = Array.from({ length: n }, (_, i) => state.turnOrder[(state.startingPlayerIndex + i) % n]);
    if (state.phase === "class" && state.classPickPointer === 0) {
      assert.deepEqual(state.classPickOrder, expected);
      checked += 1;
    }
    if (state.phase === "activity" && state.activityTurnPointer === 0 && state.activityStage === "choose") {
      assert.deepEqual(state.activityOrder, expected);
      checked += 1;
    }
    botStep(state, strategy);
  }
  assert.ok(checked >= 6);
});

test("다음 달 선: 매력이 가장 높은 플레이어가 된다 (현재 선과 같거나 최고면 그대로, 최고가 여럿이면 선에서 시계방향으로 가장 가까운 사람)", () => {
  const make = (starter: number, charms: number[]) => {
    const players = Object.fromEntries(charms.map((c, i) => [`p${i}`, { charm: c, tempBoosts: {} } as unknown as PlayerGameState]));
    return { turnOrder: charms.map((_, i) => `p${i}`), startingPlayerIndex: starter, players } as unknown as GameState;
  };
  assert.equal(nextStarterIndex(make(1, [2, 3, 2, 2])), 1, "현재 선이 가장 높으면 그대로");
  assert.equal(nextStarterIndex(make(1, [2, 2, 2, 5])), 3, "다른 사람이 가장 높으면 그 사람이 선");
  assert.equal(nextStarterIndex(make(1, [1, 3, 3, 1])), 1, "현재 선과 최고 매력이 같으면 바뀌지 않는다");
  assert.equal(nextStarterIndex(make(1, [4, 2, 3, 4])), 3, "선보다 높은 사람이 여럿(최고 동점)이면 선에서 시계방향으로 가까운 사람");
  assert.equal(nextStarterIndex(make(3, [4, 2, 4, 1])), 0, "시계방향은 좌석 끝에서 처음으로 이어진다");
  assert.equal(nextStarterIndex(make(0, [2, 2, 2, 2])), 0);
});

test("4주차(정리)에서 다음 달 선이 정해져 다음 달 진행 순서에 반영된다", () => {
  const state = newGame(3);
  const oldStarter = state.startingPlayerIndex;
  // 선이 아닌 다른 친구의 매력을 가장 높게 만들어 두고, 3주차를 끝까지 진행한다 (매력이 바뀌지 않도록 토너먼트만 고른다)
  const other = (oldStarter + 1) % 3;
  toActivity(state);
  Object.assign(state.players[state.turnOrder[other]], { charm: 9 });
  setTokens(state, 3);
  finishChoosing(state);
  let guard = 0;
  while (state.round === 1 && guard++ < 100) botStep(state);
  assert.equal(state.round, 2);
  assert.equal(state.startingPlayerIndex, other);
  assert.equal(state.classPickOrder[0], state.turnOrder[other]);
  assert.ok(state.log.some((l) => l.message.includes("다음 달 선")));
});

test("1주차에 지력·체력·매력·주문력 수치만큼 토큰을 받는다", () => {
  const state = newGame(2);
  for (const p of Object.values(state.players)) {
    assert.equal(p.intelligenceTokens, p.intelligence);
    assert.equal(p.staminaTokens, p.stamina);
    assert.equal(p.charmTokens, p.charm);
    assert.equal(p.manaTokens, p.spellPower);
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

test("정규수업 덱은 학기마다 인원과 무관하게 36장이고, 1학기는 주문력이 소수·2학기는 주문력 위주이며 비용이 다르다", () => {
  for (const n of [2, 3, 4, 5]) {
    const state = newGame(n);
    const sem1 = [...state.classDeck, ...state.classMarket];
    assert.equal(sem1.length, BALANCE.classDeckSize);
    const count = (cards: typeof sem1, stat: string) => cards.filter((c) => c.statBoost.stat === stat).length;
    assert.ok(count(sem1, "spellPower") >= 1 && count(sem1, "spellPower") < count(sem1, "intelligence") + 1);
    assert.ok(sem1.filter((c) => c.statBoost.stat !== "spellPower").every((c) => c.takeCost <= 2));
    const sem2 = createClassDeck(() => Math.random().toString(), 2);
    assert.equal(sem2.length, BALANCE.classDeckSize);
    assert.ok(count(sem2, "spellPower") > count(sem2, "intelligence") && count(sem2, "spellPower") > count(sem2, "charm"));
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

test("정규수업: 체력토큰이 모자라면 매력토큰이 아무리 많아도 카드를 못 산다 (토큰은 서로 바꿀 수 없다)", () => {
  const state = newGame(2);
  const id = state.classPickOrder[0];
  const p = state.players[id];
  const card = state.classMarket[0];
  p.staminaTokens = card.takeCost - 1;
  p.charmTokens = 99;
  assert.throws(() => takeClassCard(state, id, card.id), /체력토큰이 부족/);
  p.staminaTokens = card.takeCost;
  takeClassCard(state, id, card.id);
  assert.equal(p.charmTokens, 99, "매력토큰은 그대로");
  assert.equal(p.classCards.length, 1);
});

// ── 3주차: 자율활동 ──

test("자율활동: 먼저 모두 고르고(선택은 모두에게 공개), 모두 고른 뒤에야 선택한 순서대로 하나씩 진행한다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 3, 1);
  const [a, b, c] = state.activityOrder;
  state.creatureDeck.push(creature("대지의 수호자"), creature("정령 고릴라"));
  state.players[c].staminaTokens = 0; // 열린 카드가 모두 체력토큰이 필요한 육지 동물이라 가져갈 수 있는 카드가 없다
  const before = Object.fromEntries(state.turnOrder.map((id) => [id, state.players[id].tournamentTrack]));
  selectActivity(state, a, "tournament");
  assert.equal(state.activityStage, "choose");
  assert.deepEqual(state.activityChoices, [{ playerId: a, activityId: "tournament", targetPlayerId: undefined }]);
  assert.equal(state.players[a].tournamentTrack, before[a], "고르는 것만으로는 효과가 처리되지 않는다");
  selectActivity(state, b, "tournament");
  selectActivity(state, c, "creature");
  assert.equal(state.activityStage, "resolve");
  assert.deepEqual(state.activityChoices.map((x) => x.playerId), [a, b, c], "고른 순서대로 진행한다");
  assert.equal(state.activityResolvePointer, 0);
  assert.equal(state.players[a].tournamentTrack, before[a], "진행이 시작되기 전");
  assert.throws(() => selectActivity(state, a, "lab"), /이미 모두 활동을 골랐어요/);
  assert.equal(canAdvanceResolution(state), true);
  advanceResolution(state);
  assert.equal(state.pendingRoll?.kind, "tournament", "토너먼트는 주문력만큼 주사위를 굴린다");
  rollAll(state);
  assert.ok(state.players[a].tournamentTrack > before[a]);
  assert.equal(state.players[b].tournamentTrack, before[b], "한 번에 한 명씩 진행한다");
  assert.equal(state.activityResults.length, 1);
  assert.equal(state.activityResults[0].playerId, a);
  assert.equal(state.activityResolvePointer, 1);
  advanceResolution(state);
  rollAll(state);
  assert.ok(state.players[b].tournamentTrack > before[b]);
  advanceResolution(state);
  assert.equal(state.activityResults.length, 3);
});

test("카드를 여는 구역 중 연구실·주문 대결은 지력토큰이 필요하다. 마법생물 조련·비밀의 방은 들지 않는다", withOpenCost(() => {
  const state = newGame(3);
  toActivity(state, 0);
  setTokens(state, 0);
  const [a] = state.activityOrder;
  const avail = availableActivities(state, a);
  assert.ok(avail.includes("tournament") && avail.includes("creature") && avail.includes("exploration"), "지력토큰이 없어도 고를 수 있다");
  assert.ok(!avail.includes("lab") && !avail.includes("duel"));
  assert.throws(() => selectActivity(state, a, "lab"), /지력토큰/);
  state.players[a].intelligenceTokens = 1;
  selectActivity(state, a, "lab");
  assert.equal(state.players[a].intelligenceTokens, 0);
}));

test("조련에 낼 지력·체력·매력토큰이 하나도 없으면 마법생물 조련을 고를 수 없다", () => {
  const state = newGame(3);
  toActivity(state, 0);
  setTokens(state, 0, 0);
  const [a] = state.activityOrder;
  assert.ok(!availableActivities(state, a).includes("creature"));
  assert.throws(() => selectActivity(state, a, "creature"), /토큰/);
  state.players[a].charmTokens = 1;
  assert.ok(availableActivities(state, a).includes("creature"));
});

test("기본 설정에서는 어떤 구역도 카드를 열 때 지력토큰이 들지 않는다", () => {
  assert.deepEqual(BALANCE.openCardCostActivities, []);
  const state = newGame(3);
  toActivity(state, 0);
  setTokens(state, 3);
  const [a] = state.activityOrder;
  const avail = availableActivities(state, a);
  assert.ok(avail.includes("lab") && avail.includes("duel") && avail.includes("creature") && avail.includes("exploration"));
});

test("마법생물 조련·비밀의 방은 카드를 열어도 지력토큰이 들지 않는다", () => {
  const state = newGame(3);
  toActivity(state, 2);
  setTokens(state, 3);
  const [a, b] = state.activityOrder;
  selectActivity(state, a, "creature");
  selectActivity(state, b, "exploration");
  assert.equal(state.players[a].intelligenceTokens, 2);
  assert.equal(state.players[b].intelligenceTokens, 2);
});

test("구역에 처음 고른 사람이 지력토큰 1개를 내고 카드 2장을 연다. 두 번째 참가자는 지력토큰을 내지 않는다", withOpenCost(() => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 3);
  const [a, b] = state.activityOrder;
  state.labPile.draw.push(labCard("든든 도시락"), labCard("마법 안경"));
  selectActivity(state, a, "lab");
  assert.equal(state.players[a].intelligenceTokens, 4);
  selectActivity(state, b, "lab");
  assert.equal(state.players[b].intelligenceTokens, 5, "이미 열리는 구역이라 지력토큰이 들지 않는다");
  finishChoosing(state);
  advanceResolution(state);
  assert.equal(state.activityOffers.lab?.cards.length, 2, "공개된 카드는 모두가 볼 수 있다");
}));

test("마법생물 조련: 먼저 온 사람이 원하는 카드를 가져가고, 속성·종류가 정한 토큰을 종류별로 원하는 만큼 내 주사위를 굴린다. 남는 카드는 두 번째 참가자가 고른다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 2);
  const [a, b] = state.activityOrder;
  state.creatureDeck.push(creature("하늘의 신비"), creature("하늘의 꽃마녀")); // 하늘·식물 = 지력·매력토큰 (기준 수치 20 / 8)
  selectActivity(state, a, "creature");
  selectActivity(state, b, "creature"); // 두 번째 참가자는 매력토큰 1개를 낸다
  finishChoosing(state);
  advanceResolution(state);
  assert.deepEqual(state.pendingPick, { playerId: a, activityId: "creature", mode: "take" });
  assert.equal(canAdvanceResolution(state), false);
  assert.throws(() => chooseActivityCard(state, b, "test-하늘의 꽃마녀"), /고를 수 없습니다/);
  chooseActivityCard(state, a, "test-하늘의 꽃마녀");
  assert.equal(state.pendingRoll?.kind, "creature");
  assert.deepEqual(state.pendingRoll?.entries[0].diceChoices, [{ stat: "intelligence", max: 5 }, { stat: "charm", max: 3 }], "가진 지력·매력토큰 전부까지 낼 수 있다");
  assert.equal(state.players[a].intelligenceTokens, 5, "굴리기 전에는 토큰을 내지 않는다");
  assert.throws(() => submitRoll(state, a, undefined, { intelligence: 6 }), /지력토큰을 0~5개/);
  assert.throws(() => submitRoll(state, a, undefined, { intelligence: 0, charm: 0 }), /1개 이상/);
  submitRoll(state, a, undefined, { intelligence: 2, charm: 0 });
  assert.equal(state.players[a].intelligenceTokens, 3, "고른 만큼 지력토큰을 낸다");
  assert.equal(state.players[a].charmTokens, 3, "안 낸 매력토큰은 그대로");
  assert.equal(state.pendingRoll?.entries[0].diceCount, 2, "낸 토큰 개수만큼 주사위를 굴린다");
  assert.equal(state.players[a].creatures.length, 0, "주사위를 굴려 성공해야 조련된다");
  rollWith(state, { [a]: [6, 6] });
  assert.deepEqual(state.players[a].creatures.map((c) => c.name), ["하늘의 꽃마녀"]);
  assert.equal(state.pendingPick, null);
  assert.equal(state.activityResolvePointer, 1, "다음 사람 진행으로 넘어간다");
  advanceResolution(state);
  assert.equal(state.pendingPick?.playerId, b, "카드가 한 장 남았어도 두 번째 참가자가 직접 고른다");
  chooseActivityCard(state, b, "test-하늘의 신비");
  assert.equal(state.pendingRoll?.entries[0].diceCount, 7, "지력 5 + 매력 2(참가비 1개를 낸 뒤) = 최대 주사위 7개 (기본값은 최대)");
  rollWith(state, { [b]: [6, 6, 6, 6, 6, 6, 6] });
  assert.deepEqual(state.players[b].creatures.map((c) => c.name), ["하늘의 신비"]);
  assert.equal(state.players[b].intelligenceTokens, 0);
  assert.equal(state.players[b].charmTokens, 0, "참가비 1개 + 조련에 2개를 냈다");
  assert.equal(state.activityOffers.creature?.cards.length, 0);
});

test("마법생물 조련: 필요한 종류의 토큰이 없으면 카드를 가져가지 못하고, 남은 카드는 두 번째 참가자가 고른다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 0, 0);
  const [a, b] = state.activityOrder;
  state.creatureDeck.push(creature("대지의 수호자"), creature("정령 고릴라")); // 육지·동물 = 체력토큰만 (기준 수치 12 / 8)
  Object.assign(state.players[b], { charmTokens: 1, staminaTokens: 2 });
  selectActivity(state, a, "creature");
  selectActivity(state, b, "creature"); // 참가비로 매력토큰 1개
  finishChoosing(state);
  advanceResolution(state);
  assert.equal(state.pendingPick, null, "체력토큰이 없어 가져올 수 있는 카드가 없으면 고를 것도 없다");
  assert.equal(state.players[a].creatures.length, 0);
  assert.equal(state.activityResolvePointer, 1);
  advanceResolution(state);
  assert.equal(state.pendingPick?.playerId, b, "두 장이 그대로 남아 있으니 두 번째 참가자가 고른다");
  chooseActivityCard(state, b, "test-대지의 수호자");
  assert.deepEqual(state.pendingRoll?.entries[0].diceChoices, [{ stat: "stamina", max: 2 }], "체력토큰은 가진 2개까지");
  rollWith(state, { [b]: [6, 6] });
  assert.equal(state.players[b].creatures[0].name, "대지의 수호자");
});

test("마법생물 조련: 낸 토큰만큼 굴린 주사위 합이 생물마다 고정된 기준 수치 이상이어야 성공하고, 실패하면 토큰만 잃고 카드는 구역에 돌아간다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 2);
  const [a, b] = state.activityOrder;
  state.creatureDeck.push(creature("하늘의 신비"), creature("하늘의 꽃마녀")); // 기준 20 / 8
  selectActivity(state, a, "creature");
  selectActivity(state, b, "creature");
  finishChoosing(state);
  advanceResolution(state);
  chooseActivityCard(state, a, "test-하늘의 꽃마녀");
  submitRoll(state, a, undefined, { intelligence: 1, charm: 0 });
  rollWith(state, { [a]: [6] }); // 6 < 8: 실패
  assert.equal(state.players[a].creatures.length, 0);
  assert.equal(state.players[a].intelligenceTokens, 4, "실패해도 낸 토큰은 돌려받지 못한다");
  assert.ok(state.log.some((l) => l.message.includes("조련 실패")));
  assert.equal(state.activityOffers.creature?.cards.length, 2, "실패한 카드는 구역으로 돌아간다");
  advanceResolution(state);
  assert.equal(state.pendingPick?.playerId, b, "두 번째 참가자가 돌아온 카드에 도전할 수 있다");
  chooseActivityCard(state, b, "test-하늘의 꽃마녀");
  submitRoll(state, b, undefined, { intelligence: 2, charm: 0 });
  rollWith(state, { [b]: [4, 4] }); // 8 ≥ 8: 성공 (기준과 같아도 성공)
  assert.deepEqual(state.players[b].creatures.map((c) => c.name), ["하늘의 꽃마녀"]);
});

test("연구실 실험: 카드 2장을 열어 원하는 카드를 체력토큰을 내고 가져가고, 남는 카드는 두 번째 참가자가 가져간다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 2);
  const [a, b] = state.activityOrder;
  Object.assign(state.players[a], { intelligenceTokens: 3 });
  Object.assign(state.players[b], { intelligenceTokens: 2 });
  state.labPile.draw.push(labCard("든든 도시락"), labCard("마법 안경")); // 체력토큰 0개 / 1개
  selectActivity(state, a, "lab");
  selectActivity(state, b, "lab");
  finishChoosing(state);
  advanceResolution(state);
  assert.equal(state.activityOffers.lab?.cards.length, 2);
  chooseActivityCard(state, a, "test-마법 안경");
  assert.equal(state.pendingRoll?.kind, "lab");
  assert.equal(state.pendingRoll?.entries[0].diceChoiceMax, 3, "카드를 보고 지력토큰을 1~3개 사이에서 고른다");
  assert.equal(state.pendingRoll?.entries[0].diceCount, BALANCE.labDefaultDice, "굴림 버튼의 기본값");
  assert.equal(state.players[a].intelligenceTokens, 3, "굴리기 전에는 토큰을 내지 않는다");
  assert.throws(() => submitRoll(state, a, 4), /지력토큰을 1~3개/);
  assert.throws(() => submitRoll(state, a, 0), /지력토큰을 1~3개/);
  submitRoll(state, a, 3);
  assert.equal(state.pendingRoll?.entries[0].diceCount, 3, "지력토큰 3개를 내고 주사위 3개를 굴린다 (체력토큰은 카드 비용에만 쓴다)");
  assert.equal(state.players[a].intelligenceTokens, 0);
  assert.equal(state.players[a].equipment.length, 0, "주사위로 성공해야 효과를 받는다");
  rollWith(state, { [a]: [6] });
  assert.ok(state.players[a].equipment.some((c) => c.name === "마법 안경"), "시험 대비 카드는 다음 시험까지 보관한다");
  advanceResolution(state); // 남은 "든든 도시락"(무료)을 두 번째 참가자가 직접 고른다
  assert.equal(state.pendingPick?.playerId, b);
  chooseActivityCard(state, b, "test-든든 도시락");
  submitRoll(state, b, 1);
  assert.equal(state.pendingRoll?.entries[0].diceCount, 1, "1개만 내고 굴린다");
  assert.equal(state.players[b].intelligenceTokens, 1, "안 낸 지력토큰은 다시 굴리기에 쓸 수 있다");
  rollWith(state, { [b]: [3] });
  assert.equal(state.players[b].pendingStaminaTokens, 2);
  assert.equal(state.activityOffers.lab?.cards.length, 0);
});

test("연구실 실험: 비용이 모자란 카드는 못 고르고, 가져가지 않고 넘어가면 두 번째 참가자가 고른다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 0);
  const [a, b] = state.activityOrder;
  state.players[b].staminaTokens = 2; // 카드 2개 (참가비는 매력토큰)
  state.labPile.draw.push(labCard("든든 도시락"), labCard("마법약 실험")); // 체력토큰 0개 / 2개
  selectActivity(state, a, "lab");
  selectActivity(state, b, "lab");
  finishChoosing(state);
  advanceResolution(state);
  assert.equal(state.pendingPick?.playerId, a);
  assert.throws(() => chooseActivityCard(state, a, "test-마법약 실험"), /비용이 모자라서/);
  chooseActivityCard(state, a, null); // 가져가지 않고 넘어감
  assert.equal(state.pendingPick, null);
  assert.equal(state.activityOffers.lab?.cards.length, 2);
  advanceResolution(state);
  assert.equal(state.pendingPick?.playerId, b);
  chooseActivityCard(state, b, "test-마법약 실험");
  rollWith(state, { [b]: [6] });
  assert.equal(state.players[b].staminaTokens, 0);
});

test("연구실 실험: 합이 목표값(labTarget)에 못 미치면 실험이 실패해 효과가 없고 카드는 버려진다", () => {
  const state = newGame(2);
  toActivity(state);
  setTokens(state, 1);
  state.players[state.activityOrder[0]].intelligenceTokens = 0;
  const [a] = state.activityOrder;
  state.labPile.draw.push(labCard("특별 개인 지도"), labCard("마법 안경"));
  selectActivity(state, a, "lab");
  finishChoosing(state);
  advanceResolution(state);
  const before = state.players[a].intelligence;
  chooseActivityCard(state, a, "test-특별 개인 지도"); // 지력토큰 0개 → 주사위 1개
  assert.equal(state.pendingRoll?.entries[0].diceCount, 1, "지력토큰이 없어도 주사위 1개는 굴린다");
  const discardBefore = state.labPile.discard.length;
  rollWith(state, { [a]: [1] });
  assert.equal(state.players[a].intelligence, before, "실패하면 능력치가 오르지 않는다");
  assert.ok(state.labPile.discard.length > discardBefore);
  assert.ok(state.log.some((l) => l.message.includes("실험 실패")));
});

test("비밀의 방: 먼저 온 사람이 겪을 카드를 고르고(반드시 골라야 함), 남는 카드는 두 번째 참가자가 겪는다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 2);
  const [a, b] = state.activityOrder;
  state.explorationPile.draw.push(safeExploration(1), safeExploration(0));
  selectActivity(state, a, "exploration");
  selectActivity(state, b, "exploration");
  finishChoosing(state);
  advanceResolution(state);
  assert.equal(state.pendingPick?.playerId, a);
  assert.throws(() => chooseActivityCard(state, a, null), /골라야 해요/);
  chooseActivityCard(state, a, "test-safe-0");
  assert.equal(state.pendingPick, null);
  assert.ok(state.log.some((l) => l.message.includes("비밀의 방") && l.message.startsWith(state.players[a].name)));
  assert.equal(state.activityOffers.exploration?.cards.length, 1);
  advanceResolution(state);
  assert.equal(state.pendingPick?.playerId, b, "남은 카드가 한 장이어도 두 번째 참가자가 직접 고른다");
  chooseActivityCard(state, b, "test-safe-1");
  assert.equal(state.activityOffers.exploration?.cards.length, 0, "남은 카드를 두 번째 참가자가 가져갔다");
});

test("협력 탐험: 협력 카드를 고르면 기다리고, 합류하면 둘의 합으로 판정하며 남은 카드는 버려진다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 2);
  const [a, b] = state.activityOrder;
  state.explorationPile.draw.push(safeExploration(0), coopCard());
  const charmB = state.players[b].charmTokens;
  selectActivity(state, a, "exploration");
  selectActivity(state, b, "exploration");
  assert.equal(state.players[b].charmTokens, charmB - 1, "두 번째 참가자는 매력토큰 1개를 더 낸다");
  finishChoosing(state);
  advanceResolution(state);
  chooseActivityCard(state, a, "coop-test");
  assert.equal(state.pendingRoll, null, "혼자서는 굴리지 않고 친구를 기다린다");
  assert.equal(state.coopWaiting?.playerId, a);
  assert.equal(state.activityResolvePointer, 1, "진행은 다음 사람에게 넘어간다");
  // 판정을 확실히 성공시키기 위해 주문력을 크게 올려 둔다
  state.players[a].spellPower = 20;
  state.players[b].spellPower = 20;
  advanceResolution(state);
  assert.equal(state.coopWaiting, null);
  assert.ok(state.explorationPile.discard.some((c) => c.id === "test-safe-0"), "남은 카드는 버려진다");
  assert.deepEqual((state.pendingRoll as GameState["pendingRoll"])?.entries.map((e) => e.playerId).sort(), [a, b].sort());
  rollWith(state, { [a]: [6, 6], [b]: [6, 6] }); // 둘의 합 24 ≥ 목표
  assert.equal(state.players[a].spellPower, 21);
  assert.equal(state.players[b].spellPower, 21);
});

test("비밀의 방: 카드가 정한 지력 또는 체력토큰을 내고 낸 개수만큼 주사위를 굴려 합이 목표값(난이도 × 기준 능력치) 이상이면 성공한다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  state.explorationPile.draw.push(explorationByName("잊혀진 교실"), explorationByName("먼지 쌓인 서고")); // 지력 판정
  Object.assign(state.players[a], { intelligence: 3, intelligenceTokens: 3 });
  const credit = state.players[a].credit;
  selectActivity(state, a, "exploration");
  finishChoosing(state);
  advanceResolution(state);
  chooseActivityCard(state, a, "test-잊혀진 교실");
  assert.equal(state.pendingRoll?.kind, "exploration");
  assert.equal(state.pendingRoll?.entries[0].diceCount, 3, "지력토큰 3개를 내고 주사위 3개를 굴린다");
  rollWith(state, { [a]: [6, 6, 6] });
  assert.equal(state.players[a].credit, credit + 1, "합이 목표값 이상이라 성공 보상(학점 +1)");
});

test("비밀의 방: 합이 목표값에 못 미치면 실패 효과를 받는다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  state.explorationPile.draw.push(explorationByName("잊혀진 교실"), explorationByName("먼지 쌓인 서고"));
  Object.assign(state.players[a], { intelligence: 3, intelligenceTokens: 3 });
  const credit = state.players[a].credit;
  selectActivity(state, a, "exploration");
  finishChoosing(state);
  advanceResolution(state);
  chooseActivityCard(state, a, "test-잊혀진 교실");
  rollWith(state, { [a]: [1, 1, 1] });
  assert.equal(state.players[a].credit, credit);
  assert.equal(state.players[a].pendingStaminaTokens, -1, "실패하면 다음 달 체력토큰 -1");
});

test("협력 탐험: 끝까지 친구가 없으면 무효가 된다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  setTokens(state, 0);
  state.explorationPile.draw.push(safeExploration(0), coopCard());
  const before = { ...state.players[a] };
  selectActivity(state, a, "exploration");
  selectActivity(state, b, "tournament");
  advanceResolution(state);
  chooseActivityCard(state, a, "coop-test");
  assert.equal(state.coopWaiting?.playerId, a);
  advanceResolution(state);
  rollAll(state); // b의 토너먼트 주사위
  assert.equal(state.pendingRoll, null, "혼자 굴리는 탐험 판정은 없다");
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
  selectActivity(state, b, "exploration"); // 이 구역은 이제 가득 찬다
  finishChoosing(state);
  advanceResolution(state);
  chooseActivityCard(state, a, "test-safe-0");
  assert.equal(state.coopWaiting, null);
  advanceResolution(state);
  assert.equal(state.coopWaiting, null, "합류할 사람이 없으니 협력 카드가 열리면 안 된다");
  assert.ok(state.explorationPile.discard.some((c) => c.id === "coop-test"));
});

test("주문 대결: 이긴 사람이 공개된 마도서 중 1장을 고른다", withOpenCost(() => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 0);
  const [a, b, c] = state.activityOrder;
  state.grimoirePile.draw.push(grimoire("초급 주문집"), grimoire("반짝 연습장"));
  selectActivity(state, a, "duel", b);
  assert.equal(state.players[a].intelligenceTokens, 4, "도전자가 마도서를 열며 지력토큰 1개를 낸다");
  assert.equal(state.activityOrder[state.activityTurnPointer], c, "지목당한 b는 차례를 건너뛴다");
  selectActivity(state, c, "tournament");
  assert.equal(state.activityStage, "resolve");
  assert.deepEqual(state.activityChoices.map((x) => x.playerId), [a, c], "지목당한 사람은 따로 진행하지 않는다");
  advanceResolution(state);
  assert.equal(state.activityOffers.duel?.cards.length, 2);
  rollWith(state, { [a]: [6, 6], [b]: [1, 1] });
  const pick = state.pendingPick;
  assert.ok(pick && pick.mode === "reward" && pick.playerId === a, "이긴 사람이 마도서를 고른다");
  assert.throws(() => chooseActivityCard(state, pick.playerId, null), /골라야 해요/);
  const winner = state.players[pick.playerId];
  const stat = grimoire("초급 주문집").statBoost.stat;
  const before = winner[stat];
  chooseActivityCard(state, winner.id, "test-초급 주문집");
  assert.equal(winner[stat], before + 1);
  assert.deepEqual(winner.grimoires.map((g) => g.name), ["초급 주문집"]);
  assert.equal(state.pendingPick, null);
  assert.equal(state.activityResolvePointer, 1, "보상을 고른 뒤 다음 진행으로 넘어간다");
  assert.equal(state.activityOffers.duel?.cards.length, 1);
}));

test("자율활동이 끝나면 아무도 가져가지 않은 공개 카드는 버림 더미로 돌아간다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  setTokens(state, 0);
  state.creatureDeck.push(creature("대지의 수호자"), creature("정령 고릴라")); // 둘 다 체력토큰이 필요한 육지 동물이라 체력토큰이 0개면 가져갈 수 없다
  selectActivity(state, a, "creature"); // 체력토큰이 없으면 아무것도 못 가져간다
  selectActivity(state, b, "tournament");
  advanceResolution(state);
  advanceResolution(state);
  rollAll(state); // b의 토너먼트 주사위
  assert.equal(state.round, 2);
  assert.deepEqual(state.activityOffers, {});
  assert.equal(state.creatureDeck.length + state.creatureDiscard.length + state.players[a].creatures.length + state.players[b].creatures.length, CREATURE_CARDS.length + 2); // 위에서 덱에 더한 2장 포함
});

test("자율활동 구역은 최대 2명, 두 번째 참가자는 매력토큰 1개를 더 낸다 (체력토큰으로는 낼 수 없다)", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b, c] = state.activityOrder;
  setTokens(state, 5, 0);
  selectActivity(state, a, "tournament");
  assert.deepEqual(state.activitySlots.tournament, [a]);
  assert.ok(!availableActivities(state, b).includes("tournament"), "체력토큰이 많아도 매력토큰이 없으면 못 들어간다");
  assert.throws(() => selectActivity(state, b, "tournament"), /매력토큰 1개가 더 필요/);
  state.players[b].charmTokens = 1;
  selectActivity(state, b, "tournament");
  assert.equal(state.players[b].charmTokens, 0);
  assert.equal(state.players[b].staminaTokens, 5, "체력토큰은 그대로");
  assert.deepEqual(state.activitySlots.tournament, [a, b]);
  state.players[c].charmTokens = 5;
  assert.throws(() => selectActivity(state, c, "tournament"), /이미 두 명/);
  assert.ok(!availableActivities(state, c).includes("tournament"));
});

test("마법 토너먼트: 주문력 수치만큼 주사위를 굴려 합친 칸만큼 전진하고, 트랙에는 상한이 없다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  state.players[a].spellPower = 8;
  state.players[a].manaTokens = 8;
  state.players[a].tournamentTrack = 9;
  selectActivity(state, a, "tournament");
  finishChoosing(state);
  advanceResolution(state);
  assert.equal(state.pendingRoll?.kind, "tournament");
  assert.equal(state.pendingRoll?.entries.length, 1);
  assert.equal(state.pendingRoll?.entries[0].diceChoiceMax, 8, "마나토큰을 1~8개 사이에서 고른다");
  submitRoll(state, a, 8);
  assert.equal(state.pendingRoll?.entries[0].diceCount, 8, "마나토큰 8개를 내면 주사위 8개");
  assert.equal(state.players[a].manaTokens, 0, "고른 만큼 마나토큰을 낸다");
  assert.equal(state.players[a].tournamentTrack, 9, "굴리기 전에는 전진하지 않는다");
  rollWith(state, { [a]: [6, 6, 6, 6, 6, 6, 6, 6] });
  assert.equal(state.players[a].tournamentTrack, 9 + 48);
});

test("마법 토너먼트: 마나토큰이 없으면 고를 수 없다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  state.players[a].manaTokens = 0;
  assert.ok(!availableActivities(state, a).includes("tournament"));
  assert.throws(() => selectActivity(state, a, "tournament"), /마나토큰/);
});

test("마법 토너먼트: 주사위는 지력토큰으로 다시 굴릴 수 있다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  state.players[a].intelligenceTokens = 1;
  selectActivity(state, a, "tournament");
  finishChoosing(state);
  advanceResolution(state);
  submitRoll(state, a);
  rerollDice(state, a, [0]);
  assert.equal(state.players[a].intelligenceTokens, 0);
});

test("주문 대결: 도전자가 건넨 마나토큰 1개를 더한 뒤 양쪽이 마나토큰을 내고 낸 개수만큼 주사위를 굴려 합이 큰 쪽이 이긴다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  state.grimoirePile = { draw: [], discard: [] };
  Object.assign(state.players[a], { manaTokens: 3 });
  Object.assign(state.players[b], { manaTokens: 2 });
  setTokens(state, 0);
  selectActivity(state, a, "duel", b);
  advanceResolution(state);
  const entries = state.pendingRoll!.entries;
  assert.equal(entries.find((e) => e.playerId === a)!.diceCount, 2, "도전자는 마나토큰 1개를 건네고 남은 2개");
  assert.equal(entries.find((e) => e.playerId === b)!.diceCount, 3, "지목당한 쪽은 건네받은 1개를 더한 3개");
  state.players[a].grimoires = [];
  rollWith(state, { [a]: [1, 1], [b]: [6, 6, 6] });
  assert.ok(state.log.some((l) => l.message.includes(`${state.players[b].name} 승리`)), "합이 더 큰 쪽(지목당한 쪽)이 이긴다");
});

test("주문 대결: 합이 같으면 무승부 — 마도서를 얻는 사람이 없다 (매력이 높아도 이기지 않는다)", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b, c] = state.activityOrder;
  state.players[a].charm = 5;
  Object.assign(state.players[b], { spellPower: 1, charm: 1 });
  state.players[a].spellPower = state.players[b].spellPower = 2;
  setTokens(state, 0);
  Object.assign(state.players[a], { manaTokens: 3 });
  Object.assign(state.players[b], { manaTokens: 2 });
  selectActivity(state, a, "duel", b);
  selectActivity(state, c, "tournament");
  advanceResolution(state);
  rollWith(state, { [a]: [3, 4], [b]: [2, 2, 3] });
  assert.equal(state.pendingPick, null, "무승부면 마도서를 고르는 사람이 없다");
  assert.equal(state.players[a].manaTokens, 0, "낸 마나토큰은 무승부여도 돌려받지 못한다");
  assert.ok(state.log.some((l) => l.message.includes("무승부")));
  assert.equal(state.activityResolvePointer >= 1, true);
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
  assert.deepEqual(state.duels, [{ challengerId: a, targetId: b }]);
  assert.deepEqual(state.activitySlots.duel, [a]); // 지목당한 사람은 구역을 차지하지 않는다
  assert.equal(state.activityOrder[state.activityTurnPointer], c, "지목당한 b는 고르지 않는다");
  selectActivity(state, c, "tournament");
  advanceResolution(state);
  assert.ok(state.pendingRoll, "주사위 굴리기 단계가 시작돼야 한다");
  assert.equal(state.pendingRoll.kind, "duel");
  assert.equal(state.players[a].charm, charmA, "결과가 나오기 전에는 매력이 옮겨지지 않는다");
  assert.throws(() => selectActivity(state, c, "lab"), /이미 모두 활동을 골랐어요/);
  submitRoll(state, a);
  assert.throws(() => submitRoll(state, a), /이미 주사위를 굴렸습니다/);
  assert.throws(() => confirmRoll(state, a), /모두 주사위를 굴린 뒤/);
  submitRoll(state, b);
  // 모두 굴려도 확인하기 전에는 결과를 적용하지 않고 주사위 눈만 보여 준다
  assert.ok(state.pendingRoll, "결과 확인 단계");
  assert.equal(rollRevealed(state), true);
  assert.equal(state.players[a].charm, charmA);
  assert.throws(() => confirmRoll(state, c), /참여하지 않습니다/);
  confirmRoll(state, a);
  assert.ok(state.pendingRoll, "모든 참여자가 확인해야 넘어간다");
  assert.throws(() => submitRoll(state, a), /이미 주사위를 굴렸습니다/);
  confirmRoll(state, b);
  assert.equal(state.pendingRoll, null);
  assert.equal(state.players[a].charm, charmA - 1, "승패(무승부 포함)와 상관없이 매력을 건넨다");
  assert.equal(state.players[b].charm, charmB + 1);
  assert.ok(state.log.some((l) => l.message.includes("매력 1을 건넸어요")));
  assert.equal(state.activityResolvePointer, 1, "다음 활동 진행으로 넘어간다");
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

test("구역 두 번째 참가비는 매력토큰 1개로 낸다", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b] = state.activityOrder;
  setTokens(state, 3, 0);
  selectActivity(state, a, "tournament");
  assert.throws(() => selectActivity(state, b, "tournament"), /매력토큰 1개가 더 필요/);
  state.players[b].charmTokens = 1;
  selectActivity(state, b, "tournament");
  assert.equal(state.players[b].charmTokens, 0);
  assert.equal(state.players[b].staminaTokens, 3, "체력토큰은 그대로 남는다");
  assert.deepEqual(state.activitySlots.tournament, [a, b]);
});

test("지력토큰이 모자라면 매력토큰이 아무리 많아도 카드를 열 수 없다 (토큰은 서로 바꿀 수 없다)", withOpenCost(() => {
  const state = newGame(2);
  toActivity(state, 0);
  setTokens(state, 0, 99);
  const [a] = state.activityOrder;
  assert.ok(!availableActivities(state, a).includes("lab"));
}));

test("마도서 '매혹의 화술서'·'반짝 스타일북'은 매달 준비 때 매력토큰을 1개씩 더 준다", () => {
  const state = newGame(2);
  const books = grimoireTemplates().filter((g) => g.ability?.effect === "charmToken");
  assert.equal(books.length, 2);
  const p = state.players.p0;
  p.grimoires.push({ ...books[0], id: "g1" });
  p.grimoires.push({ ...books[1], id: "g2" });
  let guard = 0;
  while (state.round === 1 && guard++ < 500) botStep(state);
  assert.equal(state.round, 2);
  // 라운드 중 대결에서 같은 마도서를 얻은 사람도 있을 수 있으니 가진 마도서의 매력토큰 능력을 모두 센다
  const bonus = (x: PlayerGameState) => x.grimoires.filter((g) => g.ability?.effect === "charmToken").length;
  assert.ok(bonus(p) >= 2);
  for (const x of Object.values(state.players)) assert.equal(x.charmTokens, effectiveStat(x, "charm") + bonus(x));
});

// ── 주사위 다시 굴리기 (지력토큰) ──

test("주사위 다시 굴리기: 모두 굴린 뒤 확인 전에, 지력토큰 1개당 원하는 주사위만 다시 굴린다", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b, c] = state.activityOrder;
  setTokens(state, 0);
  state.grimoirePile = { draw: [], discard: [] };
  selectActivity(state, a, "duel", b);
  selectActivity(state, c, "tournament");
  advanceResolution(state);
  const roll = state.pendingRoll!;
  assert.throws(() => rerollDice(state, a, [0]), /모두 주사위를 굴린 뒤/);
  submitRoll(state, a);
  submitRoll(state, b);
  const entry = roll.entries.find((e) => e.playerId === a)!;
  // 여러 개 굴리는 상황을 만들어 일부 주사위만 다시 굴리는지 확인한다
  entry.dice = [1, 2, 3];
  state.players[a].intelligenceTokens = 2;
  assert.throws(() => rerollDice(state, a, []), /골라 주세요/);
  assert.throws(() => rerollDice(state, a, [5]), /없는 주사위/);
  assert.throws(() => rerollDice(state, c, [0]), /참여하지 않습니다/);
  assert.throws(() => rerollDice(state, a, [0, 1, 2]), /지력토큰이 부족/);
  assert.equal(state.players[a].intelligenceTokens, 2, "실패하면 토큰이 줄지 않는다");
  rerollDice(state, a, [0, 2]);
  assert.equal(state.players[a].intelligenceTokens, 0);
  assert.equal(entry.dice[1], 2, "고르지 않은 주사위는 그대로");
  assert.ok(entry.dice.every((d) => d >= 1 && d <= 6));
  assert.equal(entry.rerolls, 2);
  assert.throws(() => rerollDice(state, a, [1]), /지력토큰이 부족/);
  state.players[a].intelligenceTokens = 1;
  confirmRoll(state, a);
  assert.throws(() => rerollDice(state, a, [1]), /이미 결과를 확인했어요/);
  assert.throws(() => submitRoll(state, a), /이미 주사위를 굴렸습니다/);
});

test("주사위 다시 굴리기: 매력토큰으로는 대신할 수 없다. 선 정하기 주사위는 다시 굴릴 수 없다", () => {
  const raw = createGame([{ id: "p0", name: "p0" }, { id: "p1", name: "p1" }]);
  for (const e of [...raw.pendingRoll!.entries]) submitRoll(raw, e.playerId);
  assert.throws(() => rerollDice(raw, "p0", [0]), /선 정하기/);
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  state.grimoirePile = { draw: [], discard: [] };
  selectActivity(state, a, "duel", b);
  advanceResolution(state);
  for (const e of [...state.pendingRoll!.entries]) submitRoll(state, e.playerId);
  state.players[a].intelligenceTokens = 0;
  state.players[a].charmTokens = 9;
  assert.throws(() => rerollDice(state, a, [0]), /지력토큰이 부족/);
  assert.equal(state.players[a].charmTokens, 9);
});

test("시험 달(6·12개월)은 1주차(준비) 다음에 곧바로 시험이고, 시험 뒤 4주차(정리)에서 남은 지력토큰도 1개 남길 수 있다", () => {
  const state = newGame(3);
  let guard = 0;
  let sawClassInExamRound = false;
  while (state.phase !== "midterm_exam" && guard++ < 3000) {
    if (state.round === BALANCE.midtermRound && (state.phase === "class" || state.phase === "activity")) sawClassInExamRound = true;
    botStep(state);
  }
  assert.equal(state.phase, "midterm_exam");
  assert.equal(state.round, BALANCE.midtermRound);
  assert.equal(sawClassInExamRound, false, "시험 달에는 정규수업·자율활동이 없다");
  // 1주차에 받은 지력토큰이 그대로 있어 시험 다시 굴리기에 쓸 수 있다
  for (const id of state.turnOrder) assert.ok(state.players[id].intelligenceTokens >= effectiveStat(state.players[id], "intelligence"));
  const id = state.turnOrder.find((x) => state.pendingRoll!.entries.find((e) => e.playerId === x)!.diceCount > 0)!;
  const tokens = state.players[id].intelligenceTokens;
  assert.ok(tokens > 0);
  for (const e of [...state.pendingRoll!.entries]) if (e.dice === null) submitRoll(state, e.playerId);
  rerollDice(state, id, [0]);
  assert.equal(state.players[id].intelligenceTokens, tokens - 1);
  for (const x of state.turnOrder) state.players[x].isBot = false; // 4주차 선택을 직접 하도록
  for (const e of [...state.pendingRoll!.entries]) confirmRoll(state, e.playerId);
  assert.equal(state.phase, "cleanup", "시험 뒤에 4주차(정리)가 이어진다");
  assert.equal(state.round, BALANCE.midtermRound);
  const left = state.players[id].intelligenceTokens;
  assert.equal(state.cleanupKeep[id], null, "남은 지력토큰이 있으면 고를 수 있다");
  chooseKeepToken(state, id, "intelligence");
  for (const x of state.turnOrder) if (state.cleanupKeep[x] === null) chooseKeepToken(state, x, "none");
  assert.equal(state.phase, "class");
  assert.equal(state.round, BALANCE.midtermRound + 1);
  // 2학기: 수업카드 덱이 주문력 위주의 새 덱으로 교체된다
  const sem2 = [...state.classDeck, ...state.classMarket, ...state.classDiscard];
  assert.equal(sem2.length, BALANCE.classDeckSize);
  assert.ok(sem2.filter((c) => c.statBoost.stat === "spellPower").length > BALANCE.classDeckSize * 0.3);
  assert.equal(state.players[id].intelligenceTokens, effectiveStat(state.players[id], "intelligence") + 1, `남긴 지력토큰 1개(남은 ${left}개 중)가 다음 달로 간다`);
});

// ── 시험 ──

test("시험: 시험 카드가 정한 능력치만큼 주사위를 굴리고 보너스 능력치를 더한다 (굴린 뒤 확인해야 결과가 적용된다)", () => {
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
  for (const entry of [...pending.entries]) if (entry.dice === null) submitRoll(state, entry.playerId);
  assert.equal(state.examResults.length, 0, "모두 굴려도 확인하기 전에는 결과가 반영되지 않는다");
  assert.equal(state.phase, "midterm_exam");
  for (const entry of [...pending.entries]) if (!entry.confirmed) confirmRoll(state, entry.playerId);
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

// ── 최종 점수 ──

test("최종 점수 = 주문력 × 학점 + 마법생물 세트(하늘·육지·바다 1장씩) 수 × 세트 점수", () => {
  const state = newGame(2);
  const p = state.players.p0;
  Object.assign(p, { spellPower: 3, credit: 4 });
  p.creatures = [];
  assert.equal(creatureSets(p.creatures), 0);
  assert.equal(finalScore(p), 12);
  const sky = CREATURE_CARDS.filter((c) => c.element === "sky");
  const land = CREATURE_CARDS.filter((c) => c.element === "land");
  const ocean = CREATURE_CARDS.filter((c) => c.element === "ocean");
  p.creatures = [sky[0], sky[1], land[0], ocean[0]].map((c, i) => ({ ...c, id: `f${i}` }));
  assert.equal(creatureSets(p.creatures), 1, "하늘 2·육지 1·바다 1 = 1세트");
  assert.equal(finalScore(p), 12 + BALANCE.creatureSetScore);
  p.creatures.push(...[land[1], ocean[1]].map((c, i) => ({ ...c, id: `g${i}` })));
  assert.equal(creatureSets(p.creatures), 2);
  assert.equal(finalScore(p), 12 + BALANCE.creatureSetScore * 2);
});

test("게임이 끝나면 최종 점수가 가장 높은 플레이어가 승리한다 (동점이면 공동 승리)", () => {
  const state = newGame(3);
  let guard = 0;
  while (state.phase !== "ended" && guard++ < 6000) botStep(state);
  assert.equal(state.phase, "ended");
  const best = Math.max(...state.turnOrder.map((id) => finalScore(state.players[id])));
  assert.ok(state.winnerIds && state.winnerIds.length >= 1);
  for (const id of state.turnOrder) assert.equal(state.winnerIds!.includes(id), finalScore(state.players[id]) === best);
});

// ── 4주차 정리: 남길 토큰 고르기 ──

// 사람 플레이어만 있는 게임 (봇은 남길 토큰을 자동으로 고르지만 사람은 직접 고른다)
function newHumanGame(count: number): GameState {
  const state = createGame(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `p${i}` })));
  let guard = 0;
  while (state.phase === "setup" && guard++ < 100) rollAndConfirm(state);
  return state;
}

// 2인 게임에서 둘 다 토너먼트(토큰을 거의 안 쓴다)를 하고 3주차를 끝내 4주차 정리에 도착한다
function toCleanup(): { state: GameState; a: string; b: string } {
  const state = newHumanGame(2);
  toActivity(state, 5);
  setTokens(state, 3, 3);
  const [a, b] = state.activityOrder;
  selectActivity(state, a, "tournament");
  selectActivity(state, b, "tournament");
  advanceResolution(state);
  rollWith(state, { [a]: [6, 6] });
  advanceResolution(state);
  rollWith(state, { [b]: [6, 6] });
  return { state, a, b };
}

test("4주차 정리: 남은 지력토큰·체력토큰이 있는 사람은 1개를 골라 다음 달로 남기고, 모두 고르면 다음 달이 시작된다", () => {
  const { state, a, b } = toCleanup();
  assert.equal(state.phase, "cleanup");
  assert.deepEqual(state.cleanupKeep, { [a]: null, [b]: null });
  chooseKeepToken(state, a, "intelligence");
  assert.equal(state.phase, "cleanup", "아직 고르지 않은 사람이 있으면 기다린다");
  assert.throws(() => chooseKeepToken(state, a, "stamina"), /이미 골랐어요/);
  chooseKeepToken(state, b, "stamina");
  assert.equal(state.phase, "class");
  assert.equal(state.round, 2);
  const pa = state.players[a];
  const pb = state.players[b];
  assert.equal(pa.intelligenceTokens, effectiveStat(pa, "intelligence") + 1, "지력토큰 1개가 남았다");
  assert.equal(pa.staminaTokens, effectiveStat(pa, "stamina"), "체력토큰은 남기지 않았다");
  assert.equal(pb.staminaTokens, effectiveStat(pb, "stamina") + 1, "체력토큰 1개가 남았다");
  assert.equal(pb.intelligenceTokens, effectiveStat(pb, "intelligence"));
  assert.deepEqual(pa.carryTokens, { intelligence: 0, stamina: 0, charm: 0, mana: 0 }, "남긴 토큰은 한 번만 더해진다");
  assert.equal(pa.charmTokens, effectiveStat(pa, "charm"), "매력토큰과 마나토큰은 남길 수 없다");
});

test("4주차 정리: 남기지 않기를 고를 수 있고, 남아 있지 않은 토큰은 고를 수 없다. 남길 토큰이 없는 사람은 고를 필요가 없다", () => {
  const { state, a, b } = toCleanup();
  state.players[b].intelligenceTokens = 0;
  assert.throws(() => chooseKeepToken(state, b, "intelligence"), /남길 수 없어요/);
  chooseKeepToken(state, a, "none");
  chooseKeepToken(state, b, "stamina");
  assert.equal(state.round, 2);
  assert.equal(state.players[a].staminaTokens, effectiveStat(state.players[a], "stamina"), "남기지 않으면 새 달 토큰만 받는다");
  // 남길 토큰이 하나도 없으면 고를 단계 없이 바로 넘어간다
  const none = newHumanGame(2);
  toActivity(none, 0);
  setTokens(none, 0, 3);
  const [x, y] = none.activityOrder;
  selectActivity(none, x, "tournament");
  selectActivity(none, y, "tournament");
  advanceResolution(none);
  rollWith(none, { [x]: [6, 6] });
  advanceResolution(none);
  rollWith(none, { [y]: [6, 6] });
  // 지력·체력토큰은 없어도 남은 매력토큰은 남길 수 있다 (모든 종류의 토큰 중 1개)
  assert.equal(none.phase, "cleanup", "매력토큰이 남아 있으면 남길 토큰을 고른다");
  const charmBefore = none.players[x].charmTokens;
  chooseKeepToken(none, x, "charm");
  chooseKeepToken(none, y, "none");
  assert.equal(none.round, 2);
  assert.equal(none.players[x].charmTokens, effectiveStat(none.players[x], "charm") + 1, "남긴 매력토큰 1개가 다음 달에 더해진다");
  assert.ok(charmBefore > 0);
  assert.equal(none.players[y].charmTokens, effectiveStat(none.players[y], "charm"));
});

test("4주차 정리: 시험 달에도 남은 토큰(지력·체력·매력·마나) 중에서 고를 수 있다", () => {
  const t = (intelligenceTokens: number, staminaTokens: number, charmTokens: number, manaTokens: number) => ({ intelligenceTokens, staminaTokens, charmTokens, manaTokens });
  assert.deepEqual(keepOptions({ round: BALANCE.midtermRound }, t(3, 2, 0, 0)), ["intelligence", "stamina"]);
  assert.deepEqual(keepOptions({ round: 5 }, t(0, 2, 1, 4)), ["stamina", "charm", "mana"]);
  assert.deepEqual(keepOptions({ round: 5 }, t(0, 0, 0, 0)), []);
});

test("4주차 정리: 봇은 남길 토큰을 자동으로 골라서 게임이 멈추지 않는다", () => {
  const state = newGame(2);
  let guard = 0;
  while (state.round < 3 && guard++ < 2000) botStep(state);
  assert.ok(state.round >= 3);
});

// ── 동점은 공동 순위 ──

// 시험(중간고사 또는 기말고사)이 눈앞에 올 때까지 봇으로 진행한다
function reachExam(state: GameState, phase: "midterm_exam" | "final_exam"): void {
  let guard = 0;
  while (state.phase !== phase && guard++ < 6000) botStep(state);
  assert.equal(state.phase, phase);
}

// 지금 시험의 모든 플레이어 보너스 능력치를 같게 맞추고, 지정한 합계가 나오도록 주사위 눈을 정해 확인한다
function rollExamWith(state: GameState, sums: Record<string, number>): void {
  const card = state.hidden.roll && state.hidden.roll.kind === "exam" ? state.hidden.roll.card : null;
  assert.ok(card);
  for (const id of state.turnOrder) {
    const p = state.players[id];
    p.tempBoosts = {};
    if (card.bonusStat) p[card.bonusStat] = 2;
  }
  rollWith(state, Object.fromEntries(state.turnOrder.map((id) => [id, [sums[id]]])));
}

test("시험: 점수가 같으면 공동 순위 — 같은 순위의 학점을 모두 받는다 (1위 공동이면 둘 다 1위 학점, 다음은 3위)", () => {
  const state = newGame(3);
  reachExam(state, "midterm_exam");
  const [a, b, c] = state.turnOrder;
  const before = Object.fromEntries(state.turnOrder.map((id) => [id, state.players[id].credit]));
  state.players[a].spellPower = 1;
  state.players[b].spellPower = 9; // 예전 동점 규칙(주문력 우선)이었다면 b가 앞섰다
  rollExamWith(state, { [a]: 6, [b]: 6, [c]: 1 });
  const scores = state.examResults[0].scores;
  const rankOf = (id: string) => scores.find((s) => s.playerId === id)!.rank;
  assert.deepEqual([rankOf(a), rankOf(b), rankOf(c)], [1, 1, 3]);
  assert.equal(state.players[a].credit - before[a], 3);
  assert.equal(state.players[b].credit - before[b], 3);
  assert.equal(state.players[c].credit - before[c], 1);
});

test("최종: 시험·토너먼트·최종 점수가 모두 동점이면 공동 순위와 공동 승리로 처리한다", () => {
  const state = newGame(3);
  reachExam(state, "final_exam");
  for (const id of state.turnOrder) {
    Object.assign(state.players[id], { spellPower: 2, credit: 0, creatures: [], tournamentTrack: 0, tempBoosts: {} });
  }
  const [a, b, c] = state.turnOrder;
  // 토너먼트: a·b가 공동 1위(+2), c는 3위라 보상 없음
  state.players[a].tournamentTrack = 10;
  state.players[b].tournamentTrack = 10;
  state.players[c].tournamentTrack = 5;
  rollExamWith(state, { [a]: 6, [b]: 6, [c]: 6 }); // 시험은 모두 공동 1위 (+3)
  assert.equal(state.phase, "ended");
  assert.equal(state.players[a].credit, 3 + BALANCE.tournamentRewards[0]);
  assert.equal(state.players[b].credit, 3 + BALANCE.tournamentRewards[0]);
  assert.equal(state.players[c].credit, 3, "3위는 토너먼트 보상이 없다");
  assert.deepEqual([...state.winnerIds!].sort(), [a, b].sort(), "최종 점수가 같은 a·b가 공동 승리");
});

test("마법생물 조련: 생물의 속성·종류가 낼 수 있는 토큰의 종류를 정하고, 그 종류로 가진 토큰은 전부 낼 수 있다 (하늘=지력)", () => {
  const find = (name: string) => CREATURE_CARDS.find((c) => c.name === name)!;
  assert.deepEqual(creatureTokenTypes(find("하늘의 감시자")), ["intelligence", "stamina"], "하늘 동물 = 지력·체력토큰");
  assert.deepEqual(creatureTokenTypes(find("하늘의 꽃마녀")), ["intelligence", "charm"], "하늘 식물 = 지력·매력토큰");
  assert.deepEqual(creatureTokenTypes(find("대지의 수호자")), ["stamina"], "육지 동물은 체력토큰만");
  assert.deepEqual(creatureTokenTypes(find("심해의 마녀")), ["charm"], "바다 식물은 매력토큰만");
  assert.deepEqual(creatureTokenTypes(find("용암 식물")), ["stamina", "charm"], "육지 식물 = 체력·매력토큰");
  const tokens = { intelligenceTokens: 5, staminaTokens: 1, charmTokens: 0 };
  assert.deepEqual(creatureTokenCaps(tokens, find("용암 식물")), [{ stat: "stamina", max: 1 }], "0개인 종류는 뺀다");
  assert.deepEqual(creatureTokenCaps(tokens, find("하늘의 감시자")), [{ stat: "intelligence", max: 5 }, { stat: "stamina", max: 1 }], "가진 토큰 전부까지 낼 수 있다");
  assert.ok(CREATURE_CARDS.every((c) => c.trainTarget > 0), "생물마다 고정된 기준 수치가 있다");
});

test("주문 대결: 도전자는 마나토큰이 2개 이상(건넬 1개 + 굴릴 1개) 있어야 고를 수 있고, 지목당한 쪽은 건네받은 마나토큰으로 굴린다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  state.grimoirePile = { draw: [], discard: [] };
  state.players[a].manaTokens = 1;
  assert.ok(!availableActivities(state, a).includes("duel"));
  assert.throws(() => selectActivity(state, a, "duel", b), /마나토큰/);
  Object.assign(state.players[a], { manaTokens: 3 });
  Object.assign(state.players[b], { manaTokens: 0 });
  selectActivity(state, a, "duel", b);
  advanceResolution(state);
  const entries = state.pendingRoll!.entries;
  assert.equal(state.players[a].manaTokens, 2, "도전자가 마나토큰 1개를 건넸다");
  assert.equal(state.players[b].manaTokens, 1, "지목당한 쪽은 마나토큰이 없어도 건네받은 1개가 있다");
  assert.equal(entries.find((e) => e.playerId === a)!.diceChoiceMax, 2, "마나토큰을 1~2개 사이에서 고른다");
  assert.equal(entries.find((e) => e.playerId === b)!.diceChoiceMax, 1);
  submitRoll(state, a, 1);
  assert.equal(state.players[a].manaTokens, 1, "고른 만큼만 마나토큰을 낸다");
  assert.ok(state.log.some((l) => l.message.includes("마나토큰")));
});

test("마법생물 조련: 고르는 카드 목록에 속성과 종류가 표시된다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  state.creatureDeck.push(creature("하늘의 꽃마녀"), creature("대지의 수호자"));
  selectActivity(state, a, "creature");
  finishChoosing(state);
  advanceResolution(state);
  const tags = state.activityOffers.creature!.cards.map((c) => c.tags).sort();
  assert.deepEqual(tags, ["육지 · 동물", "하늘 · 식물"]);
});

test("비밀의 방: 카드가 정한 체력토큰을 1~보유 개수 사이에서 골라 내고 낸 개수만큼 주사위를 굴린다 (지력토큰은 그대로)", () => {
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  const card = explorationTemplates().find((c) => c.check?.stat === "stamina")!;
  state.explorationPile.draw.push({ ...card, id: "test-stamina" }, safeExploration(0));
  Object.assign(state.players[a], { staminaTokens: 4, intelligenceTokens: 3 });
  selectActivity(state, a, "exploration");
  finishChoosing(state);
  advanceResolution(state);
  chooseActivityCard(state, a, "test-stamina");
  assert.equal(state.pendingRoll?.entries[0].diceChoiceMax, 4);
  assert.equal(state.pendingRoll?.entries[0].diceChoiceStat, "stamina");
  assert.equal(state.players[a].staminaTokens, 4, "굴리기 전에는 토큰을 내지 않는다");
  assert.throws(() => submitRoll(state, a, 5), /체력토큰을 1~4개/);
  submitRoll(state, a, 3);
  assert.equal(state.pendingRoll?.entries[0].diceCount, 3);
  assert.equal(state.players[a].staminaTokens, 1, "고른 만큼만 낸다");
  assert.equal(state.players[a].intelligenceTokens, 3);
});

test("임시 능력치: 얻은 달의 다음 달 4주차(정리)에 소멸한다 (이번 달 정리에서는 남는다)", () => {
  const state = newGame(2);
  const [a] = state.turnOrder;
  state.players[a].tempBoosts = { intelligence: 2 };
  const round = state.round;
  let guard = 0;
  while (state.round === round && guard++ < 500) botStep(state);
  assert.equal(state.players[a].tempBoosts.intelligence, 2, "얻은 달의 정리에서는 남는다");
  guard = 0;
  while (state.round === round + 1 && guard++ < 500) botStep(state);
  assert.equal(state.players[a].tempBoosts.intelligence, undefined, "다음 달 정리에서 소멸한다");
});

console.log(`
${passed}개 검증 통과
`);
