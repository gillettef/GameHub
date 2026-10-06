import { FACILITIES, FACILITY_BY_ID } from './data/facilities';
import { EVENTS } from './data/events';
import { effectOf } from './data/effects';
import { nextRng } from './rng';
import {
  RIDE_TYPES,
  STAFF_KEYS,
  type Built,
  type CardEffect,
  type EventTag,
  type EventTarget,
  type FacilityCard,
  type FacilityType,
  type GameState,
  type Phase,
  type Player,
  type RoundReport,
  type StaffKey,
  type Visitor,
} from './types';

/** 규칙 상수 (밸런스 조정은 여기서) */
export const CFG = {
  rounds: 8,
  /** 지원 인원 (사람 0~1 + AI) */
  minPlayers: 2,
  maxPlayers: 5,
  startMoney: 10,
  slots: 6,
  /** 수용 인원 구간: [건설비 하한, 수용] (위에서부터 처음 맞는 것, 없으면 1명) */
  capTiers: [[10, 3], [5, 2]] as [number, number][],
  /** 최소 건설비 (원본 $1 카드도 이 값, 연구원 할인 후에도 이 값 아래로 내려가지 않음) */
  minPrice: 2,
  /** 시장 카드 수 = 플레이어 수 + 이 값 */
  marketExtra: 2,
  satPerVp: 8,
  /** 시설 건설비 배율 (올림) */
  costMul: 1,
  maxStaff: 3,
  repairCost: 3,
  cleanCost: 1,
  /** 쓰레기 N개마다 VP -1 */
  trashPerVp: 2,
  /** 적자 $N마다 VP -1 (남는 금액도 1로 셈, 올림) */
  debtPerVp: 2,
  /** 시설을 하나도 이용하지 못한 관객 1명당 만족도 감소 */
  unservedSat: 2,
  /** 관객 1명이 이용하는 놀이기구 최대 수, 그와 별도로 들르는 상점·부대시설 수 */
  ridesPerVisitor: 2,
  sideStopsPerVisitor: 1,
  /** 축제 개최(건설 단계 행동, 라운드당 1회): $비용 → VP */
  festivalCost: 4,
  festivalVp: 1,
  /** AI: 남은 라운드가 이 값 이하이거나 돈이 festivalRich 이상이면 축제를 연다 */
  festivalLeft: 4,
  festivalRich: 15,
  /** 게임 종료 시 남은 돈 $N마다 VP +1 (0이면 없음) */
  moneyPerVp: 6,
  baseVisitors: 2,
  maxFee: 4,
  breakBase: 0.2,
  breakPerEngineer: 0.06,
  /** 연구원 Lv당 라운드마다 추가되는 만족도 (연구 성과) */
  researchSat: 3,
  breakMin: 0.02,
  trashChance: 0.5,
  visitorDeckSize: 48,
  /** 관객 트랙에 깔리는 카드 = 전원 수용량 합 + 여유분 */
  rowExtra: 2,
  /** 시설 원본 수익 ÷ incomeDiv (올림) = 방문 1회 수익 */
  incomeDiv: 2.5,
  /** 인력별 고용비 (레벨 0→1, 1→2, 2→3) */
  hireCosts: {
    marketer: [4, 6, 8],
    guide: [4, 6, 8],
    engineer: [3, 5, 7],
    cleaner: [3, 5, 7],
    researcher: [2, 4, 6],
  } as Record<StaffKey, number[]>,
  /** 1이면 라운드 선 = VP가 가장 낮은 플레이어(동률은 돈 적은 쪽), 0이면 시계 방향 순환 */
  catchUpOrder: 0,
  /** 관객 고르기 시작 순서: 0=선 플레이어부터, 1=선 바로 앞 플레이어부터(건설에서 가장 늦은 쪽이 먼저) */
  pickOrder: 0,
  /** 늦은 순서 좌석에 주는 시작 자금 (좌석 i는 +floor(i × 값)) */
  seatBonus: 2,
  /**
   * 인원 수별 좌석 추가 시작 자금 표 [1번째, 2번째, …] (1라운드 순서 기준). 있으면 seatBonus 대신 쓴다.
   * 순서 이점이 선형이 아니라서 scripts/sweep.ts --fit 으로 좌석 승률 편차가 작아지게 맞춘 값.
   */
  seatMoneyByPlayers: { 2: [0, 2], 3: [0, 2, 1], 4: [0, 2, 0, 2], 5: [0, 2, 1, 3, 7] } as Record<number, number[]>,
  /** 인원 수별 라운드 수 (없으면 rounds). 선 플레이어 횟수가 균등하도록 인원의 배수로 */
  roundsByPlayers: {} as Record<number, number>,
  hireCost: (key: StaffKey, level: number) => CFG.hireCosts[key][level] ?? 99,
};

/** 밸런스 시뮬레이션용 통계 훅 (게임 진행에는 영향 없음) */
export const probe: {
  visit?: (p: Player, cardId: number, income: number, sat: number) => void;
  buy?: (p: Player, cardId: number, price: number, round: number) => void;
  hire?: (p: Player, k: StaffKey, round: number) => void;
  debt?: (p: Player) => void;
  roundEnd?: (s: GameState) => void;
} = {};

export const OUTDOOR: FacilityType[] = ['스릴형', '패밀리형', '어드벤처형', '물놀이형', '놀이형'];

