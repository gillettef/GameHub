// 스모크 테스트에서 "사람 플레이어" 역할을 하는 가짜 클라이언트의 행동 규칙 (smoke.ts, smoke-bot.ts 공용).
// 상태를 받을 때마다 지금 해야 할 일 하나를 골라 돌려준다. key는 같은 상황에서 중복 전송하지 않기 위한 표식이다.
import { BALANCE } from "../src/game/config.js";
import { availableActivities, duelTargets } from "../src/game/engine.js";
import type { PublicGameState } from "../src/game/types.js";

export interface SmokeAction {
  key: string;
  message: object;
}

export function nextAction(game: PublicGameState, playerId: string): SmokeAction | null {
  const me = game.players[playerId];
  const base = `${game.round}:${game.phase}`;

  // 주사위를 굴려야 하면 버튼을 누른다
  const roll = game.pendingRoll;
  if (roll) {
    const mine = roll.entries.find((e) => e.playerId === playerId);
    if (mine && mine.dice === null) return { key: `${base}:roll:${roll.kind}`, message: { type: "roll_dice" } };
    return null;
  }

  if (game.phase === "class" && !me.hasActedThisPhase) {
    // 3주차에 카드를 열 지력토큰 1개는 남기고, 체력토큰이 남아 있는 동안 카드를 열어 본다. 다 열었으면 살 수 있는 카드를 가져간다
    const openedCost = me.offeredClassCards.reduce((sum, c) => sum + c.takeCost, 0);
    const key = `${base}:class:${me.offeredClassCards.length}`;
    if (game.classLeft > 0 && me.intelligenceTokens - BALANCE.openCardCost >= 1 && openedCost < me.staminaTokens) {
      return { key: `${key}:open`, message: { type: "open_class_card" } };
    }
    let stamina = me.staminaTokens;
    const keep: string[] = [];
    for (const card of me.offeredClassCards) {
      if (card.takeCost > stamina) continue;
      stamina -= card.takeCost;
      keep.push(card.id);
    }
    return { key: `${key}:submit`, message: { type: "submit_class_choice", keepCardIds: keep } };
  }

  if (game.phase === "activity" && game.pendingLab?.playerId === playerId) {
    // 체력토큰으로 살 수 있는 카드가 있으면 고르고, 없으면 고르지 않고 넘어간다
    const card = game.pendingLab.cards.find((c) => c.cost <= me.staminaTokens);
    return { key: `${base}:lab:${game.activityTurnPointer}`, message: { type: "choose_lab_card", cardId: card?.id ?? null } };
  }

  if (game.phase === "activity" && !game.pendingLab && game.activityOrder[game.activityTurnPointer] === playerId) {
    const free = availableActivities(game, playerId);
    const activityId = free[Math.floor(Math.random() * free.length)];
    const targetPlayerId = activityId === "duel" ? duelTargets(game, playerId)[0] : undefined;
    return { key: `${base}:activity:${game.activityTurnPointer}`, message: { type: "select_activity", activityId, targetPlayerId } };
  }
  return null;
}
