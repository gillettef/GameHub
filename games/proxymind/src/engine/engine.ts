// PROXYMIND 규칙 엔진. 룰북 v0.3.1의 절 번호를 주석으로 단다.
// 모든 함수는 GameState를 직접 바꾼다. 바꾸지 않을 상태는 clone()으로 복사해서 넘긴다.
import {
  CORE_SPOTS,
  CORE_TOKENS,
  MAX_ENERGY,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PILLARS,
  ROUNDS,
  SIZE,
  START_ENERGY,
  STARTS,
  TILES,
} from './data';
import { createRng } from './rng';
import type { Act, CondId, Dir, GameEvent, GameState, GameStats, Intervention, PlayerKind, BotLevel, Pos } from './types';

export interface SeatSetup {
  name: string;
  kind: PlayerKind;
  level?: BotLevel;
}

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export const clone = (g: GameState): GameState => structuredClone(g);
export const tileOf = (g: GameState, inst: number) => TILES[g.tiles[inst]!]!;
/** 로봇 p의 설계자 = p의 왼쪽(시계 방향 다음) 플레이어 (6.1) */
export const designerOf = (g: GameState, p: number) => (p + 1) % g.n;
/** 설계자 d가 짜는 로봇 = d의 오른쪽 플레이어 */
export const targetOf = (g: GameState, d: number) => (d - 1 + g.n) % g.n;
/** 지금 실행 차례인 로봇 */
export const currentBot = (g: GameState) => (g.first + g.turn) % g.n;
export const score = (g: GameState, p: number) => g.players[p]!.cores * 2 + g.players[p]!.dp;

export function emptyStats(): GameStats {
  return {
    placed: {},
    triggered: {},
    ivs: { none: 0, turn: 0, block: 0, thrust: 0 },
    dpBump: 0,
    dpSpent: 0,
    coreByRule: 0,
    coreByThrust: 0,
  };
}

function draw(g: GameState, k: number): number[] {
  const rng = createRng(g.rng);
  const out: number[] = [];
  for (let i = 0; i < k && g.bag.length > 0; i++) out.push(g.bag.splice(rng.int(g.bag.length), 1)[0]!);
  g.rng = rng.state;
  return out;
}

/** 4. 준비 + 1라운드 시작 */
export function createGame(seats: SeatSetup[], seed: number, opts: { rounds?: number; first?: number } = {}): GameState {
  const n = seats.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`인원은 ${MIN_PLAYERS}~${MAX_PLAYERS}명이어야 합니다`);
  const rng = createRng(seed);
  const first = opts.first ?? rng.int(n);
  const tiles: number[] = [];
  TILES.forEach((t, i) => {
    for (let c = 0; c < t.count; c++) tiles.push(i);
  });
  const starts = STARTS[n]!;
  const g: GameState = {
    n,
    round: 0,
    rounds: opts.rounds ?? ROUNDS,
    phase: 'design',
    first,
    turn: 0,
    players: seats.map((s, i) => {
      const st = starts[(i - first + n) % n]!;
      return {
        name: s.name,
        kind: s.kind,
        level: s.level ?? 'normal',
        bot: { x: st.x, y: st.y, dir: st.dir },
        energy: START_ENERGY,
        cores: 0,
        dp: 0,
        spent: 0,
        brain: [null, null, null],
        blocked: null,
        hand: [],
        pending: null,
      };
    }),
    cores: CORE_SPOTS.map((p) => ({ ...p })),
    coreSupply: CORE_TOKENS - CORE_SPOTS.length,
    tiles,
    bag: tiles.map((_, i) => i),
    rng: rng.state,
    log: [],
    stats: emptyStats(),
  };
  startRound(g);
  return g;
}

