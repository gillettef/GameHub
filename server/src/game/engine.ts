// 게임 진행 규칙 출처: notes/기획_정리.md (2026-09-28 정리본)
// 문서에 명시되지 않아 임의로 정한 부분은 "ASSUMPTION" 주석으로 표시했습니다.
import {
  createClassDeck,
  createCreatureDeck,
  createExplorationPile,
  createGrimoirePile,
  createLabPile,
  drawFromPile,
  peekPile,
} from "./cards.js";
import { randomUUID } from "node:crypto";
import { BALANCE, examCreditForRank } from "./config.js";
import { MIN_CREATURE_COST, describeAbility } from "./creatures.js";
import { describeExam, pickExamCards } from "./examCards.js";
import { describeEffect } from "./explorationCards.js";
import {
  effectiveStat,
  type ActivityChoice,
  type ActivityId,
  type CardEffect,
  type ClassCard,
  type CoopWaiting,
  type CreatureAbility,
  type CreatureCard,
  type ExplorationCard,
  type GrimoireCard,
  type LabCard,
  type OfferCardView,
  type OfferedCard,
  type StatKey,
  type ExamCard,
  type ExamResult,
  type GameState,
  type KeepChoice,
  type PlayerGameState,
  type RollContext,
} from "./types.js";

const ACTIVITY_IDS: ActivityId[] = ["tournament", "creature", "duel", "exploration", "lab"];
const ACTIVITY_NAME: Record<ActivityId, string> = {
  tournament: "마법 토너먼트",
  creature: "마법생물 조련",
  duel: "주문 대결",
  exploration: "비밀의 방",
  lab: "연구실 실험",
};

function rollD6(): number {
  return 1 + Math.floor(Math.random() * 6);
}

function rollDice(count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, rollD6);
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// 판정 목표값: 주사위 평균(3.5) × 그 달의 기준 능력치 × 난이도. 기준 능력치는 라운드가 갈수록 오른다 (성장이 기준보다 앞서면 쉬워진다)
export function benchmarkStat(round: number): number {
  return BALANCE.rollBenchmarkStart + BALANCE.rollBenchmarkPerRound * (round - 1);
}
export function rollTarget(round: number, difficulty: number): number {
  return Math.max(1, Math.round(3.5 * benchmarkStat(round) * difficulty));
}
// 탐험 카드의 target은 난이도 × 10, 협력 카드의 pairTarget은 난이도 × 18 (둘이 굴리므로 목표값은 2배)
const exploreTarget = (round: number, target: number) => rollTarget(round, (target / 10) * BALANCE.exploreDifficultyScale);
const coopTarget = (round: number, pairTarget: number) => 2 * rollTarget(round, (pairTarget / 18) * BALANCE.exploreDifficultyScale);
const creatureTarget = (card: CreatureCard) => Math.max(1, Math.round(3.5 * card.requiredSpellPower * BALANCE.creatureDifficulty));

// 마법생물마다 조련에 더해지는 능력치 보너스가 다르다: 속성(하늘=주문력·육지=체력·바다=매력) 2 : 종류(동물=체력·식물=매력) 1 비율로 섞어 반올림한다
export function creatureTrainMix(card: Pick<CreatureCard, "element" | "kind">): [StatKey, number][] {
  const main: StatKey = { sky: "spellPower", land: "stamina", ocean: "charm" }[card.element] as StatKey;
  const sub: StatKey = card.kind === "animal" ? "stamina" : "charm";
  return main === sub ? [[main, 3]] : [[main, 2], [sub, 1]];
}
export function creatureTrainBonus(player: PlayerGameState, card: Pick<CreatureCard, "element" | "kind">): number {
  const mix = creatureTrainMix(card);
  const total = mix.reduce((a, [, w]) => a + w, 0);
  return Math.round(mix.reduce((a, [stat, w]) => a + w * effectiveStat(player, stat), 0) / total);
}
const ELEMENT_NAME = { sky: "하늘", land: "육지", ocean: "바다" } as const;
const creatureTagsOf = (card: Pick<CreatureCard, "element" | "kind">) => `${ELEMENT_NAME[card.element]} · ${card.kind === "animal" ? "동물" : "식물"}`;
function creatureMixText(card: Pick<CreatureCard, "element" | "kind">): string {
  const mix = creatureTrainMix(card);
  const total = mix.reduce((a, [, w]) => a + w, 0);
  return mix.map(([stat, w]) => (w === total ? STAT_NAME[stat] : `${STAT_NAME[stat]} ${w}/${total}`)).join(" + ");
}

