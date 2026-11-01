import {
  CAP,
  FULL_HOLES_TO_END,
  HOLE_COUNT,
  INITIAL_RESERVES,
  MAX_PLACE_PER_TURN,
  SETUP_TOKENS,
} from './constants';
import type { Action, GameEvent, GameState, Player, Step } from './types';

// ---------- 상태 생성·조회 ----------

export function initialState(): GameState {
  return {
    holes: Array.from({ length: HOLE_COUNT }, () => []),
    reserves: [INITIAL_RESERVES[0], INITIAL_RESERVES[1]],
    setupLeft: [SETUP_TOKENS, SETUP_TOKENS],
    current: 0,
    phase: 'setup',
    bus: [],
    busPos: 0,
    source: -1,
    placedThisTurn: 0,
    version: 0,
  };
}

export function cloneState(s: GameState): GameState {
  return {
    holes: s.holes.map((h) => h.slice()),
    reserves: [s.reserves[0], s.reserves[1]],
    setupLeft: [s.setupLeft[0], s.setupLeft[1]],
    current: s.current,
    phase: s.phase,
    bus: s.bus.slice(),
    busPos: s.busPos,
    source: s.source,
    placedThisTurn: s.placedThisTurn,
    version: s.version,
  };
}

export const other = (p: Player): Player => (p === 0 ? 1 : 0);

export const isFull = (s: GameState, i: number): boolean => s.holes[i].length >= CAP[i];

export function fullCount(s: GameState): number {
  let n = 0;
  for (let i = 0; i < HOLE_COUNT; i++) if (isFull(s, i)) n++;
  return n;
}

export function hasOpenHole(s: GameState): boolean {
  for (let i = 0; i < HOLE_COUNT; i++) if (!isFull(s, i)) return true;
  return false;
}

/** 현재 플레이어가 예비군을 투입할 수 있는가 */
export const canPlace = (s: GameState): boolean => s.reserves[s.current] > 0 && hasOpenHole(s);

/** 버스 위치 다음 칸부터 시계 방향으로 6칸(출발 권역 포함)을 보며 처음 만나는 포화 아닌 권역. 없으면 -1 */
export function nextStop(s: GameState): number {
  for (let k = 1; k <= HOLE_COUNT; k++) {
    const j = (s.busPos + k) % HOLE_COUNT;
    if (!isFull(s, j)) return j;
  }
  return -1;
}

export function countColor(tokens: readonly Player[], color: Player): number {
  let n = 0;
  for (const t of tokens) if (t === color) n++;
  return n;
}

/** 권역을 차지한 후보. 빈 권역이면 null. 동점이면 맨 아래 토큰(⚑)의 색 */
export function holeOwner(s: GameState, i: number): Player | null {
  const h = s.holes[i];
  if (!h.length) return null;
  const blue = countColor(h, 0);
  const red = h.length - blue;
  return blue > red ? 0 : red > blue ? 1 : h[0];
}

export function score(s: GameState): [number, number] {
  const t: [number, number] = [0, 0];
  for (let i = 0; i < HOLE_COUNT; i++) {
    const o = holeOwner(s, i);
    if (o !== null) t[o] += CAP[i];
  }
  return t;
}

/** 승자. null = 무승부. 총점 → 남은 예비군 순으로 비교 */
export function winner(s: GameState): Player | null {
  const t = score(s);
  if (t[0] !== t[1]) return t[0] > t[1] ? 0 : 1;
  if (s.reserves[0] !== s.reserves[1]) return s.reserves[0] > s.reserves[1] ? 0 : 1;
  return null;
}

export const isOver = (s: GameState): boolean => s.phase === 'over';

/** 버스에 있는 색들(처음 등장한 순서) */
export function busColors(s: GameState): Player[] {
  const out: Player[] = [];
  for (const c of s.bus) if (!out.includes(c)) out.push(c);
  return out;
}

export function legalActions(s: GameState): Action[] {
  const out: Action[] = [];
  switch (s.phase) {
    case 'setup':
    case 'place':
      for (let i = 0; i < HOLE_COUNT; i++) if (!isFull(s, i)) out.push({ type: s.phase, hole: i });
      if (s.phase === 'place' && s.placedThisTurn >= 1) out.push({ type: 'endPlace' });
      break;
    case 'pick':
      for (let i = 0; i < HOLE_COUNT; i++) if (s.holes[i].length) out.push({ type: 'pick', hole: i });
      break;
    case 'sow':
      for (const c of busColors(s)) out.push({ type: 'drop', color: c });
      break;
    case 'over':
      break;
  }
  return out;
}

export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  if ('hole' in a && 'hole' in b) return a.hole === b.hole;
  if (a.type === 'drop' && b.type === 'drop') return a.color === b.color;
  return true;
}

export const isLegal = (s: GameState, a: Action): boolean => legalActions(s).some((x) => sameAction(x, a));

// ---------- 상태 전이 ----------
// 외부에는 불변: 입력 상태를 한 번 복제한 뒤 그 사본만 변경한다.

interface Ctx {
  s: GameState;
  /** null이면 연출 단위 기록을 생략(AI 탐색용 빠른 경로) */
  steps: Step[] | null;
  events: GameEvent[];
}

function emit(ctx: Ctx, e: GameEvent): void {
  if (ctx.steps) ctx.events.push(e);
}