/** 5.1 충전 + 5.2-1 뽑기 */
function startRound(g: GameState): void {
  g.round++;
  g.phase = 'design';
  g.turn = 0;
  g.log.push({ t: 'round', round: g.round, first: g.first });
  for (const p of g.players) p.energy = Math.min(MAX_ENERGY, p.energy + 1);
  for (let k = 0; k < g.n; k++) {
    const d = (g.first + k) % g.n;
    g.players[d]!.hand = draw(g, 5);
  }
}

/** 5.2-3·4: 설계자 d가 오른쪽 로봇에 놓을 3개를 슬롯 순서대로 고른다 */
export function submitDesign(g: GameState, d: number, slots: number[]): void {
  if (g.phase !== 'design') throw new Error('설계 단계가 아닙니다');
  const p = g.players[d]!;
  if (p.pending) throw new Error('이미 놓기를 마쳤습니다');
  if (slots.length !== 3 || new Set(slots).size !== 3 || !slots.every((s) => p.hand.includes(s)))
    throw new Error('뽑은 타일 중 서로 다른 3개를 골라야 합니다');
  p.pending = [...slots];
  if (g.players.every((q) => q.pending)) reveal(g);
}

/** 5.2-5: 모두 놓았으면 동시에 앞면으로 */
function reveal(g: GameState): void {
  g.players.forEach((d, i) => {
    const target = g.players[targetOf(g, i)]!;
    target.brain = [...d.pending!];
    for (const inst of d.pending!) {
      const code = tileOf(g, inst).code;
      g.stats.placed[code] = (g.stats.placed[code] ?? 0) + 1;
    }
  });
  g.phase = 'exec';
  g.turn = 0;
  g.log.push({ t: 'reveal' });
  g.log.push({ t: 'turnStart', p: currentBot(g) });
}

// ── 6.3 판정 기준 ────────────────────────────────────────────

const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
const isPillar = (x: number, y: number) => PILLARS.some((q) => q.x === x && q.y === y);
const botAt = (g: GameState, x: number, y: number, except: number) =>
  g.players.findIndex((p, i) => i !== except && p.bot.x === x && p.bot.y === y);
const coreAt = (g: GameState, x: number, y: number) => g.cores.findIndex((c) => c.x === x && c.y === y);

/** 막힌 칸: 아레나 밖, 기둥, 다른 로봇 */
export function blocked(g: GameState, x: number, y: number, self: number): boolean {
  return !inside(x, y) || isPillar(x, y) || botAt(g, x, y, self) >= 0;
}

/** 앞줄: 앞 칸부터 곧게. 아레나 끝·기둥 앞에서 끊기고, 처음 만난 로봇 칸까지 포함 */
export function line(g: GameState, p: number): { cells: Pos[]; bot: boolean } {
  const b = g.players[p]!.bot;
  const cells: Pos[] = [];
  let x = b.x + DX[b.dir]!;
  let y = b.y + DY[b.dir]!;
  while (inside(x, y) && !isPillar(x, y)) {
    cells.push({ x, y });
    if (botAt(g, x, y, p) >= 0) return { cells, bot: true };
    x += DX[b.dir]!;
    y += DY[b.dir]!;
  }
  return { cells, bot: false };
}

const adj = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

export function check(g: GameState, p: number, cond: CondId): boolean {
  const b = g.players[p]!.bot;
  const fx = b.x + DX[b.dir]!;
  const fy = b.y + DY[b.dir]!;
  switch (cond) {
    case 'always':
      return true;
    case 'frontEmpty':
      return !blocked(g, fx, fy, p);
    case 'frontBlocked':
      return blocked(g, fx, fy, p);
    case 'lineCore':
      return line(g, p).cells.some((c) => coreAt(g, c.x, c.y) >= 0);
    case 'lineNoCore':
      return !line(g, p).cells.some((c) => coreAt(g, c.x, c.y) >= 0);
    case 'lineBot':
      return line(g, p).bot;
    case 'botAdj':
      return g.players.some((q, i) => i !== p && adj(q.bot, b));
    case 'coreAdj':
      return g.cores.some((c) => adj(c, b));
    case 'onEdge':
      return b.x === 0 || b.y === 0 || b.x === SIZE - 1 || b.y === SIZE - 1;
    case 'noBotWithin2':
      return !g.players.some((q, i) => i !== p && Math.abs(q.bot.x - b.x) + Math.abs(q.bot.y - b.y) <= 2);
    case 'pilotCores2':
      return g.players[p]!.cores >= 2;
  }
}