// 능력치 판정의 주사위 수: 카드가 정한 지력/체력 토큰의 개수 (토큰이 없어도 1개는 굴린다). spendAllTokens는 그 토큰을 모두 낸다
export function checkDiceCount(player: Pick<PlayerGameState, "intelligenceTokens" | "staminaTokens">, stat: StatKey): number {
  return Math.max(1, stat === "intelligence" ? player.intelligenceTokens : player.staminaTokens);
}
function spendAllTokens(player: PlayerGameState, stat: StatKey): number {
  const n = checkDiceCount(player, stat);
  if (stat === "intelligence") player.intelligenceTokens = 0;
  else player.staminaTokens = 0;
  return n;
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// 탐험 카드 성공 확률 (봇 판단용): 능력치 수치만큼 굴린 주사위 합이 목표값 이상일 확률의 정규 근사
export function explorationChance(state: GameState, player: PlayerGameState, card: ExplorationCard): number {
  if (!card.check) return 1;
  const n = checkDiceCount(player, card.check.stat);
  const catchUp = growthGap(state, player.id) >= BALANCE.catchUpGap ? BALANCE.catchUpBonus : 0;
  const mean = 3.5 * n + catchUp;
  const sd = Math.sqrt((n * 35) / 12);
  return 1 - normalCdf((exploreTarget(state.round, card.check.target) - 0.5 - mean) / sd);
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const emptySlots = (): Record<ActivityId, string[]> => ({ tournament: [], creature: [], duel: [], exploration: [], lab: [] });

// 동점 처리 공통 규칙: 점수가 같으면 공동 순위(1, 1, 3, ...)로 처리한다. 값이 큰 쪽이 앞선다
function rankByScore(ids: string[], scoreOf: (id: string) => number): { playerId: string; score: number; rank: number }[] {
  const sorted = ids.map((id) => ({ playerId: id, score: scoreOf(id) })).sort((a, b) => b.score - a.score);
  return sorted.map((entry, index) => ({ ...entry, rank: sorted.findIndex((x) => x.score === entry.score) + 1 }));
}

// 이번 달 선 플레이어부터 시계방향(turnOrder 순서)으로 한 바퀴 — 정규수업과 자율활동 선택 순서
function orderFromStarter(state: Pick<GameState, "turnOrder" | "startingPlayerIndex">): string[] {
  const n = state.turnOrder.length;
  return Array.from({ length: n }, (_, i) => state.turnOrder[(state.startingPlayerIndex + i) % n]);
}

// 4주차(정리): 매력이 가장 높은 플레이어가 다음 달 선이 된다.
// 현재 선과 매력이 같거나 더 높은 사람이 없으면 그대로, 최고 매력이 여럿이면 현재 선에서 시계방향으로 가장 가까운 사람
export function nextStarterIndex(state: GameState): number {
  const n = state.turnOrder.length;
  const charmOf = (id: string) => effectiveStat(state.players[id], "charm");
  const best = Math.max(...state.turnOrder.map(charmOf));
  const current = state.startingPlayerIndex;
  if (charmOf(state.turnOrder[current]) === best) return current;
  for (let i = 1; i < n; i++) {
    const index = (current + i) % n;
    if (charmOf(state.turnOrder[index]) === best) return index;
  }
  return current;
}

// 성장 점수: 영구 능력치 합 + 학점 × 3. 선두와의 격차가 크면 탐험에서 역전 보너스를 받는다
function growthScore(player: PlayerGameState): number {
  return player.intelligence + player.stamina + player.charm + player.spellPower + player.credit * 3;
}

// 선두와의 성장 점수 격차 (선두 본인은 0)
export function growthGap(state: GameState, playerId: string): number {
  const best = Math.max(...state.turnOrder.map((id) => growthScore(state.players[id])));
  return best - growthScore(state.players[playerId]);
}

// 마법생물 세트 수: 하늘·육지·바다를 1장씩 묶은 세트 (가장 적은 속성의 장수)
export function creatureSets(creatures: CreatureCard[]): number {
  return Math.min(...(["sky", "land", "ocean"] as const).map((el) => creatures.filter((c) => c.element === el).length));
}

// 플레이어가 가진 마법생물 중 해당 트리거의 능력만 모은다
function abilitiesOf(player: PlayerGameState, trigger: CreatureAbility["trigger"]): CreatureAbility[] {
  const abilities = [
    ...player.creatures.map((c) => c.ability),
    ...player.grimoires.flatMap((g) => (g.ability ? [g.ability] : [])),
  ];
  return abilities.filter((a) => a.trigger === trigger);
}

function sumEffect(abilities: CreatureAbility[], effect: CreatureAbility["effect"]): number {
  return abilities.filter((a) => a.effect === effect).reduce((sum, a) => sum + a.amount, 0);
}

function drawCreature(state: GameState) {
  if (state.creatureDeck.length === 0) {
    state.creatureDeck = shuffle(state.creatureDiscard);
    state.creatureDiscard = [];
  }
  return state.creatureDeck.pop();
}

// 덱에서 1장 뽑는다. 덱이 비면 버림 더미를 섞어 다시 쓰고, 그래도 없으면 undefined
function drawClassCard(state: GameState): ClassCard | undefined {
  if (state.classDeck.length === 0) {
    state.classDeck = shuffle(state.classDiscard);
    state.classDiscard = [];
  }
  return state.classDeck.pop();
}

const STAT_NAME: Record<StatKey, string> = { intelligence: "지력", stamina: "체력", charm: "매력", spellPower: "주문력" };

// 탐험 카드의 판정 문구 (엿보기·협력 대기·구역 공개 카드 표시용)
function checkTextOf(card: ExplorationCard, round: number): string | undefined {
  if (card.coop) return `협력 카드 — 둘이 각자 ${STAT_NAME[card.coop.stat]}토큰을 내고 낸 개수만큼 주사위를 굴려 합이 ${coopTarget(round, card.coop.pairTarget)} 이상이면 성공 (혼자면 무효)`;
  if (!card.check) return undefined;
  const stat = STAT_NAME[card.check.stat];
  return `${stat} 판정 (${stat}토큰을 내고 낸 개수만큼 주사위를 굴려 합 ${exploreTarget(round, card.check.target)} 이상)`;
}

// 탐험 카드/연구 카드 효과를 플레이어에게 적용한다
function applyCardEffect(state: GameState, player: PlayerGameState, effect: CardEffect): void {
  for (const [stat, amount] of Object.entries(effect.stats ?? {})) player[stat as StatKey] += amount;
  for (const [stat, amount] of Object.entries(effect.tempStats ?? {})) {
    player.tempBoosts[stat as StatKey] = (player.tempBoosts[stat as StatKey] ?? 0) + amount;
  }
  player.credit += effect.credit ?? 0;
  player.pendingSpellbookTokens += effect.nextSpellbook ?? 0;
  player.pendingStaminaTokens += effect.nextStamina ?? 0;
  if (effect.peekExploration) {
    const top = peekPile(state.explorationPile);
    player.peekedExploration = top
      ? {
          id: top.id,
          name: top.name,
          description: top.description,
          checkText: checkTextOf(top, state.round),
          successText: describeEffect(top.success),
          failureText: describeEffect(top.failure),
        }
      : null;
  }
}

function log(state: GameState, message: string): void {
  state.log.push({ round: state.round, message });
}

function createPlayer(id: string, name: string, isBot = false): PlayerGameState {
  return {
    id,
    name,
    isBot,
    ...BALANCE.initialStats,
    credit: BALANCE.initialCredit,
    tempBoosts: {},
    intelligenceTokens: 0,
    staminaTokens: 0,
    charmTokens: 0,
    spellbookTokens: 0,
    pendingStaminaTokens: 0,
    pendingSpellbookTokens: 0,
    carryTokens: { intelligence: 0, stamina: 0 },
    peekedExploration: null,
    tournamentTrack: 0,
    classCards: [],
    creatures: [],
    equipment: [],
    grimoires: [],
    hasActedThisPhase: false,
  };
}

export function createGame(players: { id: string; name: string; isBot?: boolean }[]): GameState {
  // 좌석 순서(시계방향)는 참가 순서를 그대로 쓰고, 첫 달의 선 플레이어는 주사위를 굴려 정한다
  const turnOrder = players.map((p) => p.id);
  const state: GameState = {
    round: 1,
    phase: "setup",
    turnOrder,
    startingPlayerIndex: 0,
    players: Object.fromEntries(
      players.map((p) => [p.id, createPlayer(p.id, p.name, p.isBot)]),
    ),
    activitySlots: emptySlots(),
    activityStage: "choose",
    activityOrder: [],
    activityTurnPointer: 0,
    activityChoices: [],
    activityResolvePointer: 0,
    activityResolveStarted: false,
    activityResults: [],
    duels: [],
    classMarket: [],
    classPickOrder: [],
    classPickPointer: 0,
    activityOffers: {},
    pendingPick: null,
    pendingRoll: null,
    coopWaiting: null,
    exams: { midterm: null, final: null },
    examResults: [],
    cleanupSummary: [],
    cleanupKeep: {},
    hidden: { roll: null, coop: null, offers: {}, examPlan: pickExamCards() },
    labPile: createLabPile(),
    explorationPile: createExplorationPile(),
    grimoirePile: createGrimoirePile(),
    classDeck: createClassDeck(randomUUID, players.length, BALANCE.classDeckPerPlayer),
    classDiscard: [],
    creatureDeck: createCreatureDeck(),
    creatureDiscard: [],
    log: [],
  };
  beginFirstRoll(state, turnOrder);
  return state;
}

// 게임 시작: 주사위를 굴려 가장 높은 사람이 첫 달의 선 (동점이면 동점자끼리 다시 굴린다)
function beginFirstRoll(state: GameState, contenders: string[]): void {
  state.hidden.roll = { kind: "first", contenders };
  state.pendingRoll = {
    kind: "first",
    title: contenders.length === state.turnOrder.length ? "선 정하기" : "선 정하기 · 동점자 다시 굴리기",
    lines: ["주사위를 굴려 가장 높은 친구가 첫 달의 선이 돼요. 선부터 시계방향으로 진행해요"],
    entries: contenders.map((id) => ({ playerId: id, label: state.players[id].name, diceCount: 1, dice: null, confirmed: false, rerolls: 0 })),
  };
}

// ── 토큰 지불: 지력토큰·체력토큰·매력토큰은 서로 바꿀 수 없다. 자율활동 구역의 두 번째 참가비는 매력토큰으로만 낸다 ──

type PayKind = "intelligence" | "stamina";
type Payer = Pick<PlayerGameState, "intelligenceTokens" | "staminaTokens" | "charmTokens">;

// 지력토큰 int개 + 체력토큰 stamina개 + 매력토큰 charm개를 낼 수 있는가
export const canPay = (p: Payer, int: number, stamina: number, charm = 0): boolean =>
  p.intelligenceTokens >= int && p.staminaTokens >= stamina && p.charmTokens >= charm;

function pay(p: PlayerGameState, kind: PayKind, n: number): void {
  if (kind === "intelligence") p.intelligenceTokens -= n;
  else p.staminaTokens -= n;
}

function beginRound(state: GameState): void {
  log(state, `${state.round}라운드 시작`);
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    // 1주차(준비): 지력 수치만큼 지력토큰, 체력 수치만큼 체력토큰, 주문력 수치만큼 마법 주문서 획득
    const prepAbilities = abilitiesOf(player, "prep");
    player.intelligenceTokens = effectiveStat(player, "intelligence");
    player.staminaTokens = Math.max(
      0,
      effectiveStat(player, "stamina") + player.pendingStaminaTokens + sumEffect(prepAbilities, "stamina"),
    );
    player.pendingStaminaTokens = 0;
    player.spellbookTokens = Math.max(
      0,
      effectiveStat(player, "spellPower") + player.pendingSpellbookTokens + sumEffect(prepAbilities, "spellbook"),
    );
    player.pendingSpellbookTokens = 0;
    // 매력 수치만큼 매력토큰: 구역 두 번째 참가비로 쓴다
    player.charmTokens = Math.max(0, effectiveStat(player, "charm") + sumEffect(prepAbilities, "charmToken"));
    // 지난 4주차에 골라 남긴 지력토큰·체력토큰 1개
    player.intelligenceTokens += player.carryTokens.intelligence;
    player.staminaTokens += player.carryTokens.stamina;
    player.carryTokens = { intelligence: 0, stamina: 0 };
  }
  // 중간고사(6개월)·기말고사(12개월) 달에는 2주차(정규수업)·3주차(자율활동) 대신 시험을 치른다
  if (isExamRound(state.round)) beginExam(state, state.round === BALANCE.midtermRound ? "midterm_exam" : "final_exam");
  else beginClassPhase(state);
}

// 2주차(정규수업): 인원수 + 1장을 공개하고, 선 플레이어부터 시계방향으로 원하는 카드 1장을 (체력토큰을 내고) 가져간다
function beginClassPhase(state: GameState): void {
  state.phase = "class";
  for (const playerId of state.turnOrder) state.players[playerId].hasActedThisPhase = false;
  state.classMarket = [];
  const count = state.turnOrder.length + BALANCE.classMarketExtra;
  while (state.classMarket.length < count) {
    const card = drawClassCard(state);
    if (!card) break;
    state.classMarket.push(card);
  }
  state.classPickOrder = orderFromStarter(state);
  state.classPickPointer = 0;
  log(
    state,
    `2주차(정규수업): 수업카드 ${state.classMarket.length}장 공개 — 선 ${state.players[state.classPickOrder[0]].name}부터: ${state.classPickOrder.map((id) => state.players[id].name).join(" → ")}`,
  );
}

// 아직 열 수 있는 수업카드 수 (덱 + 버림 더미)
export function classCardsLeft(state: Pick<GameState, "classDeck" | "classDiscard">): number {
  return state.classDeck.length + state.classDiscard.length;
}

// 2주차: 내 차례에 공개된 수업카드 중 1장을 가져간다 (체력토큰 takeCost개 필요). cardId가 null이면 가져가지 않고 넘어간다
export function takeClassCard(state: GameState, playerId: string, cardId: string | null): void {
  if (state.phase !== "class") throw new Error("지금은 정규수업 단계가 아닙니다.");
  const player = state.players[playerId];
  if (!player) throw new Error("플레이어를 찾을 수 없습니다.");
  if (state.classPickOrder[state.classPickPointer] !== playerId) throw new Error("당신의 차례가 아닙니다.");
  if (cardId === null) {
    log(state, `${player.name}: 수업카드를 가져가지 않고 넘어갔어요`);
  } else {
    const card = state.classMarket.find((c) => c.id === cardId);
    if (!card) throw new Error("공개된 수업카드 중에서만 고를 수 있습니다.");
    if (!canPay(player, 0, card.takeCost)) {
      throw new Error(`체력토큰이 부족합니다 (이 카드는 체력토큰 ${card.takeCost}개 필요).`);
    }
    pay(player, "stamina", card.takeCost);
    player[card.statBoost.stat] += card.statBoost.amount;
    player.classCards.push(card);
    state.classMarket = state.classMarket.filter((c) => c.id !== cardId);
    log(state, `${player.name}: 수업카드 "${card.name}" 습득 (${STAT_NAME[card.statBoost.stat]} +${card.statBoost.amount})`);
  }
  player.hasActedThisPhase = true;
  state.classPickPointer += 1;
  if (state.classPickPointer >= state.classPickOrder.length) {
    // 아무도 가져가지 않은 카드는 버림 더미로 (덱이 비면 다시 섞어 쓴다)
    state.classDiscard.push(...state.classMarket);
    state.classMarket = [];
    beginActivityPhase(state);
  }
}

function beginActivityPhase(state: GameState): void {
  state.phase = "activity";
  state.activitySlots = emptySlots();
  state.activityStage = "choose";
  state.activityOrder = orderFromStarter(state);
  state.activityTurnPointer = 0;
  state.activityChoices = [];
  state.activityResolvePointer = 0;
  state.activityResolveStarted = false;
  state.activityResults = [];
  state.duels = [];
  state.activityOffers = {};
  state.pendingPick = null;
  state.pendingRoll = null;
  state.coopWaiting = null;
  state.hidden = { ...state.hidden, roll: null, coop: null, offers: {} }; // 시험 카드 계획(examPlan)은 게임 내내 유지
  for (const playerId of state.turnOrder) {
    state.players[playerId].hasActedThisPhase = false;
  }
  log(state, `3주차(자율활동) 시작 — 선 ${state.players[state.activityOrder[0]].name}부터 활동을 골라요: ${state.activityOrder.map((id) => state.players[id].name).join(" → ")}`);
  // 고를 수 있는 활동이 없는 플레이어는 처음부터 쉬어 간다
  skipUnavailableChoosers(state);
}

// ── 자율활동: 구역 선택 규칙 ──

export type ActivityView = Pick<GameState, "activitySlots" | "players" | "turnOrder" | "coopWaiting" | "activityOffers">;

// 구역에 처음 들어와 카드를 여는 사람이 내는 지력토큰 (주문 대결·연구실 실험만. 마법생물 조련·비밀의 방 탐색은 들지 않는다).
// 이미 다른 친구가 고른 구역이면(두 번째 참가자) 새로 열 필요가 없으니 내지 않는다
export function activityOpenCost(state: Pick<GameState, "activitySlots">, activityId: ActivityId): number {
  if (!BALANCE.openCardCostActivities.includes(activityId)) return 0;
  return state.activitySlots[activityId].length > 0 ? 0 : BALANCE.openCardCost;
}

// 이미 다른 플레이어가 있는 구역에 들어갈 때 내야 하는 매력토큰
export function activityExtraCost(state: Pick<GameState, "activitySlots">, activityId: ActivityId): number {
  return state.activitySlots[activityId].length >= 1 ? BALANCE.activitySecondParticipantCost : 0;
}

// 주문 대결에서 지목할 수 있는 플레이어 (아직 자율활동을 고르지 않은 사람)
export function duelTargets(state: Pick<GameState, "players" | "turnOrder">, playerId: string): string[] {
  return state.turnOrder.filter((id) => id !== playerId && !state.players[id].hasActedThisPhase);
}

// 이 활동을 고를 수 없는 이유 (고를 수 있으면 null)
export function activityBlockReason(state: ActivityView, playerId: string, activityId: ActivityId): string | null {
  const player = state.players[playerId];
  const slots = state.activitySlots[activityId];
  if (slots.length >= BALANCE.activityMaxParticipants) return "이미 두 명이 참여한 구역입니다.";
  const extra = activityExtraCost(state, activityId);
  if (!canPay(player, 0, 0, extra)) return `이미 참여한 친구가 있어서 매력토큰 ${extra}개가 더 필요해요.`;
  const open = activityOpenCost(state, activityId);
  if (!canPay(player, open, 0, extra)) return `카드를 열 지력토큰 ${open}개가 필요해요.`;
  if (activityId === "tournament" && player.spellbookTokens < 1) return "마법 주문서가 1개 이상 필요해요 (낸 주문서만큼 주사위를 굴려요).";
  if (activityId === "creature" && player.spellbookTokens < MIN_CREATURE_COST) return `마법생물을 데려오려면 마법 주문서가 ${MIN_CREATURE_COST}개 이상 필요해요.`;
  if (activityId === "duel") {
    if (player.spellbookTokens < 1) return "마법 주문서가 1개 이상 필요해요 (낸 주문서만큼 주사위를 굴려요).";
    if (duelTargets(state, playerId).length === 0) return "지목할 수 있는 친구가 없어요.";
    if (player.charm < BALANCE.duelCharmFee) return `지목당한 친구에게 건넬 매력(${BALANCE.duelCharmFee})이 없어요.`;
  }
  return null;
}

export function availableActivities(state: ActivityView, playerId: string): ActivityId[] {
  return ACTIVITY_IDS.filter((a) => activityBlockReason(state, playerId, a) === null);
}

function describeRoll(dice: number[], bonusParts: [string, number][]): string {
  const parts = [`주사위 ${dice.join("+")}`, ...bonusParts.filter(([, n]) => n !== 0).map(([label, n]) => `${label} ${n > 0 ? "+" : "-"}${Math.abs(n)}`)];
  return parts.join(" ");
}

// ── 자율활동: 활동별 처리 ──

// 마법 토너먼트: 가진 마법 주문서를 모두 내고, 낸 개수만큼 주사위를 굴려 합친 칸만큼 트랙을 전진한다
function startTournament(state: GameState, player: PlayerGameState): void {
  const diceCount = player.spellbookTokens;
  player.spellbookTokens = 0;
  if (diceCount === 0) {
    advanceTournament(state, player, []);
    return;
  }
  state.hidden.roll = { kind: "tournament", playerId: player.id };
  state.pendingRoll = {
    kind: "tournament",
    title: `마법 토너먼트 · ${player.name}`,
    lines: [`마법 주문서 ${diceCount}개를 내고 주사위 ${diceCount}개를 굴려요. 나온 눈을 모두 더한 만큼 트랙을 전진해요`],
    entries: [{ playerId: player.id, label: player.name, diceCount, dice: null, confirmed: false, rerolls: 0 }],
  };
}

// 마법생물 조련: 가진 마법 주문서를 모두 내고 그만큼 주사위를 굴려, (합 + 매력)이 목표값 이상이면 조련에 성공한다. 실패하면 주문서만 잃고 카드는 구역에 돌아간다
function startCreatureRoll(state: GameState, player: PlayerGameState, creature: CreatureCard): void {
  const diceCount = player.spellbookTokens;
  player.spellbookTokens = 0;
  const target = creatureTarget(creature);
  const bonus = creatureTrainBonus(player, creature);
  state.hidden.roll = { kind: "creature", playerId: player.id, card: creature, target };
  state.pendingRoll = {
    kind: "creature",
    title: `마법생물 조련 · ${creature.name}`,
    lines: [
      `마법 주문서 ${diceCount}개를 내고 주사위 ${diceCount}개를 굴려요`,
      `주사위 합 + ${creatureMixText(creature)} 보너스 ${bonus}이(가) ${target} 이상이면 조련 성공! 실패하면 카드는 돌아가요`,
    ],
    entries: [{ playerId: player.id, label: player.name, diceCount, dice: null, confirmed: false, rerolls: 0 }],
  };
}

function resolveCreature(state: GameState, ctx: Extract<RollContext, { kind: "creature" }>, dice: number[]): void {
  const player = state.players[ctx.playerId];
  const creature = ctx.card;
  const bonus = creatureTrainBonus(player, creature);
  const total = sum(dice) + bonus;
  const success = total >= ctx.target;
  const text = `${describeRoll(dice, [[creatureMixText(creature), bonus]])} = ${total} / 목표 ${ctx.target} ${success ? "성공" : "실패"}`;
  if (success) {
    player.creatures.push(creature);
    if (creature.ability.trigger === "acquire" && creature.ability.effect === "spellPower") player.spellPower += creature.ability.amount;
    log(state, `${player.name}: 마법생물 "${creature.name}" 조련 성공! (${text}) ${describeAbility(creature.ability)}`);
  } else {
    // 실패한 카드는 구역으로 돌아가 두 번째 참가자가 도전할 수 있다 (아무도 가져가지 않으면 3주차 끝에 버림 더미로)
    state.hidden.offers.creature = [...offerCards(state, "creature"), creature];
    syncOfferView(state, "creature");
    log(state, `${player.name}: 마법생물 "${creature.name}" 조련 실패... (${text})`);
  }
}

// 연구실 실험: 카드를 보고 지력토큰을 몇 개 낼지 골라(굴릴 때 낸다) 낸 개수만큼 주사위를 굴려, 합이 목표값 이상이면 실험 성공 (카드 효과를 받는다)
// 지력토큰이 없으면 주사위 1개는 공짜로 굴린다. 굴림 버튼 기본값은 목표값을 넘기기 충분한 개수(labDefaultDice)다
function startLabRoll(state: GameState, player: PlayerGameState, lab: LabCard): void {
  const tokens = player.intelligenceTokens;
  const diceCount = tokens > 0 ? Math.min(tokens, BALANCE.labDefaultDice) : 1;
  state.hidden.roll = { kind: "lab", playerId: player.id, card: lab, target: BALANCE.labTarget };
  state.pendingRoll = {
    kind: "lab",
    title: `연구실 실험 · ${lab.name}`,
    lines: [tokens > 0 ? `지력토큰을 1~${tokens}개 골라 내고, 낸 개수만큼 주사위를 굴려요 (다시 굴리기에 쓸 토큰은 남겨 둘 수 있어요)` : "지력토큰이 없어서 주사위 1개를 굴려요", `합이 ${BALANCE.labTarget} 이상이면 실험 성공! (${lab.summary})`],
    entries: [{ playerId: player.id, label: player.name, diceCount, ...(tokens > 0 ? { diceChoiceMax: tokens } : {}), dice: null, confirmed: false, rerolls: 0 }],
  };
}

function resolveLab(state: GameState, ctx: Extract<RollContext, { kind: "lab" }>, dice: number[]): void {
  const player = state.players[ctx.playerId];
  const lab = ctx.card;
  const total = sum(dice);
  const success = total >= ctx.target;
  const text = `${describeRoll(dice, [])} = ${total} / 목표 ${ctx.target} ${success ? "성공" : "실패"}`;
  if (success) {
    applyCardEffect(state, player, lab.effect);
    // 시험 카드는 다음 시험까지 보관하고, 나머지는 효과를 받는 즉시 버림 더미로
    if (lab.kind === "exam") player.equipment.push(lab);
    else state.labPile.discard.push(lab);
    log(state, `${player.name}: 연구 카드 "${lab.name}" 실험 성공! (${text}) ${lab.summary}`);
  } else {
    state.labPile.discard.push(lab);
    log(state, `${player.name}: 연구 카드 "${lab.name}" 실험 실패... (${text})`);
  }
}

function advanceTournament(state: GameState, player: PlayerGameState, dice: number[]): void {
  const gain = sum(dice);
  const before = player.tournamentTrack;
  player.tournamentTrack += gain;
  const step = BALANCE.tournamentMilestoneStep;
  const milestones = step > 0 ? Math.floor(player.tournamentTrack / step) - Math.floor(before / step) : 0;
  const milestoneCredit = milestones * BALANCE.tournamentMilestoneCredit;
  player.credit += milestoneCredit;
  log(
    state,
    `${player.name}: 마법 토너먼트 참가 (${describeRoll(dice, [])} = ${gain}칸 전진, 트랙 ${player.tournamentTrack}칸)${milestoneCredit > 0 ? ` — 이정표 학점 +${milestoneCredit}` : ""}`,
  );
}

function startDuel(state: GameState, player: PlayerGameState, target: PlayerGameState): void {
  state.hidden.roll = { kind: "duel", challengerId: player.id, targetId: target.id };
  // 양쪽 모두 가진 마법 주문서를 모두 내고 낸 개수만큼 굴린다 (지목당해 주문서가 없어도 주사위 1개는 굴린다)
  const diceOf = (p: PlayerGameState) => {
    const n = Math.max(1, p.spellbookTokens);
    p.spellbookTokens = 0;
    return n;
  };
  state.pendingRoll = {
    kind: "duel",
    title: `주문 대결 · ${player.name} vs ${target.name}`,
    lines: [
      `${player.name}님이 ${target.name}님을 지목했어요`,
      `각자 마법 주문서를 모두 내고 낸 개수만큼 주사위를 굴려 합이 큰 쪽이 이겨요. 같으면 무승부예요. 도전자는 지목당한 친구에게 매력 ${BALANCE.duelCharmFee}을 건네요`,
    ],
    entries: [
      { playerId: player.id, label: `${player.name} (도전자)`, diceCount: diceOf(player), dice: null, confirmed: false, rerolls: 0 },
      { playerId: target.id, label: `${target.name} (지목당함)`, diceCount: diceOf(target), dice: null, confirmed: false, rerolls: 0 },
    ],
  };
}

function resolveDuel(state: GameState, ctx: Extract<RollContext, { kind: "duel" }>, challengerDice: number[], defenderDice: number[]): void {
  const player = state.players[ctx.challengerId];
  const target = state.players[ctx.targetId];
  // 참가비: 결과와 상관없이 도전자가 지목당한 친구에게 매력을 건넨다
  const fee = Math.min(BALANCE.duelCharmFee, player.charm);
  player.charm -= fee;
  target.charm += fee;
  // 마법생물 능력: 참여 시(duel)는 양쪽, 도전받았을 때(defend)는 도전받은 쪽만 적용
  const challengerAbilities = abilitiesOf(player, "duel");
  const defenderAbilities = [...abilitiesOf(target, "duel"), ...abilitiesOf(target, "defend")];
  const challengerBonus = sumEffect(challengerAbilities, "rollBonus") - sumEffect(defenderAbilities, "enemyRollPenalty");
  const defenderBonus = sumEffect(defenderAbilities, "rollBonus") - sumEffect(challengerAbilities, "enemyRollPenalty");
  const challengerRoll = Math.max(0, sum(challengerDice) + challengerBonus);
  const defenderRoll = Math.max(0, sum(defenderDice) + defenderBonus);
  // 체력토큰 효과는 다음 달 준비 때 반영
  player.pendingStaminaTokens += sumEffect(challengerAbilities, "stamina");
  target.pendingStaminaTokens += sumEffect(defenderAbilities, "stamina");
  target.pendingStaminaTokens -= sumEffect(challengerAbilities, "enemyStamina");
  player.pendingStaminaTokens -= sumEffect(defenderAbilities, "enemyStamina");
  const rollText = (dice: number[], bonus: number, total: number) => `${describeRoll(dice, [["능력", bonus]])} = ${total}`;
  const feeText = fee > 0 ? ` — ${player.name}이(가) ${target.name}에게 매력 ${fee}을 건넸어요` : "";
  // 동점이면 무승부: 이긴 사람도 진 사람도 없고, 마도서 보상도 없다
  if (challengerRoll === defenderRoll) {
    log(
      state,
      `${player.name}(${rollText(challengerDice, challengerBonus, challengerRoll)})이(가) ${target.name}(${rollText(defenderDice, defenderBonus, defenderRoll)})을(를) 지목! 무승부${feeText}`,
    );
    return;
  }
  const winner = challengerRoll > defenderRoll ? player : target;
  const loser = winner === player ? target : player;
  const loserAbilities = [...(loser === player ? challengerAbilities : defenderAbilities), ...abilitiesOf(loser, "lose")];
  loser.pendingStaminaTokens += sumEffect(abilitiesOf(loser, "lose"), "stamina");
  winner.pendingStaminaTokens -= sumEffect(abilitiesOf(loser, "lose"), "enemyStamina");
  // 낸 주문서는 이미 사라졌다. 방어 능력(immune)이 있으면 졌어도 주문서 1개를 다음 달 준비 때 돌려받는다
  if (sumEffect(loserAbilities, "immune") > 0) loser.pendingSpellbookTokens += 1;
  log(
    state,
    `${player.name}(${rollText(challengerDice, challengerBonus, challengerRoll)})이(가) ${target.name}(${rollText(defenderDice, defenderBonus, defenderRoll)})을(를) 지목! ${winner.name} 승리${feeText}`,
  );
  // 이긴 사람이 구역에 공개된 마도서 중 1장을 가져간다 (한 장만 남았으면 자동으로)
  const rewards = offerCards(state, "duel");
  if (rewards.length === 1) takeOffered(state, winner, "duel", rewards[0]);
  else if (rewards.length > 1) {
    state.pendingPick = { playerId: winner.id, activityId: "duel", mode: "reward" };
  }
}

// 탐험 판정 주사위 굴리기 시작 (판정 없는 카드는 바로 처리)
function startExplorationRoll(
  state: GameState,
  card: ExplorationCard,
  playerIds: string[],
  mode: "single" | "pair",
): void {
  const rule = explorationRule(card, mode, state.round);
  if (!rule) {
    resolveExploration(state, { kind: "exploration", card, playerIds, mode, target: 0 }, {});
    return;
  }
  const stat = STAT_NAME[rule.stat];
  state.hidden.roll = { kind: "exploration", card, playerIds, mode, target: rule.target };
  state.pendingRoll = {
    kind: "exploration",
    title: `비밀의 방 · ${card.name}`,
    lines: [
      card.description,
      mode === "pair"
        ? `각자 ${stat}토큰을 내고 낸 개수만큼 주사위를 굴려 둘의 합이 ${rule.target} 이상이면 성공! 보상은 둘 다 받아요`
        : `${stat}토큰을 내고 낸 개수만큼 주사위를 굴려 합이 ${rule.target} 이상이면 성공`,
    ],
    // 주사위 수는 카드가 정한 지력/체력 토큰을 모두 낸 개수 (토큰이 없어도 1개는 굴린다)
    entries: playerIds.map((id) => ({
      playerId: id,
      label: state.players[id].name,
      diceCount: spendAllTokens(state.players[id], rule.stat),
      dice: null,
      confirmed: false,
      rerolls: 0,
    })),
  };
}

// 탐험 카드의 판정 규칙: 협력 카드는 두 명의 합, 일반 카드는 혼자 판정. 목표값은 라운드에 맞춰 계산한다. 판정이 없는 카드는 null
function explorationRule(card: ExplorationCard, mode: "single" | "pair", round: number): { stat: StatKey; target: number } | null {
  if (mode === "pair" && card.coop) return { stat: card.coop.stat, target: coopTarget(round, card.coop.pairTarget) };
  return card.check ? { stat: card.check.stat, target: exploreTarget(round, card.check.target) } : null;
}

function resolveExploration(state: GameState, ctx: Extract<RollContext, { kind: "exploration" }>, dice: Record<string, number[]>): void {
  const { card, playerIds, mode, target } = ctx;
  let success = true;
  let rollText = "";
  const rule = explorationRule(card, mode, state.round);
  if (rule) {
    const parts = playerIds.map((id) => {
      const p = state.players[id];
      // 선두와의 격차가 크면 역전 보너스: 뒤처진 플레이어의 한 방을 돕는다
      const catchUp = growthGap(state, id) >= BALANCE.catchUpGap ? BALANCE.catchUpBonus : 0;
      const total = sum(dice[id] ?? []) + catchUp;
      return { p, total, text: `${describeRoll(dice[id] ?? [], [["역전", catchUp]])} = ${total}` };
    });
    const total = sum(parts.map((x) => x.total));
    success = total >= target;
    rollText =
      mode === "pair"
        ? ` (${parts.map((x) => `${x.p.name} ${x.text}`).join(", ")} → 합 ${total}/${target} ${success ? "성공" : "실패"})`
        : ` (${parts[0].text} / 목표 ${target} ${success ? "성공" : "실패"})`;
  }
  const effect = success ? card.success : card.failure;
  for (const id of playerIds) applyCardEffect(state, state.players[id], effect);
  state.explorationPile.discard.push(card);
  const names = playerIds.map((id) => state.players[id].name).join(" · ");
  log(state, `${names}: 비밀의 방 "${card.name}"${rollText} → ${describeEffect(effect)}${playerIds.length > 1 ? " (두 명 모두 적용)" : ""}`);
}

function describeCoop(card: ExplorationCard, playerId: string, round: number): CoopWaiting {
  const stat = STAT_NAME[card.coop!.stat];
  return {
    playerId,
    name: card.name,
    description: card.description,
    pairText: `둘이 각자 ${stat} 수치만큼 주사위를 굴려 합이 ${coopTarget(round, card.coop!.pairTarget)} 이상이면 성공`,
    voidText: "함께할 친구가 끝까지 나타나지 않으면 이 카드는 무효가 돼요",
    successText: `${describeEffect(card.success)} (두 명 모두)`,
    failureText: `${describeEffect(card.failure)} (두 명 모두)`,
  };
}

// ── 3주차 구역에 공개된 카드: 처음 들어온 사람이 2장을 열고, 먼저 온 사람이 원하는 카드를 가져가고 남는 카드는 두 번째 참가자가 가져간다 ──

function offerCards(state: GameState, activityId: ActivityId): OfferedCard[] {
  return state.hidden.offers[activityId] ?? [];
}

function offerViewOf(activityId: ActivityId, card: OfferedCard, round: number): OfferCardView {
  switch (activityId) {
    case "creature": {
      const c = card as CreatureCard;
      return { id: c.id, name: c.name, description: c.description, tags: creatureTagsOf(c), lines: [describeAbility(c.ability), `조련 판정: 주문서만큼 주사위 합 + ${creatureMixText(c)} 보너스 ≥ ${creatureTarget(c)}`], cost: { kind: "spellbook", amount: c.requiredSpellPower } };
    }
    case "lab": {
      const c = card as LabCard;
      return { id: c.id, name: c.name, description: c.description, lines: [c.summary, `실험 판정: 지력토큰만큼 주사위 합 ≥ ${BALANCE.labTarget}`], cost: c.cost > 0 ? { kind: "stamina", amount: c.cost } : undefined };
    }
    case "exploration": {
      const c = card as ExplorationCard;
      const check = checkTextOf(c, round);
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        lines: [...(check ? [check] : ["판정 없음"]), `성공: ${describeEffect(c.success)}`, `실패: ${describeEffect(c.failure)}`],
      };
    }
    default: {
      const c = card as GrimoireCard;
      const ability = c.ability ? describeAbility(c.ability) : "";
      return { id: c.id, name: c.name, description: c.description, lines: [`${STAT_NAME[c.statBoost.stat]} +${c.statBoost.amount}`, ...(ability ? [ability] : [])] };
    }
  }
}

