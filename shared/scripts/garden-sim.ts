/**
 * 정원 컨셉(notes/Rules_garden_draft.md v0.1) 수치 시뮬레이터. 지금 게임 엔진과 무관한 독립 스크립트다.
 *   npx tsx shared/scripts/garden-sim.ts [2인 판수] [3인 판수] [4인 판수]
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

const TILES_BY_PLAYERS: Record<number, number> = { 2: 7, 3: 11, 4: 14 };

interface Board {
  n: number;
  q: number[];
  r: number[];
  tile: number[];
  terrain: number[];
  nb: number[][];
  ring2: number[][];
  /** line[c][d] = 방향 d 로 거리 1·2·3 칸 (보드 밖은 빠짐) */
  line: number[][][];
  edge: boolean[];
  centerTile: number;
  tileCount: number;
  entrances: number[];
}

/** 조각 중심 격자: v1=(2,1), v2=(-1,3). 판별식 7 → 칸 7개 꽃 모양이 빈틈없이 깔린다 */
function layout(players: number): { centers: [number, number][]; entranceTiles: number[] } {
  const pts: { q: number; r: number; d: number; ang: number }[] = [];
  for (let a = -4; a <= 4; a++)
    for (let b = -4; b <= 4; b++) {
      const q = 2 * a - b;
      const r = a + 3 * b;
      const x = q + r / 2;
      const y = (r * Math.sqrt(3)) / 2;
      pts.push({ q, r, d: Math.round(Math.hypot(x, y) * 1000) / 1000, ang: Math.atan2(y, x) });
    }
  pts.sort((p1, p2) => p1.d - p2.d || p1.ang - p2.ang);
  const chosen = pts.slice(0, TILES_BY_PLAYERS[players]);
  const centers = chosen.map((p) => [p.q, p.r] as [number, number]);
  // 입구: 가장 바깥 조각들 중 서로 가장 멀리 떨어진 조합(최소 거리 최대 → 합 최대)
  const maxD = Math.max(...chosen.map((p) => p.d));
  const outer = chosen.map((p, i) => ({ p, i })).filter(({ p }) => p.d >= maxD - 1.01);
  let best: number[] = [];
  let bestKey = -1;
  const combo = (start: number, acc: number[]) => {
    if (acc.length === players) {
      let mn = Infinity;
      let sum = 0;
      for (let i = 0; i < acc.length; i++)
        for (let j = i + 1; j < acc.length; j++) {
          const a = chosen[acc[i] as number]!;
          const b = chosen[acc[j] as number]!;
          const dd = hexDist(a.q, a.r, b.q, b.r);
          mn = Math.min(mn, dd);
          sum += dd;
        }
      const key = mn * 1000 + sum;
      if (key > bestKey) {
        bestKey = key;
        best = [...acc];
      }
      return;
    }
    for (let k = start; k < outer.length; k++) combo(k + 1, [...acc, outer[k]!.i]);
  };
  combo(0, []);
  best.sort((a, b) => chosen[a]!.ang - chosen[b]!.ang);
  return { centers, entranceTiles: best };
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
// 식물 12종 (초안 7절)
// ---------------------------------------------------------------------------

const SPECIES = ['grass', 'oak', 'cactus', 'vine', 'fern', 'dandelion', 'sunflower', 'lotus', 'ivy', 'bamboo', 'mushroom', 'rose'] as const;
type SpeciesId = (typeof SPECIES)[number];
const S = Object.fromEntries(SPECIES.map((s, i) => [s, i])) as Record<SpeciesId, number>;
const NAME_KO: Record<SpeciesId, string> = {
  grass: '잔디',
  oak: '참나무',
  cactus: '선인장',
  vine: '덩굴',
  fern: '고사리',
  dandelion: '민들레',
  sunflower: '해바라기',
  lotus: '연꽃',
  ivy: '담쟁이',
  bamboo: '대나무',
  mushroom: '버섯',
  rose: '장미',
};

const ENTRANCE_SELF = 3;
const ENTRANCE_RING = 1;
const SEED_VALUE = 2;
const FERTILE_BONUS = 1;
const ROSE_BONUS = 2;
const HAND_SIZE = 3;

// ---------------------------------------------------------------------------
// 목표 카드 12장 (초안 8절)
// ---------------------------------------------------------------------------

const GOALS = ['연못가', '큰정원', '오솔길', '비옥한밭', '가장자리', '중앙광장', '조각마다', '꽃밭', '숲', '이어진정원', '경계', '종다쓰기'] as const;
const GOAL_EXCLUDE: [number, number][] = [[1, 9]];

function pickGoals(rand: Rand): number[] {
  for (;;) {
    const g = shuffle(GOALS.map((_, i) => i), rand).slice(0, 3);
    if (!GOAL_EXCLUDE.some(([a, b]) => g.includes(a) && g.includes(b))) return g;
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
  dir: Int8Array; // 덩굴 방향
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

/** 영향력 [P][n]. 더하기를 모두 합산한 뒤 버섯 빼기를 마지막에 적용 (초안 7·10절) */
function influence(g: Game): Int16Array[] {
  const { b, P } = g;
  const inf = Array.from({ length: P }, () => new Int16Array(b.n));
  const debuff = Array.from({ length: P }, () => new Int16Array(b.n)); // debuff[p][c] = p 가 아닌 사람 버섯이 c 에 주는 −1 합
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
    const p = g.owner[c] as number;
    const I = inf[p]!;
    const nbs = b.nb[c]!;
    let self = 0;
    let ring = 0;
    switch (s) {
      case S.grass:
        self = 1;
        ring = 1;
        break;
      case S.oak:
        self = 3;
        ring = 2;
        break;
      case S.cactus:
        self = 5;
        break;
      case S.vine:
        self = 1;
        for (const x of b.line[c]![g.dir[c] as number]!) I[x] += 1;
        break;
      case S.fern:
        self = 1;
        for (const x of b.ring2[c]!) I[x] += 1;
        break;
      case S.dandelion:
        self = 1;
        ring = 1;
        break;
      case S.sunflower:
        self = 2;
        ring = b.terrain[c] === FERTILE ? 2 : 1;
        break;
      case S.lotus:
        self = 2;
        ring = 2;
        break;
      case S.ivy:
        self = 1;
        ring = 1;
        for (const x of nbs) if ((g.species[x] as number) >= 0) I[x] += 2;
        break;
      case S.bamboo:
        self = 1;
        ring = 1;
        for (const x of nbs) if (g.species[x] === S.bamboo && g.owner[x] === p) self += 1;
        break;
      case S.mushroom:
        self = 1;
        for (const x of nbs) for (let o = 0; o < P; o++) if (o !== p) debuff[o]![x] += 1;
        break;
      case S.rose:
        self = 2;
        ring = 1;
        break;
    }
    if (b.terrain[c] === FERTILE) self += FERTILE_BONUS;
    I[c] += self;
    if (ring) for (const x of nbs) I[x] += ring;
  }
  for (const sd of g.seeds) inf[sd.owner]![sd.cell] += SEED_VALUE;
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
    if (s === S.lotus) {
      if (g.b.nb[c]!.some((x) => g.b.terrain[x] === POND)) out.push(c);
    } else if ((inf[p]![c] as number) >= 1) out.push(c);
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
  rose: number[];
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
        add(mine.map((cs) => 2 * cs.filter((c) => g.species[c] === S.sunflower || g.species[c] === S.lotus || g.species[c] === S.rose).length));
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
    }
  }
  const rose = new Array<number>(P).fill(0);
  for (let c = 0; c < b.n; c++) if (g.species[c] === S.rose && o[c] === g.owner[c]) rose[g.owner[c] as number]! += ROSE_BONUS;
  return { total: land.map((v, i) => v + goal[i]! + rose[i]!), land, goal, rose };
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
      if (s === S.vine) {
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
    if (s !== S.dandelion) continue;
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
  for (let round = 0; ; round++) {
    let anyPlayed = false;
    for (let p = 0; p < P; p++) {
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

function smartDraft(P: number, goals: number[], model: ValueModel, rand: Rand, firstPickSeat: 'last' | 'first'): { drafted: number[][]; order: { seat: number; species: number }[] } {
  const out: number[][] = Array.from({ length: P }, () => []);
  const taken = new Array<number>(SPECIES.length).fill(0);
  const seats = [...Array(P).keys()];
  const order = snakeOrder(P, firstPickSeat === 'last' ? seats.reverse() : seats);
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

  // ---- B. 똑똑한 드래프트 ----
  for (const firstPick of ['last', 'first'] as const) {
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
        roseSum += res.scores.rose[p]!;
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
    const label = firstPick === 'last' ? '초안대로(늦게 두는 좌석이 첫 픽)' : '비교용(좌석 0이 첫 픽)';
    console.log(`\n[B] 똑똑한 드래프트 ${N}판 — ${label}`);
    console.log(`  좌석 승률: ${seatWins.map((w, p) => `좌석${p} ${pct(w, N).trim()}`).join(' / ')}  (목표 ${(100 * fair).toFixed(0)}% ±5)`);
    if (firstPick === 'first') continue;
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
    console.log(`  점수 구성(1인 평균): 땅 ${(landSum / N / P).toFixed(1)} + 목표 ${(goalSum / N / P).toFixed(1)} + 장미 ${(roseSum / N / P).toFixed(1)}, 1·2등 점수 차 평균 ${(margin / N).toFixed(1)}`);
    console.log(`  심을 곳 없어 버림: 판당 ${(discards / N).toFixed(2)}장, 버림이 있던 판 ${pct(discardGames, N).trim()}`);
    console.log(`  판당 턴 ${(turns / N).toFixed(0)}`);
    if (P === 2) {
      console.log(`  보드 운: 입구 근처(거리 3) 비옥토가 더 많은 쪽 승률 ${pct(fertileAdvWins, fertileAdvGames).trim()} (n=${fertileAdvGames}), 막힌 칸이 더 적은 쪽 ${pct(blockedAdvWins, blockedAdvGames).trim()} (n=${blockedAdvGames})`);
    }
  }
}
console.log(`\n소요 ${((Date.now() - t0) / 1000).toFixed(0)}초`);
