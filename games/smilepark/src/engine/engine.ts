import { CARDS, CARD_BY_ID } from './data/cards';
import { EVENTS, EVENT_BY_ID } from './data/events';
import { GROUPS, GROUP_BY_ID, sizeOf } from './data/groups';
import { nextRng } from './rng';
import {
  STAFF_KEYS,
  type GameState,
  type Group,
  type ParkCard,
  type Phase,
  type PlaceLine,
  type Player,
  type RoundReport,
  type StaffKey,
} from './types';

/**
 * 규칙 상수 (docs/design-v1.md). 오프라인 보드게임에서 손으로 계산할 수 있는 값만 쓴다.
 * 카드 인쇄값 변환 규칙은 data/cards.ts 의 PRINT.
 */
export const CFG = {
  rounds: 8,
  /** 지원 인원 (사람 + AI) */
  minPlayers: 2,
  maxPlayers: 5,
  /** 시작 자금: 1라운드 선 플레이어 startMoney, 이후 순서마다 +seatMoney */
  startMoney: 10,
  seatMoney: 1,
  slots: 6,
  /** 시장 카드 수 = 플레이어 수 + marketExtra */
  marketExtra: 2,
  /** 건설 단계에서 라운드당 지을 수 있는 시설 수 */
  buildsPerRound: 2,
  /** 관객 모집 수 = baseGroups + 마케팅 전문가 Lv + 이벤트 */
  baseGroups: 2,
  /** 관객 줄 = 인원 × rowPerPlayer 장 */
  rowPerPlayer: 3,
  maxFee: 3,
  /** 입찰 동점 처리: 1 = 선 플레이어에서 먼 쪽 먼저, 0 = 가까운 쪽 먼저 */
  bidTieLate: 1,
  /** 취향 일치 보너스 (그룹 1개당 한 번) */
  favBonus: 2,
  /** 놀이기구에 배치하지 못한 그룹 1개당 만족도 감소 */
  unplacedSat: 1,
  repairCost: 2,
  cleanCost: 1,
  /** 환경 미화원 Lv당 무료 청소 */
  cleanPerCleaner: 2,
  maxStaff: 3,
  /** 고용비 (Lv 0→1, 1→2, 2→3). 모든 인력이 같다 */
  hireCosts: [3, 5, 7],
  /** 연구원 Lv당 매 라운드 만족도 */
  researchSat: 1,
  /** 게임 종료 시 남은 돈 $N마다 만족도 +1 */
  moneyPerVp: 5,
};

export const hireCost = (level: number) => CFG.hireCosts[level] ?? 99;

/** 밸런스 시뮬레이션용 통계 훅 (게임 진행에는 영향 없음) */
export const probe: {
  buy?: (p: Player, cardId: number, price: number, round: number) => void;
  hire?: (p: Player, k: StaffKey, round: number) => void;
  report?: (p: Player, r: RoundReport, s: GameState) => void;
  roundEnd?: (s: GameState) => void;
} = {};

export type Action =
  | { type: 'buy'; cardId: number; slot: number }
  | { type: 'pass' }
  | { type: 'bid'; amount: number }
  | { type: 'pickGroup'; groupId: number }
  | { type: 'donePicking' }
  | { type: 'setFee'; fee: number }
  | { type: 'confirmFee' }
  | { type: 'place'; index: number; slot: number | null }
  | { type: 'autoPlace' }
  | { type: 'clearPlace' }
  | { type: 'confirmPlace' }
  | { type: 'continue' }
  | { type: 'repair'; slot: number }
  | { type: 'clean' }
  | { type: 'hire'; staff: StaffKey }
  | { type: 'endManage' };

export const HUMAN = 0;

/* ───────── 유틸 ───────── */

