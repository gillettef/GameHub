/**
 * 시야 영역과 영토 (Rules.md 8절, F031). 순수 함수.
 * 순회 순서는 항상 y → x 오름차순 (Rules.md 13절).
 */
import type { Board, GameState, Marker, PlayerId, Position, Terrain } from '../types/index.js';
import { getSpec } from '../data/index.js';

export function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function posKey(p: Position): string {
  return `${p.x},${p.y}`;
}

export function samePos(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function inBounds(board: Board, p: Position): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < board.width && p.y < board.height;
}

export function terrainAt(board: Board, p: Position): Terrain {
  if (board.asteroids.some((a) => samePos(a, p))) return 'asteroid';
  if (board.veins.some((v) => samePos(v, p))) return 'vein';
  return 'space';
}

/** y 오름차순 → x 오름차순 */
export function compareByPosition(a: Position, b: Position): number {
  return a.y - b.y || a.x - b.x;
}

export function sortByPosition<T extends { pos: Position }>(items: readonly T[]): T[] {
  return items.slice().sort((a, b) => compareByPosition(a.pos, b.pos));
}

export function markerAt(state: GameState, p: Position): Marker | undefined {
  return state.markers.find((m) => samePos(m.pos, p));
}

/** 플레이어의 마커를 y → x 순으로 */
export function markersOf(state: GameState, playerId: PlayerId): Marker[] {
  return sortByPosition(state.markers.filter((m) => m.ownerId === playerId));
}

/** 마커 하나의 시야 안 칸 (보드 안, y → x 순). 소행성 칸도 포함한다 */
export function cellsInRadius(board: Board, center: Position, radius: number): Position[] {
  const out: Position[] = [];
  for (let y = center.y - radius; y <= center.y + radius; y++) {
    for (let x = center.x - radius; x <= center.x + radius; x++) {
      const p = { x, y };
      if (inBounds(board, p)) out.push(p);
    }
  }
  return out;
}

/** 칸 P가 플레이어의 시야 영역 안인가 (마커 M 중 dist(M,P) ≤ M.시야 인 것이 하나 이상) */
export function isInSight(state: GameState, playerId: PlayerId, p: Position): boolean {
  return state.markers.some(
    (m) => m.ownerId === playerId && chebyshev(m.pos, p) <= getSpec(m.specId).sight,
  );
}

/** 플레이어의 시야 영역 = 모든 마커 시야의 합집합. y → x 순, 중복 없음 */
export function computeSightArea(state: GameState, playerId: PlayerId): Position[] {
  const seen = new Set<string>();
  const out: Position[] = [];
  for (const m of markersOf(state, playerId)) {
    for (const p of cellsInRadius(state.board, m.pos, getSpec(m.specId).sight)) {
      const k = posKey(p);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(p);
      }
    }
  }
  return out.sort(compareByPosition);
}

export interface Territory {
  /** owners[y][x] = 소유자 id, 무소유(경합·시야 밖·소행성)는 null */
  owners: (PlayerId | null)[][];
  /** 플레이어별 영토 칸 수 (마커 칸 포함). 모든 플레이어 키 포함 */
  counts: Record<PlayerId, number>;
}

/**
 * 영토 판정 (Rules.md 8절):
 *  - 마커 칸 → 소유자
 *  - 빈 칸이 정확히 한 플레이어 시야 안 → 그 플레이어
 *  - 경합·시야 밖·소행성 → null
 */
export function computeTerritory(state: GameState): Territory {
  const { board } = state;
  const claims = new Map<string, Set<PlayerId>>();
  for (const m of state.markers) {
    for (const p of cellsInRadius(board, m.pos, getSpec(m.specId).sight)) {
      const k = posKey(p);
      let set = claims.get(k);
      if (!set) {
        set = new Set();
        claims.set(k, set);
      }
      set.add(m.ownerId);
    }
  }
  const asteroid = new Set(board.asteroids.map(posKey));
  const markerOwner = new Map(state.markers.map((m) => [posKey(m.pos), m.ownerId] as const));

  const counts: Record<PlayerId, number> = {};
  for (const p of state.players) counts[p.id] = 0;

  const owners: (PlayerId | null)[][] = [];
  for (let y = 0; y < board.height; y++) {
    const row: (PlayerId | null)[] = [];
    for (let x = 0; x < board.width; x++) {
      const k = `${x},${y}`;
      let owner: PlayerId | null = null;
      if (asteroid.has(k)) owner = null;
      else if (markerOwner.has(k)) owner = markerOwner.get(k) ?? null;
      else {
        const set = claims.get(k);
        if (set && set.size === 1) owner = [...set][0] ?? null;
      }
      row.push(owner);
      if (owner !== null) counts[owner] = (counts[owner] ?? 0) + 1;
    }
    owners.push(row);
  }
  return { owners, counts };
}
