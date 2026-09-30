// 시뮬레이션·검증 스크립트 공용: 주사위 굴리기와 결과 확인을 한 번에 처리한다
import { rerollLowDice } from "../src/game/bot.js";
import { confirmRoll, submitRoll } from "../src/game/engine.js";
import type { GameState } from "../src/game/types.js";

// 굴려야 하는 사람이 모두 굴리고, 결과를 확인하면 결과가 적용된다
export function rollAndConfirm(state: GameState): void {
  const pending = state.pendingRoll;
  if (!pending) return;
  for (const entry of [...pending.entries]) if (entry.dice === null) submitRoll(state, entry.playerId);
  for (const entry of [...pending.entries]) {
    if (entry.confirmed) continue;
    rerollLowDice(state, entry.playerId);
    confirmRoll(state, entry.playerId);
  }
}
