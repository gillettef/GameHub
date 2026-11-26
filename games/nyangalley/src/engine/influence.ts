/**
 * 뿌리 큐브·땅·심을 수 있는 칸 (Rules.md 6·7절). 순수 함수. 상태는 칸마다 큐브 색과 수(rootSeat/rootCount)뿐이다.
 *
 * 줄다리기: 한 칸에는 한 색의 큐브만 있다. 남의 큐브가 있는 칸에 뿌리를 놓으면 내 큐브 1개가 남의 큐브 1개를
 * 밀어낸다(둘 다 각자 공급처로). 다 밀어내고 남은 만큼 내 큐브를 놓는다.
 * 공급처: 한 사람의 큐브 수는 정해져 있다(인원별 supply). 놓을 큐브가 모자라면 가장 높이 쌓인 내 다른 칸에서 옮겨 온다.
 */
import { CALL_BONUS, ENTRANCE_ROOTS, MOVE_MAX, ROAM_RANGE, SEED_RANGE, rulesFor } from './data/constants.js';
import { getSpecies } from './data/species.js';
import type { ChoreId, Direction, GameState, PlayerId, Position, RootSpot, SpeciesId } from './types.js';
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

/** 심을 수 있는 칸 계산에 쓰는 상태. chores 가 있으면 마실(roam)을 고른 자리를 알아낸다 */
export type PlantCellState = Pick<GameState, 'board' | 'plants' | 'players' | 'rootSeat' | 'rootCount'> & { chores?: readonly (ChoreId | null)[] };

/**
 * 이 종을 심을 수 있는 칸 (Rules.md 6.1). 칸 순서(r → q).
 * roam: 마실(Rules.md 5.3) — 내 땅에서 두 칸 안의 아무 큐브도 없는 빈 칸도 된다. 생략하면 state.chores 에서 이 사람이 마실을 골랐는지 본다
 */
export function legalPlantCells(state: PlantCellState, playerId: PlayerId, species: SpeciesId, roam?: boolean): Position[] {
  const board = requireBoard(state);
  const idx = boardIndex(board);
  const occ = occupancy(state);
  const seat = seatOf(state, playerId);
  if (seat === undefined) return [];
  const owners = computeOwners(state);
  const sp = getSpecies(species);
  const roaming = roam ?? state.chores?.[seat] === 'roam';
  const out: Position[] = [];
  board.cells.forEach((cell, c) => {
    if (!isEmptyCell(idx, occ, c)) return;
    const nb = idx.ring1[c] as number[];
    let ok = owners[c] === seat || (owners[c] === -1 && nb.some((x) => owners[x] === seat || occ.entranceSeat[x] === seat));
    if (!ok && roaming && owners[c] === -1) ok = withinOwn(idx, owners, c, seat, ROAM_RANGE);
    if (!ok && sp.pondPlanting) ok = nb.some((x) => board.cells[x]?.terrain === 'pond');
    if (ok) out.push({ q: cell.q, r: cell.r });
  });
  return out;
}

