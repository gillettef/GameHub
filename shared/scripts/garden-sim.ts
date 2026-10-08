/**
 * Rootbound(정원 컨셉) 수치 시뮬레이터. 규칙 엔진과 무관한 독립 스크립트로, 수치를 데이터로 받아 빠르게 시험한다.
 *   npx tsx shared/scripts/garden-sim.ts [2인 판수] [3인 판수] [4인 판수]
 *   SIM_OVERRIDES=<json> 으로 종 수치·좌석 보정을 파일 수정 없이 덮어쓴다:
 *     { "species": { "<id>": { "self": 3 } }, "seat": { "3": { "draftFirst": "first", "komi": [1,0,0], "lastRoundReverse": false } } }
 *
 * 두 단계로 잰다.
 *  A. 무작위 드래프트: 종을 무작위로 나눠 주고 둔다 → 종별 승률, 목표 카드가 있을 때의 종별 승률(목표 영향)
 *  B. 똑똑한 드래프트: A 에서 배운 "목표 조건부 종 가치"로 뱀 순서 드래프트 → 좌석 승률·첫 픽 쏠림·덱 다양성
 * 두기 봇은 1수 탐욕(심은 직후의 "내 점수 − 가장 높은 상대 점수"가 최대인 수, 15% 확률로 상위 3수 중 무작위)이다.
 * 사람의 수읽기·장기 계획은 반영하지 못한다 — 1차 스크리닝용이다.
 */

// ---------------------------------------------------------------------------
// 기본 도구
// ---------------------------------------------------------------------------

type Rand = () => number;
function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], rand: Rand): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}
const pct = (n: number, d: number) => (d === 0 ? '   -' : `${((100 * n) / d).toFixed(1).padStart(5)}%`);

// 육각 축 좌표 (q, r). 방향 6개
const DIRS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
const hexDist = (q1: number, r1: number, q2: number, r2: number) => (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2;

// ---------------------------------------------------------------------------
// 지형 · 정원 조각 (초안 3절)
// ---------------------------------------------------------------------------

const EMPTY = 0;
const POND = 1;
const ROCK = 2;
const FERTILE = 3;

/** 조각 = 칸 7개(0 = 가운데, 1~6 = 방향 0~5 둘레). [칸 번호, 지형] 목록. 연못·돌밭 합 12칸 / 12장 = 평균 1 */
const TILE_LIBRARY: [number, number][][] = [
  [[1, POND]],
  [[1, POND], [2, POND]],
  [[1, ROCK]],
  [[0, POND]],
  [[1, FERTILE]],
  [[1, FERTILE], [4, FERTILE]],
  [[1, POND], [4, FERTILE]],
  [[1, ROCK], [3, FERTILE]],
  [[1, POND], [2, POND], [5, FERTILE]],
  [[0, FERTILE], [3, ROCK]],
  [[2, POND], [5, ROCK]],
  [],
];
/** 입구 조각: 가운데가 입구, 둘레 한 칸이 비옥토. 회전만 다르고 모두 같다(좌석 공정성) */
const ENTRANCE_TILE: [number, number][] = [[1, FERTILE]];

/**
 * 조각 중심 격자: v1=(2,1), v2=(-1,3). 판별식 7 → 칸 7개 꽃 모양이 빈틈없이 깔린다.
 * 보드 모양은 좌석 공정성을 위해 대칭이어야 한다(2026-10-07 시뮬레이션: 고리를 덜 채운 비대칭 보드에서
 * 3인 마지막 좌석이 무작위 드래프트로도 48% 를 이겼다). 그래서 원점 조각 + 거리 고리 단위로 채운다:
 *  2인: 고리 0~1 (7조각, 180° 대칭)          입구: 고리 1의 마주 보는 두 조각
 *  3인: 고리 0~2 (13조각, 120° 대칭)         입구: 고리 2의 120° 간격 세 조각
 *  4인: 고리 0~2 + 고리 3의 마주 보는 두 조각 (15조각, 180°·거울 대칭)  입구: 입구별 거리 분포가 모두 같은 네 조각
 * 입구 후보 중 "입구에서 모든 칸까지의 거리 분포"가 좌석마다 똑같은 조합만 고른다.
 */
function lattice(): { q: number; r: number; d2: number; ang: number }[] {
  const pts: { q: number; r: number; d2: number; ang: number }[] = [];
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

function cellsOf(centers: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [cq, cr] of centers) {
    out.push([cq, cr]);
    for (const [dq, dr] of DIRS) out.push([cq + dq, cr + dr]);
  }
  return out;
}

/** 입구에서 보드 모든 칸까지 거리의 정렬된 목록 (좌석 공정성 비교용) */
function profile(cells: [number, number][], q: number, r: number): number[] {
  return cells.map(([cq, cr]) => hexDist(q, r, cq, cr)).sort((a, b) => a - b);
}
/** 두 거리 분포의 차이 (같으면 0) */
const profileDiff = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - (b[i] as number)), 0);

const layoutCache = new Map<number, { centers: [number, number][]; entranceTiles: number[] }>();

