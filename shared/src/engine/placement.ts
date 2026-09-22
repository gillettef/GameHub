/**
 * 배치 검증·적용, 즉발 마법 (Rules.md 6절, 7.2, F022). 순수 함수.
 */
import type { CardId, GameState, Marker, PlacementError, PlayerId, Position } from '../types/index.js';
import { ENERGY_CAP, INFILTRATE_RANGE, getSpec, hasSpec } from '../data/index.js';
import { addLog, damageEnemiesInRadius, healAlliesInRadius, nameOf, removeDestroyed, withMarkers } from './combat.js';
import { chebyshev, inBounds, isInSight, markerAt, terrainAt } from './sight.js';
import { getPlayer } from './scoring.js';

function fmt(p: Position): string {
  return `(${p.x},${p.y})`;
}

/** 침투 카드: 적 마커로부터 거리 1 이내 */
function isAdjacentToEnemy(state: GameState, playerId: PlayerId, p: Position): boolean {
  return state.markers.some((m) => m.ownerId !== playerId && chebyshev(m.pos, p) <= INFILTRATE_RANGE);
}

/** 카드·플레이어 조건(손패·에너지)만 검사. 칸 조건은 validateCell */
export function validateCard(state: GameState, playerId: PlayerId, cardId: CardId): PlacementError | null {
  if (state.phase !== 'playing') return { code: 'not-playing', message: '진행 중인 게임이 아닙니다' };
  if (!state.players.some((p) => p.id === playerId)) return { code: 'unknown-player', message: '방에 없는 플레이어입니다' };
  const player = getPlayer(state, playerId);
  if (state.currentPlayerId !== playerId || !player.alive) {
    return { code: 'not-your-turn', message: `${nameOf(state, state.currentPlayerId ?? playerId)}의 턴입니다` };
  }
  if (!hasSpec(cardId) || !player.hand.includes(cardId)) {
    return { code: 'not-in-hand', message: '손패에 없는 카드입니다' };
  }
  const spec = getSpec(cardId);
  if (player.energy < spec.cost) {
    return { code: 'not-enough-energy', message: `에너지가 ${spec.cost - player.energy} 부족합니다` };
  }
  return null;
}

/** 칸 조건만 검사 (보드 안, 소행성 아님, 빈 칸, 시야 안 또는 침투) */
export function validateCell(state: GameState, playerId: PlayerId, cardId: CardId, pos: Position): PlacementError | null {
  if (!inBounds(state.board, pos)) return { code: 'out-of-bounds', message: '보드 밖입니다' };
  if (terrainAt(state.board, pos) === 'asteroid') return { code: 'asteroid', message: '소행성에는 놓을 수 없습니다' };
  if (markerAt(state, pos)) return { code: 'occupied', message: '이미 마커가 있는 칸입니다' };
  const spec = getSpec(cardId);
  const infiltrate = spec.keywords.includes('infiltrate') && isAdjacentToEnemy(state, playerId, pos);
  if (!infiltrate && !isInSight(state, playerId, pos)) {
    return { code: 'out-of-sight', message: '시야 밖입니다' };
  }
  return null;
}

/** 배치 전체 검증 (Rules.md 6절 1~5). 통과하면 null */
export function validatePlacement(state: GameState, playerId: PlayerId, cardId: CardId, pos: Position): PlacementError | null {
  return validateCard(state, playerId, cardId) ?? validateCell(state, playerId, cardId, pos);
}

/** 이 카드를 놓을 수 있는 칸 전부 (y → x 순). 카드 조건은 검사하지 않는다 (UI 하이라이트·AI 후보용) */
export function legalCells(state: GameState, playerId: PlayerId, cardId: CardId): Position[] {
  const out: Position[] = [];
  for (let y = 0; y < state.board.height; y++) {
    for (let x = 0; x < state.board.width; x++) {
      const p = { x, y };
      if (validateCell(state, playerId, cardId, p) === null) out.push(p);
    }
  }
  return out;
}

/** 지금 이 카드를 낼 수 있는가 (손패·에너지·놓을 칸 존재) */
export function canPlay(state: GameState, playerId: PlayerId, cardId: CardId): boolean {
  return validateCard(state, playerId, cardId) === null && legalCells(state, playerId, cardId).length > 0;
}

/** 손패 중 지금 낼 수 있는 카드가 하나라도 있는가 */
export function hasAnyPlay(state: GameState, playerId: PlayerId): boolean {
  const player = getPlayer(state, playerId);
  return [...new Set(player.hand)].some((c) => canPlay(state, playerId, c));
}

/**
 * 배치 적용. 검증은 호출자(applyAction)가 끝낸 상태여야 한다.
 * 비용 차감 → 카드 버림 → 마커 생성 또는 즉발 효과 → 파괴 정리. 턴 종료는 호출자가 한다.
 */
export function applyPlacement(state: GameState, playerId: PlayerId, cardId: CardId, pos: Position): GameState {
  const spec = getSpec(cardId);
  const player = getPlayer(state, playerId);
  const handIndex = player.hand.indexOf(cardId);
  const hand = player.hand.filter((_, i) => i !== handIndex);
  const energyAfter = player.energy - spec.cost;
  let s: GameState = {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, energy: energyAfter, hand, discard: [...p.discard, cardId] } : p,
    ),
  };
  s = addLog(s, 'place', playerId, `${nameOf(s, playerId)}: ${fmt(pos)}에 ${spec.name} 배치 (비용 ${spec.cost}, 에너지 ${player.energy} → ${energyAfter})`);

  const effect = spec.effect;
  if (spec.kind === 'magic' && effect && effect.kind !== 'persistent') {
    s = applyInstantMagic(s, playerId, cardId, pos);
  } else {
    const marker: Marker = {
      id: `m${s.nextMarkerId}`,
      specId: cardId,
      kind: spec.kind,
      ownerId: playerId,
      pos,
      hp: spec.hp,
      remainingTurns: effect && effect.kind === 'persistent' ? effect.durationTurns : null,
    };
    s = withMarkers({ ...s, nextMarkerId: s.nextMarkerId + 1 }, [...s.markers, marker]);
  }
  return removeDestroyed(s);
}

function applyInstantMagic(state: GameState, playerId: PlayerId, cardId: CardId, center: Position): GameState {
  const spec = getSpec(cardId);
  const effect = spec.effect;
  if (!effect) return state;
  let s = state;
  switch (effect.kind) {
    case 'damage': {
      const r = damageEnemiesInRadius(s, playerId, center, effect.radius, effect.amount);
      s = r.state;
      const names = r.hits.map((m) => `${nameOf(s, m.ownerId)}의 ${getSpec(m.specId).name}${fmt(m.pos)}`).join(', ');
      s = addLog(s, 'magic', playerId, `${spec.name}: ${names || '대상 없음'} 피해 ${effect.amount}`);
      break;
    }
    case 'heal': {
      const r = healAlliesInRadius(s, playerId, center, effect.radius, effect.amount);
      s = r.state;
      const names = r.hits.map((m) => `${getSpec(m.specId).name}${fmt(m.pos)}`).join(', ');
      s = addLog(s, 'magic', playerId, `${spec.name}: ${names || '대상 없음'} 체력 +${effect.amount}`);
      break;
    }
    case 'energy': {
      s = {
        ...s,
        players: s.players.map((p) =>
          p.id === playerId ? { ...p, energy: Math.min(p.energy + effect.amount, ENERGY_CAP) } : p,
        ),
      };
      s = addLog(s, 'magic', playerId, `${spec.name}: 에너지 +${effect.amount}`);
      break;
    }
    case 'persistent':
      break;
  }
  return s;
}