function rand(s: GameState): number {
  const [v, n] = nextRng(s.rng);
  s.rng = n;
  return v;
}
function shuffle<T>(s: GameState, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function log(s: GameState, msg: string) {
  s.log.push(msg);
  if (s.log.length > 100) s.log.splice(0, s.log.length - 100);
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
export const cardAt = (p: Player, slot: number): ParkCard | null => (p.facilities[slot] ? CARD_BY_ID[p.facilities[slot]!.id] : null);
/** 내 공원의 특정 종류 시설 */
const built = (p: Player, kind: ParkCard['kind']) =>
  p.facilities.flatMap((f, i) => (f && CARD_BY_ID[f.id].kind === kind ? [{ f, i, c: CARD_BY_ID[f.id] }] : []));
const hasTag = (s: GameState, tag: string) => !!s.event?.tags.includes(tag as never);

export const priceOf = (_p: Player, c: ParkCard) => c.cost;
export const groupQuota = (s: GameState, p: Player) => Math.max(0, CFG.baseGroups + p.staff.marketer + (s.event?.groupDelta ?? 0));
export const feeCap = (s: GameState) => Math.min(CFG.maxFee, s.event?.maxFee ?? CFG.maxFee);
export const marketSizeFor = (players: number) => players + CFG.marketExtra;
export const enters = (g: Group, fee: number) => g.budget >= fee;
/** 정원 초과 배치 가능 횟수 = 안내 직원 Lv + 부대시설 */
export const overflowOf = (p: Player) => p.staff.guide + sum(built(p, 'amenity').map((a) => a.c.fx.overflow ?? 0));
export const freeRepairsOf = (p: Player) => p.staff.engineer + sum(built(p, 'amenity').map((a) => a.c.fx.freeRepair ?? 0));
export const freeCleansOf = (p: Player) => p.staff.cleaner * CFG.cleanPerCleaner + sum(built(p, 'amenity').map((a) => a.c.fx.freeClean ?? 0));
export const canBuild = (p: Player) => p.built < CFG.buildsPerRound;
export const hasHuman = (s: GameState) => s.players.some((p) => !p.isAI);
/** 이 칸이 이번 라운드에 그룹을 받을 수 있는 놀이기구인지 */
export const usableRide = (p: Player, slot: number) => {
  const c = cardAt(p, slot);
  return !!c && c.kind === 'ride' && !p.facilities[slot]!.repair;
};

/** 그룹이 놀이기구에 들어가는지: ok = 정원 이내, over = 정원 +1 (정원 초과 배치 1회 사용), null = 불가 */
export function fitOf(c: ParkCard, g: Group): 'ok' | 'over' | null {
  const n = sizeOf(g);
  if (n <= c.cap) return 'ok';
  if (n === c.cap + 1) return 'over';
  return null;
}
/** 정원을 꽉 채워 수리 토큰을 받는지 */
export const wearsOut = (c: ParkCard, g: Group) => sizeOf(g) >= c.cap && !c.fx.noRepair;

/** 놀이기구 c에 그룹 g를 배치했을 때 얻는 만족도 (카드 값 × 대상 인원 + 취향 + 효과 + 이벤트 + 부대시설) */
export function placeSat(s: GameState, p: Player, c: ParkCard, g: Group): number {
  const count = c.target === 'all' ? sizeOf(g) : c.target === 'child' ? g.kids : g.adults;
  let v = c.sat * count;
  const fx = c.fx;
  if (g.fav === c.type) v += CFG.favBonus + (fx.favSat ?? 0);
  if (g.kids > 0 && g.adults > 0) v += fx.mixedSat ?? 0;
  if (g.kids > 0) v += fx.kidSat ?? 0;
  for (const o of fx.on ?? []) if (hasTag(s, o.tag)) v += o.sat;
  for (const e of s.event?.rides ?? []) {
    const hit = e.target === 'all' || (e.target === 'outdoor' ? c.outdoor : e.target === 'indoor' ? !c.outdoor : e.target.includes(c.type as never));
    if (hit) v += e.sat;
  }
  for (const a of built(p, 'amenity')) v += g.kids > 0 ? a.c.fx.kidGroupSat ?? 0 : a.c.fx.adultGroupSat ?? 0;
  return Math.max(0, v);
}

/** 배치가 규칙에 맞는지. 맞으면 null */
export function placementError(s: GameState, p: Player, place: (number | null)[]): string | null {
  const fee = Math.min(p.fee, feeCap(s));
  const used = new Set<number>();
  let over = 0;
  for (let i = 0; i < p.groups.length; i++) {
    const slot = place[i];
    if (slot === null || slot === undefined) continue;
    const g = GROUP_BY_ID[p.groups[i]];
    if (!enters(g, fee)) return `${g.name}은(는) 입장하지 않았어요`;
    if (!usableRide(p, slot)) return '운영할 수 있는 놀이기구가 아니에요';
    if (used.has(slot)) return '놀이기구 1곳에는 그룹 1개만 배치할 수 있어요';
    used.add(slot);
    const fit = fitOf(cardAt(p, slot)!, g);
    if (!fit) return '정원을 넘는 그룹은 배치할 수 없어요';
    if (fit === 'over') over++;
  }
  if (over > overflowOf(p)) return '정원 초과 배치 횟수가 부족해요 (안내 직원)';
  return null;
}

/**
 * 만족도가 가장 큰 배치 (같으면 수리 토큰이 적은 쪽).
 * wearCost: 수리 토큰 1개를 만족도 몇 점으로 볼지 (AI 판단용, 추천 배치는 0.1)
 */
export function bestPlacement(s: GameState, p: Player, wearCost = 0.1, fee = p.fee): { place: (number | null)[]; sat: number } {
  const f = Math.min(fee, feeCap(s));
  const idx = p.groups.map((_, i) => i).filter((i) => enters(GROUP_BY_ID[p.groups[i]], f));
  // 큰 그룹부터 정하면 가지치기가 잘 된다
  idx.sort((a, b) => sizeOf(GROUP_BY_ID[p.groups[b]]) - sizeOf(GROUP_BY_ID[p.groups[a]]));
  const rides = p.facilities.map((_, i) => i).filter((i) => usableRide(p, i));
  const overMax = overflowOf(p);
  // 그룹 × 놀이기구 점수표
  const val = new Map<string, { v: number; fit: 'ok' | 'over' }>();
  for (const gi of idx) {
    const g = GROUP_BY_ID[p.groups[gi]];
    for (const r of rides) {
      const c = cardAt(p, r)!;
      const fit = fitOf(c, g);
      if (fit) val.set(`${gi}:${r}`, { v: placeSat(s, p, c, g) - (wearsOut(c, g) ? wearCost : 0), fit });
    }
  }
  let best = -Infinity;
  let bestPlace: (number | null)[] = p.groups.map(() => null);
  const cur: (number | null)[] = p.groups.map(() => null);
  const used = new Set<number>();
  const dfs = (k: number, over: number, acc: number) => {
    if (k === idx.length) {
      if (acc > best + 1e-9) {
        best = acc;
        bestPlace = [...cur];
      }
      return;
    }
    const gi = idx[k];
    for (const r of rides) {
      if (used.has(r)) continue;
      const e = val.get(`${gi}:${r}`);
      if (!e) continue;
      const o = over + (e.fit === 'over' ? 1 : 0);
      if (o > overMax) continue;
      used.add(r);
      cur[gi] = r;
      dfs(k + 1, o, acc + e.v);
      cur[gi] = null;
      used.delete(r);
    }
    dfs(k + 1, over, acc - CFG.unplacedSat);
  };
  dfs(0, 0, 0);
  const sat = sum(bestPlace.map((r, gi) => (r === null ? 0 : placeSat(s, p, cardAt(p, r)!, GROUP_BY_ID[p.groups[gi]]))));
  return { place: bestPlace, sat };
}

/** 운영 결과 계산 (상태를 바꾸지 않는다). UI 미리보기에도 쓴다. */
export function computeReport(s: GameState, p: Player): RoundReport {
  const ev = s.event;
  const fee = Math.min(p.fee, feeCap(s));
  const all = p.groups.map((id) => GROUP_BY_ID[id]);
  const entered = all.filter((g) => enters(g, fee));
  const people = sum(entered.map(sizeOf));
  const places: PlaceLine[] = [];
  const unplaced: Group[] = [];
  p.groups.forEach((id, i) => {
    const g = GROUP_BY_ID[id];
    if (!enters(g, fee)) return;
    const slot = p.place[i];
    if (slot === null || slot === undefined) {
      unplaced.push(g);
      return;
    }
    const c = cardAt(p, slot)!;
    places.push({ group: g, facility: c.name, facilityType: c.type, sat: placeSat(s, p, c, g), wear: wearsOut(c, g) });
  });
  let shopIncome = 0;
  let trashAdded = 0;
  if (entered.length > 0) {
    for (const { c } of built(p, 'shop')) {
      let inc = c.income * entered.length + (ev?.shopDelta ?? 0);
      for (const o of c.fx.shopOn ?? []) if (hasTag(s, o.tag)) inc += o.income;
      if (c.fx.crowdIncome && entered.length >= c.fx.crowdIncome.min) inc += c.fx.crowdIncome.income;
      shopIncome += inc;
      if (inc > 0) trashAdded++;
    }
  }
  let bonusSat = 0;
  let bonusIncome = 0;
  for (const { c } of built(p, 'amenity')) {
    const fx = c.fx;
    bonusSat += fx.flatSat ?? 0;
    for (const o of fx.flatOn ?? []) if (hasTag(s, o.tag)) bonusSat += o.sat;
    bonusIncome += (fx.flatIncome ?? 0) + (fx.perGroupIncome ?? 0) * entered.length;
    for (const o of fx.flatIncomeOn ?? []) if (hasTag(s, o.tag)) bonusIncome += o.income;
  }
  bonusSat += p.staff.researcher * CFG.researchSat;
  let upkeep = 0;
  for (const f of p.facilities) {
    if (!f) continue;
    const c = CARD_BY_ID[f.id];
    upkeep += c.upkeep + (c.fx.upkeepOn && hasTag(s, c.fx.upkeepOn.tag) ? c.fx.upkeepOn.n : 0);
  }
  const feeIncome = fee * people;
  const after = p.money + feeIncome + shopIncome + bonusIncome - upkeep;
  const unplacedSat = unplaced.length * CFG.unplacedSat;
  trashAdded += ev?.trashDelta ?? 0;
  return {
    fee,
    groups: entered.length,
    people,
    turnedBack: all.filter((g) => !enters(g, fee)),
    feeIncome,
    places,
    unplaced,
    unplacedSat,
    shopIncome,
    bonusIncome,
    bonusSat,
    upkeep,
    sat: sum(places.map((l) => l.sat)) + bonusSat - unplacedSat,
    debtSat: after < 0 ? -after : 0,
    trashAdded,
    trashPenalty: 0,
  };
}

/* ───────── 세팅 ───────── */

/** 자리 하나: AI 인지, 이름(없으면 AI 는 기본 이름, 사람은 humanName) */
export interface SeatSpec {
  ai: boolean;
  name?: string;
}

/**
 * 새 게임. seats 를 주면 그 자리 순서대로(사람 여럿 가능: 돌려 하기·온라인), 없으면 옛 방식(사람 humans 명이 앞, AI aiCount 명).
 * profiles 는 AI 자리 순서대로의 성향.
 */
export function newGame(opts: { aiCount?: number; humans?: number; seed?: number; humanName?: string; profiles?: string[]; seats?: SeatSpec[] }): GameState {
  // 옛 방식: 사람은 0~1명, 전체 인원은 minPlayers~maxPlayers
  const humans = Math.max(0, Math.min(1, Math.floor(opts.humans ?? 1)));
  const aiCount = Math.max(CFG.minPlayers - humans, Math.min(CFG.maxPlayers - humans, Math.floor(opts.aiCount ?? 0) || 0));
  const seats: SeatSpec[] = opts.seats ?? Array.from({ length: humans + aiCount }, (_, i) => ({ ai: i >= humans }));
  if (seats.length < CFG.minPlayers || seats.length > CFG.maxPlayers) throw new Error(`인원은 ${CFG.minPlayers}~${CFG.maxPlayers}명이에요`);
  const s: GameState = {
    round: 0,
    maxRounds: CFG.rounds,
    phase: 'construct',
    step: null,
    players: [],
    first: 0,
    startFirst: 0,
    turn: 0,
    passed: [],
    market: [],
    facilityDeck: [],
    groupDeck: [],
    groupRow: [],
    pickOrder: [],
    pickTurn: 0,
    pickDone: [],
    opStep: [],
    ready: [],
    eventDeck: [],
    event: null,
    nextEvent: null,
    rng: (opts.seed ?? 1) >>> 0,
    log: [],
    notice: null,
  };
  const aiNames = ['미니', '코코', '루루', '팝콘', '봉봉'];
  const total = seats.length;
  let aiNo = 0;
  for (let i = 0; i < total; i++) {
    const isAI = seats[i].ai;
    const k = isAI ? aiNo++ : -1;
    s.players.push({
      id: i,
      name: seats[i].name ?? (isAI ? `${aiNames[k]} 파크` : (opts.humanName ?? '내 파크')),
      isAI,
      ai: isAI ? (opts.profiles?.[k] ?? 'balanced') : undefined,
      money: CFG.startMoney,
      vp: 0,
      facilities: Array(CFG.slots).fill(null),
      staff: { engineer: 0, marketer: 0, cleaner: 0, guide: 0, researcher: 0 },
      trash: 0,
      built: 0,
      hired: false,
      bid: null,
      fee: 2,
      groups: [],
      place: [],
      report: null,
    });
  }
  // 1라운드 선 플레이어는 무작위. 순서가 늦을수록 시작 자금을 $1씩 더 받는다.
  s.startFirst = Math.floor(rand(s) * total);
  for (const p of s.players) p.money += seatMoney((p.id - s.startFirst + total) % total);
  s.facilityDeck = shuffle(s, CARDS.map((c) => c.id));
  s.groupDeck = shuffle(s, GROUPS.map((g) => g.id));
  s.eventDeck = shuffle(s, EVENTS.map((e) => e.id));
  startRound(s);
  settle(s);
  return s;
}

/** 1라운드 순서 seat(0부터)의 추가 시작 자금 */
export const seatMoney = (seat: number) => seat * CFG.seatMoney;

function drawEvent(s: GameState) {
  if (s.eventDeck.length === 0) s.eventDeck = shuffle(s, EVENTS.map((e) => e.id).filter((id) => id !== s.event?.id));
  return EVENT_BY_ID[s.eventDeck.pop()!];
}

function startRound(s: GameState) {
  s.round++;
  s.phase = 'construct';
  s.step = null;
  s.event = s.nextEvent ?? drawEvent(s);
  s.nextEvent = s.round < s.maxRounds ? drawEvent(s) : null;
  // 팔리지 않은 시장 카드는 버린다. 덱이 비면 (지어진 카드·시장 카드를 뺀) 나머지로 다시 섞는다.
  s.market = [];
  const size = marketSizeFor(s.players.length);
  for (let i = 0; i < size; i++) {
    if (s.facilityDeck.length === 0) {
      const used = new Set<number>(s.market);
      for (const p of s.players) for (const f of p.facilities) if (f) used.add(f.id);
      s.facilityDeck = shuffle(s, CARDS.map((c) => c.id).filter((id) => !used.has(id)));
      if (s.facilityDeck.length === 0) break;
    }
    s.market.push(s.facilityDeck.pop()!);
  }
  for (const p of s.players) {
    p.built = 0;
    p.hired = false;
    p.bid = null;
    p.groups = [];
    p.place = [];
    p.report = null;
  }
  s.groupRow = [];
  s.passed = s.players.map(() => false);
  s.first = (s.startFirst + s.round - 1) % s.players.length;
  s.turn = s.first;
  log(s, `${s.round}라운드 · ${s.event.name}`);
  if (s.event.blackout) {
    for (const p of s.players) {
      if (built(p, 'amenity').some((a) => a.c.fx.blackoutImmune)) continue;
      const slot = blackoutSlot(p);
      if (slot === null) continue;
      p.facilities[slot]!.repair = true;
      log(s, `${p.name}: 정전으로 ${cardAt(p, slot)!.name}에 수리 토큰`);
    }
  }
}

/** 정전: 정원이 가장 큰 놀이기구(같으면 왼쪽 칸) 중 수리 토큰이 없는 곳 */
export function blackoutSlot(p: Player): number | null {
  let best: number | null = null;
  let bestCap = -1;
  for (let i = 0; i < p.facilities.length; i++) {
    const f = p.facilities[i];
    const c = cardAt(p, i);
    if (!f || !c || c.kind !== 'ride' || f.repair || c.fx.noRepair) continue;
    if (c.cap > bestCap) {
      best = i;
      bestCap = c.cap;
    }
  }
  return best;
}

/* ───────── 진행 루프 ───────── */

function advanceTurn(s: GameState) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (s.turn + k) % n;
    if (!s.passed[i]) {
      s.turn = i;
      return;
    }
  }
}

