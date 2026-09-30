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
import { describeAbility } from "./creatures.js";
import { describeExam, pickExamCards } from "./examCards.js";
import { describeEffect } from "./explorationCards.js";
import {
  effectiveStat,
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

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const emptySlots = (): Record<ActivityId, string[]> => ({ tournament: [], creature: [], duel: [], exploration: [], lab: [] });

// 동점 처리 공통 규칙: 매력이 높은 쪽 우선, 매력도 같으면 주사위(무작위)로 결정
function compareTieBreak(state: GameState, aId: string, bId: string): number {
  const charmDiff = effectiveStat(state.players[bId], "charm") - effectiveStat(state.players[aId], "charm");
  return charmDiff !== 0 ? charmDiff : Math.random() < 0.5 ? -1 : 1;
}

// 3주차(자율활동) 구역 선택 순서: 현재 매력이 높은 순 (동점이면 주사위). 2주차 수업카드로 바뀐 매력이 반영된다
function orderByCharm(state: GameState): string[] {
  return state.turnOrder
    .map((id) => ({ id, charm: effectiveStat(state.players[id], "charm"), roll: Math.random() }))
    .sort((a, b) => b.charm - a.charm || b.roll - a.roll)
    .map((entry) => entry.id);
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

// 마법생물 유형 점수 (세븐원더스의 과학 카드 방식): 같은 속성이 늘수록 제곱으로 커지고, 세 속성을 고루 모으면 세트 보너스.
// 학점은 이 점수를 나눈 몫이며, 새 카드를 얻을 때 늘어난 만큼 즉시 받는다.
function creatureCollectionCredit(creatures: CreatureCard[]): number {
  const counts = { sky: 0, land: 0, ocean: 0 };
  for (const c of creatures) counts[c.element] += 1;
  const values = Object.values(counts);
  const score = values.reduce((sum, n) => sum + n * n, 0) + BALANCE.creatureSetBonus * Math.min(...values);
  return Math.floor(score / BALANCE.creatureScoreDivisor);
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

// 탐험 카드의 판정 문구 (엿보기·협력 대기 표시용)
function checkTextOf(card: ExplorationCard): string | undefined {
  if (card.coop) return `협력 카드 — 둘의 (주사위 + ${STAT_NAME[card.coop.stat]}) 합 ≥ ${card.coop.pairTarget} (혼자면 무효)`;
  if (!card.check) return undefined;
  const stat = STAT_NAME[card.check.stat];
  return `${stat} 판정 (주사위 + ${stat} ≥ ${card.check.target})`;
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
          checkText: checkTextOf(top),
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
  // ASSUMPTION: 선 플레이어는 무작위로 정하고(문서상 "무작위 또는 협의"), 좌석 순서(시계방향)는 참가 순서를 그대로 사용한다.
  const turnOrder = shuffle(players.map((p) => p.id));
  const state: GameState = {
    round: 1,
    phase: "prep",
    turnOrder,
    startingPlayerIndex: 0,
    players: Object.fromEntries(
      players.map((p) => [p.id, createPlayer(p.id, p.name, p.isBot)]),
    ),
    activitySlots: emptySlots(),
    activityOrder: [],
    activityTurnPointer: 0,
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
  beginRound(state);
  return state;
}

// ── 토큰 지불: 매력토큰은 언제든 charmRate개(기본 3개)를 지력토큰·체력토큰 1개로 바꿔 낼 수 있고,
//    자율활동 구역의 두 번째 참가비는 매력토큰 1개로 (체력토큰 대신) 낼 수 있다 ──

type PayKind = "intelligence" | "stamina";
type Payer = Pick<PlayerGameState, "intelligenceTokens" | "staminaTokens" | "charmTokens" | "grimoires" | "creatures">;

// 매력토큰 몇 개가 다른 토큰 1개가 되는가 ("always/charmRate" 능력을 가진 카드로 줄어들지만 최소 charmExchangeRateMin)
export function charmRate(p: Pick<PlayerGameState, "grimoires" | "creatures">): number {
  const abilities = [...p.creatures.map((c) => c.ability), ...p.grimoires.flatMap((g) => (g.ability ? [g.ability] : []))];
  const cut = sumEffect(abilities.filter((a) => a.trigger === "always"), "charmRate");
  return Math.max(BALANCE.charmExchangeRateMin, BALANCE.charmExchangeRate - cut);
}

// 지력토큰 int개 + 체력토큰 stamina개 + (매력토큰 1개로 낼 수도 있는) 참가비 fee개를 낼 방법이 있는가.
// 참가비에 매력토큰을 몇 개 쓸지(k)를 돌려주고, 낼 수 없으면 -1. 매력토큰을 참가비에 많이 쓸수록 교환용 매력토큰이 줄어 유리/불리가 갈리므로 가능한 k 중 가장 큰 값을 고른다
export function planPayment(p: Payer, int: number, stamina: number, fee = 0): number {
  const rate = charmRate(p);
  for (let k = Math.min(fee, p.charmTokens); k >= 0; k--) {
    const lack = Math.max(0, int - p.intelligenceTokens) + Math.max(0, stamina + fee - k - p.staminaTokens);
    if (lack * rate <= p.charmTokens - k) return k;
  }
  return -1;
}

export const canPay = (p: Payer, int: number, stamina: number, fee = 0): boolean => planPayment(p, int, stamina, fee) >= 0;

// n개를 낸다: 가진 토큰을 먼저 쓰고 모자란 만큼을 매력토큰(부족분 × 환율)으로 낸다
function pay(p: PlayerGameState, kind: PayKind, n: number): void {
  const own = Math.min(n, kind === "intelligence" ? p.intelligenceTokens : p.staminaTokens);
  if (kind === "intelligence") p.intelligenceTokens -= own;
  else p.staminaTokens -= own;
  p.charmTokens -= (n - own) * charmRate(p);
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
    // 매력 수치만큼 매력토큰: 지력토큰·체력토큰이 모자랄 때 대신 낼 수 있는 만능 토큰
    player.charmTokens = effectiveStat(player, "charm");
  }
  beginClassPhase(state);
}

// 지력이 높은 순(동점이면 매력, 그다음 주사위)으로 수업카드를 고르는 순서
function orderByIntelligence(state: GameState): string[] {
  return state.turnOrder
    .map((id) => ({
      id,
      intelligence: effectiveStat(state.players[id], "intelligence"),
      charm: effectiveStat(state.players[id], "charm"),
      roll: Math.random(),
    }))
    .sort((a, b) => b.intelligence - a.intelligence || b.charm - a.charm || b.roll - a.roll)
    .map((entry) => entry.id);
}

// 2주차(정규수업): 인원수 + 1장을 공개하고, 지력이 높은 플레이어부터 원하는 카드 1장을 (체력토큰을 내고) 가져간다
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
  state.classPickOrder = orderByIntelligence(state);
  state.classPickPointer = 0;
  log(
    state,
    `2주차(정규수업): 수업카드 ${state.classMarket.length}장 공개 — 지력 순서: ${state.classPickOrder.map((id) => state.players[id].name).join(" → ")}`,
  );
}

// 아직 열 수 있는 수업카드 수 (덱 + 버림 더미)
export function classCardsLeft(state: Pick<GameState, "classDeck" | "classDiscard">): number {
  return state.classDeck.length + state.classDiscard.length;
}

// 2주차: 내 차례에 공개된 수업카드 중 1장을 가져간다 (체력토큰 takeCost개 필요, 모자라면 매력토큰으로 대신). cardId가 null이면 가져가지 않고 넘어간다
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
      throw new Error(`체력토큰이 부족합니다 (이 카드는 체력토큰 ${card.takeCost}개 필요, 매력토큰으로 대신 낼 수 있어요).`);
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
  state.activityOrder = orderByCharm(state);
  state.startingPlayerIndex = state.turnOrder.indexOf(state.activityOrder[0]);
  state.activityTurnPointer = 0;
  state.duels = [];
  state.activityOffers = {};
  state.pendingPick = null;
  state.pendingRoll = null;
  state.coopWaiting = null;
  state.hidden = { ...state.hidden, roll: null, coop: null, offers: {} }; // 시험 카드 계획(examPlan)은 게임 내내 유지
  for (const playerId of state.turnOrder) {
    state.players[playerId].hasActedThisPhase = false;
  }
  log(state, `3주차(자율활동) 시작 — 매력 순서: ${state.activityOrder.map((id) => state.players[id].name).join(" → ")}`);
}

// ── 자율활동: 구역 선택 규칙 ──

export type ActivityView = Pick<GameState, "activitySlots" | "players" | "turnOrder" | "coopWaiting" | "activityOffers">;

// 구역에 처음 들어와 카드를 여는 사람이 내는 지력토큰 (마법생물 조련·비밀의 방 탐색·주문 대결·연구실 실험).
// 이미 카드가 열려 있으면(두 번째 참가자) 새로 열 필요가 없으니 내지 않는다
export function activityOpenCost(state: Pick<GameState, "activityOffers">, activityId: ActivityId): number {
  if (activityId === "tournament") return 0;
  return state.activityOffers[activityId] ? 0 : BALANCE.openCardCost;
}

// 이미 다른 플레이어가 있는 구역에 들어갈 때 내야 하는 체력토큰
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
  if (!canPay(player, 0, 0, extra)) return `이미 참여한 친구가 있어서 체력토큰 ${extra}개가 더 필요해요 (매력토큰 ${extra}개로 낼 수도 있어요).`;
  const open = activityOpenCost(state, activityId);
  if (!canPay(player, open, 0, extra)) return `카드를 열 지력토큰 ${open}개가 필요해요 (매력토큰 ${charmRate(player)}개로 지력토큰 1개를 대신할 수 있어요).`;
  if (activityId === "duel") {
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

function startDuel(state: GameState, player: PlayerGameState, targetPlayerId: string | undefined, boost: number): void {
  const target = targetPlayerId ? state.players[targetPlayerId] : undefined;
  if (!target || target.id === player.id) throw new Error("주문 대결 상대를 지정해야 합니다.");
  if (target.hasActedThisPhase) throw new Error("아직 자율활동을 고르지 않은 플레이어만 지목할 수 있습니다.");
  // 지목당한 플레이어는 이번 달 자율활동으로 주문 대결을 강제로 하게 된다 (자기 차례는 건너뜀)
  target.hasActedThisPhase = true;
  state.duels.push({ challengerId: player.id, targetId: target.id });
  // 지목당한 쪽은 남은 체력토큰이 있으면 자동으로 집중해 굴림 +1 (토큰은 어차피 4주차에 소멸)
  const defenderBoost = canPay(target, 0, 1) ? 1 : 0;
  if (defenderBoost) pay(target, "stamina", 1);
  state.hidden.roll = { kind: "duel", challengerId: player.id, targetId: target.id, challengerBoost: boost, defenderBoost };
  state.pendingRoll = {
    kind: "duel",
    title: `주문 대결 · ${player.name} vs ${target.name}`,
    lines: [
      `${player.name}님이 ${target.name}님을 지목했어요`,
      `주사위 + 주문력이 큰 쪽이 이겨요. 도전자는 지목당한 친구에게 매력 ${BALANCE.duelCharmFee}을 건네요`,
    ],
    entries: [
      { playerId: player.id, label: `${player.name} (도전자)`, diceCount: 1, dice: null },
      { playerId: target.id, label: `${target.name} (지목당함)`, diceCount: 1, dice: null },
    ],
  };
}

function resolveDuel(state: GameState, ctx: Extract<RollContext, { kind: "duel" }>, challengerDie: number, defenderDie: number): void {
  const player = state.players[ctx.challengerId];
  const target = state.players[ctx.targetId];
  // 동점일 때 비교할 매력은 참가비를 건네기 전 값이다
  const challengerCharm = effectiveStat(player, "charm");
  const targetCharm = effectiveStat(target, "charm");
  // 참가비: 결과와 상관없이 도전자가 지목당한 친구에게 매력을 건넨다
  const fee = Math.min(BALANCE.duelCharmFee, player.charm);
  player.charm -= fee;
  target.charm += fee;
  // 마법생물 능력: 참여 시(duel)는 양쪽, 도전받았을 때(defend)는 도전받은 쪽만 적용
  const challengerAbilities = abilitiesOf(player, "duel");
  const defenderAbilities = [...abilitiesOf(target, "duel"), ...abilitiesOf(target, "defend")];
  const challengerBonus = sumEffect(challengerAbilities, "rollBonus") - sumEffect(defenderAbilities, "enemyRollPenalty");
  const defenderBonus = sumEffect(defenderAbilities, "rollBonus") - sumEffect(challengerAbilities, "enemyRollPenalty");
  const challengerSpell = effectiveStat(player, "spellPower");
  const defenderSpell = effectiveStat(target, "spellPower");
  const challengerRoll = Math.max(0, challengerDie + ctx.challengerBoost + challengerSpell + challengerBonus);
  const defenderRoll = Math.max(0, defenderDie + ctx.defenderBoost + defenderSpell + defenderBonus);
  // 동점이면 매력이 높은 쪽, 매력도 같으면 도전받은 쪽(defender)이 승리 (주사위 재굴림 대신 기존 규칙 유지)
  const challengerWins =
    challengerRoll !== defenderRoll
      ? challengerRoll > defenderRoll
      : challengerCharm > targetCharm;
  const winner = challengerWins ? player : target;
  const loser = winner === player ? target : player;
  const loserAbilities = [...(loser === player ? challengerAbilities : defenderAbilities), ...abilitiesOf(loser, "lose")];
  // 체력토큰 효과는 다음 달 준비 때 반영
  player.pendingStaminaTokens += sumEffect(challengerAbilities, "stamina");
  target.pendingStaminaTokens += sumEffect(defenderAbilities, "stamina");
  target.pendingStaminaTokens -= sumEffect(challengerAbilities, "enemyStamina");
  player.pendingStaminaTokens -= sumEffect(defenderAbilities, "enemyStamina");
  loser.pendingStaminaTokens += sumEffect(abilitiesOf(loser, "lose"), "stamina");
  winner.pendingStaminaTokens -= sumEffect(abilitiesOf(loser, "lose"), "enemyStamina");
  // 강제로 지목당한 쪽은 져도 마법 주문서를 잃지 않는다
  if (loser !== target && loser.spellbookTokens > 0 && sumEffect(loserAbilities, "immune") === 0) {
    loser.spellbookTokens = Math.max(0, loser.spellbookTokens - BALANCE.duelLoserTokenLoss);
  }
  const rollText = (die: number, boost: number, spell: number, bonus: number, total: number) =>
    `${describeRoll([die], [["집중", boost], ["주문력", spell], ["능력", bonus]])} = ${total}`;
  log(
    state,
    `${player.name}(${rollText(challengerDie, ctx.challengerBoost, challengerSpell, challengerBonus, challengerRoll)})이(가) ${target.name}(${rollText(defenderDie, ctx.defenderBoost, defenderSpell, defenderBonus, defenderRoll)})을(를) 지목! ${winner.name} 승리${fee > 0 ? ` — ${player.name}이(가) ${target.name}에게 매력 ${fee}을 건넸어요` : ""}`,
  );
  // 이긴 사람이 구역에 공개된 마도서 중 1장을 가져간다 (한 장만 남았으면 자동으로)
  const rewards = offerCards(state, "duel");
  if (rewards.length === 1) takeOffered(state, winner, "duel", rewards[0], 0);
  else if (rewards.length > 1) {
    state.pendingPick = { playerId: winner.id, activityId: "duel", mode: "reward", boost: 0 };
  }
}

// 탐험 판정 주사위 굴리기 시작 (판정 없는 카드는 바로 처리)
function startExplorationRoll(
  state: GameState,
  card: ExplorationCard,
  playerIds: string[],
  boosts: Record<string, number>,
  mode: "single" | "pair",
): void {
  const ctx: RollContext = { kind: "exploration", card, playerIds, boosts, mode };
  const rule = explorationRule(card, mode);
  if (!rule) {
    resolveExploration(state, ctx, {});
    return;
  }
  const stat = STAT_NAME[rule.stat];
  const target = rule.target;
  state.hidden.roll = ctx;
  state.pendingRoll = {
    kind: "exploration",
    title: `비밀의 방 · ${card.name}`,
    lines: [
      card.description,
      mode === "pair" ? `둘의 (주사위 + ${stat}) 합이 ${target} 이상이면 성공! 보상은 둘 다 받아요` : `주사위 + ${stat} ≥ ${target} 이면 성공`,
    ],
    entries: playerIds.map((id) => ({ playerId: id, label: state.players[id].name, diceCount: 1, dice: null })),
  };
}

// 탐험 카드의 판정 규칙: 협력 카드는 두 명의 합, 일반 카드는 혼자 판정. 판정이 없는 카드는 null
function explorationRule(card: ExplorationCard, mode: "single" | "pair"): { stat: StatKey; target: number } | null {
  if (mode === "pair" && card.coop) return { stat: card.coop.stat, target: card.coop.pairTarget };
  return card.check ? { stat: card.check.stat, target: card.check.target } : null;
}

function resolveExploration(state: GameState, ctx: Extract<RollContext, { kind: "exploration" }>, dice: Record<string, number>): void {
  const { card, playerIds, boosts, mode } = ctx;
  let success = true;
  let rollText = "";
  const rule = explorationRule(card, mode);
  if (rule) {
    const stat = rule.stat;
    const parts = playerIds.map((id) => {
      const p = state.players[id];
      // 선두와의 격차가 크면 역전 보너스: 뒤처진 플레이어의 한 방을 돕는다
      const catchUp = growthGap(state, id) >= BALANCE.catchUpGap ? BALANCE.catchUpBonus : 0;
      const statValue = effectiveStat(p, stat);
      const total = dice[id] + (boosts[id] ?? 0) + catchUp + statValue;
      return { p, total, text: `${describeRoll([dice[id]], [["집중", boosts[id] ?? 0], [STAT_NAME[stat], statValue], ["역전", catchUp]])} = ${total}` };
    });
    const target = rule.target;
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

function describeCoop(card: ExplorationCard, playerId: string): CoopWaiting {
  const stat = STAT_NAME[card.coop!.stat];
  return {
    playerId,
    name: card.name,
    description: card.description,
    pairText: `둘의 (주사위 + ${stat}) 합이 ${card.coop!.pairTarget} 이상이면 성공`,
    voidText: "함께할 친구가 끝까지 나타나지 않으면 이 카드는 무효가 돼요",
    successText: `${describeEffect(card.success)} (두 명 모두)`,
    failureText: `${describeEffect(card.failure)} (두 명 모두)`,
  };
}

// ── 3주차 구역에 공개된 카드: 처음 들어온 사람이 2장을 열고, 먼저 온 사람이 원하는 카드를 가져가고 남는 카드는 두 번째 참가자가 가져간다 ──

function offerCards(state: GameState, activityId: ActivityId): OfferedCard[] {
  return state.hidden.offers[activityId] ?? [];
}

function offerViewOf(activityId: ActivityId, card: OfferedCard): OfferCardView {
  switch (activityId) {
    case "creature": {
      const c = card as CreatureCard;
      return { id: c.id, name: c.name, description: c.description, lines: [describeAbility(c.ability)], cost: { kind: "spellbook", amount: c.requiredSpellPower } };
    }
    case "lab": {
      const c = card as LabCard;
      return { id: c.id, name: c.name, description: c.description, lines: [c.summary], cost: c.cost > 0 ? { kind: "stamina", amount: c.cost } : undefined };
    }
    case "exploration": {
      const c = card as ExplorationCard;
      const check = checkTextOf(c);
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
  state.activityOffers[activityId] = { cards: offerCards(state, activityId).map((c) => offerViewOf(activityId, c)) };
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

// 구역에 처음 들어온 사람이 카드를 연다 (기본 2장. 연구실은 집중하면 1장 더)
function openOffer(state: GameState, activityId: ActivityId, boost: number): void {
  const count = BALANCE.activityOpenCount + (activityId === "lab" ? boost : 0);
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

const creatureCost = (card: CreatureCard, boost: number) => Math.max(1, card.requiredSpellPower - boost);

// 이 카드를 지금 가져갈 수 있는가 (비용을 낼 수 있는가). 마법생물은 마법 주문서, 연구 카드는 체력토큰(매력토큰으로 대신 가능)
function canTake(player: PlayerGameState, activityId: ActivityId, card: OfferedCard, boost: number): boolean {
  if (activityId === "creature") return player.spellbookTokens >= creatureCost(card as CreatureCard, boost);
  if (activityId === "lab") return canPay(player, 0, (card as LabCard).cost);
  return true;
}

// 공개된 카드를 실제로 가져와 효과를 적용한다 (비용도 여기서 낸다)
function takeOffered(state: GameState, player: PlayerGameState, activityId: ActivityId, card: OfferedCard, boost: number): void {
  state.hidden.offers[activityId] = offerCards(state, activityId).filter((c) => c.id !== card.id);
  syncOfferView(state, activityId);
  switch (activityId) {
    case "creature": {
      const creature = card as CreatureCard;
      // 체력토큰으로 집중하면 필요한 마법 주문서가 줄어든다 (최소 1개)
      player.spellbookTokens -= creatureCost(creature, boost);
      const creditBefore = creatureCollectionCredit(player.creatures);
      player.creatures.push(creature);
      if (creature.ability.trigger === "acquire" && creature.ability.effect === "spellPower") player.spellPower += creature.ability.amount;
      // 유형 모으기 보너스: 새 카드로 늘어난 유형 점수만큼 학점을 즉시 받는다
      const collectionCredit = creatureCollectionCredit(player.creatures) - creditBefore;
      player.credit += collectionCredit;
      log(
        state,
        `${player.name}: 마법생물 "${creature.name}" 획득 (${describeAbility(creature.ability)})${collectionCredit > 0 ? ` — 유형 모으기 보너스 학점 +${collectionCredit}` : ""}`,
      );
      break;
    }
    case "lab": {
      const lab = card as LabCard;
      pay(player, "stamina", lab.cost);
      applyCardEffect(state, player, lab.effect);
      // 시험 카드는 다음 시험까지 보관하고, 나머지는 효과를 받는 즉시 버림 더미로
      if (lab.kind === "exam") player.equipment.push(lab);
      else state.labPile.discard.push(lab);
      log(state, `${player.name}: 연구 카드 "${lab.name}" 선택 (${lab.summary}${lab.cost > 0 ? `, 체력토큰 ${lab.cost}개` : ""})`);
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
        state.hidden.coop = { card: exploration, playerId: player.id, boost };
        state.coopWaiting = describeCoop(exploration, player.id);
        log(state, `${player.name}: 비밀의 방에서 협력 카드 "${exploration.name}"를 골랐어요! 함께할 친구를 기다려요`);
      } else {
        startExplorationRoll(state, exploration, [player.id], { [player.id]: boost }, "single");
      }
    }
  }
}

// 구역에 들어온 사람의 카드 처리: 처음 온 사람은 카드를 열고 원하는 카드를 고르고, 두 번째 참가자는 남은 카드를 가져간다
function startZonePick(state: GameState, activityId: ActivityId, player: PlayerGameState, boost: number): void {
  const isFirst = !state.hidden.offers[activityId];
  if (activityId === "exploration" && state.hidden.coop) {
    // 함께할 친구를 기다리는 협력 카드가 있으면 그 카드에 합류한다 (남은 카드는 버려진다)
    const hold = state.hidden.coop;
    state.hidden.coop = null;
    state.coopWaiting = null;
    discardToZone(state, "exploration", offerCards(state, "exploration"));
    state.hidden.offers.exploration = [];
    syncOfferView(state, "exploration");
    startExplorationRoll(state, hold.card, [hold.playerId, player.id], { [hold.playerId]: hold.boost, [player.id]: boost }, "pair");
    return;
  }
  if (isFirst) openOffer(state, activityId, boost);
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
  const takeable = cards.filter((c) => canTake(player, activityId, c, boost));
  if (takeable.length === 0) {
    log(state, `${player.name}: 비용이 모자라서 ${ACTIVITY_NAME[activityId]}의 카드를 가져오지 못했어요`);
    return;
  }
  if (cards.length === 1) {
    takeOffered(state, player, activityId, cards[0], boost);
    return;
  }
  state.pendingPick = { playerId: player.id, activityId, mode: "take", boost };
}

function startActivity(state: GameState, activityId: ActivityId, player: PlayerGameState, targetPlayerId: string | undefined, boost: number): void {
  switch (activityId) {
    case "tournament": {
      const gain = effectiveStat(player, "spellPower") + boost;
      player.tournamentTrack += gain;
      log(state, `${player.name}: 마법 토너먼트 참가 (트랙 ${player.tournamentTrack}칸)`);
      break;
    }
    case "duel":
      // 주문 대결은 이긴 사람이 마도서를 고른다: 처음 도전한 사람이 카드를 열어 둔다
      if (!state.hidden.offers.duel) openOffer(state, "duel", boost);
      startDuel(state, player, targetPlayerId, boost);
      break;
    default:
      startZonePick(state, activityId, player, boost);
  }
}

export function selectActivity(
  state: GameState,
  playerId: string,
  activityId: ActivityId,
  targetPlayerId?: string,
  useStamina = false,
): void {
  if (state.phase !== "activity") throw new Error("지금은 자율활동 단계가 아닙니다.");
  if (state.pendingPick) throw new Error("공개된 카드 중 하나를 먼저 골라야 합니다.");
  if (state.pendingRoll) throw new Error("주사위를 먼저 굴려야 합니다.");
  const currentTurnPlayerId = state.activityOrder[state.activityTurnPointer];
  if (currentTurnPlayerId !== playerId) throw new Error("당신의 차례가 아닙니다.");
  if (!ACTIVITY_IDS.includes(activityId)) throw new Error("존재하지 않는 활동입니다.");

  const player = state.players[playerId];
  const blocked = activityBlockReason(state, playerId, activityId);
  if (blocked) throw new Error(blocked);
  // 먼저 온 친구가 있는 구역은 체력토큰 1개를 더 내고, 남은 체력토큰 1개로 집중하면 활동마다 +1 효과
  // (토큰은 4주차에 소멸하므로 남겨도 쓸모없다)
  const extra = activityExtraCost(state, activityId);
  const focusCost = useStamina ? 1 : 0;
  const feeByCharm = planPayment(player, activityOpenCost(state, activityId), focusCost, extra);
  if (feeByCharm < 0) throw new Error("집중에 쓸 체력토큰이 없습니다.");
  if (activityId === "duel") {
    const target = targetPlayerId ? state.players[targetPlayerId] : undefined;
    if (!target || target.id === playerId) throw new Error("주문 대결 상대를 지정해야 합니다.");
    if (target.hasActedThisPhase) throw new Error("아직 자율활동을 고르지 않은 플레이어만 지목할 수 있습니다.");
  }

  player.charmTokens -= feeByCharm; // 참가비는 매력토큰 1개로 (체력토큰 대신) 낼 수 있다
  pay(player, "stamina", extra - feeByCharm + focusCost);
  // 구역에 처음 들어와 카드를 여는 사람이 지력토큰을 낸다
  pay(player, "intelligence", activityOpenCost(state, activityId));
  state.activitySlots[activityId].push(playerId);
  player.hasActedThisPhase = true;
  startActivity(state, activityId, player, targetPlayerId, focusCost);
  // 공개된 카드를 고르거나 주사위를 굴릴 때까지 차례가 끝나지 않는다
  if (!state.pendingPick && !state.pendingRoll) finishActivityTurn(state);
}

// 다음 차례로 넘긴다. 주문 대결에 지목당해 이미 활동을 마친 플레이어는 건너뛰고,
// 고를 수 있는 활동이 없는 플레이어는 쉬어 가며 다음 달 체력토큰 +1을 받는다
function finishActivityTurn(state: GameState): void {
  if (state.activityTurnPointer < state.activityOrder.length) state.activityTurnPointer += 1;
  while (state.activityTurnPointer < state.activityOrder.length) {
    const player = state.players[state.activityOrder[state.activityTurnPointer]];
    if (!player.hasActedThisPhase && availableActivities(state, player.id).length === 0) {
      player.hasActedThisPhase = true;
      player.pendingStaminaTokens += 1;
      log(state, `${player.name}: 고를 수 있는 구역이 없어 쉬어 갑니다 (다음 달 체력토큰 +1)`);
    }
    if (!player.hasActedThisPhase) break;
    state.activityTurnPointer += 1;
  }
  if (state.activityTurnPointer < state.activityOrder.length) return;

  // 끝까지 함께할 친구가 나타나지 않은 협력 카드는 무효가 된다 (열었던 지력토큰과 집중한 체력토큰은 돌려받지 못한다)
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
  const boost = pick.boost;
  if (cardId === null) {
    if (pick.mode === "reward" || pick.activityId === "exploration") throw new Error("공개된 카드 중 하나를 골라야 해요.");
    state.pendingPick = null;
    log(state, `${player.name}: ${ACTIVITY_NAME[pick.activityId]}의 카드를 가져가지 않고 넘어갔어요`);
    finishActivityTurn(state);
    return;
  }
  const card = offerCards(state, pick.activityId).find((c) => c.id === cardId);
  if (!card) throw new Error("공개된 카드 중에서만 고를 수 있습니다.");
  if (!canTake(player, pick.activityId, card, boost)) throw new Error("비용이 모자라서 이 카드는 가져갈 수 없어요 (매력토큰으로 대신 낼 수 있어요).");
  state.pendingPick = null;
  takeOffered(state, player, pick.activityId, card, boost);
  // 탐험 판정이나 다음 선택이 남아 있지 않으면 차례를 넘긴다
  if (!state.pendingRoll && !state.pendingPick) finishActivityTurn(state);
}

// ── 주사위 굴리기 (주문 대결·탐험 판정·시험) ──

// 주사위 굴리기 버튼: 서버가 굴려서 결과를 기록하고, 굴려야 하는 사람이 모두 굴렸으면 결과를 처리한다
export function submitRoll(state: GameState, playerId: string): void {
  const pending = state.pendingRoll;
  if (!pending) throw new Error("지금은 주사위를 굴릴 차례가 아닙니다.");
  const entry = pending.entries.find((e) => e.playerId === playerId);
  if (!entry) throw new Error("이번 굴림에 참여하지 않습니다.");
  if (entry.dice) throw new Error("이미 주사위를 굴렸습니다.");
  entry.dice = rollDice(entry.diceCount);
  if (pending.entries.every((e) => e.dice !== null)) resolveRoll(state);
}

function resolveRoll(state: GameState): void {
  const pending = state.pendingRoll;
  const ctx = state.hidden.roll;
  if (!pending || !ctx) return;
  const diceOf = (id: string) => pending.entries.find((e) => e.playerId === id)?.dice ?? [];
  state.pendingRoll = null;
  state.hidden.roll = null;
  if (ctx.kind === "duel") {
    resolveDuel(state, ctx, diceOf(ctx.challengerId)[0], diceOf(ctx.targetId)[0]);
    if (!state.pendingPick) finishActivityTurn(state);
  } else if (ctx.kind === "exploration") {
    resolveExploration(state, ctx, Object.fromEntries(ctx.playerIds.map((id) => [id, diceOf(id)[0]])));
    finishActivityTurn(state);
  } else {
    resolveExam(state, ctx.examType, ctx.card, Object.fromEntries(state.turnOrder.map((id) => [id, diceOf(id)])));
  }
}

function beginCleanupPhase(state: GameState): void {
  state.phase = "cleanup";
  state.cleanupSummary = state.turnOrder.map((id) => ({
    playerId: id,
    intelligenceTokens: state.players[id].intelligenceTokens,
    staminaTokens: state.players[id].staminaTokens,
    charmTokens: state.players[id].charmTokens,
    spellbookTokens: state.players[id].spellbookTokens,
  }));
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    player.intelligenceTokens = 0;
    player.staminaTokens = 0;
    player.charmTokens = 0;
    player.spellbookTokens = 0;
    player.hasActedThisPhase = false;
  }
  log(state, "4주차(정리): 남은 토큰 소멸");

  if (state.round === BALANCE.midtermRound) {
    beginExam(state, "midterm_exam");
  } else if (state.round === BALANCE.totalRounds) {
    beginExam(state, "final_exam");
  } else {
    advanceRound(state);
  }
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
      return { playerId: id, label: state.players[id].name, diceCount, dice: diceCount === 0 ? [] : null };
    }),
  };
  // 굴릴 주사위가 하나도 없으면 바로 결과를 처리한다
  if (state.pendingRoll.entries.every((e) => e.dice !== null)) resolveRoll(state);
}

function resolveExam(state: GameState, examType: "midterm_exam" | "final_exam", card: ExamCard, diceByPlayer: Record<string, number[]>): void {
  const bonusOf = Object.fromEntries(state.turnOrder.map((id) => [id, examBonus(state, id, card)]));
  const scores = new Map(state.turnOrder.map((id) => [id, sum(diceByPlayer[id] ?? []) + bonusOf[id]]));
  // 동점: 주문력 높은 쪽 → 매력 높은 쪽 → 주사위(무작위) 순으로 우선
  const ranked = state.turnOrder
    .map((id) => ({ playerId: id, score: scores.get(id) ?? 0 }))
    .sort(
      (x, y) =>
        y.score - x.score ||
        effectiveStat(state.players[y.playerId], "spellPower") - effectiveStat(state.players[x.playerId], "spellPower") ||
        compareTieBreak(state, x.playerId, y.playerId),
    );

  const result: ExamResult = { round: state.round, card, scores: [] };
  ranked.forEach((entry, index) => {
    const rank = index + 1;
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
    advanceRound(state);
  }
}

function applyTournamentFinalRewards(state: GameState): void {
  // 트랙 위치가 높은 순, 동점이면 매력 → 주사위로 순위를 갈라 1위 +2, 2위 +1 (트랙 0칸은 제외)
  const ranked = [...state.turnOrder].sort(
    (a, b) =>
      state.players[b].tournamentTrack - state.players[a].tournamentTrack || compareTieBreak(state, a, b),
  );
  const rewards = BALANCE.tournamentRewards;
  ranked.slice(0, rewards.length).forEach((playerId, index) => {
    const player = state.players[playerId];
    if (player.tournamentTrack <= 0) return;
    player.credit += rewards[index];
    log(state, `${player.name}: 마법 토너먼트 ${index + 1}위 보상 학점 +${rewards[index]}`);
  });
}

function finalizeGame(state: GameState): void {
  state.phase = "ended";
  const achievements = state.turnOrder.map((id) => ({
    playerId: id,
    achievement: effectiveStat(state.players[id], "spellPower") * state.players[id].credit,
  }));
  // 성취도 동점이면 매력 → 주사위 순으로 단독 승자 결정
  achievements.sort(
    (a, b) => b.achievement - a.achievement || compareTieBreak(state, a.playerId, b.playerId),
  );
  state.winnerIds = [achievements[0].playerId];
  log(state, "게임 종료: 마법 성취도(주문력 × 학점) 최고 플레이어 승리");
}
