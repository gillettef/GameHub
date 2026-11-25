// LIGHTCONE 규칙 엔진 (단순판 v0.7). 규칙의 기준은 rules/rulebook.md 다.
// 디지털판에서는 컴퓨터가 모든 규칙을 강제하므로 정직성 확인(공격 표식, 이동 확인)은 생략한다.
// 상태는 JSON 으로 그대로 보낼 수 있는 평범한 객체다. 시간·난수는 쓰지 않는다(시드는 부르는 쪽이 준다).
import {
  ADJ,
  DECOYS,
  FLEET_IDS,
  HOME,
  LAST_LIGHT_SLOTS,
  NEBULA_CARDS,
  PLANET_COPIES,
  PLANETS,
  ROUNDS,
  STRENGTH,
  VICTORY,
  rippleDistance,
  type Pid,
} from './map.ts'

export const STAY = 'STAY'
export const other = (p: Pid): Pid => (p === 'A' ? 'B' : 'A')
export const PIDS: readonly Pid[] = ['A', 'B']

export type Phase = 'plan' | 'attack' | 'blockade' | 'resolveArrivals' | 'occupy' | 'over'

export type Card = { kind: 'planet'; planet: string; round: number } | { kind: 'decoy'; round: number }

export interface Fleet {
  id: number
  /** 광선 컨베이어 앞 칸(이번 라운드에 낸 카드) */
  front: string
  /** 뒤 칸(다음 이동 처리 때 공개) */
  back: string
  /** 공개된 잔상 위치 */
  echo: string
  attacked: boolean
  recalled: boolean
}

export interface Player {
  id: Pid
  fleets: Fleet[]
  planetCards: Record<string, number>
  decoys: number
  /** slots[1..5]: 각 칸의 카드 목록. slots[0] 은 null */
  slots: (Card[] | null)[]
}

export type Secret = { kind: 'planet'; planet: string; fid: number } | { kind: 'decoy'; fid: number }

export type LogBody =
  | { type: 'reveal'; pid: Pid; fid: number; card: string; echo: string }
  | { type: 'recall'; pid: Pid; fid: number; cards: [string, string]; from: string }
  | { type: 'strike'; pid: Pid; fid: number; system: string }
  | { type: 'miss'; pid: Pid; system: string }
  | { type: 'engagement'; system: string; fleets: Record<Pid, number[]>; sum: Record<Pid, number>; losers: Pid[] }
  | { type: 'arrival'; pid: Pid; card: Card }
  | { type: 'blockade'; pid: Pid; planet: string; fid: number | undefined }
  | { type: 'neutral'; planet: string }
  | { type: 'hold'; pid: Pid; planet: string; prev: Pid | null }
  /** secret 은 놓은 사람만 본다(보기에서는 지운다) */
  | { type: 'place'; pid: Pid; slot: number; secret?: Secret }
  | { type: 'gameover'; winner: Pid | 'draw'; how: 'immediate' | 'lastlight'; holds: Record<Pid, number> }
  | { type: 'lastlight' }

export type LogEntry = { round: number } & LogBody

export interface Arrival {
  owner: Pid
  card: Card
}

export interface HistoryRow {
  round: number
  A: string[]
  B: string[]
}

export interface State {
  seed: number
  round: number
  /** plan → attack → blockade? → occupy → (다음 라운드) … → over */
  phase: Phase
  nebula: string[]
  /** planet → 'A' | 'B' */
  holds: Record<string, Pid>
  players: Record<Pid, Player>
  pendingArrivals: Arrival[] | null
  lastLight: boolean
  winner: Pid | 'draw' | null
  log: LogEntry[]
  /** 라운드별 실제 위치 기록(게임 종료 후 공개용) */
  history: HistoryRow[]
}

export type Moves = Record<Pid, string[]>
export type OccupyOrder = { fid: number; kind: 'occupy' } | { fid: number; kind: 'decoy'; slot: number }

