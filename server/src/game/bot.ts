// AI 봇 의사결정. 실제 게임(함께 플레이)과 밸런스 시뮬레이션(scripts/simulate.ts)이 함께 사용합니다.
// 봇은 단순한 휴리스틱으로 움직입니다. 수업카드는 공개된 카드 중 성향에 맞는 능력치를 우선해 체력기운이 허용하는 카드를 1장 고르고,
// 자율활동은 상황(마나기운 보유량, 마법 경연 진행도 등)과 성향 가중치를 곱해 점수가 높은 구역을 고릅니다.
import { BALANCE } from "./config.js";
import {
  availableActivities,
  canPay,
  duelTargets,
  explorationChance,
  rerollDice,
  overallGap,
  canTakeClassCard,
  classGainApplied,
  classGainKind,
  takeClassCard,
  tokensOf,
  directionFaces,
  adjustDie,
  cramSources,
  cramTurn,
  rollLimit,
  chooseDream,
  labCost,
  creatureSets,
  diceSuccessChance,
  suggestDiceCount,
  usableFuel,
  projectedScore,
  labTargetValue,
} from "./engine.js";
import {
  effectiveStat,
  type ActivityId,
  type CardEffect,
  type CreatureCard,
  type DirectionOutcome,
  type ExplorationCard,
  type GameState,
  type KeptToken,
  type LabCard,
  type PlayerGameState,
  type StatKey,
  type AwardCategory,
  type TournamentCard,
} from "./types.js";

export const ACTIVITIES: ActivityId[] = ["tournament", "creature", "duel", "exploration", "lab"];

export interface BotStrategy {
  name: string;
  classWeights: Record<StatKey, number>;
  // 이 라운드부터는 lateClassWeights로 갈아탄다 (초반엔 지력·체력, 후반엔 주문력처럼 단계별로 성장하는 성향)
  lateClassWeights?: Record<StatKey, number>;
  lateFromRound?: number;
  // 후반(lateFromRound 이후)의 자율활동 성향. 없으면 activityBias를 계속 쓴다
  lateActivityBias?: Record<ActivityId, number>;
  activityBias: Record<ActivityId, number>;
  // true면 아무 생각 없이 무작위로 행동 (시뮬레이션 비교용)
  random?: boolean;
  // ── 61절 전략 AI: 성향(가중치)만이 아니라 판단 방식이 다른 AI ──
  // 장래희망 능력치를 얼마나 더 키우나 (기본 1.6)
  dreamWeight?: number;
  // 졸업식 순위를 본다: 1위가 확실한 능력치는 덜, 한 칸 차이로 순위를 올릴 수 있는 능력치는 더 키운다
  awardAware?: boolean;
  // 뒤처지면 선두에게 마법 겨루기를 더 걸고, 앞서면 안전한 구역을 고른다
  chaser?: boolean;
  // 성향 없이 이번 달 공개된 카드의 기대값만 보고 구역을 고른다
  greedy?: boolean;
}

const even: Record<ActivityId, number> = { tournament: 1, creature: 1, duel: 1, exploration: 1, lab: 1 };
const leaning = (a: ActivityId, weight: number): Record<ActivityId, number> => ({ ...even, [a]: weight });

const BALANCED_WEIGHTS: Record<StatKey, number> = { intelligence: 1.2, spellPower: 1.2, stamina: 1, charm: 0.6 };

