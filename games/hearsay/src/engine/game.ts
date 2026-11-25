// HEARSAY 게임 엔진 (서버 권위형). 룰북 v0.5를 따른다.
// 망각된 칸의 진실은 망각 순간 엔진에서도 지운다. 그래서 상태 어디에도 지난 진실이 남지 않는다(기둥 1).
// 상태는 JSON 으로 옮길 수 있는 평범한 객체이고, 아래 함수들이 그 자리에서 바꾼다(복제는 부르는 쪽, def.ts 가 한다).
// 시간은 부르는 쪽이 넘기는 now(ms)로만 다룬다.
import {
  DEFAULT_TIMING,
  EMPTY,
  GREY,
  HOUSES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SEASONS,
  plotsFor,
  questionsFor,
  type HouseId,
  type Plot,
  type PlotId,
  type Timing,
} from './rules.ts'
import { nextRandom } from './random.ts'

export class RuleError extends Error {}

/** 진실 칸: 플레이어 번호 | null(주인 없음) | UNKNOWN(아직 없거나 망각됨) */
export const UNKNOWN = -1

/** 증언 토큰: 집안 색 | 'grey' | 'empty'(빈 주먹) */
export type Token = string
/** 공식 역사: 집안 색 | 'grey' | null(아직 기록 없음) */
export type Chron = string | null
export type Phase = 'lobby' | 'claim' | 'claimResult' | 'choose' | 'whisper' | 'result' | 'ended'

export interface Player {
  name: string
  color: HouseId
  isBot: boolean
  persona: string | null
  score: number
}

export interface ChatMsg {
  id: number
  from: number
  text: string
  assert: { answer: string; q: number } | null
  at: number
}

export interface Result {
  plot: PlotId
  season: number
  /** 'none' = 주먹을 내밀지 않음 */
  fists: string[]
  counts: Record<string, number>
  official: string | null
  blank: boolean
  gains: number[]
}

export interface Game {
  n: number
  /** mulberry32 난수 상태 */
  rng: number
  timing: Timing
  players: Player[]
  plots: Plot[]
  /** truth[plot][season] */
  truth: (number | null)[][]
  /** chron[plot][season] */
  chron: Chron[][]
  /** 1..forgotten 계절이 망각됨 */
  forgotten: number
  season: number
  phase: Phase
  questioner: number
  deadline: number | null
  version: number
  chat: ChatMsg[]
  chatSeq: number
  claims: (number | null)[] | null
  claimReveal: { picks: PlotId[]; feuds: PlotId[] } | null
  council: { kind: number | 'final'; left: number } | null
  drawn: number[] | null
  question: { plot: number; season: number } | null
  /** null = 아직 주먹을 내밀지 않음 */
  fists: (Token | null)[] | null
  result: Result | null
  questionNo: number
}

export interface PlayerInit {
  name: string
  isBot?: boolean
  persona?: string | null
}

/** 망각 순간 사라지는 열을 알린다(봇의 불완전한 기억). 엔진은 그 직후 진실을 지운다 */
export type OnForget = (season: number, column: (number | null)[]) => void

const rand = (g: Game): number => nextRandom(g)

export function newGame({ players, seed, timing = {} }: { players: PlayerInit[]; seed: number; timing?: Partial<Timing> }): Game {
  const n = players.length
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new RuleError(`인원은 ${MIN_PLAYERS}~${MAX_PLAYERS}명이어야 합니다`)
  const plots = plotsFor(n).map((p) => ({ ...p }))
  const g: Game = {
    n,
    rng: seed >>> 0,
    timing: { ...DEFAULT_TIMING, ...timing },
    players: players.map((p, i) => ({ name: String(p.name), color: HOUSES[i]!.id, isBot: !!p.isBot, persona: p.persona ?? null, score: 0 })),
    plots,
    truth: plots.map(() => Array<number | null>(SEASONS + 1).fill(UNKNOWN)),
    chron: plots.map(() => Array<Chron>(SEASONS + 1).fill(null)),
    forgotten: 0,
    season: 0,
    phase: 'lobby',
    questioner: 0,
    deadline: null,
    version: 0,
    chat: [],
    chatSeq: 0,
    claims: null,
    claimReveal: null,
    council: null,
    drawn: null,
    question: null,
    fists: null,
    result: null,
    questionNo: 0,
  }
  g.questioner = Math.floor(rand(g) * n)
  return g
}

export const colorOf = (g: Game, i: number): HouseId => g.players[i]!.color
export const indexOfColor = (g: Game, c: string): number => g.players.findIndex((p) => p.color === c)
const bump = (g: Game) => {
  g.version++
}

