/**
 * 화면용 파생값. 규칙 계산은 전부 shared 엔진 함수를 부르고(중복 구현 금지), 여기서는 화면 모양으로만 바꾼다.
 */
import type { Direction, GameState, MaskedGameState, PlayerId, Plant, Position, Score, SpeciesId, Terrain } from '@rootbound/shared';
import { boardIndex, cellLabels, computeOwners, computeScores, getSpecies, legalPlantCells, plantRoots, posKey, rotateSpot, SPECIES_IDS, supplyLeft } from '@rootbound/shared';

/** 가려진 상태도 엔진 함수에 그대로 넣을 수 있다(모양 호환) */
export const asState = (s: MaskedGameState | GameState): GameState => s as unknown as GameState;

export interface CellView {
  key: string;
  q: number;
  r: number;
  terrain: Terrain;
  tile: number;
  /** 칸 이름 (예: "C4", Rules.md 2절) */
  label: string;
  /** 땅 주인 좌석 = 큐브 색 (−1 없음) */
  owner: number;
  /** 큐브 수 */
  cubes: number;
  plant: Plant | null;
  /** 심은 사람 좌석 (기록용. 식물은 땅 주인 것이다) */
  plantedBy: number;
  /** 입구 좌석 (−1 아님) */
  entranceSeat: number;
}

export function buildCells(state: MaskedGameState | GameState): CellView[] {
  const s = asState(state);
  if (!s.board) return [];
  const owners = computeOwners(s);
  const seatOf = new Map(s.players.map((p) => [p.id, p.seat]));
  const plantAt = new Map(s.plants.map((p) => [posKey(p.pos), p]));
  const entranceAt = new Map(s.board.entrances.map((e, seat) => [posKey(e), seat]));
  const labels = cellLabels(s.board);
  return s.board.cells.map((c, i) => {
    const key = posKey(c);
    const plant = plantAt.get(key) ?? null;
    return {
      key,
      q: c.q,
      r: c.r,
      terrain: c.terrain,
      tile: c.tile,
      label: labels[i] as string,
      owner: owners[i] as number,
      cubes: s.rootCount[i] ?? 0,
      plant,
      plantedBy: plant ? (seatOf.get(plant.ownerId) ?? -1) : -1,
      entranceSeat: entranceAt.get(key) ?? -1,
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
  /** 공급처에 남은 뿌리 (다음 선 기준, Rules.md 5절). 보드가 없으면 null */
  rootsLeft: number | null;
}

export function buildPlayerSummaries(state: MaskedGameState, precomputed?: Record<PlayerId, Score> | null): PlayerSummary[] {
  const scores = precomputed !== undefined ? precomputed : state.board ? computeScores(asState(state)) : null;
  const left = state.board ? supplyLeft(asState(state)) : null;
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
      rootsLeft: left ? (left[p.seat] ?? null) : null,
    }));
}

export interface PlantPreview {
  /** 좌석별 땅 변화 */
  landDelta: number[];
  /** 좌석별 총점 변화 */
  scoreDelta: number[];
  /** 큐브가 바뀌는 칸 key → 바뀐 뒤 [색, 수] (−1, 0 = 빈 칸) */
  touched: Map<string, [number, number]>;
  /** 심으면 주인이 바뀌는 칸 key → 새 주인 좌석 */
  flips: Map<string, number>;
  /** 공급처가 모자라 옮겨 오는 큐브 수 */
  uprooted: number;
}

/** 심었다고 치고 결과를 미리 본다 (엔진 함수만 쓴다, 상태는 바꾸지 않는다) */
export function previewPlant(
  state: MaskedGameState | GameState,
  viewerId: PlayerId,
  species: SpeciesId,
  pos: Position,
  rotation: Direction,
  seed: Position | null,
): PlantPreview | null {
  const s = asState(state);
  if (!s.board) return null;
  const sp = getSpecies(species);
  const withPlant: GameState = { ...s, plants: [...s.plants, { id: 'preview', species, ownerId: viewerId, pos, rotation }] };
  const roots = plantRoots(withPlant, viewerId, species, pos, rotation, seed && sp.seed ? seed : null);
  const after: GameState = { ...withPlant, rootSeat: roots.rootSeat, rootCount: roots.rootCount };
  const before = computeScores(s);
  const next = computeScores(after);
  const ownB = computeOwners(s);
  const ownA = computeOwners(after);
  const idx = boardIndex(s.board);
  const touched = new Map<string, [number, number]>();
  const flips = new Map<string, number>();
  for (let c = 0; c < idx.n; c++) {
    const key = posKey(s.board.cells[c]!);
    const nA = after.rootCount[c] ?? 0;
    if (nA !== (s.rootCount[c] ?? 0) || ownA[c] !== ownB[c]) touched.set(key, [ownA[c] as number, nA]);
    if (ownA[c] !== ownB[c]) flips.set(key, ownA[c] as number);
  }
  const bySeat = [...s.players].sort((a, b) => a.seat - b.seat);
  return {
    landDelta: bySeat.map((p) => (next[p.id]?.land ?? 0) - (before[p.id]?.land ?? 0)),
    scoreDelta: bySeat.map((p) => (next[p.id]?.total ?? 0) - (before[p.id]?.total ?? 0)),
    touched,
    flips,
    uprooted: roots.uprooted.length,
  };
}

/** 모양이 서로 다른 회전 번호 (버섯은 0 하나뿐) */
export function distinctRotations(species: SpeciesId): Direction[] {
  const seen = new Set<string>();
  const out: Direction[] = [];
  for (let rot = 0 as Direction; rot < 6; rot = (rot + 1) as Direction) {
    const key = getSpecies(species)
      .roots.map((x) => rotateSpot(x, rot))
      .map((x) => `${x.dq},${x.dr},${x.n}`)
      .sort()
      .join(';');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(rot);
    }
  }
  return out;
}

/** 화살표 표시용 방향 이름 (방향 0~5) */
export const DIRECTION_LABELS = ['→', '↗', '↖', '←', '↙', '↘'] as const;

/** 회전 r 일 때 카드 그림의 오른쪽(방향 0)이 가리키는 화면 방향. 회전 1번은 방향 d 를 d−1 로 보낸다 */
export const rotationLabel = (rotation: number): string => DIRECTION_LABELS[(6 - (rotation % 6)) % 6] as string;
