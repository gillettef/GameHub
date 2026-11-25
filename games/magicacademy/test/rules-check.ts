// 규칙 단위 검증: 엔진 규칙(게임 시작 선 정하기, 선부터 시계방향 진행과 매달 선 교체, 정규수업 공개 시장, 매력기운 참가비,
// 자율활동의 "모두 고르기 → 순서대로 하나씩 진행", 구역의 공개 카드 2장·2인 제한·추가 비용, 마법 겨루기(주문력만큼 주사위·무승부)과 마도서 선택,
// 협력 탐험, 주사위 결과 확인 단계, 마나기운 주사위 통일(굴리기 전 개수 선택·마나기운 다시 굴리기·공짜 1개), 지력기운 카드 열기 비용, 능력치 감쇠,
// 마법 경연(상한 폐지), 시험 카드(주사위 + 능력치 보너스), 동점 공동 순위, 최종 점수)가 기획대로 동작하는지 서버 없이 확인합니다. (사용법: npm run check)
import assert from "node:assert/strict";
import { BOT_PERSONALITIES, chooseActivityAction, choosePick, playClassTurn } from "../src/engine/bot";
import { CREATURE_CARDS, creatureAbilityOf } from "../src/engine/creatures";
import { examTemplates } from "../src/engine/examCards";
import { explorationTemplates } from "../src/engine/explorationCards";
import {
  advanceResolution,
  availableActivities,
  canAdvanceResolution,
  chooseActivityCard,
  confirmRoll,
  labTargetValue,
  createGame,
  creatureSets,
  creatureTarget,
  awardValue,
  graduationAwards,
  projectedScore,
  AWARD_NAME,
  examFuel,
  tokensOf,
  diceSuccessChance,
  canTakeClassCard,
  chooseDream,
  dreamFulfilled,
  classGainApplied,
  currentRoller,
  duelTargets,
  cramSources,
  cramTurn,
  suggestDiceCount,
  finalScore,
  nextStarterIndex,
  rerollDice,
  removePlayerFromGame,
  rollRevealed,
  selectActivity,
  submitRoll,
  takeClassCard,
  ACTIVITY_STAT,
  addCompanion,
  playNote,
  skillDice,
  skillRerolls,
  skillTargets,
} from "../src/engine/engine";
import { labTemplates } from "../src/engine/labCards";
import { effectiveStat, type ActivityId, type ExamCard, type ExplorationCard, type GameState, type LabCard, type PlayerGameState, type StatKey } from "../src/engine/types";
import { BALANCE } from "../src/engine/config";
import { createClassDeck } from "../src/engine/classCards";
import { eventTemplates } from "../src/engine/newsCards";
import { cramStep, rollAndConfirm } from "../scripts/_drive";

// 63-3절(2026-10-18) 능력치 역할 규칙(skillRules)은 전용 검증에서만 켠다. 앞의 검증은 기운 규칙으로 본다
const SKILL63 = { skillRules: BALANCE.skillRules } as Partial<typeof BALANCE>;
Object.assign(BALANCE, { skillRules: false } as Partial<typeof BALANCE>);
// 63절(2026-10-18) 장래희망은 1장을 무작위로 받는다(고르기 없음). 앞의 검증은 2장 중 1장 고르기로 본다
const DREAM63 = { dreamDeal: BALANCE.dreamDeal, dreamChooseRounds: BALANCE.dreamChooseRounds } as Partial<typeof BALANCE>;
Object.assign(BALANCE, { dreamDeal: 2, dreamChooseRounds: 1 } as Partial<typeof BALANCE>);
// 62-7절(2026-10-17) 공개 장수 = 인원·자율활동 공짜 주사위 없음·실패해도 기운 1개 이월과 그에 맞춘 목표값도 전용 검증에서만 켠다 (MARKET62보다 먼저 되돌린다)
const P627_KEYS = ["classMarketExtra", "activityMarketExtra", "activityBaseDice", "failKeepFuel", "trainTargetScale", "exploreTargetMod", "duelCardCount"] as const;
const P627 = JSON.parse(JSON.stringify(Object.fromEntries(P627_KEYS.map((k) => [k, BALANCE[k]])))) as Partial<typeof BALANCE>;
Object.assign(BALANCE, { classMarketExtra: 1, activityMarketExtra: 1, activityBaseDice: null, failKeepFuel: 0, trainTargetScale: 0.56, exploreTargetMod: 1, duelCardCount: 12 } as Partial<typeof BALANCE>);
// 62절(2026-10-17) 활동 카드 한 덱·시험 공고도 전용 검증에서만 켜고, 그 앞의 검증은 61절 기본값으로 본다 (LIGHT보다 먼저 되돌린다)
const MARKET_KEYS = ["activityMarket", "examsAtStart", "fixedExams", "labTargetMod", "duelCardCount"] as const;
const MARKET62 = JSON.parse(JSON.stringify(Object.fromEntries(MARKET_KEYS.map((k) => [k, BALANCE[k]])))) as Partial<typeof BALANCE>;
Object.assign(BALANCE, { activityMarket: false, examsAtStart: true, fixedExams: { midterm: "마법 마라톤", final: "주문 실기" }, labTargetMod: 0, duelCardCount: 16 } as Partial<typeof BALANCE>);
// 61절 라이트 규칙(2026-10-16)은 전용 검증에서만 켜고, 그 앞의 검증은 60절까지의 기본값으로 본다.
// 아래 값을 먼저 되돌려 두어야 뒤의 NEW_RULES·P5·L4 같은 묶음이 60절 시점의 기본값을 기억한다
const LIGHT_KEYS = [
  "classAdvanced", "examsAtStart", "cram", "specialAwards", "duelTieWinner", "duelChallengerBonus", "creatureRareCredit", "creatureRareMin",
  "labCostScale", "baseDice", "duelManaFee", "labTarget", "exploreTargetMod", "trainTargetScale", "graduationCategories", "dreamThreshold",
  "dreamCredit", "classDeckSize", "explorationPenalty", "reroll", "disabledActivities", "fixedExams", "duelDefenderReward",
  "duelTargetKeepsTurn", "duelDefenderStatDice", "labPrintedTargets", "labTargetMod", "duelTargetOnce", "duelWinReward", "duelLearn",
] as const;
const LIGHT = JSON.parse(JSON.stringify(Object.fromEntries(LIGHT_KEYS.map((k) => [k, BALANCE[k]])))) as Partial<typeof BALANCE>;
Object.assign(BALANCE, {
  classAdvanced: true, examsAtStart: false, cram: true, specialAwards: 1, duelTieWinner: "none", duelChallengerBonus: 1, creatureRareCredit: 1,
  creatureRareMin: 16, labCostScale: 1, baseDice: 0, duelManaFee: 1, labTarget: 6, exploreTargetMod: 0, trainTargetScale: 0.46,
  graduationCategories: ["spellPower", "intelligence", "stamina", "creature"], dreamThreshold: 4, dreamCredit: 3, classDeckSize: 36,
  explorationPenalty: true, reroll: true, disabledActivities: [], fixedExams: null, duelDefenderReward: true, duelTargetKeepsTurn: false,
  duelDefenderStatDice: false, labPrintedTargets: false, labTargetMod: 0, duelTargetOnce: false, duelWinReward: { credit: 2 }, duelLearn: false,
} as Partial<typeof BALANCE>);

// 43-5절의 규칙(한 번에 낼 수 있는 기운 = 능력치)은 전용 검증에서만 켜고 나머지 검증은 그 규칙 없이 본다
// (45절에서 기본값이 1이 된 마법 겨루기 마나기운 건네기도 전용 검증에서만 켠다)
const NEW_RULES = { rollLimitByStat: BALANCE.rollLimitByStat, energyCapMultiplier: BALANCE.energyCapMultiplier, duelManaFee: BALANCE.duelManaFee };
const NEWS_EVENTS = BALANCE.schoolNewsEvents;
// 52-11절의 "성장하면 학점 +1"은 전용 검증에서만 켜고, 나머지 검증은 카드·시험·대결로 받는 학점만 본다
const GROWTH_CREDIT = BALANCE.growthCredit;
BALANCE.growthCredit = 0;
Object.assign(BALANCE, { rollLimitByStat: false, schoolNewsEvents: false, duelManaFee: 0 });
// 49절 단순화로 기본값에서 꺼진 규칙들(코드는 설정으로 남아 있다)은 예전 값으로 계속 검증하고, 새 기본값은 전용 검증에서 확인한다
const SIMPLIFIED = {
  starterRule: BALANCE.starterRule,
  classPickStarterLast: BALANCE.classPickStarterLast,
  duelCharmFee: BALANCE.duelCharmFee,
  activitySecondParticipantCost: BALANCE.activitySecondParticipantCost,
  tournamentStaminaBoost: BALANCE.tournamentStaminaBoost,
  tournamentMilestoneStep: BALANCE.tournamentMilestoneStep,
  catchUpBonus: BALANCE.catchUpBonus,
  duelTargetRollsFirst: BALANCE.duelTargetRollsFirst,
  revealOffersAtMonthStart: BALANCE.revealOffersAtMonthStart,
};
Object.assign(BALANCE, {
  starterRule: "charmTokens",
  classPickStarterLast: true,
  duelCharmFee: 1,
  activitySecondParticipantCost: 1,
  tournamentStaminaBoost: 3,
  tournamentMilestoneStep: 70,
  catchUpBonus: 2,
  duelTargetRollsFirst: false,
  revealOffersAtMonthStart: false,
});
// 56절 P5(공모전 개선) 규칙도 전용 검증에서만 켜고, 나머지 검증은 55절 규칙(좌석 순서·장래희망/특별상/대회 카드 없음·대결 승리 학점 1)으로 본다
const P5 = {
  creatureRareCredit: BALANCE.creatureRareCredit,
  creatureSetCredit: BALANCE.creatureSetCredit,
  duelChallengerBonus: BALANCE.duelChallengerBonus,
  turnOrderRule: BALANCE.turnOrderRule,
  dreams: BALANCE.dreams,
  specialAwards: BALANCE.specialAwards,
  tournamentCards: BALANCE.tournamentCards,
  duelWinReward: BALANCE.duelWinReward,
  // 57절: 마법생물과의 교감, 장래희망 기준 4
  creatureBond: BALANCE.creatureBond,
  dreamThreshold: BALANCE.dreamThreshold,
};
// 59절 L4(굴림 상한 +1, 연구실 6, 조련 배율 0.46, 탐험 카드 +2, 대회 카드 +1)도 전용 검증에서만 켠다. 카드에 인쇄한 값은 보정값으로 예전 숫자로 되돌려 본다
const L4 = { rollLimitBonus: BALANCE.rollLimitBonus, labTarget: BALANCE.labTarget, trainTargetScale: BALANCE.trainTargetScale, exploreTargetMod: BALANCE.exploreTargetMod, tournamentTargetMod: BALANCE.tournamentTargetMod };
Object.assign(BALANCE, { rollLimitBonus: 0, labTarget: 5, trainTargetScale: 0.42, exploreTargetMod: -2, tournamentTargetMod: -1 });
Object.assign(BALANCE, {
  creatureBond: false,
  creatureRareCredit: 0,
  creatureSetCredit: 0,
  duelChallengerBonus: 0,
  turnOrderRule: "seat",
  dreams: false,
  specialAwards: 0,
  tournamentCards: false,
  duelWinReward: { credit: 1 },
});
function withBalance(overrides: Partial<typeof BALANCE>, fn: () => void): void {
  const saved = Object.fromEntries(Object.keys(overrides).map((k) => [k, BALANCE[k as keyof typeof BALANCE]]));
  Object.assign(BALANCE, overrides);
  try {
    fn();
  } finally {
    Object.assign(BALANCE, saved);
  }
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// 게임을 만들고 선 정하기 주사위를 굴려 1라운드 정규수업이 시작된 상태로 돌려준다.
// 42절 이후 기운은 수업카드로만 얻어서 시작 기운은 0이지만, 활동·판정 테스트가 "능력치만큼 기운이 있는" 상태에서 시작하도록 기본으로 채워 준다 (startTokens = false면 0)
function newGame(count: number, startTokens = true): GameState {
  const state = createGame(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `p${i}`, isBot: true })));
  let guard = 0;
  while (state.phase === "setup" && guard++ < 100) rollAndConfirm(state);
  assert.equal(state.phase, "class");
  if (startTokens) {
    for (const p of Object.values(state.players)) Object.assign(p, { intelligenceTokens: p.intelligence, staminaTokens: p.stamina, charmTokens: p.charm, manaTokens: p.spellPower });
  }
  return state;
}

// 정규수업을 아무도 카드를 가져가지 않고 넘겨 3주차(자율활동)로 간다. 지력기운은 활동에서 쓸 수 있도록 넉넉히 채워 둔다
function toActivity(state: GameState, intTokens = 5): void {
  while (state.phase === "class") takeClassCard(state, state.classPickOrder[state.classPickPointer], null);
  assert.equal(state.phase, "activity");
  for (const id of state.turnOrder) state.players[id].intelligenceTokens = intTokens;
}

// 모든 플레이어의 체력기운·매력기운(두 번째 참가비용, 기본 3개)을 지정한 값으로 맞춘다
function setTokens(state: GameState, stamina: number, charm = 3): void {
  for (const id of state.turnOrder) Object.assign(state.players[id], { staminaTokens: stamina, charmTokens: charm });
}

// 지금 굴리는 중인 주사위 단계의 참가자만 모두 굴리고 확인한다 (그 결과로 다음 굴림 단계가 시작돼도 이어서 굴리지 않는다)
const rollAll = rollAndConfirm;

// 지금 굴리는 중인 주사위 단계에서 참가자별 주사위 눈을 정해 놓고, 한 명씩 차례대로 굴리고 확인한다 (눈이 정해지지 않은 사람은 굴린 대로 둔다)
function rollWith(state: GameState, dice: Record<string, number[]>): void {
  const pending = state.pendingRoll!;
  for (const entry of [...pending.entries]) {
    // 자동 막기(61절)처럼 서버가 미리 굴려 확정한 칸도 결과가 적용되기 전이라 눈을 정해 둘 수 있다
    if (entry.confirmed) {
      if (dice[entry.playerId]) entry.dice = dice[entry.playerId];
      continue;
    }
    if (entry.dice === null) submitRoll(state, entry.playerId);
    if (dice[entry.playerId]) entry.dice = dice[entry.playerId];
    confirmRoll(state, entry.playerId);
  }
}

// 아직 활동을 고르지 않은 사람들이 (가능한 첫 활동을) 고르게 해서 선택 단계를 끝낸다
function finishChoosing(state: GameState): void {
  while (state.phase === "activity" && state.activityStage === "choose") {
    const id = state.activityOrder[state.activityTurnPointer];
    const options = availableActivities(state, id);
    const pick = options.find((a) => a !== "duel") ?? options[0];
    selectActivity(state, id, pick, pick === "duel" ? duelTargets(state, id)[0] : undefined);
  }
}

// 봇이 한 걸음 진행한다 (굴림 → 공개 카드 선택 → 수업카드 선택 → 활동 진행/선택 순)
function botStep(state: GameState, strategy = BOT_PERSONALITIES[0]): void {
  if (state.pendingRoll) rollAll(state);
  else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, strategy));
  else if (state.phase === "cram") cramStep(state);
    else if (state.phase === "class") playClassTurn(state, state.classPickOrder[state.classPickPointer], strategy);
  else if (state.activityStage === "resolve") advanceResolution(state);
  else {
    const id = state.activityOrder[state.activityTurnPointer];
    const pick = chooseActivityAction(state, id, strategy);
    selectActivity(state, id, pick.activityId, pick.targetPlayerId);
  }
}

// 카드 만들기 (이름으로 원본 카드를 찾아 테스트용 id를 붙인다)
// 61절에서 덱에서 빼거나 효과를 바꾼 카드는 60절 시점의 내용을 검증용으로 남겨 둔다 (그 앞의 검증이 쓰는 카드)
const LEGACY_LAB: Record<string, Omit<LabCard, "id">> = {
  "든든 도시락": { name: "든든 도시락", description: "", cost: 0, kind: "supply", effect: { tokens: { stamina: 2 } }, summary: "체력기운 +2" },
  "마법 안경": { name: "마법 안경", description: "", cost: 0, kind: "exam", effect: { tokens: { intelligence: 2 } }, summary: "지력기운 +2" },
  "특별 개인 지도": { name: "특별 개인 지도", description: "", cost: 0, kind: "study", effect: { stats: { intelligence: 1 } }, summary: "지력 영구 +1" },
  "마법약 실험": { name: "마법약 실험", description: "", cost: 1, kind: "study", effect: { stats: { intelligence: 1, spellPower: 1 } }, summary: "지력 영구 +1, 주문력 영구 +1" },
};
const LEGACY_CREATURE: Record<string, (typeof CREATURE_CARDS)[number]> = {
  "하늘의 신비": { cardNo: 9, name: "하늘의 신비", element: "sky", kind: "plant", trainTarget: 20, ability: creatureAbilityOf("sky", 20), description: "" },
};
const LEGACY_SAFE: Omit<ExplorationCard, "id">[] = [
  { name: "몰래 열린 간식 창고", description: "", success: { tokens: { stamina: 2 } }, failure: {} },
  { name: "반짝이는 버섯 숲", description: "", success: { tokens: { stamina: 2 } }, failure: {} },
];
function creature(name: string) {
  const t = LEGACY_CREATURE[name] ?? CREATURE_CARDS.find((c) => c.name === name);
  assert.ok(t, name);
  return { ...t, id: `test-${name}` };
}
function labCard(name: string): LabCard {
  const t = LEGACY_LAB[name] ?? labTemplates().find((c) => c.name === name);
  assert.ok(t, name);
  return { ...t, id: `test-${name}` };
}
// 61절 카드 (지금 덱의 내용 그대로)
function labCardNow(name: string): LabCard {
  const t = labTemplates().find((c) => c.name === name);
  assert.ok(t, name);
  return { ...t, id: `test-now-${name}` };
}
function safeExploration(index: number): ExplorationCard {
  const t = LEGACY_SAFE[index];
  assert.ok(t);
  return { ...t, id: `test-safe-${index}` };
}
function explorationByName(name: string): ExplorationCard {
  const t = explorationTemplates().find((c) => c.name === name);
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
        // 한 명씩 차례대로 (44-4절): 앞사람이 확인하기 전에는 다음 사람이 굴릴 수 없다
        const [first, second] = last.entries;
        assert.throws(() => submitRoll(state, second.playerId), /내 차례가 아니에요/);
        submitRoll(state, first.playerId);
        assert.equal(rollRevealed(state), true);
        assert.throws(() => submitRoll(state, second.playerId), /내 차례가 아니에요/);
        for (const e of [...last.entries]) {
          if (e.dice === null) submitRoll(state, e.playerId);
          if (!e.confirmed) confirmRoll(state, e.playerId);
          if (e !== last.entries[last.entries.length - 1] && state.phase === "setup") assert.ok(state.pendingRoll === last, "모두 확인하기 전에는 결과가 적용되지 않는다");
        }
      }
      assert.equal(state.phase, "class");
      const top = Math.max(...last.entries.map((e) => e.dice![0]));
      const winners = last.entries.filter((e) => e.dice![0] === top);
      assert.equal(winners.length, 1, "마지막 굴림에서는 단독 1위");
      assert.equal(state.turnOrder[state.startingPlayerIndex], winners[0].playerId);
    }
  }
});

