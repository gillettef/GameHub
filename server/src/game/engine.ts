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
import { eventTemplates, examWeekCard, noticeCard, quietMonthCard } from "./newsCards.js";
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
  type GraduationAward,
  type AwardCategory,
  type KeptToken,
  type NewsCard,
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

// 주사위 한 개 굴리기: BALANCE.dieFaces의 여섯 면 중 하나 (46절)
function rollD6(): number {
  const faces = BALANCE.dieFaces;
  return faces[Math.floor(Math.random() * faces.length)];
}
// 주사위 한 개의 평균·분산 (판정 목표값과 봇의 확률 계산에 쓴다)
export const dieMean = () => BALANCE.dieFaces.reduce((a, b) => a + b, 0) / BALANCE.dieFaces.length;
const dieVariance = () => BALANCE.dieFaces.reduce((a, f) => a + (f - dieMean()) ** 2, 0) / BALANCE.dieFaces.length;

function rollDice(count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, rollD6);
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// 판정 목표값: 주사위 평균(3.5) × 그 달의 기준 능력치 × 난이도. 기준 능력치는 라운드가 갈수록 오른다 (성장이 기준보다 앞서면 쉬워진다)
export function benchmarkStat(round: number): number {
  return BALANCE.rollBenchmarkStart + BALANCE.rollBenchmarkPerRound * (round - 1);
}
export function rollTarget(round: number, difficulty: number): number {
  return Math.max(1, Math.round(dieMean() * benchmarkStat(round) * difficulty));
}
// 탐험 카드의 target은 난이도 × 10, 협력 카드의 pairTarget은 난이도 × 18 (둘이 굴리므로 목표값은 2배)
const exploreTarget = (round: number, target: number) => rollTarget(round, (target / 10) * BALANCE.exploreDifficultyScale);
const coopTarget = (round: number, pairTarget: number) => 2 * rollTarget(round, (pairTarget / 18) * BALANCE.exploreDifficultyScale);
export const labTargetValue = () => BALANCE.labTarget;

// ── 주사위 재료 기운 (39절): 활동마다 주 능력치의 기운을 골라 낸 만큼 주사위를 굴린다 (BALANCE.rollFuel).
// 조련=매력기운, 탐험=체력기운, 연구실=지력기운, 토너먼트·주문 대결=마나기운. 다시 굴리기는 언제나 마나기운이다 ──
export const TOKEN_NAME: Record<KeptToken, string> = { intelligence: "지력기운", stamina: "체력기운", charm: "매력기운", mana: "마나기운" };
const TOKEN_FIELD = { intelligence: "intelligenceTokens", stamina: "staminaTokens", charm: "charmTokens", mana: "manaTokens" } as const;
export const tokensOf = (p: Pick<PlayerGameState, (typeof TOKEN_FIELD)[KeptToken]>, kind: KeptToken): number => p[TOKEN_FIELD[kind]];
// 기운의 종류와 그 기운의 최대치가 되는 능력치 (주문력의 기운이 마나)
export const ENERGY_KINDS: KeptToken[] = ["intelligence", "stamina", "charm", "mana"];
export const ENERGY_STAT: Record<KeptToken, StatKey> = { intelligence: "intelligence", stamina: "stamina", charm: "charm", mana: "spellPower" };
// 모아 둘 수 있는 한도 (능력치 × 배수, 배수가 0이면 한도 없음)
export const energyCap = (player: PlayerGameState, kind: KeptToken): number =>
  BALANCE.energyCapMultiplier > 0 ? effectiveStat(player, ENERGY_STAT[kind]) * BALANCE.energyCapMultiplier : Infinity;
// 한 번 굴릴 때 낼 수 있는 재료 기운의 상한 = 그 기운의 능력치 ("실력만큼만 힘을 낸다", 43-5절). 능력치가 0이어도 1개는 낼 수 있다
export const rollLimit = (player: PlayerGameState, kind: KeptToken): number =>
  BALANCE.rollLimitByStat ? Math.max(1, effectiveStat(player, ENERGY_STAT[kind]) + BALANCE.rollLimitBonus) : Infinity;
// 이번 굴림에 실제로 낼 수 있는 재료 기운 개수 (보유량과 실력 상한 중 작은 쪽)
export const usableFuel = (player: PlayerGameState, kind: KeptToken): number => Math.min(tokensOf(player, kind), rollLimit(player, kind));
// 시험 카드의 주 능력치가 주사위 재료다 (주문력은 마나기운)
export const examFuel = (card: Pick<ExamCard, "diceStat">): KeptToken => (card.diceStat === "spellPower" ? "mana" : card.diceStat);
// 마법생물 조련: 매력기운을 1~보유 개수 사이에서 골라 내고 낸 개수만큼 주사위를 굴려, 합이 생물마다 정해진 기준 수치(trainTarget × trainTargetScale) 이상이면 성공
// (매력기운이 없으면 공짜 주사위 1개). 생물의 속성·종류는 표시용이다
// (trainTarget은 1~6 주사위 기준이라 주사위 평균에 맞춰 줄인다)
export const creatureTarget = (card: Pick<CreatureCard, "trainTarget">) => Math.max(1, Math.round((card.trainTarget * BALANCE.trainTargetScale * dieMean()) / 3.5));
const ELEMENT_NAME = { sky: "하늘", land: "육지", ocean: "바다" } as const;
const creatureTagsOf = (card: Pick<CreatureCard, "element" | "kind">) => `${ELEMENT_NAME[card.element]} · ${card.kind === "animal" ? "동물" : "식물"}`;

// 주사위 n개의 합이 target 이상일 확률 (정확한 계산)
export function diceSuccessChance(n: number, target: number): number {
  const faces = BALANCE.dieFaces;
  const top = Math.max(...faces);
  if (target <= n * Math.min(...faces)) return 1;
  if (target > top * n) return 0;
  let dist = [1]; // dist[k] = 합이 k일 확률
  for (let i = 0; i < n; i++) {
    const next = new Array(dist.length + top).fill(0);
    dist.forEach((pr, k) => {
      for (const f of faces) next[k + f] += pr / faces.length;
    });
    dist = next;
  }
  return dist.slice(target).reduce((x, y) => x + y, 0);
}

