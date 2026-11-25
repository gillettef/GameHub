/**
 * 뿌리 큐브·땅·심을 수 있는 칸 (Rules.md 6·7절). 순수 함수. 상태는 칸마다 큐브 색과 수(rootSeat/rootCount)뿐이다.
 *
 * 줄다리기: 한 칸에는 한 색의 큐브만 있다. 남의 큐브가 있는 칸에 뿌리를 놓으면 내 큐브 1개가 남의 큐브 1개를
 * 밀어낸다(둘 다 각자 공급처로). 다 밀어내고 남은 만큼 내 큐브를 놓는다.
 * 공급처: 한 사람의 큐브 수는 정해져 있다(인원별 supply). 놓을 큐브가 모자라면 가장 높이 쌓인 내 다른 칸에서 옮겨 온다.
 */
import { ENTRANCE_ROOTS, SEED_RANGE, rulesFor } from '../data/constants.js';
import { getSpecies } from '../data/species.js';
import type { Direction, GameState, PlayerId, Position, RootSpot, SpeciesId } from '../types/index.js';
import { boardIndex, hexDistance, type BoardIndex } from './board.js';

/** 칸별로 무엇이 있는가. 칸 색인 기준 */
export interface Occupancy {
  /** 식물 종 (없으면 null) */
  plantSpecies: (SpeciesId | null)[];
  /** state.plants 의 번호 (없으면 −1) */
  plantIndex: Int16Array;
  /** 입구 주인 자리 (−1 없음) */
  entranceSeat: Int8Array;
}

export function requireBoard(state: Pick<GameState, 'board'>) {
  if (!state.board) throw new Error('보드가 아직 없습니다');
  return state.board;
}

export function occupancy(state: Pick<GameState, 'board' | 'plants'>): Occupancy {
  const idx = boardIndex(requireBoard(state));
  const plantSpecies: (SpeciesId | null)[] = new Array(idx.n).fill(null);
  const plantIndex = new Int16Array(idx.n).fill(-1);
  const entranceSeat = new Int8Array(idx.n).fill(-1);
  state.plants.forEach((p, i) => {
    const c = idx.indexOf(p.pos);
    plantSpecies[c] = p.species;
    plantIndex[c] = i;
  });
  idx.board.entrances.forEach((e, seat) => (entranceSeat[idx.indexOf(e)] = seat));
  return { plantSpecies, plantIndex, entranceSeat };
}

const seatOf = (state: Pick<GameState, 'players'>, playerId: PlayerId): number | undefined => state.players.find((p) => p.id === playerId)?.seat;

/** 큐브를 놓을 수 있는 칸: 빈 땅·기름진 땅이고 입구가 아니다 (식물이 있어도 된다) */
export function canHoldRoots(idx: BoardIndex, occ: Occupancy, c: number): boolean {
  const t = idx.board.cells[c]?.terrain;
  return (t === 'empty' || t === 'fertile') && occ.entranceSeat[c] === -1;
}

/** 빈 칸: 큐브를 놓을 수 있고 식물이 없다 */
export function isEmptyCell(idx: BoardIndex, occ: Occupancy, c: number): boolean {
  return canHoldRoots(idx, occ, c) && occ.plantIndex[c] === -1;
}

/** 칸 주인 자리 (−1 = 없음). 큐브가 있는 색이 주인이다 */
export function computeOwners(state: Pick<GameState, 'board' | 'rootSeat' | 'rootCount'>): Int8Array {
  const n = requireBoard(state).cells.length;
  const out = new Int8Array(n).fill(-1);
  for (let c = 0; c < n; c++) if ((state.rootCount[c] ?? 0) > 0) out[c] = state.rootSeat[c] ?? -1;
  return out;
}

/** 자리별 보드 위 큐브 수 */
export function cubesOnBoard(state: Pick<GameState, 'players' | 'rootSeat' | 'rootCount'>): number[] {
  const out = new Array<number>(state.players.length).fill(0);
  state.rootCount.forEach((k, c) => {
    const s = state.rootSeat[c] ?? -1;
    if (k > 0 && s >= 0) out[s]! += k;
  });
  return out;
}

/** 자리별 공급처에 남은 큐브 (Rules.md 5절 다음 선) */
export function supplyLeft(state: Pick<GameState, 'players' | 'rootSeat' | 'rootCount'>): number[] {
  const lim = rulesFor(state.players.length).supply;
  return cubesOnBoard(state).map((v) => lim - v);
}

/** 회전 1번 = 60°: (q, r) → (−r, q + r) */
export function rotateSpot(spot: RootSpot, rotation: number): RootSpot {
  let { dq, dr } = spot;
  for (let k = 0; k < ((rotation % 6) + 6) % 6; k++) [dq, dr] = [0 - dr, dq + dr];
  return { dq, dr, n: spot.n };
}