// ── 8. 이동과 충돌 ───────────────────────────────────────────

type Cause = 'rule' | 'thrust';

/** 로봇 p를 방향 dir로 1칸. 막혔으면 충돌(false). 들어간 칸의 코어는 조종사가 얻는다 (8.4) */
function step(g: GameState, p: number, dir: Dir, cause: Cause): boolean {
  const b = g.players[p]!.bot;
  const x = b.x + DX[dir]!;
  const y = b.y + DY[dir]!;
  if (blocked(g, x, y, p)) {
    g.log.push({ t: 'bump', p, byRule: cause === 'rule' });
    return false;
  }
  b.x = x;
  b.y = y;
  g.log.push({ t: 'move', p, to: { x, y } });
  const c = coreAt(g, x, y);
  if (c >= 0) {
    g.cores.splice(c, 1);
    g.players[p]!.cores++;
    g.log.push({ t: 'core', p, at: { x, y } });
    if (cause === 'rule') g.stats.coreByRule++;
    else g.stats.coreByThrust++;
  }
  return true;
}

const face = (g: GameState, p: number, dir: Dir) => {
  g.players[p]!.bot.dir = dir;
  g.log.push({ t: 'face', p, dir });
};

/** 규칙 타일 행동 실행. 충돌하면 남은 행동을 하지 않고 true를 돌려준다 (8.2) */
function runActs(g: GameState, p: number, acts: Act[]): boolean {
  const b = g.players[p]!.bot;
  for (const a of acts) {
    switch (a.k) {
      case 'fwd':
        for (let i = 0; i < a.n; i++) if (!step(g, p, b.dir, 'rule')) return true;
        break;
      case 'back':
        for (let i = 0; i < a.n; i++) if (!step(g, p, ((b.dir + 2) % 4) as Dir, 'rule')) return true;
        break;
      case 'advStop':
        // 처음부터 앞 칸이 막혔으면 충돌, 아니면 막힌 칸 앞에서 멈추며 충돌 아님
        if (blocked(g, b.x + DX[b.dir]!, b.y + DY[b.dir]!, p)) {
          g.log.push({ t: 'bump', p, byRule: true });
          return true;
        }
        while (!blocked(g, b.x + DX[b.dir]!, b.y + DY[b.dir]!, p)) step(g, p, b.dir, 'rule');
        break;
      case 'left':
        face(g, p, ((b.dir + 3) % 4) as Dir);
        break;
      case 'right':
        face(g, p, ((b.dir + 1) % 4) as Dir);
        break;
      case 'about':
        face(g, p, ((b.dir + 2) % 4) as Dir);
        break;
      case 'wait':
        break;
    }
  }
  return false;
}

/** 지금 실행 차례 로봇의 조종사가 고를 수 있는 개입 (7.1·7.2) */
export function legalInterventions(g: GameState): Intervention[] {
  const p = g.players[currentBot(g)]!;
  const out: Intervention[] = [{ k: 'none' }];
  if (p.energy < 1) return out;
  out.push({ k: 'turn', dir: 'L' }, { k: 'turn', dir: 'R' }, { k: 'thrust' });
  for (let s = 0; s < 3; s++) out.push({ k: 'block', slot: s });
  return out;
}

const sameIv = (a: Intervention, b: Intervention) => JSON.stringify(a) === JSON.stringify(b);

