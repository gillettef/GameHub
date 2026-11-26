/**
 * 육각 판 19장(앞뒤) 데이터를 만든다 → src/engine/tiles.ts
 * 실행: npx tsx tools/tiles-gen.ts (게임 폴더에서)
 *
 * 만든 뒤에는 tiles.ts 를 손으로 고쳐도 된다(실물 판 디자인이 정본). 다시 돌리면 덮어쓴다.
 * 판 좌표: 뾰족한 꼭짓점이 위인 육각형, 중심 (0,0), 꼭짓점까지 100. 변 e(0~5)의 가운데는 60e도(화면 기준, y 아래).
 * 모든 판은 여섯 변 가운데에 출구가 있다(docs/design.md 10절). ports[e] = 그 변의 출구와 이어진 칸.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const R = 100
const AP = (R * Math.sqrt(3)) / 2
const MIN = 40
const EDGE_M = 21
type P = [number, number]

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const mix = (a: number, b: number) => (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)) >>> 0
function shuffle<T>(rnd: () => number, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j] as T, a[i] as T]
  }
  return a
}
const rad = (d: number) => (d * Math.PI) / 180
const d2 = (a: P, b: P) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
const r1 = (x: number) => Math.round(x * 10) / 10
const inside = (p: P, m: number) => {
  for (let e = 0; e < 6; e++) if (p[0] * Math.cos(rad(60 * e)) + p[1] * Math.sin(rad(60 * e)) > AP - m) return false
  return true
}
const portPoint = (e: number): P => [AP * Math.cos(rad(60 * e)), AP * Math.sin(rad(60 * e))]

type Kind = 'castle' | 'ruin' | 'forest' | 'camp'
interface Cell { x: number; y: number; ring: number; camp?: true }
interface Deco { x: number; y: number; type: 'lake' | 'peak' | 'rubble' | 'pool'; s: number }
interface TileFace { name: string; cells: Cell[]; roads: [number, number, 0 | 1][]; ports: { cell: number; rough: 0 | 1 }[]; deco: Deco[] }

const NAMES: Record<Kind, string[]> = {
  castle: ['검은 성채', '가시 왕좌'],
  camp: ['야영지', '모닥불 언덕'],
  ruin: ['무너진 망루', '부서진 수도원', '잿빛 광장', '옛 성벽길', '쓰러진 석상', '마른 분수', '해골 회랑', '갈라진 탑', '버려진 병영', '이끼 계단', '검댕 예배당', '꺼진 등대'],
  forest: [
    '여울목', '늑대굴', '안개 늪', '버섯 숲', '사냥꾼 오두막', '고목 언덕', '까마귀 둥지', '돌무덤', '샘물 골짜기', '덩굴 협곡', '반딧불 숲',
    '순례자 고개', '마른 개울', '가시덤불', '여우 굴', '쓰러진 고목', '이끼 바위', '갈대밭', '서리 언덕', '부엉이 숲', '사슴 길', '나무꾼 터',
  ],
}

function cellCount(kind: Kind, rnd: () => number, side: number): number {
  if (kind === 'castle') return side === 0 ? 8 : 7
  if (kind === 'ruin') return rnd() < 2 / 3 ? 3 : 2
  if (kind === 'camp') return 2 + Math.floor(rnd() * 2)
  const r = rnd()
  return r < 0.2 ? 1 : r < 0.6 ? 2 : 3
}

function tryFace(kind: Kind, side: number, rnd: () => number): Omit<TileFace, 'name'> | null {
  const cells: { p: P; ring: number; camp?: true }[] = []
  const deco: { p: P; type: Deco['type']; s: number }[] = []
  const ring = kind === 'castle' ? 3 : kind === 'ruin' ? 2 : 1
  const n = cellCount(kind, rnd, side)
  if (kind === 'castle') {
    cells.push({ p: [0, 0], ring: 4 })
    const off = rnd() * 60
    for (let k = 0; k < n; k++) {
      const ang = rad(off + (360 / n) * k + (rnd() - 0.5) * 8)
      const rr = 54 + rnd() * 4
      cells.push({ p: [Math.cos(ang) * rr, Math.sin(ang) * rr], ring: 3 })
    }
  } else {
    if (rnd() < 0.65) {
      for (let k = 0; k < 40; k++) {
        const p: P = [(rnd() - 0.5) * 120, (rnd() - 0.5) * 120]
        if (inside(p, 30)) {
          deco.push({ p, type: kind === 'ruin' ? (rnd() < 0.5 ? 'rubble' : 'pool') : rnd() < 0.5 ? 'lake' : 'peak', s: 0.8 + rnd() * 0.5 })
          break
        }
      }
    }
    for (let k = 0; k < 600 && cells.length < n; k++) {
      const p: P = [(rnd() - 0.5) * 2 * AP, (rnd() - 0.5) * 2 * R]
      if (!inside(p, EDGE_M)) continue
      if (cells.some((c) => d2(c.p, p) < (MIN + 6) ** 2)) continue
      if (deco.some((d) => Math.sqrt(d2(d.p, p)) < 36 * d.s)) continue
      cells.push({ p, ring })
    }
    if (cells.length < n) return null
    if (kind === 'camp') cells[0] = { ...(cells[0] as { p: P; ring: number }), camp: true }
  }
  // 판 안 길: 가브리엘 그래프 → 최소 신장 트리 + 대부분의 나머지
  const cand: [number, number, number][] = []
  const blk = [...cells.map((c) => c.p), ...deco.map((d) => d.p)]
  for (let i = 0; i < cells.length; i++)
    for (let j = i + 1; j < cells.length; j++) {
      const a = (cells[i] as { p: P }).p
      const b = (cells[j] as { p: P }).p
      const m: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const dd = d2(a, b)
      if (blk.some((q, k) => k !== i && k !== j && d2(q, m) < dd / 4)) continue
      cand.push([i, j, Math.sqrt(dd)])
    }
  let roads: [number, number][] = []
  if (kind === 'castle') {
    const ringE = cand.filter(([i, j]) => i > 0 && j > 0)
    const spokes = cand.filter(([i]) => i === 0)
    roads = [...shuffle(rnd, spokes).slice(0, 3 + Math.floor(rnd() * 2)), ...shuffle(rnd, ringE).slice(0, n - 2 + Math.floor(rnd() * 2))].map(([i, j]) => [i, j])
  } else {
    cand.sort((x, y) => x[2] - y[2])
    const par = cells.map((_, i) => i)
    const find = (x: number): number => (par[x] === x ? x : (par[x] = find(par[x] as number)))
    for (const e of cand) {
      const a = find(e[0])
      const b = find(e[1])
      if (a !== b) {
        par[a] = b
        roads.push([e[0], e[1]])
      } else if (rnd() < 0.8) roads.push([e[0], e[1]])
    }
  }
  if (!connected(cells.length, roads)) return null
  // 출구 6개, 험한 길
  const roughP = kind === 'castle' ? 0 : kind === 'ruin' ? 0.13 : 0.18
  const ports = Array.from({ length: 6 }, (_, e) => {
    const pp = portPoint(e)
    let best = -1
    let bd = Infinity
    cells.forEach((c, i) => {
      if (c.ring === 4) return
      const dd = d2(c.p, pp)
      if (dd < bd) {
        bd = dd
        best = i
      }
    })
    return { cell: best, rough: (rnd() < roughP ? 1 : 0) as 0 | 1 }
  })
  const roads3 = roads.map(([i, j]) => [i, j, (kind !== 'castle' && rnd() < roughP * 0.6 ? 1 : 0) as 0 | 1] as [number, number, 0 | 1])
  const roughN = ports.filter((p) => p.rough).length + roads3.filter((r) => r[2]).length
  if (kind === 'ruin' || kind === 'forest') if (roughN < 1 || roughN > 2) return null
  if (kind === 'camp' && roughN > 1) return null
  return {
    cells: cells.map((c) => ({ x: r1(c.p[0]), y: r1(c.p[1]), ring: c.ring, ...(c.camp ? { camp: true as const } : {}) })),
    roads: roads3,
    ports,
    deco: deco.map((d) => ({ x: r1(d.p[0]), y: r1(d.p[1]), type: d.type, s: r1(d.s) })),
  }
}

function connected(n: number, roads: [number, number][]): boolean {
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const [i, j] of roads) {
    ;(adj[i] as number[]).push(j)
    ;(adj[j] as number[]).push(i)
  }
  const seen = new Set([0])
  const q = [0]
  while (q.length) for (const w of adj[q.pop() as number] as number[]) if (!seen.has(w)) (seen.add(w), q.push(w))
  return seen.size === n
}

function face(kind: Kind, idx: number, side: number): TileFace {
  for (let a = 0; ; a++) {
    const f = tryFace(kind, side, mulberry32(mix(mix(kind.length * 7919 + idx, side), a)))
    if (f) return { name: NAMES[kind][idx * 2 + side] ?? `${NAMES[kind][idx]}`, ...f }
  }
}
const pair = (kind: Kind, idx: number): [TileFace, TileFace] => [face(kind, idx, 0), face(kind, idx, 1)]

const set = {
  castle: [pair('castle', 0)],
  camp: [pair('camp', 0)],
  ruin: Array.from({ length: 6 }, (_, i) => pair('ruin', i)),
  forest: Array.from({ length: 11 }, (_, i) => pair('forest', i)),
}
// 성 판 이름은 앞뒤가 따로
for (const k of ['castle', 'camp'] as const) {
  const [front, back] = set[k][0] as [TileFace, TileFace]
  front.name = NAMES[k][0] as string
  back.name = NAMES[k][1] as string
}

// 구역별 칸 수 범위(실물 칸 타일 묶음 크기의 근거)
const span = (tiles: [TileFace, TileFace][], ring: number) => {
  const per = tiles.map(([a, b]) => [a, b].map((f) => f.cells.filter((c) => c.ring === ring && !c.camp).length))
  return [per.reduce((s, x) => s + Math.min(...x), 0), per.reduce((s, x) => s + Math.max(...x), 0)]
}
const z1 = span([...set.forest, ...set.camp], 1)
const z2 = span(set.ruin, 2)
const z3 = span(set.castle, 3)

const body = `/**
 * 육각 판 19장(앞뒤) — tools/tiles-gen.ts 가 만든 데이터. 손으로 고쳐도 된다(실물 판 디자인이 정본).
 * 판 좌표: 뾰족한 꼭짓점이 위인 육각형, 중심 (0,0), 꼭짓점까지 ${R}. 변 e(0~5)의 가운데는 60e도(화면 기준, y 아래).
 * ports[e]: 변 e 가운데 출구와 이어진 칸. rough 1 = 험한 길(지날 때 이동 +1).
 * 구역별 칸 수(야영지 제외): 바깥 ${z1[0]}~${z1[1]}, 가운데 ${z2[0]}~${z2[1]}, 안쪽 ${z3[0]}~${z3[1]}.
 */
export interface TileCell { x: number; y: number; ring: number; camp?: true }
export interface TileDeco { x: number; y: number; type: 'lake' | 'peak' | 'rubble' | 'pool'; s: number }
export interface TileFace {
  name: string
  cells: TileCell[]
  roads: [number, number, 0 | 1][]
  ports: { cell: number; rough: 0 | 1 }[]
  deco: TileDeco[]
}
export type TilePair = [TileFace, TileFace]

export const TILE_R = ${R}
export const ZONE_CELLS = { 1: [${z1[0]}, ${z1[1]}], 2: [${z2[0]}, ${z2[1]}], 3: [${z3[0]}, ${z3[1]}] } as const

export const TILES: { castle: TilePair[]; camp: TilePair[]; ruin: TilePair[]; forest: TilePair[] } = ${JSON.stringify(set)}
`
const out = fileURLToPath(new URL('../src/engine/tiles.ts', import.meta.url))
writeFileSync(out, body)
console.log(`tiles.ts 생성. 칸 수 바깥 ${z1.join('~')}, 가운데 ${z2.join('~')}, 안쪽 ${z3.join('~')}`)