// ───────── 진행 ─────────
export function start(g: Game, now: number): void {
  if (g.phase !== 'lobby') throw new RuleError('이미 시작했습니다')
  g.season = 1
  beginClaim(g, now)
}

function beginClaim(g: Game, now: number): void {
  g.phase = 'claim'
  g.claims = Array<number | null>(g.n).fill(null)
  g.claimReveal = null
  g.question = null
  g.drawn = null
  g.fists = null
  g.result = null
  g.deadline = now + g.timing.claimMs
  bump(g)
}

function resolveClaims(g: Game, now: number): void {
  const claims = g.claims!
  const counts = new Map<number | null, number>()
  for (const pi of claims) counts.set(pi, (counts.get(pi) ?? 0) + 1)
  const s = g.season
  for (let pi = 0; pi < g.plots.length; pi++) g.truth[pi]![s] = null
  const feuds: number[] = []
  claims.forEach((pi, player) => {
    if (counts.get(pi) === 1) g.truth[pi!]![s] = player
    else if (!feuds.includes(pi!)) feuds.push(pi!)
  })
  g.claimReveal = { picks: claims.map((pi) => g.plots[pi!]!.id), feuds: feuds.map((pi) => g.plots[pi]!.id) }
  g.phase = 'claimResult'
  g.deadline = now + g.timing.claimRevealMs
  bump(g)
}

function afterClaimResult(g: Game, now: number, onForget?: OnForget): void {
  if (g.season >= 2) {
    forget(g, g.season - 1, onForget)
    beginCouncil(g, g.season, now, onForget)
  } else {
    g.season++
    beginClaim(g, now)
  }
}

function forget(g: Game, s: number, onForget?: OnForget): void {
  const column = g.truth.map((row) => row[s] ?? null)
  onForget?.(s, column)
  for (const row of g.truth) row[s] = UNKNOWN // 엔진에서도 진실을 지운다
  g.forgotten = s
}

function beginCouncil(g: Game, kind: number | 'final', now: number, onForget?: OnForget): void {
  g.council = { kind, left: questionsFor(g.n, kind) }
  beginQuestion(g, now, onForget)
}

export function askableSeasons(g: Game, pi: number): number[] {
  const out: number[] = []
  for (let s = 1; s <= g.forgotten; s++) if (g.chron[pi]![s] === null) out.push(s)
  return out
}

function beginQuestion(g: Game, now: number, onForget?: OnForget): void {
  const council = g.council!
  if (council.left <= 0) {
    endCouncil(g, now, onForget)
    return
  }
  const anyAskable = g.plots.some((_, pi) => askableSeasons(g, pi).length > 0)
  if (!anyAskable) {
    // FAQ: 질문을 건너뛰고 질문자 표지를 넘긴다
    council.left--
    g.questioner = (g.questioner + 1) % g.n
    beginQuestion(g, now, onForget)
    return
  }
  const order = g.plots.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand(g) * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  const drawn = order.slice(0, 2)
  if (!drawn.some((pi) => askableSeasons(g, pi).length)) {
    for (const pi of order.slice(2)) {
      drawn.push(pi)
      if (askableSeasons(g, pi).length) break
    }
  }
  g.drawn = drawn
  g.question = null
  g.fists = null
  g.result = null
  g.phase = 'choose'
  g.deadline = now + g.timing.chooseMs
  bump(g)
}

export function ask(g: Game, player: number, plotId: string, season: number, now: number): void {
  if (g.phase !== 'choose') throw new RuleError('지금은 질문 칸을 고를 때가 아닙니다')
  if (player !== g.questioner) throw new RuleError('질문자만 고를 수 있습니다')
  const pi = g.plots.findIndex((p) => p.id === plotId)
  if (pi < 0 || !g.drawn!.includes(pi)) throw new RuleError('공개한 회상 카드의 구역이 아닙니다')
  if (!askableSeasons(g, pi).includes(season)) throw new RuleError('질문 가능 칸이 아닙니다')
  g.question = { plot: pi, season }
  g.questionNo++
  g.phase = 'whisper'
  g.fists = Array<Token | null>(g.n).fill(null)
  g.deadline = now + g.timing.whisperMs
  bump(g)
}

function autoAsk(g: Game, now: number): void {
  for (const pi of g.drawn!) {
    const ss = askableSeasons(g, pi)
    if (ss.length) {
      ask(g, g.questioner, g.plots[pi]!.id, ss[0]!, now)
      return
    }
  }
}