// 함께 플레이할 때 봇에게 무작위로 부여되는 성향 (한 활동만 고집하면 약해지므로 가중치는 약하게)
// 61절: 구역 성향 4종(조련·겨루기·탐험·연구) + 판단 방식이 다른 전략 AI 4종(꿈 우선·상 노리기·추격·기대값)
const EVEN_WEIGHTS: Record<StatKey, number> = { intelligence: 1, spellPower: 1, stamina: 1, charm: 1 };
export const BOT_PERSONALITIES: BotStrategy[] = [
  { name: "균형형", classWeights: BALANCED_WEIGHTS, activityBias: even },
  { name: "마법 경연형", classWeights: { ...BALANCED_WEIGHTS, spellPower: 1.5 }, activityBias: leaning("tournament", 2.5) },
  { name: "조련사형", classWeights: BALANCED_WEIGHTS, activityBias: leaning("creature", 2.5) },
  { name: "결투가형", classWeights: { ...BALANCED_WEIGHTS, spellPower: 1.5 }, activityBias: leaning("duel", 2.5) },
  { name: "탐험가형", classWeights: BALANCED_WEIGHTS, activityBias: leaning("exploration", 2.5) },
  { name: "연구가형", classWeights: BALANCED_WEIGHTS, activityBias: leaning("lab", 2.5) },
  { name: "꿈 우선형", classWeights: EVEN_WEIGHTS, activityBias: even, dreamWeight: 3 },
  { name: "상 노리기형", classWeights: EVEN_WEIGHTS, activityBias: even, awardAware: true },
  { name: "추격형", classWeights: BALANCED_WEIGHTS, activityBias: even, chaser: true },
  { name: "기대값형", classWeights: EVEN_WEIGHTS, activityBias: even, greedy: true },
];

export const BOT_NAMES = ["마루", "별이", "모찌", "구름이", "하늘이", "보라", "달이", "솜이", "콩이", "루나"];

// 61절: 없는 활동(disabledActivities)에 기운 성향은 빼고 고른다
export function activePersonalities(): BotStrategy[] {
  return BOT_PERSONALITIES.filter((s) => !BALANCE.disabledActivities.some((a) => s.activityBias[a] > 1));
}

export function pickBotPersonality(): BotStrategy {
  const list = activePersonalities();
  return list[Math.floor(Math.random() * list.length)];
}

// 공개된 다음 시험 카드가 겨냥하는 능력치는 더 키운다 (주사위 능력치 ×1.6, 보너스 능력치 ×1.25)
function examWeight(state: GameState, stat: StatKey): number {
  const upcoming = state.round <= BALANCE.midtermRound ? state.exams.midterm : state.exams.final;
  if (!upcoming) return 1;
  return upcoming.diceStat === stat ? 1.6 : upcoming.bonusStat === stat ? 1.25 : 1;
}

// 지금 라운드에 적용할 능력치 가중치 (단계별 성향이면 후반에 갈아탄다).
// 56절: 장래희망의 두 능력치(아직 기준에 못 미쳤으면)와 올해의 특별상 인기상(매력)은 더 키운다
function weightsOf(state: GameState, strategy: BotStrategy, player?: PlayerGameState): Record<StatKey, number> {
  const base = strategy.lateClassWeights && state.round >= (strategy.lateFromRound ?? 7) ? strategy.lateClassWeights : strategy.classWeights;
  const dream = player?.dream;
  const special = state.specialAwards ?? [];
  if (!dream && !special.includes("charm") && !player) return base;
  const w = { ...base };
  if (dream) for (const s of dream.stats) if (effectiveStat(player!, s) < BALANCE.dreamThreshold) w[s] *= strategy.dreamWeight ?? DREAM_WEIGHT;
  if (special.includes("charm")) w.charm *= 1.4;
  if (player) {
    // 졸업식 부문(능력치)마다 내 순위를 본다: 1위를 2칸 이상 앞서면 덜 키운다(모든 AI).
    // 상 노리기형은 더 세게 줄이고, 한 칸 차이로 위 순위를 따라잡을 수 있는 능력치는 더 키운다
    const others = state.turnOrder.filter((id) => id !== player.id).map((id) => state.players[id]);
    for (const stat of Object.keys(w) as StatKey[]) {
      if (!BALANCE.graduationCategories.includes(stat as AwardCategory) || others.length === 0) continue;
      const mine = effectiveStat(player, stat);
      const above = others.map((o) => effectiveStat(o, stat)).filter((v) => v >= mine);
      if (above.length === 0) {
        const second = Math.max(0, ...others.map((o) => effectiveStat(o, stat)));
        if (mine - second >= 2) w[stat] *= strategy.awardAware ? 0.4 : 0.6;
      } else if (strategy.awardAware && above.length <= 2 && Math.min(...above) - mine <= 1) w[stat] *= 1.6;
    }
  }
  return w;
}
const DREAM_WEIGHT = 1.6;

