// AI 봇 의사결정. 실제 게임(함께 플레이)과 밸런스 시뮬레이션(scripts/simulate.ts)이 함께 사용합니다.
// 봇은 단순한 휴리스틱으로 움직입니다. 수업카드는 공개된 카드 중 성향에 맞는 능력치를 우선해 체력기운이 허용하는 카드를 1장 고르고,
// 자율활동은 상황(마나기운 보유량, 토너먼트 진행도 등)과 성향 가중치를 곱해 점수가 높은 구역을 고릅니다.
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
}

const even: Record<ActivityId, number> = { tournament: 1, creature: 1, duel: 1, exploration: 1, lab: 1 };
const leaning = (a: ActivityId, weight: number): Record<ActivityId, number> => ({ ...even, [a]: weight });

const BALANCED_WEIGHTS: Record<StatKey, number> = { intelligence: 1.2, spellPower: 1.2, stamina: 1, charm: 0.6 };

// 함께 플레이할 때 봇에게 무작위로 부여되는 성향 (한 활동만 고집하면 약해지므로 가중치는 약하게)
export const BOT_PERSONALITIES: BotStrategy[] = [
  { name: "균형형", classWeights: BALANCED_WEIGHTS, activityBias: even },
  { name: "토너먼트형", classWeights: { ...BALANCED_WEIGHTS, spellPower: 1.5 }, activityBias: leaning("tournament", 2.5) },
  { name: "조련사형", classWeights: BALANCED_WEIGHTS, activityBias: leaning("creature", 2.5) },
  { name: "결투가형", classWeights: { ...BALANCED_WEIGHTS, spellPower: 1.5 }, activityBias: leaning("duel", 2.5) },
  { name: "탐험가형", classWeights: BALANCED_WEIGHTS, activityBias: leaning("exploration", 2.5) },
];

export const BOT_NAMES = ["마루", "별이", "모찌", "구름이", "하늘이", "보라", "달이", "솜이", "콩이", "루나"];

export function pickBotPersonality(): BotStrategy {
  return BOT_PERSONALITIES[Math.floor(Math.random() * BOT_PERSONALITIES.length)];
}

// 공개된 다음 시험 카드가 겨냥하는 능력치는 더 키운다 (주사위 능력치 ×1.6, 보너스 능력치 ×1.25)
function examWeight(state: GameState, stat: StatKey): number {
  const upcoming = state.round <= BALANCE.midtermRound ? state.exams.midterm : state.exams.final;
  if (!upcoming) return 1;
  return upcoming.diceStat === stat ? 1.6 : upcoming.bonusStat === stat ? 1.25 : 1;
}

// 지금 라운드에 적용할 능력치 가중치 (단계별 성향이면 후반에 갈아탄다)
function weightsOf(state: GameState, strategy: BotStrategy): Record<StatKey, number> {
  return strategy.lateClassWeights && state.round >= (strategy.lateFromRound ?? 7) ? strategy.lateClassWeights : strategy.classWeights;
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
  const fuelPref = (kind: KeptToken) => ACTIVITIES.filter((a) => BALANCE.rollFuel[a] === kind).reduce((s, a) => s + bias[a], 0);
  const options = state.classMarket.filter((c) => canTakeClassCard(p, c));
  // 50절: 이번 달 카드가 공개돼 있으면 하려는 활동을 먼저 정하고, 그 활동의 재료 기운을 주는 과목을 더 높이 친다
  const plan = BALANCE.revealOffersAtMonthStart ? plannedActivity(state, p, strategy) : null;
  const planBoost = (c: (typeof state.classMarket)[number]) => (plan && BALANCE.rollFuel[plan] === classGainKind(c) ? 1.8 : 1);
  const value = (c: (typeof state.classMarket)[number]) =>
    classGainApplied(p, c) * (0.6 * fuelPref(classGainKind(c)) + 0.4 * weightsOf(state, strategy)[c.stat]) * examWeight(state, c.stat) * planBoost(c);
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
  if (activityId === "tournament") return 0;
  // 주문 대결의 가치 = 이길 확률·지목 부담을 감안한 0.35 × (승리 보상 + 주문력 성장)
  if (activityId === "duel")
    return 0.35 * (effectValue(state, strategy, BALANCE.duelWinReward) + effectValue(state, strategy, { stats: { spellPower: BALANCE.growthAmount } }));
  const cards = state.hidden.offers[activityId] ?? [];
  const valueOf = (card: (typeof cards)[number]): number => {
    if (activityId === "creature") return creatureValue(state, strategy, player, card as CreatureCard);
    if (activityId === "lab") return canPay(player, 0, (card as LabCard).cost) ? effectValue(state, strategy, (card as LabCard).effect) - (card as LabCard).cost * 0.3 : -1;
    return explorationValue(state, strategy, player, card as ExplorationCard);
  };
  const values = cards.map(valueOf).sort((a, b) => b - a);
  const taken = state.activitySlots[activityId].length;
  return Math.max(0, values[taken] ?? 0);
}