function layout(players: number): { centers: [number, number][]; entranceTiles: number[] } {
  const cached = layoutCache.get(players);
  if (cached) return cached;
  const pts = lattice();
  const rings: (typeof pts)[] = [];
  for (const p of pts) {
    const last = rings[rings.length - 1];
    if (last && last[0]!.d2 === p.d2) last.push(p);
    else rings.push([p]);
  }
  const candidates: { centers: [number, number][]; outer: number[] }[] = [];
  const base = (n: number) => rings.slice(0, n).flat().map((p) => [p.q, p.r] as [number, number]);
  if (players === 2) candidates.push({ centers: base(2), outer: [1, 2, 3, 4, 5, 6] });
  else if (players === 3) candidates.push({ centers: base(3), outer: [7, 8, 9, 10, 11, 12] });
  else {
    const r3 = rings[3]!;
    for (let i = 0; i < r3.length; i++) {
      const a = r3[i]!;
      const opp = r3.find((p) => p.q === -a.q && p.r === -a.r);
      if (!opp || opp.ang < a.ang) continue;
      const centers = [...base(3), [a.q, a.r] as [number, number], [opp.q, opp.r] as [number, number]];
      candidates.push({ centers, outer: [7, 8, 9, 10, 11, 12, 13, 14] });
    }
  }
  // 거리 분포가 가장 고른 조합(차이 최소) → 그중 입구끼리 최소 거리가 가장 먼 조합
  let best: { centers: [number, number][]; entranceTiles: number[]; diff: number; key: number } | null = null;
  for (const cand of candidates) {
    const cells = cellsOf(cand.centers);
    const combo = (start: number, acc: number[]) => {
      if (acc.length === players) {
        const profs = acc.map((t) => profile(cells, cand.centers[t]![0], cand.centers[t]![1]));
        let diff = 0;
        for (let i = 0; i < profs.length; i++) for (let j = i + 1; j < profs.length; j++) diff = Math.max(diff, profileDiff(profs[i]!, profs[j]!));
        let mn = Infinity;
        for (let i = 0; i < acc.length; i++)
          for (let j = i + 1; j < acc.length; j++) {
            const a = cand.centers[acc[i]!]!;
            const b = cand.centers[acc[j]!]!;
            mn = Math.min(mn, hexDist(a[0], a[1], b[0], b[1]));
          }
        if (!best || diff < best.diff || (diff === best.diff && mn > best.key)) best = { centers: cand.centers, entranceTiles: [...acc], diff, key: mn };
        return;
      }
      for (let k = start; k < cand.outer.length; k++) combo(k + 1, [...acc, cand.outer[k]!]);
    };
    combo(0, []);
  }
  if (!best) throw new Error(`${players}인 보드를 찾지 못했다`);
  if (process.env.SIM_DEBUG) console.log(`[layout] ${players}인 조각 ${(best as { centers: unknown[] }).centers.length}개, 입구 거리 분포 최대 차이 ${(best as { diff: number }).diff}`);
  const found = best as { centers: [number, number][]; entranceTiles: number[] };
  const angOf = (t: number) => {
    const [q, r] = found.centers[t]!;
    return Math.atan2((r * Math.sqrt(3)) / 2, q + r / 2);
  };
  found.entranceTiles.sort((a, b) => angOf(a) - angOf(b));
  const out = { centers: found.centers, entranceTiles: found.entranceTiles };
  layoutCache.set(players, out);
  return out;
}

function buildBoard(players: number, rand: Rand): Board {
  const { centers, entranceTiles } = layout(players);
  const q: number[] = [];
  const r: number[] = [];
  const tile: number[] = [];
  const terrain: number[] = [];
  const entrances: number[] = [];
  const library = shuffle(TILE_LIBRARY.map((_, i) => i), rand);
  let libPos = 0;
  centers.forEach(([cq, cr], t) => {
    const isEntrance = entranceTiles.includes(t);
    const spec = isEntrance ? ENTRANCE_TILE : (TILE_LIBRARY[library[libPos++] as number] as [number, number][]);
    const rot = Math.floor(rand() * 6);
    const slots = new Array<number>(7).fill(EMPTY);
    for (const [slot, ter] of spec) slots[slot === 0 ? 0 : ((slot - 1 + rot) % 6) + 1] = ter;
    for (let s = 0; s < 7; s++) {
      const [dq, dr] = s === 0 ? [0, 0] : (DIRS[s - 1] as [number, number]);
      q.push(cq + dq);
      r.push(cr + dr);
      tile.push(t);
      terrain.push(slots[s] as number);
      if (s === 0 && isEntrance) entrances[entranceTiles.indexOf(t)] = q.length - 1;
    }
  });
  const n = q.length;
  const index = new Map<string, number>();
  for (let i = 0; i < n; i++) index.set(`${q[i]},${r[i]}`, i);
  const at = (qq: number, rr: number) => index.get(`${qq},${rr}`);
  const nb: number[][] = [];
  const ring2: number[][] = [];
  const line: number[][][] = [];
  const edge: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const qi = q[i] as number;
    const ri = r[i] as number;
    const ns = DIRS.map(([dq, dr]) => at(qi + dq, ri + dr)).filter((v): v is number => v !== undefined);
    nb.push(ns);
    edge.push(ns.length < 6);
    const r2: number[] = [];
    for (let j = 0; j < n; j++) if (hexDist(qi, ri, q[j] as number, r[j] as number) === 2) r2.push(j);
    ring2.push(r2);
    line.push(DIRS.map(([dq, dr]) => [1, 2, 3].map((k) => at(qi + dq * k, ri + dr * k)).filter((v): v is number => v !== undefined)));
  }
  const centerTile = 0; // layout 이 원점에서 가까운 순으로 정렬하므로 0번이 가운데 조각
  return { n, q, r, tile, terrain, nb, ring2, line, edge, centerTile, tileCount: centers.length, entrances };
}

// ---------------------------------------------------------------------------
// 식물 12종 — 데이터 기반 (v0.2)
// ---------------------------------------------------------------------------

const SPECIES = ['grass', 'oak', 'pine', 'kudzu', 'fern', 'dandelion', 'rapeseed', 'lotus', 'ivy', 'bamboo', 'mushroom', 'mugunghwa'] as const;
type SpeciesId = (typeof SPECIES)[number];
const S = Object.fromEntries(SPECIES.map((s, i) => [s, i])) as Record<SpeciesId, number>;
const NAME_KO: Record<SpeciesId, string> = {
  grass: '잔디',
  oak: '참나무',
  pine: '소나무',
  kudzu: '칡',
  fern: '고사리',
  dandelion: '민들레',
  rapeseed: '유채',
  lotus: '연꽃',
  ivy: '담쟁이',
  bamboo: '대나무',
  mushroom: '버섯',
  mugunghwa: '무궁화',
};

/** 뿌리 모양. 0 은 효과 없음 */
interface SpeciesSpec {
  self: number;
  ring1: number;
  /** 거리 2의 12칸 전부 */
  ring2: number;
  /** 거리 2 중 6방향 직선 위의 6칸만 */
  star2: number;
  /** 심을 때 고른 한 방향 직선 거리 1..lineLen 칸 */
  line: number;
  lineLen: number;
  /** 심은 뒤 거리 2 이내 빈 칸 하나에 놓는 씨앗의 영향력 */
  seed: number;
  /** 연못과 맞닿은 칸에는 영향력이 없어도 심을 수 있다 (다른 칸은 평소처럼) */
  pondOnly: boolean;
  /** 거리 1에 있는 다른 식물 칸마다 그 칸에 추가 */
  ivy: number;
  /** 거리 1의 내 같은 종 하나당 자기 칸 추가 */
  bamboo: number;
  /** 거리 1의 다른 플레이어 영향력 빼기 */
  mushroom: number;
  /** 비옥토에 심으면 거리 1 추가 */
  fertileRing: number;
  /** 끝날 때 이 칸이 내 땅이면 점수 */
  mugunghwa: number;
}