// 장래희망 (56절 B2): 받은 카드 중 성향 가중치 합이 큰 꿈을 고른다
export function botChooseDream(state: GameState, playerId: string, strategy: BotStrategy): void {
  const p = state.players[playerId];
  const options = p.dreamOptions ?? [];
  if (options.length === 0) return;
  const w = weightsOf(state, strategy);
  const best = [...options].sort((a, b) => w[b.stats[0]] + w[b.stats[1]] - (w[a.stats[0]] + w[a.stats[1]]))[0];
  chooseDream(state, playerId, best.id);
}

// 올해의 특별상(56절 B3)이 걸린 활동은 조금 더 끌린다
const SPECIAL_ACTIVITY: Partial<Record<string, ActivityId>> = { explorer: "exploration", researcher: "lab", duelist: "duel", champion: "tournament" };
function specialPull(state: GameState, a: ActivityId): number {
  return (state.specialAwards ?? []).some((c) => SPECIAL_ACTIVITY[c] === a) ? 1.3 : 1;
}

// 연구 카드 성공 확률 (61절: 카드마다 목표값이 인쇄돼 있다)
function labChance(player: PlayerGameState, card: LabCard): number {
  const target = labTargetValue(card);
  const fuel = usableFuel(player, BALANCE.rollFuel.lab);
  const n = suggestDiceCount(fuel, target);
  return diceSuccessChance(n + BALANCE.baseDice, target);
}

// 대회 카드 (56절 C1): 성공 확률 × (카드 보상). 다른 구역처럼 성장 몫은 넣지 않는다
function tournamentCardValue(state: GameState, strategy: BotStrategy, player: PlayerGameState, card: TournamentCard): number {
  const fuel = usableFuel(player, BALANCE.rollFuel.tournament);
  const target = Math.max(1, card.target + BALANCE.tournamentTargetMod);
  const chance = diceSuccessChance(fuel > 0 ? suggestDiceCount(fuel, target) : 1, target);
  return chance * (1 + effectValue(state, strategy, card.reward, player));
}

function biasOf(state: GameState, strategy: BotStrategy): Record<ActivityId, number> {
  return strategy.lateActivityBias && state.round >= (strategy.lateFromRound ?? 7) ? strategy.lateActivityBias : strategy.activityBias;
}

const pickOne = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

// 정규수업 (42절): 공개된 수업카드 중 이번 달 활동에 쓸 기운을 주는 과목을 고른다. 카드의 가치 = 실제로 늘어나는 기운의 양 × (그 기운을 연료로 쓰는 활동에 대한 선호 + 키우려는 능력치 가중치).
// 심화 과목은 능력치가 모자라면 고를 수 없다
export function playClassTurn(state: GameState, playerId: string, strategy: BotStrategy): void {
  const p = state.players[playerId];
  const bias = biasOf(state, strategy);
  const fuelPref = (kind: KeptToken) => ACTIVITIES.filter((a) => BALANCE.rollFuel[a] === kind && !BALANCE.disabledActivities.includes(a)).reduce((s, a) => s + bias[a], 0);
  const options = state.classMarket.filter((c) => canTakeClassCard(p, c));
  // 50절: 이번 달 카드가 공개돼 있으면 하려는 활동을 먼저 정하고, 그 활동의 재료 기운을 주는 과목을 더 높이 친다
  const plan = BALANCE.revealOffersAtMonthStart ? plannedActivity(state, p, strategy) : null;
  const planBoost = (c: (typeof state.classMarket)[number]) => (plan && BALANCE.rollFuel[plan] === classGainKind(c) ? 1.8 : 1);
  const value = (c: (typeof state.classMarket)[number]) =>
    classGainApplied(p, c) * (0.6 * fuelPref(classGainKind(c)) + 0.4 * weightsOf(state, strategy, p)[c.stat]) * examWeight(state, c.stat) * planBoost(c);
  let choice: string | null = null;
  if (options.length > 0) {
    choice = strategy.random ? (Math.random() < 0.2 ? null : pickOne(options).id) : [...options].sort((a, b) => value(b) - value(a))[0].id;
  }
  takeClassCard(state, playerId, choice);
}

