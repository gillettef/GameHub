/**
 * Rootbound(정원 컨셉) 수치 시뮬레이터. 규칙 엔진과 무관한 독립 스크립트로, 수치를 데이터로 받아 빠르게 시험한다.
 *   npx tsx shared/scripts/garden-sim.ts [2인 판수] [3인 판수] [4인 판수]
 *   SIM_OVERRIDES=<json 파일 경로> 로 종 수치·덤을 파일 수정 없이 덮어쓴다:
 *     { "species": { "<id>": { "self": 3 } }, "seat": { "3": { "komi": [1,0,0] } }, "linkedBonus": 2 }
 *   SIM_PHASE=A  : A 단계(종 가치)만
 *   MARKET_MODE=base|R|P|RP : 마켓 규칙 대안 비교 (R 선 돌리기, P 인원+1장, RP 둘 다 — MARKET_MODE 선언부 주석)
 *   A_GAMES=<n>  : A 단계 판 수 (기본 = 인원별 판 수)
 *   SEAT_SEARCH=1 SEAT_KOMIS='[[0,0],[0,1]]' : 덤 후보마다 B 단계 좌석 승률만 재서 편차 작은 순으로 출력
 *
 * 규칙(2026-10-08 공용 마켓, 드래프트 대체):
 *  - 판마다 식물 2인 6종 / 3·4인 8종(보호구역 목표 종 필수, 꽃밭·숲 목표면 관련 종 1개 이상)을 고르고,
 *    종마다 2인 5 / 3인 6 / 4인 8장을 한 더미로 섞어 각자 3장씩 손에 든다.
 *  - 라운드 시작마다 더미에서 (기권 안 한) 인원 수만큼 마켓에 펼친다. 각자 차례에 손에서 1장 심고(심을 칸이 없으면 버리고)
 *    남은 마켓 카드 중 1장을 가져간다. 라운드 마지막 사람은 남은 1장을 가져간다. 더미가 떨어지면 손만 쓴다.
 *  - 좌석 보정은 덤만 있다.
 *
 * 두 단계로 잰다.
 *  A. 무작위 가져오기: 봇이 마켓에서 무작위로 가져간다 → 종 가치(심은 장수 가중 승률, 가장 많이 심은 사람 승률), 목표가 있을 때의 종 가치
 *  B. 똑똑한 가져오기: 마켓 카드마다 "지금 보드에서 가장 좋은 칸에 심었을 때 1수 가치" + A 에서 배운 목표 연계 가치
 *     (+ 여러 가지 심기 목표면 안 심은 새 종 보너스)가 가장 큰 카드, 15% 확률로 무작위 → 좌석 승률·종 승률·점수 구성 등
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

interface Board {
  n: number;
  q: number[];
  r: number[];
  tile: number[];
  terrain: number[];
  nb: number[][];
  ring2: number[][];
  line: number[][][];
  edge: boolean[];
  centerTile: number;
  tileCount: number;
  entrances: number[];
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
  { ...ZERO, self: 2, star2: 1 }, // fern
  { ...ZERO, self: 1, ring1: 1, seed: 2 }, // dandelion
  { ...ZERO, self: 2, ring1: 1, fertileRing: 2 }, // rapeseed
  { ...ZERO, self: 2, ring1: 1, pondOnly: true }, // lotus
  { ...ZERO, self: 1, ring1: 1, ivy: 1 }, // ivy
  { ...ZERO, self: 1, ring1: 2, bamboo: 2 }, // bamboo
  { ...ZERO, self: 1, mushroom: 2 }, // mushroom
  { ...ZERO, self: 2, ring1: 1, mugunghwa: 1 }, // mugunghwa
];

interface SeatPolicy {
  /** 좌석별 덤 */
  komi: number[];
}
/** 좌석 보정 = 덤만 (Rules.md 4절). 2026-10-08 선 돌리기 마켓(R)에서 조합당 2000판으로 정함 */
const SEAT: Record<number, SeatPolicy> = {
  2: { komi: [0, 0] },
  3: { komi: [1, 2, 0] },
  4: { komi: [0, 1, 0, 0] },
};
/** 인원별 이번 판 식물 수 · 종마다 장수 */
const GARDEN_SIZE: Record<number, number> = { 2: 6, 3: 8, 4: 8 };
const COPIES: Record<number, number> = { 2: 5, 3: 6, 4: 8 };