function syncOfferView(state: GameState, activityId: ActivityId): void {
  state.activityOffers[activityId] = { cards: offerCards(state, activityId).map((c) => offerViewOf(activityId, c, state.round)) };
}

function drawForZone(state: GameState, activityId: ActivityId): OfferedCard | undefined {
  if (activityId === "creature") return drawCreature(state);
  if (activityId === "lab") return drawFromPile(state.labPile);
  if (activityId === "duel") return drawFromPile(state.grimoirePile);
  return drawFromPile(state.explorationPile);
}

function discardToZone(state: GameState, activityId: ActivityId, cards: OfferedCard[]): void {
  if (activityId === "creature") state.creatureDiscard.push(...(cards as CreatureCard[]));
  else if (activityId === "lab") state.labPile.discard.push(...(cards as LabCard[]));
  else if (activityId === "duel") state.grimoirePile.discard.push(...(cards as GrimoireCard[]));
  else state.explorationPile.discard.push(...(cards as ExplorationCard[]));
}

// 구역에 처음 들어온 사람이 카드를 연다 (기본 2장)
function openOffer(state: GameState, activityId: ActivityId): void {
  const count = BALANCE.activityOpenCount;
  const cards: OfferedCard[] = [];
  for (let i = 0; i < count; i++) {
    const card = drawForZone(state, activityId);
    if (!card) break;
    cards.push(card);
  }
  state.hidden.offers[activityId] = cards;
  syncOfferView(state, activityId);
  // 열린 탐험 카드를 엿보고 있던 플레이어의 정보는 낡은 것이 된다
  if (activityId === "exploration") {
    const usedIds = new Set(cards.map((c) => c.id));
    for (const p of Object.values(state.players)) if (p.peekedExploration && usedIds.has(p.peekedExploration.id)) p.peekedExploration = null;
  }
  log(state, `${ACTIVITY_NAME[activityId]}: 카드 ${cards.length}장이 공개됐어요 — ${cards.map((c) => `"${c.name}"`).join(", ")}`);
}