// 시험 달 벼락치기 (44절): 시험 과목 기운이 한 번에 낼 수 있는 개수(능력치)보다 적으면, 가장 많이 남은 다른 기운 1개를 바꾼다.
// 마나기운은 다시 굴리기에 쓰므로 2개 이하면 건드리지 않는다
export function playCramTurn(state: GameState, playerId: string): void {
  const p = state.players[playerId];
  const to = state.news?.effect.cramTo;
  const sources = cramSources(state, p).filter((k) => k !== "mana" || p.manaTokens > 2);
  const wants = !!to && tokensOf(p, to) < rollLimit(p, to);
  const from = wants && sources.length > 0 ? [...sources].sort((a, b) => tokensOf(p, b) - tokensOf(p, a))[0] : null;
  cramTurn(state, playerId, from);
}

// 50절: 공개된 구역 카드 중 내가 가져갈 수 있는 카드의 가치. 이미 누가 들어간 구역이면 먼저 온 사람이 가장 좋은 카드를 가져간다고 보고 남는 카드로 계산한다
function zoneOutlook(state: GameState, strategy: BotStrategy, player: PlayerGameState, activityId: ActivityId): number {
  // 마법 경연(54절): 참가하면 언제나 주문력 성장과 학점을 받는다. 다른 구역의 가치(카드 효과)에는 성장 몫이 들어 있지 않아 같은 눈높이가 되도록 절반으로 본다
  // (1이면 봇이 마법 경연에 몰려 마법 겨루기가 판당 1.2회로 줄고 전략 범위가 7~39%로 벌어졌다)
  if (activityId === "tournament" && !BALANCE.tournamentCards)
    return BALANCE.growthActivities.tournament ? 0.5 * effectValue(state, strategy, { stats: { spellPower: BALANCE.growthAmount }, credit: BALANCE.growthCredit }) : 0;
  // 마법 겨루기의 가치 = 이길 확률·지목 부담을 감안한 0.35 × (승리 보상 + 주문력 성장)
  if (activityId === "duel")
    return 0.35 * (effectValue(state, strategy, BALANCE.duelWinReward) + effectValue(state, strategy, { stats: { spellPower: BALANCE.growthAmount } }) + duelLearnValue(state, strategy, player));
  const cards = state.hidden.offers[activityId] ?? [];
  const valueOf = (card: (typeof cards)[number]): number => {
    if (activityId === "creature") return creatureValue(state, strategy, player, card as CreatureCard);
    if (activityId === "lab") return canPay(player, 0, labCost(card as LabCard)) ? labChance(player, card as LabCard) * (effectValue(state, strategy, (card as LabCard).effect, player) + 1) - labCost(card as LabCard) * 0.3 : -1;
    if (activityId === "tournament") return tournamentCardValue(state, strategy, player, card as TournamentCard);
    return explorationValue(state, strategy, player, card as ExplorationCard);
  };
  const values = cards.map(valueOf).sort((a, b) => b - a);
  const taken = state.activitySlots[activityId].length;
  return Math.max(0, values[taken] ?? 0);
}