/** 시드 하나로 [0, 1) 수열을 만든다(mulberry32). 옛 엔진의 makeRng 와 같은 수열 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function newPlayer(pid: Pid): Player {
  return {
    id: pid,
    fleets: FLEET_IDS.map((id) => ({
      id,
      front: STAY,
      back: HOME[pid],
      echo: HOME[pid],
      attacked: false,
      recalled: false,
    })),
    planetCards: Object.fromEntries(PLANETS.map((p) => [p, PLANET_COPIES])),
    decoys: DECOYS,
    slots: [null, [], [], [], [], []],
  }
}

export function newGame({ seed, nebula }: { seed: number; nebula?: string[] }): State {
  const rng = makeRng(seed)
  const neb = nebula ?? NEBULA_CARDS[Math.floor(rng() * NEBULA_CARDS.length)]!
  return {
    seed,
    round: 1,
    phase: 'plan',
    nebula: neb,
    holds: {},
    players: { A: newPlayer('A'), B: newPlayer('B') },
    pendingArrivals: null,
    lastLight: false,
    winner: null,
    log: [],
    history: [],
  }
}

export function cloneState(s: State): State {
  return structuredClone(s)
}

export function ripple(state: Pick<State, 'nebula'>, planet: string): number {
  return rippleDistance(planet, state.nebula)
}

export function realPos(fleet: Fleet): string {
  if (fleet.front !== STAY) return fleet.front
  if (fleet.back !== STAY) return fleet.back
  return fleet.echo
}

export function fleetOf(state: { players: Partial<Record<Pid, Player>> }, pid: Pid, fid: number): Fleet {
  const f = state.players[pid]?.fleets.find((x) => x.id === fid)
  if (!f) throw new Error(`${pid} 함대 ${fid} 가 없다`)
  return f
}

export function legalMoves(state: { players: Partial<Record<Pid, Player>> }, pid: Pid, fid: number): string[] {
  const f = fleetOf(state, pid, fid)
  const here = realPos(f)
  const blocked = new Set([f.front, f.back])
  return [STAY, ...ADJ[here]!.filter((s) => !blocked.has(s))]
}

export function holdCount(state: Pick<State, 'holds'>, pid: Pid): number {
  return Object.values(state.holds).filter((o) => o === pid).length
}

function log(state: State, entry: LogBody): void {
  state.log.push({ round: state.round, ...entry })
}

const slot = (p: Player, k: number): Card[] => p.slots[k]!

// ---------------------------------------------------------------- 1. 이동 처리
export function submitMoves(state: State, moves: Moves): void {
  if (state.phase !== 'plan') throw new Error(`phase ${state.phase} 에서는 이동할 수 없다`)
  for (const pid of PIDS) {
    FLEET_IDS.forEach((fid, i) => {
      const m = moves[pid][i]!
      if (!legalMoves(state, pid, fid).includes(m)) throw new Error(`${pid} 함대 ${fid}: ${m} 은(는) 갈 수 없다`)
    })
  }
  for (const pid of PIDS) {
    FLEET_IDS.forEach((fid, i) => {
      const f = fleetOf(state, pid, fid)
      f.attacked = false
      f.recalled = false
      const revealed = f.back
      f.back = f.front
      f.front = moves[pid][i]!
      if (revealed !== STAY) f.echo = revealed
      log(state, { type: 'reveal', pid, fid, card: revealed, echo: f.echo })
    })
  }
  state.history.push({
    round: state.round,
    A: FLEET_IDS.map((fid) => realPos(fleetOf(state, 'A', fid))),
    B: FLEET_IDS.map((fid) => realPos(fleetOf(state, 'B', fid))),
  })
  state.phase = 'attack'
}

// ---------------------------------------------------------------- 2. 공격 처리
function recall(state: State, pid: Pid, f: Fleet): void {
  log(state, { type: 'recall', pid, fid: f.id, cards: [f.front, f.back], from: realPos(f) })
  f.front = STAY
  f.back = HOME[pid]
  f.echo = HOME[pid]
  f.recalled = true
}

export function submitAttacks(state: State, attacks: Partial<Record<Pid, number[]>>): void {
  if (state.phase !== 'attack') throw new Error(`phase ${state.phase} 에서는 공격할 수 없다`)
  // 일반 객체의 키 순서(정수 키 먼저)를 옛 엔진과 같게 유지한다
  const declared: Record<string, Set<Pid>> = {}
  for (const pid of PIDS) {
    for (const fid of new Set(attacks[pid] ?? [])) {
      const f = fleetOf(state, pid, fid)
      f.attacked = true
      const s = realPos(f)
      ;(declared[s] ??= new Set()).add(pid)
      log(state, { type: 'strike', pid, fid, system: s })
    }
  }
  const toRecall: [Pid, Fleet][] = []
  for (const [s, who] of Object.entries(declared)) {
    const present: Record<Pid, Fleet[]> = {
      A: state.players.A.fleets.filter((f) => realPos(f) === s),
      B: state.players.B.fleets.filter((f) => realPos(f) === s),
    }
    for (const pid of who) {
      if (present[other(pid)].length === 0) log(state, { type: 'miss', pid, system: s })
    }
    if (present.A.length === 0 || present.B.length === 0) continue
    const sum: Record<Pid, number> = {
      A: present.A.reduce((t, f) => t + STRENGTH[f.id]!, 0),
      B: present.B.reduce((t, f) => t + STRENGTH[f.id]!, 0),
    }
    let losers: Pid[]
    if (sum.A !== sum.B) losers = [sum.A > sum.B ? 'B' : 'A']
    else if (who.size === 2) losers = []
    else losers = [other([...who][0]!)]
    log(state, {
      type: 'engagement',
      system: s,
      fleets: { A: present.A.map((f) => f.id), B: present.B.map((f) => f.id) },
      sum,
      losers,
    })
    for (const l of losers) toRecall.push(...present[l].map((f): [Pid, Fleet] => [l, f]))
  }
  for (const [pid, f] of toRecall) recall(state, pid, f)
  advanceRipple(state)
}

// ---------------------------------------------------------------- 3. 파문 진행 + 봉쇄
function advanceRipple(state: State): void {
  const arrivals: Arrival[] = []
  for (const pid of PIDS) {
    const p = state.players[pid]
    for (const c of slot(p, 1)) arrivals.push({ owner: pid, card: c })
    for (let k = 1; k < 5; k++) p.slots[k] = p.slots[k + 1]!
    p.slots[5] = []
  }
  prepareArrivals(state, arrivals)
}

export interface BlockadeOption {
  idx: number
  blocker: Pid
  planet: string
  fleets: number[]
}

/** 봉쇄 가능한 도달 카드 목록 */
export function blockadeOptions(state: State): BlockadeOption[] {
  const arr = state.pendingArrivals ?? []
  const opts: BlockadeOption[] = []
  arr.forEach((a, idx) => {
    if (a.card.kind !== 'planet') return
    const planet = a.card.planet
    const blocker = other(a.owner)
    const fleets = state.players[blocker].fleets.filter((f) => !f.attacked && realPos(f) === planet).map((f) => f.id)
    if (fleets.length) opts.push({ idx, blocker, planet, fleets })
  })
  return opts
}