/** 칸 c 에서 거리 range(1 또는 2) 안에 seat 의 땅이 있는가 */
function withinOwn(idx: BoardIndex, owners: Int8Array, c: number, seat: number, range: number): boolean {
  for (const x of idx.ring1[c] as number[]) {
    if (owners[x] === seat) return true;
    if (range >= 2) for (const y of idx.ring1[x] as number[]) if (owners[y] === seat) return true;
  }
  return false;
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
 * 공급처에서 k 개를 쓸 수 있게 한다. 모자라면 가장 높이 쌓인 내 다른 칸(except 에 든 칸 제외)에서 하나씩 옮겨 온다.
 * 높이가 같으면 식물이 없는 칸 → 칸 순서. 실제로 쓸 수 있는 개수를 돌려준다
 */
function reserve(b: RootBuffer, seat: number, k: number, except: ReadonlySet<number>, limit: number, occ: Occupancy): number {
  let avail = limit - (b.onBoard[seat] as number);
  while (avail < k) {
    let best = -1;
    let bv = 0;
    for (let x = 0; x < b.count.length; x++) {
      if (except.has(x) || b.seat[x] !== seat) continue;
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

/**
 * 뿌리 한 묶음을 놓는다 (Rules.md 6.2, 2026-11-26 두 단계로 바꿈).
 * 1단계: 남의 큐브가 있는 칸마다 뿌리 수만큼 남의 큐브를 걷어 낸다(공급처 불필요). 남은 뿌리만 다음 단계로.
 * 2단계: 남은 뿌리 합만큼 공급처에서 놓는다. 모자라면 이번 차례에 큐브를 받는 칸을 뺀 내 칸 중 가장 높은 칸에서 옮겨 온다.
 *        옮겨 올 칸도 없으면 묶음 순서(심은 칸 먼저)대로 채우고 남는 뿌리는 버린다.
 * received: 이번 차례에 이미 큐브를 받은 칸(옮겨 오지 않는다). 이번 묶음에서 받는 칸을 더한다
 */
function placeRoots(b: RootBuffer, targets: readonly { cell: number; n: number }[], seat: number, limit: number, occ: Occupancy, received: Set<number>): void {
  const rest: { cell: number; n: number }[] = [];
  for (const t of targets) {
    if (t.n <= 0) continue;
    const h = (b.count[t.cell] as number) > 0 ? (b.seat[t.cell] as number) : -1;
    if (h === -1 || h === seat) {
      rest.push(t);
      continue;
    }
    const m = b.count[t.cell] as number;
    setCount(b, t.cell, h, Math.max(0, m - t.n));
    if (t.n > m) rest.push({ cell: t.cell, n: t.n - m });
  }
  for (const t of rest) received.add(t.cell);
  const need = rest.reduce((a, t) => a + t.n, 0);
  let avail = reserve(b, seat, need, received, limit, occ);
  for (const t of rest) {
    const k = Math.min(t.n, avail);
    if (k <= 0) break;
    const cur = b.seat[t.cell] === seat ? (b.count[t.cell] as number) : 0;
    setCount(b, t.cell, seat, cur + k);
    avail -= k;
  }
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
    const ring = (idx.ring1[idx.indexOf(e)] as number[]).filter((x) => canHoldRoots(idx, occ, x)).map((cell) => ({ cell, n: ENTRANCE_ROOTS }));
    placeRoots(b, ring, seat, limit, occ, new Set());
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
 * 순서: 뿌리 모양(걷어 내기 → 놓기, placeRoots) → 버섯 걷어내기 → 민들레 씨앗(걷어 내기 → 놓기).
 * bonus: 심은 칸 뿌리 수에 더한다(식빵 굽기 +1, Rules.md 5.3). 1단계 전에 더한다
 */
export function plantRoots(
  state: Pick<GameState, 'board' | 'plants' | 'players' | 'rootSeat' | 'rootCount'>,
  playerId: PlayerId,
  species: SpeciesId,
  pos: Position,
  rotation: Direction | number,
  seed?: Position | null,
  bonus = 0,
): PlantResult {
  const board = requireBoard(state);
  const idx = boardIndex(board);
  const occ = occupancy(state);
  const seat = seatOf(state, playerId);
  if (seat === undefined) throw new Error('없는 플레이어입니다');
  const sp = getSpecies(species);
  const limit = rulesFor(state.players.length).supply;
  const b = buffer(state);
  const received = new Set<number>();
  const c = idx.indexOf(pos);
  placeRoots(b, withBonus(targetsOn(idx, occ, species, pos, rotation), c, bonus), seat, limit, occ, received);
  if (sp.wither) for (const x of idx.ring1[c] as number[]) if (canHoldRoots(idx, occ, x)) wither(b, x, seat, sp.wither);
  if (sp.seed && seed) {
    const x = idx.indexOf(seed);
    if (x >= 0 && canHoldRoots(idx, occ, x)) placeRoots(b, [{ cell: x, n: sp.seed }], seat, limit, occ, received);
  }
  return { rootSeat: b.seat, rootCount: b.count, uprooted: b.uprooted };
}

/** 묶음에서 칸 c 의 뿌리 수에 bonus 를 더한다(없으면 맨 앞에 넣는다) */
function withBonus(targets: { cell: number; n: number }[], c: number, bonus: number): { cell: number; n: number }[] {
  if (!bonus) return targets;
  if (targets.some((t) => t.cell === c)) return targets.map((t) => (t.cell === c ? { cell: c, n: t.n + bonus } : t));
  return [{ cell: c, n: bonus }, ...targets];
}

// ---------------------------------------------------------------------------
// 명당을 놓지 않는 일과: 담 넘기·명당 부르기 (Rules.md 5.3, v7)
// ---------------------------------------------------------------------------

type RootState = Pick<GameState, 'board' | 'plants' | 'players' | 'rootSeat' | 'rootCount'>;

/** 담 넘기로 큐브를 들 수 있는 칸: 내 땅(내 큐브가 있는 칸) 중 옮길 칸이 하나라도 있는 칸. 칸 순서 */
export function legalMoveSources(state: RootState, playerId: PlayerId): Position[] {
  const board = requireBoard(state);
  const idx = boardIndex(board);
  const occ = occupancy(state);
  const seat = seatOf(state, playerId);
  if (seat === undefined) return [];
  const owners = computeOwners(state);
  return board.cells
    .filter((_, c) => owners[c] === seat && (idx.ring1[c] as number[]).some((x) => canHoldRoots(idx, occ, x)))
    .map((cell) => ({ q: cell.q, r: cell.r }));
}

/** 담 넘기로 from 에서 옮길 수 있는 칸: 맞닿은 칸 중 큐브를 놓을 수 있는 칸(입구·연못·바위 제외, 식물·내 땅·남의 땅 모두 된다). 방향 순서 */
export function legalMoveTargets(state: Pick<GameState, 'board' | 'plants'>, from: Position): Position[] {
  const board = requireBoard(state);
  const idx = boardIndex(board);
  const occ = occupancy(state);
  const c = idx.indexOf(from);
  if (c < 0) return [];
  return (idx.ring1[c] as number[]).filter((x) => canHoldRoots(idx, occ, x)).map((x) => ({ q: board.cells[x]!.q, r: board.cells[x]!.r }));
}

/** 담 넘기로 from 에서 한 번에 들 수 있는 큐브 수 최대 (내 땅이 아니면 0) */
export function moveMaxCount(state: Pick<GameState, 'board' | 'players' | 'rootSeat' | 'rootCount'>, playerId: PlayerId, from: Position): number {
  const idx = boardIndex(requireBoard(state));
  const c = idx.indexOf(from);
  const seat = seatOf(state, playerId);
  if (c < 0 || seat === undefined || state.rootSeat[c] !== seat) return 0;
  return Math.min(MOVE_MAX, state.rootCount[c] ?? 0);
}

/** 담 넘기 한 번이 합법인가. 아니면 사유 */
export function moveStepError(state: RootState, playerId: PlayerId, from: Position, to: Position, count: number): string | null {
  const have = moveMaxCount(state, playerId, from);
  if (have <= 0) return '내 고양이가 있는 칸에서만 담을 넘을 수 있습니다';
  if (!Number.isInteger(count) || count < 1 || count > have) return `이 칸에서는 한 번에 고양이 1~${have}마리만 옮길 수 있습니다`;
  if (!legalMoveTargets(state, from).some((p) => p.q === to.q && p.r === to.r)) return '맞닿은 칸(아지트·개울·공사장 제외)으로만 옮길 수 있습니다';
  return null;
}

/** 담 넘기를 한 번이라도 할 수 있는가 */
export function canMove(state: RootState, playerId: PlayerId): boolean {
  return legalMoveSources(state, playerId).length > 0;
}

/**
 * 담 넘기 한 번의 큐브 결과 (Rules.md 5.3): from 의 내 큐브 count 개를 들어 to 에 6.2 의 두 단계로 놓는다.
 * 들어 올린 큐브는 공급처로 돌아갔다가 그대로 쓰므로 공급처가 모자라 옮겨 오는 일은 없다. 검사는 moveStepError
 */
export function moveRoots(state: RootState, playerId: PlayerId, from: Position, to: Position, count: number): { rootSeat: number[]; rootCount: number[] } {
  const board = requireBoard(state);
  const idx = boardIndex(board);
  const occ = occupancy(state);
  const seat = seatOf(state, playerId);
  if (seat === undefined) throw new Error('없는 플레이어입니다');
  const limit = rulesFor(state.players.length).supply;
  const b = buffer(state);
  const f = idx.indexOf(from);
  const t = idx.indexOf(to);
  const have = b.seat[f] === seat ? (b.count[f] as number) : 0;
  const k = Math.min(count, have);
  setCount(b, f, seat, have - k);
  placeRoots(b, [{ cell: t, n: k }], seat, limit, occ, new Set([f]));
  return { rootSeat: b.seat, rootCount: b.count };
}

/** 명당 부르기로 부를 수 있는 식물 칸: 내 땅 위의 식물 (Rules.md 5.3). 칸 순서 */
export function legalCallCells(state: RootState, playerId: PlayerId): Position[] {
  const board = requireBoard(state);
  const occ = occupancy(state);
  const seat = seatOf(state, playerId);
  if (seat === undefined) return [];
  const owners = computeOwners(state);
  return board.cells.filter((_, c) => occ.plantIndex[c] !== -1 && owners[c] === seat).map((cell) => ({ q: cell.q, r: cell.r }));
}

/**
 * 명당 부르기의 큐브 결과 (Rules.md 5.3): pos 식물의 뿌리 모양을 rotation 으로 돌려 6.2 의 두 단계로 놓는다. 식물 칸 +1(CALL_BONUS).
 * 능력(씨앗·걷어내기)은 쓰지 않는다. 공급처가 모자라면 이번에 큐브를 받는 칸을 뺀 가장 높은 내 칸에서 옮겨 온다.
 * 식물의 회전 바꾸기는 호출자(turn.ts)가 한다
 */
export function callRoots(state: RootState, playerId: PlayerId, pos: Position, rotation: Direction | number): PlantResult {
  const board = requireBoard(state);
  const idx = boardIndex(board);
  const occ = occupancy(state);
  const seat = seatOf(state, playerId);
  if (seat === undefined) throw new Error('없는 플레이어입니다');
  const c = idx.indexOf(pos);
  const pi = c >= 0 ? (occ.plantIndex[c] as number) : -1;
  if (pi < 0) throw new Error('명당이 없는 칸입니다');
  const species = (state.plants[pi] as { species: SpeciesId }).species;
  const limit = rulesFor(state.players.length).supply;
  const b = buffer(state);
  placeRoots(b, withBonus(targetsOn(idx, occ, species, pos, rotation), c, CALL_BONUS), seat, limit, occ, new Set());
  return { rootSeat: b.seat, rootCount: b.count, uprooted: b.uprooted };
}
