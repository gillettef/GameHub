// CREASE 규칙 엔진. 규칙의 기준은 rules/rulebook.md 이고, 이 파일은 그 규칙의 구현이다.
// 좌표: 열 col 0..8 (A..I), 행 row 0..4 (1..5).
// 접힘 상태: L = 왼쪽 날개 접기 폭(0~3), R = 오른쪽 날개 접기 폭(0~3), L+R <= MAX_TOTAL_WIDTH.
// 상태는 JSON 으로 보낼 수 있는 값만 담는다(난수도 정수 상태로 둔다). 함수는 넘겨받은 상태를 고친다 — 고치기 싫으면 cloneState 를 먼저 쓴다.
import { per, type Config } from './rules.ts'

export const COLS = 9
export const ROWS = 5
export const CELLS = COLS * ROWS
export const MAX_WIDTH = 3
export const MAX_TOTAL_WIDTH = 4
export const COL_NAMES = 'ABCDEFGHI'

export type Side = 'L' | 'R'
export type Cell = [number, number]

export interface Fold {
  L: number
  R: number
}

export type FoldAction = { type: 'fold'; side: Side; width: number } | { type: 'unfold'; side: Side }
export type TurnAction = { type: 'step'; to: Cell } | FoldAction

export interface Player {
  id: number
  c: number
  r: number
  /** 닻 칸 key */
  anchor: number
  carried: number
  score: number
}

export interface State {
  config: Config
  n: number
  seed: number
  /** mulberry32 의 내부 상태 */
  rng: number
  fold: Fold
  players: Player[]
  /** 칸 key 별 별빛 조각 수 (길이 CELLS) */
  shards: number[]
  /** 별똥별 카드 더미. 맨 끝이 맨 위 */
  deck: number[]
  current: number
  round: number
  turn: number
  over: boolean
  endTriggered: boolean
  endTrigger: number | null
  /** 동점 결승 라운드에 참가하는 좌석. 아니면 null */
  activeIds: number[] | null
  extraRounds: number
  reshuffles: number
  /** 지금까지 떨어진 별똥별 수 */
  spawns: number
  lastSpawn: number | null
  lastBurst: Side | null
  turnSteps: number
  turnFolded: boolean
  turnMaxSteps: number
  turnStartAbsent: boolean
  turnActions: TurnAction[]
}

export const cellName = (c: number, r: number): string => `${COL_NAMES[c]}${r + 1}`
export const key = (c: number, r: number): number => c * ROWS + r
export const unkey = (k: number): Cell => [Math.floor(k / ROWS), k % ROWS]

/** 접힘 상태가 규칙상 가능한가 */
export function validFold(L: number, R: number): boolean {
  return L >= 0 && R >= 0 && L <= MAX_WIDTH && R <= MAX_WIDTH && L + R <= MAX_TOTAL_WIDTH
}

/** 열 c가 가려졌는가(접힌 날개 아래에 깔렸는가) */
export function isCoveredCol(fold: Fold, c: number): boolean {
  const { L, R } = fold
  if (L > 0 && c >= L && c <= 2 * L - 1) return true
  if (R > 0 && c >= COLS - 2 * R && c <= COLS - 1 - R) return true
  return false
}

/** 가려진 열 c를 덮은 날개 */
export function coveringSide(fold: Fold, c: number): Side {
  return fold.L > 0 && c >= fold.L && c <= 2 * fold.L - 1 ? 'L' : 'R'
}

/** 열 c가 접힌 날개 위(뒷면이 보이는 상태)에 있는가 */
export function isFlippedCol(fold: Fold, c: number): boolean {
  return (fold.L > 0 && c < fold.L) || (fold.R > 0 && c >= COLS - fold.R)
}

/** 보이는 열 c가 탁자 위 어느 물리 위치(0..8)에 놓이는가. 가려진 열은 -1 */
export function physPos(fold: Fold, c: number): number {
  if (isCoveredCol(fold, c)) return -1
  if (fold.L > 0 && c < fold.L) return 2 * fold.L - 1 - c
  if (fold.R > 0 && c >= COLS - fold.R) return 2 * (COLS - fold.R) - 1 - c
  return c
}

