import { FACILITIES, FACILITY_BY_ID } from './data/facilities';
import { EVENTS } from './data/events';
import { nextRng } from './rng';
import {
  RIDE_TYPES,
  STAFF_KEYS,
  type Built,
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
  startMoney: 10,
  slots: 6,
  marketSize: 4,
  satPerVp: 4,
  maxStaff: 3,
  repairCost: 3,
  cleanCost: 1,
  baseVisitors: 2,
  maxFee: 4,
  breakBase: 0.25,
  breakPerEngineer: 0.08,
  breakMin: 0.04,
  trashChance: 0.5,
  visitorDeckSize: 48,
  /** 관객 트랙에 깔리는 카드 = 전원 수용량 합 + 여유분 */
  rowExtra: 2,
  hireCost: (level: number) => 4 + 2 * level,
};

export const OUTDOOR: FacilityType[] = ['스릴형', '패밀리형', '어드벤처형', '물놀이형', '놀이형'];

export type Action =
  | { type: 'buy'; cardId: number; slot: number }
  | { type: 'hire'; staff: StaffKey }
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

export const incomeOf = (c: FacilityCard, kind: 'child' | 'adult') => Math.ceil(c.income[kind === 'child' ? 0 : 1] / 2);
export const priceOf = (p: Player, c: FacilityCard) => Math.max(1, c.cost - p.staff.researcher);
export function visitorQuota(s: GameState, p: Player): number {
  return Math.max(0, CFG.baseVisitors + p.staff.marketer + (s.event?.visitorDelta ?? 0));
}
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

function drawVisitor(s: GameState): Visitor {
  if (s.visitorDeck.length === 0) s.visitorDeck = makeVisitors(s, CFG.visitorDeckSize);
  return s.visitorDeck.pop()!;
}

export function newGame(opts: { aiCount: number; humans?: number; seed?: number; humanName?: string }): GameState {
  const humans = opts.humans ?? 1;
  const s: GameState = {
    round: 0,
    maxRounds: CFG.rounds,
    phase: 'construct',
    players: [],
    first: 0,
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
  const aiNames = ['미니', '코코', '루루', '팝콘'];
  const total = humans + opts.aiCount;
  for (let i = 0; i < total; i++) {
    const isAI = i >= humans;
    s.players.push({
      id: i,
      name: isAI ? `${aiNames[i - humans]} 파크` : (opts.humanName ?? '내 파크'),
      isAI,
      money: CFG.startMoney,
      vp: 0,
      satPool: 0,
      facilities: Array(CFG.slots).fill(null),
      staff: { engineer: 0, marketer: 0, cleaner: 0, guide: 0, researcher: 0 },
      trash: 0,
      fee: 2,
      freeRepairs: 0,
      freeCleans: 0,
      visitors: [],
      report: null,
    });
  }
  s.facilityDeck = shuffle(s, FACILITIES.map((c) => c.id));
  s.visitorDeck = makeVisitors(s, CFG.visitorDeckSize);
  s.eventDeck = shuffle(s, EVENTS.map((e) => e.id));
  startRound(s);
  settle(s);
  return s;
}

function startRound(s: GameState) {
  s.round++;
  s.phase = 'construct';
  if (s.eventDeck.length === 0) s.eventDeck = shuffle(s, EVENTS.map((e) => e.id));
  const eventId = s.eventDeck.pop()!;
  s.event = EVENTS.find((e) => e.id === eventId)!;
  s.market = [];
  for (let i = 0; i < CFG.marketSize; i++) {
    if (s.facilityDeck.length === 0) s.facilityDeck = shuffle(s, FACILITIES.map((c) => c.id));
    s.market.push(s.facilityDeck.pop()!);
  }
  s.passed = s.players.map(() => false);
  s.first = (s.round - 1) % s.players.length;
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
  s.pickTurn = s.first;
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
    p.freeRepairs = p.staff.engineer;
    p.freeCleans = p.staff.cleaner * 2;
    // 인력의 무료 처리는 자동 적용
    while (p.freeRepairs > 0 && repairOne(s, p, true)) p.freeRepairs--;
    while (p.freeCleans > 0 && p.trash > 0) {
      p.trash--;
      p.freeCleans--;
    }
    if (p.isAI) aiManage(s, p);
  }
}