// 3주차가 끝나면 아무도 가져가지 않은 공개 카드는 버림 더미로 돌아간다
function discardOffers(state: GameState): void {
  for (const activityId of Object.keys(state.hidden.offers) as ActivityId[]) discardToZone(state, activityId, offerCards(state, activityId));
  state.hidden.offers = {};
  state.activityOffers = {};
}

const creatureCost = (card: CreatureCard) => card.requiredSpellPower;

// 이 카드를 지금 가져갈 수 있는가 (비용을 낼 수 있는가). 마법생물은 마법 주문서, 연구 카드는 체력토큰
function canTake(player: PlayerGameState, activityId: ActivityId, card: OfferedCard): boolean {
  if (activityId === "creature") return player.spellbookTokens >= creatureCost(card as CreatureCard);
  if (activityId === "lab") return canPay(player, 0, (card as LabCard).cost);
  return true;
}

// 공개된 카드를 실제로 가져와 효과를 적용한다 (비용도 여기서 낸다)
function takeOffered(state: GameState, player: PlayerGameState, activityId: ActivityId, card: OfferedCard): void {
  state.hidden.offers[activityId] = offerCards(state, activityId).filter((c) => c.id !== card.id);
  syncOfferView(state, activityId);
  switch (activityId) {
    case "creature": {
      startCreatureRoll(state, player, card as CreatureCard);
      break;
    }
    case "lab": {
      const lab = card as LabCard;
      pay(player, "stamina", lab.cost);
      startLabRoll(state, player, lab);
      break;
    }
    case "duel": {
      const grimoire = card as GrimoireCard;
      player.grimoires.push(grimoire);
      player[grimoire.statBoost.stat] += grimoire.statBoost.amount;
      log(state, `${player.name}: 마도서 "${grimoire.name}" 획득`);
      break;
    }
    default: {
      const exploration = card as ExplorationCard;
      if (exploration.coop) {
        // 협력 카드: 함께할 친구가 나타날 때까지 기다린다 (끝까지 없으면 3주차 마지막에 무효)
        state.hidden.coop = { card: exploration, playerId: player.id };
        state.coopWaiting = describeCoop(exploration, player.id, state.round);
        log(state, `${player.name}: 비밀의 방에서 협력 카드 "${exploration.name}"를 골랐어요! 함께할 친구를 기다려요`);
      } else {
        startExplorationRoll(state, exploration, [player.id], "single");
      }
    }
  }
}