// 이번 달 하려는 활동 (공개된 카드와 성향을 함께 본다)
function activityAppeal(state: GameState, strategy: BotStrategy, player: PlayerGameState, a: ActivityId): number {
  const base: Record<ActivityId, number> = { tournament: effectiveStat(player, "spellPower") * 0.25, creature: 1.6, duel: 1.5, exploration: 1.2, lab: 1.6 };
  return base[a] * biasOf(state, strategy)[a] + (BALANCE.revealOffersAtMonthStart ? 0.8 * zoneOutlook(state, strategy, player, a) : 0);
}
function plannedActivity(state: GameState, player: PlayerGameState, strategy: BotStrategy): ActivityId {
  return ACTIVITIES.map((a) => ({ a, v: activityAppeal(state, strategy, player, a) })).sort((x, y) => y.v - x.v)[0].a;
}

// 자율활동 단계: 선택할 구역과 (주문 대결이면) 상대
export function chooseActivityAction(
  state: GameState,
  playerId: string,
  strategy: BotStrategy,
): { activityId: ActivityId; targetPlayerId?: string } {
  const p = state.players[playerId];
  // 주문 대결은 아직 활동을 고르지 않은 플레이어가 있어야만 고를 수 있다 (그중 한 명을 강제로 지목)
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
  // 주문 대결 상대: 아직 활동을 고르지 않은 플레이어 중 주문력이 가장 높은(가장 위협적인) 사람
  const targetPlayerId =
    activityId === "duel"
      ? [...targets].sort(() => Math.random() - 0.5).sort((a, b) => state.players[b].spellPower - state.players[a].spellPower)[0] // 동점이면 무작위 (앞자리만 지목하지 않도록)
      : undefined;
  return { activityId, targetPlayerId };
}

// 카드 효과의 대략적인 가치 (영구 능력치는 성향 가중치로, 임시/기운/엿보기는 낮게 평가)
function effectValue(state: GameState, strategy: BotStrategy, e: CardEffect): number {
  let v = 0;
  for (const [stat, n] of Object.entries(e.stats ?? {})) v += (n ?? 0) * weightsOf(state, strategy)[stat as StatKey] * examWeight(state, stat as StatKey) * 1.5;
  for (const [stat, n] of Object.entries(e.tempStats ?? {})) v += (n ?? 0) * weightsOf(state, strategy)[stat as StatKey] * examWeight(state, stat as StatKey) * 0.5;
  v += (e.credit ?? 0) * 3;
  v += (e.peekExploration ? 0.8 : 0) + (e.nextMana ?? 0) * 0.4 + (e.nextStamina ?? 0) * 0.5;
  for (const n of Object.values(e.tokens ?? {})) v += (n ?? 0) * 0.4;
  return v;
}

// 방향형 결과(48절)의 눈 하나의 가치
function outcomeValue(state: GameState, strategy: BotStrategy, player: PlayerGameState, card: CreatureCard | LabCard | ExplorationCard, o: DirectionOutcome, shielded = false): number {
  if (o.harmful && shielded) return 0;
  return effectValue(state, strategy, o.effect) + (o.acquire ? 1.5 * creatureValue(state, strategy, player, card as CreatureCard) + 1 : 0);
}
const directionalCardValue = (state: GameState, strategy: BotStrategy, player: PlayerGameState, activity: "creature" | "lab" | "exploration", card: CreatureCard | LabCard | ExplorationCard) =>
  directionFaces(activity, card).reduce((a, o) => a + outcomeValue(state, strategy, player, card, o), 0) / 6;

