/**
 * 공통 방·진행 코드(@gamehub/net)에 Eleven 엔진을 연결한다. 서버(온라인)와 브라우저(한 기기)가 함께 쓴다.
 *
 * - 좌석 i 의 엔진 참가자 id 는 `p${i}`. 시작 순서(시계방향 차례)는 옛 서버처럼 방 난수로 섞는다.
 * - 좌석마다 보내는 것은 엔진의 viewFor(옛 서버가 보내던 GameView 그대로) + 엠블럼·사람/봇 표시뿐이다.
 *   난수 상태·시드·덱 순서·되돌리기 스냅샷은 보내지 않는다.
 * - 봇 간격: 공통 코드의 봇 지연은 한 가지 값이라, 옛 봇(driver.ts)의 "행동마다 다른 쉼"과 "경기 보기 대기"는
 *   hold(시계로 줄어드는 대기)로 옮겼다. hold 동안 봇 좌석은 actors 에서 빠지고, 시계가 다 흐르면 다시 들어온다.
 */
import { RuleError, type GameDef } from '@gamehub/net';
import { decide } from './bot/policy';
import { applyAction, type GameAction } from './engine/actions';
import { createRng, type Rng } from './engine/rng';
import { createGame } from './engine/setup';
import { GameError, addLog } from './engine/state';
import type { GameState, LineupSubmission, PlayerId } from './engine/state';
import { tagged } from './engine/labels';
import { REGIONS, RESOURCES } from './engine/types';
import type { Division, InfrastructureType, Region } from './engine/types';
import { viewFor, type GameView } from './engine/view';
import { koError } from './errors';
import { EMBLEM_IDS, isEmblem, type EmblemId } from './protocol';
import { rngOf, seedState } from './seeded';

export type SeatKind = 'human' | 'bot';

export interface Options {
  division: Division;
}

export type Action =
  | GameAction
  /** 경기 결과 단계: 봇 차례의 경기 보기를 다 봤다(봇이 기다리는 시간을 줄인다, 게임 상태와 무관) */
  | { type: 'watched' }
  /** 준비 단계: 내 구단 엠블럼 바꾸기(한 판에서 겹치지 않음) */
  | { type: 'emblem'; emblem: EmblemId };

/** 봇이 다음 행동 전에 기다리는 시간. watch = 사람들이 봇의 경기 보기를 보는 중(waiting 이 다 보면 끝) */
export interface Hold {
  ms: number;
  watch: boolean;
  waiting: number[];
}

export interface Table {
  game: GameState;
  /** 난수 위치(seeded.ts). 보내지 않는다 */
  rng: number;
  seed: number;
  kinds: SeatKind[];
  emblems: EmblemId[];
  hold: Hold | null;
}

export interface View {
  game: GameView;
  /** 참가자 id → 엠블럼 */
  emblems: Record<PlayerId, EmblemId>;
  /** 참가자 id → 사람/봇 */
  kinds: Record<PlayerId, SeatKind>;
  /** 봇 차례의 경기 보기를 내가 아직 다 보지 않았다(보면 watched 를 보낸다) */
  watchWait: boolean;
  /** 봇이 경기 보기 대기 중 */
  botWatching: boolean;
}

export const SLUG = 'eleven';
export const MAX_SEATS = 4;
/** 봇 한 수의 기본 간격(옛 BOT_DELAY_MS) */
export const BOT_DELAY_MS = 800;
/** 경기 결과 단계에서 봇이 주사위를 굴리기 전에 사람들이 그 봇의 경기 보기를 보는 시간(옛 BOT_WATCH_MS, MatchReplay 재생 길이) */
export const BOT_WATCH_MS = 24_000;

