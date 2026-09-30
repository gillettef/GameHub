// AI 봇 의사결정. 실제 게임(함께 플레이)과 밸런스 시뮬레이션(scripts/simulate.ts)이 함께 사용합니다.
// 봇은 단순한 휴리스틱으로 움직입니다. 수업카드는 지력토큰으로 열어 보고 성향에 맞는 능력치를 우선해 체력토큰이 허용하는 만큼 고르고,
// 자율활동은 상황(주문서 보유량, 토너먼트 진행도 등)과 성향 가중치를 곱해 점수가 높은 구역을 고릅니다.
import { BALANCE } from "./config.js";
import {
  activityExtraCost,
  activityOpenCost,
  availableActivities,
  canPay,
  charmRate,
  classCardsLeft,
  duelTargets,
  growthGap,
  openClassCard,
  submitClassChoice,
} from "./engine.js";
import { effectiveStat, type ActivityId, type GameState, type StatKey } from "./types.js";

export const ACTIVITIES: ActivityId[] = ["tournament", "creature", "duel", "exploration", "lab"];

export interface BotStrategy {
  name: string;
  classWeights: Record<StatKey, number>;
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

// 연구실만 파는 성향은 3주차에 카드를 여러 장 펼치므로 지력·체력토큰을 더 남겨 둔다
const isLabLeaning = (strategy: BotStrategy) => strategy.activityBias.lab >= 3;

// 공개된 다음 시험 카드가 겨냥하는 능력치는 더 키운다 (주사위 능력치 ×1.6, 보너스 능력치 ×1.25)
function examWeight(state: GameState, stat: StatKey): number {
  const upcoming = state.round <= BALANCE.midtermRound ? state.exams.midterm : state.exams.final;
  if (!upcoming) return 1;
  return upcoming.diceStat === stat ? 1.6 : upcoming.bonusStat === stat ? 1.25 : 1;
}

// 정규수업 단계 한 턴: 지력토큰으로 수업카드를 열어 보고, 체력토큰이 허용하는 만큼 골라 습득한다.
// 3주차에 카드를 여는 활동(마법생물·비밀의 방·연구실)에도 지력토큰이 들기 때문에 일부는 남겨 둔다
export function playClassTurn(state: GameState, playerId: string, strategy: BotStrategy): void {
  const p = state.players[playerId];
  const tokenReserve = isLabLeaning(strategy) ? 3 : 1;
  // 매력토큰은 체력토큰 대신 낼 수 있으므로 체력토큰처럼 센다
  const staminaBudget = Math.max(0, p.staminaTokens + Math.floor(p.charmTokens / charmRate(p)) - (isLabLeaning(strategy) ? 3 : 0));
  // 성향에 맞는 능력치의 카드를 우선해서 (싼 카드일수록 좋게 보고) 체력토큰이 허용하는 만큼 습득할 카드를 고른다
  const value = (c: (typeof p.offeredClassCards)[number]) =>
    strategy.random ? Math.random() : (c.statBoost.amount * strategy.classWeights[c.statBoost.stat] * examWeight(state, c.statBoost.stat)) / c.takeCost;
  const pickKeep = () => {
    let stamina = staminaBudget;
    const keep: string[] = [];
    for (const card of [...p.offeredClassCards].sort((a, b) => value(b) - value(a))) {
      if (strategy.random && Math.random() < 0.3) continue;
      if (card.takeCost > stamina) continue;
      keep.push(card.id);
      stamina -= card.takeCost;
    }
    return { keep, left: stamina };
  };
  // 카드를 열려면 지력토큰이 든다. 습득할 여력(체력토큰)이 남아 있을 때만 더 열어 본다
  while (p.intelligenceTokens - BALANCE.openCardCost >= (strategy.random ? 0 : tokenReserve) && classCardsLeft(state) > 0) {
    if (strategy.random ? Math.random() < 0.2 : pickKeep().left < 1) break;
    openClassCard(state, playerId);
  }
  submitClassChoice(state, playerId, pickKeep().keep);
}

// 자율활동 단계: 선택할 구역과 (주문 대결이면) 상대
export function chooseActivityAction(
  state: GameState,
  playerId: string,
  strategy: BotStrategy,
): { activityId: ActivityId; targetPlayerId?: string; useStamina: boolean } {
  const p = state.players[playerId];
  // 주문 대결은 아직 활동을 고르지 않은 플레이어가 있어야만 고를 수 있다 (그중 한 명을 강제로 지목)
  const targets = duelTargets(state, playerId);
  const free = availableActivities(state, playerId);
  const base: Record<ActivityId, number> = {
    tournament: effectiveStat(p, "spellPower") * 0.5,
    creature: p.spellbookTokens >= 3 ? 2 : 0.5,
    duel: 1.5,
    // 선두에게 뒤처졌다면 한 방을 노려볼 만하다 (탐험 역전 보너스)
    exploration: growthGap(state, playerId) >= BALANCE.catchUpGap ? 2.4 : 1.2,
    // 지력이 높을수록 실험 재료를 많이 펼치므로 연구실의 매력이 올라간다
    lab: 1 + 0.3 * effectiveStat(p, "intelligence"),
  };
  const scored = free.map((a) => {
    // 이미 친구가 있는 구역은 체력토큰이 더 들어서 조금 덜 끌린다. 다만 협력 탐험 카드가 기다리고 있으면 함께하러 간다
    const crowded = state.activitySlots[a].length > 0 ? 0.8 : 1;
    const coop = a === "exploration" && state.coopWaiting ? 2 : 1;
    return {
      a,
      score: (strategy.random ? 1 : base[a] * strategy.activityBias[a] * crowded * coop) * (0.7 + Math.random() * 0.6),
    };
  });
  scored.sort((x, y) => y.score - x.score);
  const activityId = scored[0].a;
  // 주문 대결 상대: 아직 활동을 고르지 않은 플레이어 중 주문력이 가장 높은(가장 위협적인) 사람
  const targetPlayerId =
    activityId === "duel"
      ? [...targets].sort((a, b) => state.players[b].spellPower - state.players[a].spellPower)[0]
      : undefined;
  // 남은 체력토큰은 4주차에 소멸하므로 (참가비를 낸 뒤에도) 남아 있으면 집중에 쓴다.
  // 다만 연구실은 카드를 고를 때 체력토큰이 들기 때문에 넉넉할 때만 집중한다
  const extra = activityExtraCost(state, activityId);
  const feeByCharm = Math.min(extra, p.charmTokens);
  const spare = p.staminaTokens - (extra - feeByCharm) + Math.floor((p.charmTokens - feeByCharm) / charmRate(p));
  // 엔진과 같은 규칙으로 (지력토큰·참가비까지 함께) 집중할 여력이 실제로 있는지 확인한다
  const canFocus = canPay(p, activityOpenCost(state, activityId), 1, extra);
  return { activityId, targetPlayerId, useStamina: canFocus && (activityId === "lab" ? spare >= 5 : spare > 0) };
}

// 연구실 실험: 펼쳐진 연구 카드 중 체력토큰으로 살 수 있는 카드의 id (영구 능력치는 성향 가중치로, 임시/토큰/엿보기는 낮게 평가).
// 살 수 있는 카드가 없으면 null(아무것도 고르지 않고 넘어감)
export function chooseLabCard(state: GameState, strategy: BotStrategy): string | null {
  const owner = state.players[state.pendingLab?.playerId ?? ""];
  const stamina = owner ? owner.staminaTokens + Math.floor(owner.charmTokens / charmRate(owner)) : 0;
  const cards = (state.pendingLab?.cards ?? []).filter((c) => c.cost <= stamina);
  if (cards.length === 0) return null;
  if (strategy.random) return cards[Math.floor(Math.random() * cards.length)].id;
  const value = (card: (typeof cards)[number]): number => {
    const e = card.effect;
    let v = 0;
    for (const [stat, n] of Object.entries(e.stats ?? {})) v += (n ?? 0) * strategy.classWeights[stat as StatKey] * examWeight(state, stat as StatKey) * 1.5;
    for (const [stat, n] of Object.entries(e.tempStats ?? {})) v += (n ?? 0) * strategy.classWeights[stat as StatKey] * examWeight(state, stat as StatKey) * 0.5;
    v += (e.credit ?? 0) * 3;
    v += (e.peekExploration ? 0.8 : 0) + (e.nextSpellbook ?? 0) * 0.4 + (e.nextStamina ?? 0) * 0.5;
    return v - card.cost * 0.3; // 같은 효과라면 싼 카드가 좋다
  };
  return [...cards].sort((a, b) => value(b) - value(a))[0].id;
}