/** 사람의 입력이 필요한 지점까지 자동 진행한다. */
function settle(s: GameState) {
  const human = hasHuman(s);
  for (let guard = 0; guard < 3000; guard++) {
    switch (s.phase) {
      case 'construct': {
        if (s.passed.every(Boolean)) {
          startPromote(s);
          break;
        }
        const p = s.players[s.turn];
        if (!p.isAI) return;
        aiConstructTurn(s, p);
        advanceTurn(s);
        break;
      }
      case 'promote': {
        if (s.step === 'bid') {
          if (s.players.some((p) => p.bid === null)) return;
          resolveBids(s);
          break;
        }
        if (s.pickDone.every(Boolean)) {
          startOperate(s);
          break;
        }
        const p = s.players[s.pickTurn];
        if (!p.isAI) return;
        aiPickTurn(s, p);
        break;
      }
      case 'operate':
        if (s.step === 'fee' || s.step === 'place') {
          if (human) return;
          runOperate(s);
          break;
        }
        if (human) return;
        startManage(s);
        break;
      case 'manage':
        if (human) return;
        finishRound(s);
        break;
      default:
        return;
    }
  }
}

/* 홍보: 비공개 동시 입찰 → 입찰 순서대로 관객 그룹 고르기 */

function startPromote(s: GameState) {
  s.phase = 'promote';
  s.step = 'bid';
  // 관객 줄을 먼저 공개하고, 그것을 보고 입찰한다
  s.groupRow = [];
  for (let i = 0; i < s.players.length * CFG.rowPerPlayer; i++) {
    const g = drawGroup(s);
    if (g !== null) s.groupRow.push({ g, by: null });
  }
  for (const p of s.players) p.bid = p.isAI ? aiBid(s, p) : null;
}