/** 물리 위치 p에 보이는 열. 없으면 -1 */
export function colAtPos(fold: Fold, p: number): number {
  for (let c = 0; c < COLS; c++) if (physPos(fold, c) === p) return c
  return -1
}

/** 위에서 본 물리 위치 순서대로 보이는 열 목록 */
export function visibleLayout(fold: Fold): { pos: number; col: number; flipped: boolean }[] {
  const out = []
  for (let p = 0; p < COLS; p++) {
    const c = colAtPos(fold, p)
    if (c >= 0) out.push({ pos: p, col: c, flipped: isFlippedCol(fold, c) })
  }
  return out
}

/** 칸 (c,r)의 이웃 칸 목록 (보이는 칸끼리만) */
export function neighbors(fold: Fold, c: number, r: number): Cell[] {
  if (isCoveredCol(fold, c)) return []
  const out: Cell[] = []
  if (r > 0) out.push([c, r - 1])
  if (r < ROWS - 1) out.push([c, r + 1])
  const p = physPos(fold, c)
  for (const q of [p - 1, p + 1]) {
    if (q < 0 || q >= COLS) continue
    const nc = colAtPos(fold, q)
    if (nc >= 0) out.push([nc, r])
  }
  return out
}

// 접힘 상태별 거리표 (45칸 x 45칸, 닿지 않으면 -1). 계산 결과만 기억해 두는 캐시다
const distCache = new Map<number, Int16Array[]>()
export function distTable(fold: Fold): Int16Array[] {
  const fk = fold.L * 10 + fold.R
  const hit = distCache.get(fk)
  if (hit) return hit
  const table = Array.from({ length: CELLS }, () => new Int16Array(CELLS).fill(-1))
  for (let s = 0; s < CELLS; s++) {
    const [sc] = unkey(s)
    if (isCoveredCol(fold, sc)) continue
    const d = table[s]!
    d[s] = 0
    const q = [s]
    for (let i = 0; i < q.length; i++) {
      const [c, r] = unkey(q[i]!)
      for (const [nc, nr] of neighbors(fold, c, r)) {
        const nk = key(nc, nr)
        if (d[nk]! < 0) {
          d[nk] = d[q[i]!]! + 1
          q.push(nk)
        }
      }
    }
  }
  distCache.set(fk, table)
  return table
}

/** 접기/펼치기 행동 목록 */
export function foldActions(fold: Fold): FoldAction[] {
  const acts: FoldAction[] = []
  if (fold.L === 0) for (let w = 1; w <= MAX_WIDTH; w++) if (validFold(w, fold.R)) acts.push({ type: 'fold', side: 'L', width: w })
  if (fold.R === 0) for (let w = 1; w <= MAX_WIDTH; w++) if (validFold(fold.L, w)) acts.push({ type: 'fold', side: 'R', width: w })
  if (fold.L > 0) acts.push({ type: 'unfold', side: 'L' })
  if (fold.R > 0) acts.push({ type: 'unfold', side: 'R' })
  return acts
}

export function applyFoldAction(fold: Fold, a: FoldAction): Fold {
  return { ...fold, [a.side]: a.type === 'fold' ? a.width : 0 }
}

export const sameFold = (a: FoldAction, b: FoldAction): boolean =>
  a.type === b.type && a.side === b.side && (a.type === 'unfold' || (b.type === 'fold' && a.width === b.width))

// ---------------------------------------------------------------- 난수