test("자율활동 선택 순서는 선 플레이어부터 시계방향(좌석 순서)이고, 정규수업은 선 다음 사람부터 선이 마지막이다", () => {
  const state = newGame(4);
  const strategy = BOT_PERSONALITIES[0];
  let guard = 0;
  let checked = 0;
  while (state.round < 4 && guard++ < 3000) {
    const n = state.turnOrder.length;
    const expected = Array.from({ length: n }, (_, i) => state.turnOrder[(state.startingPlayerIndex + i) % n]);
    if (state.phase === "class" && state.classPickPointer === 0) {
      assert.deepEqual(state.classPickOrder, [...expected.slice(1), expected[0]]);
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

test("다음 달 선: 매력기운을 가장 많이 남긴 플레이어가 된다 (동점이면 선에서 시계방향으로 가장 가까운 사람, 현재 선이 가장 마지막)", () => {
  const make = (starter: number, tokens: number[]) => {
    const players = Object.fromEntries(tokens.map((t, i) => [`p${i}`, { charm: 2, charmTokens: t, tempBoosts: {} } as unknown as PlayerGameState]));
    return { turnOrder: tokens.map((_, i) => `p${i}`), startingPlayerIndex: starter, players } as unknown as GameState;
  };
  assert.equal(nextStarterIndex(make(1, [0, 3, 1, 0])), 1, "현재 선이 가장 많으면 그대로");
  assert.equal(nextStarterIndex(make(1, [0, 1, 0, 2])), 3, "다른 사람이 가장 많으면 그 사람이 선");
  assert.equal(nextStarterIndex(make(1, [2, 2, 1, 1])), 0, "최고 동점이면 선에서 시계방향으로 가까운 사람 (선 본인은 마지막 순번)");
  assert.equal(nextStarterIndex(make(3, [2, 0, 2, 1])), 0, "시계방향은 좌석 끝에서 처음으로 이어진다");
  assert.equal(nextStarterIndex(make(0, [0, 0, 0, 0])), 1, "모두 0개면 선이 시계방향으로 한 칸 넘어간다");
  assert.equal(nextStarterIndex(make(2, [0, 0, 0, 0])), 3);
});

test("4주차(정리)에서 다음 달 선이 정해져 다음 달 진행 순서에 반영된다", () => {
  const state = newGame(3);
  const oldStarter = state.startingPlayerIndex;
  // 선이 아닌 다른 친구의 매력기운을 가장 많게 만들어 두고, 3주차를 끝까지 진행한다 (매력이 바뀌지 않도록 마법 경연만 고른다)
  const other = (oldStarter + 1) % 3;
  toActivity(state);
  setTokens(state, 3);
  Object.assign(state.players[state.turnOrder[other]], { charmTokens: 9 });
  finishChoosing(state);
  let guard = 0;
  while (state.round === 1 && guard++ < 100) botStep(state);
  assert.equal(state.round, 2);
  assert.equal(state.startingPlayerIndex, other);
  assert.equal(state.classPickOrder[state.classPickOrder.length - 1], state.turnOrder[other], "선은 수업 신청이 마지막");
  assert.ok(state.log.some((l) => l.message.includes("다음 달 선")));
});

test("1주차는 학교 소식뿐이다: 고를 것이 없어 선이 정해지면 바로 정규수업이고, 첫 달은 기운 0으로 시작한다", () => {
  const state = newGame(3, false);
  assert.equal(state.phase, "class", "선이 정해지면 (학교 소식을 보고) 바로 정규수업이다");
  assert.equal(state.news?.name, "평범한 한 달", "행사를 끄면 효과 없는 소식");
  for (const p of Object.values(state.players)) {
    assert.deepEqual([p.intelligenceTokens, p.staminaTokens, p.charmTokens, p.manaTokens], [0, 0, 0, 0]);
  }
  assert.ok(!("chargeSummary" in state) && !("cleanupSummary" in state), "충전·감쇠 요약은 더 이상 없다");
  assert.equal((BALANCE as Record<string, unknown>).statDecay, undefined, "능력치 감쇠는 없어졌다");
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

test("정규수업 덱은 학기마다 인원과 무관하게 36장이고, 1학기는 주문력 과목이 소수·2학기는 더 많다. 과목은 기초 +2·심화 +4의 2단계이고 심화만 선수 조건이 있다 (49절)", () => {
  for (const n of [2, 3, 4, 5]) {
    const state = newGame(n);
    const sem1 = [...state.classDeck, ...state.classMarket];
    assert.equal(sem1.length, BALANCE.classDeckSize);
    const count = (cards: typeof sem1, stat: string) => cards.filter((c) => c.stat === stat).length;
    assert.ok(count(sem1, "spellPower") >= 1 && count(sem1, "spellPower") < count(sem1, "intelligence") + 1);
    const sem2 = createClassDeck(() => Math.random().toString(), 2);
    assert.equal(sem2.length, BALANCE.classDeckSize);
    assert.ok(count(sem2, "spellPower") > count(sem1, "spellPower"), "2학기에는 주문력 과목이 늘어난다");
    for (const c of [...sem1, ...sem2]) {
      assert.equal(c.gain, BALANCE.classTiers[c.level].gain);
      assert.equal(c.minStat, BALANCE.classTiers[c.level].minStat, "심화 과목만 선수 조건이 있다");
    }
    assert.ok(!JSON.stringify(sem1).includes("takeCost") && !JSON.stringify(sem1).includes("statBoost"), "수업카드는 비용도 능력치 증가도 없다");
  }
  assert.deepEqual((["basic", "advanced"] as const).map((l) => BALANCE.classTiers[l].gain), [2, 4]);
  // 한 벌(능력치 하나당 12장)의 구성: 기초 10 · 심화 2
  const deck = createClassDeck(() => Math.random().toString(), 1, 120);
  const intel = deck.filter((c) => c.stat === "intelligence");
  const levels = Object.fromEntries((["basic", "advanced"] as const).map((l) => [l, intel.filter((c) => c.level === l).length]));
  assert.deepEqual(levels, { basic: 30, advanced: 6 }, "능력치 하나에 3벌(36장)이 들어가면 단계별 장수는 10:2");
});

test("정규수업 순서(42절): 선 다음 사람부터 시계방향으로 고르고 선이 마지막이다 (활동은 선이 먼저)", () => {
  for (const n of [2, 3, 4, 5]) {
    const state = newGame(n);
    const fromStarter = Array.from({ length: n }, (_, i) => state.turnOrder[(state.startingPlayerIndex + i) % n]);
    assert.deepEqual(state.classPickOrder, [...fromStarter.slice(1), fromStarter[0]]);
    assert.equal(state.classPickOrder[n - 1], state.turnOrder[state.startingPlayerIndex], "선이 마지막");
    toActivity(state);
    assert.deepEqual(state.activityOrder, fromStarter, "활동 선택은 선부터");
  }
});

// 시장의 카드를 테스트용 카드로 바꾼다
function classCardOf(stat: "intelligence" | "stamina" | "charm" | "spellPower", level: "basic" | "advanced", id: string) {
  const { gain, minStat } = BALANCE.classTiers[level];
  return { id, name: `테스트 ${stat} ${level}`, description: "", stat, level, gain, minStat };
}

test("정규수업: 수업카드는 무료이고 가져가면 그 과목의 기운을 얻는다 (능력치는 오르지 않는다). 주문력 과목의 기운은 마나기운이다", () => {
  const state = newGame(3, false);
  const [first, second, third] = state.classPickOrder;
  for (const p of Object.values(state.players)) assert.deepEqual([p.intelligenceTokens, p.staminaTokens, p.charmTokens, p.manaTokens], [0, 0, 0, 0], "1주차가 없어서 시작 기운은 0이다");
  state.classMarket = [classCardOf("intelligence", "basic", "c1"), classCardOf("spellPower", "basic", "c2"), classCardOf("charm", "basic", "c3"), classCardOf("stamina", "basic", "c4")];
  assert.throws(() => takeClassCard(state, second, "c1"), /차례가 아닙니다/);
  takeClassCard(state, first, "c1");
  const p1 = state.players[first];
  assert.equal(p1.intelligenceTokens, 2, "기초 과목은 지력기운 +2");
  assert.equal(p1.intelligence, BALANCE.initialStats.intelligence, "능력치(실력)는 오르지 않는다");
  assert.equal(p1.classCards.length, 1);
  assert.deepEqual([p1.staminaTokens, p1.charmTokens, p1.manaTokens], [0, 0, 0]);
  assert.throws(() => takeClassCard(state, second, "c1"), /공개된 수업카드 중에서만/);
  takeClassCard(state, second, "c2");
  assert.equal(state.players[second].manaTokens, 2, "주문력 과목은 마나기운을 준다 (기초 +2)");
  takeClassCard(state, third, null); // 가져가지 않고 넘어간다
  assert.equal(state.phase, "activity");
  assert.equal(state.classMarket.length, 0);
  assert.equal(state.classDiscard.length, 2, "아무도 가져가지 않은 카드는 버림 더미로 간다");
  assert.equal(state.players[third].classCards.length, 0);
});

test("기운 한도는 없다 (43-5절): 수업카드 기운을 모두 받아 계속 모아 둘 수 있다", () => {
  assert.equal(NEW_RULES.energyCapMultiplier, 0, "기본 규칙은 한도 없음");
  const state = newGame(2, false);
  const [first] = state.classPickOrder;
  const p = state.players[first];
  p.intelligenceTokens = 9;
  p.intelligence = 3;
  state.classMarket = [classCardOf("intelligence", "advanced", "c1"), classCardOf("stamina", "basic", "c2"), classCardOf("charm", "basic", "c3")];
  assert.equal(classGainApplied(p, state.classMarket[0]), 4);
  takeClassCard(state, first, "c1");
  assert.equal(p.intelligenceTokens, 13);
});

test("기운 한도 옵션(energyCapMultiplier > 0)을 켜면 한도까지만 늘어나고 넘치는 몫은 사라진다", () => {
  withBalance({ energyCapMultiplier: 2 }, () => {
    const state = newGame(2, false);
    const [first] = state.classPickOrder;
    const p = state.players[first];
    const cap = p.intelligence * 2;
    p.intelligenceTokens = cap - 1;
    state.classMarket = [classCardOf("intelligence", "basic", "c1"), classCardOf("stamina", "basic", "c2"), classCardOf("charm", "basic", "c3")];
    assert.equal(classGainApplied(p, state.classMarket[0]), 1, "한도까지 1만 늘어난다");
    takeClassCard(state, first, "c1");
    assert.equal(p.intelligenceTokens, cap);
    assert.ok(state.log.some((l) => l.message.includes("사라졌어요")), "한도 때문에 사라진 몫을 알려 준다");
  });
});

test("정규수업: 심화 과목은 그 과목 능력치가 minStat 이상이어야 들을 수 있다 (선수과목)", () => {
  const state = newGame(2, false);
  const [first, second] = state.classPickOrder;
  const advMin = BALANCE.classTiers.advanced.minStat!;
  state.classMarket = [classCardOf("intelligence", "advanced", "adv"), classCardOf("intelligence", "basic", "bas"), classCardOf("stamina", "basic", "other")];
  const p = state.players[first];
  p.intelligence = advMin - 1;
  assert.equal(canTakeClassCard(p, state.classMarket[0]), false);
  assert.throws(() => takeClassCard(state, first, "adv"), new RegExp(`심화 과목이라 지력 ${advMin} 이상`));
  assert.equal(p.classCards.length, 0, "못 들으면 아무것도 바뀌지 않는다");
  assert.equal(canTakeClassCard(p, state.classMarket[1]), true, "기초 과목은 언제나 들을 수 있다");
  p.intelligence = advMin;
  takeClassCard(state, first, "adv");
  assert.equal(p.intelligenceTokens, 4, "심화는 +4");
  takeClassCard(state, second, null);
});

test("59절 L4 기본값: 굴림 상한 = 능력치 + 1, 연구실 목표 6, 조련 배율 0.46, 탐험·대회 카드 목표는 카드에 인쇄(보정 0)", () => {
  assert.deepEqual(L4, { rollLimitBonus: 1, labTarget: 6, trainTargetScale: 0.46, exploreTargetMod: 0, tournamentTargetMod: 0 });
  assert.ok(explorationTemplates().filter((c) => c.check).every((c) => c.check!.target >= 6), "탐험 목표는 예전보다 2씩 높다(가장 쉬운 카드 6)");
  withBalance({ ...L4, rollLimitByStat: true }, () => {
    const state = newGame(3);
    toActivity(state, 9);
    const [a] = state.activityOrder;
    Object.assign(state.players[a], { intelligence: 1, intelligenceTokens: 9 });
    state.labPile.draw.push(labCard("든든 도시락"), labCard("마법 안경"));
    selectActivity(state, a, "lab");
    finishChoosing(state);
    advanceResolution(state);
    chooseActivityCard(state, a, "test-마법 안경");
    assert.equal(state.pendingRoll!.entries[0].diceChoiceMax, 2, "지력 1이어도 주사위 2개까지 (실력 + 1)");
    assert.equal(labTargetValue(), 6);
    assert.ok(state.pendingRoll!.lines.some((l) => l.includes("지력 + 1개까지만")), "상한 안내 문구");
  });
});

test("실력만큼만 힘을 낸다 (43-5절): 한 번 굴릴 때 낼 수 있는 재료 기운은 그 능력치까지이고, 남은 기운은 그대로 남는다", () => {
  assert.equal(NEW_RULES.rollLimitByStat, true, "기본 규칙에서 켜져 있다");
  withBalance({ rollLimitByStat: true }, () => {
    const state = newGame(3);
    toActivity(state, 9);
    const [a] = state.activityOrder;
    Object.assign(state.players[a], { intelligence: 2, intelligenceTokens: 9 });
    state.labPile.draw.push(labCard("든든 도시락"), labCard("마법 안경"));
    selectActivity(state, a, "lab");
    finishChoosing(state);
    advanceResolution(state);
    chooseActivityCard(state, a, "test-마법 안경");
    const entry = state.pendingRoll!.entries[0];
    assert.equal(entry.diceChoiceMax, 2, "지력기운이 9개여도 지력 2만큼만 낸다");
    assert.throws(() => submitRoll(state, a, 3), /지력기운을 1~2개/);
    assert.ok(state.pendingRoll!.lines.some((l) => l.includes("지력만큼만")), "상한 때문에 덜 내는 걸 알려 준다");
    submitRoll(state, a, 2);
    assert.equal(state.players[a].intelligenceTokens, 7, "남은 기운은 그대로 남는다");
  });
});

test("52-4절: 함께하면 든든은 없다 — 연구실에 둘이 함께 들어가도 목표값은 그대로", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 2, 3);
  const [a, b] = state.activityOrder;
  selectActivity(state, a, "lab");
  selectActivity(state, b, "lab");
  state.labPile.draw.push(labCard("든든 도시락"), labCard("마법 안경"));
  finishChoosing(state);
  advanceResolution(state);
  chooseActivityCard(state, a, "test-마법 안경");
  const ctx = state.hidden.roll;
  assert.ok(ctx?.kind === "lab");
  assert.equal(ctx.target, labTargetValue(), "둘이어도 목표는 그대로");
  assert.ok(!state.pendingRoll!.lines.some((l) => l.includes("친구와 함께")));
});

test("52-11절: 성장하면 학점도 +1 (조련·탐험·연구실 성공, 마법 겨루기 승리), 졸업식 학점은 4/2/1", () => {
  assert.equal(GROWTH_CREDIT, 1);
  assert.deepEqual(BALANCE.rankPoints, [4, 2, 1]);
  withBalance({ growthCredit: GROWTH_CREDIT }, () => {
    const state = newGame(3);
    toActivity(state);
    setTokens(state, 0);
    const [a, b, c] = state.activityOrder;
    selectActivity(state, a, "duel", b);
    selectActivity(state, c, "tournament");
    advanceResolution(state);
    const before = { spellPower: state.players[a].spellPower, credit: state.players[a].credit };
    rollWith(state, { [a]: [6, 6], [b]: [1, 1] });
    assert.equal(state.players[a].spellPower, before.spellPower + 1, "주문력 성장");
    assert.equal(state.players[a].credit, before.credit + GROWTH_CREDIT + (BALANCE.duelWinReward.credit ?? 0), "성장 학점 + 대결 승리 학점");
    assert.ok(state.log.some((l) => l.message.includes("성장!") && l.message.includes("학점 +1")));
  });
});

// ── 3주차: 자율활동 ──

test("자율활동: 먼저 모두 고르고(선택은 모두에게 공개), 모두 고른 뒤에야 선택한 순서대로 하나씩 진행한다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 3, 1);
  const [a, b, c] = state.activityOrder;
  state.creatureDeck.push(creature("대지의 수호자"), creature("정령 고릴라"));
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
  assert.equal(state.pendingRoll?.kind, "tournament", "마법 경연은 주문력만큼 주사위를 굴린다");
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
  assert.equal(state.pendingPick?.playerId, c, "카드를 고르거나 넘어갈 때까지 진행이 끝나지 않는다");
  chooseActivityCard(state, c, null);
  assert.equal(state.activityResults.length, 3);
});

test("카드를 여는 데 지력기운은 들지 않는다 (38절: 카드 열기는 지적 활동이 아니다). 지력기운이 없어도 5개 구역을 모두 고를 수 있다", () => {
  assert.deepEqual(BALANCE.openCardCostActivities, []);
  const state = newGame(3);
  toActivity(state, 0);
  setTokens(state, 0);
  const [a] = state.activityOrder;
  assert.deepEqual(availableActivities(state, a), ["tournament", "creature", "duel", "exploration", "lab"]);
  selectActivity(state, a, "lab");
  assert.equal(state.players[a].intelligenceTokens, 0);
});



test("마나기운이 없어도 마법생물 조련·별빛 다락방·연구실은 고를 수 있다 (공짜 주사위 1개). 마법 경연·마법 겨루기는 마나기운이 필요하다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 0);
  const [a] = state.activityOrder;
  state.players[a].manaTokens = 0;
  const avail = availableActivities(state, a);
  assert.ok(avail.includes("creature") && avail.includes("exploration") && avail.includes("lab"));
  assert.ok(!avail.includes("tournament") && !avail.includes("duel"));
});

test("구역에 처음 고른 사람이 카드 2장을 연다 (지력기운은 들지 않는다)", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 3);
  const [a, b] = state.activityOrder;
  state.labPile.draw.push(labCard("든든 도시락"), labCard("마법 안경"));
  selectActivity(state, a, "lab");
  assert.equal(state.players[a].intelligenceTokens, 5);
  selectActivity(state, b, "lab");
  assert.equal(state.players[b].intelligenceTokens, 5);
  finishChoosing(state);
  advanceResolution(state);
  assert.equal(state.activityOffers.lab?.cards.length, 2, "공개된 카드는 모두가 볼 수 있다");
});

test("마법생물 조련·별빛 다락방도 카드를 열 때 지력기운이 들지 않는다", () => {
  const state = newGame(3);
  toActivity(state, 2);
  setTokens(state, 3);
  const [a, b, c] = state.activityOrder;
  selectActivity(state, a, "creature");
  selectActivity(state, b, "creature");
  selectActivity(state, c, "exploration");
  for (const id of [a, b, c]) assert.equal(state.players[id].intelligenceTokens, 2);
});

test("마법생물 조련: 먼저 온 사람이 원하는 카드를 가져가고, 매력기운을 1~보유 개수 사이에서 골라 낸 만큼 주사위를 굴린다. 남는 카드는 두 번째 참가자가 고른다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 2);
  const [a, b] = state.activityOrder;
  state.creatureDeck.push(creature("하늘의 신비"), creature("하늘의 꽃마녀")); // 기준 수치 20 / 8 (× trainTargetScale)
  Object.assign(state.players[a], { charmTokens: 5 });
  Object.assign(state.players[b], { charmTokens: 10 });
  selectActivity(state, a, "creature");
  selectActivity(state, b, "creature"); // 두 번째 참가자는 매력기운 1개를 먼저 온 a에게 건넨다 (b 10 → 9, a 5 → 6)
  finishChoosing(state);
  advanceResolution(state);
  assert.deepEqual(state.pendingPick, { playerId: a, activityId: "creature" });
  assert.equal(canAdvanceResolution(state), false);
  assert.throws(() => chooseActivityCard(state, b, "test-하늘의 꽃마녀"), /고를 수 없습니다/);
  chooseActivityCard(state, a, "test-하늘의 꽃마녀");
  assert.equal(state.pendingRoll?.kind, "creature");
  assert.equal(state.pendingRoll?.entries[0].diceToken, "charm", "조련의 주사위 재료는 매력기운이다");
  assert.equal(state.pendingRoll?.entries[0].diceChoiceMax, 6, "가진 매력기운 전부까지 낼 수 있다");
  assert.equal(state.players[a].charmTokens, 6, "굴리기 전에는 기운을 내지 않는다");
  assert.throws(() => submitRoll(state, a, 7), /매력기운을 1~6개/);
  assert.throws(() => submitRoll(state, a, 0), /매력기운을 1~6개/);
  const manaBefore = state.players[a].manaTokens;
  submitRoll(state, a, 2);
  assert.equal(state.players[a].charmTokens, 4, "고른 만큼 매력기운을 낸다");
  assert.equal(state.players[a].manaTokens, manaBefore, "마나기운은 건드리지 않는다");
  assert.equal(state.pendingRoll?.entries[0].diceCount, 2, "낸 기운 개수만큼 주사위를 굴린다");
  assert.equal(state.players[a].creatures.length, 0, "주사위를 굴려 성공해야 조련된다");
  rollWith(state, { [a]: [6, 6] });
  assert.deepEqual(state.players[a].creatures.map((c) => c.name), ["하늘의 꽃마녀"]);
  assert.equal(state.pendingPick, null);
  assert.equal(state.activityResolvePointer, 1, "다음 사람 진행으로 넘어간다");
  advanceResolution(state);
  assert.equal((state.pendingPick as GameState["pendingPick"])?.playerId, b, "카드가 한 장 남았어도 두 번째 참가자가 직접 고른다");
  chooseActivityCard(state, b, "test-하늘의 신비");
  assert.ok((state.pendingRoll?.entries[0].diceCount ?? 0) <= 9, "기본 개수는 가진 매력기운 안에서 정해진다");
  submitRoll(state, b, 9);
  rollWith(state, { [b]: [6, 6, 6, 6, 6, 6, 6, 6, 6] });
  assert.deepEqual(state.players[b].creatures.map((c) => c.name), ["하늘의 신비"]);
  assert.equal(state.players[b].charmTokens, 0);
  assert.equal(state.activityOffers.creature?.cards.length, 0);
});