/** 입찰 순위: 많이 낸 순, 같으면 건설을 늦게 한 쪽(선 플레이어 오른쪽부터 반시계) 먼저 */
export function bidOrder(s: GameState): number[] {
  const n = s.players.length;
  const dist = (id: number) => (id - s.first + n) % n;
  return [...s.players].sort((a, b) => (b.bid ?? 0) - (a.bid ?? 0) || (CFG.bidTieLate ? dist(b.id) - dist(a.id) : dist(a.id) - dist(b.id))).map((p) => p.id);
}

function drawGroup(s: GameState): number | null {
  if (s.groupDeck.length === 0) {
    const out = new Set(s.groupRow.map((r) => r.g));
    s.groupDeck = shuffle(s, GROUPS.map((g) => g.id).filter((id) => !out.has(id)));
  }
  return s.groupDeck.pop() ?? null;
}

function resolveBids(s: GameState) {
  for (const p of s.players) p.money -= p.bid ?? 0;
  s.pickOrder = bidOrder(s);
  log(s, `홍보 입찰: ${s.pickOrder.map((id) => `${s.players[id].name.replace(' 파크', '')} $${s.players[id].bid}`).join(' · ')}`);
  s.pickDone = s.players.map((p) => groupQuota(s, p) === 0);
  s.step = 'pick';
  s.pickTurn = s.pickOrder[0];
  if (s.pickDone[s.pickTurn]) advancePick(s);
}

/** 입찰 순서를 따라 다음으로 고를 플레이어에게 차례를 넘긴다 */
function advancePick(s: GameState) {
  const n = s.pickOrder.length;
  const at = s.pickOrder.indexOf(s.pickTurn);
  for (let k = 1; k <= n; k++) {
    const id = s.pickOrder[(at + k) % n];
    if (!s.pickDone[id]) {
      s.pickTurn = id;
      return;
    }
  }
}

function takeGroup(s: GameState, p: Player, groupId: number): boolean {
  const r = s.groupRow.find((x) => x.g === groupId && x.by === null);
  if (!r) return false;
  r.by = p.id;
  p.groups.push(groupId);
  if (p.groups.length >= groupQuota(s, p)) s.pickDone[p.id] = true;
  if (s.groupRow.every((x) => x.by !== null)) s.pickDone = s.pickDone.map(() => true);
  advancePick(s);
  return true;
}

/* 운영: 입장료 → 배치 → 결과 */

function startOperate(s: GameState) {
  s.phase = 'operate';
  s.step = 'fee';
  s.opStep = s.players.map((p) => (p.isAI ? 'done' : 'fee'));
  s.ready = s.players.map(() => false);
  for (const p of s.players) {
    p.place = p.groups.map(() => null);
    if (p.isAI) {
      p.fee = aiFee(s, p);
      p.place = bestPlacement(s, p, aiWearCost(s)).place;
    } else {
      p.fee = Math.min(p.fee, feeCap(s));
    }
  }
}

/** 사람마다 입장료·배치를 마쳤는지 보고 step 을 맞춘다. 모두 마쳤으면 운영 결과를 낸다 */
function syncOperate(s: GameState) {
  const humans = s.players.filter((p) => !p.isAI).map((p) => p.id);
  if (humans.every((i) => s.opStep[i] === 'done')) {
    runOperate(s);
    return;
  }
  s.step = humans.some((i) => s.opStep[i] === 'fee') ? 'fee' : 'place';
}

/** 사람 플레이어가 모두 ready 인지 */
const allReady = (s: GameState) => s.players.every((p) => p.isAI || s.ready[p.id]);