// 굴림 버튼의 기본 주사위 수: 성공 확률이 defaultDiceSuccess 이상이 되는 가장 적은 개수 (그만큼 못 미치면 가진 마나기운 전부). 남는 마나기운은 다시 굴리기에 쓴다
// (기본 주사위가 있으면 기운 0개도 고를 수 있고, 굴리는 주사위는 낸 기운 + 기본 주사위다)
export function suggestDiceCount(mana: number, target: number): number {
  const base = BALANCE.baseDice;
  for (let n = base > 0 ? 0 : 1; n <= mana; n++) if (diceSuccessChance(n + base, target) >= BALANCE.defaultDiceSuccess) return n;
  return base > 0 ? mana : Math.max(1, mana);
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// 탐험 카드 성공 확률 (봇 판단용): 기본 개수만큼 체력기운을 내고 굴린 주사위 합이 목표값 이상일 확률의 정규 근사
export function explorationChance(state: GameState, player: PlayerGameState, card: ExplorationCard): number {
  if (!card.check) return 1;
  const n = suggestDiceCount(usableFuel(player, BALANCE.rollFuel.exploration), exploreTarget(state.round, card.check.target));
  const catchUp = overallGap(state, player.id) >= BALANCE.catchUpGap ? BALANCE.catchUpBonus : 0;
  const dice = n + BALANCE.baseDice;
  const mean = dieMean() * dice + catchUp;
  const sd = Math.sqrt(dice * dieVariance());
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


// 4주차(정리): 다음 달 선을 정한다 (BALANCE.starterRule). 기운이 소멸하기 전에 호출해야 한다.
// 동점이면 현재 선에서 시계방향으로 가장 가까운 사람 (rule이 "charm"이면 현재 선이 최고 매력일 때 그대로 유지)
function starterScore(state: GameState, id: string): number {
  const p = state.players[id];
  switch (BALANCE.starterRule) {
    case "charmTokens":
      return p.charmTokens;
    case "charmPlusTokens":
      return effectiveStat(p, "charm") + p.charmTokens;
    case "rotate":
      return 0;
    default:
      return effectiveStat(p, "charm");
  }
}

export function nextStarterIndex(state: GameState): number {
  const n = state.turnOrder.length;
  const scoreOf = (id: string) => starterScore(state, id);
  const best = Math.max(...state.turnOrder.map(scoreOf));
  const current = state.startingPlayerIndex;
  const rotate = BALANCE.starterRule === "rotate";
  // "charm"(기존 규칙)은 현재 선이 최고면 유지, 나머지는 동점이어도 선을 다음 사람에게 넘기는 쪽(현재 선이 가장 마지막 순번)
  if (!rotate && BALANCE.starterRule === "charm" && scoreOf(state.turnOrder[current]) === best) return current;
  for (let i = 1; i <= n; i++) {
    const index = (current + i) % n;
    if (rotate ? i === 1 : scoreOf(state.turnOrder[index]) === best) return index;
  }
  return current;
}

// 종합 점수: 영구 능력치 합 + 학점 × 3. 선두와의 격차가 크면 탐험에서 역전 보너스를 받는다
function overallScore(player: PlayerGameState): number {
  return player.intelligence + player.stamina + player.charm + player.spellPower + player.credit * 3;
}

// 선두와의 종합 점수 격차 (선두 본인은 0)
export function overallGap(state: GameState, playerId: string): number {
  const best = Math.max(...state.turnOrder.map((id) => overallScore(state.players[id])));
  return best - overallScore(state.players[playerId]);
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
const LEVEL_NAME: Record<ClassCard["level"], string> = { intro: "입문", basic: "기초", mid: "중급", advanced: "심화" };

// 탐험 카드의 판정 문구 (엿보기·협력 대기·구역 공개 카드 표시용)
function checkTextOf(card: ExplorationCard, round: number): string | undefined {
  if (card.coop) return `협력 카드 — 둘이 각자 체력기운을 내고 낸 개수만큼 주사위를 굴려 둘의 합이 ${coopTarget(round, card.coop.pairTarget)} 이상이면 성공 (혼자면 무효)`;
  if (!card.check) return undefined;
  return `판정 (체력기운 주사위 합 ${exploreTarget(round, card.check.target)} 이상)`;
}

// 탐험 카드/연구 카드 효과를 플레이어에게 적용한다
function applyCardEffect(state: GameState, player: PlayerGameState, effect: CardEffect): void {
  for (const [kind, amount] of Object.entries(effect.tokens ?? {})) player[TOKEN_FIELD[kind as KeptToken]] += amount;
  for (const [stat, amount] of Object.entries(effect.stats ?? {})) player[stat as StatKey] += amount;
  for (const [stat, amount] of Object.entries(effect.tempStats ?? {})) {
    player.tempBoosts[stat as StatKey] = (player.tempBoosts[stat as StatKey] ?? 0) + amount;
  }
  player.credit += effect.credit ?? 0;
  player.pendingManaTokens += effect.nextMana ?? 0;
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

// 성장 (42절): 자율활동에서 성과를 내면 그 활동의 주 능력치가 BALANCE.growthAmount만큼 오른다 (조련·탐험·연구실 성공, 주문 대결 승리)
function grow(state: GameState, player: PlayerGameState, activityId: ActivityId, stat: StatKey): void {
  if (!BALANCE.growthActivities[activityId]) return;
  player[stat] += BALANCE.growthAmount;
  log(state, `${player.name}: 성장! ${STAT_NAME[stat]} +${BALANCE.growthAmount}`);
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
    tempAged: {},
    equipmentAgedIds: [],
    intelligenceTokens: 0,
    staminaTokens: 0,
    charmTokens: 0,
    manaTokens: 0,
    pendingStaminaTokens: 0,
    pendingManaTokens: 0,
    peekedExploration: null,
    tournamentTrack: 0,
    awards: [],
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
    news: null,
    cramOrder: [],
    cramPointer: 0,
    exams: { midterm: null, final: null },
    examResults: [],
    hidden: { roll: null, coop: null, offers: {}, examPlan: pickExamCards(), newsDeck: shuffle(eventTemplates()) },
    labPile: createLabPile(),
    explorationPile: createExplorationPile(),
    grimoirePile: createGrimoirePile(),
    classDeck: createClassDeck(randomUUID, 1),
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

// ── 기운 지불: 지력기운·체력기운·매력기운·마나기운은 서로 바꿀 수 없다. 자율활동 구역의 두 번째 참가비는 매력기운으로만 낸다 ──

type PayKind = "intelligence" | "stamina" | "mana" | "charm";
const PAY_OBJECT: Record<PayKind, string> = { intelligence: "지력기운을", stamina: "체력기운을", mana: "마나기운을", charm: "매력기운을" };
type Payer = Pick<PlayerGameState, "intelligenceTokens" | "staminaTokens" | "charmTokens">;

// 지력기운 int개 + 체력기운 stamina개 + 매력기운 charm개를 낼 수 있는가
export const canPay = (p: Payer, int: number, stamina: number, charm = 0): boolean =>
  p.intelligenceTokens >= int && p.staminaTokens >= stamina && p.charmTokens >= charm;

function pay(p: PlayerGameState, kind: PayKind, n: number): void {
  if (kind === "intelligence") p.intelligenceTokens -= n;
  else if (kind === "stamina") p.staminaTokens -= n;
  else if (kind === "charm") p.charmTokens -= n;
  else p.manaTokens -= n;
}

// 보조 능력치 기운으로 굴림을 돕는 선택 (38-6절): 굴리기 전에 0~max개를 골라 낸다. max가 0이면 선택지가 없다
function withAssist<T extends object>(entry: T, max: number): T & { assistMax?: number } {
  return max > 0 ? { ...entry, assistMax: max } : entry;
}

// 실패 보상 (47절 2안): 카드마다 실패했을 때 받는 보상. 그 활동의 재료 기운을 돌려받고, 어려운 카드일수록 많이 받는다
export function failRewardOf(activityId: "creature" | "lab" | "exploration" | "duel", card?: OfferedCard): CardEffect {
  if (!BALANCE.failRewards) return {};
  if (activityId === "creature") return { tokens: { charm: (card as CreatureCard).trainTarget >= 16 ? 2 : 1 } };
  if (activityId === "lab") return { tokens: { intelligence: 1 } };
  if (activityId === "exploration") {
    const c = card as ExplorationCard;
    return { tokens: { stamina: (c.check?.target ?? 0) >= 10 || c.coop ? 2 : 1 } };
  }
  return { tokens: { mana: 1 } };
}
const failRewardLine = (e: CardEffect) => (Object.keys(e).length > 0 ? [`실패해도: ${describeEffect(e)}`] : []);

// 굴리기 전에 재료 기운(fuel, 기본 마나기운)을 1~낼 수 있는 개수(보유량과 능력치 중 작은 쪽) 사이에서 골라 내고 낸 개수만큼 굴리는 굴림 항목
// (재료 기운이 없으면 주사위 1개를 공짜로 굴린다). 목표값(suggestTarget)이 있는 판정은 기본 개수를 "성공 확률이 충분한 가장 적은 개수"로 잡고, 없으면 낼 수 있는 만큼 전부다
function choiceEntry(player: PlayerGameState, label: string, suggestTarget?: number, fuel: KeptToken = "mana") {
  const tokens = usableFuel(player, fuel);
  const base = BALANCE.baseDice;
  return {
    playerId: player.id,
    label,
    // 굴리기 전에는 "낼 기운 개수"의 기본값, 굴린 뒤에는 실제로 굴린 주사위 수
    diceCount: tokens > 0 ? (suggestTarget === undefined ? tokens : suggestDiceCount(tokens, suggestTarget)) : Math.max(1, base),
    diceToken: fuel,
    ...(tokens > 0 ? { diceChoiceMax: tokens } : {}),
    ...(base > 0 ? { baseDice: base } : {}),
    dice: null,
    confirmed: false,
    rerolls: 0,
  };
}

function beginRound(state: GameState): void {
  log(state, `${state.round}라운드 시작`);
  // 중간고사 다음 달부터 2학기: 1학기 수업카드 덱을 버리고 2학기 덱으로 바꾼다
  if (state.round === BALANCE.midtermRound + 1) {
    state.classDeck = createClassDeck(randomUUID, 2);
    state.classDiscard = [];
    log(state, "2학기 시작: 새 수업카드 덱으로 바뀌었어요 (주문력 카드가 더 많아져요)");
  }
  // 월 시작(42절): 매달 충전은 없다(1주차 폐지). 기운은 2주차 수업카드로만 얻고, 마법생물·카드 효과로 예약된 몫(다음 달 체력·마나 기운, 마법생물·마도서의 "매달" 효과)만 여기서 더한다
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    const prepAbilities = abilitiesOf(player, "prep");
    const extras: Record<KeptToken, number> = {
      intelligence: 0,
      stamina: player.pendingStaminaTokens + sumEffect(prepAbilities, "stamina"),
      charm: sumEffect(prepAbilities, "charmToken"),
      mana: player.pendingManaTokens + sumEffect(prepAbilities, "mana"),
    };
    player.pendingStaminaTokens = 0;
    player.pendingManaTokens = 0;
    for (const kind of ENERGY_KINDS) player[TOKEN_FIELD[kind]] = Math.max(0, tokensOf(player, kind) + extras[kind]);
  }
  // 1주차 학교 소식 (44절): 시험 달은 시험 주간, 시험 공고 달은 시험 공고, 나머지 달은 행사 덱에서 1장
  state.news = drawNews(state);
  log(state, `1주차(학교 소식): ${state.news.name} — ${state.news.description}`);
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    for (const kind of ENERGY_KINDS) player[TOKEN_FIELD[kind]] += state.news.effect.gift?.[kind] ?? 0;
  }
  // 중간고사(6개월)·기말고사(12개월) 달에는 정규수업·자율활동 없이 벼락치기 뒤 시험을 친다 (이월된 기운으로 치른다)
  if (isExamRound(state.round)) beginCramPhase(state);
  else beginClassPhase(state);
}

// 이번 달 학교 소식을 정한다 (시험 공고 달이면 그 시험의 카드를 이때 공개한다)
function drawNews(state: GameState): NewsCard {
  const plan = state.hidden.examPlan;
  if (isExamRound(state.round)) {
    const which = state.round === BALANCE.midtermRound ? "midterm" : "final";
    const fuel = examFuel(plan[which]);
    return examWeekCard(which, fuel, TOKEN_NAME[fuel]);
  }
  const notice = state.round === BALANCE.midtermNoticeRound ? "midterm" : state.round === BALANCE.finalNoticeRound ? "final" : null;
  if (notice) {
    state.exams[notice] = plan[notice];
    log(state, `${notice === "midterm" ? "중간고사" : "기말고사"} 과목 공개: "${plan[notice].name}" (${describeExam(plan[notice], STAT_NAME)})`);
    return noticeCard(notice, plan[notice].name);
  }
  if (!BALANCE.schoolNewsEvents) return quietMonthCard();
  if (state.hidden.newsDeck.length === 0) state.hidden.newsDeck = shuffle(eventTemplates());
  return state.hidden.newsDeck.shift()!;
}

// 이번 달 소식의 효과 (없으면 빈 효과)
const newsEffect = (state: Pick<GameState, "news">) => state.news?.effect ?? {};

// ── 시험 달 1주차: 벼락치기 (44절). 선부터 한 명씩, 가진 기운 1개를 시험 과목 기운 1개로 바꿀 수 있다 (안 해도 된다) ──
function beginCramPhase(state: GameState): void {
  state.phase = "cram";
  state.cramOrder = orderFromStarter(state);
  state.cramPointer = 0;
}

// 벼락치기로 바꿀 수 있는 기운 종류 (시험 과목 기운이 아닌, 1개 이상 가진 기운)
export function cramSources(state: Pick<GameState, "news">, player: PlayerGameState): KeptToken[] {
  const to = newsEffect(state).cramTo;
  if (!to) return [];
  return ENERGY_KINDS.filter((k) => k !== to && tokensOf(player, k) > 0);
}

// 벼락치기: from이 null이면 하지 않고 넘어간다
export function cramTurn(state: GameState, playerId: string, from: KeptToken | null): void {
  if (state.phase !== "cram") throw new Error("지금은 벼락치기 시간이 아닙니다.");
  if (state.cramOrder[state.cramPointer] !== playerId) throw new Error("당신의 차례가 아닙니다.");
  const player = state.players[playerId];
  const to = newsEffect(state).cramTo!;
  if (from !== null) {
    if (!cramSources(state, player).includes(from)) throw new Error("바꿀 수 없는 기운이에요.");
    player[TOKEN_FIELD[from]] -= 1;
    player[TOKEN_FIELD[to]] += 1;
    log(state, `${player.name}: 벼락치기! ${TOKEN_NAME[from]} 1개를 ${TOKEN_NAME[to]}으로 바꿨어요`);
  } else {
    log(state, `${player.name}: 벼락치기 없이 시험을 봐요`);
  }
  state.cramPointer += 1;
  if (state.cramPointer >= state.cramOrder.length) beginExam(state, state.round === BALANCE.midtermRound ? "midterm_exam" : "final_exam");
}

// 2주차(정규수업): 인원수 + 1장을 공개하고, 선 다음 사람부터 시계방향으로 선이 마지막으로 원하는 카드 1장을 (무료로) 가져가 그 과목의 기운을 얻는다
function beginClassPhase(state: GameState): void {
  state.phase = "class";
  for (const playerId of state.turnOrder) state.players[playerId].hasActedThisPhase = false;
  state.classMarket = [];
  const effect = newsEffect(state);
  const count = state.turnOrder.length + BALANCE.classMarketExtra + (effect.classExtra ?? 0);
  while (state.classMarket.length < count) {
    const card = drawClassCard(state);
    if (!card) break;
    state.classMarket.push(card);
  }
  // 시험 공고 달: 시험 과목(주 능력치) 카드를 덱에서 찾아 더 공개한다
  const examCard = state.exams.final ?? state.exams.midterm;
  for (let i = 0; i < (effect.examSubjectExtra ?? 0) && examCard; i++) {
    const at = state.classDeck.findIndex((c) => c.stat === examCard.diceStat);
    if (at >= 0) state.classMarket.push(...state.classDeck.splice(at, 1));
  }
  // 행사로 그 과목 수업이 더 알차면 공개된 카드의 기운을 올려 둔다
  if (effect.classBonus) state.classMarket = state.classMarket.map((c) => (effect.classBonus?.[c.stat] ? { ...c, gain: c.gain + effect.classBonus[c.stat]! } : c));
  // 수업 신청은 선이 마지막이다 (선은 활동을 먼저 고르는 대신)
  const fromStarter = orderFromStarter(state);
  state.classPickOrder = [...fromStarter.slice(1), fromStarter[0]];
  state.classPickPointer = 0;
  log(
    state,
    `2주차(정규수업): 수업카드 ${state.classMarket.length}장 공개 — 선 ${state.players[fromStarter[0]].name}은 마지막: ${state.classPickOrder.map((id) => state.players[id].name).join(" → ")}`,
  );
}

// 아직 열 수 있는 수업카드 수 (덱 + 버림 더미)
export function classCardsLeft(state: Pick<GameState, "classDeck" | "classDiscard">): number {
  return state.classDeck.length + state.classDiscard.length;
}

// 수업카드가 주는 기운의 종류 (주문력 과목은 마나기운)
export const classGainKind = (card: Pick<ClassCard, "stat">): KeptToken => (card.stat === "spellPower" ? "mana" : card.stat);
// 중급·심화 과목은 그 과목 능력치가 minStat 이상이어야 들을 수 있다 (선수과목)
export const canTakeClassCard = (player: PlayerGameState, card: Pick<ClassCard, "stat" | "minStat">): boolean =>
  card.minStat === undefined || effectiveStat(player, card.stat) >= card.minStat;
// 이 카드를 가져가면 실제로 늘어나는 기운 (한도 = 능력치 × energyCapMultiplier까지)
export function classGainApplied(player: PlayerGameState, card: Pick<ClassCard, "stat" | "gain">): number {
  const kind = classGainKind(card);
  const room = Math.max(0, energyCap(player, kind) - tokensOf(player, kind));
  return Math.min(card.gain, room);
}

// 2주차: 내 차례에 공개된 수업카드 중 1장을 가져간다 (무료, 그 과목의 기운을 얻는다). cardId가 null이면 가져가지 않고 넘어간다
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
    if (!canTakeClassCard(player, card)) {
      throw new Error(`${LEVEL_NAME[card.level]} 과목이라 ${STAT_NAME[card.stat]} ${card.minStat} 이상이어야 들을 수 있어요 (지금 ${effectiveStat(player, card.stat)}).`);
    }
    const kind = classGainKind(card);
    const applied = classGainApplied(player, card);
    player[TOKEN_FIELD[kind]] += applied;
    player.classCards.push(card);
    state.classMarket = state.classMarket.filter((c) => c.id !== cardId);
    log(
      state,
      `${player.name}: 수업카드 "${card.name}" 수강 (${TOKEN_NAME[kind]} +${applied}${applied < card.gain ? `, 한도 ${energyCap(player, kind)}를 넘는 ${card.gain - applied}은 사라졌어요` : ""})`,
    );
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

// 구역에 처음 들어와 카드를 여는 사람이 내는 지력기운 (BALANCE.openCardCostActivities의 활동: 마법생물·주문 대결·비밀의 방·연구실. 마법 토너먼트는 카드가 없다).
// 이미 다른 친구가 고른 구역이면(두 번째 참가자) 새로 열 필요가 없으니 내지 않는다
export function activityOpenCost(state: Pick<GameState, "activitySlots">, activityId: ActivityId): number {
  if (!BALANCE.openCardCostActivities.includes(activityId)) return 0;
  return state.activitySlots[activityId].length > 0 ? 0 : BALANCE.openCardCost;
}

// 이미 다른 플레이어가 있는 구역에 들어갈 때 내야 하는 매력기운
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
  if (!canPay(player, 0, 0, extra)) return `이미 참여한 친구가 있어서 매력기운 ${extra}개가 더 필요해요.`;
  const open = activityOpenCost(state, activityId);
  if (!canPay(player, open, 0, extra)) return `카드를 열 지력기운 ${open}개가 필요해요 (먼저 들어오면 카드를 여는 사람이 지력기운을 내요).`;
  if (activityId === "tournament" && player.manaTokens < 1) return "마나기운이 1개 이상 필요해요 (낸 마나기운만큼 주사위를 굴려요).";
  if (activityId === "duel") {
    const need = 1 + BALANCE.duelManaFee;
    if (player.manaTokens < need) return `마나기운이 ${need}개 이상 필요해요 (${BALANCE.duelManaFee}개는 지목당한 친구에게 건네고, 낸 마나기운만큼 주사위를 굴려요).`;
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

// 마법 토너먼트: 가진 마나기운을 모두 내고, 낸 개수만큼 주사위를 굴려 합친 칸만큼 트랙을 전진한다
function startTournament(state: GameState, player: PlayerGameState): void {
  if (player.manaTokens === 0) {
    advanceTournament(state, player, []);
    return;
  }
  state.hidden.roll = { kind: "tournament", playerId: player.id };
  state.pendingRoll = {
    kind: "tournament",
    title: `마법 토너먼트 · ${player.name}`,
    lines: [`마나기운을 1~${usableFuel(player, "mana")}개 골라 내고(한 번에 주문력만큼), 낸 개수만큼 주사위를 굴려요. 나온 눈을 모두 더한 만큼 트랙을 전진해요`],
    // 보조 능력치(체력=지구력): 체력기운을 내면 "끝까지 달려요" — 1개당 고정 칸을 더 전진한다 (주사위가 아니라 고정값)
    assist: { kind: "stamina", name: "체력기운", title: "끝까지 달려요", hint: `체력기운 1개당 +${BALANCE.tournamentStaminaBoost}칸 더 전진해요 (지구력)` },
    entries: [withAssist(choiceEntry(player, player.name), player.staminaTokens)],
  };
}

// 굴림 안내 문구: 재료 기운을 골라 내고 낸 개수만큼 굴린다. 재료 기운이 없으면 공짜 주사위 1개. 다시 굴리기는 마나기운으로 한다
function fuelLine(player: PlayerGameState, fuel: KeptToken): string {
  const tokens = usableFuel(player, fuel);
  const limited = tokens < tokensOf(player, fuel) ? ` (한 번에 ${STAT_NAME[ENERGY_STAT[fuel]]}만큼만 낼 수 있어요)` : "";
  return tokens > 0
    ? `${PAY_OBJECT[fuel]} 1~${tokens}개 골라 내고, 낸 개수만큼 주사위를 굴려요${limited} (다시 굴리기는 마나기운으로 해요)`
    : `${TOKEN_NAME[fuel]}이 없어서 주사위 1개를 굴려요`;
}

// 함께하면 든든 (43-6절): 마법생물·연구실 구역에 두 명이 함께 들어왔으면 둘 다 목표값이 BALANCE.studyBuddyBonus만큼 낮아진다
const hasBuddy = (state: GameState, activityId: "creature" | "lab") => state.activitySlots[activityId].length >= 2;
const buddyBonus = (state: GameState) => BALANCE.studyBuddyBonus + (newsEffect(state).buddyExtra ?? 0);
// 판정 목표값 = 기본값 + 이달의 소식 조정 − 함께하면 든든 (최소 1)
const buddyTarget = (state: GameState, activityId: "creature" | "lab", target: number) =>
  Math.max(1, target + (newsEffect(state).targetMod?.[activityId] ?? 0) - (hasBuddy(state, activityId) ? buddyBonus(state) : 0));
const buddyNote = (state: GameState, activityId: "creature" | "lab") => {
  const mod = newsEffect(state).targetMod?.[activityId] ?? 0;
  const news = mod !== 0 ? ` · ${state.news!.name} 목표 ${mod > 0 ? "+" : "-"}${Math.abs(mod)}` : "";
  return news + (hasBuddy(state, activityId) && buddyBonus(state) > 0 ? ` · 친구와 함께라 목표 -${buddyBonus(state)}` : "");
};

// 마법생물 조련: 매력기운을 골라 내고 낸 개수만큼 주사위를 굴려, 합이 목표값 이상이면 조련에 성공한다. 실패하면 낸 매력기운만 잃고 카드는 구역에 돌아간다
function startCreatureRoll(state: GameState, player: PlayerGameState, creature: CreatureCard): void {
  const target = buddyTarget(state, "creature", creatureTarget(creature));
  const fuel = BALANCE.rollFuel.creature;
  state.hidden.roll = { kind: "creature", playerId: player.id, card: creature, target };
  state.pendingRoll = {
    kind: "creature",
    title: `마법생물 조련 · ${creature.name}`,
    lines: [fuelLine(player, fuel), `주사위 합이 ${target} 이상이면 조련 성공! 실패하면 카드는 돌아가요${buddyNote(state, "creature")}`],
    entries: [choiceEntry(player, player.name, target, fuel)],
  };
}

function resolveCreature(state: GameState, ctx: Extract<RollContext, { kind: "creature" }>, dice: number[]): void {
  const player = state.players[ctx.playerId];
  const creature = ctx.card;
  const total = sum(dice);
  const success = total >= ctx.target;
  const text = `${describeRoll(dice, [])} = ${total} / 목표 ${ctx.target} ${success ? "성공" : "실패"}`;
  if (success) {
    player.creatures.push(creature);
    if (creature.ability.trigger === "acquire" && creature.ability.effect === "spellPower") player.spellPower += creature.ability.amount;
    log(state, `${player.name}: 마법생물 "${creature.name}" 조련 성공! (${text}) ${describeAbility(creature.ability)}`);
    grow(state, player, "creature", "charm");
  } else {
    // 실패한 카드는 구역으로 돌아가 두 번째 참가자가 도전할 수 있다 (아무도 가져가지 않으면 3주차 끝에 버림 더미로)
    state.hidden.offers.creature = [...offerCards(state, "creature"), creature];
    syncOfferView(state, "creature");
    const reward = failRewardOf("creature", creature);
    applyCardEffect(state, player, reward);
    log(state, `${player.name}: 마법생물 "${creature.name}" 조련 실패... (${text})${Object.keys(reward).length ? ` 실패해도 ${describeEffect(reward)}` : ""}`);
  }
}

// 연구실 실험: 카드를 보고 지력기운을 몇 개 낼지 골라(굴릴 때 낸다) 낸 개수만큼 주사위를 굴려, 합이 목표값 이상이면 실험 성공 (카드 효과를 받는다)
// 지력기운이 없으면 주사위 1개는 공짜로 굴린다
function startLabRoll(state: GameState, player: PlayerGameState, lab: LabCard): void {
  const target = buddyTarget(state, "lab", labTargetValue());
  const fuel = BALANCE.rollFuel.lab;
  state.hidden.roll = { kind: "lab", playerId: player.id, card: lab, target };
  state.pendingRoll = {
    kind: "lab",
    title: `연구실 실험 · ${lab.name}`,
    lines: [fuelLine(player, fuel), `주사위 합이 ${target} 이상이면 실험 성공! (${lab.summary})${buddyNote(state, "lab")}`],
    entries: [choiceEntry(player, player.name, target, fuel)],
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
    grow(state, player, "lab", "intelligence");
  } else {
    state.labPile.discard.push(lab);
    const reward = failRewardOf("lab", lab);
    applyCardEffect(state, player, reward);
    log(state, `${player.name}: 연구 카드 "${lab.name}" 실험 실패... (${text})${Object.keys(reward).length ? ` 실패해도 ${describeEffect(reward)}` : ""}`);
  }
}

function advanceTournament(state: GameState, player: PlayerGameState, dice: number[], assist = 0): void {
  const boost = assist * BALANCE.tournamentStaminaBoost;
  const cheer = newsEffect(state).tournamentBonus ?? 0;
  const gain = sum(dice) + boost + cheer;
  const before = player.tournamentTrack;
  player.tournamentTrack += gain;
  const step = BALANCE.tournamentMilestoneStep;
  const milestones = step > 0 ? Math.floor(player.tournamentTrack / step) - Math.floor(before / step) : 0;
  const milestoneCredit = milestones * BALANCE.tournamentMilestoneCredit;
  player.credit += milestoneCredit;
  log(
    state,
    `${player.name}: 마법 토너먼트 참가 (${describeRoll(dice, [[`끝까지 달려요(체력기운 ${assist}개)`, boost], [state.news?.name ?? "", cheer]])} = ${gain}칸 전진, 트랙 ${player.tournamentTrack}칸)${milestoneCredit > 0 ? ` — 이정표 학점 +${milestoneCredit}` : ""}`,
  );
  // 토너먼트 참가는 성장이 없다 (BALANCE.growthActivities.tournament = false: 켜면 토너먼트 몰빵 승률이 44%까지 올랐다)
  grow(state, player, "tournament", "spellPower");
}

function startDuel(state: GameState, player: PlayerGameState, target: PlayerGameState): void {
  state.hidden.roll = { kind: "duel", challengerId: player.id, targetId: target.id };
  // 도전자는 지목당한 친구에게 마나기운 1개를 건네고(매력 참가비와 별도), 양쪽 모두 마나기운을 1~보유 개수 사이에서 골라 내고 낸 개수만큼 굴린다
  const gift = Math.min(BALANCE.duelManaFee, player.manaTokens);
  player.manaTokens -= gift;
  target.manaTokens += gift;
  if (gift > 0) log(state, `${player.name}: ${target.name}님에게 마나기운 ${gift}개를 건넸어요`);
  state.pendingRoll = {
    kind: "duel",
    title: `주문 대결 · ${player.name} vs ${target.name}`,
    lines: [
      `${player.name}님이 ${target.name}님을 지목했어요 (도전자가 마나기운 ${BALANCE.duelManaFee}개를 건넸어요)`,
      `각자 마나기운을 골라 내고 낸 개수만큼 주사위를 굴려 합이 큰 쪽이 이겨요. 같으면 무승부예요. 도전자는 지목당한 친구에게 매력 ${BALANCE.duelCharmFee}을 건네요`,
    ],
    entries: [
      choiceEntry(player, `${player.name} (도전자)`),
      choiceEntry(target, `${target.name} (지목당함)`),
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
  // 체력기운 효과는 다음 달 준비 때 반영
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
  // 낸 마나기운은 이미 사라졌다. 방어 능력(immune)이 있으면 졌어도 마나기운 1개를 다음 달 준비 때 돌려받는다
  if (sumEffect(loserAbilities, "immune") > 0) loser.pendingManaTokens += 1;
  applyCardEffect(state, loser, failRewardOf("duel"));
  log(
    state,
    `${player.name}(${rollText(challengerDice, challengerBonus, challengerRoll)})이(가) ${target.name}(${rollText(defenderDice, defenderBonus, defenderRoll)})을(를) 지목! ${winner.name} 승리${feeText}`,
  );
  // 이긴 사람은 주문력이 오른다 (성장)
  grow(state, winner, "duel", "spellPower");
  const winCredit = newsEffect(state).duelWinCredit ?? 0;
  if (winCredit > 0) {
    winner.credit += winCredit;
    log(state, `${winner.name}: ${state.news!.name} 우승 보너스 학점 +${winCredit}`);
  }
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
  const base = explorationRule(card, mode, state.round);
  if (!base) {
    resolveExploration(state, { kind: "exploration", card, playerIds, mode, target: 0 }, {});
    return;
  }
  // 이달의 소식(봄 소풍·장마철 등)이 탐험 목표값을 바꾼다
  const rule = { ...base, target: Math.max(1, base.target + (newsEffect(state).targetMod?.exploration ?? 0)) };
  state.hidden.roll = { kind: "exploration", card, playerIds, mode, target: rule.target };
  state.pendingRoll = {
    kind: "exploration",
    title: `비밀의 방 · ${card.name}`,
    lines: [
      card.description,
      mode === "pair"
        ? `각자 체력기운을 내고 낸 개수만큼 주사위를 굴려 둘의 합이 ${rule.target} 이상이면 성공! 보상은 둘 다 받아요 (체력기운이 없으면 공짜 주사위 1개)`
        : `${fuelLine(state.players[playerIds[0]], BALANCE.rollFuel.exploration)} 합이 ${rule.target} 이상이면 성공`,
    ],
    // 보조 능력치(지력=함정 간파): 지력기운을 내고 굴리면 실패해도 손해가 없다
    assist: { kind: "intelligence", name: "지력기운", title: "함정 간파", hint: `지력기운 ${BALANCE.explorationShieldCost}개를 내면 실패해도 손해를 받지 않아요 (성공하면 낸 기운은 그냥 사라져요)` },
    // 주사위 수는 체력기운을 1~보유 개수 사이에서 골라 굴릴 때 낸다 (체력기운이 없어도 1개는 공짜로 굴린다)
    entries: playerIds.map((id) => {
      const p = state.players[id];
      const entry = choiceEntry(p, p.name, mode === "pair" ? Math.ceil(rule.target / 2) : rule.target, BALANCE.rollFuel.exploration);
      return withAssist(entry, p.intelligenceTokens >= BALANCE.explorationShieldCost ? 1 : 0);
    }),
  };
}

// 탐험 카드의 판정 규칙: 협력 카드는 두 명의 합, 일반 카드는 혼자 판정. 목표값은 라운드에 맞춰 계산한다. 판정이 없는 카드는 null
function explorationRule(card: ExplorationCard, mode: "single" | "pair", round: number): { stat: StatKey; target: number } | null {
  if (mode === "pair" && card.coop) return { stat: card.coop.stat, target: coopTarget(round, card.coop.pairTarget) };
  return card.check ? { stat: card.check.stat, target: exploreTarget(round, card.check.target) } : null;
}

function resolveExploration(state: GameState, ctx: Extract<RollContext, { kind: "exploration" }>, dice: Record<string, number[]>, shielded: string[] = []): void {
  const { card, playerIds, mode, target } = ctx;
  let success = true;
  let rollText = "";
  const rule = explorationRule(card, mode, state.round);
  if (rule) {
    const parts = playerIds.map((id) => {
      const p = state.players[id];
      // 선두와의 격차가 크면 역전 보너스: 뒤처진 플레이어의 한 방을 돕는다
      const catchUp = overallGap(state, id) >= BALANCE.catchUpGap ? BALANCE.catchUpBonus : 0;
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
  // 실패했을 때 함정을 간파한(지력기운을 낸) 사람은 손해를 받지 않는다
  const safe = success ? [] : playerIds.filter((id) => shielded.includes(id));
  for (const id of playerIds) if (!safe.includes(id)) applyCardEffect(state, state.players[id], effect);
  const reward = !success && rule ? failRewardOf("exploration", card) : {};
  for (const id of playerIds) applyCardEffect(state, state.players[id], reward);
  state.explorationPile.discard.push(card);
  const gainsGrowth = !!rule && success;
  const names = playerIds.map((id) => state.players[id].name).join(" · ");
  const shieldText = safe.length > 0 ? ` — ${safe.map((id) => state.players[id].name).join(" · ")}은(는) 함정을 간파해서 손해를 피했어요` : "";
  log(state, `${names}: 비밀의 방 "${card.name}"${rollText} → ${describeEffect(effect)}${playerIds.length > 1 ? " (두 명 모두 적용)" : ""}${shieldText}${Object.keys(reward).length ? ` · 실패해도 ${describeEffect(reward)}` : ""}`);
  // 판정이 있는 탐험에서 성공하면 모두 체력이 오른다 (성장)
  if (gainsGrowth) for (const id of playerIds) grow(state, state.players[id], "exploration", "stamina");
}

function describeCoop(card: ExplorationCard, playerId: string, round: number): CoopWaiting {
  return {
    playerId,
    name: card.name,
    description: card.description,
    pairText: `둘이 각자 체력기운을 내고 낸 개수만큼 주사위를 굴려 둘의 합이 ${coopTarget(round, card.coop!.pairTarget)} 이상이면 성공`,
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
      return { id: c.id, name: c.name, description: c.description, tags: creatureTagsOf(c), lines: [describeAbility(c.ability), `조련 판정: 매력기운 주사위 합 ≥ ${creatureTarget(c)}`, ...failRewardLine(failRewardOf("creature", c))] };
    }
    case "lab": {
      const c = card as LabCard;
      return { id: c.id, name: c.name, description: c.description, lines: [c.summary, `실험 판정: 지력기운 주사위 합 ≥ ${labTargetValue()}`, ...failRewardLine(failRewardOf("lab", c))], cost: c.cost > 0 ? { kind: "stamina", amount: c.cost } : undefined };
    }
    case "exploration": {
      const c = card as ExplorationCard;
      const check = checkTextOf(c, round);
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        lines: [...(check ? [check] : ["판정 없음"]), `성공: ${describeEffect(c.success)}`, `실패: ${describeEffect(c.failure)}`, ...(check ? failRewardLine(failRewardOf("exploration", c)) : [])],
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


// 이 카드를 지금 가져갈 수 있는가 (비용을 낼 수 있는가). 연구 카드는 체력기운이 든다. 마법생물은 마나기운 없이도 공짜 주사위 1개로 도전할 수 있다
function canTake(player: PlayerGameState, activityId: ActivityId, card: OfferedCard): boolean {
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
  // 카드가 한 장만 남아도(두 번째 참가자) 자동으로 가져가지 않고 직접 고르게 한다
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
// 비용(구역 두 번째 참가비 매력기운·카드를 여는 지력기운)은 고르는 순간 낸다
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
  // 먼저 온 친구가 있는 구역은 매력기운을 더 내고, 그 매력기운은 먼저 온 친구에게 건넨다 (43-6절)
  const extra = activityExtraCost(state, activityId);
  player.charmTokens -= extra;
  if (extra > 0) {
    const host = state.players[state.activitySlots[activityId][0]];
    host.charmTokens += extra;
    log(state, `${player.name}님이 ${host.name}님에게 매력기운 ${extra}개를 건네고 함께해요`);
  }
  // 구역에 처음 들어와 카드를 여는 사람이 지력기운을 낸다
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
// 고를 수 있는 활동이 없는 플레이어는 쉬어 가며 다음 달 체력기운 +1을 받는다. 모두 골랐으면 진행 단계로 넘어간다
function skipUnavailableChoosers(state: GameState): void {
  while (state.activityTurnPointer < state.activityOrder.length) {
    const player = state.players[state.activityOrder[state.activityTurnPointer]];
    if (!player.hasActedThisPhase && availableActivities(state, player.id).length === 0) {
      player.hasActedThisPhase = true;
      player.pendingStaminaTokens += 1;
      log(state, `${player.name}: 고를 수 있는 구역이 없어 쉬어 갑니다 (다음 달 체력기운 +1)`);
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
  // 끝까지 함께할 친구가 나타나지 않은 협력 카드는 무효가 된다 (열었던 지력기운은 돌려받지 못한다)
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

// ── 주사위 굴리기: 모든 주사위는 마나기운으로 (선 정하기만 공짜 1개, 다시 굴리기 불가) ──
// 굴려야 하는 사람이 모두 굴리면 결과가 화면에 나오고, 굴린 사람들이 결과를 눈으로 확인한 뒤 "확인"을 눌러야 결과가 적용된다

// 주사위 굴리기 버튼: 서버가 굴려서 결과를 기록한다
// diceCount는 굴리기 전에 마나기운을 1~보유 개수 사이에서 골라 내는 굴림에서 쓴다 (생략하면 entry의 기본 개수). 낸 마나기운은 사라진다
export function submitRoll(state: GameState, playerId: string, diceCount?: number, assist = 0): void {
  const pending = state.pendingRoll;
  if (!pending) throw new Error("지금은 주사위를 굴릴 차례가 아닙니다.");
  const entry = pending.entries.find((e) => e.playerId === playerId);
  if (!entry) throw new Error("이번 굴림에 참여하지 않습니다.");
  if (entry.dice) throw new Error("이미 주사위를 굴렸습니다.");
  if (currentRoller(state) !== playerId) throw new Error("아직 내 차례가 아니에요. 앞사람이 굴리고 확인할 때까지 기다려 주세요.");
  const player = state.players[playerId];
  // 보조 능력치 기운 (토너먼트 체력기운 / 탐험 지력기운): 마나기운과 함께 내며, 검증을 모두 마친 뒤에 낸다
  const assistKind = pending.assist?.kind;
  if (!Number.isInteger(assist) || assist < 0 || assist > (entry.assistMax ?? 0)) throw new Error("낼 수 없는 보조 기운 개수예요.");
  if (entry.diceChoiceMax !== undefined) {
    const n = diceCount ?? entry.diceCount;
    const min = (entry.baseDice ?? 0) > 0 ? 0 : 1;
    if (!Number.isInteger(n) || n < min || n > entry.diceChoiceMax) throw new Error(`${PAY_OBJECT[entry.diceToken ?? "mana"]} ${min}~${entry.diceChoiceMax}개 사이로 골라 주세요.`);
    pay(player, entry.diceToken ?? "mana", n);
    entry.diceCount = n + (entry.baseDice ?? 0);
    delete entry.diceChoiceMax;
  }
  if (assist > 0 && assistKind) {
    pay(player, assistKind, assistKind === "intelligence" ? assist * BALANCE.explorationShieldCost : assist);
    entry.assist = assist;
  }
  delete entry.assistMax;
  entry.dice = rollDice(entry.diceCount);
}

// 지금 굴릴(또는 결과를 확인할) 차례인 사람: 아직 확인하지 않은 첫 번째 참여자 (44-4절: 한 명씩 차례대로)
export function currentRoller(state: Pick<GameState, "pendingRoll">): string | undefined {
  return state.pendingRoll?.entries.find((e) => !e.confirmed)?.playerId;
}

// 차례인 사람이 굴렸는가 (결과를 보고 다시 굴리거나 확인하는 단계)
export function rollRevealed(state: Pick<GameState, "pendingRoll">): boolean {
  const id = currentRoller(state);
  return !!id && state.pendingRoll!.entries.find((e) => e.playerId === id)!.dice !== null;
}

// 다시 굴리기: 모두 굴린 뒤 아직 확인하지 않았다면, 마나기운 1개당 주사위 1개를 원하는 만큼(일부 주사위만) 다시 굴린다.
// 몇 번이든 남은 마나기운이 허락하는 만큼 다시 굴릴 수 있다
export function rerollDice(state: GameState, playerId: string, diceIndexes: number[]): void {
  const pending = state.pendingRoll;
  if (!pending) throw new Error("지금은 주사위를 다시 굴릴 때가 아닙니다.");
  if (pending.kind === "first") throw new Error("선 정하기 주사위는 다시 굴릴 수 없어요.");
  const entry = pending.entries.find((e) => e.playerId === playerId);
  if (!entry) throw new Error("이번 굴림에 참여하지 않습니다.");
  if (entry.confirmed) throw new Error("이미 결과를 확인했어요.");
  if (entry.dice === null) throw new Error("주사위를 굴린 뒤에 다시 굴릴 수 있어요.");
  const indexes = [...new Set(diceIndexes)];
  if (indexes.length === 0) throw new Error("다시 굴릴 주사위를 골라 주세요.");
  if (indexes.some((i) => !Number.isInteger(i) || i < 0 || i >= entry.dice!.length)) throw new Error("없는 주사위입니다.");
  const player = state.players[playerId];
  if (player.manaTokens < indexes.length) throw new Error(`마나기운이 부족해요 (주사위 ${indexes.length}개를 다시 굴리려면 마나기운 ${indexes.length}개가 필요해요).`);
  pay(player, "mana", indexes.length);
  const before = indexes.map((i) => entry.dice![i]);
  for (const i of indexes) entry.dice[i] = rollD6();
  entry.rerolls += indexes.length;
  // 주사위별 재굴림 횟수 — 화면에서 다시 굴린 주사위에만 굴리는 애니메이션을 보여주는 용도
  const counts = entry.rerollCounts ?? (entry.rerollCounts = entry.dice.map(() => 0));
  for (const i of indexes) counts[i] = (counts[i] ?? 0) + 1;
  log(state, `${player.name}: 마나기운 ${indexes.length}개로 주사위를 다시 굴렸어요 (${before.join(", ")} → ${indexes.map((i) => entry.dice![i]).join(", ")})`);
}

// 결과 확인 버튼: 모든 참여자가 확인하면 결과를 적용한다
export function confirmRoll(state: GameState, playerId: string): void {
  const pending = state.pendingRoll;
  if (!pending) throw new Error("지금은 주사위 결과를 확인할 때가 아닙니다.");
  const entry = pending.entries.find((e) => e.playerId === playerId);
  if (!entry) throw new Error("이번 굴림에 참여하지 않습니다.");
  if (entry.confirmed) throw new Error("이미 결과를 확인했어요.");
  if (entry.dice === null) throw new Error("주사위를 굴린 뒤에 확인할 수 있어요.");
  entry.confirmed = true;
  if (pending.entries.every((e) => e.confirmed)) resolveRoll(state);
}

function resolveRoll(state: GameState): void {
  const pending = state.pendingRoll;
  const ctx = state.hidden.roll;
  if (!pending || !ctx) return;
  const diceOf = (id: string) => pending.entries.find((e) => e.playerId === id)?.dice ?? [];
  const assistOf = (id: string) => pending.entries.find((e) => e.playerId === id)?.assist ?? 0;
  state.pendingRoll = null;
  state.hidden.roll = null;
  if (ctx.kind === "first") {
    resolveFirstRoll(state, ctx.contenders, diceOf);
  } else if (ctx.kind === "tournament") {
    advanceTournament(state, state.players[ctx.playerId], diceOf(ctx.playerId), assistOf(ctx.playerId));
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
    resolveExploration(state, ctx, Object.fromEntries(ctx.playerIds.map((id) => [id, diceOf(id)])), ctx.playerIds.filter((id) => assistOf(id) > 0));
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

// ── 4주차(정리): 남은 기운은 사라지지만, 네 종류 기운 중 1개는 골라서 다음 달로 남길 수 있다 ──

// 시험을 치르는 달: 1주차(준비) → 시험 → 4주차(정리)
export const isExamRound = (round: number) => round === BALANCE.midtermRound || round === BALANCE.totalRounds;

// 4주차(정리): 지난달 이전에 얻은 임시 능력치(와 시험 대비 카드)는 소멸하고, 이번 달에 얻은 몫은 다음 달 정리 때까지 이어진다
function expireTempBoosts(state: GameState, player: PlayerGameState): void {
  for (const [stat, amount] of Object.entries(player.tempAged)) {
    const key = stat as StatKey;
    player.tempBoosts[key] = (player.tempBoosts[key] ?? 0) - (amount ?? 0);
    if (player.tempBoosts[key] === 0) delete player.tempBoosts[key];
  }
  player.tempAged = { ...player.tempBoosts };
  state.labPile.discard.push(...player.equipment.filter((c) => player.equipmentAgedIds.includes(c.id)));
  player.equipment = player.equipment.filter((c) => !player.equipmentAgedIds.includes(c.id));
  player.equipmentAgedIds = player.equipment.map((c) => c.id);
}

// 4주차(정리, 40절): 쓰고 남은 기운은 사라지지 않고 다음 달로 이어진다. 임시 능력치가 소멸하고 다음 달 선이 정해진다 (능력치 감쇠는 42절에서 없앴다).
// 고를 것이 없으니 기다리지 않고 바로 끝난다
function beginCleanupPhase(state: GameState): void {
  state.phase = "cleanup";
  finishCleanup(state);
}

function finishCleanup(state: GameState): void {
  // 남은 매력기운이 가장 많은 친구가 다음 달 선이 된다 (감쇠·충전 전의 값)
  const nextIndex = nextStarterIndex(state);
  const starterName = state.players[state.turnOrder[nextIndex]].name;
  const starterTokens = state.players[state.turnOrder[nextIndex]].charmTokens;
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    expireTempBoosts(state, player);
    player.hasActedThisPhase = false;
  }
  log(state, "4주차(정리): 쓰고 남은 기운은 다음 달로 이어져요");
  if (nextIndex !== state.startingPlayerIndex) {
    state.startingPlayerIndex = nextIndex;
    log(state, BALANCE.starterRule === "charmTokens" ? `4주차(정리): 남은 매력기운이 가장 많은 ${starterName}님(${starterTokens}개)이 다음 달 선이 돼요` : `4주차(정리): ${starterName}님이 다음 달 선이 돼요`);
  } else {
    log(state, `4주차(정리): 다음 달도 ${starterName}님이 선이에요`);
  }

  advanceRound(state);
}


function advanceRound(state: GameState): void {
  state.round += 1;
  beginRound(state);
}

// 시험 점수 = 시험 카드의 주 능력치(diceStat) 기운을 내고 굴린 주사위 합 + 보너스 능력치(bonusStat) 수치(있으면). 보너스 능력치는 고정 보너스다 (39절)
function examBonus(state: GameState, playerId: string, card: ExamCard): number {
  const p = state.players[playerId];
  return card.bonusStat ? effectiveStat(p, card.bonusStat) : 0;
}

function beginExam(state: GameState, examType: "midterm_exam" | "final_exam"): void {
  state.phase = examType;
  const card = state.hidden.examPlan[examType === "midterm_exam" ? "midterm" : "final"];
  state.hidden.roll = { kind: "exam", examType, card };
  state.pendingRoll = {
    kind: "exam",
    title: `${examType === "midterm_exam" ? "중간고사" : "기말고사"} · ${card.name}`,
    lines: [
      `점수 = ${describeExam(card, STAT_NAME)} — 높은 순서로 순위를 매겨요`,
      `선부터 한 명씩 ${TOKEN_NAME[examFuel(card)]}을 내고(한 번에 그 능력치만큼까지) 낸 개수만큼 주사위를 굴려요 (없으면 공짜 1개). 마나기운으로 다시 굴릴 수 있어요`,
    ],
    entries: orderFromStarter(state).map((id) => choiceEntry(state.players[id], state.players[id].name, undefined, examFuel(card))),
  };
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
  if (examType === "midterm_exam") log(state, "1학기 종업식: 수고했어요! 다음 달부터 2학기예요 (주문력 수업이 늘어나요)");

  // 임시 능력치는 시험 점수에 반영된 뒤에도 소멸 시점(얻은 달의 다음 달 정리)까지 유지된다 (expireTempBoosts)
  if (examType === "final_exam") {
    applyTournamentFinalRewards(state);
    finalizeGame(state);
  } else {
    beginCleanupPhase(state); // 중간고사 달의 4주차(정리): 시험 뒤 남은 지력기운도 1개 남길 수 있다
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

// ── 졸업식 시상 (46절): 6부문 순위 점수의 합이 최종 점수다 ──
export const AWARD_NAME: Record<AwardCategory, string> = {
  spellPower: "마법상",
  credit: "우등상",
  intelligence: "수석상",
  stamina: "튼튼상",
  charm: "인기상",
  creature: "생물사랑상",
};
export const AWARD_SUBJECT: Record<AwardCategory, string> = { ...STAT_NAME, credit: "학점", creature: "마법생물" };

// 부문의 값: 능력치·학점은 그 수치, 마법생물은 마리 수 + 완성한 세트 수
export function awardValue(player: PlayerGameState, category: AwardCategory): number {
  if (category === "credit") return player.credit;
  if (category === "creature") return player.creatures.length + creatureSets(player.creatures);
  return effectiveStat(player, category);
}

// 지금 상태로 시상하면 받을 상 (동점은 같은 순위, 값 0이면 없음, rankPoints 밖의 순위는 0점이라 뺀다)
export function graduationAwards(players: PlayerGameState[]): Map<string, GraduationAward[]> {
  const out = new Map(players.map((p) => [p.id, [] as GraduationAward[]]));
  for (const category of BALANCE.graduationCategories) {
    for (const p of players) {
      const value = awardValue(p, category);
      if (value <= 0) continue;
      const rank = 1 + players.filter((o) => awardValue(o, category) > value).length;
      const points = BALANCE.rankPoints[rank - 1] ?? 0;
      if (points > 0) out.get(p.id)!.push({ category, value, rank, points });
    }
  }
  return out;
}

const awardPoints = (awards: GraduationAward[]) => awards.reduce((a, w) => a + w.points, 0);

// 최종 점수 = 졸업식에서 받은 점수의 합 (게임이 끝날 때 정해진다)
export function finalScore(player: PlayerGameState): number {
  return awardPoints(player.awards);
}

// 게임 중 예상 점수: 지금 상태로 졸업하면 받을 점수
export function projectedScore(players: PlayerGameState[], player: PlayerGameState): number {
  return awardPoints(graduationAwards(players).get(player.id) ?? []);
}

function finalizeGame(state: GameState): void {
  state.phase = "ended";
  // 졸업식: 부문마다 순위에 따라 점수를 준다 (46절)
  const players = state.turnOrder.map((id) => state.players[id]);
  const awards = graduationAwards(players);
  for (const p of players) p.awards = awards.get(p.id) ?? [];
  for (const category of BALANCE.graduationCategories) {
    const got = players.flatMap((p) => p.awards.filter((w) => w.category === category).map((w) => ({ p, w }))).sort((a, b) => a.w.rank - b.w.rank);
    if (got.length > 0) log(state, `졸업식 ${AWARD_NAME[category]}(${AWARD_SUBJECT[category]}): ${got.map(({ p, w }) => `${w.rank}위 ${p.name} ${w.value} +${w.points}점`).join(", ")}`);
  }
  const achievements = state.turnOrder.map((id) => ({
    playerId: id,
    achievement: finalScore(state.players[id]),
  }));
  // 최종 점수가 같으면 1위 상을 더 많이 받은 사람, 그것도 같으면 2위 상이 많은 사람이 이긴다 (그래도 같으면 공동 승리, 46절)
  const key = (id: string) => {
    const aw = state.players[id].awards;
    return [finalScore(state.players[id]), aw.filter((w) => w.rank === 1).length, aw.filter((w) => w.rank === 2).length];
  };
  const better = (a: number[], b: number[]) => a.findIndex((x, i) => x !== b[i]) >= 0 && a[a.findIndex((x, i) => x !== b[i])] > b[a.findIndex((x, i) => x !== b[i])];
  const best = state.turnOrder.map(key).reduce((acc, k) => (better(k, acc) ? k : acc));
  state.winnerIds = achievements.filter((a) => key(a.playerId).every((x, i) => x === best[i])).map((a) => a.playerId);
  log(state, "게임 종료: 졸업식 시상 점수의 합이 가장 큰 플레이어 승리");
}

// ── 게임 도중 플레이어 제거 (방장이 내보냈을 때) ──
// 봇이 대신하지 않고 그 사람만 게임에서 완전히 빠진다. 그 사람 때문에 멈춰 있던 단계는 즉시 다음으로 넘어간다.
// 이미 낸 비용(기운)은 돌려주지 않는다. 그 사람의 카드는 해당 버림 더미로 돌아간다.
// 호출하는 쪽은 최소 2명이 남는지 미리 확인해야 한다.

// 진행 중이던 주사위 굴림이 들고 있던 카드를 버림 더미로 돌린다 (조련·실험·탐험 판정)
function recoverRollCard(state: GameState): void {
  const ctx = state.hidden.roll;
  if (!ctx) return;
  if (ctx.kind === "creature") state.creatureDiscard.push(ctx.card);
  else if (ctx.kind === "lab") state.labPile.discard.push(ctx.card);
  else if (ctx.kind === "exploration") state.explorationPile.discard.push(ctx.card);
}

// 순서 목록에서 한 명을 빼고, 그 사람이 현재 차례 앞쪽에 있었다면 차례 포인터를 한 칸 당긴다
function dropFromOrder(list: string[], pointer: number, playerId: string): { list: string[]; pointer: number } {
  const index = list.indexOf(playerId);
  if (index < 0) return { list, pointer };
  return { list: list.filter((id) => id !== playerId), pointer: index < pointer ? pointer - 1 : pointer };
}

function removeFromActivityPhase(state: GameState, playerId: string): void {
  const order = dropFromOrder(state.activityOrder, state.activityTurnPointer, playerId);
  state.activityOrder = order.list;
  state.activityTurnPointer = order.pointer;

  const resolving = state.activityStage === "resolve";
  const choices = state.activityChoices;
  const current = resolving ? choices[state.activityResolvePointer] : undefined;
  // 그 사람이 고른 활동이거나, 그 사람을 지목한 주문 대결은 사라진다 (이미 낸 비용은 돌려주지 않는다)
  const isGone = (c: ActivityChoice) => c.playerId === playerId || c.targetPlayerId === playerId;
  const gone = choices.filter(isGone);
  for (const c of gone) {
    state.activitySlots[c.activityId] = state.activitySlots[c.activityId].filter((id) => id !== c.playerId);
    if (c.playerId !== playerId) log(state, `${state.players[c.playerId]?.name ?? "친구"}: 주문 대결 상대가 게임을 떠나 이번 달 활동을 하지 못해요`);
    // 선택 단계에서 도전자가 사라지면, 아직 자기 차례가 오지 않은 지목 대상은 직접 활동을 고르게 돌려준다
    if (!resolving && c.playerId === playerId && c.targetPlayerId) {
      const target = state.players[c.targetPlayerId];
      if (target && state.activityOrder.indexOf(target.id) >= state.activityTurnPointer) target.hasActedThisPhase = false;
    }
  }
  for (const a of ACTIVITY_IDS) state.activitySlots[a] = state.activitySlots[a].filter((id) => id !== playerId);
  state.duels = state.duels.filter((d) => d.challengerId !== playerId && d.targetId !== playerId);

  if (resolving) {
    let pointer = state.activityResolvePointer;
    choices.forEach((c, i) => {
      if (isGone(c) && i < state.activityResolvePointer) pointer -= 1;
    });
    state.activityChoices = choices.filter((c) => !isGone(c));
    state.activityResolvePointer = pointer;
    state.activityResults = state.activityResults.filter((r) => r.playerId !== playerId);
  } else {
    state.activityChoices = choices.filter((c) => !isGone(c));
  }

  // 함께할 친구를 기다리던 협력 카드의 주인이 사라지면 카드는 버려진다
  if (state.hidden.coop?.playerId === playerId) {
    state.explorationPile.discard.push(state.hidden.coop.card);
    state.hidden.coop = null;
    state.coopWaiting = null;
  }

  // 그 사람이 걸린 주사위 굴림·카드 고르기는 취소한다
  const currentGone = !!current && isGone(current);
  const cancel =
    !!state.pendingRoll?.entries.some((e) => e.playerId === playerId) ||
    state.pendingPick?.playerId === playerId ||
    (currentGone && state.activityResolveStarted);
  if (cancel) {
    recoverRollCard(state);
    state.pendingRoll = null;
    state.hidden.roll = null;
    state.pendingPick = null;
  }

  if (!resolving) {
    skipUnavailableChoosers(state);
  } else if (cancel && !currentGone) {
    // 현재 활동의 주인은 남아 있으니 그 활동만 마무리하고 다음으로 (마지막이면 3주차를 끝낸다)
    finishResolutionStep(state);
  } else {
    if (cancel) state.activityResolveStarted = false;
    if (!state.pendingRoll && !state.pendingPick && !state.activityResolveStarted && state.activityResolvePointer >= state.activityChoices.length) endActivityPhase(state);
  }
}

export function removePlayerFromGame(state: GameState, playerId: string): void {
  const removed = state.players[playerId];
  if (!removed || state.phase === "ended" || !state.turnOrder.includes(playerId)) return;
  log(state, `${removed.name}님이 게임에서 나갔어요`);

  // 그 사람의 카드는 버림 더미로
  state.classDiscard.push(...removed.classCards);
  state.creatureDiscard.push(...removed.creatures);
  state.labPile.discard.push(...removed.equipment);
  state.grimoirePile.discard.push(...removed.grimoires);

  // 좌석과 선: 선이 빠지면 시계방향 다음 사람이 선이 된다
  const oldIndex = state.turnOrder.indexOf(playerId);
  const starterId = state.turnOrder[state.startingPlayerIndex];
  state.turnOrder = state.turnOrder.filter((id) => id !== playerId);
  state.startingPlayerIndex = starterId === playerId ? oldIndex % state.turnOrder.length : state.turnOrder.indexOf(starterId);
  delete state.players[playerId];

  // 지난 기록에서도 그 사람의 몫을 뺀다 (화면이 없는 플레이어를 찾지 않도록)
  for (const result of state.examResults) result.scores = result.scores.filter((s) => s.playerId !== playerId);

  // 정규수업 단계가 아닐 때 지난 선택 순서에 그 사람이 남아 있지 않게 한다
  if (state.phase !== "class") state.classPickOrder = state.classPickOrder.filter((id) => id !== playerId);
  if (state.phase !== "cram") state.cramOrder = state.cramOrder.filter((id) => id !== playerId);
  // 3주차가 아닌 때에도 지난 3주차의 선택·결과 기록에 그 사람이 남아 있지 않게 한다
  if (state.phase !== "activity") {
    state.activityOrder = state.activityOrder.filter((id) => id !== playerId);
    state.activityChoices = state.activityChoices.filter((c) => c.playerId !== playerId && c.targetPlayerId !== playerId);
    state.activityResults = state.activityResults.filter((r) => r.playerId !== playerId);
    state.duels = state.duels.filter((d) => d.challengerId !== playerId && d.targetId !== playerId);
    for (const a of ACTIVITY_IDS) state.activitySlots[a] = state.activitySlots[a].filter((id) => id !== playerId);
  }

  const roll = state.pendingRoll;
  const ctx = state.hidden.roll;
  switch (state.phase) {
    case "setup": {
      // 선 정하기: 굴림에 낀 사람이 빠지면 남은 사람끼리 이어서 한다 (한 명만 남으면 그 사람이 선)
      if (roll && ctx?.kind === "first" && ctx.contenders.includes(playerId)) {
        const contenders = ctx.contenders.filter((id) => id !== playerId);
        if (contenders.length <= 1) {
          state.pendingRoll = null;
          state.hidden.roll = null;
          const winner = contenders[0] ?? state.turnOrder[0];
          state.startingPlayerIndex = state.turnOrder.indexOf(winner);
          log(state, `선 정하기: ${state.players[winner].name}님이 선이에요! 선부터 시계방향으로 진행해요`);
          beginRound(state);
        } else {
          ctx.contenders = contenders;
          roll.entries = roll.entries.filter((e) => e.playerId !== playerId);
          if (roll.entries.every((e) => e.confirmed)) resolveRoll(state);
        }
      }
      break;
    }
    case "class": {
      const order = dropFromOrder(state.classPickOrder, state.classPickPointer, playerId);
      state.classPickOrder = order.list;
      state.classPickPointer = order.pointer;
      if (state.classPickPointer >= state.classPickOrder.length) {
        state.classDiscard.push(...state.classMarket);
        state.classMarket = [];
        beginActivityPhase(state);
      }
      break;
    }
    case "activity":
      removeFromActivityPhase(state, playerId);
      break;
    case "cram": {
      const order = dropFromOrder(state.cramOrder, state.cramPointer, playerId);
      state.cramOrder = order.list;
      state.cramPointer = order.pointer;
      if (state.cramPointer >= state.cramOrder.length) beginExam(state, state.round === BALANCE.midtermRound ? "midterm_exam" : "final_exam");
      break;
    }
    default: {
      // 시험: 굴림에서 빠지고, 남은 사람이 모두 확인했으면 바로 결과를 처리한다
      if (roll) {
        roll.entries = roll.entries.filter((e) => e.playerId !== playerId);
        if (roll.entries.every((e) => e.confirmed)) resolveRoll(state);
      }
    }
  }
}
