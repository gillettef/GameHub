// 스모크 테스트에서 "사람 플레이어" 역할을 하는 가짜 클라이언트의 행동 규칙 (smoke.ts, smoke-bot.ts 공용).
// 상태를 받을 때마다 지금 해야 할 일 하나를 골라 돌려준다. key는 같은 상황에서 중복 전송하지 않기 위한 표식이다.
import { availableActivities, canPay, canTakeClassCard, duelTargets } from "../src/game/engine.js";
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
    // 한 명씩 차례대로: 아직 확인하지 않은 첫 참여자가 나일 때만 굴리고, 굴렸으면 확인을 누른다
    const mine = roll.entries.find((e) => !e.confirmed);
    if (mine?.playerId !== playerId) return null;
    if (mine.dice === null) return { key: `${base}:roll:${roll.kind}:${roll.title}`, message: { type: "roll_dice" } };
    // 63절: 낼 수 있는 노트가 있으면 한 장 낸다
    const note = (me.notes ?? []).find((s) => mine.noteStats?.includes(s));
    if (note) return { key: `${base}:note:${roll.title}:${(me.notes ?? []).length}`, message: { type: "play_note", stat: note } };
    return { key: `${base}:confirm:${roll.kind}:${roll.title}`, message: { type: "confirm_roll" } };
  }

  // 시험 달 벼락치기: 내 차례면 넘어간다
  if (game.phase === "cram") {
    if (game.cramOrder[game.cramPointer] !== playerId) return null;
    return { key: `${base}:cram:${game.cramPointer}`, message: { type: "cram", from: null } };
  }

  // 정규수업: 선 순서상 내 차례에만 공개된 카드 중 체력기운으로 살 수 있는 카드 1장을 가져간다 (없으면 넘어감)
  if (game.phase === "class") {
    if (game.classPickOrder[game.classPickPointer] !== playerId) return null;
    const card = game.classMarket.find((c) => canTakeClassCard(me, c));
    // 63절: 노트 칸이 남으면 번갈아 노트로 보관한다
    const mode = game.rules.skillRules && (me.notes ?? []).length < me.intelligence && game.classPickPointer % 2 === 0 ? "note" : "learn";
    return { key: `${base}:class:${game.classPickPointer}`, message: { type: "take_class_card", cardId: card?.id ?? null, mode } };
  }

  // 공개된 카드(구역 카드·마법 겨루기 마도서) 중 비용을 낼 수 있는 카드를 고른다 (없으면 넘어감)
  if (game.phase === "activity" && game.pendingPick?.playerId === playerId) {
    const pick = game.pendingPick;
    const cards = game.activityOffers[pick.activityId]?.cards ?? [];
    const card = cards.find((c) => {
      if (!c.cost) return true;
      if (c.cost.kind === "stamina") return canPay(me, 0, c.cost.amount);
      return me.manaTokens >= c.cost.amount;
    });
    return { key: `${base}:pick:${game.activityResolvePointer}:${cards.length}`, message: { type: "pick_activity_card", cardId: card?.id ?? null } };
  }

  if (game.phase === "activity" && game.activityStage === "choose" && game.activityOrder[game.activityTurnPointer] === playerId) {
    const free = availableActivities(game, playerId);
    const activityId = free[Math.floor(Math.random() * free.length)];
    const targetPlayerId = activityId === "duel" ? duelTargets(game, playerId)[0] : undefined;
    return { key: `${base}:activity:${game.activityTurnPointer}`, message: { type: "select_activity", activityId, targetPlayerId } };
  }
  return null;
}