const rotationCache = new Map<SpeciesId, Direction[]>();

/** 모양이 서로 다른 회전 번호 (버섯은 0 하나뿐). 같은 모양이면 앞 번호만 남긴다 */
export function distinctRotations(species: SpeciesId): Direction[] {
  const hit = rotationCache.get(species);
  if (hit) return hit;
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
  rotationCache.set(species, out);
  return out;
}

/** 이 식물을 이 칸에 이 회전으로 심을 때 큐브를 놓을 칸 (놓는 순서). 보드 밖·연못·바위·입구는 건너뛴다 */
export function rootTargets(state: Pick<GameState, 'board' | 'plants'>, species: SpeciesId, pos: Position, rotation: number): { cell: number; n: number }[] {
  return targetsOn(boardIndex(requireBoard(state)), occupancy(state), species, pos, rotation);
}

/** rootTargets 본체. 색인·점유를 이미 만든 호출자(plantRoots)가 다시 계산하지 않게 나눠 둔다 */
function targetsOn(idx: BoardIndex, occ: Occupancy, species: SpeciesId, pos: Position, rotation: number): { cell: number; n: number }[] {
  const out: { cell: number; n: number }[] = [];
  for (const spot of getSpecies(species).roots) {
    const s = rotateSpot(spot, rotation);
    const c = idx.indexOf({ q: pos.q + s.dq, r: pos.r + s.dr });
    if (c >= 0 && canHoldRoots(idx, occ, c)) out.push({ cell: c, n: s.n });
  }
  return out;
}

/** 이 종을 심을 수 있는 칸 (Rules.md 6.1). 칸 순서(r → q) */
export function legalPlantCells(state: Pick<GameState, 'board' | 'plants' | 'players' | 'rootSeat' | 'rootCount'>, playerId: PlayerId, species: SpeciesId): Position[] {
  const board = requireBoard(state);
  const idx = boardIndex(board);
  const occ = occupancy(state);
  const seat = seatOf(state, playerId);
  if (seat === undefined) return [];
  const owners = computeOwners(state);
  const sp = getSpecies(species);
  const out: Position[] = [];
  board.cells.forEach((cell, c) => {
    if (!isEmptyCell(idx, occ, c)) return;
    const nb = idx.ring1[c] as number[];
    let ok = owners[c] === seat || (owners[c] === -1 && nb.some((x) => owners[x] === seat || occ.entranceSeat[x] === seat));
    if (!ok && sp.pondPlanting) ok = nb.some((x) => board.cells[x]?.terrain === 'pond');
    if (ok) out.push({ q: cell.q, r: cell.r });
  });
  return out;
}

/** 민들레 씨앗 칸: 심는 칸에서 두 칸 안, 큐브를 놓을 수 있는 칸 (심는 칸 제외) */
export function legalSeedCells(state: Pick<GameState, 'board' | 'plants'>, plantPos: Position): Position[] {
  const board = requireBoard(state);
  const idx = boardIndex(board);
  const occ = occupancy(state);
  const c = idx.indexOf(plantPos);
  if (c < 0) return [];
  return board.cells
    .map((cell, x) => ({ cell, x }))
    .filter(({ cell, x }) => x !== c && hexDistance(cell, plantPos) <= SEED_RANGE && canHoldRoots(idx, occ, x))
    .map(({ cell }) => ({ q: cell.q, r: cell.r }));
}

// ---------------------------------------------------------------------------
// 큐브 놓기 (가변 작업 버퍼 — 결과는 새 배열로 돌려준다)
// ---------------------------------------------------------------------------

export interface RootBuffer {
  seat: number[];
  count: number[];
  /** 자리별 보드 위 큐브 */
  onBoard: number[];
  /** 공급처가 모자라 옮겨 온 칸 (기록용, 옮긴 횟수만큼) */
  uprooted: number[];
}

function buffer(state: Pick<GameState, 'players' | 'rootSeat' | 'rootCount'>): RootBuffer {
  return { seat: [...state.rootSeat], count: [...state.rootCount], onBoard: cubesOnBoard(state), uprooted: [] };
}

function setCount(b: RootBuffer, c: number, seat: number, v: number): void {
  const old = b.seat[c] === seat ? (b.count[c] as number) : 0;
  b.onBoard[seat]! += v - old;
  b.count[c] = v;
  b.seat[c] = v > 0 ? seat : -1;
}