test("마법생물 조련: 매력기운이 없어도 카드를 골라 공짜 주사위 1개로 도전할 수 있다 (속성·종류는 기운과 무관)", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 0, 1);
  const [a] = state.activityOrder;
  state.players[a].charmTokens = 0;
  state.creatureDeck.push(creature("대지의 수호자"), creature("정령 고릴라")); // 육지·동물 (기준 12 / 8)
  selectActivity(state, a, "creature");
  finishChoosing(state);
  advanceResolution(state);
  assert.equal(state.pendingPick?.playerId, a, "체력·매력기운이 없어도 카드를 가져올 수 있다");
  chooseActivityCard(state, a, "test-정령 고릴라");
  assert.equal(state.pendingRoll?.entries[0].diceCount, 1);
  assert.equal(state.pendingRoll?.entries[0].diceChoiceMax, undefined, "기운을 낼 선택은 없다");
  rollWith(state, { [a]: [1] });
  assert.equal(state.players[a].creatures.length, 0, "기준 수치에 못 미치면 실패");
});

test("마법생물 조련: 낸 매력기운만큼 굴린 주사위 합이 생물마다 고정된 기준 수치 이상이어야 성공하고, 실패하면 기운을 잃고 카드는 버려진다 (52-7절)", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 2);
  const [a, b] = state.activityOrder;
  state.creatureDeck.push(creature("하늘의 신비"), creature("하늘의 꽃마녀"));
  const target = creatureTarget(creature("하늘의 꽃마녀"));
  Object.assign(state.players[a], { charmTokens: 4 });
  Object.assign(state.players[b], { charmTokens: 5 }); // 두 번째 참가비 1개를 내고 4개
  selectActivity(state, a, "creature");
  selectActivity(state, b, "creature");
  finishChoosing(state);
  advanceResolution(state);
  chooseActivityCard(state, a, "test-하늘의 꽃마녀");
  submitRoll(state, a, 1);
  rollWith(state, { [a]: [Math.max(1, target - 1)] }); // 기준보다 1 모자라 실패
  assert.equal(state.players[a].creatures.length, 0);
  assert.equal(state.players[a].charmTokens, 4, "실패해도 낸 기운은 돌려받지 못한다 (4 + b가 건넨 1 - 낸 1)");
  assert.ok(state.log.some((l) => l.message.includes("조련 실패")));
  assert.deepEqual(state.activityOffers.creature?.cards.map((c) => c.name), ["하늘의 신비"], "실패한 카드는 구역에 돌아가지 않는다");
  assert.ok(state.creatureDiscard.some((c) => c.name === "하늘의 꽃마녀"), "실패한 카드는 버림 더미로");
  advanceResolution(state);
  assert.equal(state.pendingPick?.playerId, b, "두 번째 참가자는 남은 카드에 도전한다");
  chooseActivityCard(state, b, "test-하늘의 신비");
  const other = creatureTarget(creature("하늘의 신비"));
  submitRoll(state, b, 2);
  rollWith(state, { [b]: [Math.ceil(other / 2), Math.floor(other / 2)] }); // 합이 기준과 같아도 성공
  assert.deepEqual(state.players[b].creatures.map((c) => c.name), ["하늘의 신비"]);
});

test("연구실 실험: 카드 2장을 열어 원하는 카드를 체력기운을 내고 가져가고, 남는 카드는 두 번째 참가자가 가져간다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 2);
  const [a, b] = state.activityOrder;
  Object.assign(state.players[a], { intelligenceTokens: 3 });
  Object.assign(state.players[b], { intelligenceTokens: 2 });
  state.labPile.draw.push(labCard("든든 도시락"), labCard("마법 안경")); // 체력기운 0개 / 0개 (45절에서 1씩 낮춤)
  selectActivity(state, a, "lab");
  selectActivity(state, b, "lab");
  finishChoosing(state);
  advanceResolution(state);
  assert.equal(state.activityOffers.lab?.cards.length, 2);
  chooseActivityCard(state, a, "test-마법 안경");
  assert.equal(state.pendingRoll?.kind, "lab");
  assert.equal(state.pendingRoll?.entries[0].diceToken, "intelligence", "연구실의 주사위 재료는 지력기운이다");
  assert.equal(state.pendingRoll?.entries[0].diceChoiceMax, 3, "카드를 보고 지력기운을 1~3개 사이에서 고른다");
  assert.equal(state.pendingRoll?.entries[0].diceCount, suggestDiceCount(3, labTargetValue()), "굴림 버튼의 기본값은 성공 확률이 충분한 가장 적은 개수");
  assert.equal(state.players[a].intelligenceTokens, 3, "굴리기 전에는 기운을 내지 않는다");
  assert.throws(() => submitRoll(state, a, 4), /지력기운을 1~3개/);
  assert.throws(() => submitRoll(state, a, 0), /지력기운을 1~3개/);
  submitRoll(state, a, 3);
  assert.equal(state.pendingRoll?.entries[0].diceCount, 3, "지력기운 3개를 내고 주사위 3개를 굴린다 (체력기운은 카드 비용에만 쓴다)");
  assert.equal(state.players[a].intelligenceTokens, 0);
  rollWith(state, { [a]: [6] });
  assert.equal(state.players[a].intelligenceTokens, 2, "시험 대비 카드 '마법 안경'은 지력기운 +2 (51절: 임시 능력치 대신 기운)");
  assert.equal(state.players[a].equipment.length, 0, "보관하는 카드는 없다");
  advanceResolution(state); // 남은 "든든 도시락"(무료)을 두 번째 참가자가 직접 고른다
  assert.equal(state.pendingPick?.playerId, b);
  chooseActivityCard(state, b, "test-든든 도시락");
  submitRoll(state, b, 1);
  assert.equal(state.pendingRoll?.entries[0].diceCount, 1, "1개만 내고 굴린다");
  assert.equal(state.players[b].intelligenceTokens, 1, "안 낸 지력기운은 남는다");
  rollWith(state, { [b]: [6] });
  assert.equal(state.players[b].staminaTokens, 4, "든든 도시락: 체력기운 +2를 바로 받는다 (51절)");
  assert.equal(state.activityOffers.lab?.cards.length, 0);
});

test("연구실 실험: 비용이 모자란 카드는 못 고르고, 가져가지 않고 넘어가면 두 번째 참가자가 고른다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 0);
  const [a, b] = state.activityOrder;
  state.players[b].staminaTokens = 1; // 카드 1개 (참가비는 매력기운)
  state.labPile.draw.push(labCard("든든 도시락"), labCard("마법약 실험")); // 체력기운 0개 / 1개
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
  assert.equal((state.pendingPick as GameState["pendingPick"])?.playerId, b);
  chooseActivityCard(state, b, "test-마법약 실험");
  rollWith(state, { [b]: [6] });
  assert.equal(state.players[b].staminaTokens, 0);
});

test("연구실 실험: 합이 목표값(labTarget)에 못 미치면 실험이 실패해 효과가 없고 카드는 버려진다", () => {
  const state = newGame(2);
  toActivity(state);
  setTokens(state, 1);
  const [a] = state.activityOrder;
  state.players[a].intelligenceTokens = 0;
  state.labPile.draw.push(labCard("특별 개인 지도"), labCard("마법 안경"));
  selectActivity(state, a, "lab");
  finishChoosing(state);
  advanceResolution(state);
  const before = state.players[a].intelligence;
  chooseActivityCard(state, a, "test-특별 개인 지도"); // 지력기운 0개 → 주사위 1개
  assert.equal(state.pendingRoll?.entries[0].diceCount, 1, "지력기운이 없어도 주사위 1개는 굴린다");
  const discardBefore = state.labPile.discard.length;
  rollWith(state, { [a]: [1] });
  assert.equal(state.players[a].intelligence, before, "실패하면 능력치가 오르지 않는다");
  assert.ok(state.labPile.discard.length > discardBefore);
  assert.ok(state.log.some((l) => l.message.includes("실험 실패")));
});

test("별빛 다락방: 먼저 온 사람이 겪을 카드를 고르고(반드시 골라야 함), 남는 카드는 두 번째 참가자가 겪는다", () => {
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
  assert.ok(state.log.some((l) => l.message.includes("별빛 다락방") && l.message.startsWith(state.players[a].name)));
  assert.equal(state.activityOffers.exploration?.cards.length, 1);
  advanceResolution(state);
  assert.equal((state.pendingPick as GameState["pendingPick"])?.playerId, b, "남은 카드가 한 장이어도 두 번째 참가자가 직접 고른다");
  chooseActivityCard(state, b, "test-safe-1");
  assert.equal(state.activityOffers.exploration?.cards.length, 0, "남은 카드를 두 번째 참가자가 가져갔다");
});

test("별빛 다락방: 체력기운을 내고 낸 개수만큼 주사위를 굴려 합이 카드에 인쇄된 목표값 이상이면 성공하고, 목표값은 달이 바뀌어도 그대로다 (52-9절)", () => {
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  state.explorationPile.draw.push(explorationByName("잊혀진 교실"), explorationByName("먼지 쌓인 서고")); // 지력 판정
  Object.assign(state.players[a], { staminaTokens: 3 });
  const credit = state.players[a].credit;
  selectActivity(state, a, "exploration");
  finishChoosing(state);
  advanceResolution(state);
  chooseActivityCard(state, a, "test-잊혀진 교실");
  assert.equal(state.pendingRoll?.kind, "exploration");
  const ctx = state.hidden.roll;
  assert.ok(ctx?.kind === "exploration");
  assert.equal(ctx.target, explorationByName("잊혀진 교실").check!.target + BALANCE.exploreTargetMod, "목표값은 카드에 적힌 값 (예전 숫자로 보는 검증이라 보정값을 더한다)");
  assert.equal(state.pendingRoll?.entries[0].diceToken, "stamina", "탐험의 주사위 재료는 체력기운이다");
  assert.equal(state.pendingRoll?.entries[0].diceChoiceMax, 3);
  submitRoll(state, a, 3);
  assert.equal(state.pendingRoll?.entries[0].diceCount, 3, "체력기운 3개를 내고 주사위 3개를 굴린다");
  assert.equal(state.players[a].staminaTokens, 0);
  rollWith(state, { [a]: [6, 6, 6] });
  assert.equal(state.players[a].credit, credit + 1, "합이 목표값 이상이라 성공 보상(학점 +1)");
});

test("별빛 다락방: 합이 목표값에 못 미치면 실패 효과를 받는다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  state.explorationPile.draw.push(explorationByName("잊혀진 교실"), explorationByName("먼지 쌓인 서고"));
  Object.assign(state.players[a], { staminaTokens: 3 });
  const credit = state.players[a].credit;
  selectActivity(state, a, "exploration");
  finishChoosing(state);
  advanceResolution(state);
  chooseActivityCard(state, a, "test-잊혀진 교실");
  rollWith(state, { [a]: [1, 1, 1] });
  assert.equal(state.players[a].credit, credit);
  assert.equal(state.players[a].pendingStaminaTokens, 0, "다음 달 기운은 없다 (51절)");
  assert.ok(state.log.some((l) => l.message.includes("잊혀진 교실") && l.message.includes("체력기운 -1")), "실패하면 체력기운 -1을 바로 잃는다");
});

test("마법 겨루기: 이긴 사람은 주문력 +1(성장)과 승리 보상(duelWinReward, 학점 +1)을 받고 고를 카드는 없다", () => {
  const state = newGame(3);
  toActivity(state);
  setTokens(state, 0);
  const [a, b, c] = state.activityOrder;
  selectActivity(state, a, "duel", b);
  assert.equal(state.players[a].intelligenceTokens, 5, "마법 겨루기에는 지력기운이 들지 않는다");
  assert.equal(state.activityOrder[state.activityTurnPointer], c, "지목당한 b는 차례를 건너뛴다");
  selectActivity(state, c, "tournament");
  assert.equal(state.activityStage, "resolve");
  assert.deepEqual(state.activityChoices.map((x) => x.playerId), [a, c], "지목당한 사람은 따로 진행하지 않는다");
  advanceResolution(state);
  assert.equal(state.activityOffers.duel, undefined, "마법 겨루기 구역에는 카드가 없다");
  const winner = state.players[a];
  const before = { spellPower: winner.spellPower, credit: winner.credit };
  rollWith(state, { [a]: [6, 6], [b]: [1, 1] });
  assert.equal(state.pendingPick, null, "고를 카드가 없다");
  assert.equal(winner.spellPower, before.spellPower + BALANCE.growthAmount);
  assert.equal(winner.credit, before.credit + (BALANCE.duelWinReward.credit ?? 0));
  assert.equal(state.activityResolvePointer, 1, "다음 진행으로 넘어간다");
});

test("자율활동이 끝나면 아무도 가져가지 않은 공개 카드는 버림 더미로 돌아간다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  setTokens(state, 0);
  state.creatureDeck.push(creature("대지의 수호자"), creature("정령 고릴라"));
  selectActivity(state, a, "creature");
  selectActivity(state, b, "tournament");
  advanceResolution(state);
  assert.equal(state.pendingPick?.playerId, a);
  chooseActivityCard(state, a, null); // 아무 카드도 가져가지 않고 넘어간다
  advanceResolution(state);
  rollAll(state); // b의 마법 경연 주사위
  assert.equal(state.round, 2);
  assert.deepEqual(state.activityOffers, {});
  assert.equal(state.creatureDeck.length + state.creatureDiscard.length + state.players[a].creatures.length + state.players[b].creatures.length, CREATURE_CARDS.length + 2); // 위에서 덱에 더한 2장 포함
});

test("자율활동 구역은 최대 2명, 두 번째 참가자는 매력기운 1개를 더 낸다 (체력기운으로는 낼 수 없다)", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b, c] = state.activityOrder;
  setTokens(state, 5, 0);
  selectActivity(state, a, "tournament");
  assert.deepEqual(state.activitySlots.tournament, [a]);
  assert.ok(!availableActivities(state, b).includes("tournament"), "체력기운이 많아도 매력기운이 없으면 못 들어간다");
  assert.throws(() => selectActivity(state, b, "tournament"), /매력기운 1개가 더 필요/);
  state.players[b].charmTokens = 1;
  selectActivity(state, b, "tournament");
  assert.equal(state.players[b].charmTokens, 0);
  assert.equal(state.players[b].staminaTokens, 5, "체력기운은 그대로");
  assert.deepEqual(state.activitySlots.tournament, [a, b]);
  state.players[c].charmTokens = 5;
  assert.throws(() => selectActivity(state, c, "tournament"), /이미 두 명/);
  assert.ok(!availableActivities(state, c).includes("tournament"));
});

test("반짝 마법 경연: 주문력 수치만큼 주사위를 굴려 합친 칸만큼 전진하고, 트랙에는 상한이 없다", () => {
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
  assert.equal(state.pendingRoll?.entries[0].diceChoiceMax, 8, "마나기운을 1~8개 사이에서 고른다");
  submitRoll(state, a, 8);
  assert.equal(state.pendingRoll?.entries[0].diceCount, 8, "마나기운 8개를 내면 주사위 8개");
  assert.equal(state.players[a].manaTokens, 0, "고른 만큼 마나기운을 낸다");
  assert.equal(state.players[a].tournamentTrack, 9, "굴리기 전에는 전진하지 않는다");
  rollWith(state, { [a]: [6, 6, 6, 6, 6, 6, 6, 6] });
  assert.equal(state.players[a].tournamentTrack, 9 + 48);
});

test("반짝 마법 경연: 마나기운이 없으면 고를 수 없다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  state.players[a].manaTokens = 0;
  assert.ok(!availableActivities(state, a).includes("tournament"));
  assert.throws(() => selectActivity(state, a, "tournament"), /마나기운/);
});

test("반짝 마법 경연: 주사위는 남은 마나기운으로 다시 굴릴 수 있다 (지력기운으로는 안 된다)", () => {
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  state.players[a].manaTokens = 3;
  state.players[a].intelligenceTokens = 9;
  selectActivity(state, a, "tournament");
  finishChoosing(state);
  advanceResolution(state);
  submitRoll(state, a, 2);
  assert.equal(state.players[a].manaTokens, 1);
  rerollDice(state, a, [0]);
  assert.equal(state.players[a].manaTokens, 0, "마나기운 1개당 주사위 1개");
  assert.throws(() => rerollDice(state, a, [1]), /마나기운이 부족/);
  assert.equal(state.players[a].intelligenceTokens, 9 - 0, "지력기운은 그대로");
});

test("마법 겨루기: 도전자가 건넨 마나기운 1개를 더한 뒤 양쪽이 마나기운을 내고 낸 개수만큼 주사위를 굴려 합이 큰 쪽이 이긴다", () => {
  // 마나기운 건네기 규칙을 켜 둔 상태(duelManaFee 1, 45절부터 기본값)를 검증한다
  const savedFee = BALANCE.duelManaFee;
  BALANCE.duelManaFee = 1;
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  Object.assign(state.players[a], { manaTokens: 3 });
  Object.assign(state.players[b], { manaTokens: 2 });
  setTokens(state, 0);
  selectActivity(state, a, "duel", b);
  advanceResolution(state);
  const entries = state.pendingRoll!.entries;
  assert.equal(entries.find((e) => e.playerId === a)!.diceCount, 2, "도전자는 마나기운 1개를 건네고 남은 2개");
  assert.equal(entries.find((e) => e.playerId === b)!.diceCount, 3, "지목당한 쪽은 건네받은 1개를 더한 3개");
  rollWith(state, { [a]: [1, 1], [b]: [6, 6, 6] });
  assert.ok(state.log.some((l) => l.message.includes(`${state.players[b].name} 승리`)), "합이 더 큰 쪽(지목당한 쪽)이 이긴다");
  BALANCE.duelManaFee = savedFee;
});

test("마법 겨루기: 합이 같으면 무승부 — 보상을 받는 사람이 없다 (매력이 높아도 이기지 않는다)", () => {
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
  const credits = [state.players[a].credit, state.players[b].credit];
  rollWith(state, { [a]: [3, 4], [b]: [2, 2, 3] });
  assert.deepEqual([state.players[a].credit, state.players[b].credit], credits, "무승부면 학점을 받는 사람이 없다");
  assert.equal(state.players[a].manaTokens, 0, "낸 마나기운은 무승부여도 돌려받지 못한다");
  assert.ok(state.log.some((l) => l.message.includes("무승부")));
  assert.equal(state.activityResolvePointer >= 1, true);
});

test("마법 겨루기: 도전자가 지목당한 친구에게 매력 1을 건네고, 지목당한 친구는 비용이 없다", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b, c] = state.activityOrder;
  setTokens(state, 0);
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
  // 한 명씩 차례대로 (44-4절): 도전자가 먼저 굴리고 확인해야 지목당한 친구가 굴린다
  assert.throws(() => submitRoll(state, b), /내 차례가 아니에요/);
  assert.throws(() => confirmRoll(state, a), /굴린 뒤에 확인/);
  submitRoll(state, a);
  assert.throws(() => submitRoll(state, a), /이미 주사위를 굴렸습니다/);
  assert.throws(() => submitRoll(state, b), /내 차례가 아니에요/);
  assert.equal(rollRevealed(state), true);
  assert.throws(() => confirmRoll(state, c), /참여하지 않습니다/);
  confirmRoll(state, a);
  assert.ok(state.pendingRoll, "모든 참여자가 확인해야 넘어간다");
  assert.equal(rollRevealed(state), false, "이제 지목당한 친구 차례");
  submitRoll(state, b);
  assert.equal(state.players[a].charm, charmA, "확인하기 전에는 결과를 적용하지 않는다");
  confirmRoll(state, b);
  assert.equal(state.pendingRoll, null);
  assert.equal(state.players[a].charm, charmA - 1, "승패(무승부 포함)와 상관없이 매력을 건넨다");
  assert.equal(state.players[b].charm, charmB + 1);
  assert.ok(state.log.some((l) => l.message.includes("매력 1을 건넸어요")));
  assert.equal(state.activityResolvePointer, 1, "다음 활동 진행으로 넘어간다");
});

test("마법 겨루기는 건넬 매력이 없으면 고를 수 없다", () => {
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  state.players[a].charm = 0;
  assert.ok(!availableActivities(state, a).includes("duel"));
  assert.throws(() => selectActivity(state, a, "duel", b), /매력/);
});

// ── 매력기운 ──

test("구역 두 번째 참가비는 매력기운 1개로 낸다", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b] = state.activityOrder;
  setTokens(state, 3, 0);
  selectActivity(state, a, "tournament");
  assert.throws(() => selectActivity(state, b, "tournament"), /매력기운 1개가 더 필요/);
  state.players[b].charmTokens = 1;
  selectActivity(state, b, "tournament");
  assert.equal(state.players[b].charmTokens, 0);
  assert.equal(state.players[b].staminaTokens, 3, "체력기운은 그대로 남는다");
  assert.deepEqual(state.activitySlots.tournament, [a, b]);
});

