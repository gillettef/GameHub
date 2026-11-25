// 공통 방·진행 코드(@gamehub/net)에 LIGHTCONE 엔진을 연결한다. 서버(온라인)와 브라우저(한 기기)가 함께 쓴다.
//
// 두 사람이 단계마다 동시에 비밀로 낸다(이동 → 공격 → 봉쇄 → 점령). 먼저 낸 쪽의 행동은 pending 에 보관하고
// 둘 다 내면 엔진으로 한꺼번에 처리한다. 봉쇄 단계는 봉쇄할 카드가 있는 사람만 낸다(옛 서버와 같음).
// 좌석 0 = A(선), 좌석 1 = B.
//
// 보기(view)는 그 좌석이 알아도 되는 것만 담는다: 내 함대·컨베이어 전부, 상대는 잔상·파문 칸별 장수·남은 위장 수,
// 상대의 비밀 배치를 지운 기록, 누가 냈는지(무엇을 냈는지는 아님). 관전자는 양쪽 모두 공개 정보만 본다.
// 시드·난수 상태·pending 내용은 보내지 않는다. 게임이 끝나면 실체와 실제 경로를 모두 공개한다.
import { RuleError, type GameDef } from '@gamehub/net'
import { botAttacks, botBlockades, botMoves, botOccupations } from './engine/bot.ts'
import {
  PIDS,
  STAY,
  blockadeOptions,
  cloneState,
  holdCount,
  legalMoves,
  makeRng,
  newGame,
  playerView,
  publicView,
  realPos,
  redactLog,
  ripple,
  submitAttacks,
  submitBlockades,
  submitMoves,
  submitOccupations,
  validateOccupations,
  type BlockadeOption,
  type Card,
  type FleetView,
  type HistoryRow,
  type LogEntry,
  type OccupyOrder,
  type Phase,
  type State,
} from './engine/engine.ts'
import { FLEET_IDS, PLANETS, type Pid } from './engine/map.ts'

export type Action =
  | { type: 'moves'; moves: string[] }
  | { type: 'attacks'; fleets: number[] }
  | { type: 'blockades'; idx: number[] }
  | { type: 'occupy'; orders: OccupyOrder[] }

export interface Table {
  game: State
  kinds: ('human' | 'bot')[]
  /** 이번 단계에 먼저 낸 행동(상대에게는 보이지 않는다) */
  pending: Partial<Record<Pid, Action>>
}

export interface SideView {
  fleets: { id: number; echo: string; real: string | null }[]
  /** [null, 1번 칸 장수, …, 5번 칸 장수] */
  slotCounts: (number | null)[]
  decoys: number
}

export interface MineView {
  fleets: FleetView[]
  slots: (Card[] | null)[]
  decoys: number
  eligible: number[]
  blockades: BlockadeOption[]
}

export interface View {
  /** 내 진영. 관전이면 null */
  me: Pid | null
  round: number
  phase: Phase
  nebula: string[]
  holds: Record<string, Pid>
  holdCount: Record<Pid, number>
  winner: Pid | 'draw' | null
  lastLight: boolean
  ripple: Record<string, number>
  sides: Record<Pid, SideView>
  mine: MineView | null
  /** 이번 단계에 이미 낸 사람 */
  submitted: Record<Pid, boolean>
  log: LogEntry[]
  /** 게임이 끝났을 때만: 라운드별 실제 위치 */
  history: HistoryRow[]
}

export const SEAT_PID: readonly Pid[] = ['A', 'B']
export const pidOf = (seat: number): Pid => SEAT_PID[seat] ?? 'A'
export const seatOf = (pid: Pid): number => SEAT_PID.indexOf(pid)

