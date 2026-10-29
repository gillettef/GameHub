/**
 * 육각 좌표와 보드 조립 (Rules.md 2·3절). 순수 함수. 난수는 넘겨받은 시드로만 만든다.
 */
import { ENTRANCE_TILE, TILE_LIBRARY } from '../data/tiles.js';
import type { Board, Cell, Direction, Position } from '../types/index.js';
import { nextRandom, shuffle } from './rng.js';

/** 방향 0~5 (Rules.md 2절) */
export const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export function hexDistance(a: Position, b: Position): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export const posKey = (p: Position): string => `${p.q},${p.r}`;
export const samePos = (a: Position, b: Position): boolean => a.q === b.q && a.r === b.r;

export function step(p: Position, d: number, k = 1): Position {
  const [dq, dr] = DIRECTIONS[d] as readonly [number, number];
  return { q: p.q + dq * k, r: p.r + dr * k };
}

// ---------------------------------------------------------------------------
// 조각 배치 (Rules.md 3.3)
// ---------------------------------------------------------------------------

interface LatticePoint {
  q: number;
  r: number;
  /** 원점에서의 유클리드 거리 제곱 × 4 (정수 비교용) */
  d2: number;
  ang: number;
}

function lattice(): LatticePoint[] {
  const pts: LatticePoint[] = [];
  for (let a = -5; a <= 5; a++)
    for (let b = -5; b <= 5; b++) {
      const q = 2 * a - b;
      const r = a + 3 * b;
      const x = q + r / 2;
      const y = (r * Math.sqrt(3)) / 2;
      pts.push({ q, r, d2: Math.round((x * x + y * y) * 4), ang: Math.atan2(y, x) });
    }
  return pts.sort((p1, p2) => p1.d2 - p2.d2 || p1.ang - p2.ang);
}

function tileCells(center: Position): Position[] {
  return [center, ...DIRECTIONS.map((_, d) => step(center, d))];
}

function distanceProfile(cells: Position[], from: Position): number[] {
  return cells.map((c) => hexDistance(c, from)).sort((a, b) => a - b);
}

export interface Layout {
  /** 조각 중심. 0번이 원점(가운데 조각) */
  centers: Position[];
  /** 자리 순서대로 입구 조각 번호 */
  entranceTiles: number[];
}

const layoutCache = new Map<number, Layout>();

/** 인원별 고정 조각 배치와 입구 (Rules.md 3.3 표). 결과는 인원마다 항상 같다 */
export function layoutFor(players: number): Layout {
  const cached = layoutCache.get(players);
  if (cached) return cached;
  const rings: LatticePoint[][] = [];
  for (const p of lattice()) {
    const last = rings[rings.length - 1];
    if (last && (last[0] as LatticePoint).d2 === p.d2) last.push(p);
    else rings.push([p]);
  }
  const ringsUpTo = (n: number): Position[] => rings.slice(0, n + 1).flat().map(({ q, r }) => ({ q, r }));
  const candidates: { centers: Position[]; outer: number[] }[] = [];
  if (players === 2) candidates.push({ centers: ringsUpTo(1), outer: [1, 2, 3, 4, 5, 6] });
  else if (players === 3) candidates.push({ centers: ringsUpTo(2), outer: [7, 8, 9, 10, 11, 12] });
  else if (players === 4) {
    const r3 = rings[3] as LatticePoint[];
    for (const a of r3) {
      const opp = r3.find((p) => p.q === -a.q && p.r === -a.r);
      if (!opp || opp.ang < a.ang) continue;
      candidates.push({ centers: [...ringsUpTo(2), { q: a.q, r: a.r }, { q: opp.q, r: opp.r }], outer: [7, 8, 9, 10, 11, 12, 13, 14] });
    }
  } else throw new Error(`${players}인 보드는 없습니다`);

  let best: { layout: Layout; diff: number; minDist: number } | null = null;
  for (const cand of candidates) {
    const cells = cand.centers.flatMap(tileCells);
    const pick = (start: number, acc: number[]): void => {
      if (acc.length === players) {
        const profs = acc.map((t) => distanceProfile(cells, cand.centers[t] as Position));
        let diff = 0;
        let minDist = Infinity;
        for (let i = 0; i < acc.length; i++)
          for (let j = i + 1; j < acc.length; j++) {
            const a = profs[i] as number[];
            const b = profs[j] as number[];
            diff = Math.max(diff, a.reduce((s, v, k) => s + Math.abs(v - (b[k] as number)), 0));
            minDist = Math.min(minDist, hexDistance(cand.centers[acc[i] as number] as Position, cand.centers[acc[j] as number] as Position));
          }
        if (!best || diff < best.diff || (diff === best.diff && minDist > best.minDist)) {
          best = { layout: { centers: cand.centers, entranceTiles: [...acc] }, diff, minDist };
        }
        return;
      }
      for (let k = start; k < cand.outer.length; k++) pick(k + 1, [...acc, cand.outer[k] as number]);
    };
    pick(0, []);
  }
  const found = (best as { layout: Layout } | null)?.layout;
  if (!found) throw new Error(`${players}인 보드를 만들지 못했습니다`);
  const angle = (t: number) => {
    const c = found.centers[t] as Position;
    return Math.atan2((c.r * Math.sqrt(3)) / 2, c.q + c.r / 2);
  };
  found.entranceTiles.sort((a, b) => angle(a) - angle(b));
  layoutCache.set(players, found);
  return found;
}