function finishRound(s: GameState) {
  for (const p of s.players) {
    const penalty = Math.floor(p.trash / 2);
    p.vp = Math.max(0, p.vp - penalty);
    if (p.report) p.report.trashPenalty = penalty;
    if (penalty > 0) log(s, `${p.name}: 쓰레기 ${p.trash}개 → VP -${penalty}`);
  }
  if (s.round >= s.maxRounds) {
    s.phase = 'gameOver';
    const ranked = rankings(s);
    log(s, `${ranked[0].name} 승리!`);
    return;
  }
  startRound(s);
}

export function rankings(s: GameState): Player[] {
  return [...s.players].sort((a, b) => b.vp - a.vp || b.money - a.money);
}

/* ───────── 운영 ───────── */

export const facilityValue = (c: FacilityCard) => (c.income[0] + c.income[1]) / 4 + (c.sat[0] + c.sat[1]) / 2 / CFG.satPerVp * 2;

function operatePlayer(s: GameState, p: Player): RoundReport {
  const ev = s.event!;
  const rep: RoundReport = {
    drawn: 0, entered: 0, fee: p.fee, feeIncome: 0, visits: [], unserved: 0, income: 0, upkeep: 0, sat: 0,
    vpGain: 0, broken: [], trashAdded: 0, debtVp: 0, trashPenalty: 0,
  };
  const drawn: Visitor[] = p.visitors;
  rep.drawn = drawn.length;
  const entered = drawn.filter((v) => v.budget >= p.fee);
  rep.entered = entered.length;
  rep.feeIncome = entered.length * p.fee;

  const active = p.facilities
    .map((f, i) => ({ f, i }))
    .filter((x): x is { f: Built; i: number } => !!x.f && !x.f.broken);
  const cap = new Map<number, number>();
  const served = new Map<number, number>();
  active.forEach((a) => cap.set(a.i, 1));
  [...active]
    .sort((a, b) => facilityValue(FACILITY_BY_ID[b.f.id]) - facilityValue(FACILITY_BY_ID[a.f.id]))
    .slice(0, p.staff.guide)
    .forEach((a) => cap.set(a.i, 2));

  for (const v of entered) {
    const opts = active
      .filter((a) => (cap.get(a.i) ?? 0) > 0)
      .map((a) => {
        const c = FACILITY_BY_ID[a.f.id];
        const k = v.kind === 'child' ? 0 : 1;
        return { a, c, score: c.sat[k] + (c.type === v.fav ? 3 : 0) + incomeOf(c, v.kind) * 0.3 };
      })
      .sort((x, y) => y.score - x.score)
      .slice(0, 2);
    if (opts.length === 0) rep.unserved++;
    for (const o of opts) {
      const m = eventMods(s, o.c.type);
      const income = Math.max(0, incomeOf(o.c, v.kind) + m.income);
      const sat = Math.max(0, o.c.sat[v.kind === 'child' ? 0 : 1] + (o.c.type === v.fav ? 1 : 0) + m.sat);
      rep.visits.push({ visitor: v, facility: o.c.name, facilityType: o.c.type, income, sat });
      rep.income += income;
      rep.sat += sat;
      cap.set(o.a.i, (cap.get(o.a.i) ?? 0) - 1);
      served.set(o.a.i, (served.get(o.a.i) ?? 0) + 1);
      if (rand(s) < CFG.trashChance) rep.trashAdded++;
    }
  }

  for (const f of p.facilities) {
    if (!f) continue;
    const c = FACILITY_BY_ID[f.id];
    rep.upkeep += c.upkeep + (ev.badWeather && c.id === 1 ? 2 : 0);
  }
  p.money += rep.feeIncome + rep.income - rep.upkeep;
  if (p.money < 0) {
    rep.debtVp = Math.ceil(-p.money / 2);
    p.vp = Math.max(0, p.vp - rep.debtVp);
    p.money = 0;
  }
  p.satPool += rep.sat;
  rep.vpGain = Math.floor(p.satPool / CFG.satPerVp);
  p.satPool -= rep.vpGain * CFG.satPerVp;
  p.vp += rep.vpGain;

  const pBreak = Math.max(CFG.breakMin, CFG.breakBase - CFG.breakPerEngineer * p.staff.engineer);
  for (const [slot] of served) {
    if (rand(s) < pBreak) {
      p.facilities[slot]!.broken = true;
      rep.broken.push(FACILITY_BY_ID[p.facilities[slot]!.id].name);
    }
  }
  p.trash += rep.trashAdded + (ev.trashDelta ?? 0);
  return rep;
}