// 구역에 들어온 사람의 카드 처리: 처음 온 사람은 카드를 열고 원하는 카드를 고르고, 두 번째 참가자는 남은 카드를 가져간다
function startZonePick(state: GameState, activityId: ActivityId, player: PlayerGameState): void {
  const isFirst = !state.hidden.offers[activityId];
  if (activityId === "exploration" && state.hidden.coop) {
    // 함께할 친구를 기다리는 협력 카드가 있으면 그 카드에 합류한다 (남은 카드는 버려진다)
    const hold = state.hidden.coop;
    state.hidden.coop = null;
    state.coopWaiting = null;
    discardToZone(state, "exploration", offerCards(state, "exploration"));
    state.hidden.offers.exploration = [];
    syncOfferView(state, "exploration");
    startExplorationRoll(state, hold.card, [hold.playerId, player.id], "pair");
    return;
  }
  if (isFirst) openOffer(state, activityId);
  // 협력 카드는 함께할 자리가 있을 때만 의미가 있다: 두 번째 참가자는 협력 카드를 고를 수 없으니 남은 카드가 협력 카드면 새로 뽑는다
  if (!isFirst && activityId === "exploration") {
    const rest = offerCards(state, "exploration");
    const skipped = rest.filter((c) => (c as ExplorationCard).coop);
    if (skipped.length > 0) {
      discardToZone(state, "exploration", skipped);
      let kept = rest.filter((c) => !(c as ExplorationCard).coop);
      while (kept.length < rest.length) {
        const drawn = drawFromPile(state.explorationPile) as ExplorationCard | undefined;
        if (!drawn) break;
        if (drawn.coop) discardToZone(state, "exploration", [drawn]);
        else kept = [...kept, drawn];
      }
      state.hidden.offers.exploration = kept;
      syncOfferView(state, "exploration");
    }
  }
  const cards = offerCards(state, activityId);
  if (cards.length === 0) {
    log(state, `${player.name}: ${ACTIVITY_NAME[activityId]}에 남은 카드가 없어요`);
    return;
  }
  const takeable = cards.filter((c) => canTake(player, activityId, c));
  if (takeable.length === 0) {
    log(state, `${player.name}: 비용이 모자라서 ${ACTIVITY_NAME[activityId]}의 카드를 가져오지 못했어요`);
    return;
  }
  if (cards.length === 1) {
    takeOffered(state, player, activityId, cards[0]);
    return;
  }
  state.pendingPick = { playerId: player.id, activityId, mode: "take" };
}