// ── 주사위 다시 굴리기 (마나기운) ──

test("주사위 다시 굴리기: 내 차례에 굴린 뒤 확인 전에, 마나기운 1개당 원하는 주사위만 다시 굴린다", () => {
  const state = newGame(3);
  toActivity(state);
  const [a, b, c] = state.activityOrder;
  setTokens(state, 0);
  selectActivity(state, a, "duel", b);
  selectActivity(state, c, "tournament");
  advanceResolution(state);
  const roll = state.pendingRoll!;
  assert.throws(() => rerollDice(state, a, [0]), /굴린 뒤에 다시 굴릴/);
  submitRoll(state, a);
  const entry = roll.entries.find((e) => e.playerId === a)!;
  // 여러 개 굴리는 상황을 만들어 일부 주사위만 다시 굴리는지 확인한다
  entry.dice = [1, 2, 3];
  state.players[a].manaTokens = 2;
  assert.throws(() => rerollDice(state, a, []), /골라 주세요/);
  assert.throws(() => rerollDice(state, a, [5]), /없는 주사위/);
  assert.throws(() => rerollDice(state, c, [0]), /참여하지 않습니다/);
  assert.throws(() => rerollDice(state, a, [0, 1, 2]), /마나기운이 부족/);
  assert.equal(state.players[a].manaTokens, 2, "실패하면 기운이 줄지 않는다");
  rerollDice(state, a, [0, 2]);
  assert.equal(state.players[a].manaTokens, 0);
  assert.equal(entry.dice[1], 2, "고르지 않은 주사위는 그대로");
  assert.ok(entry.dice.every((d) => d >= 1 && d <= 6));
  assert.equal(entry.rerolls, 2);
  assert.throws(() => rerollDice(state, a, [1]), /마나기운이 부족/);
  state.players[a].manaTokens = 1;
  confirmRoll(state, a);
  assert.throws(() => rerollDice(state, a, [1]), /이미 결과를 확인했어요/);
  assert.throws(() => submitRoll(state, a), /이미 주사위를 굴렸습니다/);
});

test("주사위 다시 굴리기: 지력·매력기운으로는 대신할 수 없다. 선 정하기 주사위는 다시 굴릴 수 없다", () => {
  const raw = createGame([{ id: "p0", name: "p0" }, { id: "p1", name: "p1" }]);
  submitRoll(raw, raw.pendingRoll!.entries[0].playerId);
  assert.throws(() => rerollDice(raw, raw.pendingRoll!.entries[0].playerId, [0]), /선 정하기/);
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  selectActivity(state, a, "duel", b);
  advanceResolution(state);
  submitRoll(state, a);
  state.players[a].manaTokens = 0;
  state.players[a].intelligenceTokens = 9;
  state.players[a].charmTokens = 9;
  assert.throws(() => rerollDice(state, a, [0]), /마나기운이 부족/);
  assert.equal(state.players[a].charmTokens, 9);
  assert.equal(state.players[a].intelligenceTokens, 9);
});

test("굴림 기본 개수: 목표값 판정은 성공 확률이 충분한 가장 적은 마나기운 개수(남는 기운은 다시 굴리기용), 마법 경연·시험은 마나기운 전부", () => {
  assert.equal(diceSuccessChance(1, 1), 1);
  assert.equal(diceSuccessChance(1, 7), 0);
  assert.ok(Math.abs(diceSuccessChance(2, 7) - 21 / 36) < 1e-9);
  assert.equal(suggestDiceCount(0, 10), 1, "마나기운이 없으면 공짜 1개");
  assert.equal(suggestDiceCount(2, 100), 2, "아무리 해도 못 미치면 가진 만큼 전부");
  let last = 0;
  for (let target = 1; target <= 30; target++) {
    const n = suggestDiceCount(12, target);
    assert.ok(n >= last, "목표값이 높을수록 기본 개수는 줄지 않는다");
    last = n;
  }
  assert.ok(suggestDiceCount(12, 7) < 12);
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  state.players[a].manaTokens = 7;
  selectActivity(state, a, "tournament");
  finishChoosing(state);
  advanceResolution(state);
  assert.equal(state.pendingRoll?.entries[0].diceCount, 7, "마법 경연 기본값은 마나기운 전부");
});

test("시험 달(6·12개월)은 정규수업·자율활동 없이 곧바로 시험이고, 시험은 이월된 기운 중 카드의 주 능력치 기운으로 굴리며, 시험 뒤 정리에서 남은 지력기운은 다음 달로 이어진다", () => {
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
  // 시험 달에는 새로 얻는 기운이 없다(수업이 없다): 이월된 기운 중 시험 카드의 주 능력치 기운으로 주사위를 굴리고, 마나기운으로 다시 굴릴 수 있다 (39·42절)
  const examCard = state.hidden.examPlan.midterm;
  const fuel = examFuel(examCard);
  assert.ok(state.pendingRoll!.entries.every((e) => e.diceToken === fuel), "시험은 카드의 주 능력치 기운으로 굴린다");
  // 테스트에서는 이월된 기운이 충분하다고 두고 시작한다 (진행 중인 굴림 항목도 같이 맞춘다)
  for (const p of Object.values(state.players)) Object.assign(p, { intelligenceTokens: 4, staminaTokens: 4, charmTokens: 4, manaTokens: 4 });
  for (const e of state.pendingRoll!.entries) Object.assign(e, { diceChoiceMax: 4, diceCount: 4 });
  assert.deepEqual(state.pendingRoll!.entries.map((e) => e.playerId), Array.from({ length: state.turnOrder.length }, (_, i) => state.turnOrder[(state.startingPlayerIndex + i) % state.turnOrder.length]), "시험은 선부터 한 명씩 굴린다");
  const id = currentRoller(state)!;
  const tokens = tokensOf(state.players[id], fuel);
  assert.ok(tokens >= 2);
  submitRoll(state, id, tokens - 1);
  assert.equal(tokensOf(state.players[id], fuel), 1);
  const manaBefore = state.players[id].manaTokens;
  rerollDice(state, id, [0]);
  assert.equal(state.players[id].manaTokens, manaBefore - 1, "다시 굴리기는 마나기운으로 한다");
  const intelligenceLeft = state.players[id].intelligenceTokens; // 시험에 쓰지 않은 지력 기운 (카드 효과로 받는 몫이 없는 종류)
  rollWith(state, {});
  // 시험 뒤 정리는 기다리지 않고 바로 지나가 다음 달 정규수업이 시작된다
  assert.equal(state.phase, "class");
  assert.equal(state.round, BALANCE.midtermRound + 1);
  // 2학기: 수업카드 덱이 주문력 위주의 새 덱으로 교체된다
  const sem2 = [...state.classDeck, ...state.classMarket, ...state.classDiscard];
  assert.equal(sem2.length, BALANCE.classDeckSize);
  assert.ok(sem2.filter((c) => c.stat === "spellPower").length > BALANCE.classDeckSize * 0.15); // 2학기 주문력 비율(2/10)은 1학기(1/10)보다 높다
  // 시험 달 뒤에도 쓰고 남은 기운은 그대로 이어진다 (충전이 없으므로 더해지는 것도 없다)
  assert.equal(state.players[id].intelligenceTokens, intelligenceLeft, `쓰지 않은 지력기운 ${intelligenceLeft}개가 다음 달로 이어진다`);
});

// ── 시험 ──