const ZERO: SpeciesSpec = { self: 0, ring1: 0, ring2: 0, star2: 0, line: 0, lineLen: 0, seed: 0, pondOnly: false, ivy: 0, bamboo: 0, mushroom: 0, fertileRing: 0, mugunghwa: 0 };
const SPEC: SpeciesSpec[] = [
  { ...ZERO, self: 3, ring1: 1 }, // grass
  { ...ZERO, self: 2, ring1: 2 }, // oak
  { ...ZERO, self: 5, ring1: 1 }, // pine
  { ...ZERO, self: 2, line: 2, lineLen: 2 }, // kudzu
  { ...ZERO, self: 1, star2: 1 }, // fern
  { ...ZERO, self: 1, ring1: 1, seed: 2 }, // dandelion
  { ...ZERO, self: 2, ring1: 1, fertileRing: 2 }, // rapeseed
  { ...ZERO, self: 1, ring1: 1, pondOnly: true }, // lotus
  { ...ZERO, self: 1, ring1: 1, ivy: 1 }, // ivy
  { ...ZERO, self: 1, ring1: 2, bamboo: 2 }, // bamboo
  { ...ZERO, self: 1, mushroom: 2 }, // mushroom
  { ...ZERO, self: 2, ring1: 1, mugunghwa: 1 }, // mugunghwa
];

interface SeatPolicy {
  /** 드래프트 첫 픽: last = 늦게 두는 좌석부터(턴 역순), first = 좌석 0부터 */
  draftFirst: 'last' | 'first';
  /** 좌석별 덤 */
  komi: number[];
  /** 마지막 라운드는 역순으로 둔다 */
  lastRoundReverse: boolean;
  /** 드래프트 첫 바퀴 순서를 직접 지정 (있으면 draftFirst 보다 우선). 이후 뱀 순서 */
  draftOrder?: number[];
}
/** 2026-10-07 시뮬레이션으로 정한 좌석 보정 (Rules.md 4절) */
const SEAT: Record<number, SeatPolicy> = {
  2: { draftFirst: 'last', draftOrder: [1, 0], komi: [0, 1], lastRoundReverse: false },
  3: { draftFirst: 'first', draftOrder: [0, 2, 1], komi: [3, 4, 0], lastRoundReverse: false },
  4: { draftFirst: 'first', draftOrder: [1, 0, 3, 2], komi: [1, 0, 0, 0], lastRoundReverse: false },
};

let pendingLinkedBonus: number | null = null;
const overridePath = process.env.SIM_OVERRIDES;
if (overridePath) {
  const { readFileSync } = await import('node:fs');
  const o = JSON.parse(readFileSync(overridePath, 'utf-8')) as {
    species?: Record<string, Partial<SpeciesSpec>>;
    seat?: Record<string, Partial<SeatPolicy>>;
    linkedBonus?: number;
  };
  if (o.linkedBonus !== undefined) pendingLinkedBonus = o.linkedBonus;
  for (const [id, patch] of Object.entries(o.species ?? {})) Object.assign(SPEC[S[id as SpeciesId]]!, patch);
  for (const [n, patch] of Object.entries(o.seat ?? {})) Object.assign(SEAT[Number(n)]!, patch);
}

const ENTRANCE_SELF = 3;
const ENTRANCE_RING = 1;
const FERTILE_BONUS = 1;
const HAND_SIZE = 3;

// ---------------------------------------------------------------------------
// 목표 카드 12장 (초안 8절)
// ---------------------------------------------------------------------------

const GOALS = [
  '연못가', '큰정원', '오솔길', '비옥한밭', '가장자리', '중앙광장', '조각마다', '꽃밭', '숲', '이어진정원', '경계', '종다쓰기',
  // 12~17: 종 연계 목표 "X 보호구역: 끝날 때 내 땅 위에 있는 내 X 1개당 +3"
  '소나무보호', '칡보호', '고사리보호', '잔디보호', '버섯보호', '민들레보호',
] as const;
const LINKED_GOALS: [number, number][] = [
  [12, 2], // pine
  [13, 3], // kudzu
  [14, 4], // fern
  [15, 0], // grass
  [16, 10], // mushroom
  [17, 5], // dandelion
];
const LINKED = { bonus: pendingLinkedBonus ?? 2 };
const GOAL_EXCLUDE: [number, number][] = [[1, 9]];

/** 3장 중 최소 1장은 종 연계 목표 */
function pickGoals(rand: Rand): number[] {
  for (;;) {
    const g = shuffle(GOALS.map((_, i) => i), rand).slice(0, 3);
    if (GOAL_EXCLUDE.some(([a, b]) => g.includes(a) && g.includes(b))) continue;
    if (!g.some((x) => x >= 12)) continue;
    return g;
  }
}

// ---------------------------------------------------------------------------
// 게임 상태
// ---------------------------------------------------------------------------

interface Game {
  P: number;
  b: Board;
  goals: number[];
  species: Int8Array; // 칸별 식물 종 (-1 없음)
  owner: Int8Array; // 칸별 식물 주인 (-1 없음)
  dir: Int8Array; // 칡 방향
  entranceOf: Int8Array; // 입구 주인 (-1 아님)
  seeds: { cell: number; owner: number }[];
  drafted: number[][]; // 좌석별 고른 종
  planted: Set<number>[]; // 좌석별 심은 종
  hands: number[][];
  decks: number[][];
  discards: number;
}

function newGame(P: number, b: Board, goals: number[], drafted: number[][], rand: Rand): Game {
  const copies = P === 2 ? 3 : 4;
  const g: Game = {
    P,
    b,
    goals,
    species: new Int8Array(b.n).fill(-1),
    owner: new Int8Array(b.n).fill(-1),
    dir: new Int8Array(b.n).fill(-1),
    entranceOf: new Int8Array(b.n).fill(-1),
    seeds: [],
    drafted,
    planted: drafted.map(() => new Set<number>()),
    hands: [],
    decks: [],
    discards: 0,
  };
  b.entrances.forEach((c, seat) => (g.entranceOf[c] = seat));
  for (let p = 0; p < P; p++) {
    const deck = shuffle(drafted[p]!.flatMap((s) => new Array<number>(copies).fill(s)), rand);
    g.hands.push(deck.splice(0, HAND_SIZE));
    g.decks.push(deck);
  }
  return g;
}