/**
 * 공급처에서 k 개를 쓸 수 있게 한다. 모자라면 가장 높이 쌓인 내 다른 칸(except 제외)에서 하나씩 옮겨 온다.
 * 높이가 같으면 식물이 없는 칸 → 칸 순서. 실제로 쓸 수 있는 개수를 돌려준다
 */
function reserve(b: RootBuffer, seat: number, k: number, except: number, limit: number, occ: Occupancy): number {
  let avail = limit - (b.onBoard[seat] as number);
  while (avail < k) {
    let best = -1;
    let bv = 0;
    for (let x = 0; x < b.count.length; x++) {
      if (x === except || b.seat[x] !== seat) continue;
      const v = b.count[x] as number;
      if (v > bv || (v === bv && v > 0 && best >= 0 && occ.plantIndex[best] !== -1 && occ.plantIndex[x] === -1)) {
        bv = v;
        best = x;
      }
    }
    if (best < 0) break;
    setCount(b, best, seat, bv - 1);
    b.uprooted.push(best);
    avail++;
  }
  return Math.max(0, Math.min(k, avail));
}

function addRoots(b: RootBuffer, c: number, seat: number, k: number, limit: number, occ: Occupancy): void {
  if (k <= 0) return;
  const h = (b.count[c] as number) > 0 ? (b.seat[c] as number) : -1;
  if (h === -1 || h === seat) {
    const cur = h === seat ? (b.count[c] as number) : 0;
    const add = reserve(b, seat, k, c, limit, occ);
    if (add > 0) setCount(b, c, seat, cur + add);
    return;
  }
  const m = b.count[c] as number;
  if (k < m) {
    setCount(b, c, h, m - k);
    return;
  }
  setCount(b, c, h, 0);
  const rem = k - m;
  const add = rem > 0 ? reserve(b, seat, rem, c, limit, occ) : 0;
  if (add > 0) setCount(b, c, seat, add);
}

function wither(b: RootBuffer, c: number, seat: number, k: number): void {
  const h = (b.count[c] as number) > 0 ? (b.seat[c] as number) : -1;
  if (h >= 0 && h !== seat) setCount(b, c, h, Math.max(0, (b.count[c] as number) - k));
}

/** 처음 입구 둘레 큐브 (Rules.md 4절) */
export function entranceRoots(state: Pick<GameState, 'board' | 'plants' | 'players' | 'rootSeat' | 'rootCount'>): { rootSeat: number[]; rootCount: number[] } {
  const board = requireBoard(state);
  const idx = boardIndex(board);
  const occ = occupancy(state);
  const b = buffer(state);
  const limit = rulesFor(state.players.length).supply;
  board.entrances.forEach((e, seat) => {
    for (const x of idx.ring1[idx.indexOf(e)] as number[]) if (canHoldRoots(idx, occ, x)) addRoots(b, x, seat, ENTRANCE_ROOTS, limit, occ);
  });
  return { rootSeat: b.seat, rootCount: b.count };
}

export interface PlantResult {
  rootSeat: number[];
  rootCount: number[];
  /** 공급처가 모자라 큐브를 옮겨 온 칸 */
  uprooted: number[];
}

/**
 * 심기의 큐브 결과 (Rules.md 6.2·7절). state.plants 에는 이미 이 식물이 들어 있어야 한다(옮겨 올 칸 고르기에 쓴다).
 * 순서: 뿌리 모양(심은 칸 먼저, 카드 순서) → 버섯 걷어내기 → 민들레 씨앗.
 */
export function plantRoots(
  state: Pick<GameState, 'board' | 'plants' | 'players' | 'rootSeat' | 'rootCount'>,
  playerId: PlayerId,
  species: SpeciesId,
  pos: Position,
  rotation: Direction | number,
  seed?: Position | null,
): PlantResult {
  const board = requireBoard(state);
  const idx = boardIndex(board);
  const occ = occupancy(state);
  const seat = seatOf(state, playerId);
  if (seat === undefined) throw new Error('없는 플레이어입니다');
  const sp = getSpecies(species);
  const limit = rulesFor(state.players.length).supply;
  const b = buffer(state);
  for (const t of targetsOn(idx, occ, species, pos, rotation)) addRoots(b, t.cell, seat, t.n, limit, occ);
  const c = idx.indexOf(pos);
  if (sp.wither) for (const x of idx.ring1[c] as number[]) if (canHoldRoots(idx, occ, x)) wither(b, x, seat, sp.wither);
  if (sp.seed && seed) {
    const x = idx.indexOf(seed);
    if (x >= 0 && canHoldRoots(idx, occ, x)) addRoots(b, x, seat, sp.seed, limit, occ);
  }
  return { rootSeat: b.seat, rootCount: b.count, uprooted: b.uprooted };
}
