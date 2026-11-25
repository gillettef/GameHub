// 봇 한 차례(옛 server/src/app.ts 의 takeAutoAction·runBotFallback 을 그대로 옮김). 엔진 함수를 판에 직접 부른다.
import { botAssist, chooseActivityAction, choosePick, playClassTurn, playCramTurn, rerollLowDice, type BotStrategy } from "./bot";
import { availableActivities, duelTargets, pickableCards } from "./engine";
import { chooseActivityCard, confirmRoll, cramTurn, selectActivity, submitRoll, takeClassCard } from "./record";
import type { GameState } from "./types";

/** 봇의 평소 판단이 예외를 내더라도 게임이 멈추지 않도록 하는 가장 단순한 행동 */
export function runBotFallback(game: GameState, botId: string): void {
  if (game.pendingRoll) {
    const entry = game.pendingRoll.entries.find((e) => e.playerId === botId);
    if (entry?.dice === null) submitRoll(game, botId);
    else confirmRoll(game, botId);
  } else if (game.phase === "class") {
    takeClassCard(game, botId, null);
  } else if (game.phase === "cram") {
    cramTurn(game, botId, null);
  } else if (game.pendingPick) {
    // 반드시 골라야 하는 카드(탐험)는 첫 카드를, 나머지는 넘어간다
    const first = pickableCards(game, game.pendingPick.activityId)[0]?.id ?? null;
    const mustPick = game.pendingPick.activityId === "exploration";
    chooseActivityCard(game, botId, mustPick ? first : null);
  } else if (game.phase === "activity" && game.activityStage === "choose") {
    const activityId = availableActivities(game, botId)[0];
    if (activityId) selectActivity(game, botId, activityId, activityId === "duel" ? duelTargets(game, botId)[0] : undefined);
  }
}

/** 봇이 지금 해야 할 행동을 성향대로 한 번 한다(굴린 뒤 다시 굴리기·노트·확인까지). 판단이 예외를 내면 그대로 던진다(이미 한 행동은 판에 남는다) */
export function takeBotTurn(game: GameState, playerId: string, strategy: BotStrategy): void {
  if (game.pendingRoll) {
    const entry = game.pendingRoll.entries.find((e) => e.playerId === playerId);
    if (entry?.dice === null) submitRoll(game, playerId, undefined, botAssist(game, playerId));
    else {
      rerollLowDice(game, playerId);
      confirmRoll(game, playerId);
    }
  } else if (game.phase === "class") {
    playClassTurn(game, playerId, strategy);
  } else if (game.phase === "cram") {
    playCramTurn(game, playerId);
  } else if (game.phase === "activity" && game.pendingPick) {
    chooseActivityCard(game, playerId, choosePick(game, strategy));
  } else if (game.phase === "activity") {
    const { activityId, targetPlayerId } = chooseActivityAction(game, playerId, strategy);
    selectActivity(game, playerId, activityId, targetPlayerId);
  }
}
