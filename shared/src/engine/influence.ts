/**
 * 영향력·땅·심을 수 있는 칸 (Rules.md 6.1·6.2·7절). 전부 보드의 순수 함수다(상태에 캐시하지 않는다).
 */
import { ENTRANCE_RING, ENTRANCE_SELF, FERTILE_BONUS } from '../data/constants.js';
import { getSpecies } from '../data/species.js';
import type { GameState, PlayerId, Position, SpeciesId } from '../types/index.js';
import { boardIndex, type BoardIndex } from './board.js';

/** 칸별로 무엇이 있는가. 칸 색인 기준 */
export interface Occupancy {
  /** 식물 주인 좌석 (−1 없음) */
  plantSeat: Int8Array;
  /** 식물 종 */
  plantSpecies: (SpeciesId | null)[];
  /** 입구 주인 좌석 (−1 없음) */
  entranceSeat: Int8Array;
}

export function occupancy(state: GameState): Occupancy {
  const idx = boardIndex(requireBoard(state));
  const plantSeat = new Int8Array(idx.n).fill(-1);
  const plantSpecies: (SpeciesId | null)[] = new Array(idx.n).fill(null);
  const entranceSeat = new Int8Array(idx.n).fill(-1);
  const seatOf = seatMap(state);
  for (const p of state.plants) {
    const i = idx.indexOf(p.pos);
    plantSeat[i] = seatOf.get(p.ownerId) ?? -1;
    plantSpecies[i] = p.species;
  }
  idx.board.entrances.forEach((e, seat) => (entranceSeat[idx.indexOf(e)] = seat));
  return { plantSeat, plantSpecies, entranceSeat };
}

export function requireBoard(state: GameState) {
  if (!state.board) throw new Error('보드가 아직 없습니다');
  return state.board;
}

function seatMap(state: GameState): Map<PlayerId, number> {
  return new Map(state.players.map((p) => [p.id, p.seat]));
}

/**
 * 좌석별 영향력 [seat][칸]. 입구 → 식물(심은 순서와 무관한 합) → 씨앗을 더한 뒤 버섯 빼기를 마지막에 적용한다.
 */
export function computeInfluence(state: GameState): Int16Array[] {
  const board = requireBoard(state);
  const idx = boardIndex(board);
  const P = state.players.length;
  const inf = Array.from({ length: P }, () => new Int16Array(idx.n));
  const wither = Array.from({ length: P }, () => new Int16Array(idx.n));
  const occ = occupancy(state);
  const seatOf = seatMap(state);

  board.entrances.forEach((e, seat) => {
    const i = idx.indexOf(e);
    (inf[seat] as Int16Array)[i]! += ENTRANCE_SELF;
    for (const x of idx.ring1[i] as number[]) (inf[seat] as Int16Array)[x]! += ENTRANCE_RING;
  });

  for (const plant of state.plants) {
    const seat = seatOf.get(plant.ownerId);
    if (seat === undefined) continue;
    const sp = getSpecies(plant.species);
    const I = inf[seat] as Int16Array;
    const c = idx.indexOf(plant.pos);
    const nb = idx.ring1[c] as number[];
    let self = sp.self;
    let ring = sp.ring1;
    const fertile = board.cells[c]?.terrain === 'fertile';
    if (fertile) self += FERTILE_BONUS;
    if (fertile && sp.fertileRing) ring += sp.fertileRing;
    if (sp.cluster) for (const x of nb) if (occ.plantSpecies[x] === plant.species && occ.plantSeat[x] === seat) self += sp.cluster;
    I[c]! += self;
    if (ring) for (const x of nb) I[x]! += ring;
    if (sp.star2) for (const x of idx.star2[c] as number[]) I[x]! += sp.star2;
    if (sp.line && plant.direction !== null) for (const x of (idx.line[c]?.[plant.direction] ?? []).slice(0, sp.lineLength)) I[x]! += sp.line;
    if (sp.ivy) for (const x of nb) if ((occ.plantSeat[x] as number) >= 0) I[x]! += sp.ivy;
    if (sp.wither) for (const x of nb) for (let o = 0; o < P; o++) if (o !== seat) (wither[o] as Int16Array)[x]! += sp.wither;
  }

  const seedValue = getSpecies('dandelion').seed;
  for (const sd of state.seeds) {
    const seat = seatOf.get(sd.ownerId);
    if (seat !== undefined) (inf[seat] as Int16Array)[idx.indexOf(sd.pos)]! += seedValue;
  }

  for (let p = 0; p < P; p++) {
    const I = inf[p] as Int16Array;
    const W = wither[p] as Int16Array;
    for (let c = 0; c < idx.n; c++) if (W[c]) I[c] = Math.max(0, (I[c] as number) - (W[c] as number));
  }
  return inf;
}