export type Action =
  | { type: 'buy'; cardId: number; slot: number }
  | { type: 'hire'; staff: StaffKey }
  | { type: 'festival' }
  | { type: 'pass' }
  | { type: 'pickVisitor'; visitorId: number }
  | { type: 'donePicking' }
  | { type: 'setFee'; fee: number }
  | { type: 'confirmFee' }
  | { type: 'continue' }
  | { type: 'repair'; slot: number }
  | { type: 'clean' }
  | { type: 'endManage' };

export const HUMAN = 0;

/* ───────── 유틸 ───────── */

function rand(s: GameState): number {
  const [v, n] = nextRng(s.rng);
  s.rng = n;
  return v;
}
function pick<T>(s: GameState, arr: readonly T[]): T {
  return arr[Math.floor(rand(s) * arr.length)];
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
  if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
}
const matches = (t: EventTarget, type: FacilityType) =>
  t === 'all' ? true : t === 'outdoor' ? OUTDOOR.includes(type) : t === 'indoor' ? !OUTDOOR.includes(type) : t.includes(type);

export const incomeOf = (c: FacilityCard, kind: 'child' | 'adult') => Math.ceil(c.income[kind === 'child' ? 0 : 1] / CFG.incomeDiv);
/** 상점·부대시설: 놀이기구 2곳과 별도로 관객이 1곳 더 들르는 시설 */
export const isSideStop = (c: FacilityCard) => c.type === '상점' || c.type === '부대시설';
export const marketSizeFor = (players: number) => players + CFG.marketExtra;
const hasTag = (s: GameState, tag: EventTag) => !!s.event?.tags.includes(tag);
/** 현재 이벤트에서 시설 1회 이용의 특수효과 보너스 */
function tagBonus(s: GameState, fx: CardEffect) {
  let income = 0;
  let sat = 0;
  for (const o of fx.on ?? []) {
    if (!hasTag(s, o.tag)) continue;
    income += o.income ?? 0;
    sat += o.sat ?? 0;
  }
  return { income, sat };
}
export const basePrice = (c: FacilityCard) => Math.max(CFG.minPrice, Math.ceil(c.cost * CFG.costMul));
export const priceOf = (p: Player, c: FacilityCard) => Math.max(CFG.minPrice, basePrice(c) - p.staff.researcher);
export function visitorQuota(s: GameState, p: Player): number {
  return Math.max(0, CFG.baseVisitors + p.staff.marketer + (s.event?.visitorDelta ?? 0));
}
/** 시설의 기본 수용 인원 (대형 + 특수효과) */
export const baseCapacity = (c: FacilityCard) =>
  (CFG.capTiers.find(([min]) => c.cost >= min)?.[1] ?? 1) + (effectOf(c.id).cap ?? 0);
/** 관객이 입장료를 낼 수 있는지 */
export const willEnter = (v: Visitor, fee: number) => v.budget >= fee;
/** 지금 돈으로 치울 수 있는 쓰레기 수 */
export const cleanableCount = (p: Player) => Math.min(p.trash, Math.floor(p.money / CFG.cleanCost));
/** 라운드 종료 시 쓰레기 감점 */
export const trashPenaltyOf = (trash: number) => Math.floor(trash / CFG.trashPerVp);
/** 고장 확률 */
export const breakChance = (p: Player) => Math.max(CFG.breakMin, CFG.breakBase - CFG.breakPerEngineer * p.staff.engineer);
export const canFestival = (p: Player) => !p.festival && p.money >= CFG.festivalCost;
export const hasHuman = (s: GameState) => s.players.some((p) => !p.isAI);

function eventMods(s: GameState, type: FacilityType) {
  let income = 0;
  let sat = 0;
  for (const e of s.event?.effects ?? []) {
    if (matches(e.target, type)) {
      income += e.income ?? 0;
      sat += e.sat ?? 0;
    }
  }
  return { income, sat };
}

/* ───────── 세팅 ───────── */

function makeVisitors(s: GameState, n: number): Visitor[] {
  const out: Visitor[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: s.nextVisitorId++,
      kind: i % 2 === 0 ? 'child' : 'adult',
      fav: pick(s, RIDE_TYPES),
      budget: 1 + Math.floor(rand(s) * 4),
    });
  }
  return shuffle(s, out);
}

export function drawVisitor(s: GameState): Visitor {
  if (s.visitorDeck.length === 0) s.visitorDeck = makeVisitors(s, CFG.visitorDeckSize);
  return s.visitorDeck.pop()!;
}

