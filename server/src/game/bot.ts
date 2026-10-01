// AI 봇 의사결정. 실제 게임(함께 플레이)과 밸런스 시뮬레이션(scripts/simulate.ts)이 함께 사용합니다.
// 봇은 단순한 휴리스틱으로 움직입니다. 수업카드는 공개된 카드 중 성향에 맞는 능력치를 우선해 체력토큰이 허용하는 카드를 1장 고르고,
// 자율활동은 상황(주문서 보유량, 토너먼트 진행도 등)과 성향 가중치를 곱해 점수가 높은 구역을 고릅니다.
import { BALANCE } from "./config.js";
import {
  availableActivities,
  canPay,
  creatureTokenCaps,
  duelTargets,
  explorationChance,
  rerollDice,
  growthGap,
  takeClassCard,
} from "./engine.js";
import {
  effectiveStat,
  type ActivityId,
  type CardEffect,
  type CreatureCard,
  type ExplorationCard,
  type GameState,
  type GrimoireCard,
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

// 연구실만 파는 성향은 연구 카드 값(체력토큰)을 치를 수 있도록 체력토큰을 조금 남겨 둔다
const isLabLeaning = (strategy: BotStrategy) => strategy.activityBias.lab >= 3;

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

// 정규수업: 내 차례에 공개된 수업카드 중 성향에 맞는 능력치를 우선해서, 체력토큰(매력토큰 교환 포함)으로 살 수 있는 카드 1장을 고른다
export function playClassTurn(state: GameState, playerId: string, strategy: BotStrategy): void {
  const p = state.players[playerId];
  const reserve = isLabLeaning(strategy) ? 2 : 0;
  const value = (c: (typeof state.classMarket)[number]) =>
    (c.statBoost.amount * weightsOf(state, strategy)[c.statBoost.stat] * examWeight(state, c.statBoost.stat)) - c.takeCost * 0.1;
  const affordable = state.classMarket.filter((c) => canPay(p, 0, c.takeCost + reserve) || (strategy.random && canPay(p, 0, c.takeCost)));
  let choice: string | null = null;
  if (affordable.length > 0) {
    choice = strategy.random ? (Math.random() < 0.2 ? null : pickOne(affordable).id) : [...affordable].sort((a, b) => value(b) - value(a))[0].id;
  }
  takeClassCard(state, playerId, choice);
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
    creature: p.spellbookTokens >= 3 ? 2 : 0.5,
    duel: 1.5,
    // 선두에게 뒤처졌다면 한 방을 노려볼 만하다 (탐험 역전 보너스)
    exploration: growthGap(state, playerId) >= BALANCE.catchUpGap ? 2.4 : 1.2,
    // 연구실은 공개된 연구 카드 중 골라 영구 성장을 얻는다
    lab: 1.6,
  };
  const scored = free.map((a) => {
    // 이미 친구가 있는 구역은 체력토큰이 더 들어서 조금 덜 끌린다
    const crowded = state.activitySlots[a].length > 0 ? 0.8 : 1;
    return {
      a,
      score: (strategy.random ? 1 : base[a] * biasOf(state, strategy)[a] * crowded) * (0.7 + Math.random() * 0.6),
    };
  });
  scored.sort((x, y) => y.score - x.score);
  const activityId = scored[0].a;
  // 주문 대결 상대: 아직 활동을 고르지 않은 플레이어 중 주문력이 가장 높은(가장 위협적인) 사람
  const targetPlayerId =
    activityId === "duel"
      ? [...targets].sort((a, b) => state.players[b].spellPower - state.players[a].spellPower)[0]
      : undefined;
  return { activityId, targetPlayerId };
}

// 카드 효과의 대략적인 가치 (영구 능력치는 성향 가중치로, 임시/토큰/엿보기는 낮게 평가)
function effectValue(state: GameState, strategy: BotStrategy, e: CardEffect): number {
  let v = 0;
  for (const [stat, n] of Object.entries(e.stats ?? {})) v += (n ?? 0) * weightsOf(state, strategy)[stat as StatKey] * examWeight(state, stat as StatKey) * 1.5;
  for (const [stat, n] of Object.entries(e.tempStats ?? {})) v += (n ?? 0) * weightsOf(state, strategy)[stat as StatKey] * examWeight(state, stat as StatKey) * 0.5;
  v += (e.credit ?? 0) * 3;
  v += (e.peekExploration ? 0.8 : 0) + (e.nextSpellbook ?? 0) * 0.4 + (e.nextStamina ?? 0) * 0.5;
  return v;
}