/** 영향력 [P][n]. 더하기를 모두 합산한 뒤 버섯 빼기를 마지막에 적용 */
function influence(g: Game): Int16Array[] {
  const { b, P } = g;
  const inf = Array.from({ length: P }, () => new Int16Array(b.n));
  const debuff = Array.from({ length: P }, () => new Int16Array(b.n));
  for (let c = 0; c < b.n; c++) {
    const e = g.entranceOf[c] as number;
    if (e >= 0) {
      inf[e]![c] += ENTRANCE_SELF;
      for (const x of b.nb[c]!) inf[e]![x] += ENTRANCE_RING;
    }
  }
  for (let c = 0; c < b.n; c++) {
    const s = g.species[c] as number;
    if (s < 0) continue;
    const sp = SPEC[s]!;
    const p = g.owner[c] as number;
    const I = inf[p]!;
    const nbs = b.nb[c]!;
    let self = sp.self;
    let ring = sp.ring1;
    if (sp.fertileRing && b.terrain[c] === FERTILE) ring += sp.fertileRing;
    if (sp.bamboo) for (const x of nbs) if (g.species[x] === s && g.owner[x] === p) self += sp.bamboo;
    if (b.terrain[c] === FERTILE) self += FERTILE_BONUS;
    I[c] += self;
    if (ring) for (const x of nbs) I[x] += ring;
    if (sp.ring2) for (const x of b.ring2[c]!) I[x] += sp.ring2;
    if (sp.star2) for (let d = 0; d < 6; d++) {
      const x = b.line[c]![d]![1];
      if (x !== undefined && b.line[c]![d]![0] !== undefined) I[x] += sp.star2;
    }
    if (sp.line) for (const x of b.line[c]![g.dir[c] as number]!.slice(0, sp.lineLen)) I[x] += sp.line;
    if (sp.ivy) for (const x of nbs) if ((g.species[x] as number) >= 0) I[x] += sp.ivy;
    if (sp.mushroom) for (const x of nbs) for (let o = 0; o < P; o++) if (o !== p) debuff[o]![x] += sp.mushroom;
  }
  for (const sd of g.seeds) inf[sd.owner]![sd.cell] += SPEC[S.dandelion]!.seed;
  for (let p = 0; p < P; p++) for (let c = 0; c < b.n; c++) if (debuff[p]![c]) inf[p]![c] = Math.max(0, inf[p]![c]! - debuff[p]![c]!);
  return inf;
}

/** 칸 주인: 영향력이 엄격히 가장 큰 한 명. 동점·0·연못·돌밭은 −1 */
function owners(g: Game, inf: Int16Array[]): Int8Array {
  const { b, P } = g;
  const out = new Int8Array(b.n).fill(-1);
  for (let c = 0; c < b.n; c++) {
    const t = b.terrain[c];
    if (t === POND || t === ROCK) continue;
    let best = 0;
    let who = -1;
    let tie = false;
    for (let p = 0; p < P; p++) {
      const v = inf[p]![c] as number;
      if (v > best) {
        best = v;
        who = p;
        tie = false;
      } else if (v === best && v > 0) tie = true;
    }
    if (!tie) out[c] = who;
  }
  return out;
}

const isEmptyCell = (g: Game, c: number) => g.species[c] === -1 && g.entranceOf[c] === -1 && g.b.terrain[c] !== POND && g.b.terrain[c] !== ROCK;

function legalCells(g: Game, inf: Int16Array[], p: number, s: number): number[] {
  const out: number[] = [];
  for (let c = 0; c < g.b.n; c++) {
    if (!isEmptyCell(g, c)) continue;
    if ((inf[p]![c] as number) >= 1) out.push(c);
    else if (SPEC[s]!.pondOnly && g.b.nb[c]!.some((x) => g.b.terrain[x] === POND)) out.push(c);
  }
  return out;
}

/** 1등·2등 점수 (동점이면 1등 점수를 동점자 모두, 2등 없음). 값이 0이면 받지 않는다 */
function rankAward(values: number[], first: number, second: number): number[] {
  const out = values.map(() => 0);
  const top = Math.max(...values);
  if (top <= 0) return out;
  const tops = values.filter((v) => v === top).length;
  values.forEach((v, i) => v === top && (out[i] = first));
  if (tops === 1 && second > 0) {
    const rest = values.filter((v) => v < top);
    const sec = rest.length ? Math.max(...rest) : 0;
    if (sec > 0) values.forEach((v, i) => v === sec && (out[i] = second));
  }
  return out;
}

function components(cells: number[], b: Board): number[][] {
  const set = new Set(cells);
  const seen = new Set<number>();
  const comps: number[][] = [];
  for (const c of cells) {
    if (seen.has(c)) continue;
    const comp: number[] = [];
    const stack = [c];
    seen.add(c);
    while (stack.length) {
      const x = stack.pop() as number;
      comp.push(x);
      for (const y of b.nb[x]!) if (set.has(y) && !seen.has(y)) (seen.add(y), stack.push(y));
    }
    comps.push(comp);
  }
  return comps;
}

interface ScoreDetail {
  total: number[];
  land: number[];
  goal: number[];
  mugunghwa: number[];
}

