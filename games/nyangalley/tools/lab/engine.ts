/**
 * 오프라인판 규칙 실험실 엔진 (2026-10-16). 정본 엔진(shared/src/engine)과 별개로, 규칙 후보를 설정값으로 바꿔 가며
 * 빠르게 시뮬레이션한다. 상태는 가변 배열 + 되돌리기 기록(undo)이라 봇이 수를 수천 번 시험해도 빠르다.
 *
 * 핵심 모델: 영향력 = 칸 위에 놓인 "뿌리 큐브". 심을 때 카드에 그려진 뿌리 모양대로 큐브를 놓고, 그 뒤로는 저절로 바뀌지 않는다.
 *  - mode 'tug'  : 줄다리기. 한 칸에는 한 색만. 남의 큐브가 있는 칸에 뿌리를 뻗으면 1:1로 걷어내고 남는 만큼 내 큐브를 놓는다.
 *  - mode 'sum'  : 색마다 따로 쌓고, 가장 많은 색 하나(엄격한 1등)가 주인 (예전 규칙과 같은 다수결).
 */
import { DIRECTIONS, layoutFor } from '../../src/engine/board.js';

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
  | { kind: 'bloom'; value: number };

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
  | 'long-path';

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
  /** 라운드 선: 'fixed' 고정, 'rotate' 시계방향 돌리기, 'supply' 공급처에 큐브가 가장 많이 남은 사람, 'lowest' 점수가 가장 낮은 사람 */
  firstPlayer: 'rotate' | 'fixed' | 'supply' | 'lowest';
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
  /** 가져오기에서 마켓 대신 카드 더미 맨 위 1장(뒷면)을 가져올 수 있나 (take = -1) */
  blindDraw?: boolean;
  /** 인원별 1인 뿌리 큐브 수 (0/없음 = 무제한). 모자라면 가장 높이 쌓인 내 칸에서 옮겨 온다 */
  supply?: Record<number, number>;
  /** 독창성 체크리스트에 더할 고유 장치 이름 */
  hooks?: string[];
  /** 규칙 짐에 더할 추가 규칙 이름 */
  extraRules?: string[];
  /**
   * 계절 결산 (2026-11-26 「세 번 피는 정원」 실험). ends[P] = 계절이 끝나는 라운드 번호(마지막은 게임 끝).
   * 계절 i 가 끝나면 목표 i 번(goalTiming 'season')과 개화(내 땅 위 식물 1개당 bloom 점)를 쌓는다.
   * goalTiming 'end' 이면 목표는 예전처럼 끝에 한 번에 센다.
   */
  seasons?: { ends: Record<number, number[]>; bloom: number; goalTiming: 'season' | 'end'; reveal?: 'all' | 'season' };
  /**
   * 행동 고르기 (2026-11-26 사용자 요청 A안). 차례마다 ① 명당 놓기(가져오기 + 심기) ② 담 넘기(내 칸 하나에서 고양이 최대 move 마리를
   * 맞닿은 칸 하나로 옮김, 남의 칸이면 1:1 쫓아내기) ③ 모여라(쉬는 고양이 최대 gather 마리를 내 칸에 나눠 앉힘, 한 칸 최대 perCell) 중 하나.
   * 끝은 rounds[P] 라운드(주머니가 남아도 끝난다). gatherTake: 모여라 때 타일도 1개 가져온다(손 한도 handMax).
   * noRepeat: 직전 내 차례와 같은 행동은 할 수 없다
   */
  /**
   * 골목 일과 (2026-11-26 C안). 라운드마다 set 에서 (인원 + 1)장을 펼치고 선부터 1장씩 고른 뒤, 차례대로 고른 일과를 한다.
   * 일과: bread 식빵 굽기(놓기 + 놓은 칸 고양이 +1) · peek 생선 냄새(펼친 타일 2개를 다 가져와 1개 놓기) · roam 마실(떨어진 빈 칸에도 놓기)
   *       move 담 넘기(놓지 않고 고양이 최대 2마리 이동) · call 명당 부르기(놓지 않고 내 영역 명당의 모양대로 다시 부르기) · boss 대장 방울(놓기 + 다음 선)
   * 끝은 actions.rounds. 행동 고르기(actions)와 함께 켠다(차례 흐름·이동은 actions 의 것을 쓴다)
   */
  chores?: { set: ChoreId[]; reveal?: Record<number, number>; peekMode?: 'hand2' | 'look3'; callBonus?: number; breadBonus?: number; callTurn?: boolean; roamRange?: number; callTake?: boolean };
  /**
   * 행동 하나 (2026-11-27 사용자 제안). 일과 없이 차례마다 ① 가져오기(타일 take 장, 펼친 타일·주머니 맨 위에서 1장씩, 손 최대 handMax)
   * ② 놓기(손 1장, 가져오기 없음) ③ 부르기(call: 내 칸 위 명당을 돌려 다시 놓기, 놓인 칸 +callBonus) 중 하나. 끝은 actions.rounds
   */
  one?: { take: number; handMax: number; call: boolean; callBonus?: number; callTurn?: boolean; callOnce?: boolean; /** 'split' = 펼친 타일 1장 또는 주머니 take 장, 'peek' = 펼친 타일 1장 또는 주머니 2장을 펼쳐 1장 고르기(남은 1장은 주머니 맨 아래)(2026-11-27 사용자 제안) */ takeMode?: 'mix' | 'split' | 'peek' | 'draft' };
  actions?: { move: number; gather: number; perCell: number; rounds: Record<number, number>; gatherTake?: boolean; handMax?: number; noRepeat?: boolean; gatherMode?: 'supply' | 'regroup' | 'nap'; noRelocate?: boolean; moveTimes?: number };
}