// 탐험 카드: 성공 확률(주사위 + 능력치 + 집중 + 역전 보너스)로 기대값을 계산한다. 협력 카드는 두 번째 참가자를 기다려야 해서 낮게 본다
function explorationValue(state: GameState, strategy: BotStrategy, player: PlayerGameState, card: ExplorationCard): number {
  const success = effectValue(state, strategy, card.success);
  const failure = effectValue(state, strategy, card.failure);
  if (card.coop) return 0.6 * success;
  if (!card.check) return success;
  const p = explorationChance(state, player, card);
  return p * success + (1 - p) * failure;
}

// 결과 확인 전에 낮게 나온 주사위(1~2)를 지력토큰이 허락하는 만큼 다시 굴린다 (선 정하기는 제외)
export function rerollLowDice(state: GameState, playerId: string): void {
  const pending = state.pendingRoll;
  const entry = pending?.entries.find((e) => e.playerId === playerId);
  if (!pending || pending.kind === "first" || !entry?.dice) return;
  const p = state.players[playerId];
  const low = entry.dice.map((d, i) => ({ d, i })).filter((x) => x.d <= 2).map((x) => x.i);
  for (let n = Math.min(low.length, p.intelligenceTokens); n > 0; n--) {
    try {
      rerollDice(state, playerId, low.slice(0, n));
      return;
    } catch {
      // 토큰이 모자라면 더 적은 수로 다시 시도한다
    }
  }
}

// 마법생물: 능력과 세트 모으기(하늘·육지·바다를 1장씩 모으면 최종 점수)를 반영한다
function creatureValue(state: GameState, strategy: BotStrategy, player: PlayerGameState, card: CreatureCard): number {
  const a = card.ability;
  let v = 1 + (a.trigger === "acquire" && a.effect === "spellPower" ? a.amount * 1.5 * weightsOf(state, strategy).spellPower : 0.6);
  // 세트(하늘·육지·바다 1장씩)를 완성하는 데 가장 부족한 속성일수록 가치가 높다
  const counts = (["sky", "land", "ocean"] as const).map((el) => player.creatures.filter((c) => c.element === el).length);
  if (player.creatures.filter((c) => c.element === card.element).length === Math.min(...counts)) v += 1;
  return v - card.requiredSpellPower * 0.1;
}

function grimoireValue(state: GameState, strategy: BotStrategy, card: GrimoireCard): number {
  return card.statBoost.amount * weightsOf(state, strategy)[card.statBoost.stat] * examWeight(state, card.statBoost.stat) + (card.ability ? 0.4 : 0);
}

// 구역에 공개된 카드 중 고를 카드의 id (비용을 낼 수 있는 카드만). 마법생물·연구 카드는 살 수 있는 카드가 없으면 null(가져가지 않고 넘어감)
export function choosePick(state: GameState, strategy: BotStrategy): string | null {
  const pick = state.pendingPick;
  if (!pick) return null;
  const player = state.players[pick.playerId];
  const cards = state.hidden.offers[pick.activityId] ?? [];
  const afford = (card: (typeof cards)[number]): boolean => {
    if (pick.activityId === "creature") return creatureTokenCaps(player, card as CreatureCard).length > 0;
    if (pick.activityId === "lab") return canPay(player, 0, (card as LabCard).cost);
    return true;
  };
  const options = cards.filter(afford);
  if (options.length === 0) return null;
  if (strategy.random) return pickOne(options).id;
  const value = (card: (typeof cards)[number]): number => {
    switch (pick.activityId) {
      case "creature":
        return creatureValue(state, strategy, player, card as CreatureCard);
      case "lab": {
        const lab = card as LabCard;
        return effectValue(state, strategy, lab.effect) - lab.cost * 0.3; // 같은 효과라면 싼 카드가 좋다
      }
      case "exploration":
        return explorationValue(state, strategy, player, card as ExplorationCard);
      default:
        return grimoireValue(state, strategy, card as GrimoireCard);
    }
  };
  return [...options].sort((a, b) => value(b) - value(a))[0].id;
}