// 61절 겨루며 배운다: 지목할 수 있는 친구 중 가장 크게 배울 수 있는 능력치 +1의 가치 (BOT_DUEL_LEARN=0이면 끔)
function duelLearnValue(state: GameState, strategy: BotStrategy, player: PlayerGameState): number {
  if (!BALANCE.duelLearn || process.env.BOT_DUEL_LEARN === "0") return 0;
  const stats: StatKey[] = ["intelligence", "stamina", "charm", "spellPower"];
  let best = 0;
  for (const id of duelTargets(state, player.id)) {
    const other = state.players[id];
    const top = stats.filter((s) => other[s] > player[s]).sort((a, b) => other[b] - player[b] - (other[a] - player[a]))[0];
    if (top) best = Math.max(best, effectValue(state, strategy, { stats: { [top]: 1 } }));
  }
  return best;
}

// 이번 달 하려는 활동 (공개된 카드와 성향을 함께 본다)
function activityAppeal(state: GameState, strategy: BotStrategy, player: PlayerGameState, a: ActivityId): number {
  const base: Record<ActivityId, number> = { tournament: BALANCE.tournamentCards ? 1.4 : effectiveStat(player, "spellPower") * 0.25, creature: 1.6, duel: 1.5, exploration: 1.2, lab: 1.6 };
  // 기대값형: 성향 없이 공개된 카드의 가치만 본다
  if (strategy.greedy) return (0.3 + zoneOutlook(state, strategy, player, a)) * specialPull(state, a);
  let chase = 1;
  if (strategy.chaser && a === "duel") {
    const gap = leaderGap(state, player);
    chase = gap >= 3 ? 2.2 : gap <= 0 ? 0.4 : 1;
  }
  return (base[a] * biasOf(state, strategy)[a] * chase + (BALANCE.revealOffersAtMonthStart ? 0.8 * zoneOutlook(state, strategy, player, a) : 0)) * specialPull(state, a);
}
function plannedActivity(state: GameState, player: PlayerGameState, strategy: BotStrategy): ActivityId {
  return ACTIVITIES.filter((a) => !BALANCE.disabledActivities.includes(a)).map((a) => ({ a, v: activityAppeal(state, strategy, player, a) })).sort((x, y) => y.v - x.v)[0].a;
}

// 자율활동 단계: 선택할 구역과 (마법 겨루기가면) 상대
export function chooseActivityAction(
  state: GameState,
  playerId: string,
  strategy: BotStrategy,
): { activityId: ActivityId; targetPlayerId?: string } {
  const p = state.players[playerId];
  // 마법 겨루기는 아직 활동을 고르지 않은 플레이어가 있어야만 고를 수 있다 (그중 한 명을 강제로 지목)
  const targets = duelTargets(state, playerId);
  const free = availableActivities(state, playerId);
  const base: Record<ActivityId, number> = {
    tournament: effectiveStat(p, "spellPower") * 0.25,
    creature: 1.6,
    duel: 1.5,
    // 선두에게 뒤처졌다면 한 방을 노려볼 만하다 (탐험 역전 보너스)
    exploration: overallGap(state, playerId) >= BALANCE.catchUpGap ? 2.4 : 1.2,
    // 연구실은 공개된 연구 카드 중 골라 영구 성장을 얻는다
    lab: 1.6,
  };
  // 활동의 연료 기운이 넉넉할수록 끌린다 (수업에서 기운을 얻은 활동을 하게 된다. 기운이 없으면 공짜 주사위 1개라 덜 끌린다)
  const energy = (a: ActivityId) => {
    const t = tokensOf(p, BALANCE.rollFuel[a]);
    return t >= 3 ? 1 : t >= 1 ? 0.75 : 0.4;
  };
  const scored = free.map((a) => {
    // 이미 친구가 있는 구역은 (참가비가 있으면) 조금 덜 끌린다. 카드가 미리 공개돼 있으면 남는 카드의 가치로 따진다(50절)
    const crowded = state.activitySlots[a].length > 0 && BALANCE.activitySecondParticipantCost > 0 ? 0.8 : 1;
    const appeal = BALANCE.revealOffersAtMonthStart ? activityAppeal(state, strategy, p, a) : base[a] * biasOf(state, strategy)[a];
    return {
      a,
      score: (strategy.random ? 1 : appeal * energy(a) * crowded) * (0.7 + Math.random() * 0.6),
    };
  });
  scored.sort((x, y) => y.score - x.score);
  const activityId = scored[0].a;
  // 마법 겨루기 상대: 아직 활동을 고르지 않은 플레이어 중 주문력이 가장 높은(가장 위협적인) 사람
  const targetPlayerId =
    activityId === "duel"
      ? [...targets].sort(() => Math.random() - 0.5).sort((a, b) => duelPreference(state, strategy, b) - duelPreference(state, strategy, a))[0] // 동점이면 무작위 (앞자리만 지목하지 않도록)
      : undefined;
  return { activityId, targetPlayerId };
}