/**
 * 마켓 규칙 대안 (MARKET_MODE 환경 변수, 비교용):
 *  base : 라운드마다 인원 수만큼 펼치고 좌석 0부터 고정 순서 (명세 그대로)
 *  R    : 선 돌리기 — 라운드 k(0부터)는 좌석 k mod P 부터 좌석 순서로 둔다(심기·가져오기 모두)
 *  P    : 인원+1장 — 마켓을 인원+1장 펼치고 남은 1장은 다음 라운드 시작 때 버린다
 *  RP   : 선 돌리기 + 인원+1장
 * 인원+1장일 때 판 길이(2인 15 / 3·4인 16 차례)를 지키려면 마켓 라운드(2인 12 / 3·4인 13) × (인원+1)장이 더미에 있어야 한다.
 * 그래서 종마다 장수를 늘리고(COPIES_PLUS) 남는 카드는 준비 때 상자에 넣는다(더미 = 정확히 마켓 라운드 × (인원+1)).
 *  2인 6종×7=42 = 손 6 + 12×3 (남는 것 0) / 3인 8종×8=64 = 손 9 + 13×4 + 3장 제외 / 4인 8종×10=80 = 손 12 + 13×5 + 3장 제외
 */
const MARKET_MODE = (process.env.MARKET_MODE ?? 'R') as 'base' | 'R' | 'P' | 'RP';
const MARKET_ROTATE = MARKET_MODE === 'R' || MARKET_MODE === 'RP';
const MARKET_PLUS = MARKET_MODE === 'P' || MARKET_MODE === 'RP';
const COPIES_PLUS: Record<number, number> = { 2: 7, 3: 8, 4: 10 };
/** 손 3장 이후 마켓이 열리는 라운드 수 (기준 규칙의 더미 장수 / 인원) */
const MARKET_ROUNDS: Record<number, number> = { 2: 12, 3: 13, 4: 13 };

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
  '연못가', '큰정원', '오솔길', '비옥한밭', '가장자리', '중앙광장', '조각마다', '꽃밭', '숲', '이어진정원', '경계', '여러가지',
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

/** 이번 판 식물: 보호구역 종 필수, 꽃밭·숲이면 관련 종 1개 이상, 나머지는 시드로 섞어 채운다. 표 순서로 정렬 */
function pickGarden(P: number, goals: number[], rand: Rand): number[] {
  const chosen: number[] = [];
  for (const gi of goals) {
    const linked = LINKED_GOALS.find(([gid]) => gid === gi);
    if (linked && !chosen.includes(linked[1])) chosen.push(linked[1]);
  }
  const needOne = (cands: number[]) => {
    if (cands.some((s) => chosen.includes(s))) return;
    chosen.push(shuffle(cands, rand)[0]!);
  };
  if (goals.includes(7)) needOne([S.rapeseed, S.lotus, S.mugunghwa]);
  if (goals.includes(8)) needOne([S.oak, S.bamboo]);
  const rest = shuffle(
    SPECIES.map((_, s) => s).filter((s) => !chosen.includes(s)),
    rand,
  );
  while (chosen.length < GARDEN_SIZE[P]!) chosen.push(rest.shift()!);
  return chosen.sort((a, b) => a - b);
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
  garden: number[]; // 이번 판 식물 (공개)
  planted: Set<number>[]; // 좌석별 심은 종
  plantedCount: number[][]; // 좌석별 종마다 심은 장수
  hands: number[][];
  pile: number[]; // 더미 (비공개)
  market: number[]; // 이번 라운드 마켓 (공개)
  discards: number;
}