// 활동 하나를 실제로 진행한다 (진행 단계에서 선택한 순서대로 하나씩 호출된다)
function startActivity(state: GameState, choice: ActivityChoice): void {
  const player = state.players[choice.playerId];
  switch (choice.activityId) {
    case "tournament": {
      startTournament(state, player);
      break;
    }
    case "duel": {
      // 주문 대결은 이긴 사람이 마도서를 고른다: 처음 도전한 사람이 카드를 열어 둔다
      if (!state.hidden.offers.duel) openOffer(state, "duel");
      startDuel(state, player, state.players[choice.targetPlayerId!]);
      break;
    }
    default:
      startZonePick(state, choice.activityId, player);
  }
}

// 선택 단계: 선부터 시계방향으로 각자 활동을 고른다. 고른 활동은 모두에게 공개되고, 모두 고르면 진행 단계에서 하나씩 처리한다.
// 비용(구역 두 번째 참가비 매력토큰·카드를 여는 지력토큰)은 고르는 순간 낸다
export function selectActivity(state: GameState, playerId: string, activityId: ActivityId, targetPlayerId?: string): void {
  if (state.phase !== "activity") throw new Error("지금은 자율활동 단계가 아닙니다.");
  if (state.activityStage !== "choose") throw new Error("이미 모두 활동을 골랐어요. 차례대로 진행 중이에요.");
  const currentTurnPlayerId = state.activityOrder[state.activityTurnPointer];
  if (currentTurnPlayerId !== playerId) throw new Error("당신의 차례가 아닙니다.");
  if (!ACTIVITY_IDS.includes(activityId)) throw new Error("존재하지 않는 활동입니다.");

  const player = state.players[playerId];
  const blocked = activityBlockReason(state, playerId, activityId);
  if (blocked) throw new Error(blocked);
  let target: PlayerGameState | undefined;
  if (activityId === "duel") {
    target = targetPlayerId ? state.players[targetPlayerId] : undefined;
    if (!target || target.id === playerId) throw new Error("주문 대결 상대를 지정해야 합니다.");
    if (target.hasActedThisPhase) throw new Error("아직 자율활동을 고르지 않은 플레이어만 지목할 수 있습니다.");
  }
  // 먼저 온 친구가 있는 구역은 매력토큰 1개를 더 낸다
  const extra = activityExtraCost(state, activityId);
  player.charmTokens -= extra;
  // 구역에 처음 들어와 카드를 여는 사람이 지력토큰을 낸다
  pay(player, "intelligence", activityOpenCost(state, activityId));
  state.activitySlots[activityId].push(playerId);
  player.hasActedThisPhase = true;
  state.activityChoices.push({ playerId, activityId, targetPlayerId: target?.id });
  if (target) {
    // 지목당한 플레이어는 이번 달 자율활동으로 주문 대결을 강제로 하게 된다 (자기 차례는 건너뜀)
    target.hasActedThisPhase = true;
    state.duels.push({ challengerId: playerId, targetId: target.id });
    log(state, `${player.name}: ${ACTIVITY_NAME[activityId]} 선택 — ${target.name}님을 지목했어요`);
  } else {
    log(state, `${player.name}: ${ACTIVITY_NAME[activityId]} 선택`);
  }
  state.activityTurnPointer += 1;
  skipUnavailableChoosers(state);
}

// 다음에 고를 사람을 찾는다. 주문 대결에 지목당해 이미 활동이 정해진 플레이어는 건너뛰고,
// 고를 수 있는 활동이 없는 플레이어는 쉬어 가며 다음 달 체력토큰 +1을 받는다. 모두 골랐으면 진행 단계로 넘어간다
function skipUnavailableChoosers(state: GameState): void {
  while (state.activityTurnPointer < state.activityOrder.length) {
    const player = state.players[state.activityOrder[state.activityTurnPointer]];
    if (!player.hasActedThisPhase && availableActivities(state, player.id).length === 0) {
      player.hasActedThisPhase = true;
      player.pendingStaminaTokens += 1;
      log(state, `${player.name}: 고를 수 있는 구역이 없어 쉬어 갑니다 (다음 달 체력토큰 +1)`);
    }
    if (!player.hasActedThisPhase) return;
    state.activityTurnPointer += 1;
  }
  beginResolveStage(state);
}

function beginResolveStage(state: GameState): void {
  state.activityStage = "resolve";
  state.activityResolvePointer = 0;
  state.activityResolveStarted = false;
  state.activityResults = [];
  if (state.activityChoices.length === 0) {
    endActivityPhase(state);
    return;
  }
  log(state, `모두 활동을 골랐어요! 차례대로 진행해요: ${state.activityChoices.map((c) => `${state.players[c.playerId].name}(${ACTIVITY_NAME[c.activityId]})`).join(" → ")}`);
}

// 진행 단계: 다음 활동 하나를 시작한다 (서버가 화면 연출용 간격을 두고 호출한다). 시작할 활동이 없으면 아무 일도 하지 않는다
export function canAdvanceResolution(state: GameState): boolean {
  return (
    state.phase === "activity" &&
    state.activityStage === "resolve" &&
    !state.activityResolveStarted &&
    !state.pendingPick &&
    !state.pendingRoll &&
    state.activityResolvePointer < state.activityChoices.length
  );
}

export function advanceResolution(state: GameState): void {
  if (!canAdvanceResolution(state)) return;
  const choice = state.activityChoices[state.activityResolvePointer];
  state.activityResolveStarted = true;
  state.hidden.resolveLogStart = state.log.length;
  startActivity(state, choice);
  // 공개된 카드를 고르거나 주사위를 굴릴 때까지 다음으로 넘어가지 않는다
  if (!state.pendingPick && !state.pendingRoll) finishResolutionStep(state);
}

// 현재 활동의 진행을 마치고 결과를 남긴다. 마지막 활동이었다면 3주차를 마친다
function finishResolutionStep(state: GameState): void {
  const choice = state.activityChoices[state.activityResolvePointer];
  if (choice) {
    const lines = state.log.slice(state.hidden.resolveLogStart ?? 0).map((e) => e.message);
    state.activityResults.push({ playerId: choice.playerId, activityId: choice.activityId, lines });
  }
  state.activityResolvePointer += 1;
  state.activityResolveStarted = false;
  if (state.activityResolvePointer >= state.activityChoices.length) endActivityPhase(state);
}

function endActivityPhase(state: GameState): void {
  // 끝까지 함께할 친구가 나타나지 않은 협력 카드는 무효가 된다 (열었던 지력토큰은 돌려받지 못한다)
  const hold = state.hidden.coop;
  if (hold) {
    state.hidden.coop = null;
    state.coopWaiting = null;
    state.explorationPile.discard.push(hold.card);
    log(state, `${state.players[hold.playerId].name}: 함께할 친구가 없어 협력 카드 "${hold.card.name}"이(가) 무효가 되었어요`);
  }
  discardOffers(state);
  beginCleanupPhase(state);
}

