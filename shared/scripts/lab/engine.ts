/**
 * 오프라인판 규칙 실험실 엔진 (2026-10-16). 정본 엔진(shared/src/engine)과 별개로, 규칙 후보를 설정값으로 바꿔 가며
 * 빠르게 시뮬레이션한다. 상태는 가변 배열 + 되돌리기 기록(undo)이라 봇이 수를 수천 번 시험해도 빠르다.
 *
 * 핵심 모델: 영향력 = 칸 위에 놓인 "뿌리 큐브". 심을 때 카드에 그려진 뿌리 모양대로 큐브를 놓고, 그 뒤로는 저절로 바뀌지 않는다.
 *  - mode 'tug'  : 줄다리기. 한 칸에는 한 색만. 남의 큐브가 있는 칸에 뿌리를 뻗으면 1:1로 걷어내고 남는 만큼 내 큐브를 놓는다.
 *  - mode 'sum'  : 색마다 따로 쌓고, 가장 많은 색 하나(엄격한 1등)가 주인 (예전 규칙과 같은 다수결).
 */
import { layoutFor } from '../../src/engine/board.js';

export const EMPTY = 0;
export const POND = 1;
export const ROCK = 2;
export const FERTILE = 3;

export type Ability =
  | { kind: 'seed'; value: number; range: number; count: number }
  | { kind: 'wither'; value: number }
  | { kind: 'pond' }
  | { kind: 'ivy'; value: number }
  | { kind: 'cluster'; value: number }
  | { kind: 'fertileRing'; value: number }
  | { kind: 'bloom'; value: number }
  | { kind: 'anywhere' }
  | { kind: 'deep' };

export interface SpeciesDef {
  id: string;
  name: string;
  /** [dq, dr, 큐브 수]. (0,0) 이 심은 칸 */
  pattern: [number, number, number][];
  tags?: ('flower' | 'tree')[];
  ability?: Ability;
}

export type GoalKind =
  | 'big-garden'
  | 'pond-side'
  | 'fertile-field'
  | 'edge-fence'
  | 'center-plaza'
  | 'every-tile'
  | 'flower-bed'
  | 'forest'
  | 'variety'
  | 'reserve'
  | 'long-path'
  | 'tile-majority'
  | 'deep-roots'
  | 'rock-garden'
  | 'entrance-path';

export interface GoalDef {
  id: string;
  kind: GoalKind;
  species?: string;
  a?: number;
  b?: number;
}

export interface LabRules {
  name: string;
  mode: 'tug' | 'sum';
  /** 한 칸에 쌓을 수 있는 같은 색 큐브 최대 (0 = 제한 없음) */
  cap: number;
  species: SpeciesDef[];
  /** 인원별 이번 판 식물 수 */
  gardenSize: Record<number, number>;
  /** 인원별 식물마다 장수 */
  copies: Record<number, number>;
  /** 인원별 마켓 장수 */
  market: Record<number, number>;
  /** 처음 손 카드 */
  startHand: number;
  /** 'turn' = 내 차례에 1장 가져오고 1장 심기. 'round' = 라운드마다 모두 가져온 뒤 모두 심기 */
  flow: 'turn' | 'round';
  /** 라운드 선: 'fixed' 고정, 'rotate' 시계방향 돌리기, 'supply' 공급처에 큐브가 가장 많이 남은 사람, 'least-land' 땅이 가장 적은 사람, 'lowest' 점수가 가장 낮은 사람 */
  firstPlayer: 'rotate' | 'fixed' | 'supply' | 'least-land' | 'lowest';
  /** 심을 수 있는 칸: 'own' 내 큐브가 있는 칸(줄다리기), 'touch' 내 큐브 1 이상(합산), 'adjacent' 내 땅과 맞닿은 빈 칸까지 */
  plantOn: 'own' | 'touch' | 'adjacent';
  /** 입구 둘레 6칸에 처음 놓는 큐브 */
  entranceRing: number;
  /** 비옥토에 심으면 심은 칸 +이 값 */
  fertileBonus: number;
  /** 회전을 허용하나 */
  rotate: boolean;
  goals: GoalDef[];
  goalCount: number;
  /** 보호구역(종 연계) 목표를 1장 이상 */
  requireReserve: boolean;
  komi: Record<number, number[]>;
  /** 일반 조각 (칸 번호 0 = 가운데, 1~6 = 방향 0~5) */
  tiles: [number, number][][];
  entranceTile: [number, number][];
  /** 심을 칸이 없을 때: 'discard' 버리기, 'entrance' 입구와 맞닿은 아무 빈 칸(없으면 버리기) */
  noCell: 'discard' | 'entrance';
  /** 마켓 리필: 'refill' 가져가면 바로 채움, 'round' 라운드마다 새로 */
  refill: 'refill' | 'round';
  /** 끝날 때 남은 큐브 1개당 점수 등 추가 규칙 */
  bonusPerTileMajority?: number;
  /** 인원별 1인 뿌리 큐브 수 (0/없음 = 무제한). 모자라면 가장 높이 쌓인 내 칸에서 옮겨 온다 */
  supply?: Record<number, number>;
  /** 독창성 체크리스트에 더할 고유 장치 이름 */
  hooks?: string[];
  /** 규칙 짐에 더할 추가 규칙 이름 */
  extraRules?: string[];
}

