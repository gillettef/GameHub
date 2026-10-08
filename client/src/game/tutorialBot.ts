/**
 * 튜토리얼 연습 상대. 서버 AI 없이 브라우저에서 도는 약한 봇이다.
 * 규칙 판단은 전부 shared 엔진에 맡긴다. 심기는 손 맨 앞 카드만 보고, 심을 수 있는 칸 중
 * "내 땅이 가장 많이 늘어나는" 칸에 심는다(배우는 사람이 일찍 크게 지지 않도록 일부러 한 장만 본다).
 * 마켓에서는 공개 목표(보호구역)에 나온 식물을 먼저, 없으면 맨 앞 카드를 가져온다.
 */
import type { Action, Direction, GameState, PlayerId } from '@rootbound/shared';
import { autoAction, computeScores, getGoal, getSpecies, legalDirections, legalPlantCells } from '@rootbound/shared';

/** 가져올 마켓 자리. 마켓이 비었으면 undefined */
function pickTake(state: GameState): number | undefined {
  if (state.market.length === 0) return undefined;
  const linked = state.goals.map((g) => getGoal(g).species).filter((s) => s !== null);
  const i = state.market.findIndex((s) => linked.includes(s));
  return i >= 0 ? i : 0;
}

export function tutorialBotAction(state: GameState, playerId: PlayerId): Action | null {
  if (state.phase !== 'playing') return null;
  const me = state.players.find((p) => p.id === playerId);
  const species = me?.hand[0];
  if (!me || !species) return null;
  const cells = legalPlantCells(state, playerId, species);
  if (cells.length === 0) return autoAction(state, playerId);
  const take = pickTake(state);
  const sp = getSpecies(species);
  let best: Action | null = null;
  let bestLand = -Infinity;
  for (const pos of cells) {
    const direction = sp.line ? (legalDirections(state, pos)[0] as Direction | undefined) : undefined;
    const trial: GameState = {
      ...state,
      plants: [...state.plants, { id: 'bot', species, ownerId: playerId, pos, direction: sp.line ? (direction ?? 0) : null }],
    };
    const land = computeScores(trial)[playerId]?.land ?? 0;
    if (land > bestLand) {
      bestLand = land;
      best = { type: 'PLANT', playerId, species, pos, ...(direction !== undefined ? { direction } : {}), ...(take !== undefined ? { take } : {}) };
    }
  }
  return best;
}
