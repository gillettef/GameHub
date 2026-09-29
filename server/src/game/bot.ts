// AI 봇 의사결정. 실제 게임(함께 플레이)과 밸런스 시뮬레이션(scripts/simulate.ts)이 함께 사용합니다.
// 봇은 단순한 휴리스틱으로 움직입니다. 수업카드는 성향에 맞는 능력치를 우선해 체력토큰이 허용하는 만큼 고르고,
// 방과후활동은 상황(주문서 보유량, 토너먼트 진행도 등)과 성향 가중치를 곱해 점수가 높은 구역을 고릅니다.
import { BALANCE } from "./config.js";
import { growthGap } from "./engine.js";
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

// 수업 단계: 습득할 수업카드 id 목록
export function chooseClassCards(state: GameState, playerId: string, strategy: BotStrategy): string[] {
  const p = state.players[playerId];
  if (strategy.random) {
    const n = Math.floor(Math.random() * (Math.min(p.staminaTokens, p.offeredClassCards.length) + 1));
    return p.offeredClassCards.slice(0, n).map((c) => c.id);
  }
  return [...p.offeredClassCards]
    .sort(
      (a, b) =>
        b.statBoost.amount * strategy.classWeights[b.statBoost.stat] -
        a.statBoost.amount * strategy.classWeights[a.statBoost.stat],
    )
    .slice(0, p.staminaTokens)
    .map((c) => c.id);
}

// 방과후활동 단계: 선택할 구역과 (주문 대결이면) 상대
export function chooseActivityAction(
  state: GameState,
  playerId: string,
  strategy: BotStrategy,
): { activityId: ActivityId; targetPlayerId?: string; useStamina: boolean } {
  const p = state.players[playerId];
  // 주문 대결은 아직 활동을 고르지 않은 플레이어가 있어야만 고를 수 있다 (그중 한 명을 강제로 지목)
  const targets = state.turnOrder.filter((id) => id !== playerId && !state.players[id].hasActedThisPhase);
  const free = ACTIVITIES.filter((a) => state.activitySlots[a] === null && (a !== "duel" || targets.length > 0));
  const base: Record<ActivityId, number> = {
    tournament: Math.min(effectiveStat(p, "spellPower"), BALANCE.tournamentMaxTrack - p.tournamentTrack) * 0.5,
    creature: p.spellbookTokens >= 3 ? 2 : 0.5,
    duel: 1.5,
    // 선두에게 뒤처졌다면 한 방을 노려볼 만하다 (탐험 역전 보너스)
    exploration: growthGap(state, playerId) >= BALANCE.catchUpGap ? 2.4 : 1.2,
    // 지력이 높을수록 실험 재료를 많이 펼치므로 연구실의 매력이 올라간다
    lab: 1 + 0.3 * effectiveStat(p, "intelligence"),
  };
  const scored = free.map((a) => ({
    a,
    score: (strategy.random ? 1 : base[a] * strategy.activityBias[a]) * (0.7 + Math.random() * 0.6),
  }));
  scored.sort((x, y) => y.score - x.score);
  const activityId = scored[0].a;
  // 주문 대결 상대: 아직 활동을 고르지 않은 플레이어 중 주문력이 가장 높은(가장 위협적인) 사람
  const targetPlayerId =
    activityId === "duel"
      ? [...targets].sort((a, b) => state.players[b].spellPower - state.players[a].spellPower)[0]
      : undefined;
  // 남은 체력토큰은 4주차에 소멸하므로 있으면 집중에 쓴다
  return { activityId, targetPlayerId, useStamina: p.staminaTokens > 0 };
}

// 연구실 실험: 펼쳐진 연구 카드 중 고를 카드 id (영구 능력치는 성향 가중치로, 임시/토큰/엿보기는 낮게 평가)
export function chooseLabCard(state: GameState, strategy: BotStrategy): string {
  const cards = state.pendingLab?.cards ?? [];
  if (strategy.random) return cards[Math.floor(Math.random() * cards.length)].id;
  const value = (card: (typeof cards)[number]): number => {
    const e = card.effect;
    let v = 0;
    for (const [stat, n] of Object.entries(e.stats ?? {})) v += (n ?? 0) * strategy.classWeights[stat as StatKey] * 1.5;
    for (const [stat, n] of Object.entries(e.tempStats ?? {})) v += (n ?? 0) * strategy.classWeights[stat as StatKey] * 0.5;
    v += (e.credit ?? 0) * 3;
    v += (e.peekExploration ? 0.8 : 0) + (e.nextSpellbook ?? 0) * 0.4 + (e.nextStamina ?? 0) * 0.5;
    return v;
  };
  return [...cards].sort((a, b) => value(b) - value(a))[0].id;
}