/** 5.3 실행 차례 하나: 개입 → 검사와 발동. 끝나면 다음 로봇, 마지막이면 정리 단계 */
export function playTurn(g: GameState, iv: Intervention): GameEvent[] {
  if (g.phase !== 'exec') throw new Error('실행 단계가 아닙니다');
  const from = g.log.length;
  if (!legalInterventions(g).some((l) => sameIv(l, iv))) throw new Error('할 수 없는 개입입니다');
  const p = currentBot(g);
  const me = g.players[p]!;
  const designer = designerOf(g, p);
  g.stats.ivs[iv.k]++;

  // 1. 개입 (7)
  if (iv.k !== 'none') {
    me.energy--;
    g.log.push({ t: 'intervene', p, iv });
    if (iv.k === 'turn') face(g, p, ((me.bot.dir + (iv.dir === 'L' ? 3 : 1)) % 4) as Dir);
    else if (iv.k === 'block') me.blocked = iv.slot;
    else step(g, p, me.bot.dir, 'thrust');
    // 7.3 쓴 에너지
    me.spent++;
    if (me.spent >= 2) {
      me.spent -= 2;
      g.players[designer]!.dp++;
      g.stats.dpSpent++;
      g.log.push({ t: 'spentToDp', p, designer });
    }
  }

  // 2. 검사와 발동 (6.4)
  let bumped = false;
  let fired = false;
  for (let s = 0; s < 3; s++) {
    if (me.blocked === s) continue;
    const inst = me.brain[s];
    if (inst == null) continue;
    const tile = tileOf(g, inst);
    if (!check(g, p, tile.cond)) continue;
    fired = true;
    g.stats.triggered[tile.code] = (g.stats.triggered[tile.code] ?? 0) + 1;
    g.log.push({ t: 'trigger', p, slot: s, tile: inst });
    bumped = runActs(g, p, tile.acts);
    break;
  }
  if (!fired) {
    g.log.push({ t: 'default', p });
    bumped = runActs(g, p, [{ k: 'fwd', n: 1 }]);
  }
  // 8.3 충돌 설계자 점수 (실행 차례당 최대 1)
  if (bumped) {
    g.players[designer]!.dp++;
    g.stats.dpBump++;
    g.log.push({ t: 'dp', p, designer });
  }

  g.turn++;
  if (g.turn < g.n) g.log.push({ t: 'turnStart', p: currentBot(g) });
  else cleanup(g);
  return g.log.slice(from);
}

/** 5.4 정리 단계 */
function cleanup(g: GameState): void {
  for (const p of g.players) {
    g.bag.push(...p.hand);
    p.hand = [];
    p.pending = null;
    p.brain = [null, null, null];
    p.blocked = null;
  }
  if (g.cores.length <= 2) {
    const placed: Pos[] = [];
    for (const s of CORE_SPOTS) {
      if (g.coreSupply <= 0) break;
      if (coreAt(g, s.x, s.y) >= 0 || botAt(g, s.x, s.y, -1) >= 0) continue;
      g.cores.push({ ...s });
      g.coreSupply--;
      placed.push({ ...s });
    }
    if (placed.length) g.log.push({ t: 'refill', at: placed });
  }
  g.first = (g.first + 1) % g.n;
  if (g.round >= g.rounds) {
    g.phase = 'done';
    g.log.push({ t: 'end' });
    return;
  }
  startRound(g);
}

/** 9. 순위: 점수 → 코어 수. 같은 순위는 같은 번호 */
export function ranking(g: GameState): { p: number; score: number; rank: number }[] {
  const rows = g.players.map((pl, p) => ({ p, score: score(g, p), cores: pl.cores }));
  rows.sort((a, b) => b.score - a.score || b.cores - a.cores);
  return rows.map((r) => ({
    p: r.p,
    score: r.score,
    rank: rows.findIndex((o) => o.score === r.score && o.cores === r.cores) + 1,
  }));
}