function score(g: Game, own?: Int8Array): ScoreDetail {
  const { b, P } = g;
  const o = own ?? owners(g, influence(g));
  const land = new Array<number>(P).fill(0);
  const mine: number[][] = Array.from({ length: P }, () => []);
  for (let c = 0; c < b.n; c++) if ((o[c] as number) >= 0) (land[o[c] as number]!++, mine[o[c] as number]!.push(c));
  const goal = new Array<number>(P).fill(0);
  const add = (arr: number[]) => arr.forEach((v, i) => (goal[i]! += v));
  for (const gi of g.goals) {
    switch (gi) {
      case 0: // 연못가
        add(mine.map((cs) => cs.filter((c) => b.nb[c]!.some((x) => b.terrain[x] === POND)).length));
        break;
      case 1: // 큰 정원
        add(rankAward(mine.map((cs) => Math.max(0, ...components(cs, b).map((k) => k.length))), 6, 3));
        break;
      case 2: {
        // 오솔길: 세 축 방향으로 이어진 가장 긴 줄
        const lens = mine.map((cs, p) => {
          let best = 0;
          for (const d of [0, 1, 2]) {
            for (const c of cs) {
              // 줄의 시작 칸에서만 센다(반대 방향 이웃이 내 땅이 아님)
              const back = b.line[c]![(d + 3) % 6]![0];
              if (back !== undefined && o[back] === p) continue;
              let len = 1;
              let cur = c;
              for (;;) {
                const nx = b.line[cur]![d]![0];
                if (nx === undefined || o[nx] !== p) break;
                len++;
                cur = nx;
              }
              best = Math.max(best, len);
            }
          }
          return best;
        });
        add(rankAward(lens, 5, 2));
        break;
      }
      case 3: // 비옥한 밭
        add(mine.map((cs) => 2 * cs.filter((c) => b.terrain[c] === FERTILE).length));
        break;
      case 4: // 가장자리
        add(mine.map((cs) => cs.filter((c) => b.edge[c]).length));
        break;
      case 5: // 중앙 광장
        add(rankAward(mine.map((cs) => cs.filter((c) => b.tile[c] === b.centerTile).length), 6, 0));
        break;
      case 6: // 조각마다 한 뼘
        add(mine.map((cs) => new Set(cs.map((c) => b.tile[c])).size));
        break;
      case 7: // 꽃밭
        add(mine.map((cs) => 2 * cs.filter((c) => g.species[c] === S.rapeseed || g.species[c] === S.lotus || g.species[c] === S.mugunghwa).length));
        break;
      case 8: {
        // 숲
        add(
          Array.from({ length: P }, (_, p) => {
            const cells: number[] = [];
            for (let c = 0; c < b.n; c++) if (g.owner[c] === p && (g.species[c] === S.oak || g.species[c] === S.bamboo)) cells.push(c);
            return 4 * components(cells, b).filter((k) => k.length >= 3).length;
          }),
        );
        break;
      }
      case 9: {
        // 이어진 정원
        add(
          Array.from({ length: P }, (_, p) => {
            const cells: number[] = [b.entrances[p] as number];
            for (let c = 0; c < b.n; c++) if (g.owner[c] === p) cells.push(c);
            return cells.length > 1 && components(cells, b).length === 1 ? 5 : 0;
          }),
        );
        break;
      }
      case 10: // 경계
        add(mine.map((cs, p) => cs.filter((c) => b.nb[c]!.some((x) => (o[x] as number) >= 0 && o[x] !== p)).length));
        break;
      case 11: // 고른 종 다 쓰기
        add(g.drafted.map((ds, p) => (ds.every((s) => g.planted[p]!.has(s)) ? 4 : 0)));
        break;
      default: {
        const linked = LINKED_GOALS.find(([gid]) => gid === gi);
        if (!linked) break;
        const sp = linked[1];
        const pts = new Array<number>(P).fill(0);
        for (let c = 0; c < b.n; c++) if (g.species[c] === sp && o[c] === g.owner[c]) pts[g.owner[c] as number]! += LINKED.bonus;
        add(pts);
      }
    }
  }
  const mugunghwa = new Array<number>(P).fill(0);
  for (let c = 0; c < b.n; c++) {
    const s = g.species[c] as number;
    if (s >= 0 && SPEC[s]!.mugunghwa && o[c] === g.owner[c]) mugunghwa[g.owner[c] as number]! += SPEC[s]!.mugunghwa;
  }
  const komi = SEAT[P]!.komi;
  return { total: land.map((v, i) => v + goal[i]! + mugunghwa[i]! + (komi[i] ?? 0)), land, goal, mugunghwa };
}

// ---------------------------------------------------------------------------
// 두기 봇 (1수 탐욕)
// ---------------------------------------------------------------------------

interface Move {
  handIdx: number;
  cell: number;
  dir: number;
  seed: number;
  value: number;
}

function evalMove(g: Game, p: number, s: number, cell: number, dir: number, seed: number): number {
  g.species[cell] = s;
  g.owner[cell] = p;
  g.dir[cell] = dir;
  if (seed >= 0) g.seeds.push({ cell: seed, owner: p });
  const hadPlanted = g.planted[p]!.has(s);
  g.planted[p]!.add(s);
  const sc = score(g).total;
  if (!hadPlanted) g.planted[p]!.delete(s);
  if (seed >= 0) g.seeds.pop();
  g.species[cell] = -1;
  g.owner[cell] = -1;
  g.dir[cell] = -1;
  let opp = -Infinity;
  for (let o = 0; o < g.P; o++) if (o !== p) opp = Math.max(opp, sc[o]!);
  return sc[p]! - opp;
}

function chooseMove(g: Game, p: number, rand: Rand): Move | null {
  const inf = influence(g);
  const moves: Move[] = [];
  const tried = new Set<number>();
  g.hands[p]!.forEach((s, handIdx) => {
    if (tried.has(s)) return;
    tried.add(s);
    for (const cell of legalCells(g, inf, p, s)) {
      if (SPEC[s]!.line) {
        for (let d = 0; d < 6; d++) if (g.b.line[cell]![d]!.length) moves.push({ handIdx, cell, dir: d, seed: -1, value: evalMove(g, p, s, cell, d, -1) });
      } else moves.push({ handIdx, cell, dir: -1, seed: -1, value: evalMove(g, p, s, cell, -1, -1) });
    }
  });
  if (moves.length === 0) return null;
  moves.sort((a, b) => b.value - a.value || a.cell - b.cell);
  // 민들레: 상위 3칸만 씨앗 자리까지 고른다(계산량 절약)
  const top = moves.slice(0, 6);
  for (const m of top) {
    const s = g.hands[p]![m.handIdx] as number;
    if (!SPEC[s]!.seed) continue;
    const q0 = g.b.q[m.cell] as number;
    const r0 = g.b.r[m.cell] as number;
    let bestSeed = -1;
    let bestVal = -Infinity;
    for (let c = 0; c < g.b.n; c++) {
      if (c === m.cell || !isEmptyCell(g, c) || hexDist(q0, r0, g.b.q[c] as number, g.b.r[c] as number) > 2) continue;
      const v = evalMove(g, p, s, m.cell, -1, c);
      if (v > bestVal) {
        bestVal = v;
        bestSeed = c;
      }
    }
    if (bestSeed >= 0) {
      m.seed = bestSeed;
      m.value = bestVal;
    }
  }
  top.sort((a, b) => b.value - a.value || a.cell - b.cell);
  if (rand() < 0.15 && top.length > 1) return top[Math.floor(rand() * Math.min(3, top.length))] as Move;
  return top[0] as Move;
}

// ---------------------------------------------------------------------------
// 한 판
// ---------------------------------------------------------------------------