// ---------------------------------------------------------------------------
// 난수
// ---------------------------------------------------------------------------

export type Rand = () => number;
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(arr: readonly T[], rand: Rand): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

export const DIRS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

function rot1(q: number, r: number): [number, number] {
  return [-r, q + r];
}

/** 패턴의 서로 다른 회전들 (대칭이면 줄어든다) */
export function rotations(pattern: [number, number, number][], allow: boolean): [number, number, number][][] {
  const out: [number, number, number][][] = [];
  const seen = new Set<string>();
  let cur = pattern.map((x) => [...x] as [number, number, number]);
  for (let k = 0; k < (allow ? 6 : 1); k++) {
    const key = cur
      .map((x) => x.join(','))
      .sort()
      .join(';');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(cur);
    }
    cur = cur.map(([q, r, v]) => {
      const [a, b] = rot1(q, r);
      return [a, b, v] as [number, number, number];
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 보드
// ---------------------------------------------------------------------------

export interface BoardGeo {
  n: number;
  q: Int16Array;
  r: Int16Array;
  terrain: Uint8Array;
  tile: Int16Array;
  tileCount: number;
  nb: number[][];
  edge: boolean[];
  /** (q,r) → 칸 번호 (없으면 −1) */
  at: (q: number, r: number) => number;
  entrances: number[];
  /** 칸별 거리 2 이내 (자기 제외) */
  within2: number[][];
  /** 칸별 방향별 직선 칸 (보드 밖에서 끊김) */
  lines: number[][][];
}

export function buildBoard(rules: LabRules, players: number, rand: Rand): BoardGeo {
  const layout = layoutFor(players);
  const lib = shuffle(
    rules.tiles.map((_, i) => i),
    rand,
  );
  let li = 0;
  const cells: { q: number; r: number; t: number; tile: number }[] = [];
  const entrances: { q: number; r: number }[] = [];
  layout.centers.forEach((c, t) => {
    const seat = layout.entranceTiles.indexOf(t);
    const spec = seat >= 0 ? rules.entranceTile : (rules.tiles[lib[li++ % lib.length] as number] as [number, number][]);
    const rot = Math.floor(rand() * 6);
    const slots = new Array(7).fill(EMPTY);
    for (const [slot, terr] of spec) slots[slot === 0 ? 0 : ((slot - 1 + rot) % 6) + 1] = terr;
    const pts = [[c.q, c.r], ...DIRS.map(([dq, dr]) => [c.q + dq, c.r + dr])] as [number, number][];
    pts.forEach(([q, r], s) => cells.push({ q, r, t: slots[s], tile: t }));
    if (seat >= 0) entrances[seat] = { q: c.q, r: c.r };
  });
  cells.sort((a, b) => a.r - b.r || a.q - b.q);
  const n = cells.length;
  const map = new Map<number, number>();
  const key = (q: number, r: number) => (q + 64) * 256 + (r + 64);
  cells.forEach((c, i) => map.set(key(c.q, c.r), i));
  const at = (q: number, r: number) => map.get(key(q, r)) ?? -1;
  const geo: BoardGeo = {
    n,
    q: Int16Array.from(cells.map((c) => c.q)),
    r: Int16Array.from(cells.map((c) => c.r)),
    terrain: Uint8Array.from(cells.map((c) => c.t)),
    tile: Int16Array.from(cells.map((c) => c.tile)),
    tileCount: layout.centers.length,
    nb: [],
    edge: [],
    at,
    entrances: entrances.map((e) => at(e.q, e.r)),
    within2: [],
    lines: [],
  };
  for (let i = 0; i < n; i++) {
    const q = geo.q[i] as number;
    const r = geo.r[i] as number;
    const nb = DIRS.map(([dq, dr]) => at(q + dq, r + dr)).filter((x) => x >= 0);
    geo.nb.push(nb);
    geo.edge.push(nb.length < 6);
    const w: number[] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dq = (geo.q[j] as number) - q;
      const dr = (geo.r[j] as number) - r;
      if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 <= 2) w.push(j);
    }
    geo.within2.push(w);
    geo.lines.push(
      DIRS.map(([dq, dr]) => {
        const l: number[] = [];
        for (let k = 1; k < 12; k++) {
          const x = at(q + dq * k, r + dr * k);
          if (x < 0) break;
          l.push(x);
        }
        return l;
      }),
    );
  }
  return geo;
}

// ---------------------------------------------------------------------------
// 게임 상태
// ---------------------------------------------------------------------------

export interface Move {
  /** 손 카드 번호. −1 = 버리기 */
  hand: number;
  cell: number;
  rot: number;
  /** 씨앗 칸 (없으면 −1) */
  extra: number;
}

export interface TurnRecord {
  seat: number;
  species: number;
  flips: number;
  claims: number;
  discard: boolean;
}

export class Game {
  readonly rules: LabRules;
  readonly P: number;
  readonly geo: BoardGeo;
  readonly speciesIds: number[]; // 이번 판 식물 (rules.species 색인)
  readonly goals: GoalDef[];
  readonly komi: number[];
  /** 좌석별 칸별 큐브 */
  inf: Int16Array[];
  /** 줄다리기: 칸의 큐브 색 (−1 없음) */
  color: Int8Array;
  plant: Int8Array;
  entranceSeat: Int8Array;
  hands: number[][];
  market: number[];
  bag: number[];
  current = 0;
  roundStart = 0;
  round = 1;
  stage: 'take' | 'plant' = 'take';
  stageCount = 0;
  turns = 0;
  plays: number[];
  over = false;
  records: TurnRecord[] = [];
  /** 라운드 끝마다 좌석별 점수 */
  history: number[][] = [];
  /** 되돌리기 기록: [종류, a, b, c] */
  private undo: number[] = [];
  readonly rotCache: [number, number, number][][][];
  /** 줄다리기에서 이번 수로 걷어낸 남의 큐브 수 (지표용) */
  removed = 0;
  /** 공급처 한도 때문에 옮겨 온 큐브 수 (지표용) */
  uprooted = 0;
  /** 좌석별 보드 위 큐브 수 */
  onBoard: number[] = [];

  constructor(rules: LabRules, P: number, seed: number) {
    this.rules = rules;
    this.P = P;
    const rand = mulberry32(seed);
    this.geo = buildBoard(rules, P, rand);
    const n = this.geo.n;
    this.inf = Array.from({ length: P }, () => new Int16Array(n));
    this.onBoard = new Array(P).fill(0);
    this.color = new Int8Array(n).fill(-1);
    this.plant = new Int8Array(n).fill(-1);
    this.entranceSeat = new Int8Array(n).fill(-1);
    this.geo.entrances.forEach((c, s) => (this.entranceSeat[c] = s));
    this.komi = rules.komi[P] ?? new Array(P).fill(0);
    this.rotCache = rules.species.map((sp) => rotations(sp.pattern, rules.rotate));

    // 목표
    const pool = shuffle(rules.goals, rand);
    let goals: GoalDef[] = [];
    for (let tries = 0; tries < 50; tries++) {
      const cand = shuffle(pool, rand).slice(0, rules.goalCount);
      const reserve = cand.some((g) => g.kind === 'reserve');
      const bad = cand.some((g) => g.kind === 'big-garden') && cand.some((g) => g.kind === 'entrance-path');
      if ((!rules.requireReserve || reserve) && !bad) {
        goals = cand;
        break;
      }
    }
    if (!goals.length) goals = pool.slice(0, rules.goalCount);
    this.goals = goals;

    // 이번 판 식물
    const gsize = rules.gardenSize[P] ?? rules.species.length;
    const must = new Set<number>();
    for (const g of goals) if (g.species) must.add(rules.species.findIndex((s) => s.id === g.species));
    if (goals.some((g) => g.kind === 'flower-bed')) {
      const fl = shuffle(
        rules.species.map((s, i) => (s.tags?.includes('flower') ? i : -1)).filter((i) => i >= 0),
        rand,
      );
      if (fl.length && ![...must].some((i) => fl.includes(i))) must.add(fl[0] as number);
    }
    if (goals.some((g) => g.kind === 'forest')) {
      const tr = shuffle(
        rules.species.map((s, i) => (s.tags?.includes('tree') ? i : -1)).filter((i) => i >= 0),
        rand,
      );
      if (tr.length && ![...must].some((i) => tr.includes(i))) must.add(tr[0] as number);
    }
    must.delete(-1);
    const rest = shuffle(
      rules.species.map((_, i) => i).filter((i) => !must.has(i)),
      rand,
    );
    this.speciesIds = [...must, ...rest].slice(0, gsize).sort((a, b) => a - b);

    const copies = rules.copies[P] ?? 4;
    const deck: number[] = [];
    for (const s of this.speciesIds) for (let k = 0; k < copies; k++) deck.push(s);
    this.bag = shuffle(deck, rand);
    this.hands = Array.from({ length: P }, () => []);
    for (let k = 0; k < rules.startHand; k++) for (let s = 0; s < P; s++) this.hands[s]!.push(this.bag.pop() as number);
    this.market = [];
    const m = rules.market[P] ?? P;
    for (let k = 0; k < m && this.bag.length; k++) this.market.push(this.bag.pop() as number);
    this.plays = new Array(P).fill(0);

    // 입구 둘레 큐브
    for (let s = 0; s < P; s++) for (const x of this.geo.nb[this.geo.entrances[s] as number] as number[]) if (this.canHoldRoots(x)) this.addRoots(x, s, rules.entranceRing);
    this.undo.length = 0;
    this.removed = 0;
    this.current = 0;
    this.stage = rules.flow === 'round' ? 'take' : 'take';
  }

  canHoldRoots(c: number): boolean {
    const t = this.geo.terrain[c];
    return (t === EMPTY || t === FERTILE) && this.entranceSeat[c] === -1;
  }

  owner(c: number): number {
    if (!this.canHoldRoots(c)) return -1;
    if (this.rules.mode === 'tug') return this.color[c] as number;
    let best = 0;
    let who = -1;
    let tie = false;
    for (let p = 0; p < this.P; p++) {
      const v = (this.inf[p] as Int16Array)[c] as number;
      if (v > best) {
        best = v;
        who = p;
        tie = false;
      } else if (v === best && v > 0) tie = true;
    }
    return tie ? -1 : who;
  }

  private setInf(s: number, c: number, v: number): void {
    const arr = this.inf[s] as Int16Array;
    this.undo.push(0, s, c, arr[c] as number);
    this.onBoard[s]! += v - (arr[c] as number);
    arr[c] = v;
  }

  /** 공급처 한도 안에서 k 개를 놓을 수 있게 한다. 모자라면 가장 높이 쌓인 내 다른 칸에서 옮겨 온다. 놓을 수 있는 수를 돌려준다 */
  private reserve(s: number, k: number, except: number): number {
    const lim = this.rules.supply?.[this.P] ?? 0;
    if (!lim) return k;
    let avail = lim - (this.onBoard[s] as number);
    const I = this.inf[s] as Int16Array;
    while (avail < k) {
      let best = -1;
      let bv = 0;
      for (let x = 0; x < this.geo.n; x++) {
        if (x === except) continue;
        const v = I[x] as number;
        if (v > bv || (v === bv && v > 0 && best >= 0 && this.plant[best] !== -1 && this.plant[x] === -1)) {
          bv = v;
          best = x;
        }
      }
      if (best < 0) break;
      this.setInf(s, best, bv - 1);
      if (bv - 1 === 0 && this.rules.mode === 'tug') this.setColor(best, -1);
      this.uprooted++;
      avail++;
    }
    return Math.max(0, Math.min(k, avail));
  }
  private setColor(c: number, v: number): void {
    this.undo.push(1, c, this.color[c] as number, 0);
    this.color[c] = v;
  }

  addRoots(c: number, s: number, k: number): void {
    if (k <= 0 || !this.canHoldRoots(c)) return;
    const cap = this.rules.cap || 99;
    if (this.rules.mode === 'sum') {
      const cur = (this.inf[s] as Int16Array)[c] as number;
      const add = this.reserve(s, Math.min(cap, cur + k) - cur, c);
      this.setInf(s, c, cur + add);
      return;
    }
    const h = this.color[c] as number;
    if (h === -1 || h === s) {
      const cur = (this.inf[s] as Int16Array)[c] as number;
      const add = this.reserve(s, Math.min(cap, cur + k) - cur, c);
      if (add <= 0) return;
      this.setInf(s, c, cur + add);
      if (h === -1) this.setColor(c, s);
      return;
    }
    const m = (this.inf[h] as Int16Array)[c] as number;
    if (k < m) {
      this.setInf(h, c, m - k);
      this.removed += k;
    } else {
      this.setInf(h, c, 0);
      this.removed += m;
      const rem = k - m;
      const add = rem > 0 ? this.reserve(s, Math.min(cap, rem), c) : 0;
      if (add > 0) {
        this.setInf(s, c, add);
        this.setColor(c, s);
      } else this.setColor(c, -1);
    }
  }

  wither(c: number, s: number, k: number): void {
    if (!this.canHoldRoots(c)) return;
    for (let o = 0; o < this.P; o++) {
      if (o === s) continue;
      const v = (this.inf[o] as Int16Array)[c] as number;
      if (v > 0) {
        const nv = Math.max(0, v - k);
        this.removed += v - nv;
        this.setInf(o, c, nv);
        if (this.rules.mode === 'tug' && nv === 0) this.setColor(c, -1);
      }
    }
  }

  mark(): number {
    return this.undo.length;
  }
  rollback(m: number): void {
    const u = this.undo;
    while (u.length > m) {
      const d = u.pop() as number;
      const cc = u.pop() as number;
      const b = u.pop() as number;
      const kind = u.pop() as number;
      if (kind === 0) {
        const arr = this.inf[b] as Int16Array;
        this.onBoard[b]! += d - (arr[cc] as number);
        arr[cc] = d;
      }
      else if (kind === 1) this.color[b] = cc;
      else if (kind === 2) this.plant[b] = cc;
    }
  }
  commit(): void {
    this.undo.length = 0;
  }

  // -------------------------------------------------------------------------
  // 심기
  // -------------------------------------------------------------------------

  sp(i: number): SpeciesDef {
    return this.rules.species[i] as SpeciesDef;
  }

  isPlantable(c: number): boolean {
    return this.canHoldRoots(c) && this.plant[c] === -1;
  }

  legalCells(s: number, spIdx: number): number[] {
    const out: number[] = [];
    const ab = this.sp(spIdx).ability;
    const g = this.geo;
    for (let c = 0; c < g.n; c++) {
      if (!this.isPlantable(c)) continue;
      if (ab?.kind === 'anywhere') {
        out.push(c);
        continue;
      }
      let ok = false;
      if (this.rules.plantOn === 'own') ok = this.owner(c) === s;
      else if (this.rules.plantOn === 'touch') ok = ((this.inf[s] as Int16Array)[c] as number) >= 1;
      else ok = this.owner(c) === s || (this.owner(c) === -1 && (g.nb[c] as number[]).some((x) => this.owner(x) === s || this.entranceSeat[x] === s));
      if (!ok && ab?.kind === 'pond') ok = (g.nb[c] as number[]).some((x) => g.terrain[x] === POND);
      if (ok) out.push(c);
    }
    return out;
  }

  /** 입구와 맞닿은 빈 칸 (심을 칸이 없을 때 대안) */
  fallbackCells(s: number): number[] {
    const e = this.geo.entrances[s] as number;
    return (this.geo.nb[e] as number[]).filter((x) => this.isPlantable(x));
  }

  extraOptions(spIdx: number, cell: number): number[] {
    const ab = this.sp(spIdx).ability;
    if (ab?.kind !== 'seed') return [-1];
    const base = ab.range === 1 ? (this.geo.nb[cell] as number[]) : (this.geo.within2[cell] as number[]);
    const opts = base.filter((x) => this.canHoldRoots(x));
    return opts.length ? opts : [-1];
  }

  /** 심기를 적용한다 (되돌리기 기록에 남는다). 바뀐 칸 주인 수를 돌려준다 */
  applyPlant(s: number, spIdx: number, c: number, rot: number, extra: number): void {
    const sp = this.sp(spIdx);
    const g = this.geo;
    this.undo.push(2, c, this.plant[c] as number, 0);
    this.plant[c] = spIdx;
    const pat = (this.rotCache[spIdx] as [number, number, number][][])[rot] ?? (this.rotCache[spIdx] as [number, number, number][][])[0]!;
    const q = g.q[c] as number;
    const r = g.r[c] as number;
    const fertile = g.terrain[c] === FERTILE;
    const ab = sp.ability;
    for (const [dq, dr, v] of pat) {
      const t = dq === 0 && dr === 0 ? c : g.at(q + dq, r + dr);
      if (t < 0) continue;
      let k = v;
      if (t === c) {
        if (fertile) k += this.rules.fertileBonus;
        if (ab?.kind === 'cluster') for (const x of g.nb[c] as number[]) if (this.plant[x] === spIdx) k += ab.value;
      } else if (ab?.kind === 'fertileRing' && fertile) k += ab.value;
      this.addRoots(t, s, k);
    }
    if (ab?.kind === 'ivy') for (const x of g.nb[c] as number[]) if (this.plant[x] !== -1) this.addRoots(x, s, ab.value);
    if (ab?.kind === 'wither') for (const x of g.nb[c] as number[]) this.wither(x, s, ab.value);
    if (ab?.kind === 'seed' && extra >= 0) this.addRoots(extra, s, ab.value);
  }

  // -------------------------------------------------------------------------
  // 점수
  // -------------------------------------------------------------------------

  owners(): Int8Array {
    const o = new Int8Array(this.geo.n);
    for (let c = 0; c < this.geo.n; c++) o[c] = this.owner(c);
    return o;
  }

  scores(): number[] {
    const own = this.owners();
    const P = this.P;
    const land = new Array(P).fill(0);
    for (let c = 0; c < this.geo.n; c++) if ((own[c] as number) >= 0) land[own[c] as number]++;
    const total = land.map((x, s) => x + (this.komi[s] ?? 0));
    for (const goal of this.goals) {
      const pts = this.goalPoints(goal, own);
      for (let s = 0; s < P; s++) total[s] += pts[s] as number;
    }
    for (let c = 0; c < this.geo.n; c++) {
      const p = this.plant[c] as number;
      if (p < 0) continue;
      const ab = this.sp(p).ability;
      if (ab?.kind === 'bloom' && (own[c] as number) >= 0) total[own[c] as number] += ab.value;
    }
    return total;
  }

  goalScores(): number[] {
    const own = this.owners();
    const t = new Array(this.P).fill(0);
    for (const goal of this.goals) {
      const pts = this.goalPoints(goal, own);
      for (let s = 0; s < this.P; s++) t[s] += pts[s] as number;
    }
    return t;
  }

  land(): number[] {
    const own = this.owners();
    const land = new Array(this.P).fill(0);
    for (let c = 0; c < this.geo.n; c++) if ((own[c] as number) >= 0) land[own[c] as number]++;
    return land;
  }

  private ranked(values: number[], a: number, b: number): number[] {
    const out = new Array(this.P).fill(0);
    const sorted = [...new Set(values.filter((v) => v > 0))].sort((x, y) => y - x);
    if (!sorted.length) return out;
    const top = sorted[0] as number;
    const tops = values.filter((v) => v === top).length;
    values.forEach((v, s) => {
      if (v === top) out[s] = a;
    });
    if (tops === 1 && sorted.length > 1 && b > 0) values.forEach((v, s) => v === sorted[1] && (out[s] = b));
    return out;
  }

  private groups(own: Int8Array, filter: (c: number) => boolean): { seat: number; size: number; cells: number[] }[] {
    const g = this.geo;
    const seen = new Uint8Array(g.n);
    const out: { seat: number; size: number; cells: number[] }[] = [];
    for (let c = 0; c < g.n; c++) {
      if (seen[c] || !filter(c)) continue;
      const s = own[c] as number;
      if (s < 0) continue;
      const stack = [c];
      seen[c] = 1;
      const cells: number[] = [];
      while (stack.length) {
        const x = stack.pop() as number;
        cells.push(x);
        for (const y of g.nb[x] as number[])
          if (!seen[y] && own[y] === s && filter(y)) {
            seen[y] = 1;
            stack.push(y);
          }
      }
      out.push({ seat: s, size: cells.length, cells });
    }
    return out;
  }

  goalPoints(goal: GoalDef, own: Int8Array): number[] {
    const P = this.P;
    const g = this.geo;
    const pts = new Array(P).fill(0);
    const a = goal.a ?? 0;
    const b = goal.b ?? 0;
    switch (goal.kind) {
      case 'big-garden': {
        const best = new Array(P).fill(0);
        for (const grp of this.groups(own, () => true)) best[grp.seat] = Math.max(best[grp.seat], grp.size);
        return this.ranked(best, a, b);
      }
      case 'pond-side':
        for (let c = 0; c < g.n; c++) if ((own[c] as number) >= 0 && (g.nb[c] as number[]).some((x) => g.terrain[x] === POND)) pts[own[c] as number] += a;
        return pts;
      case 'rock-garden':
        for (let c = 0; c < g.n; c++) if ((own[c] as number) >= 0 && (g.nb[c] as number[]).some((x) => g.terrain[x] === ROCK)) pts[own[c] as number] += a;
        return pts;
      case 'fertile-field':
        for (let c = 0; c < g.n; c++) if ((own[c] as number) >= 0 && g.terrain[c] === FERTILE) pts[own[c] as number] += a;
        return pts;
      case 'edge-fence':
        for (let c = 0; c < g.n; c++) if ((own[c] as number) >= 0 && g.edge[c]) pts[own[c] as number] += a;
        return pts;
      case 'center-plaza': {
        const cnt = new Array(P).fill(0);
        for (let c = 0; c < g.n; c++) if (g.tile[c] === 0 && (own[c] as number) >= 0) cnt[own[c] as number]++;
        return this.ranked(cnt, a, b);
      }
      case 'every-tile': {
        const has = Array.from({ length: P }, () => new Set<number>());
        for (let c = 0; c < g.n; c++) if ((own[c] as number) >= 0) has[own[c] as number]!.add(g.tile[c] as number);
        return has.map((h) => h.size * a);
      }
      case 'tile-majority': {
        // 구역마다 내 땅이 가장 많은 사람(단독) +a
        const cnt = Array.from({ length: g.tileCount }, () => new Array(P).fill(0));
        for (let c = 0; c < g.n; c++) if ((own[c] as number) >= 0) cnt[g.tile[c] as number]![own[c] as number]++;
        for (const row of cnt) {
          const m = Math.max(...row);
          if (m > 0 && row.filter((v) => v === m).length === 1) pts[row.indexOf(m)] += a;
        }
        return pts;
      }
      case 'flower-bed':
        for (let c = 0; c < g.n; c++) {
          const p = this.plant[c] as number;
          if (p >= 0 && (own[c] as number) >= 0 && this.sp(p).tags?.includes('flower')) pts[own[c] as number] += a;
        }
        return pts;
      case 'forest': {
        const isTree = (c: number) => (this.plant[c] as number) >= 0 && !!this.sp(this.plant[c] as number).tags?.includes('tree');
        for (const grp of this.groups(own, isTree)) if (grp.size >= (b || 3)) pts[grp.seat] += a;
        return pts;
      }
      case 'variety': {
        const has = Array.from({ length: P }, () => new Set<number>());
        for (let c = 0; c < g.n; c++) if ((this.plant[c] as number) >= 0 && (own[c] as number) >= 0) has[own[c] as number]!.add(this.plant[c] as number);
        return has.map((h) => (h.size >= (b || 5) ? a : 0));
      }
      case 'reserve': {
        const si = this.rules.species.findIndex((s) => s.id === goal.species);
        for (let c = 0; c < g.n; c++) if (this.plant[c] === si && (own[c] as number) >= 0) pts[own[c] as number] += a;
        return pts;
      }
      case 'deep-roots': {
        // 큐브 3개 이상 쌓인 내 칸 1개당 +a
        for (let c = 0; c < g.n; c++) {
          const s = own[c] as number;
          if (s >= 0 && ((this.inf[s] as Int16Array)[c] as number) >= (b || 3)) pts[s] += a;
        }
        return pts;
      }
      case 'long-path': {
        const best = new Array(P).fill(0);
        for (let c = 0; c < g.n; c++) {
          const s = own[c] as number;
          if (s < 0) continue;
          for (const d of [0, 1, 5]) {
            const back = g.lines[c]![(d + 3) % 6]![0];
            if (back !== undefined && own[back] === s) continue;
            let len = 1;
            for (const x of g.lines[c]![d] as number[]) {
              if (own[x] !== s) break;
              len++;
            }
            best[s] = Math.max(best[s], len);
          }
        }
        return this.ranked(best, a, b);
      }
      case 'entrance-path': {
        // 입구와 이어진 내 땅 칸 수: 1등 a, 2등 b
        const size = new Array(P).fill(0);
        for (let s = 0; s < P; s++) {
          const seen = new Uint8Array(g.n);
          const stack = (g.nb[g.entrances[s] as number] as number[]).filter((x) => own[x] === s);
          stack.forEach((x) => (seen[x] = 1));
          let k = 0;
          while (stack.length) {
            const x = stack.pop() as number;
            k++;
            for (const y of g.nb[x] as number[])
              if (!seen[y] && own[y] === s) {
                seen[y] = 1;
                stack.push(y);
              }
          }
          size[s] = k;
        }
        return this.ranked(size, a, b);
      }
    }
    return pts;
  }

  // -------------------------------------------------------------------------
  // 진행
  // -------------------------------------------------------------------------

  /** 이 차례에 해야 하는 일 */
  needs(): 'take' | 'plant' | 'over' {
    return this.over ? 'over' : this.stage;
  }

  /** 라운드 안 순서 k 번째 자리 */
  private seatAt(k: number): number {
    return (this.roundStart + k) % this.P;
  }

  doTake(idx: number): void {
    const s = this.current;
    if (this.market.length) {
      const i = Math.max(0, Math.min(this.market.length - 1, idx));
      const card = this.market.splice(i, 1)[0] as number;
      this.hands[s]!.push(card);
      if (this.rules.refill === 'refill' && this.bag.length) this.market.push(this.bag.pop() as number);
    }
    if (this.rules.flow === 'turn') {
      this.stage = 'plant';
      return;
    }
    this.stageCount++;
    if (this.stageCount < this.P && this.market.length) {
      this.current = this.seatAt(this.stageCount);
      return;
    }
    this.stage = 'plant';
    this.stageCount = 0;
    this.nextPlanter();
  }

  /** round 흐름 심기 단계: stageCount 부터 손이 있는 다음 자리. 없으면 라운드 끝 */
  private nextPlanter(): void {
    while (this.stageCount < this.P && this.hands[this.seatAt(this.stageCount)]!.length === 0) this.stageCount++;
    if (this.stageCount >= this.P) this.endRound();
    else this.current = this.seatAt(this.stageCount);
  }

  /** turn 흐름: stageCount 부터 둘 수 있는(손이나 마켓이 있는) 다음 자리. 없으면 라운드 끝 */
  private nextTurn(): void {
    while (this.stageCount < this.P && this.hands[this.seatAt(this.stageCount)]!.length === 0 && !this.market.length) this.stageCount++;
    if (this.stageCount >= this.P) this.endRound();
    else {
      this.current = this.seatAt(this.stageCount);
      this.stage = this.market.length ? 'take' : 'plant';
    }
  }

  /** 심기(또는 버리기)를 확정한다. 지표용 기록을 남긴다 */
  doPlant(m: Move): void {
    const s = this.current;
    const before = this.owners();
    let species = -1;
    let discard = false;
    if (m.hand >= 0 && m.cell >= 0) {
      species = this.hands[s]![m.hand] as number;
      this.hands[s]!.splice(m.hand, 1);
      this.applyPlant(s, species, m.cell, m.rot, m.extra);
    } else {
      discard = true;
      const h = Math.max(0, m.hand >= 0 ? m.hand : 0);
      if (this.hands[s]!.length) species = this.hands[s]!.splice(h, 1)[0] as number;
    }
    this.commit();
    const after = this.owners();
    let flips = 0;
    let claims = 0;
    for (let c = 0; c < this.geo.n; c++) {
      if (before[c] === after[c]) continue;
      if (after[c] === s && (before[c] as number) >= 0) flips++;
      else if (after[c] === s) claims++;
      else if ((before[c] as number) >= 0 && before[c] !== s) flips++; // 버섯 등으로 남의 땅을 없앤 것
    }
    this.records.push({ seat: s, species, flips, claims, discard });
    this.plays[s]!++;
    this.turns++;
    this.stageCount++;
    if (this.rules.flow === 'turn') this.nextTurn();
    else this.nextPlanter();
  }

  /** 다음 라운드 선 */
  private pickStart(): number {
    const prev = this.roundStart;
    const P = this.P;
    const rule = this.rules.firstPlayer;
    if (rule === 'fixed') return prev;
    if (rule === 'rotate') return (prev + 1) % P;
    let val: number[];
    if (rule === 'supply') {
      const lim = this.rules.supply?.[P] ?? 0;
      val = this.onBoard.map((v) => -(lim ? v - lim : v)); // 공급처에 남은 큐브가 많을수록 큼
    } else if (rule === 'least-land') val = this.land().map((v) => -v);
    else val = this.scores().map((v) => -v);
    const best = Math.max(...val);
    for (let k = 1; k <= P; k++) {
      const s = (prev + k) % P;
      if (val[s] === best) return s;
    }
    return prev;
  }

  private endRound(): void {
    this.history.push(this.scores());
    if (!this.bag.length && !this.market.length && this.hands.every((h) => h.length === 0)) {
      this.over = true;
      return;
    }
    if (this.rules.refill === 'round' && !this.bag.length && this.hands.every((h) => h.length === 0)) {
      this.over = true;
      return;
    }
    this.round++;
    this.roundStart = this.pickStart();
    this.stageCount = 0;
    if (this.rules.refill === 'round') {
      this.market = [];
      const m = this.rules.market[this.P] ?? this.P;
      for (let k = 0; k < m && this.bag.length; k++) this.market.push(this.bag.pop() as number);
    }
    if (this.rules.flow === 'turn') {
      this.nextTurn();
      return;
    }
    if (this.market.length) {
      this.stage = 'take';
      this.current = this.roundStart;
    } else {
      this.stage = 'plant';
      this.nextPlanter();
    }
  }

  /** 모든 합법 수 (버리기 포함). 같은 종 카드는 하나만 */
  moves(s: number): Move[] {
    const out: Move[] = [];
    const hand = this.hands[s] as number[];
    const seenSp = new Set<number>();
    hand.forEach((sp, hi) => {
      if (seenSp.has(sp)) return;
      seenSp.add(sp);
      let cells = this.legalCells(s, sp);
      if (!cells.length && this.rules.noCell === 'entrance') cells = this.fallbackCells(s);
      const rots = (this.rotCache[sp] as unknown[]).length;
      for (const c of cells) for (let r = 0; r < rots; r++) for (const e of this.extraOptions(sp, c)) out.push({ hand: hi, cell: c, rot: r, extra: e });
    });
    if (!out.length && hand.length) out.push({ hand: 0, cell: -1, rot: 0, extra: -1 });
    return out;
  }

  /** 수를 시험 적용하고 점수를 본 뒤 되돌린다 */
  tryMove(s: number, m: Move, f: () => number): number {
    const mk = this.mark();
    if (m.cell >= 0) this.applyPlant(s, this.hands[s]![m.hand] as number, m.cell, m.rot, m.extra);
    const v = f();
    this.rollback(mk);
    return v;
  }

  winner(): number {
    const sc = this.scores();
    const land = this.land();
    const pl = this.plantsOnLand();
    const key = (s: number) => [sc[s] as number, land[s] as number, pl[s] as number, s];
    let best = 0;
    for (let s = 1; s < this.P; s++) {
      const a = key(s);
      const b = key(best);
      for (let i = 0; i < 4; i++) {
        if ((a[i] as number) > (b[i] as number)) {
          best = s;
          break;
        }
        if ((a[i] as number) < (b[i] as number)) break;
      }
    }
    return best;
  }

  /** 좌석별: 내 땅 위에 서 있는 식물 수 (동점 깨기) */
  plantsOnLand(): number[] {
    const own = this.owners();
    const out = new Array(this.P).fill(0);
    for (let c = 0; c < this.geo.n; c++) if (this.plant[c] !== -1 && (own[c] as number) >= 0) out[own[c] as number]++;
    return out;
  }

  /** 줄다리기 공급처 확인용: 좌석별 보드 위 큐브 수 */
  cubesOnBoard(): number[] {
    return this.inf.map((a) => a.reduce((x, y) => x + y, 0));
  }
}