// 탐험 카드: 성공 확률(주사위 + 능력치 + 집중 + 역전 보너스)로 기대값을 계산한다
function explorationValue(state: GameState, strategy: BotStrategy, player: PlayerGameState, card: ExplorationCard): number {
  const success = effectValue(state, strategy, card.success);
  const failure = effectValue(state, strategy, card.failure);
  if (!card.check) return success;
  const p = explorationChance(state, player, card);
  return p * success + (1 - p) * failure;
}

// 굴리기 전에 쓸 보조 능력치 기운 개수 (38-6절). 토너먼트: 다음 달로 남길 체력기운 1개만 빼고 모두 달리는 데 쓴다.
// 탐험: 실패하면 손해가 있는 카드이고 지력기운이 있으면 함정을 간파한다
export function botAssist(state: GameState, playerId: string): number {
  const pending = state.pendingRoll;
  const max = pending?.entries.find((e) => e.playerId === playerId)?.assistMax ?? 0;
  if (!pending?.assist || max <= 0) return 0;
  if (pending.assist.kind === "stamina") return Math.min(max, Math.max(0, state.players[playerId].staminaTokens - 1));
  const ctx = state.hidden.roll;
  const card = ctx?.kind === "exploration" ? ctx.card : ctx?.kind === "direction" && ctx.activity === "exploration" ? (ctx.card as ExplorationCard) : null;
  if (!card) return 0;
  const f = card.failure;
  const harmful = [...Object.values(f.stats ?? {}), ...Object.values(f.tempStats ?? {}), f.credit ?? 0, f.nextMana ?? 0, f.nextStamina ?? 0].some((n) => (n ?? 0) < 0);
  return harmful ? 1 : 0;
}

// 결과 확인 전에 남은 마나기운으로 낮게 나온 주사위를 다시 굴린다 (선 정하기는 제외). 목표값이 있는 혼자 판정(조련·연구실·탐험)은
// 합이 모자랄 때만 가장 낮은 주사위부터 한 개씩 다시 굴리고(3 이하만), 그 밖의 굴림은 1~2가 나온 주사위를 다시 굴린다
export function rerollLowDice(state: GameState, playerId: string, strategy: BotStrategy = BOT_PERSONALITIES[0]): void {
  const pending = state.pendingRoll;
  const entry = pending?.entries.find((e) => e.playerId === playerId);
  if (!pending || pending.kind === "first" || !entry?.dice) return;
  if (pending.faces) return steerDirectional(state, playerId, strategy);
  const p = state.players[playerId];
  const ctx = state.hidden.roll;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  let need: number | null = null;
  if (ctx?.kind === "creature" || ctx?.kind === "lab") need = ctx.target;
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
  const shielded = (entry.assist ?? 0) > 0;
  const v = ctx.faces.map((o) => outcomeValue(state, strategy, player, ctx.card, o, shielded));
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
  let v = 1 + (a.trigger === "acquire" && a.effect === "spellPower" ? a.amount * 1.5 * weightsOf(state, strategy).spellPower : 0.6);
  // 세트(하늘·육지·바다 1장씩)를 완성하는 데 가장 부족한 속성일수록 가치가 높다
  const counts = (["sky", "land", "ocean"] as const).map((el) => player.creatures.filter((c) => c.element === el).length);
  if (player.creatures.filter((c) => c.element === card.element).length === Math.min(...counts)) v += 1;
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
        return effectValue(state, strategy, lab.effect) - lab.cost * 0.3; // 같은 효과라면 싼 카드가 좋다
      }
      default:
        return explorationValue(state, strategy, player, card as ExplorationCard);
    }
  };
  return [...options].sort((a, b) => value(b) - value(a))[0].id;
}