function prepareArrivals(state: State, arrivals: Arrival[]): void {
  state.pendingArrivals = arrivals
  for (const a of arrivals) log(state, { type: 'arrival', pid: a.owner, card: a.card })
  if (state.lastLight) {
    // 마지막 빛: 더 숨길 정보가 없으므로 가능한 봉쇄는 모두 자동으로 한다.
    const all = blockadeOptions(state)
    resolveArrivals(
      state,
      all.map((o) => o.idx),
    )
    return
  }
  state.phase = blockadeOptions(state).length ? 'blockade' : 'resolveArrivals'
  if (state.phase === 'resolveArrivals') {
    resolveArrivals(state, [])
    state.phase = 'occupy'
  }
}

export function submitBlockades(state: State, blocks: Partial<Record<Pid, number[]>>): void {
  if (state.phase !== 'blockade') throw new Error(`phase ${state.phase} 에서는 봉쇄할 수 없다`)
  const opts = blockadeOptions(state)
  const chosen: number[] = []
  for (const pid of PIDS) {
    for (const idx of blocks[pid] ?? []) {
      const o = opts.find((x) => x.idx === idx && x.blocker === pid)
      if (!o) throw new Error(`${pid} 은(는) 도달 카드 ${idx} 를 봉쇄할 수 없다`)
      chosen.push(idx)
    }
  }
  resolveArrivals(state, chosen)
  state.phase = 'occupy'
}

function resolveArrivals(state: State, blockedIdx: number[]): void {
  const blocked = new Set(blockedIdx)
  const byPlanet: Record<string, Set<Pid>> = {}
  ;(state.pendingArrivals ?? []).forEach((a, idx) => {
    const p = state.players[a.owner]
    if (a.card.kind === 'decoy') {
      p.decoys += 1
      return
    }
    const planet = a.card.planet
    p.planetCards[planet] = p.planetCards[planet]! + 1
    if (blocked.has(idx)) {
      const o = blockadeOptions(state).find((x) => x.idx === idx)
      log(state, { type: 'blockade', pid: other(a.owner), planet, fid: o?.fleets[0] })
      return
    }
    ;(byPlanet[planet] ??= new Set()).add(a.owner)
  })
  for (const [planet, owners] of Object.entries(byPlanet)) {
    if (owners.size === 2) {
      delete state.holds[planet]
      log(state, { type: 'neutral', planet })
    } else {
      const owner = [...owners][0]!
      const prev = state.holds[planet]
      state.holds[planet] = owner
      log(state, { type: 'hold', pid: owner, planet, prev: prev ?? null })
    }
  }
  state.pendingArrivals = null
}

