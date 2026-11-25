// 플레이어 행동 하나(옛 서버의 WebSocket 메시지 하나)와 그 행동을 엔진 함수에 넘기는 곳.
// 옛 메시지: take_class_card·cram·choose_dream·select_activity·pick_activity_card·roll_dice·reroll_dice·play_note·confirm_roll
import {
  adjustDie,
  advanceResolution,
  canAdvanceResolution,
  chooseActivityCard,
  chooseDream,
  confirmRoll,
  cramTurn,
  currentRoller,
  playNote,
  rerollDice,
  selectActivity,
  submitRoll,
  takeClassCard,
} from "./engine";
import type { ActivityId, GameState, KeptToken, StatKey } from "./types";

export type Action =
  /** 2주차: 공개된 수업카드 1장(null 이면 넘어가기)을 배우기 또는 노트로 */
  | { type: "class"; cardId: string | null; mode: "learn" | "note" }
  /** 시험 주간 벼락치기(규칙 스위치 cram) */
  | { type: "cram"; from: KeptToken | null }
  /** 장래희망 바꾸기(지금 규칙은 1장을 받아 고를 수 없다) */
  | { type: "dream"; dreamId: string }
  /** 3주차: 활동(카드) 고르기. 겨루기는 지목할 친구(플레이어 id) */
  | { type: "select"; activityId: ActivityId; target?: string; cardId?: string }
  /** 공개된 카드 중 1장(null 이면 넘어가기) */
  | { type: "pick"; cardId: string | null }
  /** 주사위 굴리기. count 는 낼 기운 개수, assist 는 보조 기운 */
  | { type: "roll"; count?: number; assist?: number }
  | { type: "reroll"; dice: number[] }
  | { type: "adjust"; delta: 1 | -1 }
  | { type: "note"; stat: StatKey }
  | { type: "confirm" };

/** 지금 행동할 사람(플레이어 id). 진행 단계에서 다음 활동을 기다리는 중이면 null(advance 로 넘긴다). 옛 서버 scheduleBots 와 같은 순서로 본다 */
export function actorOf(game: GameState): string | null {
  if (game.phase === "ended") return null;
  if (game.pendingRoll) return currentRoller(game) ?? null;
  if (game.phase === "class") return game.classPickOrder[game.classPickPointer] ?? null;
  if (game.phase === "cram") return game.cramOrder[game.cramPointer] ?? null;
  if (game.phase === "activity" && game.activityStage === "choose") return game.activityOrder[game.activityTurnPointer] ?? null;
  if (game.phase === "activity" && game.pendingPick) return game.pendingPick.playerId;
  return null;
}

/** 진행 단계에서 다음 활동으로 넘길 수 있는가(옛 서버는 3초 뒤 자동으로 넘겼다) */
export const waitingToAdvance = (game: GameState): boolean => game.phase === "activity" && !game.pendingPick && !game.pendingRoll && canAdvanceResolution(game);

/** 행동 하나를 그 자리에서 적용한다. 규칙에 맞지 않으면 Error(메시지는 사용자에게 보인다) */
export function applyAction(game: GameState, playerId: string, action: Action): void {
  switch (action.type) {
    case "class":
      return takeClassCard(game, playerId, action.cardId, action.mode);
    case "cram":
      return cramTurn(game, playerId, action.from);
    case "dream":
      return chooseDream(game, playerId, action.dreamId);
    case "select":
      return selectActivity(game, playerId, action.activityId, action.target, action.cardId);
    case "pick":
      return chooseActivityCard(game, playerId, action.cardId);
    case "roll":
      return submitRoll(game, playerId, action.count, action.assist ?? 0);
    case "reroll":
      return rerollDice(game, playerId, action.dice);
    case "adjust":
      return adjustDie(game, playerId, action.delta);
    case "note":
      return playNote(game, playerId, action.stat);
    case "confirm":
      return confirmRoll(game, playerId);
  }
}

/** 진행 단계의 다음 활동으로 넘긴다 */
export const advance = (game: GameState): void => advanceResolution(game);
