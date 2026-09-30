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
  type LabCard,
  type StatKey,
  type ExamCard,
  type ExamResult,
  type GameState,
  type PlayerGameState,
  type RollContext,
} from "./types.js";

const ACTIVITY_IDS: ActivityId[] = ["tournament", "creature", "duel", "exploration", "lab"];

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

// 아직 열 수 있는 수업카드 수 (덱 + 버림 더미)
export function classCardsLeft(state: Pick<GameState, "classDeck" | "classDiscard">): number {
  return state.classDeck.length + state.classDiscard.length;
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
    offeredClassCards: [],
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
    pendingLab: null,
    pendingRoll: null,
    coopWaiting: null,
    exams: { midterm: null, final: null },
    examResults: [],
    cleanupSummary: [],
    hidden: { roll: null, coop: null, examPlan: pickExamCards() },
    labPile: createLabPile(),
    explorationPile: createExplorationPile(),
    grimoirePile: createGrimoirePile(),
    classDeck: createClassDeck(randomUUID),
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

function beginClassPhase(state: GameState): void {
  state.phase = "class";
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    player.offeredClassCards = [];
    player.hasActedThisPhase = false;
  }
  log(state, "2주차(정규수업): 지력토큰으로 수업카드를 열고 체력토큰으로 습득");
}

function allPlayersActed(state: GameState): boolean {
  return state.turnOrder.every((id) => state.players[id].hasActedThisPhase);
}

// 2주차: 지력토큰을 내고 수업카드를 덱에서 1장 연다 (열린 카드는 본인만 볼 수 있고, 카드마다 습득 비용이 다르다)
export function openClassCard(state: GameState, playerId: string): void {
  if (state.phase !== "class") throw new Error("지금은 정규수업 단계가 아닙니다.");
  const player = state.players[playerId];
  if (!player) throw new Error("플레이어를 찾을 수 없습니다.");
  if (player.hasActedThisPhase) throw new Error("이미 수업 카드를 선택했습니다.");
  const cost = BALANCE.openCardCost;
  if (!canPay(player, cost, 0)) throw new Error(`지력토큰이 부족합니다 (카드를 열려면 지력토큰 ${cost}개가 필요, 매력토큰으로 대신 낼 수 있어요).`);
  const card = drawClassCard(state);
  if (!card) throw new Error("더 열 수 있는 수업카드가 없습니다.");
  pay(player, "intelligence", cost);
  player.offeredClassCards.push(card);
}