function newGame(P: number, b: Board, goals: number[], garden: number[], rand: Rand): Game {
  const g: Game = {
    P,
    b,
    goals,
    species: new Int8Array(b.n).fill(-1),
    owner: new Int8Array(b.n).fill(-1),
    dir: new Int8Array(b.n).fill(-1),
    entranceOf: new Int8Array(b.n).fill(-1),
    seeds: [],
    garden,
    planted: Array.from({ length: P }, () => new Set<number>()),
    plantedCount: Array.from({ length: P }, () => new Array<number>(SPECIES.length).fill(0)),
    hands: [],
    pile: [],
    market: [],
    discards: 0,
  };
  b.entrances.forEach((c, seat) => (g.entranceOf[c] = seat));
  const copies = MARKET_PLUS ? COPIES_PLUS[P]! : COPIES[P]!;
  const pile = shuffle(garden.flatMap((s) => new Array<number>(copies).fill(s)), rand);
  for (let p = 0; p < P; p++) g.hands.push(pile.splice(0, HAND_SIZE));
  // 인원+1장: 더미는 정확히 마켓 라운드 × (인원+1)장, 나머지는 상자에 넣는다
  g.pile = MARKET_PLUS ? pile.slice(0, MARKET_ROUNDS[P]! * (P + 1)) : pile;
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
      case 11: // 여러 가지 심기: 서로 다른 식물 5종 이상 심었으면 +4
        add(g.planted.map((set) => (set.size >= 5 ? 4 : 0)));
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
// 마켓 가져오기 봇
// ---------------------------------------------------------------------------

/** A 단계에서 배운 종 가치: 기본(장수 가중) 승률 + 목표가 있을 때 승률 */
interface ValueModel {
  base: number[];
  byGoal: number[][];
}

/** 목표 연계 가치 가중치: 승률 1.0(100%p) 당 점수. +10%p → +1점 */
const TAKE_GOAL_W = Number(process.env.TAKE_GOAL_W ?? 10);
/** 여러 가지 심기 목표가 있을 때, 아직 심지도 손에 들지도 않은 종에 주는 가산(5종 미만일 때) */
const TAKE_VARIETY_BONUS = 1;

/** 종 s 를 지금 보드에서 가장 좋은 칸에 심었을 때 1수 가치 (민들레 씨앗은 생략하는 근사). 심을 칸이 없으면 -Infinity */
function bestPlantValue(g: Game, inf: Int16Array[], p: number, s: number): number {
  let best = -Infinity;
  for (const cell of legalCells(g, inf, p, s)) {
    if (SPEC[s]!.line) {
      for (let d = 0; d < 6; d++) if (g.b.line[cell]![d]!.length) best = Math.max(best, evalMove(g, p, s, cell, d, -1));
    } else best = Math.max(best, evalMove(g, p, s, cell, -1, -1));
  }
  return best;
}

type TakeMode = 'random' | 'smart';

/** 마켓에서 가져올 자리 번호 */
function chooseTake(g: Game, p: number, rand: Rand, mode: TakeMode, model?: ValueModel): number {
  const m = g.market;
  if (m.length <= 1) return 0;
  if (mode === 'random' || !model || rand() < 0.15) return Math.floor(rand() * m.length);
  const inf = influence(g);
  const cache = new Map<number, number>();
  let best = 0;
  let bestV = -Infinity;
  m.forEach((s, i) => {
    let v = cache.get(s);
    if (v === undefined) {
      const pv = bestPlantValue(g, inf, p, s);
      v = Number.isFinite(pv) ? pv : -100;
      for (const gi of g.goals) v += TAKE_GOAL_W * (model.byGoal[gi]![s]! - model.base[s]!);
      if (g.goals.includes(11) && g.planted[p]!.size < 5 && !g.planted[p]!.has(s) && !g.hands[p]!.includes(s)) v += TAKE_VARIETY_BONUS;
      cache.set(s, v);
    }
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  });
  return best;
}

// ---------------------------------------------------------------------------
// 한 판
// ---------------------------------------------------------------------------

interface Result {
  P: number;
  goals: number[];
  garden: number[];
  plantedCount: number[][];
  scores: ScoreDetail;
  winner: number;
  /** 다른 사람에게 넘어간(또는 무소유가 된) 땅 칸 수 누적 — 뒤집기 */
  flips: number;
  /** 끝날 때 남의 땅(또는 무소유) 위에 있는 식물 비율 */
  lostPlants: number;
  totalPlants: number;
  discards: number;
  turns: number;
  /** 좌석별 둔 횟수 (모두 같아야 한다) */
  seatTurns: number[];
  /** 종별: 고를 수 있을 때(마켓 2장 이상) 마켓에 있던 횟수 / 가져간 횟수 */
  offered: number[];
  taken: number[];
  /** 좌석별 입구 거리 3 이내 비옥토·막힌 칸 */
  nearFertile: number[];
  nearBlocked: number[];
}

function playGame(P: number, seed: number, mode: TakeMode, model?: ValueModel): Result {
  const rand = mulberry32(seed);
  const b = buildBoard(P, rand);
  const goals = pickGoals(rand);
  const garden = pickGarden(P, goals, rand);
  const g = newGame(P, b, goals, garden, rand);
  let prevOwn = owners(g, influence(g));
  let flips = 0;
  let turns = 0;
  const offered = new Array<number>(SPECIES.length).fill(0);
  const taken = new Array<number>(SPECIES.length).fill(0);
  const seatTurns = new Array<number>(P).fill(0);
  for (let round = 0; ; round++) {
    // 라운드 시작: 남은 마켓은 버리고 더미에서 인원 수(인원+1장 안이면 +1)만큼 펼친다 (시뮬레이터에는 기권이 없다)
    g.market = g.pile.splice(0, P + (MARKET_PLUS ? 1 : 0));
    let anyPlayed = false;
    const start = MARKET_ROTATE ? round % P : 0;
    for (let k = 0; k < P; k++) {
      const p = (start + k) % P;
      if (g.hands[p]!.length === 0) continue;
      anyPlayed = true;
      turns++;
      seatTurns[p]!++;
      const m = chooseMove(g, p, rand);
      if (!m) {
        // 심을 곳이 없으면 1장 버린다
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
        g.plantedCount[p]![s]!++;
      }
      if (g.market.length) {
        if (g.market.length > 1) for (const s of new Set(g.market)) offered[s]!++;
        const k = chooseTake(g, p, rand, mode, model);
        const s = g.market.splice(k, 1)[0]!;
        if (g.market.length >= 1) taken[s]!++; // 고를 수 있었던 가져오기만 센다
        g.hands[p]!.push(s);
      }
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
  // 승자: 점수 → 땅 → 늦은 좌석
  let winner = 0;
  for (let p = 1; p < P; p++) {
    const a = scores.total[p]!;
    const w = scores.total[winner]!;
    if (a > w || (a === w && scores.land[p]! >= scores.land[winner]!)) winner = p;
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
    garden,
    plantedCount: g.plantedCount,
    scores,
    winner,
    flips,
    lostPlants,
    totalPlants,
    discards: g.discards,
    seatTurns,
    turns,
    offered,
    taken,
    nearFertile: Array.from({ length: P }, (_, p) => near(p, (t) => t === FERTILE)),
    nearBlocked: Array.from({ length: P }, (_, p) => near(p, (t) => t === POND || t === ROCK)),
  };
}

// ---------------------------------------------------------------------------
// 종 통계
// ---------------------------------------------------------------------------

class SpeciesStats {
  /** 판에 나온 횟수 */
  inGarden = new Array<number>(SPECIES.length).fill(0);
  /** 심은 장수 가중: 심은 장수 합 / 이긴 사람이 심은 장수 합 */
  cards = new Array<number>(SPECIES.length).fill(0);
  winCards = new Array<number>(SPECIES.length).fill(0);
  /** 1장 이상 심은 사람 수 / 그중 이긴 수 */
  have = new Array<number>(SPECIES.length).fill(0);
  haveWins = new Array<number>(SPECIES.length).fill(0);
  /** 그 종을 가장 많이 심은 사람(단독)이 있던 판 / 그 사람이 이긴 판 */
  top = new Array<number>(SPECIES.length).fill(0);
  topWins = new Array<number>(SPECIES.length).fill(0);
  goalCards = GOALS.map(() => new Array<number>(SPECIES.length).fill(0));
  goalWinCards = GOALS.map(() => new Array<number>(SPECIES.length).fill(0));
  offered = new Array<number>(SPECIES.length).fill(0);
  taken = new Array<number>(SPECIES.length).fill(0);

  add(res: Result): void {
    for (const s of res.garden) {
      this.inGarden[s]!++;
      this.offered[s]! += res.offered[s]!;
      this.taken[s]! += res.taken[s]!;
      let topN = 0;
      let topP = -1;
      let topTie = false;
      for (let p = 0; p < res.P; p++) {
        const n = res.plantedCount[p]![s]!;
        const win = res.winner === p ? 1 : 0;
        this.cards[s]! += n;
        this.winCards[s]! += n * win;
        for (const gi of res.goals) {
          this.goalCards[gi]![s]! += n;
          this.goalWinCards[gi]![s]! += n * win;
        }
        if (n > 0) {
          this.have[s]!++;
          this.haveWins[s]! += win;
        }
        if (n > topN) {
          topN = n;
          topP = p;
          topTie = false;
        } else if (n === topN && n > 0) topTie = true;
      }
      if (topP >= 0 && !topTie) {
        this.top[s]!++;
        if (res.winner === topP) this.topWins[s]!++;
      }
    }
  }

  model(): ValueModel {
    const base = this.cards.map((c, s) => (c ? this.winCards[s]! / c : 0));
    const byGoal = GOALS.map((_, gi) => this.goalCards[gi]!.map((c, s) => (c >= 60 ? this.goalWinCards[gi]![s]! / c : base[s]!)));
    return { base, byGoal };
  }

  print(N: number, showTake: boolean): void {
    const wr = this.cards.map((c, s) => (c ? this.winCards[s]! / c : 0));
    console.log(`  종      출현   장수가중 승률  1장↑ 심은 사람  가장 많이 심은 사람${showTake ? '  고를 때 가져간 비율' : ''}`);
    SPECIES.map((s, i) => ({ s, i }))
      .sort((a, b) => wr[b.i]! - wr[a.i]!)
      .forEach(({ s, i }) =>
        console.log(
          `  ${NAME_KO[s].padEnd(4)} ${pct(this.inGarden[i]!, N)}   ${pct(this.winCards[i]!, this.cards[i]!)}        ${pct(this.haveWins[i]!, this.have[i]!)}         ${pct(this.topWins[i]!, this.top[i]!)}${showTake ? `             ${pct(this.taken[i]!, this.offered[i]!)}` : ''}`,
        ),
      );
    const vals = wr.filter((_, i) => this.cards[i]! > 0);
    console.log(`  장수가중 승률 폭: ${(100 * (Math.max(...vals) - Math.min(...vals))).toFixed(1)}%p`);
  }
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
  const NA = Number(process.env.A_GAMES ?? N);
  console.log(`\n================ ${P}인 ================`);

  // ---- A. 무작위 가져오기 ----
  const tA = Date.now();
  const statA = new SpeciesStats();
  const seatWinsA = new Array<number>(P).fill(0);
  for (let i = 0; i < NA; i++) {
    const res = playGame(P, 50_000 + P * 10_000 + i, 'random');
    seatWinsA[res.winner]!++;
    statA.add(res);
  }
  const model = statA.model();
  const fair = 1 / P;
  console.log(`\n[A] 무작위 가져오기 ${NA}판 (${((Date.now() - tA) / NA).toFixed(0)}ms/판) — 종 가치 (공정 기준 ${(100 * fair).toFixed(0)}%)`);
  statA.print(NA, false);
  console.log(`  좌석 승률(무작위 가져오기, 덤 [${SEAT[P]!.komi.join(',')}]): ${seatWinsA.map((w, p) => `좌석${p} ${pct(w, NA).trim()}`).join(' / ')}`);

  console.log(`\n[A] 목표 카드가 종 가치를 바꾸는 정도 (전체 순위와 목표 있을 때 순위의 상관, 1=그대로·0=무관)`);
  const rhos: number[] = [];
  GOALS.forEach((name, gi) => {
    const rho = spearman(model.base, model.byGoal[gi]!);
    rhos.push(rho);
    const top = SPECIES.map((s, i) => ({ s, v: model.byGoal[gi]![i]! - model.base[i]! }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 2)
      .map(({ s, v }) => `${NAME_KO[s]} ${v >= 0 ? '+' : ''}${(100 * v).toFixed(1)}`)
      .join(', ');
    console.log(`  ${name.padEnd(6)} 상관 ${rho.toFixed(2).padStart(5)}  가장 오르는 종: ${top}`);
  });
  console.log(`  평균 상관 ${(rhos.reduce((a, b) => a + b, 0) / rhos.length).toFixed(2)}`);

  if (process.env.SIM_PHASE === 'A') continue;
  if (process.env.SEAT_SEARCH) {
    // 덤 후보마다 똑똑한 가져오기로 좌석 승률을 재서 편차가 가장 작은 덤을 찾는다 (같은 판 시드를 공유)
    const komis: number[][] = JSON.parse(process.env.SEAT_KOMIS ?? 'null') ?? [SEAT[P]!.komi];
    const rows: { komi: number[]; rates: number[]; spread: number; sd: number }[] = [];
    for (const komi of komis) {
      SEAT[P]!.komi = komi;
      const wins = new Array<number>(P).fill(0);
      for (let i = 0; i < N; i++) wins[playGame(P, 90_000 + P * 10_000 + i, 'smart', model).winner]!++;
      const rates = wins.map((w) => w / N);
      const spread = Math.max(...rates.map((r) => Math.abs(r - fair)));
      const sd = Math.sqrt(rates.reduce((a, r) => a + (r - fair) ** 2, 0) / P);
      rows.push({ komi, rates, spread, sd });
      console.log(`  (측정) 덤 [${komi.join(',')}]: ${rates.map((x) => (100 * x).toFixed(1)).join(' / ')}`);
    }
    rows.sort((a, b) => a.spread - b.spread || a.sd - b.sd);
    const se = 100 * Math.sqrt((fair * (1 - fair)) / N);
    console.log(`\n[좌석 탐색] ${P}인, 조합당 ${N}판 — 편차 작은 순 (좌석 승률 표준오차 약 ±${se.toFixed(1)}%p)`);
    for (const r of rows) console.log(`  덤 [${r.komi.join(',')}]: ${r.rates.map((x) => (100 * x).toFixed(1)).join(' / ')}  최대 편차 ${(100 * r.spread).toFixed(1)}%p · RMS ${(100 * r.sd).toFixed(1)}%p`);
    continue;
  }

  // ---- B. 똑똑한 가져오기 ----
  const tB = Date.now();
  const statB = new SpeciesStats();
  const seatWins = new Array<number>(P).fill(0);
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
  let distinctSum = 0;
  let unequalTurns = 0;
  let fertileAdvWins = 0;
  let fertileAdvGames = 0;
  let blockedAdvWins = 0;
  let blockedAdvGames = 0;
  const seatScore = new Array<number>(P).fill(0);
  for (let i = 0; i < N; i++) {
    const res = playGame(P, 90_000 + P * 10_000 + i, 'smart', model);
    statB.add(res);
    seatWins[res.winner]!++;
    flips += res.flips;
    lost += res.lostPlants;
    plants += res.totalPlants;
    discards += res.discards;
    if (res.discards > 0) discardGames++;
    turns += res.turns;
    if (new Set(res.seatTurns).size > 1) unequalTurns++;
    for (let p = 0; p < P; p++) {
      landSum += res.scores.land[p]!;
      goalSum += res.scores.goal[p]!;
      roseSum += res.scores.mugunghwa[p]!;
      seatScore[p]! += res.scores.total[p]!;
      distinctSum += res.plantedCount[p]!.filter((n) => n > 0).length;
    }
    const sorted = [...res.scores.total].sort((a, b) => b - a);
    margin += sorted[0]! - sorted[1]!;
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
  console.log(`\n[B] 똑똑한 가져오기 ${N}판 (${((Date.now() - tB) / N).toFixed(0)}ms/판) — 마켓 ${MARKET_MODE} · 덤 [${SEAT[P]!.komi.join(',')}]`);
  console.log(`  좌석 승률: ${seatWins.map((w, p) => `좌석${p} ${pct(w, N).trim()}`).join(' / ')}  (목표 ${(100 * fair).toFixed(0)}% ±5)`);
  console.log(`  좌석 평균 점수(덤 포함): ${seatScore.map((v) => (v / N).toFixed(1)).join(' / ')}  ${MARKET_MODE === 'base' ? ` (라운드 마지막 좌석${P - 1}은 늘 남은 1장)` : ''}`);
  statB.print(N, true);
  console.log(`  뒤집기: 판당 ${(flips / N).toFixed(1)}칸이 주인을 바꿈, 끝날 때 남의 땅 위 식물 ${pct(lost, plants).trim()}`);
  console.log(`  점수 구성(1인 평균): 땅 ${(landSum / N / P).toFixed(1)} + 목표 ${(goalSum / N / P).toFixed(1)} + 무궁화 ${(roseSum / N / P).toFixed(1)}, 1·2등 점수 차 평균 ${(margin / N).toFixed(1)}`);
  console.log(`  1인당 심은 서로 다른 종 평균 ${(distinctSum / N / P).toFixed(1)}`);
  console.log(`  심을 곳 없어 버림: 판당 ${(discards / N).toFixed(2)}장, 버림이 있던 판 ${pct(discardGames, N).trim()}`);
  console.log(`  판당 턴 ${(turns / N).toFixed(0)}, 좌석마다 둔 횟수가 다른 판 ${unequalTurns}`);
  if (P === 2) {
    console.log(`  보드 운: 입구 근처(거리 3) 비옥토가 더 많은 쪽 승률 ${pct(fertileAdvWins, fertileAdvGames).trim()} (n=${fertileAdvGames}), 막힌 칸이 더 적은 쪽 ${pct(blockedAdvWins, blockedAdvGames).trim()} (n=${blockedAdvGames})`);
  }
}
console.log(`\n소요 ${((Date.now() - t0) / 1000).toFixed(0)}초`);