interface Result {
  P: number;
  goals: number[];
  drafted: number[][];
  scores: ScoreDetail;
  winner: number;
  /** 다른 사람에게 넘어간(또는 무소유가 된) 땅 칸 수 누적 — 뒤집기 */
  flips: number;
  /** 끝날 때 남의 땅(또는 무소유) 위에 있는 식물 비율 */
  lostPlants: number;
  totalPlants: number;
  discards: number;
  turns: number;
  /** 좌석별 입구 거리 3 이내 비옥토·막힌 칸 */
  nearFertile: number[];
  nearBlocked: number[];
}

function playGame(P: number, drafted: number[][], seed: number, goalsOverride?: number[]): Result {
  const rand = mulberry32(seed);
  const b = buildBoard(P, rand);
  const goals = goalsOverride ?? pickGoals(rand);
  const g = newGame(P, b, goals, drafted, rand);
  let prevOwn = owners(g, influence(g));
  let flips = 0;
  let turns = 0;
  const rounds = g.decks[0]!.length + HAND_SIZE;
  for (let round = 0; ; round++) {
    let anyPlayed = false;
    const seatOrder = [...Array(P).keys()];
    if (SEAT[P]!.lastRoundReverse && round === rounds - 1) seatOrder.reverse();
    for (const p of seatOrder) {
      if (g.hands[p]!.length === 0) continue;
      anyPlayed = true;
      turns++;
      const m = chooseMove(g, p, rand);
      if (!m) {
        // 심을 곳이 없으면 1장 버린다 (초안 6절)
        g.hands[p]!.splice(0, 1);
        g.discards++;
      } else {
        const s = g.hands[p]![m.handIdx] as number;
        g.hands[p]!.splice(m.handIdx, 1);
        g.species[m.cell] = s;
        g.owner[m.cell] = p;
        g.dir[m.cell] = m.dir;
        if (m.seed >= 0) g.seeds.push({ cell: m.seed, owner: p });
        g.planted[p]!.add(s);
      }
      const d = g.decks[p]!.shift();
      if (d !== undefined) g.hands[p]!.push(d);
      const own = owners(g, influence(g));
      for (let c = 0; c < b.n; c++) if ((prevOwn[c] as number) >= 0 && own[c] !== prevOwn[c]) flips++;
      prevOwn = own;
    }
    if (!anyPlayed) break;
  }
  const scores = score(g, prevOwn);
  let totalPlants = 0;
  let lostPlants = 0;
  for (let c = 0; c < b.n; c++)
    if ((g.species[c] as number) >= 0) {
      totalPlants++;
      if (prevOwn[c] !== g.owner[c]) lostPlants++;
    }
  // 승자: 점수 → 땅 → 늦은 좌석 (초안 9절)
  let winner = 0;
  for (let p = 1; p < P; p++) {
    const a = scores.total[p]!;
    const w = scores.total[winner]!;
    if (a > w || (a === w && scores.land[p]! > scores.land[winner]!) || (a === w && scores.land[p] === scores.land[winner])) winner = p;
  }
  const near = (p: number, pred: (t: number) => boolean) => {
    const e = b.entrances[p] as number;
    let k = 0;
    for (let c = 0; c < b.n; c++) if (hexDist(b.q[e]!, b.r[e]!, b.q[c]!, b.r[c]!) <= 3 && pred(b.terrain[c] as number)) k++;
    return k;
  };
  return {
    P,
    goals,
    drafted,
    scores,
    winner,
    flips,
    lostPlants,
    totalPlants,
    discards: g.discards,
    turns,
    nearFertile: Array.from({ length: P }, (_, p) => near(p, (t) => t === FERTILE)),
    nearBlocked: Array.from({ length: P }, (_, p) => near(p, (t) => t === POND || t === ROCK)),
  };
}

// ---------------------------------------------------------------------------
// 드래프트
// ---------------------------------------------------------------------------

const PICKS: Record<number, number> = { 2: 5, 3: 4, 4: 4 };
const MAX_TAKERS: Record<number, number> = { 2: 1, 3: 1, 4: 2 };

function randomDraft(P: number, rand: Rand): number[][] {
  const out: number[][] = Array.from({ length: P }, () => []);
  const taken = new Array<number>(SPECIES.length).fill(0);
  const order = snakeOrder(P, [...Array(P).keys()].reverse());
  for (const p of order) {
    const opts = SPECIES.map((_, s) => s).filter((s) => taken[s]! < MAX_TAKERS[P]! && !out[p]!.includes(s));
    const s = opts[Math.floor(rand() * opts.length)] as number;
    out[p]!.push(s);
    taken[s]!++;
  }
  return out;
}

function snakeOrder(P: number, first: number[]): number[] {
  const order: number[] = [];
  for (let round = 0; round < PICKS[P]!; round++) order.push(...(round % 2 === 0 ? first : [...first].reverse()));
  return order;
}

/** A 단계에서 배운 종 가치: 기본 승률 + 공개된 목표마다 (목표 있을 때 승률 − 기본 승률) */
interface ValueModel {
  base: number[];
  byGoal: number[][];
}