test("시험: 시험 카드의 주 능력치 기운을 내고 굴린 주사위 합에 보너스 능력치를 고정 보너스로 더한다 (굴린 뒤 확인해야 결과가 적용된다)", () => {
  const state = newGame(3);
  let guard = 0;
  while (state.phase !== "midterm_exam" && guard++ < 3000) botStep(state);
  assert.equal(state.phase, "midterm_exam");
  assert.equal(state.round, 6);
  assert.equal(state.examResults.length, 0, "주사위를 굴리기 전에는 결과가 없다");
  const pending = state.pendingRoll;
  assert.ok(pending && pending.kind === "exam");
  // 주사위 수 = 낸 마나기운 (기본값은 가진 마나기운 전부, 없으면 공짜 1개). 보너스 = 시험 카드의 두 능력치 수치 (연구 카드로 받은 임시 능력치 포함, 시험이 끝나면 임시분은 사라지므로 미리 저장해 둔다)
  const card = state.exams.midterm;
  assert.ok(card, "중간고사 카드는 4라운드 시험 공고 때 공개되어 있다");
  assert.equal(state.news?.kind, "examWeek", "시험 달의 학교 소식은 시험 주간");
  const diceCounts = new Map<string, number>();
  const bonuses = new Map<string, number>();
  for (const entry of pending.entries) {
    const p = state.players[entry.playerId];
    const have = tokensOf(p, examFuel(card));
    diceCounts.set(entry.playerId, Math.max(1, have));
    bonuses.set(entry.playerId, card.bonusStat ? p[card.bonusStat] + (p.tempBoosts[card.bonusStat] ?? 0) : 0);
    assert.equal(entry.diceToken, examFuel(card));
    assert.equal(entry.diceCount, diceCounts.get(entry.playerId));
    assert.equal(entry.diceChoiceMax, have > 0 ? have : undefined);
  }
  // 선부터 한 명씩 굴리고 확인한다. 마지막 사람이 확인하기 전에는 결과가 반영되지 않는다
  for (const entry of [...pending.entries]) {
    submitRoll(state, entry.playerId);
    assert.equal(state.examResults.length, 0, "모두 확인하기 전에는 결과가 반영되지 않는다");
    assert.equal(state.phase, "midterm_exam");
    confirmRoll(state, entry.playerId);
  }
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

test("시험 카드: 게임마다 서로 다른 능력치를 겨냥하는 두 장이 정해지고, 4·10라운드 1주차 학교 소식(시험 공고)에 공개된다", () => {
  for (let i = 0; i < 30; i++) {
    const plan = newGame(2).hidden.examPlan;
    assert.notEqual(plan.midterm.diceStat, plan.final.diceStat);
    assert.notEqual(plan.midterm.id, plan.final.id);
  }
  const state = newGame(3);
  assert.deepEqual(state.exams, { midterm: null, final: null });
  const plan = state.hidden.examPlan;
  const seen: Record<number, { midterm: unknown; final: unknown; news: string | undefined }> = {};
  let guard = 0;
  while (state.phase !== "ended" && guard++ < 6000) {
    seen[state.round] ??= { midterm: state.exams.midterm, final: state.exams.final, news: state.news?.kind };
    botStep(state);
  }
  assert.deepEqual(
    Object.keys(seen).map((r) => seen[+r].news),
    ["event", "event", "event", "notice", "event", "examWeek", "event", "event", "event", "notice", "event", "examWeek"],
    "4·10라운드는 시험 공고, 6·12라운드는 시험 주간, 나머지는 행사",
  );
  assert.equal(state.phase, "ended");
  assert.equal(seen[3].midterm, null, "3라운드 중에는 아직 비공개");
  assert.equal(seen[4].midterm, plan.midterm, "4라운드 1주차(시험 공고)에 중간고사 카드가 공개된다");
  assert.equal(seen[4].final, null);
  assert.equal(seen[9].final, null, "9라운드 중에는 기말고사 카드가 비공개");
  assert.equal(seen[10].final, plan.final, "10라운드 1주차(시험 공고)에 기말고사 카드가 공개된다");
  assert.equal(state.examResults.length, 2);
  assert.equal(state.examResults[0].card.id, plan.midterm.id);
  assert.equal(state.examResults[1].card.id, plan.final.id);
});

// ── 최종 점수 ──

test("졸업식 생물사랑상의 값 = 마법생물 마리 수 + 완성한 세트(하늘·육지·바다 1장씩) 수", () => {
  const state = newGame(2);
  const p = state.players.p0;
  p.creatures = [];
  assert.equal(awardValue(p, "creature"), 0);
  const sky = CREATURE_CARDS.filter((c) => c.element === "sky");
  const land = CREATURE_CARDS.filter((c) => c.element === "land");
  const ocean = CREATURE_CARDS.filter((c) => c.element === "ocean");
  p.creatures = [sky[0], sky[1], land[0], ocean[0]].map((c, i) => ({ ...c, id: `f${i}` }));
  assert.equal(creatureSets(p.creatures), 1, "하늘 2·육지 1·바다 1 = 1세트");
  assert.equal(awardValue(p, "creature"), 4 + 1);
  p.creatures.push(...[land[1], ocean[1]].map((c, i) => ({ ...c, id: `g${i}` })));
  assert.equal(creatureSets(p.creatures), 2);
  assert.equal(awardValue(p, "creature"), 6 + 2);
  Object.assign(p, { spellPower: 3, credit: 4 });
  assert.equal(awardValue(p, "spellPower"), 3);
});

test("게임이 끝나면 최종 점수(학점)가 가장 높은 플레이어가 승리한다 (동점이면 공동 승리)", () => {
  const state = newGame(3);
  let guard = 0;
  while (state.phase !== "ended" && guard++ < 6000) botStep(state);
  assert.equal(state.phase, "ended");
  const best = Math.max(...state.turnOrder.map((id) => finalScore(state.players[id])));
  assert.ok(state.winnerIds && state.winnerIds.length >= 1);
  for (const id of state.turnOrder) assert.equal(finalScore(state.players[id]), state.players[id].credit, "최종 점수 = 학점");
  const top = state.turnOrder.filter((id) => finalScore(state.players[id]) === best);
  for (const id of state.winnerIds!) assert.ok(top.includes(id), "승자는 최고 학점");
});

// ── 4주차 정리: 남은 기운 이월 (40·42절) ──

// 2인 게임에서 둘 다 마법 경연을 하고 3주차를 끝내 다음 달 정규수업까지 간다. 쓰고 남은 기운이 이어지는지 본다
function playOneMonth(stock: { intelligence: number; stamina: number; charm: number }): { state: GameState; a: string; b: string; before: Record<string, Record<string, number>> } {
  const state = newGame(2);
  toActivity(state, 0);
  setTokens(state, 0, 3);
  const [a, b] = state.activityOrder;
  Object.assign(state.players[a], { intelligenceTokens: stock.intelligence, staminaTokens: stock.stamina, charmTokens: stock.charm });
  Object.assign(state.players[b], { intelligenceTokens: stock.intelligence, staminaTokens: stock.stamina, charmTokens: stock.charm });
  selectActivity(state, a, "tournament");
  selectActivity(state, b, "tournament"); // 두 번째 참가자는 매력기운 1개를 낸다
  const before = Object.fromEntries(
    [a, b].map((id) => [id, { intelligence: state.players[id].intelligenceTokens, stamina: state.players[id].staminaTokens, charm: state.players[id].charmTokens }]),
  );
  advanceResolution(state);
  rollWith(state, { [a]: [6, 6] }); // 기본 개수(마나기운 전부)를 내고 굴린다
  advanceResolution(state);
  rollWith(state, { [b]: [6, 6] });
  return { state, a, b, before };
}

test("4주차 정리: 쓰고 남은 기운은 사라지지도 새로 충전되지도 않고 다음 달로 그대로 이어진다", () => {
  const { state, a, b, before } = playOneMonth({ intelligence: 3, stamina: 1, charm: 3 });
  assert.equal(state.phase, "class", "정리는 고를 것이 없어서 기다리지 않고 바로 다음 달 정규수업이 시작된다");
  assert.equal(state.round, 2);
  for (const id of [a, b]) {
    const p = state.players[id];
    assert.equal(p.intelligenceTokens, before[id].intelligence, "지력기운은 쓰지 않았으니 그대로");
    assert.equal(p.staminaTokens, before[id].stamina, "체력기운도 그대로 (매달 충전이 없다)");
    assert.equal(p.charmTokens, before[id].charm);
    assert.equal(p.manaTokens, 0, "마나기운은 마법 경연에서 전부 썼으니 0 — 새로 차오르지 않는다");
  }
});

test("4주차 정리: 선은 남은 매력기운이 가장 많은 친구이고, 다음 달 수업은 선이 마지막·활동은 선이 먼저다", () => {
  const { state, a, b } = playOneMonth({ intelligence: 1, stamina: 1, charm: 3 });
  assert.equal(state.phase, "class");
  // 두 번째 참가자 b는 참가비 1개를 먼저 온 a에게 건네서 a는 4개, b는 2개가 남았다
  assert.equal(state.players[a].charmTokens, 4);
  assert.equal(state.players[b].charmTokens, 2);
  assert.equal(state.turnOrder[state.startingPlayerIndex], a);
  assert.equal(state.classPickOrder[state.classPickOrder.length - 1], a, "선 a는 수업 신청이 마지막이다");
  assert.ok(state.log.some((l) => l.message.includes("쓰고 남은 기운은 다음 달로 이어져요")));
});

test("4주차 정리: 봇이 있어도 정리에서 게임이 멈추지 않는다", () => {
  const state = newGame(2);
  let guard = 0;
  while (state.round < 3 && guard++ < 2000) botStep(state);
  assert.ok(state.round >= 3);
});

// ── 성장 (42절): 자율활동에서 성과를 내면 주 능력치가 오른다 ──

test("성장: 조련 성공은 매력, 연구실 성공은 지력이 +1 되고 실패하면 오르지 않는다", () => {
  // 조련
  for (const [dice, expected] of [[[6, 6, 6, 6], true], [[1], false]] as const) {
    const state = newGame(2);
    toActivity(state);
    setTokens(state, 2, 5);
    const [a] = state.activityOrder;
    state.creatureDeck.push(creature("대지의 수호자"), creature("정령 고릴라"));
    selectActivity(state, a, "creature");
    finishChoosing(state);
    advanceResolution(state);
    chooseActivityCard(state, a, "test-정령 고릴라");
    submitRoll(state, a, dice.length);
    const before = state.players[a].charm;
    rollWith(state, { [a]: [...dice] });
    assert.equal(state.players[a].charm, before + (expected ? BALANCE.growthAmount : 0), `조련 ${expected ? "성공" : "실패"}`);
    if (expected) assert.ok(state.log.some((l) => l.message.includes("성장! 매력 +1")));
  }
  // 연구실
  for (const [dice, expected] of [[6, true], [1, false]] as const) {
    const state = newGame(2);
    toActivity(state);
    setTokens(state, 1);
    const [a] = state.activityOrder;
    Object.assign(state.players[a], { intelligenceTokens: 1 });
    state.labPile.draw.push(labCard("특별 개인 지도"), labCard("마법 안경"));
    selectActivity(state, a, "lab");
    finishChoosing(state);
    advanceResolution(state);
    chooseActivityCard(state, a, "test-특별 개인 지도");
    const before = state.players[a].intelligence;
    rollWith(state, { [a]: [dice] });
    // 연구 카드 자체가 지력을 올릴 수 있으니 성장 로그로 확인한다
    assert.equal(state.log.some((l) => l.message.includes("성장! 지력 +1")), expected, `연구실 ${expected ? "성공" : "실패"}`);
    if (!expected) assert.equal(state.players[a].intelligence, before);
  }
});

test("성장: 탐험 성공은 체력이 +1, 마법 겨루기는 이긴 사람의 주문력이 +1 (무승부는 없음), 마법 경연은 참가만 해도 주문력 +1 (54절)", () => {
  assert.deepEqual(BALANCE.growthActivities, { tournament: true, creature: true, duel: true, exploration: true, lab: true });
  // 탐험(혼자)
  {
    const state = newGame(2);
    toActivity(state);
    const [a] = state.activityOrder;
    const card = explorationTemplates().find((c) => c.check)!;
    state.explorationPile.draw.push({ ...card, id: "test-check" }, safeExploration(0));
    Object.assign(state.players[a], { staminaTokens: 1 });
    selectActivity(state, a, "exploration");
    finishChoosing(state);
    advanceResolution(state);
    chooseActivityCard(state, a, "test-check");
    const before = state.players[a].stamina;
    rollWith(state, { [a]: [60] });
    assert.equal(state.players[a].stamina, before + 1, "탐험 성공은 체력 +1");
  }
  // 마법 겨루기: 이긴 사람만 +1, 무승부는 아무도 아니다
  for (const [dA, dB, winner] of [[[6, 6], [1, 1], "a"], [[1, 1], [6, 6], "b"], [[3, 3], [3, 3], null]] as const) {
    const state = newGame(3);
    toActivity(state);
    setTokens(state, 0);
    const [a, b, c] = state.activityOrder;
    selectActivity(state, a, "duel", b);
    selectActivity(state, c, "tournament");
    advanceResolution(state);
    const before = { a: state.players[a].spellPower, b: state.players[b].spellPower };
    rollWith(state, { [a]: [...dA], [b]: [...dB] });
    assert.equal(state.players[a].spellPower, before.a + (winner === "a" ? 1 : 0));
    assert.equal(state.players[b].spellPower, before.b + (winner === "b" ? 1 : 0));
  }
  // 마법 경연
  {
    const state = newGame(2);
    toActivity(state);
    const [a, b] = state.activityOrder;
    selectActivity(state, a, "tournament");
    selectActivity(state, b, "tournament");
    const before = { ...state.players[a] };
    advanceResolution(state);
    rollWith(state, { [a]: [1] });
    for (const stat of ["intelligence", "stamina", "charm"] as const) assert.equal(state.players[a][stat], before[stat], "다른 능력치는 그대로");
    assert.equal(state.players[a].spellPower, before.spellPower + 1, "주사위가 1이어도 참가하면 주문력 +1");
  }
});


// ── 동점은 공동 순위 ──

// 시험(중간고사 또는 기말고사)이 눈앞에 올 때까지 봇으로 진행한다
function reachExam(state: GameState, phase: "midterm_exam" | "final_exam"): void {
  let guard = 0;
  while (state.phase !== phase && guard++ < 6000) botStep(state);
  assert.equal(state.phase, phase);
}

// 지금 시험의 모든 플레이어 고정 보너스(시험 카드의 두 능력치)를 같게 맞추고, 지정한 합계가 나오도록 주사위 눈을 정해 확인한다
function rollExamWith(state: GameState, sums: Record<string, number>): void {
  const card = state.hidden.roll && state.hidden.roll.kind === "exam" ? state.hidden.roll.card : null;
  assert.ok(card);
  for (const id of state.turnOrder) {
    const p = state.players[id];
    p.tempBoosts = {};
    p[card.diceStat] = 2;
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

test("최종: 시험·마법 경연·최종 점수가 모두 동점이면 공동 순위와 공동 승리로 처리한다", () => {
  const state = newGame(3);
  reachExam(state, "final_exam");
  for (const id of state.turnOrder) {
    // 졸업식 부문상도 모두 공동 수상이 되도록 네 능력치를 모두 같게 맞춘다
    Object.assign(state.players[id], { intelligence: 2, stamina: 2, charm: 2, spellPower: 2, credit: 0, creatures: [], tournamentTrack: 0, tempBoosts: {} });
  }
  const [a, b, c] = state.turnOrder;
  // 마법 경연: a·b가 공동 1위(+2), c는 3위라 보상 없음
  state.players[a].tournamentTrack = 10;
  state.players[b].tournamentTrack = 10;
  state.players[c].tournamentTrack = 5;
  rollExamWith(state, { [a]: 6, [b]: 6, [c]: 6 }); // 시험은 모두 공동 1위 (+3)
  assert.equal(state.phase, "ended");
  // 졸업식 학점은 능력치 부문(마법상·수석상·튼튼상) 모두 공동 1위라 셋이 같다 (마법생물은 없어 생물사랑상은 없음)
  const graduation = (id: string) => state.players[id].awards.reduce((x, w) => x + w.points, 0);
  assert.equal(graduation(a), 3 * BALANCE.rankPoints[0]);
  assert.equal(graduation(b), graduation(a));
  assert.equal(graduation(c), graduation(a));
  assert.equal(state.players[a].credit, 3 + BALANCE.tournamentRewards[0] + graduation(a));
  assert.equal(state.players[b].credit, 3 + BALANCE.tournamentRewards[0] + graduation(b));
  assert.equal(state.players[c].credit, 3 + graduation(c), "3위는 마법 경연 보상이 없다");
  assert.deepEqual([...state.winnerIds!].sort(), [a, b].sort(), "최종 점수가 같은 a·b가 공동 승리");
});

// ── 졸업식 부문상 (41절) ──

test("졸업식 시상(46절·52절·55절): 4부문(학점·매력은 부문이 아님)마다 순위대로 학점 rankPoints, 동점은 같은 순위·같은 학점, 값 0은 상 없음, 임시 능력치 포함", () => {
  assert.deepEqual(BALANCE.graduationCategories, ["spellPower", "intelligence", "stamina", "creature"]);
  assert.ok(!("credit" in AWARD_NAME), "우등상은 없다");
  assert.ok(!BALANCE.graduationCategories.includes("charm"), "기본 부문에 인기상은 없다 (55절, 56절 특별상 후보로만 남는다)");
  assert.equal(AWARD_NAME.creature, "마법생물상", "61절: 마리 수 부문은 마법생물상, 생물사랑상은 매력 부문의 이름이 됐다");
  assert.equal(AWARD_NAME.charm, "생물사랑상");
  withBalance({ rankPoints: [6, 3, 1] }, () => {
    const state = newGame(4);
    const [a, b, c, d] = state.turnOrder;
    const set = (id: string, v: Partial<PlayerGameState>) => Object.assign(state.players[id], { tempBoosts: {}, creatures: [], ...v });
    set(a, { intelligence: 9, stamina: 3, charm: 4, spellPower: 5, credit: 6 });
    set(b, { intelligence: 4, stamina: 7, charm: 4, spellPower: 5, credit: 2 });
    set(c, { intelligence: 4, stamina: 7, charm: 9, spellPower: 0, credit: 0 });
    set(d, { intelligence: 1, stamina: 1, charm: 1, spellPower: 1, credit: 1 });
    const players = state.turnOrder.map((id) => state.players[id]);
    const awards = graduationAwards(players);
    const of = (id: string, cat: string) => awards.get(id)!.find((w) => w.category === cat);
    assert.deepEqual([of(a, "intelligence")?.rank, of(a, "intelligence")?.points], [1, 6], "지력 1위");
    assert.deepEqual([of(b, "intelligence")?.rank, of(c, "intelligence")?.rank], [2, 2], "같은 값은 같은 순위");
    assert.equal(of(b, "intelligence")?.points, 3);
    assert.equal(of(d, "intelligence"), undefined, "공동 2위 둘 다음은 4위라 점수가 없다");
    assert.deepEqual([of(b, "stamina")?.points, of(c, "stamina")?.points, of(a, "stamina")?.points], [6, 6, 1], "공동 1위 다음은 3위");
    assert.equal(of(c, "spellPower"), undefined, "값이 0이면 상이 없다");
    assert.ok(!awards.get(c)!.some((w) => (w.category as string) === "charm"), "매력이 가장 높아도 매력 부문 상은 없다");
    assert.equal(awards.get(a)!.some((w) => w.category === "creature"), false, "마법생물이 없으면 생물사랑상도 없다");
    assert.equal(projectedScore(players, state.players[a]), 6 + awards.get(a)!.reduce((x, w) => x + w.points, 0), "예상 점수 = 지금 학점 + 졸업식 예상 학점");
    // 임시 능력치도 포함해서 비교한다
    state.players[d].tempBoosts = { spellPower: 9 };
    assert.equal(graduationAwards(players).get(d)!.find((w) => w.category === "spellPower")?.rank, 1);
  });
});

test("졸업식 시상: 게임이 끝날 때 정해지고 받은 학점이 학점에 더해져 최종 점수 = 학점. 동점이면 1위 상이 많은 사람이 이긴다", () => {
  const state = newGame(3);
  reachExam(state, "final_exam");
  const [a, b, c] = state.turnOrder;
  // 능력치를 고정한다: 시험 학점이 순위로 갈리지 않도록 모두 같은 점수를 낸다
  const card = state.hidden.roll && state.hidden.roll.kind === "exam" ? state.hidden.roll.card : null;
  assert.ok(card);
  Object.assign(state.players[a], { intelligence: 9, stamina: 1, charm: 1, spellPower: 9 });
  Object.assign(state.players[b], { intelligence: 1, stamina: 9, charm: 9, spellPower: 1 });
  Object.assign(state.players[c], { intelligence: 2, stamina: 2, charm: 2, spellPower: 2 });
  for (const id of state.turnOrder) Object.assign(state.players[id], { credit: 0, creatures: [], tournamentTrack: 0, tempBoosts: {}, awards: [] });
  if (card.bonusStat) for (const id of state.turnOrder) state.players[id][card.bonusStat] = 5;
  for (const id of state.turnOrder) assert.equal(finalScore(state.players[id]), 0, "게임이 끝나기 전에는 상이 없고 학점은 0으로 맞췄다");
  const pending = state.pendingRoll!;
  rollWith(state, Object.fromEntries(pending.entries.map((e) => [e.playerId, [6]])));
  assert.equal(state.phase, "ended");
  const examCredit = (id: string) => state.examResults.at(-1)!.scores.find((s) => s.playerId === id)!.creditAwarded;
  for (const id of state.turnOrder) {
    const p = state.players[id];
    assert.equal(finalScore(p), examCredit(id) + p.awards.reduce((x, w) => x + w.points, 0), "최종 학점 = 기말고사 학점 + 졸업식 학점");
    assert.equal(projectedScore(state.turnOrder.map((x) => state.players[x]), p), finalScore(p), "끝난 뒤 예상 점수는 최종 점수와 같다");
  }
  assert.ok(state.log.some((l) => l.message.includes("졸업식 수석상")));
  const scores = state.turnOrder.map((id) => finalScore(state.players[id]));
  const best = Math.max(...scores);
  assert.ok(state.winnerIds!.every((id) => finalScore(state.players[id]) === best), "승자는 최고 점수");
  const firsts = (id: string) => state.players[id].awards.filter((w) => w.rank === 1).length;
  const tied = state.turnOrder.filter((id) => finalScore(state.players[id]) === best);
  const mostFirsts = Math.max(...tied.map(firsts));
  assert.ok(state.winnerIds!.every((id) => firsts(id) === mostFirsts), "최고 점수 동점이면 1위 상이 많은 사람이 이긴다");
});

test("마법생물 조련: 속성·종류는 표시용이고 기준 수치는 생물별 trainTarget × trainTargetScale이다", () => {
  assert.ok(CREATURE_CARDS.every((c) => c.trainTarget > 0), "생물마다 고정된 기준 수치가 있다");
  for (const c of CREATURE_CARDS) assert.equal(creatureTarget(c), Math.max(1, Math.round(c.trainTarget * BALANCE.trainTargetScale)));
  const state = newGame(2);
  assert.ok(!JSON.stringify(state).includes("tokenNeeds"), "조련에 낼 기운 종류 구분은 없다");
});

test("마법 겨루기: 도전자는 마나기운이 2개 이상(건넬 1개 + 굴릴 1개) 있어야 고를 수 있고, 지목당한 쪽은 건네받은 마나기운으로 굴린다", () => {
  // 마나기운 건네기 규칙을 켜 둔 상태(duelManaFee 1, 45절부터 기본값)를 검증한다
  const savedFee = BALANCE.duelManaFee;
  BALANCE.duelManaFee = 1;
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  state.players[a].manaTokens = 1;
  assert.ok(!availableActivities(state, a).includes("duel"));
  assert.throws(() => selectActivity(state, a, "duel", b), /마나기운/);
  Object.assign(state.players[a], { manaTokens: 3 });
  Object.assign(state.players[b], { manaTokens: 0 });
  selectActivity(state, a, "duel", b);
  advanceResolution(state);
  const entries = state.pendingRoll!.entries;
  assert.equal(state.players[a].manaTokens, 2, "도전자가 마나기운 1개를 건넸다");
  assert.equal(state.players[b].manaTokens, 1, "지목당한 쪽은 마나기운이 없어도 건네받은 1개가 있다");
  assert.equal(entries.find((e) => e.playerId === a)!.diceChoiceMax, 2, "마나기운을 1~2개 사이에서 고른다");
  assert.equal(entries.find((e) => e.playerId === b)!.diceChoiceMax, 1);
  submitRoll(state, a, 1);
  assert.equal(state.players[a].manaTokens, 1, "고른 만큼만 마나기운을 낸다");
  assert.ok(state.log.some((l) => l.message.includes("마나기운")));
  BALANCE.duelManaFee = savedFee;
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

test("별빛 다락방: 판정 카드의 능력치와 상관없이 체력기운을 1~보유 개수 사이에서 골라 내고 낸 개수만큼 주사위를 굴린다 (마나·지력·매력기운은 그대로)", () => {
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  const card = explorationTemplates().find((c) => c.check?.stat === "intelligence")!;
  state.explorationPile.draw.push({ ...card, id: "test-int" }, safeExploration(0));
  Object.assign(state.players[a], { manaTokens: 4, staminaTokens: 4, intelligenceTokens: 3, charmTokens: 3 });
  selectActivity(state, a, "exploration");
  finishChoosing(state);
  advanceResolution(state);
  chooseActivityCard(state, a, "test-int");
  assert.equal(state.pendingRoll?.entries[0].diceToken, "stamina", "탐험의 주사위 재료는 체력기운이다");
  assert.equal(state.pendingRoll?.entries[0].diceChoiceMax, 4);
  assert.equal(state.players[a].staminaTokens, 4, "굴리기 전에는 기운을 내지 않는다");
  assert.throws(() => submitRoll(state, a, 5), /체력기운을 1~4개/);
  submitRoll(state, a, 3);
  assert.equal(state.pendingRoll?.entries[0].diceCount, 3);
  assert.equal(state.players[a].staminaTokens, 1, "고른 만큼만 낸다");
  assert.equal(state.players[a].manaTokens, 4, "마나기운은 건드리지 않는다");
  assert.equal(state.players[a].intelligenceTokens, 3, "지력기운은 들지 않는다");
  assert.equal(state.players[a].charmTokens, 3, "매력기운은 들지 않는다");
});

// ── 능력치 × 활동 조화 (39절): 주 능력치의 기운이 곧 주사위 재료 ──

test("활동마다 주사위 재료 기운이 정해져 있다: 조련 매력, 탐험 체력, 연구실 지력, 마법 경연·마법 겨루기 마나", () => {
  assert.deepEqual(BALANCE.rollFuel, { tournament: "mana", creature: "charm", duel: "mana", exploration: "stamina", lab: "intelligence" });
  const state = newGame(2);
  const p = state.players.p0;
  Object.assign(p, { intelligenceTokens: 1, staminaTokens: 2, charmTokens: 3, manaTokens: 4 });
  assert.equal(tokensOf(p, "intelligence"), 1);
  assert.equal(tokensOf(p, "stamina"), 2);
  assert.equal(tokensOf(p, "charm"), 3);
  assert.equal(tokensOf(p, "mana"), 4);
});

test("연구실 실험은 마나기운(주문력)에 기대지 않는다: 마나기운이 0개여도 지력기운만큼 주사위를 굴린다", () => {
  const state = newGame(2);
  toActivity(state);
  setTokens(state, 1);
  const [a] = state.activityOrder;
  Object.assign(state.players[a], { manaTokens: 0, intelligenceTokens: 3 });
  state.labPile.draw.push(labCard("특별 개인 지도"), labCard("마법 안경"));
  selectActivity(state, a, "lab");
  finishChoosing(state);
  advanceResolution(state);
  chooseActivityCard(state, a, "test-특별 개인 지도");
  assert.equal(state.pendingRoll?.entries[0].diceToken, "intelligence");
  assert.equal(state.pendingRoll?.entries[0].diceChoiceMax, 3);
  submitRoll(state, a, 3);
  assert.equal(state.players[a].intelligenceTokens, 0);
  assert.equal(state.players[a].manaTokens, 0);
});

test("시험 카드: 4가지 능력치가 2장씩 주 능력치(주사위 재료)가 되고, 주 능력치의 기운으로 굴린다 (주문력은 마나기운)", () => {
  const cards = examTemplates();
  assert.equal(cards.length, 8);
  for (const stat of ["intelligence", "stamina", "charm", "spellPower"] as const) assert.equal(cards.filter((c) => c.diceStat === stat).length, 2, stat);
  assert.equal(examFuel({ diceStat: "intelligence" }), "intelligence");
  assert.equal(examFuel({ diceStat: "stamina" }), "stamina");
  assert.equal(examFuel({ diceStat: "charm" }), "charm");
  assert.equal(examFuel({ diceStat: "spellPower" }), "mana");
  assert.ok(cards.every((c) => c.bonusStat !== c.diceStat), "보너스 능력치는 주 능력치와 다르다");
});

// ── 보조 능력치 (38-6절): 보조 능력의 기운을 내서 주 판정을 돕는다 ──

test("반짝 마법 경연(보조=체력, 지구력): 체력기운 1개당 고정 칸을 더 전진한다. 굴리기 전에 마나기운과 함께 내고, 가진 개수를 넘길 수 없다", () => {
  assert.equal(BALANCE.tournamentStaminaBoost, 3);
  const state = newGame(2);
  toActivity(state);
  const [a, b] = state.activityOrder;
  Object.assign(state.players[a], { manaTokens: 2, staminaTokens: 3, tournamentTrack: 0 });
  Object.assign(state.players[b], { manaTokens: 2, staminaTokens: 0, tournamentTrack: 0 });
  selectActivity(state, a, "tournament");
  selectActivity(state, b, "tournament");
  advanceResolution(state);
  const pending = state.pendingRoll!;
  assert.equal(pending.assist?.kind, "stamina");
  assert.equal(pending.entries[0].assistMax, 3, "체력기운을 가진 만큼 낼 수 있다");
  assert.throws(() => submitRoll(state, a, 2, 4), /보조 기운/);
  assert.equal(state.players[a].staminaTokens, 3, "검증에 실패하면 아무것도 내지 않는다");
  assert.equal(state.players[a].manaTokens, 2);
  submitRoll(state, a, 2, 2);
  assert.equal(state.players[a].staminaTokens, 1, "체력기운 2개를 냈다");
  assert.equal(state.players[a].manaTokens, 0);
  rollWith(state, { [a]: [3, 4] });
  assert.equal(state.players[a].tournamentTrack, 7 + 2 * BALANCE.tournamentStaminaBoost, "주사위 합 7 + 체력기운 2개 × 3칸");
  assert.ok(state.log.some((l) => l.message.includes("끝까지 달려요(체력기운 2개)")));
  advanceResolution(state);
  assert.equal(state.pendingRoll?.entries[0].assistMax, undefined, "체력기운이 없으면 선택지가 없다");
  assert.throws(() => submitRoll(state, b, 2, 1), /보조 기운/);
  submitRoll(state, b, 2);
  rollWith(state, { [b]: [3, 4] });
  assert.equal(state.players[b].tournamentTrack, 7);
});

test("52-5절: 함정 간파는 없다 — 지력기운이 있어도 탐험에 보조 선택지가 없고, 보조 기운을 내려 하면 거절된다", () => {
  const base = explorationTemplates().find((c) => c.check)!;
  const state = newGame(2);
  toActivity(state);
  const [a] = state.activityOrder;
  state.explorationPile.draw.push({ ...base, id: "test-trap" }, safeExploration(0));
  Object.assign(state.players[a], { manaTokens: 1, intelligenceTokens: 5 });
  selectActivity(state, a, "exploration");
  finishChoosing(state);
  advanceResolution(state);
  chooseActivityCard(state, a, "test-trap");
  assert.equal(state.pendingRoll?.assist, undefined);
  assert.equal(state.pendingRoll?.entries[0].assistMax, undefined);
  assert.throws(() => submitRoll(state, a, 1, 1), /보조 기운/);
  assert.equal(state.players[a].intelligenceTokens, 5, "지력기운은 그대로");
});





// ── 1주차 학교 소식 (44절) ──

// 첫 달 학교 소식으로 원하는 행사 카드가 나오게 해서 게임을 시작한다 (행사를 켠 상태)
function newGameWithNews(count: number, newsName: string): GameState {
  let state!: GameState;
  withBalance({ schoolNewsEvents: true }, () => {
    state = createGame(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `p${i}`, isBot: true })));
    const card = eventTemplates().find((c) => c.name === newsName);
    assert.ok(card, newsName);
    state.hidden.newsDeck = [card];
    let guard = 0;
    while (state.phase === "setup" && guard++ < 100) rollAndConfirm(state);
  });
  assert.equal(state.news?.name, newsName);
  return state;
}

test("학교 소식 행사 덱은 12장이고, 행사를 켜면 시험과 상관없는 달마다 1장씩 겹치지 않게 나온다", () => {
  assert.equal(NEWS_EVENTS, true, "기본 규칙에서 행사가 켜져 있다");
  assert.equal(eventTemplates().length, 12);
  withBalance({ schoolNewsEvents: true }, () => {
    const state = newGame(3);
    const names: string[] = [];
    let round = 0;
    let guard = 0;
    while (state.phase !== "ended" && guard++ < 6000) {
      if (state.round !== round) {
        round = state.round;
        if (state.news?.kind === "event") names.push(state.news.name);
      }
      botStep(state);
    }
    assert.equal(names.length, 8, "1·2·3·5·7·8·9·11개월");
    assert.equal(new Set(names).size, 8, "한 판 안에서는 같은 행사가 다시 나오지 않는다");
  });
});

test("학교 소식: 급식 특식 데이는 모두에게 체력기운 +1, 수업 박람회는 수업카드 1장 더, 학교 축제는 매력 과목 기운 +1", () => {
  const lunch = newGameWithNews(3, "급식 특식 데이");
  for (const p of Object.values(lunch.players)) assert.equal(p.staminaTokens, 1);
  const fair = newGameWithNews(3, "수업 박람회");
  assert.equal(fair.classMarket.length, 3 + BALANCE.classMarketExtra + 1);
  const festival = newGameWithNews(4, "학교 축제");
  for (const c of festival.classMarket) assert.equal(c.gain, BALANCE.classTiers[c.level].gain + (c.stat === "charm" ? 1 : 0), c.name);
});

test("52-8절: 행사 효과는 그 자리에서 끝난다 — 기운 선물·과목 수업 +1·수업카드 1장 더 세 종류뿐이고, 판정 목표값·마법 경연·대결은 바꾸지 않는다", () => {
  const kinds = new Set(eventTemplates().flatMap((c) => Object.keys(c.effect)));
  assert.deepEqual([...kinds].sort(), ["classBonus", "classExtra", "gift"]);
  const picnic = newGameWithNews(3, "봄 소풍");
  for (const p of Object.values(picnic.players)) assert.equal(p.charmTokens, 1, "봄 소풍은 매력기운 +1");
  const rain = newGameWithNews(3, "장마철");
  assert.equal(rain.classMarket.length, 3 + BALANCE.classMarketExtra + 1, "장마철은 수업카드 1장 더");
  const show = newGameWithNews(3, "마법 시범 공연");
  for (const p of Object.values(show.players)) assert.equal(p.manaTokens, 1, "마법 시범 공연은 마나기운 +1");
  toActivity(show);
  const [a] = show.activityOrder;
  show.creatureDeck.push(creature("대지의 수호자"), creature("정령 고릴라"));
  selectActivity(show, a, "creature");
  finishChoosing(show);
  advanceResolution(show);
  chooseActivityCard(show, a, "test-정령 고릴라");
  const ctx = show.hidden.roll;
  assert.ok(ctx?.kind === "creature");
  assert.equal(ctx.target, creatureTarget(creature("정령 고릴라")), "행사가 목표값을 바꾸지 않는다");
});

test("시험 공고(4·10개월): 시험 카드가 공개되고, 그달 수업카드 수는 평소와 같다 (52-6절)", () => {
  const state = newGame(3);
  let guard = 0;
  while (!(state.round === BALANCE.midtermNoticeRound && state.phase === "class") && guard++ < 3000) botStep(state);
  assert.equal(state.news?.kind, "notice");
  assert.equal(state.news?.name, "중간고사 공고");
  const exam = state.exams.midterm;
  assert.ok(exam);
  assert.equal(state.classMarket.length, 3 + BALANCE.classMarketExtra, "시험 과목 카드가 더 나오지 않는다");
});

test("49절 단순화 기본값: 선은 매달 시계방향, 정규수업도 선부터, 대결 비용은 마나기운만, 구역 참가비·마법 경연 체력 보조·이정표·탐험 역전 보너스 없음", () => {
  assert.deepEqual(SIMPLIFIED, {
    starterRule: "rotate",
    classPickStarterLast: false,
    duelCharmFee: 0,
    activitySecondParticipantCost: 0,
    tournamentStaminaBoost: 0,
    tournamentMilestoneStep: 0,
    catchUpBonus: 0,
    duelTargetRollsFirst: true,
    revealOffersAtMonthStart: true,
  });
  withBalance(SIMPLIFIED as Partial<typeof BALANCE>, () => {
    const state = newGame(4);
    const n = 4;
    const fromStarter = Array.from({ length: n }, (_, i) => state.turnOrder[(state.startingPlayerIndex + i) % n]);
    assert.deepEqual(state.classPickOrder, fromStarter, "정규수업도 선부터");
    const before = state.startingPlayerIndex;
    toActivity(state);
    setTokens(state, 2, 0);
    const [a, b] = state.activityOrder;
    selectActivity(state, a, "lab");
    selectActivity(state, b, "lab"); // 매력기운 0개여도 함께 들어갈 수 있다
    assert.deepEqual(state.activitySlots.lab, [a, b]);
    let guard = 0;
    while (state.round === 1 && guard++ < 500) botStep(state);
    assert.equal(state.startingPlayerIndex, (before + 1) % n, "다음 달 선은 시계방향으로 한 칸");
  });
});

test("이번 달 활동 카드 미리 공개(50절): 1주차에 마법생물·연구실·별빛 다락방 카드가 2장씩 공개되고, 3주차에 먼저 온 사람이 고르고 남은 카드는 두 번째 참가자가 가져간다", () => {
  withBalance({ revealOffersAtMonthStart: true }, () => {
    const state = newGame(3);
    assert.equal(state.phase, "class");
    for (const a of ["creature", "lab", "exploration"] as const) assert.equal(state.activityOffers[a]?.cards.length, 2, `${a} 카드가 정규수업 전에 보인다`);
    const labIds = state.activityOffers.lab!.cards.map((c) => c.id);
    toActivity(state);
    assert.deepEqual(state.activityOffers.lab!.cards.map((c) => c.id), labIds, "3주차에도 같은 카드");
    setTokens(state, 3, 3);
    const [a, b, c] = state.activityOrder;
    selectActivity(state, a, "lab");
    selectActivity(state, b, "lab");
    selectActivity(state, c, "tournament");
    advanceResolution(state);
    assert.equal(state.pendingPick?.playerId, a);
    chooseActivityCard(state, a, labIds[0]);
    rollWith(state, {});
    advanceResolution(state);
    assert.equal(state.pendingPick?.playerId, b);
    assert.deepEqual(state.activityOffers.lab!.cards.map((x) => x.id), [labIds[1]], "두 번째 참가자는 남은 카드");
    chooseActivityCard(state, b, null);
    let guard = 0;
    while (state.round === 1 && guard++ < 200) botStep(state);
    assert.equal(state.round, 2);
    assert.equal(state.activityOffers.lab?.cards.length, 2, "다음 달 1주차에 새 카드가 공개된다");
    assert.ok(!state.activityOffers.lab!.cards.some((x) => labIds.includes(x.id)));
  });
});

test("51절 빼기: 카드에 임시 능력치·다음 달 기운·엿보기가 없고, 마법생물 능력은 속성별 3종류, 마법 겨루기 승자는 학점 +1", () => {
  const effects = [...labTemplates().map((c) => c.effect), ...explorationTemplates().flatMap((c) => [c.success, c.failure])];
  for (const e of effects) assert.ok(!e.tempStats && !e.nextMana && !e.nextStamina && !e.peekExploration, JSON.stringify(e));
  const kinds = new Set(CREATURE_CARDS.map((c) => `${c.element}:${c.ability.trigger}:${c.ability.effect}`));
  assert.deepEqual([...kinds].sort(), ["land:prep:stamina", "ocean:prep:mana", "sky:duel:rollBonus"]);
  assert.ok(CREATURE_CARDS.every((c) => c.ability.amount === (c.trainTarget >= 16 ? 2 : 1)), "어려운 생물(16 이상)은 +2");
  withBalance({ revealOffersAtMonthStart: true }, () => {
    const state = newGame(3);
    assert.equal(state.activityOffers.duel, undefined, "마도서가 공개되지 않는다");
    toActivity(state);
    setTokens(state, 0);
    const [x, y, z] = state.activityOrder;
    state.players[x].manaTokens = 2;
    selectActivity(state, x, "duel", y);
    selectActivity(state, z, "tournament");
    advanceResolution(state);
    const credit = state.players[x].credit;
    rollWith(state, { [x]: [6], [y]: [1] });
    assert.equal(state.players[x].credit, credit + 1, "이긴 사람 학점 +1");
    assert.equal(state.pendingPick, null);
  });
});

test("기본 규칙 수치 (45절 조정): 마법 겨루기 도전자는 마나기운 1개를 건넨다", () => {
  assert.equal(NEW_RULES.duelManaFee, 1);
});

test("시험 주간 벼락치기(6·12개월): 선부터 한 명씩, 가진 기운 1개를 시험 과목 기운 1개로 바꾸거나 넘어간 뒤 시험을 친다", () => {
  const state = newGame(3);
  let guard = 0;
  while (state.phase !== "cram" && guard++ < 3000) botStep(state);
  assert.equal(state.phase, "cram");
  assert.equal(state.round, BALANCE.midtermRound);
  assert.equal(state.news?.kind, "examWeek");
  const fuel = examFuel(state.hidden.examPlan.midterm);
  assert.equal(state.news?.effect.cramTo, fuel);
  const n = state.turnOrder.length;
  assert.deepEqual(state.cramOrder, Array.from({ length: n }, (_, i) => state.turnOrder[(state.startingPlayerIndex + i) % n]), "선부터 시계방향");
  const [a, b, c] = state.cramOrder;
  assert.throws(() => cramTurn(state, b, null), /차례가 아닙니다/);
  const other = (["intelligence", "stamina", "charm", "mana"] as const).find((k) => k !== fuel)!;
  Object.assign(state.players[a], { intelligenceTokens: 0, staminaTokens: 0, charmTokens: 0, manaTokens: 0 });
  state.players[a][({ intelligence: "intelligenceTokens", stamina: "staminaTokens", charm: "charmTokens", mana: "manaTokens" } as const)[other]] = 2;
  assert.deepEqual(cramSources(state, state.players[a]), [other], "시험 과목 기운이 아닌, 가진 기운만 바꿀 수 있다");
  assert.throws(() => cramTurn(state, a, fuel), /바꿀 수 없는 기운/);
  cramTurn(state, a, other);
  assert.equal(tokensOf(state.players[a], other), 1);
  assert.equal(tokensOf(state.players[a], fuel), 1);
  cramTurn(state, b, null);
  assert.equal(state.phase, "cram");
  cramTurn(state, c, null);
  assert.equal(state.phase, "midterm_exam", "모두 고르면 시험");
  assert.equal(currentRoller(state), a, "시험도 선부터 굴린다");
});

test("56·57절 기본값: 어려운 생물 학점 +1(세트 학점 없음), 도전자 굴림 +1, 학점 낮은 순, 장래희망(기준 4), 특별상 1장, 대회 카드, 대결 승리 학점 2, 마법생물 교감", () => {
  assert.deepEqual(P5, {
    creatureRareCredit: 1,
    creatureSetCredit: 0,
    duelChallengerBonus: 1,
    turnOrderRule: "creditAsc",
    dreams: true,
    specialAwards: 1,
    tournamentCards: true,
    duelWinReward: { credit: 2 },
    creatureBond: true,
    dreamThreshold: 4,
  });
});

test("56절 B1: 정규수업·자율활동·시험 순서는 학점이 낮은 사람부터 (같으면 선부터 시계방향)", () => {
  withBalance({ ...SIMPLIFIED, ...P5, tournamentCards: false } as Partial<typeof BALANCE>, () => {
    const state = newGame(4);
    const strategy = BOT_PERSONALITIES[0];
    let guard = 0;
    let checked = 0;
    let unequal = 0;
    while (state.phase !== "ended" && guard++ < 5000) {
      const n = state.turnOrder.length;
      const seats = Array.from({ length: n }, (_, i) => state.turnOrder[(state.startingPlayerIndex + i) % n]);
      const expected = [...seats].sort((x, y) => state.players[x].credit - state.players[y].credit);
      if (state.phase === "class" && state.classPickPointer === 0) {
        assert.deepEqual(state.classPickOrder, expected);
        checked += 1;
        if (expected.join() !== seats.join()) unequal += 1;
      }
      if (state.phase === "activity" && state.activityTurnPointer === 0 && state.activityStage === "choose") {
        assert.deepEqual(state.activityOrder, expected);
        checked += 1;
      }
      if (state.pendingRoll?.kind === "exam" && state.pendingRoll.entries.every((e) => e.dice === null)) {
        assert.deepEqual(state.pendingRoll.entries.map((e) => e.playerId), expected, "시험도 학점 낮은 순");
        checked += 1;
      }
      botStep(state, strategy);
    }
    assert.ok(checked >= 20 && unequal > 0, `${checked}회 확인, 좌석과 다른 순서 ${unequal}회`);
  });
});

test("56절 B2 장래희망: 2장을 받아 1장을 고르고(1개월까지 바꿀 수 있음), 졸업할 때 두 능력치가 모두 기준(4) 이상이면 학점 +3", () => {
  withBalance(P5 as Partial<typeof BALANCE>, () => {
    const state = newGame(3);
    for (const id of state.turnOrder) {
      const p = state.players[id];
      assert.equal(p.dreamOptions?.length, BALANCE.dreamDeal);
      assert.equal(p.dream?.id, p.dreamOptions![0].id, "고르기 전에는 첫 장");
    }
    const [a] = state.turnOrder;
    const pa = state.players[a];
    chooseDream(state, a, pa.dreamOptions![1].id);
    assert.equal(pa.dream?.id, pa.dreamOptions![1].id);
    assert.throws(() => chooseDream(state, a, state.players[state.turnOrder[1]].dreamOptions![0].id), /받은 장래희망/);
    const [s1, s2] = pa.dream!.stats;
    const T = BALANCE.dreamThreshold;
    Object.assign(pa, { intelligence: 1, stamina: 1, charm: 1, spellPower: 1, [s1]: T, [s2]: T - 1 });
    assert.equal(dreamFulfilled(pa), false, "하나라도 기준 미만이면 못 이룬다");
    const players = state.turnOrder.map((id) => state.players[id]);
    const before = projectedScore(players, pa, state.specialAwards);
    Object.assign(pa, { [s2]: T });
    assert.equal(dreamFulfilled(pa), true);
    assert.ok(projectedScore(players, pa, state.specialAwards) >= before + BALANCE.dreamCredit, "예상 점수에 장래희망 학점이 들어간다");
    let guard = 0;
    while (state.round === 1 && guard++ < 500) botStep(state);
    assert.throws(() => chooseDream(state, a, pa.dreamOptions![0].id), /동안만/);
  });
});

test("56절 B3 특별상: 게임마다 1장 공개되고, 졸업식에서 다른 부문처럼 순위 학점을 준다", () => {
  withBalance(P5 as Partial<typeof BALANCE>, () => {
    const state = newGame(3);
    assert.equal(state.specialAwards?.length, 1);
    const [special] = state.specialAwards!;
    assert.ok(!BALANCE.graduationCategories.includes(special), "기본 4부문과 겹치지 않는다");
    const players = state.turnOrder.map((id) => state.players[id]);
    Object.assign(players[0], { intelligence: 4, stamina: 4, charm: 5, spellPower: 4, feats: { exploration: 3, lab: 3, duel: 3, exam: 30, tournament: 3, creature: 0 } });
    const got = graduationAwards(players, [special]).get(players[0].id)!.find((w) => w.category === special);
    assert.ok(got && got.rank === 1 && got.points === BALANCE.rankPoints[0], `${special} 1위`);
    let guard = 0;
    while (state.phase !== "ended" && guard++ < 5000) botStep(state);
    assert.equal(state.phase, "ended");
    assert.ok(state.log.some((l) => l.message.startsWith(`졸업식 ${AWARD_NAME[special]}`)) || players.every((p) => awardValue(p, special) <= 0));
  });
});

test("56절 C1 대회 카드: 반짝 마법 경연도 1주차에 카드 2장이 공개되고, 마나기운 주사위 합이 목표 이상이면 입상(주문력 +1 성장 + 카드 보상)", () => {
  withBalance({ ...SIMPLIFIED, ...P5 } as Partial<typeof BALANCE>, () => {
    const state = newGame(3);
    assert.equal(state.activityOffers.tournament?.cards.length, 2, "대회 카드 2장 공개");
    toActivity(state);
    setTokens(state, 0, 0);
    const [a, b] = state.activityOrder;
    state.players[a].manaTokens = 0;
    assert.ok(availableActivities(state, a).includes("tournament"), "마나기운이 없어도 공짜 주사위 1개로 참가할 수 있다");
    state.players[a].manaTokens = 3;
    selectActivity(state, a, "tournament");
    selectActivity(state, b, "tournament");
    finishChoosing(state);
    advanceResolution(state);
    assert.equal(state.pendingPick?.playerId, a);
    const card = state.hidden.offers.tournament![0] as { id: string; target: number; reward: { credit?: number } };
    chooseActivityCard(state, a, card.id);
    assert.equal(state.hidden.roll?.kind, "tournamentCard");
    const before = { sp: state.players[a].spellPower, credit: state.players[a].credit };
    rollWith(state, { [a]: [6, 6] });
    assert.equal(state.players[a].spellPower, before.sp + 1, "입상하면 주문력 성장");
    assert.equal(state.players[a].credit, before.credit + BALANCE.growthCredit + (card.reward.credit ?? 0));
    assert.equal(state.players[a].feats?.tournament, 1);
    advanceResolution(state);
    assert.equal(state.pendingPick?.playerId, b, "두 번째 참가자는 남은 카드");
    assert.equal(state.activityOffers.tournament?.cards.length, 1);
    chooseActivityCard(state, b, state.activityOffers.tournament!.cards[0].id);
    const sp = state.players[b].spellPower;
    rollWith(state, { [b]: [1] });
    assert.equal(state.players[b].spellPower, sp, "탈락하면 성장 없음");
    assert.equal(state.players[b].tournamentTrack, 0, "트랙을 쓰지 않는다");
  });
});

test("56·57절: 어려운 마법생물(기준 16 이상)을 조련하면 학점 +1 (세트 완성 학점은 없다), 데려오면 교감으로 속성 능력치 +1", () => {
  withBalance(P5 as Partial<typeof BALANCE>, () => {
    const run = (name: string, owned: string[]) => {
      const state = newGame(2);
      toActivity(state);
      setTokens(state, 2, 8);
      const [a] = state.activityOrder;
      state.players[a].creatures = owned.map(creature);
      state.creatureDeck.push(creature(name), creature("정령 고릴라"));
      selectActivity(state, a, "creature");
      finishChoosing(state);
      advanceResolution(state);
      chooseActivityCard(state, a, `test-${name}`);
      const p = state.players[a];
      const before = { credit: p.credit, intelligence: p.intelligence, stamina: p.stamina, charm: p.charm, spellPower: p.spellPower };
      const staminaTokens = p.staminaTokens;
      rollWith(state, { [a]: [6, 6, 6, 6, 6, 6] });
      const gained = Object.fromEntries((["intelligence", "stamina", "charm", "spellPower"] as const).map((s) => [s, p[s] - before[s]]));
      return { credit: p.credit - before.credit - BALANCE.growthCredit, gained, staminaTokens, state, a };
    };
    assert.equal(run("정령 고릴라", []).credit, 0, "쉬운 생물은 보너스 없음");
    assert.equal(run("해양 정령", []).credit, 1, "어려운 생물 +1");
    assert.equal(run("감각 물고기", ["하늘의 꽃마녀", "땅굴 잠수꾼"]).credit, 0, "세트 완성 학점은 없다");
    assert.deepEqual(run("정령 고릴라", []).gained, { intelligence: 0, stamina: 1, charm: 1, spellPower: 0 }, "육지 → 체력 +1 (매력은 조련 성장)");
    assert.deepEqual(run("감각 물고기", []).gained, { intelligence: 1, stamina: 0, charm: 1, spellPower: 0 }, "바다 → 지력 +1");
    assert.deepEqual(run("하늘의 꽃마녀", []).gained, { intelligence: 0, stamina: 0, charm: 1, spellPower: 1 }, "하늘 → 주문력 +1");
    // 교감이면 매달 체력기운 같은 생물 능력이 없다 (끄면 육지 생물이 다음 달에 체력기운을 준다)
    const prepGift = () => {
      const r = run("대지의 수호정령", []);
      const p = r.state.players[r.a];
      let last = 0;
      let guard = 0;
      while (r.state.round === 1 && guard++ < 500) {
        last = p.staminaTokens + p.pendingStaminaTokens;
        botStep(r.state);
      }
      return p.staminaTokens - last;
    };
    assert.equal(prepGift(), 0, "교감: 매달 받는 기운이 없다");
    withBalance({ creatureBond: false }, () => assert.equal(prepGift(), 2, "교감을 끄면 어려운 육지 생물이 체력기운 +2"));
  });
});

test("56절 A2·대결 보강: 도전자의 굴림에 +1 — 같은 눈이면 도전자가 이기고, 이기면 학점 +2", () => {
  withBalance({ ...P5, tournamentCards: false } as Partial<typeof BALANCE>, () => {
    const state = newGame(3);
    toActivity(state);
    setTokens(state, 0);
    const [x, y, z] = state.activityOrder;
    state.players[x].manaTokens = 3;
    selectActivity(state, x, "duel", y);
    selectActivity(state, z, "lab");
    advanceResolution(state);
    const credit = state.players[x].credit;
    rollWith(state, { [x]: [3], [y]: [3] });
    assert.equal(state.players[x].credit, credit + 2, "도전자 승리 학점 +2");
  });
});

// 한 걸음씩(굴림은 한 사람씩, 정리는 한 사람씩) 진행하는 사람 역할 — 멈춘 상태가 생기도록 잘게 나눈다
function microStep(state: GameState, strategy = BOT_PERSONALITIES[0]): void {
  if (state.pendingRoll) {
    const id = currentRoller(state)!;
    if (state.pendingRoll.entries.find((e) => e.playerId === id)!.dice === null) submitRoll(state, id);
    else confirmRoll(state, id);
  } else botStep(state, strategy);
}

test("게임 도중 플레이어 제거: 어느 단계에서 내보내도 남은 사람끼리 끝까지 진행되고 상태가 일관된다", () => {
  for (let trial = 0; trial < 400; trial++) {
    const count = 3 + (trial % 3); // 3~5명 (제거 뒤에도 2명 이상)
    const state = createGame(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `p${i}`, isBot: false })));
    const stopAt = Math.floor(Math.random() * 450);
    let steps = 0;
    while (state.phase !== "ended" && steps < stopAt) {
      microStep(state);
      steps++;
    }
    if (state.phase === "ended") continue;
    const victim = state.turnOrder[Math.floor(Math.random() * state.turnOrder.length)];
    const where = `trial ${trial} step ${steps} phase ${state.phase}/${state.activityStage} round ${state.round}`;
    removePlayerFromGame(state, victim);
    assert.ok(!state.turnOrder.includes(victim) && !state.players[victim], `제거됨 (${where})`);
    assert.ok(state.startingPlayerIndex >= 0 && state.startingPlayerIndex < state.turnOrder.length, `선 인덱스 유효 (${where})`);
    const refs = (ids: string[]) => ids.includes(victim);
    assert.ok(!refs(state.activityOrder) && !refs(state.classPickOrder) && !refs(state.cramOrder), `순서 목록에 없음 (${where})`);
    assert.ok(!state.activityChoices.some((c) => c.playerId === victim || c.targetPlayerId === victim), `활동 선택에 없음 (${where})`);
    assert.ok(!state.duels.some((d) => d.challengerId === victim || d.targetId === victim), `대결 목록에 없음 (${where})`);
    assert.ok(!Object.values(state.activitySlots).some(refs), `구역에 없음 (${where})`);
    assert.ok(!state.pendingRoll?.entries.some((e) => e.playerId === victim), `굴림에 없음 (${where})`);
    assert.ok(state.pendingPick?.playerId !== victim, `선택 대기에 없음 (${where})`);
    // 이어서 끝까지 (멈춤이 없어야 한다)
    let guard = 0;
    while ((state.phase as string) !== "ended" && guard++ < 3000) microStep(state);
    assert.equal(state.phase, "ended", `끝까지 진행됨 (${where})`);
    assert.ok(state.winnerIds?.every((id) => state.turnOrder.includes(id)), `승자는 남은 사람 (${where})`);
  }
});

