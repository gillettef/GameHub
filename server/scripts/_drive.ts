// 시뮬레이션·검증 스크립트 공용: 주사위 굴리기와 결과 확인을 한 번에 처리한다
import { botAssist, playCramTurn, rerollLowDice } from "../src/game/bot.js";
import { confirmRoll, currentRoller, submitRoll } from "../src/game/engine.js";
import type { GameState } from "../src/game/types.js";

// 이번 굴림의 참여자가 한 명씩 차례대로 굴리고(다시 굴리기 포함) 확인한다. 모두 확인하면 결과가 적용된다 (그 결과로 새 굴림이 시작돼도 이어서 굴리지 않는다)
export function rollAndConfirm(state: GameState): void {
  const pending = state.pendingRoll;
  if (!pending) return;
  let id: string | undefined;
  while (state.pendingRoll === pending && (id = currentRoller(state))) {
    const entry = pending.entries.find((e) => e.playerId === id)!;
    if (entry.dice === null) submitRoll(state, id, undefined, botAssist(state, id));
    rerollLowDice(state, id);
    confirmRoll(state, id);
  }
}

// 벼락치기 단계에서 차례인 사람이 봇 판단대로 고른다
export function cramStep(state: GameState): void {
  playCramTurn(state, state.cramOrder[state.cramPointer]);
}