/** 지금까지를 한 박자로 끊는다 */
function beat(ctx: Ctx): void {
  if (!ctx.steps) return;
  ctx.steps.push({ state: cloneState(ctx.s), events: ctx.events });
  ctx.events = [];
}

function hasTokens(s: GameState): boolean {
  return s.holes.some((h) => h.length > 0);
}

/** 턴(또는 셋업 직후)의 첫 단계를 정한다 */
function startTurn(ctx: Ctx): void {
  const s = ctx.s;
  if (canPlace(s)) s.phase = 'place';
  else if (hasTokens(s)) s.phase = 'pick';
  // 방어 코드: 투입도 출발도 불가능하면 턴을 넘긴다.
  // 도달 불가 — 보드 토큰은 출발(버스로 이동)과 낙선(모든 권역 포화 시)으로만 줄기 때문에 턴 시작 시 보드는 비지 않는다.
  else finishTurn(ctx);
}

function finishTurn(ctx: Ctx): void {
  const s = ctx.s;
  s.bus = [];
  if (fullCount(s) >= FULL_HOLES_TO_END || s.reserves[0] + s.reserves[1] === 0) {
    s.phase = 'over';
    emit(ctx, { type: 'gameOver' });
    return;
  }
  s.placedThisTurn = 0;
  s.current = other(s.current);
  emit(ctx, { type: 'turnEnd', next: s.current });
  startTurn(ctx);
}

function loseBus(ctx: Ctx, extra: Player[]): void {
  const tokens = extra.concat(ctx.s.bus);
  ctx.s.bus = [];
  if (tokens.length) emit(ctx, { type: 'lost', player: ctx.s.current, tokens });
}

function dropToken(ctx: Ctx, color: Player, auto: boolean): void {
  const s = ctx.s;
  s.bus.splice(s.bus.indexOf(color), 1);
  const t = nextStop(s);
  if (t < 0) {
    loseBus(ctx, [color]);
    return;
  }
  s.holes[t].push(color);
  s.busPos = t;
  emit(ctx, { type: 'drop', player: s.current, hole: t, color, auto });
  if (nextStop(s) < 0) loseBus(ctx, []);
}

/** 버스가 한 색만 남았으면 자동 하차, 비면 턴 종료 */
function settle(ctx: Ctx): void {
  const s = ctx.s;
  while (s.bus.length && s.bus.every((x) => x === s.bus[0])) {
    beat(ctx);
    dropToken(ctx, s.bus[0], true);
  }
  if (!s.bus.length) {
    beat(ctx);
    finishTurn(ctx);
  }
}

function run(ctx: Ctx, a: Action): void {
  const s = ctx.s;
  const p = s.current;
  s.version++;
  switch (a.type) {
    case 'setup':
      s.holes[a.hole].push(p);
      s.setupLeft[p]--;
      emit(ctx, { type: 'setup', player: p, hole: a.hole });
      s.current = other(p);
      if (s.setupLeft[0] + s.setupLeft[1] === 0) {
        s.current = 0;
        startTurn(ctx);
      }
      break;
    case 'place':
      s.holes[a.hole].push(p);
      s.reserves[p]--;
      s.placedThisTurn++;
      emit(ctx, { type: 'place', player: p, hole: a.hole });
      s.phase = s.placedThisTurn < MAX_PLACE_PER_TURN && canPlace(s) ? 'place' : 'pick';
      break;
    case 'endPlace':
      s.phase = 'pick';
      emit(ctx, { type: 'endPlace', player: p });
      break;
    case 'pick': {
      const tokens = s.holes[a.hole];
      s.bus = tokens.slice();
      s.holes[a.hole] = [];
      s.busPos = a.hole;
      s.source = a.hole;
      s.phase = 'sow';
      emit(ctx, { type: 'pick', player: p, hole: a.hole, count: tokens.length });
      settle(ctx);
      break;
    }
    case 'drop':
      dropToken(ctx, a.color, false);
      settle(ctx);
      break;
  }
}

function check(s: GameState, a: Action): void {
  if (!isLegal(s, a)) throw new Error(`허용되지 않는 액션: ${JSON.stringify(a)} (phase=${s.phase})`);
}

/**
 * 액션을 적용하고, 자동 하차·턴 종료까지 연출 박자별 상태를 돌려준다.
 * 첫 박자는 액션 직후, 이후 박자는 자동 하차 1개 또는 턴 종료마다 하나씩.
 */
export function resolveAction(s: GameState, a: Action): Step[] {
  check(s, a);
  const ctx: Ctx = { s: cloneState(s), steps: [], events: [] };
  run(ctx, a);
  beat(ctx);
  return ctx.steps!;
}

/** 액션을 적용한 최종 상태(자동 하차·턴 종료 포함). 입력은 변경하지 않는다 */
export function applyAction(s: GameState, a: Action): GameState {
  check(s, a);
  const ctx: Ctx = { s: cloneState(s), steps: null, events: [] };
  run(ctx, a);
  return ctx.s;
}

/** 검증 없이 적용(AI 탐색 전용: 액션이 합법임을 호출자가 보장) */
export function applyUnchecked(s: GameState, a: Action): GameState {
  const ctx: Ctx = { s: cloneState(s), steps: null, events: [] };
  run(ctx, a);
  return ctx.s;
}