// ── 61절 라이트 규칙 (2026-10-16): 전략 AI 리그로 검증한 기본값 ──
// 지금 기본값 전체 = 각 절의 묶음을 차례로 덮은 것 (61절 값이 마지막)
const CURRENT = { ...NEW_RULES, schoolNewsEvents: NEWS_EVENTS, growthCredit: GROWTH_CREDIT, ...SIMPLIFIED, ...P5, ...L4, ...LIGHT } as Partial<typeof BALANCE>;

test("61절 기본값: 4구역(반짝 마법 경연 없음)·공짜 주사위 1개·다시 굴리기 없음·시험 과목 고정 공개·벼락치기 없음·심화 수업 없음·특별상 없음 등", () => {
  assert.deepEqual(LIGHT, {
    classAdvanced: false, examsAtStart: true, cram: false, specialAwards: 0, duelTieWinner: "defender", duelChallengerBonus: 0, creatureRareCredit: 1,
    creatureRareMin: 0, labCostScale: 0, baseDice: 1, duelManaFee: 0, labTarget: 8, exploreTargetMod: LIGHT.exploreTargetMod, trainTargetScale: LIGHT.trainTargetScale,
    graduationCategories: ["spellPower", "intelligence", "stamina", "charm"], dreamThreshold: 5, dreamCredit: 2, classDeckSize: 26,
    explorationPenalty: false, reroll: false, disabledActivities: ["tournament"], fixedExams: { midterm: "마법 마라톤", final: "주문 실기" },
    duelDefenderReward: false, duelTargetKeepsTurn: true, duelDefenderStatDice: "flat", labPrintedTargets: true, labTargetMod: 0,
    duelTargetOnce: true, duelWinReward: { credit: 1 }, duelLearn: true,
  });
  // 카드 6종 약 130장: 수업 26×2 · 마법생물 21 · 연구 16 · 탐험 16 · 장래희망 12 · 행사 12
  assert.equal(CREATURE_CARDS.length, 21);
  assert.equal(labTemplates().length, 16);
  assert.equal(explorationTemplates().length, 16);
  assert.ok(explorationTemplates().every((c) => c.check), "탐험 카드는 모두 판정이 있다");
  assert.ok(labTemplates().every((c) => c.target !== undefined && !c.effect.stats?.intelligence), "연구 카드는 목표값이 인쇄돼 있고, 지력이 아닌 능력치를 준다(지력은 성장으로 오른다)");
  assert.equal(eventTemplates().length, 12);
});