// ---------------------------------------------------------------- 4. 점령 처리
export function eligibleFleets(state: { players: Partial<Record<Pid, Player>> }, pid: Pid): number[] {
  return (state.players[pid]?.fleets ?? []).filter((f) => !f.attacked && !f.recalled).map((f) => f.id)
}

export function canOccupy(state: { players: Partial<Record<Pid, Player>> }, pid: Pid, fid: number): boolean {
  const f = fleetOf(state, pid, fid)
  const s = realPos(f)
  return !f.attacked && !f.recalled && PLANETS.includes(s) && (state.players[pid]?.planetCards[s] ?? 0) > 0
}

/** 점령·위장 명령을 검사한다. 문제가 없으면 null, 있으면 이유 */
export function validateOccupations(state: State, pid: Pid, orders: readonly OccupyOrder[]): string | null {
  const elig = new Set(eligibleFleets(state, pid))
  const used = new Set<number>()
  const planets = new Set<string>()
  let decoys = 0
  for (const o of orders) {
    if (!elig.has(o.fid)) return `함대 ${o.fid} 는 이번 라운드에 점령·위장할 수 없다`
    if (used.has(o.fid)) return `함대 ${o.fid} 를 두 번 썼다`
    used.add(o.fid)
    if (o.kind === 'occupy') {
      if (!canOccupy(state, pid, o.fid)) return `함대 ${o.fid} 는 점령할 수 없다`
      const s = realPos(fleetOf(state, pid, o.fid))
      if (planets.has(s)) return `같은 행성 ${s} 를 두 번 점령할 수 없다`
      planets.add(s)
    } else if (o.kind === 'decoy') {
      if (![3, 4, 5].includes(o.slot)) return '위장 카드는 3·4·5번 칸에만 놓는다'
      decoys += 1
    } else return `알 수 없는 행동 ${(o as { kind: string }).kind}`
  }
  if (decoys > state.players[pid].decoys) return '위장 카드가 부족하다'
  return null
}

export function submitOccupations(state: State, orders: Partial<Record<Pid, OccupyOrder[]>>): void {
  if (state.phase !== 'occupy') throw new Error(`phase ${state.phase} 에서는 점령할 수 없다`)
  for (const pid of PIDS) {
    const err = validateOccupations(state, pid, orders[pid] ?? [])
    if (err) throw new Error(`${pid}: ${err}`)
  }
  for (const pid of PIDS) {
    const p = state.players[pid]
    for (const o of orders[pid] ?? []) {
      if (o.kind === 'occupy') {
        const s = realPos(fleetOf(state, pid, o.fid))
        p.planetCards[s] = p.planetCards[s]! - 1
        const k = ripple(state, s)
        slot(p, k).push({ kind: 'planet', planet: s, round: state.round })
        log(state, { type: 'place', pid, slot: k, secret: { kind: 'planet', planet: s, fid: o.fid } })
      } else {
        p.decoys -= 1
        slot(p, o.slot).push({ kind: 'decoy', round: state.round })
        log(state, { type: 'place', pid, slot: o.slot, secret: { kind: 'decoy', fid: o.fid } })
      }
    }
  }
  checkVictory(state)
  if ((state.phase as Phase) === 'over') return // checkVictory 가 바꿨을 수 있다
  if (state.round >= ROUNDS) {
    runLastLight(state)
    return
  }
  state.round += 1
  state.phase = 'plan'
}

// ---------------------------------------------------------------- 5. 승리 확인과 마지막 빛
function checkVictory(state: State): void {
  const a = holdCount(state, 'A')
  const b = holdCount(state, 'B')
  if (a < VICTORY && b < VICTORY) return
  if (a === b) return // 동시에 6 이상이고 같으면 계속한다
  finish(state, a > b ? 'A' : 'B', 'immediate')
}

function finish(state: State, winner: Pid | 'draw', how: 'immediate' | 'lastlight'): void {
  state.winner = winner
  state.phase = 'over'
  log(state, { type: 'gameover', winner, how, holds: { A: holdCount(state, 'A'), B: holdCount(state, 'B') } })
}

function runLastLight(state: State): void {
  state.lastLight = true
  log(state, { type: 'lastlight' })
  for (let k = 1; k <= LAST_LIGHT_SLOTS; k++) {
    const arrivals: Arrival[] = []
    for (const pid of PIDS) {
      for (const c of slot(state.players[pid], k)) arrivals.push({ owner: pid, card: c })
      state.players[pid].slots[k] = []
    }
    prepareArrivals(state, arrivals)
  }
  const a = holdCount(state, 'A')
  const b = holdCount(state, 'B')
  finish(state, a === b ? 'draw' : a > b ? 'A' : 'B', 'lastlight')
}

