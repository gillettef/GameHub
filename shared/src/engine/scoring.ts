/**
 * 점수 정산 (F025): 영토 점수 + 건물 점수. 순수 함수.
 */
import type { GameResult, GameResultReason, GameState, PlayerId, Position } from '../types/index.js';
import { SCORE_PER_TERRITORY_CELL, TERRITORY_RADIUS, getBuildingSpec } from '../data/index.js';

/** 자기 건물로부터 TERRITORY_RADIUS 이내 칸의 집합. 여러 플레이어 건물이 겹치는 칸은 아무에게도 주지 않는다 */
export function computeTerritory(state: GameState): Record<PlayerId, Position[]> {
  const claims = new Map<string, Set<PlayerId>>();
  for (const b of state.buildings) {
    for (let dx = -TERRITORY_RADIUS; dx <= TERRITORY_RADIUS; dx++) {
      for (let dy = -TERRITORY_RADIUS; dy <= TERRITORY_RADIUS; dy++) {
        const x = b.pos.x + dx;
        const y = b.pos.y + dy;
        if (x < 0 || y < 0 || x >= state.board.width || y >= state.board.height) continue;
        const key = `${x},${y}`;
        const owners = claims.get(key) ?? new Set<PlayerId>();
        owners.add(b.ownerId);
        claims.set(key, owners);
      }
    }
  }
  const result: Record<PlayerId, Position[]> = {};
  for (const p of state.players) result[p.id] = [];
  for (const [key, owners] of claims) {
    if (owners.size !== 1) continue;
    const owner = [...owners][0] as PlayerId;
    const [xs, ys] = key.split(',');
    result[owner]?.push({ x: Number(xs), y: Number(ys) });
  }
  return result;
}

export function computeScores(state: GameState): GameResult['scores'] {
  const territory = computeTerritory(state);
  const scores: GameResult['scores'] = {};
  for (const p of state.players) {
    const territoryScore = (territory[p.id]?.length ?? 0) * SCORE_PER_TERRITORY_CELL;
    const buildingScore = state.buildings
      .filter((b) => b.ownerId === p.id)
      .reduce((sum, b) => sum + (getBuildingSpec(b.specId)?.score ?? 0), 0);
    scores[p.id] = { territory: territoryScore, buildings: buildingScore, total: territoryScore + buildingScore };
  }
  return scores;
}

/** 점수로 승자를 정하고 게임을 종료한다. 동점이면 winnerId 는 null (무승부) */
export function settleByScore(state: GameState, reason: GameResultReason): GameState {
  const scores = computeScores(state);
  let winnerId: PlayerId | null = null;
  let best = -1;
  let tie = false;
  for (const p of state.players) {
    const total = scores[p.id]?.total ?? 0;
    if (total > best) {
      best = total;
      winnerId = p.id;
      tie = false;
    } else if (total === best) {
      tie = true;
    }
  }
  if (tie) winnerId = null;

  const winner = state.players.find((p) => p.id === winnerId);
  const summary = state.players.map((p) => `${p.nickname} ${scores[p.id]?.total ?? 0}점`).join(', ');
  const why = reason === 'turn-limit' ? '제한 턴 도달' : reason === 'deck-exhausted' ? '덱 소진' : '기지 파괴';
  return {
    ...state,
    phase: 'finished',
    currentPlayerId: null,
    result: { winnerId, reason, scores },
    log: [
      ...state.log,
      {
        turn: state.turn,
        kind: 'result',
        message: winner ? `${why}. 점수 정산: ${summary}. ${winner.nickname} 승리!` : `${why}. 점수 정산: ${summary}. 무승부.`,
      },
    ],
  };
}