/**
 * 보드 조립 (Rules.md 3.3, 11절 난수 순서): 일반 조각 섞기 → 조각마다 회전 0~5.
 * 칸은 r → q 오름차순으로 정렬한다.
 */
export function buildBoard(players: number, seed: number): { board: Board; seed: number } {
  const layout = layoutFor(players);
  const shuffled = shuffle(TILE_LIBRARY.map((_, i) => i), seed);
  let s = shuffled.seed;
  let libPos = 0;
  const cells: Cell[] = [];
  const entrances: Position[] = [];
  layout.centers.forEach((center, t) => {
    const seat = layout.entranceTiles.indexOf(t);
    const spec = seat >= 0 ? ENTRANCE_TILE : TILE_LIBRARY[shuffled.items[libPos++] as number];
    const rnd = nextRandom(s);
    s = rnd.seed;
    const rot = Math.floor(rnd.value * 6);
    const slots: Cell['terrain'][] = new Array(7).fill('empty');
    for (const [slot, terrain] of spec ?? []) slots[slot === 0 ? 0 : ((slot - 1 + rot) % 6) + 1] = terrain;
    tileCells(center).forEach((p, slot) => cells.push({ q: p.q, r: p.r, terrain: slots[slot] as Cell['terrain'], tile: t }));
    if (seat >= 0) entrances[seat] = { ...center };
  });
  cells.sort((a, b) => a.r - b.r || a.q - b.q);
  return { board: { cells, entrances, tileCount: layout.centers.length }, seed: s };
}

// ---------------------------------------------------------------------------
// 보드 색인 (파생값 캐시). 보드 객체는 불변이라 WeakMap 으로 한 번만 만든다
// ---------------------------------------------------------------------------

export interface BoardIndex {
  board: Board;
  n: number;
  indexOf: (p: Position) => number;
  /** 칸별 거리 1 이웃 색인 */
  ring1: number[][];
  edge: boolean[];
}

const indexCache = new WeakMap<Board, BoardIndex>();

export function boardIndex(board: Board): BoardIndex {
  const cached = indexCache.get(board);
  if (cached) return cached;
  const map = new Map<string, number>();
  board.cells.forEach((c, i) => map.set(posKey(c), i));
  const at = (p: Position) => map.get(posKey(p)) ?? -1;
  const ring1: number[][] = [];
  const edge: boolean[] = [];
  board.cells.forEach((c) => {
    const nb = DIRECTIONS.map((_, d) => at(step(c, d))).filter((x) => x >= 0);
    ring1.push(nb);
    edge.push(nb.length < 6);
  });
  const idx: BoardIndex = { board, n: board.cells.length, indexOf: at, ring1, edge };
  indexCache.set(board, idx);
  return idx;
}

// ---------------------------------------------------------------------------
// 칸 이름 (Rules.md 2절 "칸 이름"). 게임 기록·화면에 쓰는 사람용 좌표
// ---------------------------------------------------------------------------

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const labelCache = new WeakMap<Board, readonly string[]>();

/**
 * 칸별 이름(board.cells 순서). 줄 = 위에서부터 A, B, C …(r 오름차순), 칸 번호 = 보드 왼쪽 끝부터 반 칸 단위
 * 가로 위치 `2q + r` 를 2로 나눈 열 번호(1부터). 줄마다 반 칸 엇갈리므로 위·아래 줄의 같은 번호는 오른쪽 아래/위로 맞닿는다.
 * 보드 윤곽이 인원마다 고정이라 이름도 인원마다 고정이다(지형 배치와 무관)
 */
export function cellLabels(board: Board): readonly string[] {
  const cached = labelCache.get(board);
  if (cached) return cached;
  const minR = Math.min(...board.cells.map((c) => c.r));
  const minX = Math.min(...board.cells.map((c) => 2 * c.q + c.r));
  const labels = board.cells.map((c) => `${ROW_LETTERS[c.r - minR] ?? '?'}${Math.floor((2 * c.q + c.r - minX) / 2) + 1}`);
  labelCache.set(board, labels);
  return labels;
}

/** 칸 이름 (예: "C4"). 보드 밖이면 "?" */
export function cellLabel(board: Board, p: Position): string {
  const i = boardIndex(board).indexOf(p);
  return i >= 0 ? (cellLabels(board)[i] as string) : '?';
}

export function isDirection(d: unknown): d is Direction {
  return d === 0 || d === 1 || d === 2 || d === 3 || d === 4 || d === 5;
}