test("61절: 반짝 마법 경연 구역이 없고 1주차에 마법생물·연구실·별빛 다락방 카드만 공개된다", () => {
  withBalance(CURRENT, () => {
    const state = newGame(4);
    assert.deepEqual(Object.keys(state.activityOffers).sort(), ["creature", "exploration", "lab"]);
    toActivity(state);
    const id = state.activityOrder[0];
    assert.ok(!availableActivities(state, id).includes("tournament"));
    assert.throws(() => selectActivity(state, id, "tournament"));
  });
});

test("61절: 시험 과목은 보드에 인쇄된 고정 과목(중간 마법 마라톤·기말 주문 실기)이고 처음부터 공개되며, 시험 달에는 벼락치기 없이 바로 시험", () => {
  withBalance(CURRENT, () => {
    const state = newGame(3);
    assert.equal(state.exams.midterm?.name, "마법 마라톤");
    assert.equal(state.exams.final?.name, "주문 실기");
    let guard = 0;
    while (state.phase !== "midterm_exam" && guard++ < 5000) {
      assert.notEqual(state.phase, "cram", "벼락치기 단계가 없다");
      botStep(state);
    }
    assert.equal(state.phase, "midterm_exam");
    assert.equal(state.round, BALANCE.midtermRound);
  });
});

test("61절: 굴릴 때 주사위 1개는 언제나 공짜 — 기운을 0개 내도 되고, 다시 굴리기는 없다", () => {
  withBalance({ ...CURRENT, revealOffersAtMonthStart: false }, () => {
    const state = newGame(3);
    toActivity(state, 0);
    const [a] = state.activityOrder;
    Object.assign(state.players[a], { intelligence: 1, intelligenceTokens: 3, manaTokens: 3 });
    state.labPile.draw.push(labCardNow("사교 무도회 레슨"), labCardNow("특별 개인 지도"));
    selectActivity(state, a, "lab");
    finishChoosing(state);
    advanceResolution(state);
    chooseActivityCard(state, a, "test-now-특별 개인 지도");
    const entry = state.pendingRoll!.entries[0];
    assert.equal(entry.baseDice, 1);
    assert.equal(entry.diceChoiceMax, 2, "낼 수 있는 지력기운은 지력 + 1개까지");
    submitRoll(state, a, 0);
    assert.equal(entry.dice!.length, 1, "0개를 내도 공짜 주사위 1개");
    assert.equal(state.players[a].intelligenceTokens, 3, "기운은 그대로");
    assert.throws(() => rerollDice(state, a, [0]), /다시 굴리기가 없어요/);
  });
});

test("61절: 연구 카드마다 인쇄된 목표값으로 판정하고, 성공하면 카드 보상 + 지력 성장", () => {
  withBalance({ ...CURRENT, revealOffersAtMonthStart: false }, () => {
    const state = newGame(3);
    toActivity(state, 0);
    const [a] = state.activityOrder;
    const card = labCardNow("특별 개인 지도");
    assert.equal(card.target, 6);
    state.labPile.draw.push(labCardNow("사교 무도회 레슨"), card);
    selectActivity(state, a, "lab");
    finishChoosing(state);
    advanceResolution(state);
    chooseActivityCard(state, a, card.id);
    assert.equal(labTargetValue(card), 6);
    assert.equal((state.hidden.roll as { target: number }).target, 6);
    const before = { ...state.players[a] };
    rollWith(state, { [a]: [6] });
    assert.equal(state.players[a].charm, before.charm + 1, "카드 보상: 매력 +1");
    assert.equal(state.players[a].intelligence, before.intelligence + 1, "성장: 지력 +1");
    assert.equal(state.players[a].credit, before.credit + 2, "카드 학점 +1 · 성장 학점 +1");
  });
});

test("61절: 탐험에 실패해도 손해가 없다 (카드만 버린다)", () => {
  withBalance({ ...CURRENT, revealOffersAtMonthStart: false }, () => {
    const state = newGame(3);
    toActivity(state);
    const [a] = state.activityOrder;
    const card = explorationByName("그림자 미로");
    state.explorationPile.draw.push(explorationByName("먼지 쌓인 서고"), card);
    Object.assign(state.players[a], { staminaTokens: 3, manaTokens: 3 });
    selectActivity(state, a, "exploration");
    finishChoosing(state);
    advanceResolution(state);
    if (state.pendingPick) chooseActivityCard(state, a, card.id);
    const before = { ...state.players[a] };
    rollWith(state, { [a]: [1] });
    const p = state.players[a];
    assert.equal(p.manaTokens, before.manaTokens, "마나기운을 잃지 않는다");
    assert.ok(p.staminaTokens <= before.staminaTokens, "낸 체력기운만 쓴다");
    assert.equal(p.stamina, before.stamina, "실패하면 성장도 없다");
  });
});

test("61절: 마법생물을 데려오면 카드에 적힌 학점 +1 (성장 학점과 별도)", () => {
  withBalance({ ...CURRENT, revealOffersAtMonthStart: false }, () => {
    const state = newGame(3);
    toActivity(state);
    const [a] = state.activityOrder;
    state.creatureDeck.push(creature("정령 고릴라"), creature("대지의 수호자"));
    Object.assign(state.players[a], { charmTokens: 3 });
    selectActivity(state, a, "creature");
    finishChoosing(state);
    advanceResolution(state);
    if (state.pendingPick) chooseActivityCard(state, a, "test-대지의 수호자");
    const before = state.players[a].credit;
    rollWith(state, { [a]: [6, 6, 6] });
    assert.equal(state.players[a].creatures.length, 1);
    assert.equal(state.players[a].credit, before + 2, "생물 카드 학점 +1 · 성장 학점 +1");
  });
});

test("61절 마법 겨루기: 아무 친구나 지목(한 달에 한 번만 지목받음), 지목당한 친구도 자기 활동을 한다. 막기는 자동(주사위 1개 + 주문력), 도전자가 더 높아야 이기고 막아 내도 보상은 없다", () => {
  const win = (LIGHT.duelWinReward as { credit?: number }).credit ?? 0;
  withBalance(CURRENT, () => {
    const state = newGame(3);
    toActivity(state);
    const [x, y, z] = state.activityOrder;
    Object.assign(state.players[x], { manaTokens: 2, spellPower: 2 });
    Object.assign(state.players[y], { spellPower: 2, manaTokens: 5 });
    selectActivity(state, x, "duel", y);
    assert.equal(state.players[y].hasActedThisPhase, false, "지목당해도 자기 차례에 활동을 고른다");
    selectActivity(state, y, "lab");
    assert.ok(!duelTargets(state, z).includes(y), "이미 지목받은 친구는 이번 달 다시 지목할 수 없다");
    assert.ok(duelTargets(state, z).includes(x), "이미 활동을 고른 친구도 지목할 수 있다");
    selectActivity(state, z, "exploration");
    advanceResolution(state);
    assert.equal(state.pendingRoll!.kind, "duel");
    const defender = state.pendingRoll!.entries.find((e) => e.playerId === y)!;
    assert.equal(defender.diceChoiceMax, undefined, "막는 쪽은 고를 것이 없다 (일부러 질 수 없다)");
    assert.equal(defender.diceCount, 1);
    assert.ok(defender.confirmed && defender.dice?.length === 1, "막기는 서버가 바로 굴려 확정한다 (기다릴 것이 없다)");
    assert.equal(defender.bonus, 2, "화면에 보일 막기 보너스 = 주문력");
    const before = { x: state.players[x].credit, y: state.players[y].credit, yMana: state.players[y].manaTokens };
    rollWith(state, { [y]: [2], [x]: [4] });
    assert.equal(state.players[x].credit, before.x, "주사위 2 + 주문력 2 = 4, 같으면 도전 실패");
    assert.equal(state.players[y].credit, before.y, "막아 낸 친구도 보상 없음");
    assert.equal(state.players[y].manaTokens, before.yMana, "막을 때 기운을 쓰지 않는다");
  });
  withBalance(CURRENT, () => {
    const state = newGame(3);
    toActivity(state);
    const [x, y, z] = state.activityOrder;
    selectActivity(state, x, "duel", y);
    selectActivity(state, y, "lab");
    selectActivity(state, z, "exploration");
    advanceResolution(state);
    const before = { credit: state.players[x].credit, sp: state.players[x].spellPower };
    rollWith(state, { [y]: [1], [x]: [5] });
    assert.equal(state.players[x].spellPower, before.sp + 1, "이기면 주문력 성장");
    assert.equal(state.players[x].credit, before.credit + win + 1, "승리 학점 + 성장 학점 1");
  });
  // 겨루며 배운다: 이긴 사람은 상대가 나보다 높은 능력치 중 차이가 가장 큰 것 하나 +1
  withBalance(CURRENT, () => {
    const state = newGame(3);
    toActivity(state);
    const [x, y, z] = state.activityOrder;
    Object.assign(state.players[y], { stamina: 4, charm: 3, spellPower: 1 });
    selectActivity(state, x, "duel", y);
    selectActivity(state, y, "lab");
    selectActivity(state, z, "exploration");
    advanceResolution(state);
    const before = { ...state.players[x] };
    rollWith(state, { [y]: [1], [x]: [6] });
    assert.equal(state.players[x].stamina, before.stamina + 1, "체력 차이(3)가 가장 커서 체력을 배운다");
    assert.equal(state.players[x].charm, before.charm);
  });
});

test("61절 졸업식: 4부문 = 네 능력치(마법상·수석상·튼튼상·매력상), 마법생물 마리 수 부문은 없다", () => {
  withBalance(CURRENT, () => {
    const state = newGame(3);
    const players = state.turnOrder.map((id) => state.players[id]);
    Object.assign(players[0], { charm: 9 });
    const awards = graduationAwards(players);
    const cats = new Set([...awards.values()].flat().map((w) => w.category));
    assert.ok(cats.has("charm") && !cats.has("creature"));
    assert.equal(awards.get(players[0].id)!.find((w) => w.category === "charm")?.rank, 1);
  });
});

test("61절: 12개월 게임이 봇끼리 끝까지 진행된다 (2~5인, 전략 AI 10종)", () => {
  withBalance(CURRENT, () => {
    for (const n of [2, 3, 4, 5]) {
      for (let i = 0; i < 6; i++) {
        const state = createGame(Array.from({ length: n }, (_, k) => ({ id: `p${k}`, name: `p${k}`, isBot: true })));
        const strategy = BOT_PERSONALITIES[(n + i) % BOT_PERSONALITIES.length];
        let guard = 0;
        while (state.phase !== "ended" && guard++ < 8000) botStep(state, strategy);
        assert.equal(state.phase, "ended");
      }
    }
  });
});

// ── 62절 실험 (2026-10-17): 활동 카드 한 덱 · 시험 공고 (스위치, 기본값은 61절) ──
const MARKET = { ...CURRENT, ...MARKET62 } as Partial<typeof BALANCE>;

test("62절 기본값(2026-10-17 채택, 겨루기 카드 장수는 62-7절에서 14장): 활동 카드 한 덱(겨루기 카드 12장)·시험 공고(무작위 과목)·연구 목표 -1", () => {
  assert.deepEqual(MARKET62, { activityMarket: true, examsAtStart: false, fixedExams: null, labTargetMod: -1, duelCardCount: 12 });
});

test("62절 한 덱: 고를 때 카드를 정하면 그 카드로 진행하고, 다른 친구가 정한 카드는 고를 수 없다", () => {
  withBalance(MARKET, () => {
    let state = newGame(4);
    const two = () => (["creature", "lab", "exploration"] as ActivityId[]).find((a) => (state.activityOffers[a]?.cards.length ?? 0) >= 2);
    for (let i = 0; i < 80 && !two(); i++) state = newGame(4);
    const kind = two()!;
    assert.ok(kind, "같은 종류 카드가 2장 이상 공개된 판을 찾는다");
    toActivity(state);
    const [a, b] = state.activityOrder;
    const [c1, c2] = state.activityOffers[kind]!.cards;
    selectActivity(state, a, kind, undefined, c2.id);
    assert.throws(() => selectActivity(state, b, kind, undefined, c2.id), /이미 다른 친구가 고른 카드/);
    selectActivity(state, b, kind, undefined, c1.id);
    assert.deepEqual(state.activityChoices.map((c) => c.cardId), [c2.id, c1.id]);
    // 나머지 친구도 모두 골라야 진행이 시작된다. 판정 카드가 남지 않으면 겨루기로 고른다 (4장 중 1장이 겨루기 카드인 판)
    for (const id of state.activityOrder.slice(2)) {
      const k = availableActivities(state, id).find((x) => x !== "duel");
      if (k) selectActivity(state, id, k);
      else selectActivity(state, id, "duel", duelTargets(state, id)[0]);
    }
    advanceResolution(state);
    assert.equal(state.pendingPick, null, "정해 둔 카드는 다시 고르지 않는다");
    assert.ok(state.pendingRoll, "바로 굴림");
    assert.ok(!state.activityOffers[kind]!.cards.some((c) => c.id === c2.id), "a가 정한 카드를 가져갔다");
    assert.ok(state.activityOffers[kind]!.cards.some((c) => c.id === c1.id), "b가 정한 카드는 b 차례까지 남아 있다");
  });
});

test("62절 한 덱: 1주차에 활동 카드(마법생물·연구·탐험·겨루기)를 섞어 인원 + 1장 공개하고, 그 종류의 카드 수만큼만 고를 수 있다", () => {
  withBalance(MARKET, () => {
    for (const n of [3, 4]) {
      const state = newGame(n);
      const counts = Object.fromEntries(Object.entries(state.activityOffers).map(([a, o]) => [a, o!.cards.length]));
      assert.equal(Object.values(counts).reduce((s, c) => s + c, 0), n + 1, `${n}인: 인원 + 1장`);
      assert.deepEqual(Object.keys(counts).sort(), ["creature", "duel", "exploration", "lab"]);
      toActivity(state);
      const empty = (Object.keys(counts) as ActivityId[]).find((a) => counts[a] === 0);
      if (empty) assert.ok(!availableActivities(state, state.activityOrder[0]).includes(empty), "공개되지 않은 종류는 고를 수 없다");
    }
  });
});

test("62절 한 덱: 겨루기 카드를 고르면 그 카드를 써서 버리고 겨루기를 한다", () => {
  withBalance(MARKET, () => {
    let state = newGame(3);
    for (let i = 0; i < 50 && !(state.activityOffers.duel?.cards.length ?? 0); i++) state = newGame(3);
    assert.ok((state.activityOffers.duel?.cards.length ?? 0) > 0, "겨루기 카드가 공개된 판을 찾는다");
    toActivity(state);
    const duels = state.activityOffers.duel!.cards.length;
    const [x, y] = state.activityOrder;
    selectActivity(state, x, "duel", y);
    // 나머지 친구도 모두 골라야 진행이 시작된다. 판정 카드가 남지 않으면 겨루기로 고른다
    for (const id of state.activityOrder.slice(1)) {
      const a = availableActivities(state, id).find((k) => k !== "duel");
      if (a) selectActivity(state, id, a);
      else selectActivity(state, id, "duel", duelTargets(state, id)[0]);
    }
    advanceResolution(state);
    assert.equal(state.activityOffers.duel!.cards.length, duels - 1, "겨루기 카드 1장을 썼다");
    assert.equal(state.pendingRoll?.kind, "duel");
  });
});