export function newGame(opts: { aiCount: number; humans?: number; seed?: number; humanName?: string; profiles?: string[] }): GameState {
  // 사람은 0~1명(핫시트 미지원), 전체 인원은 minPlayers~maxPlayers
  const humans = Math.max(0, Math.min(1, Math.floor(opts.humans ?? 1)));
  const aiCount = Math.max(CFG.minPlayers - humans, Math.min(CFG.maxPlayers - humans, Math.floor(opts.aiCount) || 0));
  const s: GameState = {
    round: 0,
    maxRounds: CFG.rounds,
    phase: 'construct',
    players: [],
    first: 0,
    startFirst: 0,
    turn: 0,
    passed: [],
    market: [],
    facilityDeck: [],
    visitorDeck: [],
    visitorRow: [],
    promoteStep: 'pick',
    pickTurn: 0,
    pickDone: [],
    eventDeck: [],
    event: null,
    nextVisitorId: 1,
    rng: opts.seed ?? (Math.random() * 2 ** 32) >>> 0,
    log: [],
    notice: null,
  };
  const aiNames = ['미니', '코코', '루루', '팝콘', '봉봉'];
  const total = humans + aiCount;
  for (let i = 0; i < total; i++) {
    const isAI = i >= humans;
    s.players.push({
      id: i,
      name: isAI ? `${aiNames[i - humans]} 파크` : (opts.humanName ?? '내 파크'),
      isAI,
      ai: isAI ? (opts.profiles?.[i - humans] ?? 'balanced') : undefined,
      money: CFG.startMoney,
      vp: 0,
      satPool: 0,
      facilities: Array(CFG.slots).fill(null),
      staff: { engineer: 0, marketer: 0, cleaner: 0, guide: 0, researcher: 0 },
      trash: 0,
      fee: 2,
      freeRepairs: 0,
      freeCleans: 0,
      festival: false,
      visitors: [],
      report: null,
    });
  }
  s.maxRounds = CFG.roundsByPlayers[total] ?? CFG.rounds;
  // 1라운드 선 플레이어는 무작위. 순서가 늦을수록 시작 자금을 더 받는다.
  s.startFirst = Math.floor(rand(s) * total);
  for (const p of s.players) p.money += seatMoney(total, (p.id - s.startFirst + total) % total);
  s.facilityDeck = shuffle(s, FACILITIES.map((c) => c.id));
  s.visitorDeck = makeVisitors(s, CFG.visitorDeckSize);
  s.eventDeck = shuffle(s, EVENTS.map((e) => e.id));
  startRound(s);
  settle(s);
  return s;
}

/** 1라운드 순서 seat(0부터)의 추가 시작 자금 */
export const seatMoney = (players: number, seat: number) =>
  CFG.seatMoneyByPlayers[players]?.[seat] ?? Math.floor(seat * CFG.seatBonus);

/** 라운드 선 플레이어: 순환 또는 (catchUpOrder) VP가 가장 낮은 쪽 */
function nextFirst(s: GameState): number {
  const n = s.players.length;
  if (s.round === 1) return s.startFirst;
  if (!CFG.catchUpOrder) return (s.startFirst + s.round - 1) % n;
  const dist = (i: number) => (i - (s.first + 1) + n * 2) % n;
  return [...s.players].sort((a, b) => a.vp - b.vp || a.money - b.money || dist(a.id) - dist(b.id))[0].id;
}

function startRound(s: GameState) {
  s.round++;
  s.phase = 'construct';
  if (s.eventDeck.length === 0) s.eventDeck = shuffle(s, EVENTS.map((e) => e.id));
  const eventId = s.eventDeck.pop()!;
  s.event = EVENTS.find((e) => e.id === eventId)!;
  // 팔리지 않은 시장 카드는 버린다. 덱이 비면 (지어진 카드·시장 카드를 뺀) 나머지로 다시 섞는다.
  s.market = [];
  const size = marketSizeFor(s.players.length);
  for (let i = 0; i < size; i++) {
    if (s.facilityDeck.length === 0) {
      const used = new Set<number>(s.market);
      for (const p of s.players) for (const f of p.facilities) if (f) used.add(f.id);
      s.facilityDeck = shuffle(s, FACILITIES.map((c) => c.id).filter((id) => !used.has(id)));
      if (s.facilityDeck.length === 0) break;
    }
    s.market.push(s.facilityDeck.pop()!);
  }
  for (const p of s.players) p.festival = false;
  s.passed = s.players.map(() => false);
  s.first = nextFirst(s);
  s.turn = s.first;
  log(s, `${s.round}라운드 · ${s.event.name}`);
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
  for (let guard = 0; guard < 2000; guard++) {
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
        if (s.promoteStep === 'pick') {
          if (s.pickDone.every(Boolean)) {
            s.promoteStep = 'fee';
            for (const p of s.players) if (p.isAI) p.fee = aiFee(p);
            break;
          }
          const p = s.players[s.pickTurn];
          if (!p.isAI) return;
          aiPickTurn(s, p);
          break;
        }
        if (human) return;
        runOperate(s);
        break;
      }
      case 'operate':
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

function startPromote(s: GameState) {
  s.phase = 'promote';
  s.promoteStep = 'pick';
  const total = s.players.reduce((n, p) => n + visitorQuota(s, p), 0) + CFG.rowExtra;
  s.visitorRow = Array.from({ length: total }, () => ({ v: drawVisitor(s), by: null }));
  for (const p of s.players) p.visitors = [];
  s.pickDone = s.players.map((p) => visitorQuota(s, p) === 0);
  s.pickTurn = CFG.pickOrder ? (s.first + s.players.length - 1) % s.players.length : s.first;
  if (s.pickDone[s.pickTurn]) advancePick(s);
  log(s, `관객 ${total}명이 입구 앞에 모였어요`);
}

/** 다음으로 관객을 고를 플레이어에게 차례를 넘긴다 */
function advancePick(s: GameState) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (s.pickTurn + k) % n;
    if (!s.pickDone[i]) {
      s.pickTurn = i;
      return;
    }
  }
}

function takeVisitor(s: GameState, p: Player, visitorId: number): boolean {
  const slot = s.visitorRow.find((r) => r.v.id === visitorId && r.by === null);
  if (!slot) return false;
  slot.by = p.id;
  p.visitors.push(slot.v);
  if (p.visitors.length >= visitorQuota(s, p) || s.visitorRow.every((r) => r.by !== null)) s.pickDone[p.id] = true;
  if (s.visitorRow.every((r) => r.by !== null)) s.pickDone = s.pickDone.map(() => true);
  advancePick(s);
  return true;
}