function runOperate(s: GameState) {
  s.step = 'result';
  s.ready = s.players.map(() => false);
  for (const p of s.players) {
    const r = computeReport(s, p);
    p.report = r;
    p.money += r.feeIncome + r.shopIncome + r.bonusIncome - r.upkeep;
    if (p.money < 0) p.money = 0;
    p.vp += r.sat - r.debtSat;
    p.trash += r.trashAdded;
    p.groups.forEach((_, i) => {
      const slot = p.place[i];
      if (slot === null || slot === undefined) return;
      const g = GROUP_BY_ID[p.groups[i]];
      if (enters(g, r.fee) && wearsOut(cardAt(p, slot)!, g)) p.facilities[slot]!.repair = true;
    });
    probe.report?.(p, r, s);
    const net = r.feeIncome + r.shopIncome + r.bonusIncome - r.upkeep;
    log(s, `${p.name}: 그룹 ${r.groups}개 입장 · ${net < 0 ? '-' : '+'}$${Math.abs(net)} · 만족도 ${r.sat - r.debtSat >= 0 ? '+' : ''}${r.sat - r.debtSat}`);
  }
}

/* 관리 */

/** 수리 토큰을 뗄 가치가 큰 놀이기구 순 (정원 × 만족도) */
const rideWorth = (c: ParkCard) => c.cap * c.sat;
function repairTargets(p: Player): number[] {
  return p.facilities
    .map((f, i) => (f?.repair ? i : -1))
    .filter((i) => i >= 0)
    .sort((a, b) => rideWorth(cardAt(p, b)!) - rideWorth(cardAt(p, a)!));
}

function startManage(s: GameState) {
  s.phase = 'manage';
  s.step = null;
  s.ready = s.players.map(() => false);
  for (const p of s.players) {
    // 인력·부대시설의 무료 처리는 자동 (수리는 가치가 큰 놀이기구부터)
    let free = freeRepairsOf(p);
    for (const i of repairTargets(p)) {
      if (free <= 0) break;
      p.facilities[i]!.repair = false;
      free--;
    }
    p.trash = Math.max(0, p.trash - freeCleansOf(p));
    if (p.isAI) aiManage(s, p);
  }
}

function finishRound(s: GameState) {
  for (const p of s.players) {
    // 치우지 않은 쓰레기는 남아서 다음 라운드에도 다시 감점된다.
    p.vp -= p.trash;
    if (p.report) p.report.trashPenalty = p.trash;
    if (p.trash > 0) log(s, `${p.name}: 쓰레기 ${p.trash}개 → 만족도 -${p.trash}`);
  }
  probe.roundEnd?.(s);
  if (s.round >= s.maxRounds) {
    for (const p of s.players) {
      p.endBonus = Math.floor(p.money / CFG.moneyPerVp);
      p.vp += p.endBonus;
    }
    s.phase = 'gameOver';
    s.step = null;
    const w = winners(s);
    log(s, w.length > 1 ? `${w.map((p) => p.name).join(', ')} 공동 승리!` : `${w[0].name} 승리!`);
    return;
  }
  startRound(s);
}

/** 순위: 만족도 → 잔액 순. 둘 다 같으면 공동 순위 (winners) */
export function rankings(s: GameState): Player[] {
  return [...s.players].sort((a, b) => b.vp - a.vp || b.money - a.money);
}
/** 1위 (만족도·잔액이 모두 같으면 공동 1위 여러 명) */
export function winners(s: GameState): Player[] {
  const top = rankings(s)[0];
  return s.players.filter((p) => p.vp === top.vp && p.money === top.money);
}

/* ───────── 행동 처리 ───────── */

function doBuy(s: GameState, p: Player, cardId: number, slot: number) {
  const c = CARD_BY_ID[cardId];
  const price = priceOf(p, c);
  probe.buy?.(p, cardId, price, s.round);
  p.money -= price;
  const old = p.facilities[slot];
  p.facilities[slot] = { id: cardId, repair: false };
  p.built++;
  if (!canBuild(p)) s.passed[p.id] = true;
  s.market = s.market.filter((id) => id !== cardId);
  log(s, `${p.name}: ${c.name} 건설${old ? ` (${CARD_BY_ID[old.id].name} 철거)` : ''}`);
}

function doHire(s: GameState, p: Player, k: StaffKey) {
  probe.hire?.(p, k, s.round);
  p.money -= hireCost(p.staff[k]);
  p.staff[k]++;
  p.hired = true;
  log(s, `${p.name}: ${STAFF_LABEL[k]} 고용 (Lv.${p.staff[k]})`);
}

function doRepair(p: Player, slot: number): boolean {
  const f = p.facilities[slot];
  if (!f?.repair || p.money < CFG.repairCost) return false;
  p.money -= CFG.repairCost;
  f.repair = false;
  return true;
}

export const STAFF_LABEL: Record<StaffKey, string> = {
  engineer: '엔지니어',
  marketer: '마케팅 전문가',
  cleaner: '환경 미화원',
  guide: '안내 직원',
  researcher: '연구원',
};

/** 사람 플레이어(seat, 기본 0번)의 행동. 잘못된 행동이면 notice만 채워 돌려준다. */
export function dispatch(prev: GameState, a: Action, seat = HUMAN): GameState {
  const s = structuredClone(prev);
  s.notice = null;
  const err = apply(s, seat, a);
  if (err) {
    s.notice = err;
    return s;
  }
  settle(s);
  return s;
}

/** 좌석 seat 의 행동. 규칙에 맞지 않으면 prev 를 그대로 두고 error 에 이유를 담는다 */
export function play(prev: GameState, seat: number, a: Action): { state: GameState; error: string | null } {
  const s = structuredClone(prev);
  s.notice = null;
  const error = apply(s, seat, a);
  if (error) return { state: prev, error };
  settle(s);
  return { state: s, error: null };
}

