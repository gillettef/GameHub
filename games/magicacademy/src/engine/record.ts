// 봇이 부르는 행동 함수. 엔진 함수를 그대로 부르고, 기록기가 켜져 있으면 성공한 행동을 Action 으로 알린다.
// 봇은 옛 서버처럼 엔진 함수를 직접 불러 판을 바꾸며 생각한다. src/def.ts 는 복제한 판에서 봇을 돌려 이 기록으로 다음 행동을 얻는다.
import type { Action } from "./action";
import * as E from "./engine";
import type { ActivityId, GameState, KeptToken, StatKey } from "./types";

type Hook = (playerId: string, action: Action, state: GameState) => void;
let hook: Hook | null = null;

/** fn 을 도는 동안 봇이 한 행동을 on 으로 받는다 */
export function recording<T>(on: Hook, fn: () => T): T {
  const prev = hook;
  hook = on;
  try {
    return fn();
  } finally {
    hook = prev;
  }
}

function done(state: GameState, playerId: string, action: Action): void {
  hook?.(playerId, action, state);
}

export function takeClassCard(state: GameState, playerId: string, cardId: string | null, mode: "learn" | "note" = "learn"): void {
  E.takeClassCard(state, playerId, cardId, mode);
  done(state, playerId, { type: "class", cardId, mode });
}
export function cramTurn(state: GameState, playerId: string, from: KeptToken | null): void {
  E.cramTurn(state, playerId, from);
  done(state, playerId, { type: "cram", from });
}
export function chooseDream(state: GameState, playerId: string, dreamId: string): void {
  E.chooseDream(state, playerId, dreamId);
  done(state, playerId, { type: "dream", dreamId });
}
export function selectActivity(state: GameState, playerId: string, activityId: ActivityId, target?: string, cardId?: string): void {
  E.selectActivity(state, playerId, activityId, target, cardId);
  done(state, playerId, { type: "select", activityId, ...(target !== undefined ? { target } : {}), ...(cardId !== undefined ? { cardId } : {}) });
}
export function chooseActivityCard(state: GameState, playerId: string, cardId: string | null): void {
  E.chooseActivityCard(state, playerId, cardId);
  done(state, playerId, { type: "pick", cardId });
}
export function submitRoll(state: GameState, playerId: string, count?: number, assist = 0): void {
  E.submitRoll(state, playerId, count, assist);
  done(state, playerId, { type: "roll", ...(count !== undefined ? { count } : {}), assist });
}
export function rerollDice(state: GameState, playerId: string, dice: number[]): void {
  E.rerollDice(state, playerId, dice);
  done(state, playerId, { type: "reroll", dice: [...dice] });
}
export function adjustDie(state: GameState, playerId: string, delta: 1 | -1): void {
  E.adjustDie(state, playerId, delta);
  done(state, playerId, { type: "adjust", delta });
}
export function playNote(state: GameState, playerId: string, stat: StatKey): void {
  E.playNote(state, playerId, stat);
  done(state, playerId, { type: "note", stat });
}
export function confirmRoll(state: GameState, playerId: string): void {
  E.confirmRoll(state, playerId);
  done(state, playerId, { type: "confirm" });
}