// 예상 점수 1위와의 차이 (내가 1위면 0 이하)
function leaderGap(state: GameState, player: PlayerGameState): number {
  const players = state.turnOrder.map((id) => state.players[id]);
  const mine = projectedScore(players, player, state.specialAwards ?? []);
  const best = Math.max(...players.filter((p) => p.id !== player.id).map((p) => projectedScore(players, p, state.specialAwards ?? [])));
  return best - mine;
}

// 61절: 지목당한 친구는 막아 내도 보상이 없고 자기 활동도 그대로 하므로, 이기기 쉬운 상대(막을 주사위가 적은 친구)를 고른다.
// 같으면 예상 점수가 높은 친구. 추격형은 언제나 선두를 노린다
function duelPreference(state: GameState, strategy: BotStrategy, id: string): number {
  if (strategy.chaser || process.env.DUEL_TARGET === "leader" || process.env.DUEL_TARGET === "spell") return duelThreat(state, id);
  const p = state.players[id];
  const defenseDice = (BALANCE.duelDefenderStatDice ? (BALANCE.duelDefenderStatDice === "flat" ? 1 + effectiveStat(p, "spellPower") / 3.5 : effectiveStat(p, "spellPower")) : usableFuel(p, "mana")) + BALANCE.baseDice;
  return -defenseDice * 100 + duelThreat(state, id) * 0.01;
}

// 마법 겨루기 상대를 고르는 기준: 기본은 예상 점수가 가장 높은 친구(사람이 흔히 하는 선택, 61절), DUEL_TARGET=spell이면 주문력이 가장 높은 친구(예전)
function duelThreat(state: GameState, id: string): number {
  if (process.env.DUEL_TARGET !== "spell") {
    const players = state.turnOrder.map((pid) => state.players[pid]);
    return projectedScore(players, state.players[id], state.specialAwards ?? []);
  }
  return state.players[id].spellPower;
}

// 카드 효과의 대략적인 가치 (영구 능력치는 성향 가중치로, 임시/기운/엿보기는 낮게 평가)
function effectValue(state: GameState, strategy: BotStrategy, e: CardEffect, player?: PlayerGameState): number {
  let v = 0;
  const w = weightsOf(state, strategy, player);
  for (const [stat, n] of Object.entries(e.stats ?? {})) v += (n ?? 0) * w[stat as StatKey] * examWeight(state, stat as StatKey) * 1.5;
  for (const [stat, n] of Object.entries(e.tempStats ?? {})) v += (n ?? 0) * w[stat as StatKey] * examWeight(state, stat as StatKey) * 0.5;
  v += (e.credit ?? 0) * 3;
  v += (e.peekExploration ? 0.8 : 0) + (e.nextMana ?? 0) * 0.4 + (e.nextStamina ?? 0) * 0.5;
  for (const n of Object.values(e.tokens ?? {})) v += (n ?? 0) * 0.4;
  return v;
}

// 방향형 결과(48절)의 눈 하나의 가치
function outcomeValue(state: GameState, strategy: BotStrategy, player: PlayerGameState, card: CreatureCard | LabCard | ExplorationCard, o: DirectionOutcome): number {
  return effectValue(state, strategy, o.effect) + (o.acquire ? 1.5 * creatureValue(state, strategy, player, card as CreatureCard) + 1 : 0);
}
const directionalCardValue = (state: GameState, strategy: BotStrategy, player: PlayerGameState, activity: "creature" | "lab" | "exploration", card: CreatureCard | LabCard | ExplorationCard) =>
  directionFaces(activity, card).reduce((a, o) => a + outcomeValue(state, strategy, player, card, o), 0) / 6;