function apply(s: GameState, seat: number, a: Action): string | null {
  const p = s.players[seat];
  if (!p || p.isAI) return '사람 플레이어가 없어요';
  const need = (ph: Phase, step?: GameState['step']) => (s.phase === ph && (step === undefined || s.step === step) ? null : '지금은 할 수 없는 행동이에요');
  /** 운영 입력: 이 사람이 입장료(fee)·배치(place) 중 어디에 있는지 */
  const needOp = (st: 'fee' | 'place') => (s.phase === 'operate' && s.step !== 'result' && s.opStep[seat] === st ? null : '지금은 할 수 없는 행동이에요');
  const needManage = () => need('manage') ?? (s.ready[seat] ? '관리를 마쳤어요. 다른 공원을 기다리는 중이에요' : null);
  switch (a.type) {
    case 'buy': {
      const e = need('construct') ?? (s.turn === seat && !s.passed[seat] ? null : '내 차례가 아니에요');
      if (e) return e;
      if (!s.market.includes(a.cardId)) return '이미 팔린 카드예요';
      if (!Number.isInteger(a.slot) || a.slot < 0 || a.slot >= CFG.slots) return '잘못된 자리예요';
      if (priceOf(p, CARD_BY_ID[a.cardId]) > p.money) return '돈이 부족해요';
      doBuy(s, p, a.cardId, a.slot);
      advanceTurn(s);
      return null;
    }
    case 'pass': {
      const e = need('construct') ?? (s.turn === seat ? null : '내 차례가 아니에요');
      if (e) return e;
      s.passed[seat] = true;
      advanceTurn(s);
      return null;
    }
    case 'bid': {
      const e = need('promote', 'bid');
      if (e) return e;
      if (p.bid !== null) return '이미 입찰했어요';
      if (!Number.isInteger(a.amount) || a.amount < 0) return '잘못된 금액이에요';
      if (a.amount > p.money) return '돈이 부족해요';
      p.bid = a.amount;
      return null;
    }
    case 'pickGroup': {
      const e = need('promote', 'pick') ?? (s.pickTurn === seat && !s.pickDone[seat] ? null : '내 차례가 아니에요');
      if (e) return e;
      if (!takeGroup(s, p, a.groupId)) return '이미 다른 공원이 데려갔어요';
      return null;
    }
    case 'donePicking': {
      const e = need('promote', 'pick') ?? (s.pickTurn === seat && !s.pickDone[seat] ? null : '지금은 할 수 없어요');
      if (e) return e;
      s.pickDone[seat] = true;
      advancePick(s);
      return null;
    }
    case 'setFee': {
      const e = needOp('fee');
      if (e) return e;
      if (!Number.isFinite(a.fee)) return '잘못된 입장료예요';
      p.fee = Math.max(0, Math.min(feeCap(s), Math.round(a.fee)));
      return null;
    }
    case 'confirmFee': {
      const e = needOp('fee');
      if (e) return e;
      s.opStep[seat] = 'place';
      p.place = p.groups.map(() => null);
      syncOperate(s);
      return null;
    }
    case 'place': {
      const e = needOp('place');
      if (e) return e;
      if (!Number.isInteger(a.index) || a.index < 0 || a.index >= p.groups.length) return '잘못된 그룹이에요';
      const next = [...p.place];
      // 같은 놀이기구에 있던 다른 그룹은 빼고 옮긴다
      if (a.slot !== null) next.forEach((sl, i) => { if (sl === a.slot && i !== a.index) next[i] = null; });
      next[a.index] = a.slot;
      const err = placementError(s, p, next);
      if (err) return err;
      p.place = next;
      return null;
    }
    case 'autoPlace': {
      const e = needOp('place');
      if (e) return e;
      p.place = bestPlacement(s, p).place;
      return null;
    }
    case 'clearPlace': {
      const e = needOp('place');
      if (e) return e;
      p.place = p.groups.map(() => null);
      return null;
    }
    case 'confirmPlace': {
      const e = needOp('place');
      if (e) return e;
      const err = placementError(s, p, p.place);
      if (err) return err;
      s.opStep[seat] = 'done';
      syncOperate(s);
      return null;
    }
    case 'continue': {
      const e = need('operate', 'result') ?? (s.ready[seat] ? '이미 확인했어요' : null);
      if (e) return e;
      s.ready[seat] = true;
      if (allReady(s)) startManage(s);
      return null;
    }
    case 'repair': {
      const e = needManage();
      if (e) return e;
      if (!Number.isInteger(a.slot) || !p.facilities[a.slot]?.repair) return '수리 토큰이 없는 시설이에요';
      if (!doRepair(p, a.slot)) return '돈이 부족해요';
      return null;
    }
    case 'clean': {
      const e = needManage();
      if (e) return e;
      if (p.trash <= 0) return '치울 쓰레기가 없어요';
      if (p.money < CFG.cleanCost) return '돈이 부족해요';
      p.money -= CFG.cleanCost;
      p.trash--;
      return null;
    }
    case 'hire': {
      const e = needManage();
      if (e) return e;
      if (p.hired) return '인력은 라운드당 1명만 고용할 수 있어요';
      if (p.staff[a.staff] >= CFG.maxStaff) return '이미 최고 등급이에요';
      if (hireCost(p.staff[a.staff]) > p.money) return '돈이 부족해요';
      doHire(s, p, a.staff);
      return null;
    }
    case 'endManage': {
      const e = needManage();
      if (e) return e;
      s.ready[seat] = true;
      if (allReady(s)) finishRound(s);
      return null;
    }
  }
}

/** UI용: 사람 플레이어(seat)가 지금 건설 행동을 할 수 있는지 */
export const isHumanTurn = (s: GameState, seat = HUMAN) => s.phase === 'construct' && s.turn === seat && !s.passed[seat];

/* ───────── AI ───────── */

/** AI 성향. 밸런스 시뮬레이션에서 "한 전략이 압도하지 않는지" 확인하는 데도 쓴다. */
export interface AiProfile {
  label: string;
  /** $1을 만족도 몇 점으로 보는지 (투자 판단) */
  moneyW: number;
  /** 시설 구매 문턱 (남은 라운드 동안 기대 이득 - 비용) */
  buyMin: number;
  /** 입찰: 보유 금액 대비 비율, 상한 */
  bidRate: number;
  bidMax: number;
  /** 인력 선호 배율 */
  hire: Record<StaffKey, number>;
  /** 남겨둘 현금 */
  reserve: number;
}

const H = (marketer: number, guide: number, engineer: number, cleaner: number, researcher: number) => ({ marketer, guide, engineer, cleaner, researcher });

export const AI_PROFILES: Record<string, AiProfile> = {
  balanced: { label: '균형', moneyW: 0.5, buyMin: 2, bidRate: 0.25, bidMax: 8, hire: H(1, 1, 1, 1, 1), reserve: 0 },
  builder: { label: '건설 중심', moneyW: 0.35, buyMin: 0, bidRate: 0.15, bidMax: 5, hire: H(0.6, 0.6, 0.8, 0.8, 0.8), reserve: 0 },
  promoter: { label: '홍보 중심', moneyW: 0.5, buyMin: 3, bidRate: 0.4, bidMax: 12, hire: H(1.5, 1, 0.8, 0.8, 0.6), reserve: 0 },
  staff: { label: '인력 중심', moneyW: 0.5, buyMin: 3, bidRate: 0.2, bidMax: 6, hire: H(1.4, 1.4, 1.3, 1.3, 1.3), reserve: 0 },
  frugal: { label: '절약', moneyW: 0.7, buyMin: 4, bidRate: 0.1, bidMax: 3, hire: H(0.8, 0.8, 0.8, 0.8, 0.8), reserve: 3 },
};

const profileOf = (p: Player) => AI_PROFILES[p.ai ?? 'balanced'] ?? AI_PROFILES.balanced;
/** 수리 토큰 1개의 비용(만족도 환산): 다음 라운드가 있으면 수리비 또는 1라운드 운휴 */
const aiWearCost = (s: GameState) => (s.round < s.maxRounds ? 1.5 : 0);