function smartDraft(P: number, goals: number[], model: ValueModel, rand: Rand, firstPickSeat: 'last' | 'first' = SEAT[P]!.draftFirst): { drafted: number[][]; order: { seat: number; species: number }[] } {
  const out: number[][] = Array.from({ length: P }, () => []);
  const taken = new Array<number>(SPECIES.length).fill(0);
  const seats = [...Array(P).keys()];
  const custom = SEAT[P]!.draftOrder;
  const order = snakeOrder(P, custom ?? (firstPickSeat === 'last' ? seats.reverse() : seats));
  const log: { seat: number; species: number }[] = [];
  for (const p of order) {
    let best = -1;
    let bestV = -Infinity;
    for (let s = 0; s < SPECIES.length; s++) {
      if (taken[s]! >= MAX_TAKERS[P]! || out[p]!.includes(s)) continue;
      let v = model.base[s]!;
      for (const gi of goals) v += model.byGoal[gi]![s]! - model.base[s]!;
      v += (rand() - 0.5) * 0.04; // 사람마다 다른 취향(±2%p)
      if (v > bestV) {
        bestV = v;
        best = s;
      }
    }
    out[p]!.push(best);
    taken[best]!++;
    log.push({ seat: p, species: best });
  }
  return { drafted: out, order: log };
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------

const games = { 2: Number(process.argv[2] ?? 1000), 3: Number(process.argv[3] ?? 300), 4: Number(process.argv[4] ?? 200) } as Record<number, number>;
const t0 = Date.now();

function spearman(a: number[], b: number[]): number {
  const rank = (v: number[]) => {
    const idx = v.map((x, i) => [x, i] as const).sort((p, q) => q[0] - p[0]);
    const r = new Array<number>(v.length);
    idx.forEach(([, i], k) => (r[i] = k));
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (ra[i]! - rb[i]!) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

for (const P of [2, 3, 4]) {
  const N = games[P]!;
  if (!N) continue;
  console.log(`\n================ ${P}인 ================`);

  // ---- A. 무작위 드래프트 ----
  const spWins = new Array<number>(SPECIES.length).fill(0);
  const spGames = new Array<number>(SPECIES.length).fill(0);
  const spGoalWins = GOALS.map(() => new Array<number>(SPECIES.length).fill(0));
  const spGoalGames = GOALS.map(() => new Array<number>(SPECIES.length).fill(0));
  const seatWinsA = new Array<number>(P).fill(0);
  const rA = mulberry32(1000 + P);
  for (let i = 0; i < N; i++) {
    const drafted = randomDraft(P, rA);
    const res = playGame(P, drafted, 50_000 + P * 10_000 + i);
    seatWinsA[res.winner]!++;
    for (let p = 0; p < P; p++)
      for (const s of drafted[p]!) {
        spGames[s]!++;
        if (res.winner === p) spWins[s]!++;
        for (const gi of res.goals) {
          spGoalGames[gi]![s]!++;
          if (res.winner === p) spGoalWins[gi]![s]!++;
        }
      }
  }
  const base = spGames.map((g, s) => (g ? spWins[s]! / g : 0));
  const byGoal = GOALS.map((_, gi) => spGoalGames[gi]!.map((g, s) => (g >= 20 ? spGoalWins[gi]![s]! / g : base[s]!)));
  const model: ValueModel = { base, byGoal };
  const fair = 1 / P;
  console.log(`\n[A] 무작위 드래프트 ${N}판 — 종을 가졌을 때 승률 (공정 기준 ${(100 * fair).toFixed(0)}%)`);
  SPECIES.map((s, i) => ({ s, i, wr: base[i]! }))
    .sort((a, b) => b.wr - a.wr)
    .forEach(({ s, i }) => console.log(`  ${NAME_KO[s].padEnd(5)} ${pct(spWins[i]!, spGames[i]!)}  (${spGames[i]}회)`));
  console.log(`  좌석 승률(무작위 드래프트): ${seatWinsA.map((w, p) => `좌석${p} ${pct(w, N).trim()}`).join(' / ')}`);

  console.log(`\n[A] 목표 카드가 종 가치를 바꾸는 정도 (전체 순위와 목표 있을 때 순위의 상관, 1=그대로·0=무관)`);
  const rhos: number[] = [];
  GOALS.forEach((name, gi) => {
    const rho = spearman(base, byGoal[gi]!);
    rhos.push(rho);
    const top = SPECIES.map((s, i) => ({ s, v: byGoal[gi]![i]! - base[i]! }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 2)
      .map(({ s, v }) => `${NAME_KO[s]} ${v >= 0 ? '+' : ''}${(100 * v).toFixed(1)}`)
      .join(', ');
    console.log(`  ${name.padEnd(6)} 상관 ${rho.toFixed(2).padStart(5)}  가장 오르는 종: ${top}`);
  });
  console.log(`  평균 상관 ${(rhos.reduce((a, b) => a + b, 0) / rhos.length).toFixed(2)}`);

  if (process.env.SIM_PHASE === 'A') continue;
  if (process.env.SEAT_SEARCH) {
    // 드래프트 첫 바퀴 순서 × 덤 후보를 모두 돌려 좌석 승률 편차가 가장 작은 조합을 찾는다
    const perms = (arr: number[]): number[][] => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((r) => [x, ...r])));
    const komis: number[][] = JSON.parse(process.env.SEAT_KOMIS ?? 'null') ?? [new Array<number>(P).fill(0)];
    const rows: { order: number[]; komi: number[]; rates: number[]; spread: number }[] = [];
    const orders: number[][] = JSON.parse(process.env.SEAT_ORDERS ?? 'null') ?? perms([...Array(P).keys()]);
    for (const order of orders)
      for (const komi of komis) {
        SEAT[P]!.draftOrder = order;
        SEAT[P]!.komi = komi;
        const wins = new Array<number>(P).fill(0);
        const rS = mulberry32(3000 + P);
        for (let i = 0; i < N; i++) {
          const gameSeed = 90_000 + P * 10_000 + i;
          const pre = mulberry32(gameSeed);
          buildBoard(P, pre);
          const goals = pickGoals(pre);
          const { drafted } = smartDraft(P, goals, model, rS);
          wins[playGame(P, drafted, gameSeed, goals).winner]!++;
        }
        const rates = wins.map((w) => w / N);
        rows.push({ order, komi, rates, spread: Math.max(...rates.map((r) => Math.abs(r - fair))) });
      }
    rows.sort((a, b) => a.spread - b.spread);
    console.log(`
[좌석 탐색] ${P}인, 조합당 ${N}판 — 편차 작은 순`);
    for (const r of rows.slice(0, 8)) console.log(`  드래프트 첫 바퀴 [${r.order.join(',')}] 덤 [${r.komi.join(',')}]: ${r.rates.map((x) => (100 * x).toFixed(1)).join(' / ')}  최대 편차 ${(100 * r.spread).toFixed(1)}%p`);
    continue;
  }
  // ---- B. 똑똑한 드래프트 ----
  // 첫 바퀴 순서를 표로 정한 인원은 draftFirst 가 무시되므로 비교 줄을 돌리지 않는다(같은 숫자만 나온다). 순서 비교는 SEAT_SEARCH 로 한다
  const firstPickRuns = SEAT[P]!.draftOrder ? [SEAT[P]!.draftFirst] : ([SEAT[P]!.draftFirst, SEAT[P]!.draftFirst === 'last' ? 'first' : 'last'] as const);
  for (const firstPick of firstPickRuns) {
    const seatWins = new Array<number>(P).fill(0);
    const pickPos = new Array<number>(SPECIES.length).fill(0);
    const pickCount = new Array<number>(SPECIES.length).fill(0);
    const firstPicks = new Array<number>(SPECIES.length).fill(0);
    let flips = 0;
    let lost = 0;
    let plants = 0;
    let discards = 0;
    let discardGames = 0;
    let turns = 0;
    let landSum = 0;
    let goalSum = 0;
    let roseSum = 0;
    let margin = 0;
    let fertileAdvWins = 0;
    let fertileAdvGames = 0;
    let blockedAdvWins = 0;
    let blockedAdvGames = 0;
    const deckKeys = new Map<string, number>();
    const winnerDecks: number[][] = [];
    const rB = mulberry32(2000 + P);
    for (let i = 0; i < N; i++) {
      const gameSeed = 90_000 + P * 10_000 + i;
      // 목표·보드는 게임 시드로 정해지므로 드래프트 전에 같은 시드로 목표만 미리 뽑는다
      const pre = mulberry32(gameSeed);
      buildBoard(P, pre);
      const goals = pickGoals(pre);
      const { drafted, order } = smartDraft(P, goals, model, rB, firstPick);
      order.forEach(({ species }, k) => {
        pickPos[species]! += k + 1;
        pickCount[species]!++;
      });
      firstPicks[order[0]!.species]!++;
      const res = playGame(P, drafted, gameSeed, goals);
      seatWins[res.winner]!++;
      flips += res.flips;
      lost += res.lostPlants;
      plants += res.totalPlants;
      discards += res.discards;
      if (res.discards > 0) discardGames++;
      turns += res.turns;
      for (let p = 0; p < P; p++) {
        landSum += res.scores.land[p]!;
        goalSum += res.scores.goal[p]!;
        roseSum += res.scores.mugunghwa[p]!;
      }
      const sorted = [...res.scores.total].sort((a, b) => b - a);
      margin += sorted[0]! - sorted[1]!;
      for (const d of drafted) {
        const key = [...d].sort((a, b) => a - b).join(',');
        deckKeys.set(key, (deckKeys.get(key) ?? 0) + 1);
      }
      winnerDecks.push(drafted[res.winner]!);
      if (P === 2) {
        const [f0, f1] = res.nearFertile;
        if (f0 !== f1) {
          fertileAdvGames++;
          if (res.winner === (f0! > f1! ? 0 : 1)) fertileAdvWins++;
        }
        const [b0, b1] = res.nearBlocked;
        if (b0 !== b1) {
          blockedAdvGames++;
          if (res.winner === (b0! < b1! ? 0 : 1)) blockedAdvWins++;
        }
      }
    }
    const pol = SEAT[P]!;
    const label = `${firstPick === 'last' ? '늦게 두는 좌석이 첫 픽' : '좌석 0이 첫 픽'}${firstPick === pol.draftFirst ? ' (채택)' : ' (비교)'} · 덤 [${pol.komi.join(',')}]${pol.lastRoundReverse ? ' · 마지막 라운드 역순' : ''}`;
    console.log(`\n[B] 똑똑한 드래프트 ${N}판 — ${label}`);
    console.log(`  좌석 승률: ${seatWins.map((w, p) => `좌석${p} ${pct(w, N).trim()}`).join(' / ')}  (목표 ${(100 * fair).toFixed(0)}% ±5)`);
    if (firstPick !== pol.draftFirst) continue;
    console.log(`  첫 픽 분포: ${SPECIES.map((s, i) => ({ s, k: firstPicks[i]! }))
      .filter((x) => x.k > 0)
      .sort((a, b) => b.k - a.k)
      .map(({ s, k }) => `${NAME_KO[s]} ${pct(k, N).trim()}`)
      .join(', ')}`);
    console.log(`  평균 픽 순번(작을수록 먼저 가져감, 안 뽑히면 제외):`);
    console.log(
      '   ' +
        SPECIES.map((s, i) => ({ s, avg: pickCount[i] ? pickPos[i]! / pickCount[i]! : 99, rate: pickCount[i]! / N }))
          .sort((a, b) => a.avg - b.avg)
          .map(({ s, avg, rate }) => `${NAME_KO[s]} ${avg === 99 ? '-' : avg.toFixed(1)}${P === 2 ? `(${(100 * rate).toFixed(0)}%)` : ''}`)
          .join(' · '),
    );
    // 덱 다양성: 서로 다른 덱 구성 수, 가장 흔한 덱 비율
    const decks = [...deckKeys.values()].sort((a, b) => b - a);
    console.log(`  덱 다양성: 서로 다른 덱 ${deckKeys.size}가지 / ${N * P}개, 가장 흔한 덱 ${pct(decks[0]!, N * P).trim()}`);
    // 이긴 덱끼리 얼마나 겹치나 (평균 자카드 유사도, 표본 300쌍)
    let jac = 0;
    let pairs = 0;
    const rj = mulberry32(7);
    for (let k = 0; k < 300 && winnerDecks.length > 1; k++) {
      const a = winnerDecks[Math.floor(rj() * winnerDecks.length)]!;
      const c = winnerDecks[Math.floor(rj() * winnerDecks.length)]!;
      if (a === c) continue;
      const inter = a.filter((x) => c.includes(x)).length;
      jac += inter / new Set([...a, ...c]).size;
      pairs++;
    }
    console.log(`  이긴 덱끼리 평균 겹침(자카드) ${(jac / Math.max(1, pairs)).toFixed(2)}  (1=늘 같은 덱, 낮을수록 판마다 다름)`);
    console.log(`  뒤집기: 판당 ${(flips / N).toFixed(1)}칸이 주인을 바꿈, 끝날 때 남의 땅 위 식물 ${pct(lost, plants).trim()}`);
    console.log(`  점수 구성(1인 평균): 땅 ${(landSum / N / P).toFixed(1)} + 목표 ${(goalSum / N / P).toFixed(1)} + 무궁화 ${(roseSum / N / P).toFixed(1)}, 1·2등 점수 차 평균 ${(margin / N).toFixed(1)}`);
    console.log(`  심을 곳 없어 버림: 판당 ${(discards / N).toFixed(2)}장, 버림이 있던 판 ${pct(discardGames, N).trim()}`);
    console.log(`  판당 턴 ${(turns / N).toFixed(0)}`);
    if (P === 2) {
      console.log(`  보드 운: 입구 근처(거리 3) 비옥토가 더 많은 쪽 승률 ${pct(fertileAdvWins, fertileAdvGames).trim()} (n=${fertileAdvGames}), 막힌 칸이 더 적은 쪽 ${pct(blockedAdvWins, blockedAdvGames).trim()} (n=${blockedAdvGames})`);
    }
  }
}
console.log(`\n소요 ${((Date.now() - t0) / 1000).toFixed(0)}초`);