// 탐험 카드: 성공 확률(주사위 + 능력치 + 집중 + 역전 보너스)로 기대값을 계산한다
function explorationValue(state: GameState, strategy: BotStrategy, player: PlayerGameState, card: ExplorationCard): number {
  const success = effectValue(state, strategy, card.success);
  const failure = BALANCE.explorationPenalty ? effectValue(state, strategy, card.failure) : 0;
  if (!card.check) return success;
  const p = explorationChance(state, player, card);
  return p * success + (1 - p) * failure;
}

// 굴리기 전에 쓸 보조 능력치 기운 개수 (38-6절). 마법 경연(설정으로 켰을 때): 다음 달로 남길 체력기운 1개만 빼고 모두 달리는 데 쓴다
export function botAssist(state: GameState, playerId: string): number {
  const pending = state.pendingRoll;
  const max = pending?.entries.find((e) => e.playerId === playerId)?.assistMax ?? 0;
  if (!pending?.assist || max <= 0) return 0;
  return Math.min(max, Math.max(0, state.players[playerId].staminaTokens - 1));
}

// 결과 확인 전에 남은 마나기운으로 낮게 나온 주사위를 다시 굴린다 (선 정하기는 제외). 목표값이 있는 혼자 판정(조련·연구실·탐험)은
// 합이 모자랄 때만 가장 낮은 주사위부터 한 개씩 다시 굴리고(3 이하만), 그 밖의 굴림은 1~2가 나온 주사위를 다시 굴린다
export function rerollLowDice(state: GameState, playerId: string, strategy: BotStrategy = BOT_PERSONALITIES[0]): void {
  const pending = state.pendingRoll;
  const entry = pending?.entries.find((e) => e.playerId === playerId);
  if (!pending || pending.kind === "first" || !entry?.dice || !BALANCE.reroll) return;
  if (pending.faces) return steerDirectional(state, playerId, strategy);
  const p = state.players[playerId];
  const ctx = state.hidden.roll;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  let need: number | null = null;
  if (ctx?.kind === "creature" || ctx?.kind === "lab" || ctx?.kind === "tournamentCard") need = ctx.target;
  else if (ctx?.kind === "exploration") need = ctx.target - (overallGap(state, playerId) >= BALANCE.catchUpGap ? BALANCE.catchUpBonus : 0);
  if (need !== null) {
    while (p.manaTokens > 0 && sum(entry.dice) < need) {
      const lowest = entry.dice.indexOf(Math.min(...entry.dice));
      if (entry.dice[lowest] > 3) return;
      try {
        rerollDice(state, playerId, [lowest]);
      } catch {
        return;
      }
    }
    return;
  }
  const low = entry.dice.map((d, i) => ({ d, i })).filter((x) => x.d <= 2).map((x) => x.i);
  for (let n = Math.min(low.length, p.manaTokens); n > 0; n--) {
    try {
      rerollDice(state, playerId, low.slice(0, n));
      return;
    } catch {
      // 기운이 모자라면 더 적은 수로 다시 시도한다
    }
  }
}