export function submitClassChoice(state: GameState, playerId: string, keepCardIds: string[]): void {
  if (state.phase !== "class") throw new Error("지금은 정규수업 단계가 아닙니다.");
  const player = state.players[playerId];
  if (!player) throw new Error("플레이어를 찾을 수 없습니다.");
  if (player.hasActedThisPhase) throw new Error("이미 수업 카드를 선택했습니다.");

  const offeredIds = new Set(player.offeredClassCards.map((c) => c.id));
  const uniqueKeepIds = [...new Set(keepCardIds)];
  if (!uniqueKeepIds.every((id) => offeredIds.has(id))) {
    throw new Error("열어 본 수업카드 중에서만 선택할 수 있습니다.");
  }
  const keptCards = player.offeredClassCards.filter((c) => uniqueKeepIds.includes(c.id));
  const cost = sum(keptCards.map((c) => c.takeCost));
  if (!canPay(player, 0, cost)) {
    throw new Error(`체력토큰이 부족합니다 (선택한 카드에 체력토큰 ${cost}개 필요, 매력토큰으로 대신 낼 수 있어요).`);
  }

  for (const card of keptCards) {
    player[card.statBoost.stat] += card.statBoost.amount;
    player.classCards.push(card);
  }
  pay(player, "stamina", cost);
  // 고르지 않은 카드는 버림 더미로
  state.classDiscard.push(...player.offeredClassCards.filter((c) => !uniqueKeepIds.includes(c.id)));
  player.offeredClassCards = [];
  player.hasActedThisPhase = true;
  log(state, `${player.name}: 수업카드 ${keptCards.length}장 습득`);

  if (allPlayersActed(state)) {
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
  state.pendingLab = null;
  state.pendingRoll = null;
  state.coopWaiting = null;
  state.hidden = { ...state.hidden, roll: null, coop: null }; // 시험 카드 계획(examPlan)은 게임 내내 유지
  for (const playerId of state.turnOrder) {
    state.players[playerId].hasActedThisPhase = false;
  }
  log(state, `3주차(자율활동) 시작 — 매력 순서: ${state.activityOrder.map((id) => state.players[id].name).join(" → ")}`);
}

// ── 자율활동: 구역 선택 규칙 ──

export type ActivityView = Pick<GameState, "activitySlots" | "players" | "turnOrder" | "coopWaiting">;

// 카드를 여는 활동에서 내야 하는 지력토큰 (마법생물 조련·비밀의 방 탐색·연구실 실험은 카드를 1장 이상 열고, 주문 대결은 이긴 쪽이 받을 마도서 카드를 도전자가 연다)
// 단, 이미 열려 있는 협력 탐험 카드에 합류할 때는 새 카드를 열지 않으므로 내지 않는다
export function activityOpenCost(state: Pick<GameState, "coopWaiting">, activityId: ActivityId): number {
  if (activityId === "creature" || activityId === "lab" || activityId === "duel") return BALANCE.openCardCost;
  if (activityId === "exploration") return state.coopWaiting ? 0 : BALANCE.openCardCost;
  return 0;
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
  const grimoire = drawFromPile(state.grimoirePile);
  if (grimoire) {
    winner.grimoires.push(grimoire);
    winner[grimoire.statBoost.stat] += grimoire.statBoost.amount;
  }
  // 강제로 지목당한 쪽은 져도 마법 주문서를 잃지 않는다
  if (loser !== target && loser.spellbookTokens > 0 && sumEffect(loserAbilities, "immune") === 0) {
    loser.spellbookTokens = Math.max(0, loser.spellbookTokens - BALANCE.duelLoserTokenLoss);
  }
  const rollText = (die: number, boost: number, spell: number, bonus: number, total: number) =>
    `${describeRoll([die], [["집중", boost], ["주문력", spell], ["능력", bonus]])} = ${total}`;
  log(
    state,
    `${player.name}(${rollText(challengerDie, ctx.challengerBoost, challengerSpell, challengerBonus, challengerRoll)})이(가) ${target.name}(${rollText(defenderDie, ctx.defenderBoost, defenderSpell, defenderBonus, defenderRoll)})을(를) 지목! ${winner.name} 승리${grimoire ? `, 마도서 "${grimoire.name}" 획득` : ""}${fee > 0 ? ` — ${player.name}이(가) ${target.name}에게 매력 ${fee}을 건넸어요` : ""}`,
  );
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

function startExploration(state: GameState, player: PlayerGameState, boost: number): void {
  // 함께할 친구를 기다리는 협력 카드가 있으면 그 카드에 합류한다
  const hold = state.hidden.coop;
  if (hold) {
    state.hidden.coop = null;
    state.coopWaiting = null;
    startExplorationRoll(state, hold.card, [hold.playerId, player.id], { [hold.playerId]: hold.boost, [player.id]: boost }, "pair");
    return;
  }
  // 협력 카드는 합류할 자리가 남아 있을 때만 열린다: 구역이 이미 가득 찼다면(두 번째 참가자) 아무도 합류할 수 없으니 다시 뽑는다
  const canJoin = state.activitySlots.exploration.length < BALANCE.activityMaxParticipants;
  const skipped: ExplorationCard[] = [];
  let card = drawFromPile(state.explorationPile);
  while (card?.coop && !canJoin) {
    skipped.push(card);
    card = drawFromPile(state.explorationPile);
  }
  state.explorationPile.discard.push(...skipped);
  // 이 카드(또는 건너뛴 카드)를 엿보고 있던 플레이어의 정보는 낡은 것이 된다
  const usedIds = new Set([...skipped, ...(card ? [card] : [])].map((c) => c.id));
  for (const p of Object.values(state.players)) if (p.peekedExploration && usedIds.has(p.peekedExploration.id)) p.peekedExploration = null;
  if (!card) return;
  if (card.coop) {
    // 협력 카드: 함께할 친구가 나타날 때까지 기다린다 (끝까지 없으면 3주차 마지막에 무효)
    state.hidden.coop = { card, playerId: player.id, boost };
    state.coopWaiting = describeCoop(card, player.id);
    log(state, `${player.name}: 비밀의 방에서 협력 카드 "${card.name}"를 발견! 함께할 친구를 기다려요`);
    return;
  }
  startExplorationRoll(state, card, [player.id], { [player.id]: boost }, "single");
}

function startActivity(state: GameState, activityId: ActivityId, player: PlayerGameState, targetPlayerId: string | undefined, boost: number): void {
  switch (activityId) {
    case "tournament": {
      const gain = effectiveStat(player, "spellPower") + boost;
      player.tournamentTrack += gain;
      log(state, `${player.name}: 마법 토너먼트 참가 (트랙 ${player.tournamentTrack}칸)`);
      break;
    }
    case "creature": {
      const card = drawCreature(state);
      if (!card) {
        log(state, `${player.name}: 마법생물 덱이 비어 있습니다`);
        break;
      }
      // 체력토큰으로 집중하면 필요한 마법 주문서가 줄어든다 (최소 1개)
      const cost = Math.max(1, card.requiredSpellPower - boost);
      if (player.spellbookTokens >= cost) {
        player.spellbookTokens -= cost;
        const creditBefore = creatureCollectionCredit(player.creatures);
        player.creatures.push(card);
        const gain = card.ability.trigger === "acquire" && card.ability.effect === "spellPower" ? card.ability.amount : 0;
        player.spellPower += gain;
        // 유형 모으기 보너스: 새 카드로 늘어난 유형 점수만큼 학점을 즉시 받는다
        const collectionCredit = creatureCollectionCredit(player.creatures) - creditBefore;
        player.credit += collectionCredit;
        log(
          state,
          `${player.name}: 마법생물 "${card.name}" 획득 (${describeAbility(card.ability)})${collectionCredit > 0 ? ` — 유형 모으기 보너스 학점 +${collectionCredit}` : ""}`,
        );
      } else {
        state.creatureDiscard.push(card);
        log(state, `${player.name}: "${card.name}"(요구 주문서 ${card.requiredSpellPower}개)를 데려오지 못했습니다`);
      }
      break;
    }
    case "duel":
      startDuel(state, player, targetPlayerId, boost);
      break;
    case "exploration":
      startExploration(state, player, boost);
      break;
    case "lab": {
      // 지력만큼 연구 카드를 펼치고(체력토큰으로 집중하면 1장 더), 그중 1장을 직접 고른다 (chooseLabCard).
      // 카드를 한 장 열 때마다 지력토큰이 들기 때문에 지력토큰이 모자라면 그만큼만 펼친다 (최소 1장)
      const candidates: LabCard[] = [];
      const wanted = Math.max(1, Math.min(BALANCE.labMaxCandidates, effectiveStat(player, "intelligence"))) + boost;
      const count = Math.max(1, Math.min(wanted, Math.floor((player.intelligenceTokens + Math.floor(player.charmTokens / charmRate(player))) / BALANCE.openCardCost)));
      for (let i = 0; i < count; i++) {
        const drawn = drawFromPile(state.labPile);
        if (!drawn) break;
        candidates.push(drawn);
      }
      if (candidates.length === 0) break;
      pay(player, "intelligence", candidates.length * BALANCE.openCardCost);
      state.pendingLab = { playerId: player.id, cards: candidates };
      log(state, `${player.name}: 연구실 실험 — 연구 카드 ${candidates.length}장을 펼쳤어요 (지력토큰 ${candidates.length * BALANCE.openCardCost}개)`);
      break;
    }
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
  if (state.pendingLab) throw new Error("연구 카드를 먼저 골라야 합니다.");
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
  // 마법생물 조련·비밀의 방 탐색은 카드를 1장 열 때 지력토큰을 낸다 (연구실은 펼치는 장수만큼 startActivity에서 낸다)
  if (activityId !== "lab") pay(player, "intelligence", activityOpenCost(state, activityId));
  state.activitySlots[activityId].push(playerId);
  player.hasActedThisPhase = true;
  startActivity(state, activityId, player, targetPlayerId, focusCost);
  // 연구 카드를 고르거나 주사위를 굴릴 때까지 차례가 끝나지 않는다
  if (!state.pendingLab && !state.pendingRoll) finishActivityTurn(state);
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
  beginCleanupPhase(state);
}

// 연구실 실험: 펼쳐진 연구 카드 중 1장을 골라(체력토큰 cost개) 효과를 받는다. cardId가 null이면 아무것도 고르지 않고 넘어간다
export function chooseLabCard(state: GameState, playerId: string, cardId: string | null): void {
  const pending = state.pendingLab;
  if (!pending || pending.playerId !== playerId) throw new Error("지금은 연구 카드를 고를 수 없습니다.");
  const player = state.players[playerId];
  if (cardId === null) {
    state.labPile.discard.push(...pending.cards);
    state.pendingLab = null;
    log(state, `${player.name}: 연구 카드를 고르지 않고 넘어갔어요`);
    finishActivityTurn(state);
    return;
  }
  const card = pending.cards.find((c) => c.id === cardId);
  if (!card) throw new Error("펼쳐진 연구 카드 중에서만 고를 수 있습니다.");
  if (!canPay(player, 0, card.cost)) throw new Error(`체력토큰이 부족합니다 (이 카드는 체력토큰 ${card.cost}개가 필요, 매력토큰으로 대신 낼 수 있어요).`);
  pay(player, "stamina", card.cost);
  applyCardEffect(state, player, card.effect);
  // 시험 카드는 다음 시험까지 보관하고, 나머지는 효과를 받는 즉시 버림 더미로
  const rest = pending.cards.filter((c) => c.id !== card.id);
  state.labPile.discard.push(...rest);
  if (card.kind === "exam") player.equipment.push(card);
  else state.labPile.discard.push(card);
  state.pendingLab = null;
  log(state, `${player.name}: 연구 카드 "${card.name}" 선택 (${card.summary}${card.cost > 0 ? `, 체력토큰 ${card.cost}개` : ""})`);
  finishActivityTurn(state);
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
    finishActivityTurn(state);
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