export function allowedTokens(g: Game, player: number): Token[] {
  return [...g.players.filter((_, i) => i !== player).map((p) => p.color), GREY, EMPTY]
}

export function fist(g: Game, player: number, token: string, now: number): void {
  if (g.phase !== 'whisper') throw new RuleError('지금은 증언할 때가 아닙니다')
  const fists = g.fists!
  if (fists[player] !== null) throw new RuleError('이미 주먹을 내밀었습니다')
  if (!allowedTokens(g, player).includes(token)) throw new RuleError('낼 수 없는 증언 토큰입니다')
  fists[player] = token
  bump(g)
  if (fists.every((f) => f !== null)) resolveQuestion(g, now)
}

export function claim(g: Game, player: number, plotId: string, now: number): void {
  if (g.phase !== 'claim') throw new RuleError('지금은 점유 단계가 아닙니다')
  const claims = g.claims!
  if (claims[player] !== null) throw new RuleError('놓은 구역 카드는 바꿀 수 없습니다')
  const pi = g.plots.findIndex((p) => p.id === plotId)
  if (pi < 0) throw new RuleError('쓰지 않는 구역입니다')
  claims[player] = pi
  bump(g)
  if (claims.every((c) => c !== null)) resolveClaims(g, now)
}

/** 집계 (6-4). 질문자의 유효한 증언으로 동점을 깬다. */
export function tally(fists: readonly string[], questioner: number): { counts: Record<string, number>; official: string | null } {
  const counts: Record<string, number> = {}
  fists.forEach((f) => {
    if (f && f !== EMPTY) counts[f] = (counts[f] ?? 0) + 1
  })
  const entries = Object.entries(counts)
  if (!entries.length) return { counts, official: null }
  const max = Math.max(...entries.map(([, c]) => c))
  const leaders = entries.filter(([, c]) => c === max).map(([k]) => k)
  if (leaders.length === 1) return { counts, official: leaders[0]! }
  const q = fists[questioner]
  if (q && q !== EMPTY && leaders.includes(q)) return { counts, official: q }
  return { counts, official: null }
}

function resolveQuestion(g: Game, now: number): void {
  const { plot, season } = g.question!
  const fists = g.fists!.map((f) => (f === null ? 'none' : f))
  const { counts, official } = tally(
    fists.map((f) => (f === 'none' ? EMPTY : f)),
    g.questioner,
  )
  const gains = Array<number>(g.n).fill(0)
  g.chron[plot]![season] = official ?? GREY
  if (official) {
    const owner = indexOfColor(g, official)
    if (owner >= 0) gains[owner]! += g.plots[plot]!.value
    fists.forEach((f, i) => {
      if (f === official) gains[i]! += 1
    })
  }
  gains.forEach((v, i) => {
    g.players[i]!.score += v
  })
  g.result = { plot: g.plots[plot]!.id, season, fists, counts, official, blank: official === null, gains }
  g.phase = 'result'
  g.deadline = now + g.timing.resultMs
  bump(g)
}

function afterResult(g: Game, now: number, onForget?: OnForget): void {
  g.council!.left--
  g.questioner = (g.questioner + 1) % g.n
  beginQuestion(g, now, onForget)
}

function endCouncil(g: Game, now: number, onForget?: OnForget): void {
  if (g.council!.kind === 'final') {
    g.phase = 'ended'
    g.deadline = null
    g.council = null
    g.drawn = null
    g.question = null
    bump(g)
    return
  }
  if (g.season === SEASONS) {
    forget(g, SEASONS, onForget)
    beginCouncil(g, 'final', now, onForget)
    return
  }
  g.season++
  beginClaim(g, now)
}

/** 시간 제한이 지난 단계를 진행한다. 바뀌었으면 true */
export function tick(g: Game, now: number, onForget?: OnForget): boolean {
  let changed = false
  for (let guard = 0; guard < 20 && g.deadline !== null && now >= g.deadline; guard++) {
    changed = true
    switch (g.phase) {
      case 'claim': {
        const claims = g.claims!
        for (let i = 0; i < g.n; i++) {
          if (claims[i] === null) claims[i] = Math.floor(rand(g) * g.plots.length)
        }
        resolveClaims(g, now)
        break
      }
      case 'claimResult':
        afterClaimResult(g, now, onForget)
        break
      case 'choose':
        autoAsk(g, now)
        break
      case 'whisper':
        resolveQuestion(g, now)
        break
      case 'result':
        afterResult(g, now, onForget)
        break
      default:
        g.deadline = null
    }
  }
  return changed
}

