/**
 * 튜토리얼 연습 상대 (2026-10-06). 서버 AI 없이 브라우저에서 도는 아주 약한 봇이다.
 * 규칙 판단은 전부 shared 엔진(canPlay·legalCells)에 맡기고, 여기서는 "무엇을 어디에"만 고른다:
 * 낼 수 있는 카드 중 가장 싼 것을, 자기 코어에서 가장 가까운 칸에 하나 놓고 턴을 끝낸다.
 * 첫 판을 배우는 사람이 일찍 지지 않도록 일부러 공격적인 수를 두지 않는다.
 */
import type { Action, CardId, GameState, PlayerId } from '@astraltab/shared';
import { canPlay, getSpec, hexDistance, legalCells } from '@astraltab/shared';

export function tutorialBotAction(state: GameState, playerId: PlayerId): Action {
  const me = state.players.find((p) => p.id === playerId);
  if (!me || me.actedThisTurn) return { type: 'PASS', playerId };
  const core = state.markers.find((m) => m.ownerId === playerId && m.kind === 'core');
  const playable = [...new Set(me.hand)].filter((c) => canPlay(state, playerId, c));
  playable.sort((a: CardId, b: CardId) => getSpec(a).cost - getSpec(b).cost || a.localeCompare(b));
  for (const cardId of playable) {
    const cells = legalCells(state, playerId, cardId);
    if (cells.length === 0) continue;
    const pos = core ? [...cells].sort((a, b) => hexDistance(a, core.pos) - hexDistance(b, core.pos) || a.y - b.y || a.x - b.x)[0] : cells[0];
    if (pos) return { type: 'PLACE', playerId, cardId, pos };
  }
  return { type: 'PASS', playerId };
}