function runOperate(s: GameState) {
  s.phase = 'operate';
  const ev = s.event!;
  for (const p of s.players) {
    p.report = operatePlayer(s, p);
    if (ev.breakCount) breakRandom(s, p, ev.breakCount, p.report);
  }
  for (const p of s.players) {
    const r = p.report!;
    const net = r.income + r.feeIncome - r.upkeep;
    log(s, `${p.name}: 관객 ${r.entered}명 · 수익 ${net < 0 ? '-' : ''}$${Math.abs(net)} · VP +${r.vpGain}`);
  }
}

function startManage(s: GameState) {
  s.phase = 'manage';
  for (const p of s.players) {
    const fxs = activeEffects(p);
    p.freeRepairs = p.staff.engineer + fxs.reduce((n, fx) => n + (fx.freeRepair ?? 0), 0);
    p.freeCleans = p.staff.cleaner * 2 + fxs.reduce((n, fx) => n + (fx.freeClean ?? 0), 0);
    // 무료 처리는 자동 적용 (수리는 가치가 높은 시설부터)
    while (p.freeRepairs > 0 && repairOne(s, p, true, mostValuableBroken(p))) p.freeRepairs--;
    while (p.freeCleans > 0 && p.trash > 0) {
      p.trash--;
      p.freeCleans--;
    }
    if (p.isAI) aiManage(s, p);
  }
}

function finishRound(s: GameState) {
  for (const p of s.players) {
    // 치우지 않은 쓰레기는 남아서 다음 라운드에도 다시 감점된다. VP는 음수가 될 수 있다.
    const penalty = trashPenaltyOf(p.trash);
    p.vp -= penalty;
    if (p.report) p.report.trashPenalty = penalty;
    if (penalty > 0) log(s, `${p.name}: 쓰레기 ${p.trash}개 → VP -${penalty}`);
  }
  probe.roundEnd?.(s);
  if (s.round >= s.maxRounds) {
    if (CFG.moneyPerVp > 0) {
      for (const p of s.players) {
        p.endBonus = Math.floor(p.money / CFG.moneyPerVp);
        p.vp += p.endBonus;
      }
    }
    s.phase = 'gameOver';
    const w = winners(s);
    log(s, w.length > 1 ? `${w.map((p) => p.name).join(', ')} 공동 승리!` : `${w[0].name} 승리!`);
    return;
  }
  startRound(s);
}

/** 순위: VP → 잔액 순. 둘 다 같으면 공동 순위 (winners) */
export function rankings(s: GameState): Player[] {
  return [...s.players].sort((a, b) => b.vp - a.vp || b.money - a.money);
}
/** 1위 (VP·잔액이 모두 같으면 공동 1위 여러 명) */
export function winners(s: GameState): Player[] {
  const top = rankings(s)[0];
  return s.players.filter((p) => p.vp === top.vp && p.money === top.money);
}

/* ───────── 운영 ───────── */

export const facilityValue = (c: FacilityCard) => (c.income[0] + c.income[1]) / 4 + (c.sat[0] + c.sat[1]) / 2 / CFG.satPerVp * 2;

/** 고장 나지 않은 시설들의 특수효과 */
function activeEffects(p: Player): CardEffect[] {
  return p.facilities.filter((f): f is Built => !!f && !f.broken).map((f) => effectOf(f.id));
}

function mostValuableBroken(p: Player): number | undefined {
  let best: number | undefined;
  p.facilities.forEach((f, i) => {
    if (!f?.broken) return;
    if (best === undefined || facilityValue(FACILITY_BY_ID[f.id]) > facilityValue(FACILITY_BY_ID[p.facilities[best]!.id])) best = i;
  });
  return best;
}

/** 관객 v가 시설 c를 1회 이용할 때의 수익·만족도 (이벤트·취향·특수효과 포함) */
export function visitValue(s: GameState, c: FacilityCard, v: Visitor) {
  const k = v.kind === 'child' ? 0 : 1;
  const fx = effectOf(c.id);
  const fav = c.type === v.fav;
  const m = eventMods(s, c.type);
  const t = tagBonus(s, fx);
  const income = Math.max(0, incomeOf(c, v.kind) + m.income + t.income);
  const sat = Math.max(
    0,
    c.sat[k] + (fav ? 1 + (fx.favSat ?? 0) : 0) + (v.kind === 'child' ? fx.childSat ?? 0 : fx.adultSat ?? 0) + m.sat + t.sat,
  );
  return { income, sat };
}