// 방향형(48절): 지금 눈이 평균보다 나쁘면 다시 굴리고, 옆 눈이 더 좋으면 조정한다 (기운이 허락하는 만큼)
function steerDirectional(state: GameState, playerId: string, strategy: BotStrategy): void {
  const ctx = state.hidden.roll;
  const pending = state.pendingRoll;
  if (ctx?.kind !== "direction" || !pending) return;
  const entry = pending.entries.find((e) => e.playerId === playerId)!;
  const player = state.players[playerId];
  const v = ctx.faces.map((o) => outcomeValue(state, strategy, player, ctx.card, o));
  const mean = v.reduce((a, b) => a + b, 0) / 6;
  for (let guard = 0; guard < 8; guard++) {
    const f = entry.dice![0] - 1;
    const best = Math.max(v[f - 1] ?? -Infinity, v[f + 1] ?? -Infinity);
    try {
      if (BALANCE.dirAdjustCost > 0 && best - v[f] >= 0.4 * BALANCE.dirAdjustCost) {
        adjustDie(state, playerId, (v[f + 1] ?? -Infinity) >= (v[f - 1] ?? -Infinity) ? 1 : -1);
        continue;
      }
      if (v[f] < mean - 0.05) {
        rerollDice(state, playerId, [0]);
        continue;
      }
    } catch {
      return;
    }
    return;
  }
}

// 마법생물: 능력과 세트 모으기(하늘·육지·바다를 1장씩 모으면 최종 점수)를 반영한다
function creatureValue(state: GameState, strategy: BotStrategy, player: PlayerGameState, card: CreatureCard): number {
  const a = card.ability;
  // 57절 교감: 데려오면 그 속성의 능력치가 1 오른다 (생물 능력은 없다)
  const bond = BALANCE.creatureBond ? 1.5 * weightsOf(state, strategy, player)[BALANCE.creatureBondStats[card.element]] : 0;
  let v = 1 + (BALANCE.creatureBond ? bond : a.trigger === "acquire" && a.effect === "spellPower" ? a.amount * 1.5 * weightsOf(state, strategy).spellPower : 0.6);
  // 세트(하늘·육지·바다 1장씩)를 완성하는 데 가장 부족한 속성일수록 가치가 높다
  const counts = (["sky", "land", "ocean"] as const).map((el) => player.creatures.filter((c) => c.element === el).length);
  if (player.creatures.filter((c) => c.element === card.element).length === Math.min(...counts)) v += 1;
  // 56절 A1: 어려운 생물·세트 완성 보너스 학점
  if (card.trainTarget >= BALANCE.creatureRareMin) v += BALANCE.creatureRareCredit * 2;
  if (creatureSets([...player.creatures, card]) > creatureSets(player.creatures)) v += BALANCE.creatureSetCredit * 2.5;
  return v - card.trainTarget * 0.025;
}

// 구역에 공개된 카드 중 고를 카드의 id (비용을 낼 수 있는 카드만). 마법생물·연구 카드는 살 수 있는 카드가 없으면 null(가져가지 않고 넘어감)
export function choosePick(state: GameState, strategy: BotStrategy): string | null {
  const pick = state.pendingPick;
  if (!pick) return null;
  const player = state.players[pick.playerId];
  const cards = state.hidden.offers[pick.activityId] ?? [];
  const afford = (card: (typeof cards)[number]): boolean => {
    if (pick.activityId === "lab") return canPay(player, 0, (card as LabCard).cost);
    return true;
  };
  const options = cards.filter(afford);
  if (options.length === 0) return null;
  if (strategy.random) return pickOne(options).id;
  const value = (card: (typeof cards)[number]): number => {
    if (BALANCE.directionalResults) {
      const v = directionalCardValue(state, strategy, player, pick.activityId as "creature" | "lab" | "exploration", card as CreatureCard | LabCard | ExplorationCard);
      return pick.activityId === "lab" ? v - (card as LabCard).cost * 0.3 : v;
    }
    switch (pick.activityId) {
      case "creature":
        return creatureValue(state, strategy, player, card as CreatureCard);
      case "lab": {
        const lab = card as LabCard;
        return labChance(player, lab) * (effectValue(state, strategy, lab.effect, player) + 1) - labCost(lab) * 0.3; // 61절: 목표값이 카드마다 달라 성공 확률을 곱한다
      }
      case "tournament":
        return tournamentCardValue(state, strategy, player, card as TournamentCard);
      default:
        return explorationValue(state, strategy, player, card as ExplorationCard);
    }
  };
  return [...options].sort((a, b) => value(b) - value(a))[0].id;
}