/* 시설 가치 추정: 관객 그룹 덱에서 고정된 표본 손패를 뽑아 탐욕 배치로 평균 만족도를 잰다 (이벤트 무시) */
const SAMPLE_HANDS: Record<number, Group[][]> = {};
function sampleHands(q: number): Group[][] {
  if (SAMPLE_HANDS[q]) return SAMPLE_HANDS[q];
  let seed = 977 + q;
  const r = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const hands: Group[][] = [];
  for (let k = 0; k < 16; k++) {
    const pool = [...GROUPS];
    const hand: Group[] = [];
    for (let i = 0; i < q && pool.length; i++) hand.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    hands.push(hand);
  }
  return (SAMPLE_HANDS[q] = hands);
}

/** 이벤트 없이 놀이기구 c에 그룹 g를 태울 때의 기본 만족도 */
function baseSat(c: ParkCard, g: Group, amen: ParkCard[]): number {
  const count = c.target === 'all' ? sizeOf(g) : c.target === 'child' ? g.kids : g.adults;
  let v = c.sat * count;
  if (g.fav === c.type) v += CFG.favBonus + (c.fx.favSat ?? 0);
  if (g.kids > 0 && g.adults > 0) v += c.fx.mixedSat ?? 0;
  if (g.kids > 0) v += c.fx.kidSat ?? 0;
  for (const o of c.fx.on ?? []) v += o.sat * tagRate(o.tag);
  for (const a of amen) v += g.kids > 0 ? a.fx.kidGroupSat ?? 0 : a.fx.adultGroupSat ?? 0;
  return v;
}

/** 이벤트 아이콘이 나올 확률 (덱 기준) */
const tagRate = (tag: string) => EVENTS.filter((e) => e.tags.includes(tag as never)).length / EVENTS.length;

/** 공원 구성(cards)의 라운드당 기대 가치 (만족도 단위) */
function parkValue(cards: ParkCard[], q: number, overflow: number, w: number): number {
  const rides = cards.filter((c) => c.kind === 'ride');
  const amen = cards.filter((c) => c.kind === 'amenity');
  let rideV = 0;
  const hands = sampleHands(q);
  for (const hand of hands) {
    // 큰 그룹부터 가장 좋은 놀이기구에 (탐욕)
    const free = [...rides];
    let over = overflow;
    let v = 0;
    for (const g of [...hand].sort((a, b) => sizeOf(b) - sizeOf(a))) {
      let bi = -1;
      let bv = -CFG.unplacedSat;
      let bo = false;
      free.forEach((c, i) => {
        const fit = fitOf(c, g);
        if (!fit || (fit === 'over' && over <= 0)) return;
        const val = baseSat(c, g, amen) - (wearsOut(c, g) ? 1 : 0);
        if (val > bv) {
          bv = val;
          bi = i;
          bo = fit === 'over';
        }
      });
      v += bv;
      if (bi >= 0) {
        free.splice(bi, 1);
        if (bo) over--;
      }
    }
    rideV += v / hands.length;
  }
  let money = 0;
  let sat = 0;
  for (const c of cards) {
    money -= c.upkeep;
    if (c.fx.upkeepOn) money -= c.fx.upkeepOn.n * tagRate(c.fx.upkeepOn.tag);
    if (c.kind === 'shop') {
      money += c.income * q - 1; // 쓰레기 1개 청소비
      for (const o of c.fx.shopOn ?? []) money += o.income * tagRate(o.tag);
      if (c.fx.crowdIncome && q >= c.fx.crowdIncome.min) money += c.fx.crowdIncome.income;
    }
    if (c.kind === 'amenity') {
      const fx = c.fx;
      sat += (fx.flatSat ?? 0) + sum((fx.flatOn ?? []).map((o) => o.sat * tagRate(o.tag)));
      money += (fx.flatIncome ?? 0) + (fx.perGroupIncome ?? 0) * q + sum((fx.flatIncomeOn ?? []).map((o) => o.income * tagRate(o.tag)));
      money += (fx.freeClean ?? 0) * 0.6 + (fx.freeRepair ?? 0) * 1.2;
      if (fx.overflow) sat += fx.overflow * 1.2;
      if (fx.blackoutImmune) sat += 0.3;
    }
  }
  return rideV + sat + money * w;
}

function parkCards(p: Player, replace?: { slot: number; id: number }): ParkCard[] {
  return p.facilities.flatMap((f, i) => {
    const id = replace && replace.slot === i ? replace.id : f?.id;
    return id ? [CARD_BY_ID[id]] : [];
  });
}

function aiConstructTurn(s: GameState, p: Player) {
  const prof = profileOf(p);
  const left = s.maxRounds - s.round + 1;
  const q = CFG.baseGroups + p.staff.marketer;
  const ov = p.staff.guide;
  const cur = parkValue(parkCards(p), q, ov, prof.moneyW);
  let best: { cardId: number; slot: number; net: number } | null = null;
  for (const id of s.market) {
    const c = CARD_BY_ID[id];
    const price = priceOf(p, c);
    if (price + prof.reserve > p.money) continue;
    const empty = p.facilities.findIndex((f) => !f);
    const slots = empty >= 0 ? [empty] : p.facilities.map((_, i) => i);
    for (const slot of slots) {
      const gain = parkValue(parkCards(p, { slot, id }), q, ov, prof.moneyW) - cur;
      const net = gain * left - price * prof.moneyW * 2;
      if (net > prof.buyMin && (!best || net > best.net)) best = { cardId: id, slot, net };
    }
  }
  if (best) {
    doBuy(s, p, best.cardId, best.slot);
    return;
  }
  s.passed[p.id] = true;
}

function aiBid(s: GameState, p: Player): number {
  const prof = profileOf(p);
  const noise = rand(s);
  const want = Math.floor(p.money * prof.bidRate + noise * 1.5);
  return Math.max(0, Math.min(p.money - prof.reserve, prof.bidMax, want));
}

/** 그룹 g를 손에 더했을 때 배치 만족도 증가 + 입장료 기대 (만족도 단위) */
function groupGain(s: GameState, p: Player, g: Group): number {
  const prof = profileOf(p);
  const fee = Math.min(2, g.budget, feeCap(s));
  const before = bestPlacement(s, p, 1, 0).sat;
  const trial = { ...p, groups: [...p.groups, g.id] };
  const after = bestPlacement(s, trial, 1, 0);
  const placed = after.place[after.place.length - 1] !== null;
  return after.sat - before - (placed ? 0 : CFG.unplacedSat) + fee * sizeOf(g) * prof.moneyW;
}

