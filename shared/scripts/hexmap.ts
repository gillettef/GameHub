/**
 * 맵 좌표 후보의 좌석 공정성 지표를 계산하는 스크립트 (10x10 재설계, 2026-09-23).
 * data.test.ts 의 '좌석 공정성' describe 블록과 동일한 지표를 계산해 출력한다.
 * 실행: npx tsx shared/scripts/hexmap.ts
 */
import { cellsInRadius, hexDistance } from '../src/engine/index.js';
import { MAPS } from '../src/data/index.js';
import type { Board, Position } from '../src/types/index.js';

export function legalNeighbors(board: Board, core: Position, others: Position[]): number {
  const otherSet = new Set(others.map((q) => `${q.x},${q.y}`));
  return cellsInRadius(board, core, 1)
    .filter((q) => q.x !== core.x || q.y !== core.y)
    .filter((q) => !otherSet.has(`${q.x},${q.y}`)).length;
}
export function nearestVein(core: Position, veins: Position[]): number {
  return Math.min(...veins.map((v) => hexDistance(core, v)));
}
export function within3(points: Position[], core: Position): number {
  return points.filter((q) => hexDistance(core, q) <= 3).length;
}
export function edgeDistance(board: Board, core: Position): number {
  let r = 0;
  while (r < 10 && cellsInRadius(board, core, r + 1).length === 3 * (r + 1) * (r + 2) + 1) r++;
  return r;
}
export function pairDistances(core: Position, cores: Position[]): number[] {
  return cores.filter((c) => c !== core).map((c) => hexDistance(core, c)).sort((a, b) => a - b);
}

export function report(name: string, size: number, cores: Position[], asteroids: Position[], veins: Position[]) {
  const board: Board = { width: size, height: size, asteroids, veins };
  console.log(`\n=== ${name} (size ${size}) ===`);
  for (const c of cores) {
    const others = [...cores.filter((x) => x !== c), ...asteroids];
    console.log(
      `core (${c.x},${c.y}) legal=${legalNeighbors(board, c, others)} nearestVein=${nearestVein(c, veins)} ` +
        `veins3=${within3(veins, c)} ast3=${within3(asteroids, c)} edge=${edgeDistance(board, c)} pairs=${JSON.stringify(pairDistances(c, cores))}`,
    );
  }
  const all = [...cores, ...asteroids, ...veins];
  const keys = all.map((q) => `${q.x},${q.y}`);
  const dup = keys.length !== new Set(keys).size;
  const oob = all.some((q) => q.x < 0 || q.y < 0 || q.x >= size || q.y >= size);
  if (dup) console.log('!! 좌표 중복 있음');
  if (oob) console.log('!! 보드 밖 좌표 있음');
}

export const p = (x: number, y: number): Position => ({ x, y });

/** cores 고정, size x size 보드에서 veins triple 을 탐색해 공정성(최근접 거리·반경3 개수) 이 맞는 후보를 찾는다. */
export function searchVeins(
  size: number,
  cores: Position[],
  count: number,
  opts: { avoidEdge?: boolean; excluded?: Position[] } = {},
): Position[][] {
  const excluded = new Set((opts.excluded ?? []).map((q) => `${q.x},${q.y}`));
  const cells: Position[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (opts.avoidEdge && (x === 0 || y === 0 || x === size - 1 || y === size - 1)) continue;
      const c = p(x, y);
      if (cores.some((k) => k.x === x && k.y === y)) continue;
      if (excluded.has(`${x},${y}`)) continue;
      cells.push(c);
    }
  }
  const results: Position[][] = [];
  function combos(start: number, chosen: Position[]) {
    if (results.length >= 40) return;
    if (chosen.length === count) {
      const n = cores.map((c) => nearestVein(c, chosen));
      const v = cores.map((c) => within3(chosen, c));
      if (new Set(n).size === 1 && new Set(v).size === 1) results.push([...chosen]);
      return;
    }
    for (let i = start; i < cells.length && results.length < 40; i++) {
      chosen.push(cells[i]!);
      combos(i + 1, chosen);
      chosen.pop();
    }
  }
  combos(0, []);
  return results;
}

/** `npx tsx shared/scripts/hexmap.ts` 로 실행하면 현재 maps.ts 의 맵 6개 전부에 대해
 * 좌석 공정성 지표(data.test.ts '좌석 공정성' 과 동일)를 찍는다 — 새 맵을 만들거나
 * 좌표를 조정할 때 확인용으로 쓴다. */
if (process.argv[1] && process.argv[1].endsWith('hexmap.ts')) {
  for (const m of MAPS) {
    report(m.id, m.size, m.corePositions, m.asteroids, m.veins);
  }
}
