/**
 * 육각 판 조립 보드(docs/design.md 10절). 판 19장을 시드로 섞어 놓고, 칸·길 그래프를 만든다.
 * 칸 번호는 판을 놓은 순서(성 → 폐허 고리 → 숲 고리)대로 매긴다.
 */
import * as R from './rng'
import { TILES, TILE_R, type TileFace } from './tiles'

export type TileSet = 'castle' | 'camp' | 'ruin' | 'forest'

export interface PlacedTile {
  set: TileSet
  /** TILES[set] 안의 번호 */
  idx: number
  /** 0 앞면, 1 뒷면 */
  side: number
  /** 축 좌표 */
  q: number
  r: number
  /** 60도 단위 시계 방향 회전 */
  rot: number
}

export interface MapCell {
  x: number
  y: number
  /** 1 바깥(숲), 2 가운데(폐허), 3 안쪽(성), 4 옥좌 */
  ring: number
  /** 놓인 판 번호(BoardMap.tiles) */
  tile: number
}

export interface BoardMap {
  tiles: PlacedTile[]
  cells: MapCell[]
  /** 길: [칸, 칸, 험한 길이면 1] */
  links: [number, number, 0 | 1][]
  /** 칸마다 이웃 칸 */
  nb: number[][]
  camp: number
  throne: number
}

/** 이웃 축 좌표 방향. 순서가 변 번호(0~5)와 같다 */
export const DIRS: readonly [number, number][] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]
const SQ3 = Math.sqrt(3)
const rad = (d: number) => (d * Math.PI) / 180

export const tileCenter = (q: number, r: number): [number, number] => [TILE_R * SQ3 * (q + r / 2), TILE_R * 1.5 * r]
export const hexDist = (q: number, r: number) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2
/** 판의 꼭짓점 6개(그리기용) */
export function hexCorners(cx: number, cy: number, r = TILE_R): [number, number][] {
  return Array.from({ length: 6 }, (_, k) => [cx + r * Math.cos(rad(60 * k - 30)), cy + r * Math.sin(rad(60 * k - 30))])
}
export function rotate(x: number, y: number, rot: number): [number, number] {
  const c = Math.cos(rad(60 * rot))
  const s = Math.sin(rad(60 * rot))
  return [x * c - y * s, x * s + y * c]
}
export const faceOf = (t: PlacedTile): TileFace => (TILES[t.set][t.idx] as [TileFace, TileFace])[t.side] as TileFace

/** 축 좌표 고리 n 의 자리들(시계 방향, 동쪽부터) */
export function ringSpots(n: number): [number, number][] {
  if (n === 0) return [[0, 0]]
  const out: [number, number][] = []
  let q = (DIRS[4] as [number, number])[0] * n
  let r = (DIRS[4] as [number, number])[1] * n
  for (let side = 0; side < 6; side++) {
    for (let k = 0; k < n; k++) {
      out.push([q, r])
      const d = DIRS[side] as [number, number]
      q += d[0]
      r += d[1]
    }
  }
  return out
}

/** 준비 1~3단계: 판을 섞어 무작위 자리·방향·면으로 놓는다 */
export function shuffleTiles(rng: R.Rng): PlacedTile[] {
  const side = () => R.int(rng, 2)
  const rot = () => R.int(rng, 6)
  const out: PlacedTile[] = [{ set: 'castle', idx: 0, side: side(), q: 0, r: 0, rot: rot() }]
  const ruins = R.shuffle(rng, TILES.ruin.map((_, i) => i))
  ringSpots(1).forEach(([q, r], k) => out.push({ set: 'ruin', idx: ruins[k] as number, side: side(), q, r, rot: rot() }))
  const outer = R.shuffle(rng, [{ set: 'camp' as TileSet, idx: 0 }, ...TILES.forest.map((_, i) => ({ set: 'forest' as TileSet, idx: i }))])
  ringSpots(2).forEach(([q, r], k) => {
    const o = outer[k] as { set: TileSet; idx: number }
    out.push({ set: o.set, idx: o.idx, side: side(), q, r, rot: rot() })
  })
  return out
}