export type ChoreId = 'bread' | 'peek' | 'roam' | 'move' | 'call' | 'boss';
export const PLACE_CHORES: readonly ChoreId[] = ['bread', 'peek', 'roam', 'boss'];

export type TurnAction =
  | { kind: 'take2'; picks: number[]; /** picks [-2](주머니 2장 펼쳐 고르기)일 때 고를 카드 번호 */ choose?: (cards: number[]) => number }
  | { kind: 'plant' }
  | { kind: 'pass' }
  | { kind: 'call'; cell: number; rot?: number }
  | { kind: 'place'; take: number }
  | { kind: 'move'; from: number; to: number; k: number; then?: { from: number; to: number; k: number } }
  | { kind: 'gather'; cells: number[] };

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

/** 육각 6방향 (정본 board.ts DIRECTIONS) */
const DIRS = DIRECTIONS;

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
  // 4인은 정본처럼 모두 빈 땅인 13번 조각을 더한다 (Rules.md 3.2, src/engine/data/tiles.ts FOUR_PLAYER_TILE)
  const tiles = players === 4 ? [...rules.tiles, []] : rules.tiles;
  const lib = shuffle(
    tiles.map((_, i) => i),
    rand,
  );
  let li = 0;
  const cells: { q: number; r: number; t: number; tile: number }[] = [];
  const entrances: { q: number; r: number }[] = [];
  layout.centers.forEach((c, t) => {
    const seat = layout.entranceTiles.indexOf(t);
    const spec = seat >= 0 ? rules.entranceTile : (tiles[lib[li++ % lib.length] as number] as [number, number][]);
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
  /** 자리별 칸별 큐브 */
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
  stage: 'take' | 'plant' | 'draft' = 'take';
  /** 일과: 이번 라운드 펼친 일과, 자리별 고른 일과, 대장 방울로 정한 다음 선 */
  offer: ChoreId[] = [];
  choreOf: (ChoreId | null)[] = [];
  nextFirst = -1;
  choreRand: Rand = () => 0;
  /** 식물 칸의 회전 번호(rotCache 색인). 명당 부르기에 쓴다 */
  plantRot: Int8Array = new Int8Array(0);
  /** 일과 고르기 기록 (지표): 고를 때 남아 있던 일과, 고른 일과, 몇 번째로 골랐나 */
  draftLog: { seat: number; offered: ChoreId[]; chose: ChoreId; pickNo: number }[] = [];
  /** 일과별 고른 횟수 (지표) */
  choreCount: Record<string, number> = {};
  stageCount = 0;
  turns = 0;
  plays: number[];
  over = false;
  records: TurnRecord[] = [];
  /** 라운드 끝마다 자리별 점수 */
  history: number[][] = [];
  /** 되돌리기 기록: [종류, a, b, c] */
  private undo: number[] = [];
  readonly rotCache: [number, number, number][][][];
  /** 자리별 보드 위 큐브 수 */
  onBoard: number[] = [];
  /** 계절 결산으로 쌓은 점수 (목표 몫 / 개화 몫) */
  bankGoal: number[] = [];
  bankBloom: number[] = [];
  /** 지금 계절 번호 (0부터). 계절 규칙이 없으면 0 */
  season = 0;

  constructor(rules: LabRules, P: number, seed: number) {
    this.rules = rules;
    this.P = P;
    const rand = mulberry32(seed);
    this.geo = buildBoard(rules, P, rand);
    const n = this.geo.n;
    this.inf = Array.from({ length: P }, () => new Int16Array(n));
    this.onBoard = new Array(P).fill(0);
    this.bankGoal = new Array(P).fill(0);
    this.bankBloom = new Array(P).fill(0);
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
      if (!rules.requireReserve || reserve) {
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
    this.current = 0;
    this.plantRot = new Int8Array(this.geo.n);
    if (rules.chores) {
      this.choreRand = mulberry32((seed ^ 0x2545f491) >>> 0);
      this.choreOf = new Array(P).fill(null);
      this.startDraft();
    }
  }

  // -------------------------------------------------------------------------
  // 골목 일과 (chores)
  // -------------------------------------------------------------------------

  private startDraft(): void {
    const c = this.rules.chores!;
    const n = c.reveal?.[this.P] ?? this.P + 1;
    this.offer = shuffle(c.set, this.choreRand).slice(0, n);
    this.choreOf = new Array(this.P).fill(null);
    this.stage = 'draft';
    this.stageCount = 0;
    this.current = this.roundStart;
  }

  /** 지금 자리가 펼친 일과 i 번을 고른다 */
  doDraft(i: number): void {
    const k = Math.max(0, Math.min(this.offer.length - 1, i));
    this.draftLog.push({ seat: this.current, offered: [...this.offer], chose: this.offer[k] as ChoreId, pickNo: this.stageCount });
    const ch = this.offer.splice(k, 1)[0] as ChoreId;
    this.choreOf[this.current] = ch;
    this.choreCount[ch] = (this.choreCount[ch] ?? 0) + 1;
    if (ch === 'boss') this.nextFirst = this.current;
    this.stageCount++;
    if (this.stageCount < this.P) {
      this.current = this.seatAt(this.stageCount);
      return;
    }
    this.stage = 'take';
    this.stageCount = 0;
    this.current = this.roundStart;
  }

  /** 명당 부르기 후보: 내 영역 위 식물 칸 */
  callOptions(s: number): number[] {
    const out: number[] = [];
    for (let c = 0; c < this.geo.n; c++) if (this.plant[c] !== -1 && this.owner(c) === s && !(this.rules.one?.callOnce && this.called.has(c))) out.push(c);
    return out;
  }

  /** 이번 판에 부른 명당 칸 (one.callOnce) */
  called = new Set<number>();

  /** 명당 부르기 적용: 그 칸 식물의 뿌리 모양(놓인 방향)대로 다시 (능력 없음) */
  applyCall(s: number, cell: number, rot?: number): void {
    const spIdx = this.plant[cell] as number;
    if (spIdx < 0) return;
    const cfg = this.rules.chores ?? this.rules.one;
    if (rot !== undefined && cfg?.callTurn) {
      this.undo.push(3, cell, this.plantRot[cell] as number, 0);
      this.plantRot[cell] = rot;
    }
    const pat = (this.rotCache[spIdx] as [number, number, number][][])[this.plantRot[cell] as number] ?? (this.rotCache[spIdx] as [number, number, number][][])[0]!;
    const q = this.geo.q[cell] as number;
    const r = this.geo.r[cell] as number;
    const batch: [number, number][] = [];
    for (const [dq, dr, v] of pat) {
      const t = dq === 0 && dr === 0 ? cell : this.geo.at(q + dq, r + dr);
      if (t >= 0) batch.push([t, t === cell ? v + (cfg?.callBonus ?? 0) : v]);
    }
    this.received.clear();
    this.placeBatch(batch, s);
    this.received.clear();
  }

  /** 생선 냄새(look3): 주머니 맨 위 1개를 펼친 타일 옆에 잠깐 편다 */
  peekOpen(): void {
    if (this.bag.length) this.market.push(this.bag.pop() as number);
  }
  /** 생선 냄새(look3): 가져온 뒤 펼친 타일이 원래 수보다 많으면 남는 것을 주머니 맨 위로 되돌린다 */
  peekClose(): void {
    const m = this.rules.market[this.P] ?? 2;
    while (this.market.length > m) this.bag.push(this.market.pop() as number);
  }

  /** 생선 냄새: 펼친 타일을 하나 더 손에 (가져오기 뒤) */
  takeExtra(): void {
    const s = this.current;
    if (!this.market.length) return;
    this.hands[s]!.push(this.market.shift() as number);
    if (this.bag.length) this.market.push(this.bag.pop() as number);
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
  /** 이번 차례에 큐브를 받는 칸 (옮겨 오지 않는다). placeBatch 가 채운다 */
  private received = new Set<number>();
  private reserve(s: number, k: number, except: number): number {
    const lim = this.rules.supply?.[this.P] ?? 0;
    if (!lim) return k;
    let avail = lim - (this.onBoard[s] as number);
    const I = this.inf[s] as Int16Array;
    if (this.rules.actions?.noRelocate) return Math.max(0, Math.min(k, avail));
    while (avail < k) {
      let best = -1;
      let bv = 0;
      for (let x = 0; x < this.geo.n; x++) {
        if (x === except || this.received.has(x)) continue;
        const v = I[x] as number;
        if (v > bv || (v === bv && v > 0 && best >= 0 && this.plant[best] !== -1 && this.plant[x] === -1)) {
          bv = v;
          best = x;
        }
      }
      if (best < 0) break;
      this.setInf(s, best, bv - 1);
      if (bv - 1 === 0 && this.rules.mode === 'tug') this.setColor(best, -1);
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
    } else {
      this.setInf(h, c, 0);
      const rem = k - m;
      const add = rem > 0 ? this.reserve(s, Math.min(cap, rem), c) : 0;
      if (add > 0) {
        this.setInf(s, c, add);
        this.setColor(c, s);
      } else this.setColor(c, -1);
    }
  }

  /**
   * 뿌리 한 묶음 (정본 influence.ts placeRoots 와 같다, 2026-11-26). 걷어 내기를 모두 한 뒤 남은 뿌리를 놓는다.
   * 모자라면 이번 차례에 큐브를 받는 칸을 뺀 내 칸에서 옮겨 온다. tug 모드 전용(sum 모드는 칸마다 addRoots)
   */
  placeBatch(targets: [number, number][], s: number): void {
    if (this.rules.mode !== 'tug') {
      for (const [c, k] of targets) this.addRoots(c, s, k);
      return;
    }
    const cap = this.rules.cap || 99;
    const rest: [number, number][] = [];
    for (const [c, k] of targets) {
      if (k <= 0 || !this.canHoldRoots(c)) continue;
      const h = this.color[c] as number;
      if (h === -1 || h === s) {
        rest.push([c, k]);
        continue;
      }
      const m = (this.inf[h] as Int16Array)[c] as number;
      if (k < m) this.setInf(h, c, m - k);
      else {
        this.setInf(h, c, 0);
        this.setColor(c, -1);
        if (k > m) rest.push([c, k - m]);
      }
    }
    for (const [c] of rest) this.received.add(c);
    let need = 0;
    const want = rest.map(([c, k]) => {
      const cur = (this.inf[s] as Int16Array)[c] as number;
      const w = Math.max(0, Math.min(cap, cur + k) - cur);
      need += w;
      return w;
    });
    let avail = this.reserve(s, need, -1);
    rest.forEach(([c], i) => {
      const k = Math.min(want[i] as number, avail);
      if (k <= 0) return;
      const cur = (this.inf[s] as Int16Array)[c] as number;
      this.setInf(s, c, cur + k);
      if (this.color[c] !== s) this.setColor(c, s);
      avail -= k;
    });
  }

  wither(c: number, s: number, k: number): void {
    if (!this.canHoldRoots(c)) return;
    for (let o = 0; o < this.P; o++) {
      if (o === s) continue;
      const v = (this.inf[o] as Int16Array)[c] as number;
      if (v > 0) {
        const nv = Math.max(0, v - k);
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
      else if (kind === 3) this.plantRot[b] = cc;
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
      let ok: boolean;
      if (this.rules.plantOn === 'own') ok = this.owner(c) === s;
      else if (this.rules.plantOn === 'touch') ok = ((this.inf[s] as Int16Array)[c] as number) >= 1;
      else ok = this.owner(c) === s || (this.owner(c) === -1 && (g.nb[c] as number[]).some((x) => this.owner(x) === s || this.entranceSeat[x] === s));
      if (!ok && this.rules.chores && this.choreOf[s] === 'roam' && this.owner(c) === -1) {
        const rr = this.rules.chores.roamRange ?? 0;
        ok = rr <= 0 || (g.within2[c] as number[]).some((x) => this.owner(x) === s) || (rr > 2);
      }
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

  /** 심기를 적용한다 (되돌리기 기록에 남는다) */
  applyPlant(s: number, spIdx: number, c: number, rot: number, extra: number): void {
    const sp = this.sp(spIdx);
    const g = this.geo;
    this.undo.push(2, c, this.plant[c] as number, 0);
    this.plant[c] = spIdx;
    this.undo.push(3, c, this.plantRot[c] as number, 0);
    this.plantRot[c] = rot;
    const pat = (this.rotCache[spIdx] as [number, number, number][][])[rot] ?? (this.rotCache[spIdx] as [number, number, number][][])[0]!;
    const q = g.q[c] as number;
    const r = g.r[c] as number;
    const fertile = g.terrain[c] === FERTILE;
    const ab = sp.ability;
    this.received.clear();
    const batch: [number, number][] = [];
    for (const [dq, dr, v] of pat) {
      const t = dq === 0 && dr === 0 ? c : g.at(q + dq, r + dr);
      if (t < 0) continue;
      let k = v;
      if (t === c) {
        if (fertile) k += this.rules.fertileBonus;
        if (ab?.kind === 'cluster') for (const x of g.nb[c] as number[]) if (this.plant[x] === spIdx) k += ab.value;
      } else if (ab?.kind === 'fertileRing' && fertile) k += ab.value;
      batch.push([t, k]);
    }
    if (this.rules.chores && this.choreOf[s] === 'bread') {
      const first = batch.find(([t]) => t === c);
      const bb = this.rules.chores.breadBonus ?? 1;
      if (first) first[1] += bb;
      else batch.unshift([c, bb]);
    }
    this.placeBatch(batch, s);
    if (ab?.kind === 'ivy') for (const x of g.nb[c] as number[]) if (this.plant[x] !== -1) this.addRoots(x, s, ab.value);
    if (ab?.kind === 'wither') for (const x of g.nb[c] as number[]) this.wither(x, s, ab.value);
    if (ab?.kind === 'seed' && extra >= 0) this.placeBatch([[extra, ab.value]], s);
    this.received.clear();
  }

  // -------------------------------------------------------------------------
  // 점수
  // -------------------------------------------------------------------------

  owners(): Int8Array {
    const o = new Int8Array(this.geo.n);
    for (let c = 0; c < this.geo.n; c++) o[c] = this.owner(c);
    return o;
  }

  /** 계절 규칙에서 아직 세지 않은 목표 번호들 */
  private openGoals(): number[] {
    const ss = this.rules.seasons;
    if (!ss || ss.goalTiming === 'end') return this.goals.map((_, i) => i);
    const out: number[] = [];
    for (let i = this.season; i < this.goals.length; i++) out.push(i);
    return out;
  }

  /** 남은 개화 횟수 (지금 계절 포함) */
  private bloomsLeft(): number {
    const ss = this.rules.seasons;
    if (!ss || this.over) return 0;
    return (ss.ends[this.P]?.length ?? 3) - this.season;
  }

  scores(): number[] {
    const own = this.owners();
    const P = this.P;
    const land = new Array(P).fill(0);
    for (let c = 0; c < this.geo.n; c++) if ((own[c] as number) >= 0) land[own[c] as number]++;
    const total = land.map((x, s) => x + (this.komi[s] ?? 0) + (this.bankGoal[s] as number) + (this.bankBloom[s] as number));
    for (const gi of this.openGoals()) {
      // 계절 공개 방식이면 아직 안 보인 목표는 평가하지 않는다 (지금 계절 목표만)
      if (this.rules.seasons?.reveal === 'season' && this.rules.seasons.goalTiming === 'season' && gi > this.season) continue;
      const pts = this.goalPoints(this.goals[gi] as GoalDef, own);
      for (let s = 0; s < P; s++) total[s] += pts[s] as number;
    }
    const bl = this.bloomsLeft();
    if (bl > 0) {
      // 봇 평가용 예상: 지금 계절 개화는 그대로, 뒤 계절 개화는 절반만 친다
      const w = this.rules.seasons!.bloom * (1 + 0.5 * (bl - 1));
      for (let c = 0; c < this.geo.n; c++) if (this.plant[c] !== -1 && (own[c] as number) >= 0) total[own[c] as number] += w;
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
    const t = [...this.bankGoal];
    for (const gi of this.openGoals()) {
      const pts = this.goalPoints(this.goals[gi] as GoalDef, own);
      for (let s = 0; s < this.P; s++) t[s] = (t[s] as number) + (pts[s] as number);
    }
    return t;
  }

  /** 계절 결산: 지금 계절 목표와 개화를 쌓는다 */
  private settleSeason(): void {
    const ss = this.rules.seasons!;
    const own = this.owners();
    if (ss.goalTiming === 'season') {
      const goal = this.goals[this.season];
      if (goal) {
        const pts = this.goalPoints(goal, own);
        for (let s = 0; s < this.P; s++) this.bankGoal[s]! += pts[s] as number;
      }
    }
    for (let c = 0; c < this.geo.n; c++) if (this.plant[c] !== -1 && (own[c] as number) >= 0) this.bankBloom[own[c] as number]! += ss.bloom;
    this.season++;
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
    }
    return pts;
  }

  // -------------------------------------------------------------------------
  // 진행
  // -------------------------------------------------------------------------

  /** 이 차례에 해야 하는 일 */
  needs(): 'take' | 'plant' | 'draft' | 'over' {
    return this.over ? 'over' : this.stage;
  }

  /** 라운드 안 순서 k 번째 자리 */
  private seatAt(k: number): number {
    return (this.roundStart + k) % this.P;
  }

  /** idx = -1: 카드 더미 맨 위 1장 (blindDraw) */
  doTake(idx: number): void {
    const s = this.current;
    if (idx === -1 && this.rules.blindDraw && this.bag.length) this.hands[s]!.push(this.bag.pop() as number);
    else if (this.market.length) {
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
    if (this.rules.actions) {
      if (this.stageCount >= this.P) this.endRound();
      else {
        this.current = this.seatAt(this.stageCount);
        this.stage = 'take';
      }
      return;
    }
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
    this.actionCount.place++;
    if (this.lastAction[s] === 'place') this.sameAsLast++;
    this.lastAction[s] = 'place';
    this.plays[s]!++;
    this.turns++;
    this.stageCount++;
    if (this.rules.flow === 'turn') this.nextTurn();
    else this.nextPlanter();
  }

  /** s 가 볼 때 아직 보지 못한 카드(더미 + 남의 손) 종별 장수: 전체 − 심거나 버린 카드 − 마켓 − 내 손 */
  unseen(s: number): Map<number, number> {
    const copies = this.rules.copies[this.P] ?? 4;
    const m = new Map<number, number>(this.speciesIds.map((x) => [x, copies]));
    const dec = (x: number) => m.set(x, (m.get(x) ?? 0) - 1);
    for (const r of this.records) if (r.species >= 0) dec(r.species);
    for (const x of this.market) dec(x);
    for (const x of this.hands[s] as number[]) dec(x);
    for (const [k, v] of m) if (v <= 0) m.delete(k);
    return m;
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
    } else val = this.scores().map((v) => -v);
    const best = Math.max(...val);
    for (let k = 1; k <= P; k++) {
      const s = (prev + k) % P;
      if (val[s] === best) return s;
    }
    return prev;
  }

  private endRound(): void {
    const ss = this.rules.seasons;
    const last = !this.bag.length && !this.market.length && this.hands.every((h) => h.length === 0);
    if (ss) {
      const ends = ss.ends[this.P] ?? [];
      if (last) {
        while (this.season < ends.length) this.settleSeason();
      } else if (ends.includes(this.round)) this.settleSeason();
    }
    const roundsCap = this.rules.actions?.rounds[this.P];
    if (last || (roundsCap && this.round >= roundsCap)) {
      if (ss) while (this.season < (ss.ends[this.P]?.length ?? 0)) this.settleSeason();
      this.over = true;
      this.history.push(this.scores());
      return;
    }
    this.history.push(this.scores());
    if (this.rules.refill === 'round' && !this.bag.length && this.hands.every((h) => h.length === 0)) {
      this.over = true;
      return;
    }
    this.round++;
    this.roundStart = this.nextFirst >= 0 && this.rules.chores ? this.nextFirst : this.pickStart();
    this.nextFirst = -1;
    this.stageCount = 0;
    if (this.rules.chores) {
      this.startDraft();
      return;
    }
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

  // -------------------------------------------------------------------------
  // 행동 고르기 (actions)
  // -------------------------------------------------------------------------

  /** 담 넘기 후보: [출발 칸, 도착 칸, 마릿수] */
  moveOptions(s: number): [number, number, number][] {
    const a = this.rules.actions;
    if (!a || a.move <= 0 || (this.lastAction[s] === 'move' && a.noRepeat)) return [];
    const out: [number, number, number][] = [];
    const I = this.inf[s] as Int16Array;
    for (let c = 0; c < this.geo.n; c++) {
      if (this.owner(c) !== s) continue;
      const have = I[c] as number;
      for (const t of this.geo.nb[c] as number[]) {
        if (!this.canHoldRoots(t)) continue;
        for (let k = 1; k <= Math.min(a.move, have); k++) out.push([c, t, k]);
      }
    }
    return out;
  }

  /** 이번 차례에 고를 수 있는 행동인가 (직전 행동 반복 금지 규칙) */
  canDo(s: number, kind: 'place' | 'move' | 'gather' | 'call'): boolean {
    if (this.rules.one) {
      if (kind === 'place') return (this.hands[s] as number[]).length > 0;
      if (kind === 'call') return this.rules.one.call;
      return false;
    }
    if (this.rules.chores) {
      const ch = this.choreOf[s];
      if (kind === 'place') return !!ch && PLACE_CHORES.includes(ch);
      if (kind === 'move') return ch === 'move';
      if (kind === 'call') return ch === 'call';
      return false;
    }
    const a = this.rules.actions;
    if (kind === 'call') return false;
    if (!a) return kind === 'place';
    return !(a.noRepeat && this.lastAction[s] === kind);
  }

  /** 쉬는 고양이 수 */
  supplyOf(s: number): number {
    const lim = this.rules.supply?.[this.P] ?? 0;
    return lim ? lim - (this.onBoard[s] as number) : 99;
  }

  /** 담 넘기 적용 (되돌리기 기록에 남는다): 출발 칸에서 k 마리를 들어 도착 칸으로 (쫓아내기 → 앉히기) */
  applyMove(s: number, from: number, to: number, k: number): void {
    const I = this.inf[s] as Int16Array;
    const have = I[from] as number;
    const n = Math.min(k, have);
    this.setInf(s, from, have - n);
    if (have - n === 0 && this.rules.mode === 'tug') this.setColor(from, -1);
    this.received.clear();
    this.received.add(from);
    this.placeBatch([[to, n]], s);
    this.received.clear();
  }

  /** 재배치(gatherMode 'regroup') 1마리: 내 칸 from 에서 내 다른 칸 to 로 (쫓아내기 없음) */
  applyRegroup(s: number, from: number, to: number): void {
    const I = this.inf[s] as Int16Array;
    if (from === to || this.owner(from) !== s || this.owner(to) !== s || (I[from] as number) < 1) return;
    this.setInf(s, from, (I[from] as number) - 1);
    if ((I[from] as number) === 0 && this.rules.mode === 'tug') this.setColor(from, -1);
    this.setInf(s, to, (I[to] as number) + 1);
  }

  /** 모여라 적용: cells 에 1마리씩 (쉬는 고양이만큼만). 재배치 모드면 cells = [from, to, from, to …] */
  applyGather(s: number, cells: number[]): void {
    if (this.rules.actions?.gatherMode === 'nap') {
      // 낮잠: 나열한 내 칸에서 1마리씩 쉬는 고양이로
      const I = this.inf[s] as Int16Array;
      for (const c of cells) {
        if (this.owner(c) !== s || (I[c] as number) < 1) continue;
        this.setInf(s, c, (I[c] as number) - 1);
        if ((I[c] as number) === 0 && this.rules.mode === 'tug') this.setColor(c, -1);
      }
      return;
    }
    if (this.rules.actions?.gatherMode === 'regroup') {
      for (let i = 0; i + 1 < cells.length; i += 2) this.applyRegroup(s, cells[i] as number, cells[i + 1] as number);
      return;
    }
    const I = this.inf[s] as Int16Array;
    let left = Math.min(cells.length, this.supplyOf(s));
    for (const c of cells) {
      if (left <= 0) break;
      if (this.owner(c) !== s) continue;
      this.setInf(s, c, (I[c] as number) + 1);
      left--;
    }
  }

  private applyCallTurn(cell: number, rot?: number): void {
    const s = this.current;
    const before = this.owners();
    this.applyCall(s, cell, rot);
    if (this.rules.one?.callOnce) this.called.add(cell);
    if (this.rules.chores?.callTake && this.market.length && this.hands[s]!.length < 3) {
      this.hands[s]!.push(this.market.shift() as number);
      if (this.bag.length) this.market.push(this.bag.pop() as number);
    }
    this.commit();
    const after = this.owners();
    let flips = 0;
    let claims = 0;
    for (let c = 0; c < this.geo.n; c++) {
      if (before[c] === after[c]) continue;
      if (after[c] === s && (before[c] as number) >= 0) flips++;
      else if (after[c] === s) claims++;
      else if ((before[c] as number) >= 0 && before[c] !== s) flips++;
    }
    this.records.push({ seat: s, species: -1, flips, claims, discard: false });
    this.actionCount.call = (this.actionCount.call ?? 0) + 1;
    this.plays[s]!++;
    this.turns++;
    this.stageCount++;
    this.nextTurn();
  }

  /** 행동별 횟수 (지표) */
  actionCount: Record<'place' | 'move' | 'gather' | 'call' | 'take', number> = { place: 0, move: 0, gather: 0, call: 0, take: 0 };

  /** 행동 하나(one): 가져오기 차례. picks = 펼친 타일의 종 번호(그 종이 펼친 타일에 있으면) 또는 −1(주머니 맨 위) */
  /** 자리별 가져오기 종류 횟수 (지표): 펼친 타일 / 주머니 */
  takeMarket: number[] = [0, 0, 0, 0];
  takePile: number[] = [0, 0, 0, 0];

  doTakeCards(picks: number[], choose?: (cards: number[]) => number): void {
    const s = this.current;
    const max = this.rules.one?.handMax ?? 3;
    if (picks.some((p) => p >= 0)) this.takeMarket[s]!++;
    else this.takePile[s]!++;
    if (picks[0] === -2) {
      // 주머니 맨 위 2장을 펼쳐 1장 고르고, 남은 장은 주머니 맨 아래(배열 앞)로
      const cards: number[] = [];
      for (let k = 0; k < 2 && this.bag.length; k++) cards.push(this.bag.pop() as number);
      if (cards.length) {
        const i = Math.max(0, Math.min(cards.length - 1, choose ? choose(cards) : 0));
        this.hands[s]!.push(cards.splice(i, 1)[0] as number);
        this.bag.unshift(...cards);
      }
      picks = [];
    }
    for (const p of picks) {
      if ((this.hands[s] as number[]).length >= max) break;
      const i = p >= 0 ? this.market.indexOf(p) : -1;
      const draft = this.rules.one?.takeMode === 'draft';
      if (i >= 0) {
        this.hands[s]!.push(this.market.splice(i, 1)[0] as number);
        if (this.bag.length && !draft) this.market.push(this.bag.pop() as number);
      } else if (draft) continue;
      else if (this.bag.length) this.hands[s]!.push(this.bag.pop() as number);
      else if (this.market.length) {
        this.hands[s]!.push(this.market.shift() as number);
      }
    }
    // 펼쳐 두기(draft): 펼친 타일을 모두 가져가면 주머니에서 다시 (펼침 장수)만큼 펼친다
    if (this.rules.one?.takeMode === 'draft' && this.market.length === 0) {
      const m = this.rules.market[this.P] ?? this.P;
      for (let k = 0; k < m && this.bag.length; k++) this.market.push(this.bag.pop() as number);
    }
    this.records.push({ seat: s, species: -1, flips: 0, claims: 0, discard: false });
    this.actionCount.take++;
    this.plays[s]!++;
    this.turns++;
    this.stageCount++;
    this.nextTurn();
  }

  /** 아무것도 할 수 없는 차례 */
  doPass(): void {
    this.turns++;
    this.stageCount++;
    this.nextTurn();
  }
  /** 직전 내 차례와 같은 행동을 한 횟수 (지표) */
  sameAsLast = 0;
  /** 자리별 직전 행동 */
  lastAction: ('place' | 'move' | 'gather' | null)[] = [];

  /** 담 넘기·모여라 차례를 확정한다 */
  doAction(act: Exclude<TurnAction, { kind: 'place' }>): void {
    if (act.kind === 'take2') return this.doTakeCards(act.picks, act.choose);
    if (act.kind === 'pass') return this.doPass();
    if (act.kind === 'plant') {
      this.stage = 'plant';
      return;
    }
    if (act.kind === 'call') {
      this.applyCallTurn(act.cell, act.rot);
      return;
    }
    const s = this.current;
    const before = this.owners();
    if (act.kind === 'move') {
      this.applyMove(s, act.from, act.to, act.k);
      if (act.then) this.applyMove(s, act.then.from, act.then.to, act.then.k);
    } else {
      this.applyGather(s, act.cells);
      const a = this.rules.actions;
      if (a?.gatherTake && this.hands[s]!.length < (a.handMax ?? 2) && this.market.length) {
        this.hands[s]!.push(this.market.shift() as number);
        if (this.bag.length) this.market.push(this.bag.pop() as number);
      }
    }
    this.commit();
    const after = this.owners();
    let flips = 0;
    let claims = 0;
    for (let c = 0; c < this.geo.n; c++) {
      if (before[c] === after[c]) continue;
      if (after[c] === s && (before[c] as number) >= 0) flips++;
      else if (after[c] === s) claims++;
      else if ((before[c] as number) >= 0 && before[c] !== s) flips++;
    }
    this.records.push({ seat: s, species: -1, flips, claims, discard: false });
    this.actionCount[act.kind]++;
    if (this.lastAction[s] === act.kind) this.sameAsLast++;
    this.lastAction[s] = act.kind;
    this.plays[s]!++;
    this.turns++;
    this.stageCount++;
    this.nextTurn();
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

  /** 자리별: 내 땅 위에 서 있는 식물 수 (동점 깨기) */
  plantsOnLand(): number[] {
    const own = this.owners();
    const out = new Array(this.P).fill(0);
    for (let c = 0; c < this.geo.n; c++) if (this.plant[c] !== -1 && (own[c] as number) >= 0) out[own[c] as number]++;
    return out;
  }

  /** 줄다리기 공급처 확인용: 자리별 보드 위 큐브 수 */
  cubesOnBoard(): number[] {
    return this.inf.map((a) => a.reduce((x, y) => x + y, 0));
  }
}