function breakRandom(s: GameState, p: Player, n: number, rep: RoundReport) {
  for (let k = 0; k < n; k++) {
    const ok = p.facilities.map((f, i) => (f && !f.broken ? i : -1)).filter((i) => i >= 0);
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
  while (p.facilities.some((f) => f?.broken) && repairOne(s, p, false));
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

function evalCard(c: FacilityCard, left: number) {
  const inc = (incomeOf(c, 'child') + incomeOf(c, 'adult')) / 2;
  const sat = (c.sat[0] + c.sat[1]) / 2;
  return (inc - c.upkeep + (sat / CFG.satPerVp) * 2.5) * left * 0.9;
}

function aiConstructTurn(s: GameState, p: Player) {
  const left = s.maxRounds - s.round + 1;
  let best: { cardId: number; slot: number; net: number } | null = null;
  for (const id of s.market) {
    const c = FACILITY_BY_ID[id];
    const price = priceOf(p, c);
    if (price > p.money) continue;
    const v = evalCard(c, left);
    let slot = p.facilities.findIndex((f) => !f);
    let curV = 0;
    if (slot < 0) {
      let worst = Infinity;
      p.facilities.forEach((f, i) => {
        const fv = evalCard(FACILITY_BY_ID[f!.id], left);
        if (fv < worst) {
          worst = fv;
          slot = i;
        }
      });
      curV = worst;
    }
    const net = v - curV - price;
    if (net > 1 && (!best || net > best.net)) best = { cardId: id, slot, net };
  }
  if (best) {
    doBuy(s, p, best.cardId, best.slot);
    return;
  }
  // 인력 고용
  const nFac = p.facilities.filter(Boolean).length;
  const gains: Record<StaffKey, number> = {
    marketer: 4,
    guide: nFac >= 3 ? 2.5 : 0,
    engineer: 2.5,
    cleaner: 2.5,
    researcher: left >= 4 ? 3 : 0,
  };
  let hire: { staff: StaffKey; ratio: number } | null = null;
  for (const k of STAFF_KEYS) {
    const lv = p.staff[k];
    if (lv >= CFG.maxStaff) continue;
    const cost = CFG.hireCost(lv);
    if (cost > p.money) continue;
    const ratio = (gains[k] * left) / (cost * 1.5);
    if (ratio > 1 && (!hire || ratio > hire.ratio)) hire = { staff: k, ratio };
  }
  if (hire) {
    doHire(s, p, hire.staff);
    return;
  }
  s.passed[p.id] = true;
}

/* ───────── 행동 처리 ───────── */

function doBuy(s: GameState, p: Player, cardId: number, slot: number) {
  const c = FACILITY_BY_ID[cardId];
  p.money -= priceOf(p, c);
  const old = p.facilities[slot];
  p.facilities[slot] = { id: cardId, broken: false };
  s.market = s.market.filter((id) => id !== cardId);
  log(s, `${p.name}: ${c.name} 건설${old ? ` (${FACILITY_BY_ID[old.id].name} 철거)` : ''}`);
}

function doHire(s: GameState, p: Player, k: StaffKey) {
  p.money -= CFG.hireCost(p.staff[k]);
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
      if (a.slot < 0 || a.slot >= CFG.slots) return '잘못된 자리예요';
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
      if (CFG.hireCost(p.staff[a.staff]) > p.money) return '돈이 부족해요';
      doHire(s, p, a.staff);
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
      p.fee = Math.max(0, Math.min(CFG.maxFee, a.fee));
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
      if (!p.facilities[a.slot]?.broken) return '고장난 시설이 아니에요';
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