// ───────── 말 ─────────
export function canSpeak(g: Game): boolean {
  return ['claim', 'claimResult', 'whisper', 'result', 'ended'].includes(g.phase)
}

export function say(g: Game, player: number, text: unknown, now: number, assert: { answer: unknown } | null = null): void {
  if (!canSpeak(g)) throw new RuleError('지금은 말할 수 없습니다 (질문 칸 선언 전 침묵)')
  const t = String(text ?? '')
    .trim()
    .slice(0, 140)
  if (!t) throw new RuleError('빈 말')
  let a: ChatMsg['assert'] = null
  if (assert && g.phase === 'whisper') {
    const ans = String(assert.answer)
    if ([...g.players.map((p) => p.color as string), GREY].includes(ans)) a = { answer: ans, q: g.questionNo }
  }
  g.chat.push({ id: ++g.chatSeq, from: player, text: t, assert: a, at: now })
  g.chat = g.chat.filter((m) => now - m.at < g.timing.chatTtlMs)
  bump(g)
}

/** 지금 질문에 대해 나온 구조화된 주장들 */
export function currentAssertions(g: Game): ChatMsg[] {
  return g.chat.filter((m) => m.assert && m.assert.q === g.questionNo)
}

// ───────── 보기 (플레이어별) ─────────
export interface CellView {
  tile: HouseId | null
  chron: Chron
  forgotten: boolean
}
export interface GameView {
  version: number
  phase: Phase
  season: number
  forgotten: number
  council: { kind: number | 'final'; left: number } | null
  questioner: number
  deadlineIn: number | null
  board: { id: PlotId; name: string; value: number; cells: CellView[] }[]
  players: { name: string; color: HouseId; score: number; isBot: boolean; persona: string | null; ready: boolean }[]
  drawn: { id: PlotId; askable: number[] }[] | null
  question: { plot: PlotId; season: number } | null
  claimReveal: { picks: PlotId[]; feuds: PlotId[] } | null
  result: Result | null
  chat: { id: number; from: number; text: string; assert: string | null; ttl: number }[]
  canSpeak: boolean
  me: { index: number; color: HouseId; claim: PlotId | null; fist: Token | null; tokens: Token[] } | null
}

export function view(g: Game, me: number, now: number): GameView {
  const visibleCol = (s: number) => s > g.forgotten && s <= g.season
  const board = g.plots.map((pl, pi) => ({
    id: pl.id,
    name: pl.name,
    value: pl.value,
    cells: Array.from({ length: SEASONS }, (_, k): CellView => {
      const s = k + 1
      const t = g.truth[pi]![s]
      return {
        tile: visibleCol(s) && t !== UNKNOWN && t !== null && t !== undefined ? colorOf(g, t) : null,
        chron: g.chron[pi]![s] ?? null,
        forgotten: s <= g.forgotten,
      }
    }),
  }))
  const inWhisper = g.phase === 'whisper'
  const players = g.players.map((p, i) => ({
    name: p.name,
    color: p.color,
    score: p.score,
    isBot: p.isBot,
    persona: p.persona,
    ready: g.phase === 'claim' ? g.claims![i] !== null : inWhisper ? g.fists![i] !== null : false,
  }))
  const drawn = g.phase === 'choose' && g.drawn ? g.drawn.map((pi) => ({ id: g.plots[pi]!.id, askable: askableSeasons(g, pi) })) : null
  const mine = me >= 0 && me < g.n
  return {
    version: g.version,
    phase: g.phase,
    season: g.season,
    forgotten: g.forgotten,
    council: g.council ? { kind: g.council.kind, left: g.council.left } : null,
    questioner: g.questioner,
    deadlineIn: g.deadline === null ? null : Math.max(0, g.deadline - now),
    board,
    players,
    drawn,
    question: g.question ? { plot: g.plots[g.question.plot]!.id, season: g.question.season } : null,
    claimReveal: g.phase === 'claimResult' ? g.claimReveal : null,
    result: g.phase === 'result' ? g.result : null,
    chat: g.chat
      .filter((m) => now - m.at < g.timing.chatTtlMs)
      .map((m) => ({ id: m.id, from: m.from, text: m.text, assert: m.assert?.answer ?? null, ttl: g.timing.chatTtlMs - (now - m.at) })),
    canSpeak: canSpeak(g),
    me: mine
      ? {
          index: me,
          color: colorOf(g, me),
          claim: g.phase === 'claim' && g.claims![me] !== null ? g.plots[g.claims![me]!]!.id : null,
          fist: inWhisper ? (g.fists![me] ?? null) : null,
          tokens: allowedTokens(g, me),
        }
      : null,
  }
}