// ---------------------------------------------------------------- 공개 정보
/** 상대의 비밀 배치 내용을 지운 기록. viewer 가 null(관전)이면 양쪽 모두 지운다 */
export function redactLog(log: readonly LogEntry[], viewer: Pid | null): LogEntry[] {
  return log.map((e) => (e.type === 'place' && e.pid !== viewer ? { ...e, secret: undefined } : e))
}

export interface PublicView {
  me: Pid
  round: number
  phase: Phase
  nebula: string[]
  holds: Record<string, Pid>
  my: Player
  oppEchoes: { id: number; echo: string }[]
  oppSlotCounts: (number | null)[]
  oppDecoysLeft: number
  log: LogEntry[]
}

/** pid 가 볼 수 있는 상대 정보. 봇은 이것만 쓴다 */
export function publicView(state: State, pid: Pid): PublicView {
  const opp = other(pid)
  const op = state.players[opp]
  return {
    me: pid,
    round: state.round,
    phase: state.phase,
    nebula: state.nebula,
    holds: { ...state.holds },
    my: state.players[pid],
    oppEchoes: op.fleets.map((f) => ({ id: f.id, echo: f.echo })),
    oppSlotCounts: [null, 1, 2, 3, 4, 5].map((k) => (k ? slot(op, k).length : null)),
    oppDecoysLeft: op.decoys,
    // 공개된 사건만 남긴다(상대의 비밀 배치 내용은 지운다)
    log: redactLog(state.log, pid),
  }
}

// ---------------------------------------------------------------- 플레이어 화면 정보
export interface FleetView {
  id: number
  front: string
  back: string
  echo: string
  real: string
  attacked: boolean
  recalled: boolean
  legal: string[]
  canOccupy: boolean
}

export interface PlayerView {
  me: Pid
  round: number
  phase: Phase
  nebula: string[]
  holds: Record<string, Pid>
  holdCount: Record<Pid, number>
  winner: Pid | 'draw' | null
  lastLight: boolean
  ripple: Record<string, number>
  fleets: FleetView[]
  slots: (Card[] | null)[]
  decoys: number
  eligible: number[]
  blockades: BlockadeOption[]
  opp: {
    fleets: { id: number; echo: string; real: string | null }[]
    slotCounts: (number | null)[]
    decoys: number
  }
  log: LogEntry[]
  history: HistoryRow[]
}

/** 서버(온라인 대전)와 봇 모드 화면이 함께 쓴다. pid 가 알아도 되는 정보만 담는다 */
export function playerView(state: State, pid: Pid, { revealOpp = false } = {}): PlayerView {
  const opp = other(pid)
  const me = state.players[pid]
  const op = state.players[opp]
  const over = state.phase === 'over'
  const show = over || revealOpp
  return {
    me: pid,
    round: state.round,
    phase: state.phase,
    nebula: state.nebula,
    holds: { ...state.holds },
    holdCount: { A: holdCount(state, 'A'), B: holdCount(state, 'B') },
    winner: state.winner,
    lastLight: state.lastLight,
    ripple: Object.fromEntries(PLANETS.map((p) => [p, ripple(state, p)])),
    fleets: me.fleets.map((f) => ({
      id: f.id,
      front: f.front,
      back: f.back,
      echo: f.echo,
      real: realPos(f),
      attacked: f.attacked,
      recalled: f.recalled,
      legal: state.phase === 'plan' ? legalMoves(state, pid, f.id) : [],
      canOccupy: state.phase === 'occupy' ? canOccupy(state, pid, f.id) : false,
    })),
    slots: me.slots.map((s) => (s ? s.map((c) => ({ ...c })) : null)),
    decoys: me.decoys,
    eligible: state.phase === 'occupy' ? eligibleFleets(state, pid) : [],
    blockades: state.phase === 'blockade' ? blockadeOptions(state).filter((o) => o.blocker === pid) : [],
    opp: {
      fleets: op.fleets.map((f) => ({ id: f.id, echo: f.echo, real: show ? realPos(f) : null })),
      slotCounts: [null, 1, 2, 3, 4, 5].map((k) => (k ? slot(op, k).length : null)),
      decoys: op.decoys,
    },
    log: publicView(state, pid).log,
    history: over ? state.history : [],
  }
}