// 봇 행동 뒤에 쉬는 시간(BOT_DELAY_MS 의 배수, 옛 driver.ts PAUSE_FACTOR): 사람이 봇의 선택과 결과(주사위 애니메이션)를 읽을 수 있게
const PAUSE_FACTOR: Record<GameAction['type'], number> = {
  draftPick: 1,
  chooseObjective: 1,
  resolvePending: 2,
  rollBoardDie: 4,
  rerollBoardDie: 4,
  acceptBoardRoll: 3,
  recruitPlayer: 3,
  recruitProspect: 3,
  releasePlayer: 3,
  hireStaff: 3,
  signSponsor: 3,
  buildInfrastructure: 3,
  buildOffice: 3,
  cardAction: 3,
  pass: 2,
  endTurn: 1.5,
  submitLineup: 3,
  playTacticEffect: 3,
  redrawTactic: 2,
  rollMatchDie: 4,
  rerollMatchDie: 4,
  acceptMatchRoll: 3,
  rollInjuryDie: 4,
  rerollInjuryDie: 4,
  acceptInjuryRoll: 3,
  undoTurn: 1,
};

export const pidOf = (seat: number): PlayerId => `p${seat}`;
export const seatOf = (pid: PlayerId): number => (/^p[0-3]$/.test(pid) ? Number(pid.slice(1)) : -1);

// ---------- 입력 검사(신뢰할 수 없는 값) ----------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
const isIndex = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < max;
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 99;
const INFRA: readonly InfrastructureType[] = ['lights', 'shop', 'execOffice', 'trainingGround', 'stand3', 'stand4', 'billboard3'];
const SIMPLE = new Set<string>([
  'rollBoardDie',
  'rerollBoardDie',
  'acceptBoardRoll',
  'recruitProspect',
  'buildOffice',
  'pass',
  'endTurn',
  'rollMatchDie',
  'rerollMatchDie',
  'acceptMatchRoll',
  'rollInjuryDie',
  'rerollInjuryDie',
  'acceptInjuryRoll',
  'undoTurn',
  'watched',
]);

function parseRecord<T>(raw: unknown, value: (v: unknown) => T | null, max = 24): Record<string, T> | null {
  if (!isObject(raw)) return null;
  const entries = Object.entries(raw);
  if (entries.length > max) return null;
  const out: Record<string, T> = {};
  for (const [k, v] of entries) {
    const parsed = value(v);
    // 객체의 특수 키(__proto__ 등)는 받지 않는다
    if (!isId(k) || k === "__proto__" || k === "constructor" || k === "prototype" || parsed === null) return null;
    out[k] = parsed;
  }
  return out;
}

function parseLineup(raw: unknown): LineupSubmission | null {
  if (!isObject(raw) || !isId(raw.tacticCardId) || !isIndex(raw.formationIndex, 16)) return null;
  if (!Array.isArray(raw.players) || raw.players.length > 24 || !raw.players.every(isId)) return null;
  const placements = parseRecord(raw.placements, (v) => ((REGIONS as readonly unknown[]).includes(v) ? (v as Region) : null));
  if (!placements) return null;
  const out: LineupSubmission = { tacticCardId: raw.tacticCardId, formationIndex: raw.formationIndex, players: [...(raw.players as string[])], placements };
  if (raw.activations !== undefined) {
    const activations = parseRecord(raw.activations, (v) => {
      if (!isObject(v)) return null;
      const res: Partial<Record<(typeof RESOURCES)[number], number>> = {};
      for (const [k, n] of Object.entries(v)) {
        if (!(RESOURCES as readonly string[]).includes(k) || !isCount(n)) return null;
        res[k as (typeof RESOURCES)[number]] = n;
      }
      return res;
    });
    if (!activations) return null;
    out.activations = activations;
  }
  if (raw.fandomInStands !== undefined) {
    if (!isCount(raw.fandomInStands)) return null;
    out.fandomInStands = raw.fandomInStands;
  }
  return out;
}