/** 놓인 판들로 칸·길 그래프를 만든다 */
export function buildMap(tiles: PlacedTile[]): BoardMap {
  const cells: MapCell[] = []
  const base: number[] = []
  let camp = -1
  let throne = -1
  tiles.forEach((t, ti) => {
    const f = faceOf(t)
    const [cx, cy] = tileCenter(t.q, t.r)
    base.push(cells.length)
    for (const c of f.cells) {
      const [x, y] = rotate(c.x, c.y, t.rot)
      if (c.camp) camp = cells.length
      if (c.ring === 4) throne = cells.length
      cells.push({ x: Math.round((cx + x) * 10) / 10, y: Math.round((cy + y) * 10) / 10, ring: c.ring, tile: ti })
    }
  })
  const links: [number, number, 0 | 1][] = []
  const seen = new Map<string, number>()
  const add = (a: number, b: number, rough: 0 | 1) => {
    if (a === b) return
    const k = a < b ? `${a}-${b}` : `${b}-${a}`
    const at = seen.get(k)
    if (at !== undefined) {
      // 같은 두 칸 사이에 길이 둘이면 편한 쪽을 쓴다
      if (!rough) (links[at] as [number, number, 0 | 1])[2] = 0
      return
    }
    seen.set(k, links.length)
    links.push([Math.min(a, b), Math.max(a, b), rough])
  }
  tiles.forEach((t, ti) => {
    for (const [i, j, rough] of faceOf(t).roads) add((base[ti] as number) + i, (base[ti] as number) + j, rough)
  })
  // 판 사이: 맞닿은 두 변의 출구끼리 잇는다. 한쪽이라도 험한 길이면 험한 길
  const at = new Map<string, number>()
  tiles.forEach((t, ti) => at.set(`${t.q},${t.r}`, ti))
  tiles.forEach((t, ti) => {
    for (let e = 0; e < 6; e++) {
      const d = DIRS[e] as [number, number]
      const oi = at.get(`${t.q + d[0]},${t.r + d[1]}`)
      if (oi === undefined || oi < ti) continue
      const o = tiles[oi] as PlacedTile
      const mine = faceOf(t).ports[(((e - t.rot) % 6) + 6) % 6] as { cell: number; rough: 0 | 1 }
      const theirs = faceOf(o).ports[(((e + 3 - o.rot) % 6) + 6) % 6] as { cell: number; rough: 0 | 1 }
      add((base[ti] as number) + mine.cell, (base[oi] as number) + theirs.cell, (mine.rough || theirs.rough) as 0 | 1)
    }
  })
  const nb: number[][] = cells.map(() => [])
  for (const [a, b] of links) {
    ;(nb[a] as number[]).push(b)
    ;(nb[b] as number[]).push(a)
  }
  return { tiles, cells, links, nb, camp, throne }
}

// ── 거리(길을 따라 센 칸 수) ──
const distCache = new WeakMap<number[][], Map<number, Int16Array>>()
export function distFrom(map: Pick<BoardMap, 'nb'>, src: number): Int16Array {
  let m = distCache.get(map.nb)
  if (!m) distCache.set(map.nb, (m = new Map()))
  const hit = m.get(src)
  if (hit) return hit
  const d = new Int16Array(map.nb.length).fill(-1)
  d[src] = 0
  const q = [src]
  for (let i = 0; i < q.length; i++) {
    const v = q[i] as number
    for (const w of map.nb[v] as number[]) {
      if (d[w] !== -1) continue
      d[w] = (d[v] as number) + 1
      q.push(w)
    }
  }
  m.set(src, d)
  return d
}
export function mapDist(map: Pick<BoardMap, 'nb'>, a: number, b: number): number {
  const d = distFrom(map, a)[b]
  return d === undefined || d < 0 ? Infinity : d
}
export function isRough(map: Pick<BoardMap, 'links'>, a: number, b: number): boolean {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return map.links.some(([x, y, r]) => x === lo && y === hi && r === 1)
}