export function operatePlayer(s: GameState, p: Player): RoundReport {
  const ev = s.event!;
  const rep: RoundReport = {
    drawn: 0, entered: 0, fee: p.fee, feeIncome: 0, visits: [], unserved: 0, income: 0, upkeep: 0, sat: 0,
    vpGain: 0, broken: [], trashAdded: 0, unservedSat: 0, bonusSat: 0, bonusIncome: 0, debtVp: 0, trashPenalty: 0,
  };
  const drawn: Visitor[] = p.visitors;
  rep.drawn = drawn.length;
  const entered = drawn.filter((v) => willEnter(v, p.fee));
  rep.entered = entered.length;
  rep.feeIncome = entered.length * p.fee;

  const active = p.facilities
    .map((f, i) => ({ f, i, c: FACILITY_BY_ID[f?.id ?? 0] }))
    .filter((x): x is { f: Built; i: number; c: FacilityCard } => !!x.f && !x.f.broken);
  const cap = new Map<number, number>();
  const served = new Map<number, number>();
  active.forEach((a) => cap.set(a.i, baseCapacity(a.c)));
  [...active]
    .sort((a, b) => facilityValue(b.c) - facilityValue(a.c))
    .slice(0, p.staff.guide)
    .forEach((a) => cap.set(a.i, (cap.get(a.i) ?? 1) + 1));

  const choose = (v: Visitor, side: boolean, n: number) =>
    active
      .filter((a) => isSideStop(a.c) === side && (cap.get(a.i) ?? 0) > 0)
      .map((a) => {
        const val = visitValue(s, a.c, v);
        return { a, val, score: val.sat + (a.c.type === v.fav ? 3 : 0) + val.income * 0.3 };
      })
      .sort((x, y) => y.score - x.score)
      .slice(0, n);

  let sat = 0;
  for (const v of entered) {
    // 놀이기구 최대 2곳 + 상점·부대시설 1곳 (상점·부대시설은 놀이기구 자리를 빼앗지 않는다)
    const opts = choose(v, false, CFG.ridesPerVisitor);
    for (const o of opts) cap.set(o.a.i, (cap.get(o.a.i) ?? 0) - 1);
    const extra = choose(v, true, CFG.sideStopsPerVisitor);
    for (const o of extra) cap.set(o.a.i, (cap.get(o.a.i) ?? 0) - 1);
    const used = [...opts, ...extra];
    if (used.length === 0) {
      rep.unserved++;
      rep.unservedSat += CFG.unservedSat;
    }
    for (const o of used) {
      rep.visits.push({ visitor: v, facility: o.a.c.name, facilityType: o.a.c.type, income: o.val.income, sat: o.val.sat });
      rep.income += o.val.income;
      sat += o.val.sat;
      probe.visit?.(p, o.a.c.id, o.val.income, o.val.sat);
      served.set(o.a.i, (served.get(o.a.i) ?? 0) + 1);
      if (rand(s) < CFG.trashChance) rep.trashAdded++;
    }
  }

  // 패시브 특수효과 (고장 나지 않은 시설)
  const kids = entered.filter((v) => v.kind === 'child').length;
  const adults = entered.length - kids;
  for (const a of active) {
    const fx = effectOf(a.c.id);
    rep.bonusSat += (fx.perChild ?? 0) * kids + (fx.perAdult ?? 0) * adults + (fx.flatSat ?? 0);
    if (fx.crowdIncome && entered.length >= fx.crowdIncome.min) rep.bonusIncome += fx.crowdIncome.income;
  }
  rep.bonusSat += p.staff.researcher * CFG.researchSat;
  rep.income += rep.bonusIncome;

  for (const f of p.facilities) {
    if (!f) continue;
    const c = FACILITY_BY_ID[f.id];
    const up = effectOf(c.id).upkeepOn;
    rep.upkeep += c.upkeep + (up && ev.tags.includes(up.tag) ? up.n : 0);
  }
  p.money += rep.feeIncome + rep.income - rep.upkeep;

  // 이번 라운드 만족도는 0 미만이 되지 않는다
  rep.sat = Math.max(0, sat + rep.bonusSat - rep.unservedSat);
  p.satPool += rep.sat;
  rep.vpGain = Math.floor(p.satPool / CFG.satPerVp);
  p.satPool -= rep.vpGain * CFG.satPerVp;
  p.vp += rep.vpGain;

  // 적자: $debtPerVp마다 VP -1 (올림), 돈은 0으로. VP는 음수가 될 수 있다.
  if (p.money < 0) {
    probe.debt?.(p);
    rep.debtVp = Math.ceil(-p.money / CFG.debtPerVp);
    p.vp -= rep.debtVp;
    p.money = 0;
  }

  const pBreak = breakChance(p);
  for (const [slot] of served) {
    const f = p.facilities[slot]!;
    if (effectOf(f.id).noBreak) continue;
    if (rand(s) < pBreak) {
      f.broken = true;
      rep.broken.push(FACILITY_BY_ID[f.id].name);
    }
  }
  rep.trashAdded += ev.trashDelta ?? 0;
  p.trash += rep.trashAdded;
  return rep;
}

/** 정전 등 이벤트 고장 (고장 안 나는 시설·정전 면제 공원 제외) */
function breakRandom(s: GameState, p: Player, n: number, rep: RoundReport) {
  if (s.event?.tags.includes('blackout') && activeEffects(p).some((fx) => fx.blackoutImmune)) return;
  for (let k = 0; k < n; k++) {
    const ok = p.facilities.map((f, i) => (f && !f.broken && !effectOf(f.id).noBreak ? i : -1)).filter((i) => i >= 0);
    if (ok.length === 0) return;
    const i = pick(s, ok);
    p.facilities[i]!.broken = true;
    rep.broken.push(FACILITY_BY_ID[p.facilities[i]!.id].name);
  }
}

/* ───────── 관리 ───────── */

function repairOne(s: GameState, p: Player, free: boolean, slot?: number): boolean {
  const idx = slot ?? p.facilities.findIndex((f) => f?.broken);
  const f = p.facilities[idx];
  if (!f || !f.broken) return false;
  if (!free) {
    if (p.money < CFG.repairCost) return false;
    p.money -= CFG.repairCost;
  }
  f.broken = false;
  log(s, `${p.name}: ${FACILITY_BY_ID[f.id].name} 수리`);
  return true;
}