/** 신뢰할 수 없는 입력 → 행동. 형식만 본다(합법 여부는 엔진) */
export function parseAction(raw: unknown): Action | null {
  if (!isObject(raw) || typeof raw.type !== 'string') return null;
  const t = raw.type;
  if (SIMPLE.has(t)) return { type: t } as Action;
  switch (t) {
    case 'draftPick':
    case 'chooseObjective':
    case 'redrawTactic':
      return isId(raw.cardId) ? { type: t, cardId: raw.cardId } : null;
    case 'playTacticEffect':
      return raw.cardId === null || isId(raw.cardId) ? { type: t, cardId: raw.cardId } : null;
    case 'resolvePending':
      return isId(raw.pendingId) && isId(raw.choice) ? { type: t, pendingId: raw.pendingId, choice: raw.choice } : null;
    case 'recruitPlayer': {
      if (!isIndex(raw.marketIndex, 16)) return null;
      if (raw.row === undefined) return { type: t, marketIndex: raw.marketIndex };
      return raw.row === 'players' || raw.row === 'veterans' ? { type: t, marketIndex: raw.marketIndex, row: raw.row } : null;
    }
    case 'releasePlayer':
      return isId(raw.instanceId) ? { type: t, instanceId: raw.instanceId } : null;
    case 'hireStaff':
      return isIndex(raw.marketIndex, 16) ? { type: t, marketIndex: raw.marketIndex } : null;
    case 'signSponsor': {
      if (!isIndex(raw.marketIndex, 16) || (raw.contract !== 'kit' && raw.contract !== 'billboard' && raw.contract !== 'naming')) return null;
      const base = { type: t, marketIndex: raw.marketIndex, contract: raw.contract } as const;
      if (raw.billboardChoice === undefined) return base;
      return raw.billboardChoice === 'effect' || raw.billboardChoice === 'bonus' ? { ...base, billboardChoice: raw.billboardChoice } : null;
    }
    case 'buildInfrastructure':
      return INFRA.includes(raw.infrastructure as InfrastructureType) ? { type: t, infrastructure: raw.infrastructure as InfrastructureType } : null;
    case 'cardAction': {
      const s = raw.source;
      if (!isObject(s) || (s.kind !== 'staff' && s.kind !== 'executive') || !isIndex(s.index, 32)) return null;
      if (raw.paid !== undefined && typeof raw.paid !== 'boolean') return null;
      const base = { type: t, source: { kind: s.kind, index: s.index } } as const;
      return raw.paid === undefined ? base : { ...base, paid: raw.paid };
    }
    case 'submitLineup': {
      const submission = parseLineup(raw.submission);
      return submission ? { type: t, submission } : null;
    }
    case 'emblem':
      return isEmblem(raw.emblem) ? { type: t, emblem: raw.emblem } : null;
    default:
      return null;
  }
}

export function parseOptions(raw: unknown): Options {
  const d = isObject(raw) ? raw.division : undefined;
  return { division: d === 1 || d === 2 || d === 3 ? d : 3 };
}

// ---------- 차례 ----------

/** 엔진 규칙상 지금 행동할 수 있는 참가자들(대상 선택이 남은 참가자 포함) */
export function engineActors(game: GameState): number[] {
  const phase = game.phase;
  if (phase.kind === 'gameOver') return [];
  const out = new Set<PlayerId>();
  switch (phase.kind) {
    case 'setup.draft':
      for (const id of game.seats) if (phase.picked[id] === null && (phase.hands[id]?.length ?? 0) > 0) out.add(id);
      break;
    case 'setup.objective':
      for (const id of game.seats) if (phase.chosen[id] === null) out.add(id);
      break;
    default:
      out.add(phase.current);
  }
  for (const id of game.seats) if ((game.players[id]?.pending.length ?? 0) > 0) out.add(id);
  return game.seats.filter((id) => out.has(id)).map(seatOf);
}

function actorsOf(t: Table): number[] {
  const engine = engineActors(t.game);
  const hold = t.hold;
  if (!hold) return engine;
  const people = engine.filter((s) => t.kinds[s] !== 'bot');
  return hold.watch ? [...new Set([...people, ...hold.waiting])].sort() : people;
}