test("62절 시험 공고: 시험 과목은 시험 카드 8장 중 무작위(중간·기말은 다른 기운)이고, 4·10개월 학교 소식이 행사 대신 시험 공고다", () => {
  withBalance(MARKET, () => {
    const state = newGame(3);
    assert.equal(state.exams.midterm, null, "처음에는 공개되지 않는다");
    let guard = 0;
    while (state.round < BALANCE.midtermNoticeRound && guard++ < 5000) botStep(state);
    assert.ok(state.exams.midterm, "4개월 1주차에 중간고사 공개");
    assert.match(state.news!.name, /중간고사/);
    assert.equal(state.exams.final, null);
    while (state.round < BALANCE.finalNoticeRound && guard++ < 10000) botStep(state);
    assert.ok(state.exams.final);
    assert.notEqual((state.exams.final as ExamCard).diceStat, state.exams.midterm!.diceStat);
  });
  const stats = ["intelligence", "stamina", "charm", "spellPower"] as const;
  for (const s of stats) {
    assert.equal(examTemplates().filter((c) => c.diceStat === s).length, 2, `${s} 주사위 시험 2장`);
    assert.equal(examTemplates().filter((c) => c.bonusStat === s).length, 2, `${s} 보너스 시험 2장`);
  }
});

test("62절: 한 덱 + 시험 공고로 12개월 게임이 봇끼리 끝까지 진행된다 (2~5인)", () => {
  withBalance(MARKET, () => {
    for (const n of [2, 3, 4, 5]) {
      for (let i = 0; i < 4; i++) {
        const state = createGame(Array.from({ length: n }, (_, k) => ({ id: `p${k}`, name: `p${k}`, isBot: true })));
        let guard = 0;
        while (state.phase !== "ended" && guard++ < 8000) botStep(state, BOT_PERSONALITIES[(n + i) % BOT_PERSONALITIES.length]);
        assert.equal(state.phase, "ended");
      }
    }
  });
});

// ── 62-7절 (2026-10-17): 공개 장수 = 인원, 자율활동 공짜 주사위 없음, 실패해도 기운 1개 이월 ──
const ROLL627 = { ...MARKET, ...P627 } as Partial<typeof BALANCE>;

test("62-7절 기본값: 수업·활동 카드 인원만큼, 자율활동 공짜 주사위 0, 실패하면 기운 1개 이월, 조련 0.42·탐험 -2·겨루기 카드 14장", () => {
  assert.deepEqual(P627, { classMarketExtra: 0, activityMarketExtra: 0, activityBaseDice: 0, failKeepFuel: 1, trainTargetScale: 0.42, exploreTargetMod: -2, duelCardCount: 14 });
});

test("62-7절: 수업카드와 활동 카드를 인원만큼 공개한다", () => {
  withBalance({ ...ROLL627, schoolNewsEvents: false }, () => {
    for (const n of [2, 3, 4, 5]) {
      const state = newGame(n);
      assert.equal(state.classMarket.length, n, `${n}인 수업카드`);
      assert.equal(Object.values(state.activityOffers).reduce((s, o) => s + (o?.cards.length ?? 0), 0), n, `${n}인 활동 카드`);
    }
  });
});

// 마법생물·연구·탐험 중 하나를 고르고 굴림 직전까지 진행한다 (나머지 친구는 아무거나 고른다). 판정 없는 탐험 카드라 굴림이 없으면 null
function toActivityRoll(state: GameState): { id: string; kind: ActivityId } | null {
  toActivity(state);
  const id = state.activityOrder[0];
  const kind = availableActivities(state, id).find((a) => a !== "duel");
  assert.ok(kind, "판정 활동 카드가 있다");
  selectActivity(state, id, kind);
  for (const other of state.activityOrder.slice(1)) {
    const a = availableActivities(state, other).find((k) => k !== "duel");
    if (a) selectActivity(state, other, a);
  }
  let guard = 0;
  while (!state.pendingRoll && guard++ < 10) {
    if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, BOT_PERSONALITIES[0]));
    else advanceResolution(state);
  }
  if (currentRoller(state) !== id) return null;
  return { id, kind };
}

test("62-7절: 자율활동은 낸 기운만큼만 굴리고(공짜 주사위 없음, 1개 이상), 시험은 공짜 주사위 1개 그대로", () => {
  withBalance(ROLL627, () => {
    let state!: GameState;
    let found: { id: string } | null = null;
    for (let i = 0; i < 50 && !found; i++) {
      state = newGame(3);
      for (const p of Object.values(state.players)) Object.assign(p, { charmTokens: 3, staminaTokens: 3, intelligenceTokens: 3 });
      if ((["creature", "lab", "exploration"] as ActivityId[]).some((a) => (state.activityOffers[a]?.cards.length ?? 0) > 0)) found = toActivityRoll(state);
    }
    assert.ok(found, "판정 굴림이 있는 판을 찾는다");
    const { id } = found;
    const entry = state.pendingRoll!.entries.find((e) => e.playerId === id)!;
    assert.equal(entry.baseDice, undefined, "공짜 주사위 없음");
    assert.throws(() => submitRoll(state, id, 0), /1~/);
    submitRoll(state, id, 2);
    assert.equal(entry.dice!.length, 2, "낸 2개만큼 굴린다");
  });
  withBalance({ ...ROLL627, examsAtStart: true, fixedExams: { midterm: "마법 마라톤", final: "주문 실기" } }, () => {
    const state = newGame(3);
    let guard = 0;
    while ((state.phase as string) !== "exam" && guard++ < 20000) {
      if (state.pendingRoll && state.pendingRoll.kind === "exam") break;
      botStep(state);
    }
    const exam = state.pendingRoll;
    assert.equal(exam?.kind, "exam");
    assert.ok(exam!.entries.every((e) => e.baseDice === BALANCE.baseDice && BALANCE.baseDice === 1), "시험은 공짜 주사위 1개");
  });
});

test("62-7절: 자율활동에 실패하면 낸 기운 중 1개는 남아 다음 달로 이월된다 (성공하면 모두 쓴다)", () => {
  const seen = new Set<string>();
  for (let round = 0; round < 60 && seen.size < 2; round++) {
    withBalance(ROLL627, () => {
      const state = newGame(3);
      for (const p of Object.values(state.players)) Object.assign(p, { charmTokens: 3, staminaTokens: 3, intelligenceTokens: 3 });
      if (!(["creature", "lab", "exploration"] as ActivityId[]).some((a) => (state.activityOffers[a]?.cards.length ?? 0) > 0)) return;
      const found = toActivityRoll(state);
      if (!found) return;
      const { id } = found;
      const entry = state.pendingRoll!.entries.find((e) => e.playerId === id)!;
      const fuel = entry.diceToken!;
      const { target, card } = state.hidden.roll as { target: number; card: Partial<ExplorationCard> };
      const before = tokensOf(state.players[id], fuel);
      submitRoll(state, id, 2);
      const failed = entry.dice!.reduce((x, y) => x + y, 0) < target;
      confirmRoll(state, id);
      seen.add(failed ? "실패" : "성공");
      // 탐험 카드 성공 보상은 같은 기운을 줄 수 있다 (예: 요정들의 티 파티 성공 = 체력기운 +1).
      // 카드의 실패 효과는 explorationPenalty가 켜졌을 때만 받고, 기운은 0 아래로 내려가지 않는다
      const effect = failed ? (BALANCE.explorationPenalty ? card.failure : undefined) : card.success;
      const cardTokens = effect?.tokens?.[fuel] ?? 0;
      assert.equal(tokensOf(state.players[id], fuel), Math.max(0, before - 2 + (failed ? 1 : 0) + cardTokens), `${failed ? "실패하면 1개 남는다" : "성공하면 모두 쓴다"} (${fuel}, 카드 기운 ${cardTokens})`);
    });
  }
  assert.equal(seen.size, 2, "실패와 성공을 모두 확인했다");
});

test("62-7절: 12개월 게임이 봇끼리 끝까지 진행된다 (2~5인)", () => {
  withBalance(ROLL627, () => {
    for (const n of [2, 3, 4, 5]) {
      for (let i = 0; i < 4; i++) {
        const state = createGame(Array.from({ length: n }, (_, k) => ({ id: `p${k}`, name: `p${k}`, isBot: true })));
        let guard = 0;
        while (state.phase !== "ended" && guard++ < 8000) botStep(state, BOT_PERSONALITIES[(n + i) % BOT_PERSONALITIES.length]);
        assert.equal(state.phase, "ended");
      }
    }
  });
});

// ── 63절 (2026-10-18): 장래희망 1장 무작위 ──
test("63절: 장래희망은 1장을 무작위로 받고 바꿀 수 없다", () => {
  assert.deepEqual(DREAM63, { dreamDeal: 1, dreamChooseRounds: 0 });
  withBalance({ ...ROLL627, ...DREAM63 }, () => {
    const state = newGame(4);
    for (const id of state.turnOrder) {
      const p = state.players[id];
      assert.equal(p.dreamOptions?.length, 1);
      assert.equal(p.dream?.id, p.dreamOptions![0].id);
    }
    const a = state.turnOrder[0];
    assert.throws(() => chooseDream(state, a, state.players[a].dreamOptions![0].id), /동안만/);
  });
});

// ── 63-3절 (2026-10-18): 능력치마다 역할이 다른 규칙 (기운 없음) ──
const SKILL = { ...ROLL627, ...DREAM63, ...SKILL63 } as Partial<typeof BALANCE>;
// 이번 달 조련·연구·탐험 카드가 하나라도 공개됐는가 (모두 겨루기 카드인 달은 건너뛴다)
const hasCheckCard = (state: GameState) => (["creature", "lab", "exploration"] as ActivityId[]).some((a) => (state.activityOffers[a]?.cards.length ?? 0) > 0);

test("63-3절 기본값: 능력치 역할 규칙이 켜져 있고, 시작 주문력 2 · 노트 없음 · 기운 없음", () => {
  assert.deepEqual(SKILL63, { skillRules: true });
  withBalance(SKILL, () => {
    const state = newGame(3, false);
    for (const p of Object.values(state.players)) {
      assert.equal(p.spellPower, BALANCE.skillInitialSpell);
      assert.equal(p.intelligence, 1);
      assert.equal(p.intelligenceTokens + p.staminaTokens + p.charmTokens + p.manaTokens, 0);
    }
  });
});

test("63-3절 정규수업: 주문력 과목이 없고, 배우면 그 과목 능력치가 오르며, 노트는 지력 장수까지 보관한다", () => {
  withBalance(SKILL, () => {
    for (let i = 0; i < 5; i++) {
      const state = newGame(3, false);
      assert.ok(state.classMarket.every((c) => c.stat !== "spellPower"), "주문력 수업이 없다");
      const [a, b, c] = state.classPickOrder.map((id) => state.players[id]);
      const learn = state.classMarket[0];
      const before = a[learn.stat];
      assert.ok(learn.gain >= BALANCE.skillLearnGain);
      takeClassCard(state, a.id, learn.id, "learn");
      assert.equal(a[learn.stat], before + learn.gain, "배우면 능력치 +gain");
      Object.assign(b, { intelligence: 1, notes: [] });
      const note = state.classMarket[0];
      const statBefore = b[note.stat];
      takeClassCard(state, b.id, note.id, "note");
      assert.deepEqual(b.notes, [note.stat], "노트로 보관");
      assert.equal(b[note.stat], statBefore, "노트로 두면 능력치는 그대로");
      Object.assign(c, { intelligence: 1, notes: ["charm"] });
      assert.throws(() => takeClassCard(state, c.id, state.classMarket[0].id, "note"), /노트가 가득/);
    }
  });
});

test("63-3절 판정: 주사위 = 주문력, 더하는 값 = 그 분야 능력치, 다시 굴리기 = 체력 번, 노트는 그 과목만 +2", () => {
  withBalance(SKILL, () => {
    let checked = 0;
    for (let i = 0; i < 20 && checked < 3; i++) {
      const state = newGame(3, false);
      const found = hasCheckCard(state) ? toActivityRoll(state) : null;
      if (!found) continue;
      const { id, kind } = found;
      const p = state.players[id];
      const entry = state.pendingRoll!.entries.find((e) => e.playerId === id)!;
      const stat = ACTIVITY_STAT[kind as "creature" | "lab" | "exploration"];
      assert.equal(entry.diceCount, skillDice(state, p));
      assert.equal(entry.diceCount, Math.max(1, p.spellPower + (state.news?.effect.extraDice ?? 0)));
      assert.equal(entry.rerollsLeft, skillRerolls(state, p));
      assert.equal(entry.bonus, p[stat] + (p.creatures.length ? 1 : 0));
      assert.equal(entry.targets?.great, entry.targets!.success + BALANCE.greatGap);
      submitRoll(state, id);
      assert.equal(entry.dice!.length, entry.diceCount);
      const other = (["intelligence", "stamina", "charm"] as const).find((s) => s !== stat)!;
      p.notes = [other, stat];
      p.intelligence = 2;
      assert.throws(() => playNote(state, id, other), /낼 수 없어요/);
      const before = entry.bonus!;
      playNote(state, id, stat);
      assert.equal(entry.bonus, before + BALANCE.noteBonus);
      assert.deepEqual(p.notes, [other], "낸 노트는 버린다");
      assert.throws(() => playNote(state, id, stat), /노트가 없어요/);
      entry.rerollsLeft = 1;
      rerollDice(state, id, [0]);
      assert.equal(entry.rerollsLeft, 0);
      assert.throws(() => rerollDice(state, id, [0]), /다 썼어요/);
      checked++;
    }
    assert.ok(checked >= 1, "판정을 확인했다");
  });
});

test("63-3절 판정 결과: 실패 = 없음, 성공 = 그 분야 능력치 +1·학점 +1 (조련은 생물이 곁에), 대성공 = 더 받는다", () => {
  withBalance(SKILL, () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60 && seen.size < 6; i++) {
      for (const outcome of ["fail", "success", "great"] as const) {
        const state = newGame(3, false);
        const found = hasCheckCard(state) ? toActivityRoll(state) : null;
        if (!found) continue;
        const { id, kind } = found;
        const p = state.players[id];
        p.charm = 3;
        const entry = state.pendingRoll!.entries.find((e) => e.playerId === id)!;
        const stat = ACTIVITY_STAT[kind as "creature" | "lab" | "exploration"];
        submitRoll(state, id);
        const t = entry.targets!;
        const want = outcome === "fail" ? t.success - 1 : outcome === "success" ? t.success : t.great!;
        entry.dice = [want - entry.bonus!];
        const before = { stat: p[stat], credit: p.credit, creatures: p.creatures.length };
        confirmRoll(state, id);
        if (outcome === "fail") {
          assert.equal(p[stat], before.stat);
          assert.equal(p.credit, before.credit);
          assert.equal(p.creatures.length, before.creatures);
        } else {
          assert.ok(p[stat] >= before.stat + 1, `${kind} ${outcome}: 능력치 +1`);
          assert.ok(p.credit >= before.credit + 1, `${kind} ${outcome}: 학점 +1`);
          if (kind === "creature") assert.equal(p.creatures.length, before.creatures + 1, "조련에 성공하면 생물이 곁에 온다");
          if (outcome === "great" && kind === "creature") assert.ok(p.credit >= before.credit + 1 + BALANCE.creatureGreatCredit, "조련 대성공은 학점을 더");
        }
        seen.add(`${kind}-${outcome}`);
      }
    }
    assert.ok(seen.size >= 3, [...seen].join(","));
  });
});

test("63-3절 목표: 성공 = 카드 숫자 + 개월, 대성공 = 성공 + 4", () => {
  withBalance(SKILL, () => {
    const c = creature("대지의 수호자"); // 조련 기준 12
    const t = BALANCE.skillTargets;
    const s = Math.round(12 * t.creatureScale) + t.creatureBase;
    assert.deepEqual(skillTargets("creature", c, 0), { success: s, great: s + BALANCE.greatGap });
    assert.deepEqual(skillTargets("creature", c, 5), { success: s + 5 * BALANCE.skillRoundStep, great: s + 5 * BALANCE.skillRoundStep + BALANCE.greatGap });
    assert.equal(BALANCE.greatGap, 4);
    assert.equal(BALANCE.skillRoundStep, 1);
  });
});

test("63-3절 마법생물: 매력 마리까지 곁에 두고(넘치면 도움이 작은 생물이 돌아감), 하늘·육지·바다가 처음 모이면 학점 +2 한 번", () => {
  withBalance(SKILL, () => {
    const state = newGame(3, false);
    const p = state.players[state.turnOrder[0]];
    p.charm = 1;
    addCompanion(state, p, creature("정령 고릴라")); // 육지, 도움 +1
    addCompanion(state, p, creature("에어 스피릿")); // 하늘, 조련 기준 16 → 도움 +2
    assert.deepEqual(p.creatures.map((c) => c.name), ["에어 스피릿"], "약한 생물이 숲으로 돌아간다");
    p.charm = 3;
    const credit = p.credit;
    addCompanion(state, p, creature("땅굴 잠수꾼"));
    assert.equal(p.credit, credit);
    addCompanion(state, p, creature("감각 물고기"));
    assert.equal(p.credit, credit + BALANCE.skillSetCredit, "세트 학점");
    assert.equal(p.setBonus, true);
    p.charm = 4;
    addCompanion(state, p, creature("하늘의 꽃마녀"));
    assert.equal(p.credit, credit + BALANCE.skillSetCredit, "세트 학점은 한 번만");
  });
});

test("63-3절 마법 겨루기: 막는 친구는 주문력 주사위 + 막기 보너스로 자동으로 막고, 도전자가 더 높으면 주문력 +1·학점", () => {
  withBalance(SKILL, () => {
    const seen = new Set<string>();
    for (let i = 0; i < 80 && seen.size < 2; i++) {
      const state = newGame(3, false);
      toActivity(state);
      const id = state.activityOrder[0];
      if (!availableActivities(state, id).includes("duel")) continue;
      selectActivity(state, id, "duel", duelTargets(state, id)[0]);
      finishChoosing(state);
      let guard = 0;
      while (!(state.pendingRoll?.kind === "duel") && guard++ < 20) {
        if (state.pendingRoll) rollAll(state);
        else if (state.pendingPick) chooseActivityCard(state, state.pendingPick.playerId, choosePick(state, BOT_PERSONALITIES[0]));
        else advanceResolution(state);
      }
      if (state.pendingRoll?.kind !== "duel") continue;
      const [def, ch] = state.pendingRoll.entries;
      assert.equal(def.confirmed, true, "막기는 자동");
      assert.ok((def.bonus ?? 0) >= BALANCE.skillDefenderBonus);
      const defTotal = def.dice!.reduce((a, b) => a + b, 0) + (def.bonus ?? 0);
      assert.equal(ch.targets?.success, defTotal + 1);
      const p = state.players[ch.playerId];
      const win = seen.size === 0;
      submitRoll(state, p.id);
      ch.dice = [defTotal + (win ? 1 : 0) - (ch.bonus ?? 0)];
      const before = { spell: p.spellPower, credit: p.credit };
      confirmRoll(state, p.id);
      assert.equal(p.spellPower, before.spell + (win ? 1 : 0));
      assert.equal(p.credit, before.credit + (win ? BALANCE.skillDuelCredit : 0));
      seen.add(win ? "승리" : "막힘");
    }
    assert.equal(seen.size, 2, "승리와 막힘을 모두 확인했다");
  });
});

test("63-3절 시험: 점수 = 주사위(주문력 개) + 시험 카드의 두 능력치 + 그 과목 노트", () => {
  withBalance(SKILL, () => {
    const state = newGame(3, false);
    reachExam(state, "midterm_exam");
    const card = (state.hidden.roll as { card: { diceStat: StatKey; bonusStat?: StatKey } }).card;
    for (const e of state.pendingRoll!.entries) {
      const p = state.players[e.playerId];
      assert.equal(e.diceCount, skillDice(state, p));
      assert.equal(e.bonus, effectiveStat(p, card.diceStat) + (card.bonusStat ? effectiveStat(p, card.bonusStat) : 0));
    }
    const first = state.pendingRoll!.entries[0];
    const p = state.players[first.playerId];
    submitRoll(state, p.id);
    p.notes = [card.diceStat];
    p.intelligence = Math.max(p.intelligence, 1);
    playNote(state, p.id, card.diceStat);
    const expected = first.dice!.reduce((a, b) => a + b, 0) + first.bonus!;
    confirmRoll(state, p.id);
    rollAll(state);
    const score = state.examResults[0].scores.find((s) => s.playerId === p.id)!.score;
    assert.equal(score, expected);
  });
});

test("63-3절: 12개월 게임이 봇끼리 끝까지 진행된다 (2~5인)", () => {
  withBalance(SKILL, () => {
    for (const n of [2, 3, 4, 5]) {
      for (let i = 0; i < 4; i++) {
        const state = createGame(Array.from({ length: n }, (_, k) => ({ id: `p${k}`, name: `p${k}`, isBot: true })));
        let guard = 0;
        while (state.phase !== "ended" && guard++ < 8000) botStep(state, BOT_PERSONALITIES[(n + i) % BOT_PERSONALITIES.length]);
        assert.equal(state.phase, "ended");
        for (const p of Object.values(state.players)) assert.ok(p.creatures.length <= Math.max(1, p.charm), "생물은 매력 마리까지");
      }
    }
  });
});

console.log(`
${passed}개 검증 통과
`);