function aiPickTurn(s: GameState, p: Player) {
  const open = s.groupRow.filter((r) => r.by === null).map((r) => GROUP_BY_ID[r.g]);
  let best: Group | null = null;
  let bv = 0;
  for (const g of open) {
    const v = groupGain(s, p, g);
    if (v > bv) {
      bv = v;
      best = g;
    }
  }
  if (!best) {
    s.pickDone[p.id] = true;
    advancePick(s);
    return;
  }
  takeGroup(s, p, best.id);
  log(s, `${p.name}: ${best.name} 모집`);
}

function aiFee(s: GameState, p: Player): number {
  const prof = profileOf(p);
  let best = 0;
  let bestV = -Infinity;
  for (let f = 0; f <= feeCap(s); f++) {
    const people = sum(p.groups.map((id) => GROUP_BY_ID[id]).filter((g) => enters(g, f)).map(sizeOf));
    const v = bestPlacement(s, p, aiWearCost(s), f).sat + f * people * prof.moneyW;
    if (v > bestV) {
      bestV = v;
      best = f;
    }
  }
  return best;
}

function aiManage(s: GameState, p: Player) {
  const prof = profileOf(p);
  const last = s.round >= s.maxRounds;
  // 마지막 라운드에는 운영이 없으니 수리하지 않는다 (청소는 감점을 막으므로 한다)
  if (!last) for (const i of repairTargets(p)) if (p.money - CFG.repairCost >= prof.reserve) doRepair(p, i);
  while (p.trash > 0 && p.money >= CFG.cleanCost) {
    p.money -= CFG.cleanCost;
    p.trash--;
  }
  if (last) return;
  const left = s.maxRounds - s.round;
  const rides = built(p, 'ride').length;
  const shops = built(p, 'shop').length;
  const q = CFG.baseGroups + p.staff.marketer;
  // 인력별 라운드당 기대 이득 (만족도 단위)
  const gain: Record<StaffKey, number> = {
    marketer: rides > q ? 5 : 1.5,
    guide: rides >= 2 ? 1.5 : 0.3,
    engineer: rides >= 2 ? 1.6 : 0.3,
    cleaner: shops > 0 ? Math.min(2, shops) * 0.8 : 0.1,
    researcher: CFG.researchSat,
  };
  let pick: StaffKey | null = null;
  let pv = 0;
  for (const k of STAFF_KEYS) {
    if (p.staff[k] >= CFG.maxStaff) continue;
    const cost = hireCost(p.staff[k]);
    if (cost + prof.reserve > p.money) continue;
    const v = gain[k] * prof.hire[k] * left - cost * prof.moneyW * 2;
    if (v > pv) {
      pv = v;
      pick = k;
    }
  }
  if (pick) doHire(s, p, pick);
}

/* ───────── 사람 자리 대리 (온라인에서 자리를 비웠을 때·봇끼리 판의 진행 담당) ───────── */

/**
 * 사람 자리(seat)가 지금 둘 한 수를 AI(균형 성향)와 같은 판단으로 고른다. 둘 것이 없으면 null.
 * 판의 상태(난수 포함)는 건드리지 않는다: AI 함수는 복사본에서 돌리고 결과만 행동으로 바꾼다.
 */
export function botAction(s: GameState, seat: number): Action | null {
  const p = s.players[seat];
  if (!p || p.isAI) return null;
  const copy = () => {
    const c = structuredClone(s);
    return { c, q: c.players[seat] };
  };
  switch (s.phase) {
    case 'construct': {
      if (s.turn !== seat || s.passed[seat]) return null;
      const { c, q } = copy();
      aiConstructTurn(c, q);
      if (q.built > p.built) {
        const slot = q.facilities.findIndex((f, i) => f?.id !== p.facilities[i]?.id);
        if (slot >= 0) return { type: 'buy', cardId: q.facilities[slot]!.id, slot };
      }
      return { type: 'pass' };
    }
    case 'promote': {
      if (s.step === 'bid') {
        if (p.bid !== null) return null;
        const { c, q } = copy();
        return { type: 'bid', amount: aiBid(c, q) };
      }
      if (s.pickTurn !== seat || s.pickDone[seat]) return null;
      const { c, q } = copy();
      aiPickTurn(c, q);
      return q.groups.length > p.groups.length ? { type: 'pickGroup', groupId: q.groups[q.groups.length - 1] } : { type: 'donePicking' };
    }
    case 'operate': {
      if (s.step === 'result') return s.ready[seat] ? null : { type: 'continue' };
      if (s.opStep[seat] === 'fee') {
        const fee = aiFee(s, p);
        return p.fee === fee ? { type: 'confirmFee' } : { type: 'setFee', fee };
      }
      if (s.opStep[seat] !== 'place') return null;
      const best = bestPlacement(s, p).place;
      return best.every((v, i) => v === p.place[i]) ? { type: 'confirmPlace' } : { type: 'autoPlace' };
    }
    case 'manage': {
      if (s.ready[seat]) return null;
      const last = s.round >= s.maxRounds;
      // aiManage 와 같은 순서: 수리(가치 큰 것부터, 마지막 라운드 제외) → 청소 → 인력 1명
      const fix = last ? [] : repairTargets(p);
      if (fix.length > 0 && p.money >= CFG.repairCost) return { type: 'repair', slot: fix[0] };
      if (p.trash > 0 && p.money >= CFG.cleanCost) return { type: 'clean' };
      if (!p.hired && !last) {
        const { c, q } = copy();
        aiManage(c, q);
        const k = STAFF_KEYS.find((key) => q.staff[key] > p.staff[key]);
        if (k) return { type: 'hire', staff: k };
      }
      return { type: 'endManage' };
    }
    default:
      return null;
  }
}

/** botAction 이 거절됐을 때 대신 둘, 늘 받아들여지는 한 수 */
export function fallbackAction(s: GameState, seat: number): Action | null {
  const p = s.players[seat];
  if (!p || p.isAI) return null;
  switch (s.phase) {
    case 'construct':
      return s.turn === seat ? { type: 'pass' } : null;
    case 'promote':
      if (s.step === 'bid') return p.bid === null ? { type: 'bid', amount: 0 } : null;
      return s.pickTurn === seat && !s.pickDone[seat] ? { type: 'donePicking' } : null;
    case 'operate':
      if (s.step === 'result') return s.ready[seat] ? null : { type: 'continue' };
      if (s.opStep[seat] === 'fee') return { type: 'confirmFee' };
      if (s.opStep[seat] !== 'place') return null;
      return placementError(s, p, p.place) ? { type: 'clearPlace' } : { type: 'confirmPlace' };
    case 'manage':
      return s.ready[seat] ? null : { type: 'endManage' };
    default:
      return null;
  }
}