/** 칸 주인 좌석 (−1 = 없음). 엄격한 1등 한 명만. 연못·돌밭은 항상 −1 */
export function computeOwners(state: GameState, inf: Int16Array[] = computeInfluence(state)): Int8Array {
  const board = requireBoard(state);
  const out = new Int8Array(board.cells.length).fill(-1);
  board.cells.forEach((cell, c) => {
    if (cell.terrain === 'pond' || cell.terrain === 'rock') return;
    let best = 0;
    let who = -1;
    let tie = false;
    for (let p = 0; p < inf.length; p++) {
      const v = (inf[p] as Int16Array)[c] as number;
      if (v > best) {
        best = v;
        who = p;
        tie = false;
      } else if (v === best && v > 0) tie = true;
    }
    if (!tie) out[c] = who;
  });
  return out;
}

/** 빈 칸: 식물·입구·연못·돌밭이 없다 (씨앗은 있어도 된다) */
export function isEmptyCell(state: GameState, idx: BoardIndex, occ: Occupancy, c: number): boolean {
  const t = idx.board.cells[c]?.terrain;
  return t !== undefined && t !== 'pond' && t !== 'rock' && occ.plantSeat[c] === -1 && occ.entranceSeat[c] === -1;
}

/** 이 종을 심을 수 있는 칸 (Rules.md 6.1). 칸 순서(r → q) */
export function legalPlantCells(state: GameState, playerId: PlayerId, species: SpeciesId, inf: Int16Array[] = computeInfluence(state)): Position[] {
  const board = requireBoard(state);
  const idx = boardIndex(board);
  const occ = occupancy(state);
  const seat = state.players.find((p) => p.id === playerId)?.seat;
  if (seat === undefined) return [];
  const sp = getSpecies(species);
  const out: Position[] = [];
  board.cells.forEach((cell, c) => {
    if (!isEmptyCell(state, idx, occ, c)) return;
    if (((inf[seat] as Int16Array)[c] as number) >= 1) out.push({ q: cell.q, r: cell.r });
    else if (sp.pondPlanting && (idx.ring1[c] as number[]).some((x) => board.cells[x]?.terrain === 'pond')) out.push({ q: cell.q, r: cell.r });
  });
  return out;
}

/** 민들레 씨앗을 놓을 수 있는 칸: 심는 칸에서 거리 2 이내 빈 칸(심는 칸 제외) */
export function legalSeedCells(state: GameState, plantPos: Position): Position[] {
  const board = requireBoard(state);
  const idx = boardIndex(board);
  const occ = occupancy(state);
  const c = idx.indexOf(plantPos);
  if (c < 0) return [];
  return (idx.within2[c] as number[]).filter((x) => isEmptyCell(state, idx, occ, x)).map((x) => ({ q: board.cells[x]!.q, r: board.cells[x]!.r }));
}

/** 덩굴이 고를 수 있는 방향 (그 방향에 보드 칸이 하나라도 있어야 한다) */
export function legalDirections(state: GameState, pos: Position): number[] {
  const idx = boardIndex(requireBoard(state));
  const c = idx.indexOf(pos);
  if (c < 0) return [];
  return [0, 1, 2, 3, 4, 5].filter((d) => ((idx.line[c]?.[d] ?? []).length > 0));
}