// 구역에 공개된 카드 중 1장을 고른다 (마법생물·연구 카드는 비용을 낼 수 있어야 하고, cardId가 null이면 가져가지 않고 넘어간다.
// 비밀의 방 카드와 주문 대결 마도서는 반드시 골라야 한다)
export function chooseActivityCard(state: GameState, playerId: string, cardId: string | null): void {
  const pick = state.pendingPick;
  if (!pick || pick.playerId !== playerId) throw new Error("지금은 카드를 고를 수 없습니다.");
  const player = state.players[playerId];
  if (cardId === null) {
    if (pick.mode === "reward" || pick.activityId === "exploration") throw new Error("공개된 카드 중 하나를 골라야 해요.");
    state.pendingPick = null;
    log(state, `${player.name}: ${ACTIVITY_NAME[pick.activityId]}의 카드를 가져가지 않고 넘어갔어요`);
    finishResolutionStep(state);
    return;
  }
  const card = offerCards(state, pick.activityId).find((c) => c.id === cardId);
  if (!card) throw new Error("공개된 카드 중에서만 고를 수 있습니다.");
  if (!canTake(player, pick.activityId, card)) throw new Error("비용이 모자라서 이 카드는 가져갈 수 없어요.");
  state.pendingPick = null;
  takeOffered(state, player, pick.activityId, card);
  // 탐험 판정이나 다음 선택이 남아 있지 않으면 다음 활동으로 넘긴다
  if (!state.pendingRoll && !state.pendingPick) finishResolutionStep(state);
}

// ── 주사위 굴리기 (선 정하기·주문 대결·탐험 판정·시험) ──
// 굴려야 하는 사람이 모두 굴리면 결과가 화면에 나오고, 굴린 사람들이 결과를 눈으로 확인한 뒤 "확인"을 눌러야 결과가 적용된다

// 주사위 굴리기 버튼: 서버가 굴려서 결과를 기록한다
// diceCount는 굴리기 전에 지력토큰을 내고 주사위 수를 고르는 굴림(연구실 실험)에서만 쓴다
export function submitRoll(state: GameState, playerId: string, diceCount?: number): void {
  const pending = state.pendingRoll;
  if (!pending) throw new Error("지금은 주사위를 굴릴 차례가 아닙니다.");
  const entry = pending.entries.find((e) => e.playerId === playerId);
  if (!entry) throw new Error("이번 굴림에 참여하지 않습니다.");
  if (entry.dice) throw new Error("이미 주사위를 굴렸습니다.");
  if (entry.diceChoiceMax !== undefined) {
    const n = diceCount ?? entry.diceCount;
    if (!Number.isInteger(n) || n < 1 || n > entry.diceChoiceMax) throw new Error(`지력토큰을 1~${entry.diceChoiceMax}개 사이로 골라 주세요.`);
    pay(state.players[playerId], "intelligence", n);
    entry.diceCount = n;
    delete entry.diceChoiceMax;
  }
  entry.dice = rollDice(entry.diceCount);
}

// 모두 굴렸는가 (결과를 확인하는 단계)
export function rollRevealed(state: Pick<GameState, "pendingRoll">): boolean {
  return !!state.pendingRoll && state.pendingRoll.entries.every((e) => e.dice !== null);
}

// 다시 굴리기: 모두 굴린 뒤 아직 확인하지 않았다면, 지력토큰 1개당 주사위 1개를 원하는 만큼(일부 주사위만) 다시 굴린다.
// 몇 번이든 지력토큰이 허락하는 만큼 다시 굴릴 수 있다
export function rerollDice(state: GameState, playerId: string, diceIndexes: number[]): void {
  const pending = state.pendingRoll;
  if (!pending) throw new Error("지금은 주사위를 다시 굴릴 때가 아닙니다.");
  if (pending.kind === "first") throw new Error("선 정하기 주사위는 다시 굴릴 수 없어요.");
  const entry = pending.entries.find((e) => e.playerId === playerId);
  if (!entry) throw new Error("이번 굴림에 참여하지 않습니다.");
  if (!rollRevealed(state) || entry.dice === null) throw new Error("모두 주사위를 굴린 뒤에 다시 굴릴 수 있어요.");
  if (entry.confirmed) throw new Error("이미 결과를 확인했어요.");
  const indexes = [...new Set(diceIndexes)];
  if (indexes.length === 0) throw new Error("다시 굴릴 주사위를 골라 주세요.");
  if (indexes.some((i) => !Number.isInteger(i) || i < 0 || i >= entry.dice!.length)) throw new Error("없는 주사위입니다.");
  const player = state.players[playerId];
  if (!canPay(player, indexes.length, 0)) throw new Error(`지력토큰이 부족해요 (주사위 ${indexes.length}개를 다시 굴리려면 지력토큰 ${indexes.length}개가 필요해요).`);
  pay(player, "intelligence", indexes.length);
  const before = indexes.map((i) => entry.dice![i]);
  for (const i of indexes) entry.dice[i] = rollD6();
  entry.rerolls += indexes.length;
  log(state, `${player.name}: 지력토큰 ${indexes.length}개로 주사위를 다시 굴렸어요 (${before.join(", ")} → ${indexes.map((i) => entry.dice![i]).join(", ")})`);
}

// 결과 확인 버튼: 모든 참여자가 확인하면 결과를 적용한다
export function confirmRoll(state: GameState, playerId: string): void {
  const pending = state.pendingRoll;
  if (!pending) throw new Error("지금은 주사위 결과를 확인할 때가 아닙니다.");
  const entry = pending.entries.find((e) => e.playerId === playerId);
  if (!entry) throw new Error("이번 굴림에 참여하지 않습니다.");
  if (!rollRevealed(state)) throw new Error("모두 주사위를 굴린 뒤에 확인할 수 있어요.");
  entry.confirmed = true;
  if (pending.entries.every((e) => e.confirmed)) resolveRoll(state);
}

function resolveRoll(state: GameState): void {
  const pending = state.pendingRoll;
  const ctx = state.hidden.roll;
  if (!pending || !ctx) return;
  const diceOf = (id: string) => pending.entries.find((e) => e.playerId === id)?.dice ?? [];
  state.pendingRoll = null;
  state.hidden.roll = null;
  if (ctx.kind === "first") {
    resolveFirstRoll(state, ctx.contenders, diceOf);
  } else if (ctx.kind === "tournament") {
    advanceTournament(state, state.players[ctx.playerId], diceOf(ctx.playerId));
    finishResolutionStep(state);
  } else if (ctx.kind === "creature") {
    resolveCreature(state, ctx, diceOf(ctx.playerId));
    if (!state.pendingPick) finishResolutionStep(state);
  } else if (ctx.kind === "lab") {
    resolveLab(state, ctx, diceOf(ctx.playerId));
    finishResolutionStep(state);
  } else if (ctx.kind === "duel") {
    resolveDuel(state, ctx, diceOf(ctx.challengerId), diceOf(ctx.targetId));
    if (!state.pendingPick) finishResolutionStep(state);
  } else if (ctx.kind === "exploration") {
    resolveExploration(state, ctx, Object.fromEntries(ctx.playerIds.map((id) => [id, diceOf(id)])));
    finishResolutionStep(state);
  } else {
    resolveExam(state, ctx.examType, ctx.card, Object.fromEntries(state.turnOrder.map((id) => [id, diceOf(id)])));
  }
}

// 선 정하기: 가장 높은 눈이 선. 동점이면 동점자끼리 다시 굴린다
function resolveFirstRoll(state: GameState, contenders: string[], diceOf: (id: string) => number[]): void {
  const top = Math.max(...contenders.map((id) => diceOf(id)[0]));
  const winners = contenders.filter((id) => diceOf(id)[0] === top);
  if (winners.length > 1) {
    log(state, `선 정하기: ${winners.map((id) => state.players[id].name).join(", ")}님이 ${top}으로 동점이라 다시 굴려요`);
    beginFirstRoll(state, winners);
    return;
  }
  state.startingPlayerIndex = state.turnOrder.indexOf(winners[0]);
  log(state, `선 정하기: ${state.players[winners[0]].name}님이 선이에요! 선부터 시계방향으로 진행해요`);
  beginRound(state);
}

// ── 4주차(정리): 남은 토큰은 사라지지만, 지력토큰·체력토큰 중 1개는 골라서 다음 달로 남길 수 있다 ──

// 시험을 치르는 달: 1주차(준비) → 시험 → 4주차(정리)
export const isExamRound = (round: number) => round === BALANCE.midtermRound || round === BALANCE.totalRounds;

// 남길 수 있는 토큰 종류 (남은 개수가 1개 이상인 것). 시험 달에 다시 굴리기에 쓰고 남은 지력토큰도 남길 수 있다
export function keepOptions(
  _state: Pick<GameState, "round">,
  p: Pick<PlayerGameState, "intelligenceTokens" | "staminaTokens">,
): Exclude<KeepChoice, "none">[] {
  const options: Exclude<KeepChoice, "none">[] = [];
  if (p.intelligenceTokens > 0) options.push("intelligence");
  if (p.staminaTokens > 0) options.push("stamina");
  return options;
}