const PHASE_ACTION: Partial<Record<Phase, Action['type']>> = { plan: 'moves', attack: 'attacks', blockade: 'blockades', occupy: 'occupy' }
export const PHASE_NAME: Record<Phase, string> = {
  plan: '계획 — 이동',
  attack: '공격',
  blockade: '봉쇄',
  resolveArrivals: '도달 처리',
  occupy: '점령',
  over: '게임 끝',
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max
const SYSTEM_SET = new Set(['A', 'B', STAY, ...Array.from({ length: 17 }, (_, i) => String(i + 1))])

/** 정수 목록(중복 제거, 순서 유지). 형식이 틀리면 null */
function intList(raw: unknown, min: number, max: number, limit: number): number[] | null {
  if (!Array.isArray(raw) || raw.length > limit || !raw.every((x) => isInt(x, min, max))) return null
  return [...new Set(raw as number[])]
}

/** 신뢰할 수 없는 입력 → 행동. 형식만 본다(합법 여부는 apply) */
export function parseAction(raw: unknown): Action | null {
  if (!isObject(raw)) return null
  switch (raw.type) {
    case 'moves': {
      const m = raw.moves
      if (!Array.isArray(m) || m.length !== 3 || !m.every((x) => typeof x === 'string' && SYSTEM_SET.has(x))) return null
      return { type: 'moves', moves: [...(m as string[])] }
    }
    case 'attacks': {
      const fleets = intList(raw.fleets, 1, 3, 3)
      return fleets ? { type: 'attacks', fleets } : null
    }
    case 'blockades': {
      const idx = intList(raw.idx, 0, 63, 16)
      return idx ? { type: 'blockades', idx } : null
    }
    case 'occupy': {
      const list = raw.orders
      if (!Array.isArray(list) || list.length > 3) return null
      const orders: OccupyOrder[] = []
      for (const o of list) {
        if (!isObject(o) || !isInt(o.fid, 1, 3)) return null
        if (o.kind === 'occupy') orders.push({ fid: o.fid, kind: 'occupy' })
        else if (o.kind === 'decoy' && isInt(o.slot, 3, 5)) orders.push({ fid: o.fid, kind: 'decoy', slot: o.slot })
        else return null
      }
      return { type: 'occupy', orders }
    }
    default:
      return null
  }
}

/** 지금 내야 하는 진영들 */
export function pendingPids(t: Table): Pid[] {
  const g = t.game
  if (g.phase === 'over' || !PHASE_ACTION[g.phase]) return []
  const need = g.phase === 'blockade' ? PIDS.filter((p) => blockadeOptions(g).some((o) => o.blocker === p)) : [...PIDS]
  return need.filter((p) => !(p in t.pending))
}

/** 행동을 검사한다. 규칙에 맞지 않으면 RuleError */
function check(g: State, pid: Pid, action: Action): void {
  switch (action.type) {
    case 'moves':
      FLEET_IDS.forEach((fid, i) => {
        if (!legalMoves(g, pid, fid).includes(action.moves[i]!)) throw new RuleError(`함대 ${fid}: 갈 수 없는 성계입니다.`)
      })
      return
    case 'attacks':
      return
    case 'blockades': {
      const mine = blockadeOptions(g)
        .filter((o) => o.blocker === pid)
        .map((o) => o.idx)
      if (action.idx.some((x) => !mine.includes(x))) throw new RuleError('봉쇄할 수 없는 카드입니다.')
      return
    }
    case 'occupy': {
      const err = validateOccupations(g, pid, action.orders)
      if (err) throw new RuleError(err)
    }
  }
}

function resolve(g: State, pending: Partial<Record<Pid, Action>>): void {
  const of = <T extends Action['type']>(pid: Pid, type: T) => {
    const a = pending[pid]
    return a?.type === type ? (a as Extract<Action, { type: T }>) : undefined
  }
  switch (g.phase) {
    case 'plan':
      return submitMoves(g, { A: of('A', 'moves')!.moves, B: of('B', 'moves')!.moves })
    case 'attack':
      return submitAttacks(g, { A: of('A', 'attacks')!.fleets, B: of('B', 'attacks')!.fleets })
    case 'blockade':
      return submitBlockades(g, { A: of('A', 'blockades')?.idx ?? [], B: of('B', 'blockades')?.idx ?? [] })
    case 'occupy':
      return submitOccupations(g, { A: of('A', 'occupy')!.orders, B: of('B', 'occupy')!.orders })
    default:
      throw new Error(`처리할 수 없는 단계 ${g.phase}`)
  }
}

function sideOf(g: State, pid: Pid, showReal: boolean): SideView {
  const p = g.players[pid]
  return {
    fleets: p.fleets.map((f) => ({ id: f.id, echo: f.echo, real: showReal ? realPos(f) : null })),
    slotCounts: p.slots.map((s) => (s ? s.length : null)),
    decoys: p.decoys,
  }
}

export function toView(t: Table, seat: number | null): View {
  const g = t.game
  const over = g.phase === 'over'
  const me = seat === null ? null : pidOf(seat)
  const submitted = { A: 'A' in t.pending, B: 'B' in t.pending }
  if (me === null) {
    return {
      me,
      round: g.round,
      phase: g.phase,
      nebula: g.nebula,
      holds: { ...g.holds },
      holdCount: { A: holdCount(g, 'A'), B: holdCount(g, 'B') },
      winner: g.winner,
      lastLight: g.lastLight,
      ripple: Object.fromEntries(PLANETS.map((p) => [p, ripple(g, p)])),
      sides: { A: sideOf(g, 'A', over), B: sideOf(g, 'B', over) },
      mine: null,
      submitted,
      log: redactLog(g.log, null),
      history: over ? g.history : [],
    }
  }
  // 좌석은 옛 서버가 보내던 playerView 를 그대로 쓴다
  const v = playerView(g, me)
  const mySide: SideView = { fleets: v.fleets.map((f) => ({ id: f.id, echo: f.echo, real: f.real })), slotCounts: v.slots.map((s) => (s ? s.length : null)), decoys: v.decoys }
  const oppSide: SideView = { fleets: v.opp.fleets, slotCounts: v.opp.slotCounts, decoys: v.opp.decoys }
  return {
    me,
    round: v.round,
    phase: v.phase,
    nebula: v.nebula,
    holds: v.holds,
    holdCount: v.holdCount,
    winner: v.winner,
    lastLight: v.lastLight,
    ripple: v.ripple,
    sides: me === 'A' ? { A: mySide, B: oppSide } : { A: oppSide, B: mySide },
    mine: { fleets: v.fleets, slots: v.slots, decoys: v.decoys, eligible: v.eligible, blockades: v.blockades },
    submitted,
    log: v.log,
    history: v.history,
  }
}

/** 봇의 난수: 같은 판·같은 단계·같은 좌석이면 같은 수열(되풀이해도 같은 수를 둔다) */
function botRng(g: State, pid: Pid): () => number {
  const phase = ['plan', 'attack', 'blockade', 'occupy'].indexOf(g.phase)
  return makeRng((g.seed ^ Math.imul(g.round * 8 + phase + 1, 0x9e3779b1) ^ (pid === 'B' ? 0x5bd1e995 : 0)) >>> 0)
}

/** 아무것도 하지 않는 행동(봇이 실패했을 때) */
function passAction(g: State): Action | null {
  switch (g.phase) {
    case 'plan':
      return { type: 'moves', moves: [STAY, STAY, STAY] }
    case 'attack':
      return { type: 'attacks', fleets: [] }
    case 'blockade':
      return { type: 'blockades', idx: [] }
    case 'occupy':
      return { type: 'occupy', orders: [] }
    default:
      return null
  }
}

export const def: GameDef<Table, Action, View> = {
  slug: 'lightcone',
  minSeats: 2,
  maxSeats: 2,
  setup({ seats, seed }) {
    return { game: newGame({ seed }), kinds: seats.map((s) => s.kind), pending: {} }
  },
  parseAction,
  actors: (t) => pendingPids(t).map(seatOf),
  apply(t, seat, action, ctx) {
    const g = t.game
    const pid = pidOf(seat)
    if (g.phase === 'over') throw new RuleError('이미 끝난 게임입니다.')
    if (PHASE_ACTION[g.phase] !== action.type) throw new RuleError('지금 단계에서 할 수 없는 행동입니다.')
    if (pid in t.pending) throw new RuleError('이미 제출했습니다. 상대를 기다리는 중입니다.')
    if (!pendingPids(t).includes(pid)) throw new RuleError('이번 단계에는 낼 것이 없습니다.')
    check(g, pid, action)
    if (ctx.byBot && t.kinds[seat] === 'human') ctx.log(`${ctx.name(seat)}: 자리를 비워 봇이 대신 냈습니다 (${g.round}라운드 ${PHASE_NAME[g.phase]})`, 'proxy')
    const next: Table = { ...t, pending: { ...t.pending, [pid]: action } }
    if (pendingPids(next).length > 0) return next
    const game = cloneState(g)
    resolve(game, next.pending)
    return { ...t, game, pending: {} }
  },
  view: toView,
  isOver: (t) => t.game.phase === 'over',
  bot: {
    next(t, seat) {
      const g = t.game
      const pid = pidOf(seat)
      const rng = botRng(g, pid)
      switch (g.phase) {
        case 'plan':
          return { type: 'moves', moves: botMoves(publicView(g, pid), rng) }
        case 'attack':
          return { type: 'attacks', fleets: botAttacks(publicView(g, pid), rng) }
        case 'blockade':
          return { type: 'blockades', idx: botBlockades(blockadeOptions(g).filter((o) => o.blocker === pid)) }
        case 'occupy':
          return { type: 'occupy', orders: botOccupations(publicView(g, pid), g, rng) }
        default:
          return null
      }
    },
    fallback: (t) => passAction(t.game),
    delayMs: 600,
  },
}