function aiManage(s: GameState, p: Player) {
  // 마지막 라운드에는 운영이 없으니 수리하지 않는다 (청소는 감점을 막으므로 한다)
  if (s.round < s.maxRounds) {
    for (let i = mostValuableBroken(p); i !== undefined && repairOne(s, p, false, i); i = mostValuableBroken(p));
  }
  while (p.trash > 0 && p.money >= CFG.cleanCost) {
    p.money -= CFG.cleanCost;
    p.trash--;
  }
}

/* ───────── AI ───────── */

/** 내 입구에 모인 관객 기준으로 (입장료 + 관객 가치)가 가장 큰 입장료 */
function aiFee(p: Player): number {
  let best = 1;
  let bestScore = -1;
  for (let f = 0; f <= CFG.maxFee; f++) {
    const score = p.visitors.filter((v) => v.budget >= f).length * (f + 3);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

/** 내 시설과 잘 맞고, 입장료를 낼 수 있는 관객일수록 높은 점수 */
function visitorScore(p: Player, v: Visitor): number {
  const k = v.kind === 'child' ? 0 : 1;
  const scores = p.facilities
    .filter((f): f is Built => !!f && !f.broken)
    .map((f) => {
      const c = FACILITY_BY_ID[f.id];
      return c.sat[k] + (c.type === v.fav ? 3 : 0) + incomeOf(c, v.kind) * 0.3;
    })
    .sort((a, b) => b - a);
  return (scores[0] ?? 0) + 0.5 * (scores[1] ?? 0) + (v.budget >= 2 ? 1.5 : 0) + 0.3 * v.budget;
}

function aiPickTurn(s: GameState, p: Player) {
  const open = s.visitorRow.filter((r) => r.by === null).map((r) => r.v);
  if (open.length === 0) {
    s.pickDone[p.id] = true;
    advancePick(s);
    return;
  }
  const best = open.reduce((a, b) => (visitorScore(p, b) > visitorScore(p, a) ? b : a));
  takeVisitor(s, p, best.id);
  log(s, `${p.name}: 관객 선택 (${best.kind === 'child' ? '어린이' : '성인'}·${best.fav}·$${best.budget})`);
}

/** AI 성향. 밸런스 시뮬레이션에서 "한 전략이 압도하지 않는지" 확인하는 데도 쓴다. */
export interface AiProfile {
  label: string;
  /** 시설 가치 배율 */
  buyScale: number;
  /** 구매에 필요한 최소 순이익 */
  buyMin: number;
  /** 인력별 라운드당 기대 이득 (고용 판단) */
  hire: Record<StaffKey, number>;
  /** 고용 문턱 (높을수록 신중) */
  hireRatio: number;
  /** 남겨둘 현금 */
  reserve: number;
  /** 실험용: 이 레벨까지 해당 인력을 최우선 고용 */
  force?: Partial<Record<StaffKey, number>>;
}

const H = (marketer: number, guide: number, engineer: number, cleaner: number, researcher: number) => ({ marketer, guide, engineer, cleaner, researcher });

export const AI_PROFILES: Record<string, AiProfile> = {
  balanced: { label: '균형', buyScale: 0.6, buyMin: 2.5, hire: H(6, 5.63, 3.6, 2.5, 4.5), hireRatio: 0.6, reserve: 0 },
  builder: { label: '건설 중심', buyScale: 1.2, buyMin: 0, hire: H(2, 1, 1, 1, 1), hireRatio: 1.4, reserve: 0 },
  staff: { label: '인력 중심', buyScale: 0.9, buyMin: 3, hire: H(6, 4, 4, 4, 5), hireRatio: 0.8, reserve: 0 },
  audience: { label: '관객 중심', buyScale: 1, buyMin: 1, hire: H(12, 5, 1, 1, 1), hireRatio: 0.8, reserve: 0 },
  frugal: { label: '절약', buyScale: 1, buyMin: 4, hire: H(3, 2, 2, 2, 2), hireRatio: 1.3, reserve: 3 },
  // 인력 가치 측정용 (균형 AI + 해당 인력 우선 고용)
  x_marketer: { label: '실험:마케팅', buyScale: 1, buyMin: 1, hire: H(0, 0, 0, 0, 0), hireRatio: 99, reserve: 0, force: { marketer: 2 } },
  x_guide: { label: '실험:안내', buyScale: 1, buyMin: 1, hire: H(0, 0, 0, 0, 0), hireRatio: 99, reserve: 0, force: { guide: 2 } },
  x_engineer: { label: '실험:엔지니어', buyScale: 1, buyMin: 1, hire: H(0, 0, 0, 0, 0), hireRatio: 99, reserve: 0, force: { engineer: 2 } },
  x_cleaner: { label: '실험:미화원', buyScale: 1, buyMin: 1, hire: H(0, 0, 0, 0, 0), hireRatio: 99, reserve: 0, force: { cleaner: 2 } },
  x_researcher: { label: '실험:연구원', buyScale: 1, buyMin: 1, hire: H(0, 0, 0, 0, 0), hireRatio: 99, reserve: 0, force: { researcher: 2 } },
  x_none: { label: '실험:인력없음', buyScale: 1, buyMin: 1, hire: H(0, 0, 0, 0, 0), hireRatio: 99, reserve: 0 },
};

for (const k of STAFF_KEYS) {
  AI_PROFILES['b_' + k] = { ...AI_PROFILES.balanced, label: '균형+' + k, force: { [k]: 2 } };
}

/** 이벤트 태그가 나올 확률 (덱 기준) */
const tagRate = (tag: EventTag) => EVENTS.filter((e) => e.tags.includes(tag)).length / EVENTS.length;

/** 특수효과의 라운드당 대략적 가치 (수익 $, 만족도) */
function effectValue(c: FacilityCard, cap: number) {
  const fx = effectOf(c.id);
  let inc = 0;
  let sat = 0;
  for (const o of fx.on ?? []) {
    inc += cap * (o.income ?? 0) * tagRate(o.tag);
    sat += cap * (o.sat ?? 0) * tagRate(o.tag);
  }
  sat += cap * ((fx.favSat ?? 0) * 0.3 + ((fx.childSat ?? 0) + (fx.adultSat ?? 0)) / 2);
  sat += ((fx.perChild ?? 0) + (fx.perAdult ?? 0)) * 2 + (fx.flatSat ?? 0);
  if (fx.crowdIncome) inc += fx.crowdIncome.income * 0.5;
  inc += (fx.freeRepair ?? 0) * CFG.repairCost * 0.4 + (fx.freeClean ?? 0) * CFG.cleanCost * 0.8;
  if (fx.noBreak) inc += cap * CFG.breakBase * CFG.repairCost;
  if (fx.upkeepOn) inc -= fx.upkeepOn.n * tagRate(fx.upkeepOn.tag);
  return { inc, sat };
}

function evalCard(c: FacilityCard, left: number) {
  const inc = (incomeOf(c, 'child') + incomeOf(c, 'adult')) / 2;
  const sat = (c.sat[0] + c.sat[1]) / 2;
  const cap = baseCapacity(c);
  const fx = effectValue(c, cap);
  return (cap * inc + fx.inc - c.upkeep + (cap * sat + fx.sat) / CFG.satPerVp * 2.5) * left * 0.9;
}

function aiConstructTurn(s: GameState, p: Player) {
  const prof = AI_PROFILES[p.ai ?? 'balanced'] ?? AI_PROFILES.balanced;
  const left = s.maxRounds - s.round + 1;
  // 실험용 강제 고용
  if (prof.force && p.facilities.filter(Boolean).length >= 2) {
    for (const k of STAFF_KEYS) {
      const target = prof.force[k] ?? 0;
      if (p.staff[k] < Math.min(target, CFG.maxStaff) && CFG.hireCost(k, p.staff[k]) <= p.money) {
        doHire(s, p, k);
        return;
      }
    }
  }
  let best: { cardId: number; slot: number; net: number } | null = null;
  for (const id of s.market) {
    const c = FACILITY_BY_ID[id];
    const price = priceOf(p, c);
    if (price + prof.reserve > p.money) continue;
    const v = evalCard(c, left) * prof.buyScale;
    let slot = p.facilities.findIndex((f) => !f);
    let curV = 0;
    if (slot < 0) {
      let worst = Infinity;
      p.facilities.forEach((f, i) => {
        const fv = evalCard(FACILITY_BY_ID[f!.id], left) * prof.buyScale;
        if (fv < worst) {
          worst = fv;
          slot = i;
        }
      });
      curV = worst;
    }
    const net = v - curV - price;
    if (net > prof.buyMin && (!best || net > best.net)) best = { cardId: id, slot, net };
  }
  if (best) {
    doBuy(s, p, best.cardId, best.slot);
    return;
  }
  // 인력 고용
  const nFac = p.facilities.filter(Boolean).length;
  const gains: Record<StaffKey, number> = {
    marketer: prof.hire.marketer,
    guide: nFac >= 3 ? prof.hire.guide : 0,
    engineer: prof.hire.engineer,
    cleaner: prof.hire.cleaner,
    researcher: left >= 4 ? prof.hire.researcher : 0,
  };
  let hire: { staff: StaffKey; ratio: number } | null = null;
  for (const k of STAFF_KEYS) {
    const lv = p.staff[k];
    if (lv >= CFG.maxStaff) continue;
    const cost = CFG.hireCost(k, lv);
    if (cost + prof.reserve > p.money) continue;
    const ratio = (gains[k] * left) / (cost * 1.5);
    if (ratio > prof.hireRatio && (!hire || ratio > hire.ratio)) hire = { staff: k, ratio };
  }
  if (hire) {
    doHire(s, p, hire.staff);
    return;
  }
  // 축제: 남은 돈이 VP로 바뀌는 비율($moneyPerVp)보다 낫고, 후반이거나 돈이 넉넉할 때
  if (canFestival(p) && p.money - CFG.festivalCost >= prof.reserve && (left <= CFG.festivalLeft || p.money >= CFG.festivalRich)) {
    doFestival(s, p);
    return;
  }
  s.passed[p.id] = true;
}

/* ───────── 행동 처리 ───────── */

function doBuy(s: GameState, p: Player, cardId: number, slot: number) {
  const c = FACILITY_BY_ID[cardId];
  probe.buy?.(p, cardId, priceOf(p, c), s.round);
  p.money -= priceOf(p, c);
  const old = p.facilities[slot];
  p.facilities[slot] = { id: cardId, broken: false };
  s.market = s.market.filter((id) => id !== cardId);
  log(s, `${p.name}: ${c.name} 건설${old ? ` (${FACILITY_BY_ID[old.id].name} 철거)` : ''}`);
}

function doFestival(s: GameState, p: Player) {
  p.money -= CFG.festivalCost;
  p.vp += CFG.festivalVp;
  p.festival = true;
  log(s, `${p.name}: 축제 개최 (VP +${CFG.festivalVp})`);
}

function doHire(s: GameState, p: Player, k: StaffKey) {
  probe.hire?.(p, k, s.round);
  p.money -= CFG.hireCost(k, p.staff[k]);
  p.staff[k]++;
  log(s, `${p.name}: ${STAFF_LABEL[k]} 고용 (Lv.${p.staff[k]})`);
}

export const STAFF_LABEL: Record<StaffKey, string> = {
  engineer: '엔지니어',
  marketer: '마케팅 전문가',
  cleaner: '환경 미화원',
  guide: '안내 직원',
  researcher: '연구원',
};

/** 사람 플레이어의 행동. 잘못된 행동이면 notice만 채워 돌려준다. */
export function dispatch(prev: GameState, a: Action): GameState {
  const s = structuredClone(prev);
  s.notice = null;
  const err = apply(s, a);
  if (err) {
    s.notice = err;
    return s;
  }
  settle(s);
  return s;
}

function apply(s: GameState, a: Action): string | null {
  const p = s.players[HUMAN];
  const need = (ph: Phase) => (s.phase === ph ? null : '지금은 할 수 없는 행동이에요');
  switch (a.type) {
    case 'buy': {
      const e = need('construct') ?? (s.turn === HUMAN && !s.passed[HUMAN] ? null : '내 차례가 아니에요');
      if (e) return e;
      if (!s.market.includes(a.cardId)) return '이미 팔린 카드예요';
      if (!Number.isInteger(a.slot) || a.slot < 0 || a.slot >= CFG.slots) return '잘못된 자리예요';
      const c = FACILITY_BY_ID[a.cardId];
      if (priceOf(p, c) > p.money) return '돈이 부족해요';
      doBuy(s, p, a.cardId, a.slot);
      advanceTurn(s);
      return null;
    }
    case 'hire': {
      const e = need('construct') ?? (s.turn === HUMAN && !s.passed[HUMAN] ? null : '내 차례가 아니에요');
      if (e) return e;
      if (p.staff[a.staff] >= CFG.maxStaff) return '이미 최고 등급이에요';
      if (CFG.hireCost(a.staff, p.staff[a.staff]) > p.money) return '돈이 부족해요';
      doHire(s, p, a.staff);
      advanceTurn(s);
      return null;
    }
    case 'festival': {
      const e = need('construct') ?? (s.turn === HUMAN && !s.passed[HUMAN] ? null : '내 차례가 아니에요');
      if (e) return e;
      if (p.festival) return '축제는 라운드당 한 번만 열 수 있어요';
      if (p.money < CFG.festivalCost) return '돈이 부족해요';
      doFestival(s, p);
      advanceTurn(s);
      return null;
    }
    case 'pass': {
      const e = need('construct') ?? (s.turn === HUMAN ? null : '내 차례가 아니에요');
      if (e) return e;
      s.passed[HUMAN] = true;
      advanceTurn(s);
      return null;
    }
    case 'pickVisitor': {
      const e = need('promote') ?? (s.promoteStep === 'pick' && s.pickTurn === HUMAN && !s.pickDone[HUMAN] ? null : '내 차례가 아니에요');
      if (e) return e;
      if (!takeVisitor(s, p, a.visitorId)) return '이미 다른 공원이 데려갔어요';
      return null;
    }
    case 'donePicking': {
      const e = need('promote') ?? (s.promoteStep === 'pick' && s.pickTurn === HUMAN && !s.pickDone[HUMAN] ? null : '지금은 할 수 없어요');
      if (e) return e;
      s.pickDone[HUMAN] = true;
      advancePick(s);
      return null;
    }
    case 'setFee': {
      const e = need('promote') ?? (s.promoteStep === 'fee' ? null : '먼저 관객을 고르세요');
      if (e) return e;
      if (!Number.isFinite(a.fee)) return '잘못된 입장료예요';
      p.fee = Math.max(0, Math.min(CFG.maxFee, Math.round(a.fee)));
      return null;
    }
    case 'confirmFee': {
      const e = need('promote') ?? (s.promoteStep === 'fee' ? null : '먼저 관객을 고르세요');
      if (e) return e;
      runOperate(s);
      return null;
    }
    case 'continue': {
      const e = need('operate');
      if (e) return e;
      startManage(s);
      return null;
    }
    case 'repair': {
      const e = need('manage');
      if (e) return e;
      if (!Number.isInteger(a.slot) || !p.facilities[a.slot]?.broken) return '고장난 시설이 아니에요';
      if (!repairOne(s, p, false, a.slot)) return '돈이 부족해요';
      return null;
    }
    case 'clean': {
      const e = need('manage');
      if (e) return e;
      if (p.trash <= 0) return '치울 쓰레기가 없어요';
      if (p.money < CFG.cleanCost) return '돈이 부족해요';
      p.money -= CFG.cleanCost;
      p.trash--;
      return null;
    }
    case 'endManage': {
      const e = need('manage');
      if (e) return e;
      finishRound(s);
      return null;
    }
  }
}

/** UI용: 현재 사람 플레이어가 행동 가능한지 */
export const isHumanTurn = (s: GameState) =>
  s.phase === 'construct' && s.turn === HUMAN && !s.passed[HUMAN];