/** mulberry32 한 번: [다음 내부 상태, 0 이상 1 미만의 값] */
function mulberryStep(a: number): [number, number] {
  const next = (a + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [next, ((t ^ (t >>> 14)) >>> 0) / 4294967296]
}

/** 시드 난수 함수(봇의 흔들림, 시뮬레이션용) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    const [next, v] = mulberryStep(a)
    a = next
    return v
  }
}

function random(state: State): number {
  const [next, v] = mulberryStep(state.rng)
  state.rng = next
  return v
}

function shuffle(arr: number[], rnd: () => number): number[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

function fullDeck(config: Config): number[] {
  const deck: number[] = []
  for (const c of config.spawnCols) for (let r = 0; r < ROWS; r++) deck.push(key(c, r))
  return deck
}

// ---------------------------------------------------------------- 게임 상태

export function newGame(numPlayers: number, seed: number, config: Config): State {
  const deck = fullDeck(config)
  const players = per(config.anchors, numPlayers).map(([c, r], i): Player => ({
    id: i,
    c,
    r,
    anchor: key(c, r),
    carried: config.startCarried?.[numPlayers]?.[i] ?? 0,
    score: config.startScore?.[numPlayers]?.[i] ?? 0,
  }))
  const state: State = {
    config,
    n: numPlayers,
    seed,
    rng: seed >>> 0,
    fold: { L: 0, R: 0 },
    players,
    shards: new Array<number>(CELLS).fill(0),
    deck,
    current: 0,
    round: 1,
    turn: 0,
    over: false,
    endTriggered: false,
    endTrigger: null,
    activeIds: null,
    extraRounds: 0,
    reshuffles: 0,
    spawns: 0,
    lastSpawn: null,
    lastBurst: null,
    turnSteps: 0,
    turnFolded: false,
    turnMaxSteps: config.moveSteps,
    turnStartAbsent: false,
    turnActions: [],
  }
  shuffle(deck, () => random(state))
  for (let i = 0; i < per(config.initialShards, numPlayers); i++) spawn(state)
  return state
}

export function cloneState(s: State): State {
  return {
    ...s,
    fold: { ...s.fold },
    players: s.players.map((p) => ({ ...p })),
    shards: s.shards.slice(),
    deck: s.deck.slice(),
    activeIds: s.activeIds && s.activeIds.slice(),
    turnActions: s.turnActions.slice(),
  }
}

export function shardsInUse(state: State): number {
  let n = 0
  for (const v of state.shards) n += v
  for (const p of state.players) n += p.carried + p.score
  return n
}

/** 별똥별 1장. 떨어진 칸 key, 떨어지지 않았으면 null */
export function spawn(state: State): number | null {
  const cfg = state.config
  if (cfg.shardSupply && shardsInUse(state) >= cfg.shardSupply) return null
  if (state.deck.length === 0 && cfg.reshuffle) {
    // 별똥별 카드 더미가 비면 버린 카드를 모두 섞어 새 더미를 만든다
    state.deck = shuffle(fullDeck(cfg), () => random(state))
    state.reshuffles++
  }
  const k = state.deck.pop()
  if (k === undefined) return null
  state.lastBurst = null
  const [c] = unkey(k)
  // 날개 터뜨리기: 가려진 칸에 떨어지면 그 칸을 가린 날개를 펼친 뒤 놓는다
  if (cfg.burstOnCovered && isCoveredCol(state.fold, c)) {
    const side = coveringSide(state.fold, c)
    state.fold = { ...state.fold, [side]: 0 }
    state.lastBurst = side
  }
  state.shards[k]! += 1
  state.lastSpawn = k
  state.spawns++
  return k
}

export const isPresent = (state: Pick<State, 'fold'>, k: number): boolean => !isCoveredCol(state.fold, unkey(k)[0])
export const playerPresent = (state: Pick<State, 'fold'>, p: Pick<Player, 'c'>): boolean => !isCoveredCol(state.fold, p.c)

/** 활성 플레이어 처리: 줍기와 닻 칸 득점 (보이는 칸에 있을 때만) */
function resolveCell(state: State, p: Player): void {
  if (!playerPresent(state, p)) return
  const k = key(p.c, p.r)
  const cap = state.config.carryLimit - p.carried
  const here = state.shards[k]!
  if (here > 0 && cap > 0) {
    const take = Math.min(cap, here)
    p.carried += take
    state.shards[k] = here - take
  }
  if (k === p.anchor && p.carried > 0) {
    p.score += p.carried
    p.carried = 0
  }
}

const currentPlayer = (state: State): Player => state.players[state.current]!

/** 차례 시작: 걸음·접기 사용량을 초기화하고 시작 칸에서 줍기/득점을 처리한다 */
export function startTurn(state: State): void {
  state.turnSteps = 0
  state.turnFolded = false
  state.turnActions = []
  state.turnStartAbsent = !playerPresent(state, currentPlayer(state))
  state.turnMaxSteps = state.config.moveSteps
  resolveCell(state, currentPlayer(state))
}

/** 합법 수 계산에 필요한 상태(엔진 상태와 화면용 View 모두 해당) */
export type TurnInfo = Pick<State, 'fold' | 'current' | 'turnSteps' | 'turnMaxSteps' | 'turnFolded'> & { players: Pick<Player, 'c' | 'r'>[] }

/** 활성 플레이어가 지금 할 수 있는 걸음 목적지 */
export function legalSteps(state: TurnInfo): Cell[] {
  const p = state.players[state.current]!
  if (state.turnSteps >= state.turnMaxSteps || !playerPresent(state, p)) return []
  return neighbors(state.fold, p.c, p.r)
}

/** 활성 플레이어가 지금 할 수 있는 접기/펼치기 */
export function legalFolds(state: TurnInfo): FoldAction[] {
  return state.turnFolded ? [] : foldActions(state.fold)
}

export function doStep(state: State, to: Cell): void {
  const p = currentPlayer(state)
  if (state.turnSteps >= state.turnMaxSteps) throw new Error('걸음 수 초과')
  if (!playerPresent(state, p)) throw new Error('부재 중인 길잡이는 이동할 수 없다')
  const ok = neighbors(state.fold, p.c, p.r).some(([c, r]) => c === to[0] && r === to[1])
  if (!ok) throw new Error(`이웃 칸이 아니다: ${cellName(p.c, p.r)} -> ${cellName(...to)}`)
  p.c = to[0]
  p.r = to[1]
  state.turnSteps++
  state.turnActions.push({ type: 'step', to: [to[0], to[1]] })
  resolveCell(state, p)
}

export function doFold(state: State, a: FoldAction): void {
  if (state.turnFolded) throw new Error('접기/펼치기는 차례에 한 번')
  if (!foldActions(state.fold).some((b) => sameFold(a, b))) throw new Error('불가능한 접기/펼치기')
  state.fold = applyFoldAction(state.fold, a)
  state.turnFolded = true
  state.turnActions.push({ ...a })
  const cfg = state.config
  if (cfg.freedStepPenalty && state.turnStartAbsent && playerPresent(state, currentPlayer(state))) {
    state.turnMaxSteps = cfg.moveSteps - cfg.freedStepPenalty
  }
  resolveCell(state, currentPlayer(state))
}

/** 차례 끝: 별똥별, 종료 확인, 다음 플레이어로. 이번에 떨어진 별똥별 칸들을 돌려준다 */
export function finishTurn(state: State): number[] {
  const before = state.spawns
  endTurn(state)
  const out: number[] = []
  // 한 차례에 여러 장이 떨어질 수 있는 설정(실험용)에서는 마지막 칸만 남으므로 수만 맞춘다
  for (let i = before; i < state.spawns; i++) out.push(state.lastSpawn!)
  return out
}

/** 한 차례를 적용한다. 걸음 수와 접기 횟수를 검사하고 위반 시 예외를 던진다 */
export function playTurn(state: State, actions: TurnAction[]): number[] {
  startTurn(state)
  for (const a of actions) {
    if (a.type === 'step') doStep(state, a.to)
    else doFold(state, a)
  }
  return finishTurn(state)
}

function nextActive(state: State, from: number): number {
  for (let i = 1; i <= state.n; i++) {
    const c = (from + i) % state.n
    if (!state.activeIds || state.activeIds.includes(c)) return c
  }
  return from
}

function endTurn(state: State): void {
  const cfg = state.config
  const target = per(cfg.target, state.n)
  const mode = cfg.endMode ?? 'round'
  const prev = state.current
  state.turn++
  for (let i = 0; i < (cfg.spawnPerTurn ?? 0); i++) spawn(state)
  const supplyOut = cfg.shardSupply ? shardsInUse(state) >= cfg.shardSupply : !cfg.reshuffle && state.deck.length === 0
  if (!state.endTriggered && (state.players.some((pl) => pl.score >= target) || supplyOut)) {
    state.endTriggered = true
    state.endTrigger = prev
    if (mode === 'immediate') {
      state.over = true
      return
    }
  }
  if (mode === 'lastTurn') {
    state.current = (prev + 1) % state.n
    if (state.endTriggered && state.current === state.endTrigger) {
      state.over = true
      return
    }
    if (state.current === 0) state.round++
    return
  }
  // 'round': 종료가 정해지면 그 라운드 끝까지 진행한다
  const nxt = nextActive(state, prev)
  if (nxt <= prev) {
    if (state.endTriggered) {
      const tied = winners(state)
      // 동점 결승: 동점인 플레이어끼리만 한 라운드를 더 진행한다 (최대 3번)
      if (tied.length > 1 && cfg.tieBreak === 'extraRound' && state.extraRounds < 3) {
        state.activeIds = tied
        state.extraRounds++
        state.round++
        state.current = tied[0]!
        return
      }
      state.over = true
      return
    }
    for (let i = 0; i < per(cfg.spawnPerRound, state.n); i++) spawn(state)
    state.round++
  }
  state.current = nxt
}

/** 승자 판정: 점수 > 들고 있는 조각. 그래도 같으면 공동 승리(목록 반환) */
export function winners(state: Pick<State, 'config' | 'players'>): number[] {
  const late = state.config.tieBreak === 'lateSeat'
  const val = (p: Player) => p.score * 1000 + p.carried * 10 + (late ? p.id : 0)
  const best = Math.max(...state.players.map(val))
  return state.players.filter((p) => val(p) === best).map((p) => p.id)
}

// ---------------------------------------------------------------- 화면·네트워크용 보기

/** 숨길 정보(카드 더미 순서, 난수 상태)를 뺀 상태. 모든 좌석이 같은 것을 본다 */
export interface View {
  n: number
  fold: Fold
  players: Player[]
  /** [칸 key, 조각 수] (key 순서) */
  shards: [number, number][]
  current: number
  round: number
  turn: number
  turnSteps: number
  turnMaxSteps: number
  turnFolded: boolean
  deckLeft: number
  supplyLeft: number | null
  over: boolean
  winners: number[] | null
  activeIds: number[] | null
  spawns: number
  lastSpawn: number | null
  lastBurst: Side | null
}

export function toView(state: State): View {
  const shards: [number, number][] = []
  state.shards.forEach((n, k) => {
    if (n > 0) shards.push([k, n])
  })
  return {
    n: state.n,
    fold: { ...state.fold },
    players: state.players.map((p) => ({ id: p.id, c: p.c, r: p.r, anchor: p.anchor, carried: p.carried, score: p.score })),
    shards,
    current: state.current,
    round: state.round,
    turn: state.turn,
    turnSteps: state.turnSteps,
    turnMaxSteps: state.turnMaxSteps,
    turnFolded: state.turnFolded,
    deckLeft: state.deck.length,
    supplyLeft: state.config.shardSupply ? state.config.shardSupply - shardsInUse(state) : null,
    over: state.over,
    winners: state.over ? winners(state) : null,
    activeIds: state.activeIds && state.activeIds.slice(),
    spawns: state.spawns,
    lastSpawn: state.lastSpawn,
    lastBurst: state.lastBurst,
  }
}