/** 경기 결과 단계에서 차례인 봇이 아직 경기 영향 주사위를 굴리지 않았다(= 사람들은 그 봇의 경기 보기 중) */
function botToWatch(t: Table, game: GameState): boolean {
  const phase = game.phase;
  if (phase.kind !== 'friday.aftermath' || t.kinds[seatOf(phase.current)] !== 'bot') return false;
  const m = phase.matches[phase.current];
  return !!m && m.roll === null && m.injuryDice.length === 0;
}

/** 행동을 적용한 뒤의 봇 대기 */
function holdAfter(t: Table, game: GameState, action: GameAction, byBot: boolean): Hold | null {
  const people = t.kinds.flatMap((k, i) => (k === 'human' ? [i] : []));
  if (botToWatch(t, game) && people.length > 0) return { ms: BOT_WATCH_MS, watch: true, waiting: people };
  if (!byBot) return null;
  const extra = BOT_DELAY_MS * (PAUSE_FACTOR[action.type] - 1);
  if (extra <= 0 || !engineActors(game).some((s) => t.kinds[s] === 'bot')) return null;
  return { ms: extra, watch: false, waiting: [] };
}

// ---------- 봇 ----------

interface BotMemory {
  rng?: Rng;
  turnKey?: string;
  failed?: Set<string>;
}

const MAX_ATTEMPTS = 12;

function turnKeyOf(view: GameView): string {
  const phase = view.phase;
  const current = 'current' in phase ? phase.current : '';
  const day = phase.kind === 'weekday' ? phase.day : '';
  return `${view.week}:${phase.kind}:${day}:${current}`;
}

/** 실제로 적용하지 않고 엔진이 받아들이는지 본다(난수 위치는 복사본으로) */
function accepted(t: Table, seat: number, action: GameAction): boolean {
  try {
    applyAction(t.game, pidOf(seat), action, rngOf({ s: t.rng }));
    return true;
  } catch (e) {
    if (e instanceof GameError) return false;
    throw e;
  }
}

/** 옛 BotDriver.step: 정책이 고른 행동이 거절되면 그 종류를 기억하고 곧바로 다시 고른다 */
function botNext(t: Table, seat: number, memory: BotMemory): Action | null {
  if (t.hold?.watch && t.hold.waiting.includes(seat)) return { type: 'watched' };
  const view = viewFor(t.game, pidOf(seat));
  memory.rng ??= createRng(t.seed + seat + 1);
  memory.failed ??= new Set();
  const key = turnKeyOf(view);
  if (memory.turnKey !== key) {
    memory.turnKey = key;
    memory.failed.clear();
  }
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const action = decide(view, memory.rng, memory.failed);
    if (!action) return null;
    if (accepted(t, seat, action)) return action;
    memory.failed.add(action.type === 'cardAction' && action.paid ? 'paidCardAction' : action.type);
  }
  return null;
}

/** 정책이 아무것도 못 낼 때: 받아들여지는 가장 단순한 행동 */
function botFallback(t: Table, seat: number): Action | null {
  if (t.hold?.watch && t.hold.waiting.includes(seat)) return { type: 'watched' };
  const me = t.game.players[pidOf(seat)];
  const tries: GameAction[] = [];
  const pending = me?.pending[0];
  if (pending) for (const choice of pending.candidates) tries.push({ type: 'resolvePending', pendingId: pending.id, choice });
  const phase = t.game.phase;
  if (phase.kind === 'setup.draft') for (const id of phase.hands[pidOf(seat)] ?? []) tries.push({ type: 'draftPick', cardId: id });
  if (phase.kind === 'setup.objective') for (const id of phase.options[pidOf(seat)] ?? []) tries.push({ type: 'chooseObjective', cardId: id });
  tries.push(
    { type: 'endTurn' },
    { type: 'pass' },
    { type: 'rollBoardDie' },
    { type: 'acceptBoardRoll' },
    { type: 'playTacticEffect', cardId: null },
    { type: 'rollMatchDie' },
    { type: 'acceptMatchRoll' },
    { type: 'rollInjuryDie' },
    { type: 'acceptInjuryRoll' },
  );
  return tries.find((a) => accepted(t, seat, a)) ?? null;
}