// 봇이 남길 토큰: 체력토큰(수업카드·주문력 카드 습득에 쓰인다)을 우선하고, 없으면 지력토큰
export function autoKeepChoice(state: GameState, playerId: string): KeepChoice {
  const options = keepOptions(state, state.players[playerId]);
  return options.includes("stamina") ? "stamina" : (options[0] ?? "none");
}

function beginCleanupPhase(state: GameState): void {
  state.phase = "cleanup";
  state.cleanupKeep = {};
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    if (keepOptions(state, player).length === 0) continue; // 남길 토큰이 없는 사람은 고를 게 없다
    state.cleanupKeep[playerId] = player.isBot ? autoKeepChoice(state, playerId) : null;
  }
  if (Object.values(state.cleanupKeep).every((choice) => choice !== null)) finishCleanup(state);
  else log(state, "4주차(정리): 다음 달로 남길 토큰을 골라요 (지력토큰 또는 체력토큰 1개)");
}

// 남길 토큰을 고른다 (choice가 "none"이면 남기지 않는다). 남길 토큰이 있는 모두가 고르면 정리를 마친다
export function chooseKeepToken(state: GameState, playerId: string, choice: KeepChoice): void {
  if (state.phase !== "cleanup") throw new Error("지금은 4주차 정리 단계가 아닙니다.");
  if (!(playerId in state.cleanupKeep) || state.cleanupKeep[playerId] !== null) throw new Error("남길 토큰이 없거나 이미 골랐어요.");
  const player = state.players[playerId];
  if (choice !== "none" && !keepOptions(state, player).includes(choice)) throw new Error("그 토큰은 남길 수 없어요 (남아 있는 지력토큰·체력토큰 중에서 골라 주세요).");
  state.cleanupKeep[playerId] = choice;
  log(state, `${player.name}: ${choice === "none" ? "토큰을 남기지 않기로 했어요" : `${choice === "intelligence" ? "지력" : "체력"}토큰 1개를 다음 달로 남기기로 했어요`}`);
  if (Object.values(state.cleanupKeep).every((c) => c !== null)) finishCleanup(state);
}

function finishCleanup(state: GameState): void {
  const keptOf = (id: string): "intelligence" | "stamina" | null => {
    const choice = state.cleanupKeep[id];
    return choice === "intelligence" || choice === "stamina" ? choice : null;
  };
  state.cleanupSummary = state.turnOrder.map((id) => {
    const p = state.players[id];
    const kept = keptOf(id);
    return {
      playerId: id,
      intelligenceTokens: p.intelligenceTokens - (kept === "intelligence" ? 1 : 0),
      staminaTokens: p.staminaTokens - (kept === "stamina" ? 1 : 0),
      charmTokens: p.charmTokens,
      spellbookTokens: p.spellbookTokens,
      kept,
    };
  });
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    const kept = keptOf(playerId);
    player.carryTokens = { intelligence: kept === "intelligence" ? 1 : 0, stamina: kept === "stamina" ? 1 : 0 };
    player.intelligenceTokens = 0;
    player.staminaTokens = 0;
    player.charmTokens = 0;
    player.spellbookTokens = 0;
    player.hasActedThisPhase = false;
  }
  state.cleanupKeep = {};
  log(state, "4주차(정리): 남은 토큰 소멸 (남기기로 한 토큰은 다음 달로 가요)");
  const nextIndex = nextStarterIndex(state);
  if (nextIndex !== state.startingPlayerIndex) {
    state.startingPlayerIndex = nextIndex;
    log(state, `4주차(정리): 매력이 가장 높은 ${state.players[state.turnOrder[nextIndex]].name}님이 다음 달 선이 돼요`);
  } else {
    log(state, `4주차(정리): 다음 달도 ${state.players[state.turnOrder[nextIndex]].name}님이 선이에요 (매력이 가장 높거나 같아요)`);
  }

  advanceRound(state);
}

function advanceRound(state: GameState): void {
  revealExamCard(state);
  state.round += 1;
  beginRound(state);
}

// 3라운드·9라운드가 끝나면 다음 시험(중간고사·기말고사)의 시험 카드를 공개한다
function revealExamCard(state: GameState): void {
  const plan = state.hidden.examPlan;
  const which = state.round === BALANCE.midtermRevealRound ? "midterm" : state.round === BALANCE.finalRevealRound ? "final" : null;
  if (!which) return;
  state.exams[which] = plan[which];
  log(state, `${which === "midterm" ? "중간고사" : "기말고사"} 과목 공개: "${plan[which].name}" (${describeExam(plan[which], STAT_NAME)})`);
}

// 시험: 시험 카드가 정한 능력치 수치만큼 주사위를 굴려(버튼) 합산하고, 보너스 능력치가 있으면 그 수치를 더한다
function examBonus(state: GameState, playerId: string, card: ExamCard): number {
  return card.bonusStat ? effectiveStat(state.players[playerId], card.bonusStat) : 0;
}

function beginExam(state: GameState, examType: "midterm_exam" | "final_exam"): void {
  state.phase = examType;
  const card = state.hidden.examPlan[examType === "midterm_exam" ? "midterm" : "final"];
  state.hidden.roll = { kind: "exam", examType, card };
  state.pendingRoll = {
    kind: "exam",
    title: `${examType === "midterm_exam" ? "중간고사" : "기말고사"} · ${card.name}`,
    lines: [`${describeExam(card, STAT_NAME)}로 점수를 내고, 높은 순서로 순위를 매겨요`],
    entries: state.turnOrder.map((id) => {
      const diceCount = effectiveStat(state.players[id], card.diceStat);
      return { playerId: id, label: state.players[id].name, diceCount, dice: diceCount === 0 ? [] : null, confirmed: diceCount === 0, rerolls: 0 };
    }),
  };
  // 굴릴 주사위가 하나도 없으면 바로 결과를 처리한다
  if (state.pendingRoll.entries.every((e) => e.confirmed)) resolveRoll(state);
}

function resolveExam(state: GameState, examType: "midterm_exam" | "final_exam", card: ExamCard, diceByPlayer: Record<string, number[]>): void {
  const bonusOf = Object.fromEntries(state.turnOrder.map((id) => [id, examBonus(state, id, card)]));
  const scores = new Map(state.turnOrder.map((id) => [id, sum(diceByPlayer[id] ?? []) + bonusOf[id]]));
  // 동점은 공동 순위: 같은 점수는 같은 순위의 학점을 받는다 (1, 1, 3, ...)
  const ranked = rankByScore(state.turnOrder, (id) => scores.get(id) ?? 0);

  const result: ExamResult = { round: state.round, card, scores: [] };
  ranked.forEach((entry) => {
    const rank = entry.rank;
    const creditAwarded = examCreditForRank(rank);
    state.players[entry.playerId].credit += creditAwarded;
    result.scores.push({ playerId: entry.playerId, score: entry.score, dice: diceByPlayer[entry.playerId] ?? [], bonus: bonusOf[entry.playerId], rank, creditAwarded });
  });
  state.examResults.push(result);
  log(state, `${examType === "midterm_exam" ? "중간고사" : "기말고사"} 결과 반영 (학점 지급 완료)`);

  // 연구실 실험으로 얻은 임시 능력치 증가분은 다음 시험까지 유지된 뒤 소멸
  for (const playerId of state.turnOrder) {
    const p = state.players[playerId];
    p.tempBoosts = {};
    // 효과가 끝난 시험 카드는 버림 더미로
    state.labPile.discard.push(...p.equipment);
    p.equipment = [];
  }

  if (examType === "final_exam") {
    applyTournamentFinalRewards(state);
    finalizeGame(state);
  } else {
    beginCleanupPhase(state); // 중간고사 달의 4주차(정리): 시험 뒤 남은 지력토큰도 1개 남길 수 있다
  }
}

function applyTournamentFinalRewards(state: GameState): void {
  // 트랙 위치가 높은 순으로 공동 순위를 매겨 1위 +2, 2위 +1 (같은 칸이면 공동 순위, 트랙 0칸은 제외)
  const ranked = rankByScore(state.turnOrder, (id) => state.players[id].tournamentTrack);
  const rewards = BALANCE.tournamentRewards;
  for (const { playerId, rank } of ranked) {
    const player = state.players[playerId];
    if (player.tournamentTrack <= 0 || rank > rewards.length) continue;
    player.credit += rewards[rank - 1];
    log(state, `${player.name}: 마법 토너먼트 ${rank}위${ranked.filter((x) => x.rank === rank).length > 1 ? "(공동)" : ""} 보상 학점 +${rewards[rank - 1]}`);
  }
}

// 최종 점수: 마법 성취도(주문력 × 학점) + 마법생물 세트(하늘·육지·바다 1장씩) 점수
export function finalScore(player: PlayerGameState): number {
  return effectiveStat(player, "spellPower") * player.credit + creatureSets(player.creatures) * BALANCE.creatureSetScore;
}

function finalizeGame(state: GameState): void {
  state.phase = "ended";
  const achievements = state.turnOrder.map((id) => ({
    playerId: id,
    achievement: finalScore(state.players[id]),
  }));
  // 최종 점수 동점이면 공동 승리
  const best = Math.max(...achievements.map((a) => a.achievement));
  state.winnerIds = achievements.filter((a) => a.achievement === best).map((a) => a.playerId);
  log(state, "게임 종료: 최종 점수(주문력 × 학점 + 마법생물 세트 점수) 최고 플레이어 승리");
}
