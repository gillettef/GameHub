/**
 * 화면용 파생값. 규칙 계산은 전부 shared 엔진 함수를 부르고(중복 구현 금지), 여기서는 화면 모양으로만 바꾼다.
 */
import type { Direction, GameState, MaskedGameState, PlayerId, Plant, Position, Score, SpeciesId, Terrain } from '@rootbound/shared';
import {
  boardIndex,
  computeInfluence,
  computeOwners,
  computeScores,
  getSpecies,
  legalDirections,
  legalPlantCells,
  posKey,
  SPECIES_IDS,
} from '@rootbound/shared';

/** 가려진 상태도 엔진 함수에 그대로 넣을 수 있다(모양 호환) */
export const asState = (s: MaskedGameState | GameState): GameState => s as unknown as GameState;

export interface CellView {
  key: string;
  q: number;
  r: number;
  terrain: Terrain;
  tile: number;
  /** 땅 주인 좌석 (−1 없음) */
  owner: number;
  /** 좌석별 영향력 */
  influence: number[];
  plant: Plant | null;
  /** 식물 주인 좌석 */
  plantSeat: number;
  /** 입구 좌석 (−1 아님) */
  entranceSeat: number;
  /** 이 칸의 씨앗 좌석들 */
  seedSeats: number[];
}

export function buildCells(state: MaskedGameState | GameState): CellView[] {
  const s = asState(state);
  if (!s.board) return [];
  const inf = computeInfluence(s);
  const owners = computeOwners(s, inf);
  const seatOf = new Map(s.players.map((p) => [p.id, p.seat]));
  const plantAt = new Map(s.plants.map((p) => [posKey(p.pos), p]));
  const seedsAt = new Map<string, number[]>();
  for (const sd of s.seeds) {
    const k = posKey(sd.pos);
    seedsAt.set(k, [...(seedsAt.get(k) ?? []), seatOf.get(sd.ownerId) ?? 0]);
  }
  const entranceAt = new Map(s.board.entrances.map((e, seat) => [posKey(e), seat]));
  return s.board.cells.map((c, i) => {
    const key = posKey(c);
    const plant = plantAt.get(key) ?? null;
    return {
      key,
      q: c.q,
      r: c.r,
      terrain: c.terrain,
      tile: c.tile,
      owner: owners[i] as number,
      influence: inf.map((row) => row[i] as number),
      plant,
      plantSeat: plant ? (seatOf.get(plant.ownerId) ?? -1) : -1,
      entranceSeat: entranceAt.get(key) ?? -1,
      seedSeats: seedsAt.get(key) ?? [],
    };
  });
}

/** 선택한 카드로 심을 수 있는 칸 key */
export function legalKeys(state: MaskedGameState | GameState, viewerId: PlayerId | null, species: SpeciesId | null): Set<string> {
  const s = asState(state);
  if (!viewerId || !species || !s.board || s.phase !== 'playing') return new Set();
  return new Set(legalPlantCells(s, viewerId, species).map(posKey));
}

export interface PlayerSummary {
  id: PlayerId;
  nickname: string;
  seat: number;
  kind: 'human' | 'ai';
  isCurrent: boolean;
  surrendered: boolean;
  handCount: number;
  /** 이 사람이 심은 식물 종류 (표 순서, 중복 없음) */
  plantedSpecies: SpeciesId[];
  score: Score | null;
}

export function buildPlayerSummaries(state: MaskedGameState, precomputed?: Record<PlayerId, Score> | null): PlayerSummary[] {
  const scores = precomputed !== undefined ? precomputed : state.board ? computeScores(asState(state)) : null;
  return [...state.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({
      id: p.id,
      nickname: p.nickname,
      seat: p.seat,
      kind: p.kind,
      isCurrent: state.currentPlayerId === p.id,
      surrendered: p.surrenderedOrder !== null,
      handCount: p.handCount,
      plantedSpecies: SPECIES_IDS.filter((sp) => state.plants.some((pl) => pl.ownerId === p.id && pl.species === sp)),
      score: scores?.[p.id] ?? null,
    }));
}

export interface PlantPreview {
  /** 좌석별 땅 변화 */
  landDelta: number[];
  /** 좌석별 총점 변화 */
  scoreDelta: number[];
  /** 영향력이 바뀌는 칸 key → 내 새 영향력 */
  touched: Map<string, number>;
  /** 심으면 주인이 바뀌는 칸 key → 새 주인 좌석 */
  flips: Map<string, number>;
}

/** 심었다고 치고 결과를 미리 본다 (엔진 함수만 쓴다, 상태는 바꾸지 않는다) */
export function previewPlant(
  state: MaskedGameState | GameState,
  viewerId: PlayerId,
  species: SpeciesId,
  pos: Position,
  direction: Direction | null,
  seed: Position | null,
): PlantPreview | null {
  const s = asState(state);
  if (!s.board) return null;
  const sp = getSpecies(species);
  const after: GameState = {
    ...s,
    plants: [...s.plants, { id: 'preview', species, ownerId: viewerId, pos, direction: sp.line ? (direction ?? 0) : null }],
    seeds: seed && sp.seed ? [...s.seeds, { ownerId: viewerId, pos: seed }] : s.seeds,
  };
  const before = computeScores(s);
  const next = computeScores(after);
  const seat = s.players.find((p) => p.id === viewerId)?.seat ?? 0;
  const infB = computeInfluence(s);
  const infA = computeInfluence(after);
  const ownB = computeOwners(s, infB);
  const ownA = computeOwners(after, infA);
  const idx = boardIndex(s.board);
  const touched = new Map<string, number>();
  const flips = new Map<string, number>();
  for (let c = 0; c < idx.n; c++) {
    const key = posKey(s.board.cells[c]!);
    if (infA[seat]![c] !== infB[seat]![c]) touched.set(key, infA[seat]![c] as number);
    if (ownA[c] !== ownB[c]) flips.set(key, ownA[c] as number);
  }
  const bySeat = [...s.players].sort((a, b) => a.seat - b.seat);
  return {
    landDelta: bySeat.map((p) => (next[p.id]?.land ?? 0) - (before[p.id]?.land ?? 0)),
    scoreDelta: bySeat.map((p) => (next[p.id]?.total ?? 0) - (before[p.id]?.total ?? 0)),
    touched,
    flips,
  };
}

export function directionsFor(state: MaskedGameState | GameState, pos: Position): Direction[] {
  return legalDirections(asState(state), pos) as Direction[];
}

/** 화살표 표시용 방향 이름 (방향 0~5) */
export const DIRECTION_LABELS = ['→', '↗', '↖', '←', '↙', '↘'] as const;