// ---------- GameDef ----------

function freeEmblems(seed: number, n: number): EmblemId[] {
  // 꾸밈이라 게임 난수와 따로 고른다(같은 시드의 판 진행이 엠블럼 때문에 달라지지 않게)
  return createRng(seed ^ 0x5bd1e995).shuffle(EMBLEM_IDS).slice(0, n);
}

export const def: GameDef<Table, Action, View, Options> = {
  slug: SLUG,
  minSeats: 1,
  maxSeats: MAX_SEATS,
  parseOptions,
  setup({ seats, seed, options }) {
    const holder = { s: seedState(seed) };
    const rng = rngOf(holder);
    // 시작 순서는 항상 무작위(옛 rooms.ts start): 자리(시계방향 차례)를 섞는다. 첫 자리가 1주차 선 참가자
    const order = rng.shuffle(seats.map((_, i) => i));
    const id = `g${createRng(seed ^ 0x27d4eb2f).int(1e9)}`;
    const game = createGame({ id, division: parseOptions(options).division, players: order.map((i) => ({ id: pidOf(i), name: seats[i]!.name })) }, rng);
    if (seats.length > 1) addLog(game, tagged('준비', `시작 순서를 무작위로 정함: ${order.map((i) => seats[i]!.name).join(' → ')}`));
    return { game, rng: holder.s, seed, kinds: seats.map((s) => s.kind), emblems: freeEmblems(seed, seats.length), hold: null };
  },
  parseAction,
  actors: actorsOf,
  apply(t, seat, action, ctx) {
    if (action.type === 'watched') {
      if (!t.hold?.watch || !t.hold.waiting.includes(seat)) throw new RuleError('지금은 기다리는 경기 보기가 없습니다');
      const waiting = t.hold.waiting.filter((s) => s !== seat);
      return { ...t, hold: waiting.length > 0 ? { ...t.hold, waiting } : null };
    }
    if (action.type === 'emblem') {
      if (!t.game.phase.kind.startsWith('setup.')) throw new RuleError('엠블럼은 준비 단계에서만 바꿀 수 있습니다');
      if (t.emblems.some((e, i) => i !== seat && e === action.emblem)) throw new RuleError(koError('emblem already taken'));
      return { ...t, emblems: t.emblems.map((e, i) => (i === seat ? action.emblem : e)) };
    }
    const holder = { s: t.rng };
    let game: GameState;
    try {
      game = applyAction(t.game, pidOf(seat), action, rngOf(holder));
    } catch (e) {
      if (e instanceof GameError) throw new RuleError(koError(e.message));
      throw e;
    }
    const next: Table = { ...t, game, rng: holder.s, hold: null };
    return { ...next, hold: holdAfter(next, game, action, ctx.byBot) };
  },
  view(t, seat) {
    const ids = t.kinds.map((_, i) => pidOf(i));
    const hold = t.hold;
    return {
      game: viewFor(t.game, seat === null ? '' : pidOf(seat)),
      emblems: Object.fromEntries(ids.map((id, i) => [id, t.emblems[i]!])),
      kinds: Object.fromEntries(ids.map((id, i) => [id, t.kinds[i]!])),
      watchWait: !!hold?.watch && seat !== null && hold.waiting.includes(seat),
      botWatching: !!hold?.watch,
    };
  },
  isOver: (t) => t.game.phase.kind === 'gameOver',
  clock: {
    advance(t, ms) {
      const hold = t.hold;
      if (!hold) return t;
      if (hold.ms > ms) {
        // 남은 시간만 줄인다: 같은 객체를 돌려줘 1초마다 전체 상태를 다시 보내지 않는다(대기가 끝날 때만 알린다)
        hold.ms -= ms;
        return t;
      }
      return { ...t, hold: null };
    },
    syncMs: 250,
  },
  bot: {
    next: (t, seat, memory) => botNext(t, seat, memory as BotMemory),
    fallback: botFallback,
    delayMs: BOT_DELAY_MS,
  },
};
