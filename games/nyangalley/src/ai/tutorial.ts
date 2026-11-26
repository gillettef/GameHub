/**
 * 튜토리얼 연습 상대. 서버 AI 없이 브라우저에서 도는 약한 봇이다.
 * 규칙 판단은 전부 shared 엔진에 맡긴다. 심기는 손 맨 앞 카드만 보고, 심을 수 있는 칸·방향 중
 * "내 땅이 가장 많이 늘어나는" 수를 둔다(배우는 사람이 일찍 크게 지지 않도록 일부러 한 장만 보고 씨앗은 안 쓴다).
 * 가져오기에서는 공개 목표(보호구역)에 나온 식물을 먼저, 없으면 마켓 맨 앞 카드를 가져온다(Rules.md 5절).
 * 공개 단계에서는 바로 확인한다.
 * 일과 고르기(v7)에서는 남은 일과 중 명당을 놓는 첫 일과(없으면 첫 일과)를 고르고, 담 넘기·명당 부르기 차례는 엔진 자동 수를 둔다.
 */
import type { Action, GameState, PlayerId } from '../engine';
import { autoAction, computeScores, getGoal, isPlaceChore, legalPlantCells, remainingChores } from '../engine';
import { awaitingConfirm, distinctRotations, simulatePlant } from '../client/game/derived';

/** 가져올 마켓 자리 (마켓에 카드가 있을 때만 부른다) */
function pickTake(state: GameState): number {
  const linked = state.goals.map((g) => getGoal(g).species).filter((s) => s !== null);
  const i = state.market.findIndex((s) => linked.includes(s));
  return i >= 0 ? i : 0;
}

export function tutorialBotAction(state: GameState, playerId: PlayerId): Action | null {
  const me = state.players.find((p) => p.id === playerId);
  if (state.phase === 'reveal') return awaitingConfirm(state, playerId) ? { type: 'CONFIRM', playerId } : null;
  if (state.phase !== 'playing' || state.currentPlayerId !== playerId) return null;
  if (state.stage === 'chore') {
    const left = remainingChores(state);
    const chore = left.find((c) => isPlaceChore(c)) ?? left[0];
    return chore ? { type: 'PICK_CHORE', playerId, chore } : null;
  }
  if (state.stage === 'move' || state.stage === 'call') return autoAction(state, playerId);
  if (state.stage === 'take') return state.market.length > 0 ? { type: 'TAKE', playerId, take: pickTake(state) } : autoAction(state, playerId);
  const species = me?.hand[0];
  if (!me || !species) return null;
  const cells = legalPlantCells(state, playerId, species);
  if (cells.length === 0) return autoAction(state, playerId);
  let best: Action | null = null;
  let bestLand = -Infinity;
  for (const pos of cells) {
    for (const rotation of distinctRotations(species)) {
      const land = computeScores(simulatePlant(state, playerId, species, pos, rotation).after)[playerId]?.land ?? 0;
      if (land > bestLand) {
        bestLand = land;
        best = { type: 'PLANT', playerId, species, pos, rotation };
      }
    }
  }
  return best;
}
