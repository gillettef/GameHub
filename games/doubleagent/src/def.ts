// 공통 방·진행 코드(@gamehub/net)에 더블 에이전트 엔진을 연결한다. 서버(온라인)와 브라우저(한 기기)가 함께 쓴다.
//
// 진행: 라운드마다 사람이 1·2차 협상을 한꺼번에 비밀로 낸다(bid). 모두 내면 엔진의 resolveRound 가 정산한다
// (AI 자리의 제안은 엔진이 그 안에서 만든다 — 옛 서버와 같다). 결과를 본 사람이 '다음'을 누르면(ready) nextRound.
// 방의 좌석 번호 = 엔진의 에이전트 번호. 봇 자리는 엔진의 'ai' 에이전트, 사람 자리는 'human'.
// 사람이 나가거나 끊겨 봇이 대신 두면(공통 코드의 대리) 그 자리는 엔진에서는 여전히 'human' 이고, def.bot 이
// 보통·균형형 AI 와 같은 방식으로 제안을 만들어 낸다(옛 서버는 그 자리를 'ai' 로 바꿨다).
//
// 숨은 정보(view 가 가린다, 옛 서버 redact 와 같다): 남의 목표 카드, 다음 라운드 뒤의 이벤트, 구단 요구 카드 더미 순서,
// 난수 상태, 아직 정산 전인 남의 제안(누가 냈는지만 보인다). 게임이 끝나면 목표 카드·이벤트를 모두 공개한다.
import { RuleError, type GameDef } from '@gamehub/net'
import {
  CLUBS,
  MAX_AGENTS,
  MIN_AGENTS,
  PLAYERS,
  TOTAL_ROUNDS,
  club,
  createGame,
  createRng,
  demandFee,
  isDemand,
  makeAiBid,
  nextRound,
  player,
  resolveRound,
  type AiLevel,
  type GameState,
  type Offer,
  type RoundBid,
  type Submission,
} from './engine'

export type Action = { type: 'bid'; round: number; first: Submission; second: Submission } | { type: 'ready'; round: number }

export interface Options {
  /** 봇(AI) 자리의 난이도. 쉬움 = 무작위형, 보통 = 자리 순서대로 균형·집중·신중형 */
  level: AiLevel
}

export interface Table {
  game: GameState
  /** 이번 라운드에 낸 제안(좌석 → 1·2차). 정산 전에는 낸 사람만 자기 것을 본다 */
  subs: Record<number, RoundBid>
  /** 결과를 보고 '다음'을 누른 좌석 */
  ready: number[]
}

export interface View {
  /** 그 좌석이 봐도 되는 게임(남의 목표 카드·이후 이벤트·더미 순서·난수는 가려져 있다) */
  game: GameState
  /** 내 좌석. 관전이면 null */
  me: number | null
  /** 이번 단계(제안·다음)를 마친 좌석 */
  done: number[]
  /** 이번 라운드에 내가 낸 제안(내기 전이면 null) */
  myBid: RoundBid | null
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max

/** 제안 하나. null = 패스, 형식이 틀리면 undefined */
function parseOffer(raw: unknown): Submission | undefined {
  if (raw === null) return null
  if (!isObject(raw)) return undefined
  const { playerId, clubId, demand } = raw
  if (!isInt(playerId, 0, PLAYERS.length - 1) || !isInt(clubId, 0, CLUBS.length - 1) || !isInt(demand, 1, 4) || !isDemand(demand)) return undefined
  return { playerId, clubId, demand }
}

/** 신뢰할 수 없는 입력 → 행동. 형식만 본다(합법 여부·정산은 엔진). 필요한 키만 새 객체로 옮긴다 */
export function parseAction(raw: unknown): Action | null {
  if (!isObject(raw) || !isInt(raw.round, 1, TOTAL_ROUNDS)) return null
  if (raw.type === 'ready') return { type: 'ready', round: raw.round }
  if (raw.type !== 'bid') return null
  const first = parseOffer(raw.first)
  const second = parseOffer(raw.second)
  if (first === undefined || second === undefined) return null
  return { type: 'bid', round: raw.round, first, second }
}

export function parseOptions(raw: unknown): Options {
  return { level: isObject(raw) && raw.level === 'easy' ? 'easy' : 'normal' }
}

/** 엔진의 사람 에이전트(제안을 직접 내는 자리) */
const humans = (g: GameState): number[] => g.agents.flatMap((a, i) => (a.kind === 'human' ? [i] : []))

/**
 * 지금 행동할 좌석. 사람이 없는 판(봇끼리)은 0번 봇이 진행을 맡는다(빈 제안·다음을 내면 엔진이 AI 제안으로 정산).
 */
export function actorsOf(t: Table): number[] {
  const g = t.game
  if (g.phase === 'done') return []
  const hs = humans(g)
  if (!hs.length) return [0]
  return g.phase === 'bid' ? hs.filter((i) => !(i in t.subs)) : hs.filter((i) => !t.ready.includes(i))
}

const offerLine = (o: Offer) => `${player(o.playerId).name} → ${club(o.clubId).name}`

/** 정산 결과를 기록에 남긴다(라운드 결과는 모두에게 공개되는 정보다) */
function logRound(g: GameState, name: (i: number) => string, log: (text: string, kind?: string) => void): void {
  const r = g.results.at(-1)
  if (!r) return
  const won = r.entries.filter((e) => e.status === 'won')
  if (!won.length) log(`R${r.round} · 계약 없음`, 'round')
  for (const e of won) log(`R${r.round} ${e.stage}차 · ${name(e.agent)}: ${offerLine(e.offer!)} 계약 +${e.fee}억 (요구 ${demandFee(e.offer!.demand)}억)`, 'round')
}

export function applyAction(t: Table, seat: number, action: Action, ctx: { name(i: number): string; log(text: string, kind?: string): void; byBot: boolean }): Table {
  const g = t.game
  if (g.phase === 'done') throw new RuleError('이미 끝난 게임입니다.')
  if (action.round !== g.round) throw new RuleError('지난 라운드의 요청입니다.')
  if (!actorsOf(t).includes(seat)) throw new RuleError(g.phase === 'bid' ? '이미 제출했습니다. 다른 사람을 기다리는 중입니다.' : '이미 준비했습니다.')
  const proxy = ctx.byBot && g.agents[seat]?.kind === 'human' ? ' (자리를 비워 봇이 대신)' : ''
  if (action.type === 'bid') {
    if (g.phase !== 'bid') throw new RuleError('지금은 제안할 때가 아닙니다.')
    // 봇끼리 판의 진행 담당(엔진 AI)이 낸 제안은 쓰지 않는다. 엔진이 AI 제안을 만든다
    const subs = g.agents[seat]!.kind === 'human' ? { ...t.subs, [seat]: { first: action.first, second: action.second } } : t.subs
    if (proxy) ctx.log(`R${g.round} · ${ctx.name(seat)} 제출${proxy}`, 'proxy')
    const next: Table = { ...t, subs }
    if (g.agents[seat]!.kind === 'human' && actorsOf(next).length > 0) return next
    const game = resolveRound(g, subs)
    logRound(game, ctx.name, ctx.log)
    return { game, subs: {}, ready: [] }
  }
  if (g.phase !== 'result') throw new RuleError('아직 라운드 결과가 나오지 않았습니다.')
  const next: Table = { ...t, ready: [...t.ready, seat] }
  if (g.agents[seat]!.kind === 'human' && actorsOf(next).length > 0) return next
  const game = nextRound(g)
  if (game.phase === 'done') ctx.log('이적시장 마감 · 목표 카드 공개', 'end')
  return { game, subs: {}, ready: [] }
}

/** 그 좌석에 보낼 게임: 남의 목표 카드·다음 라운드 뒤 이벤트·요구 카드 더미 순서·난수 상태를 가린다(끝나면 전부 공개) */
export function redact(game: GameState, seat: number | null): GameState {
  if (game.phase === 'done') return game
  return {
    ...game,
    rng: 0,
    events: game.events.slice(0, game.round + 1),
    needDecks: Object.fromEntries(Object.entries(game.needDecks).map(([c, d]) => [c, d.map(() => -1)])),
    agents: game.agents.map((a, i) => (i === seat ? a : { ...a, goals: a.goals.map(() => -1) })),
  }
}

export function toView(t: Table, seat: number | null): View {
  const g = t.game
  const me = seat !== null && seat >= 0 && seat < g.agents.length ? seat : null
  const done = g.phase === 'bid' ? Object.keys(t.subs).map(Number) : g.phase === 'result' ? [...t.ready] : []
  return { game: redact(g, me), me, done, myBid: me !== null ? (t.subs[me] ?? null) : null }
}

/**
 * 자리를 비운 사람 대신 낼 제안: 옛 서버가 그 자리를 넘겨받은 AI(보통·균형형)와 같은 방식.
 * 난수는 판의 난수 상태와 좌석에서 만든다(판의 난수를 건드리지 않고, 같은 상태면 같은 제안).
 */
function proxyBid(g: GameState, seat: number): RoundBid {
  const agents = g.agents.map((a, i) => (i === seat ? { ...a, kind: 'ai' as const, level: 'normal' as const, persona: 'balanced' as const } : a))
  return makeAiBid({ ...g, agents }, seat, createRng((g.rng ^ Math.imul(seat + 1, 0x9e3779b1) ^ Math.imul(g.round, 0x85ebca6b)) >>> 0))
}

export const def: GameDef<Table, Action, View, Options> = {
  slug: 'doubleagent',
  minSeats: MIN_AGENTS,
  maxSeats: MAX_AGENTS,
  parseOptions,
  setup({ seats, seed, options }) {
    const level = parseOptions(options).level
    const game = createGame(
      seats.map((s) => (s.kind === 'bot' ? { name: s.name, kind: 'ai' as const, level } : { name: s.name, kind: 'human' as const })),
      seed,
    )
    return { game, subs: {}, ready: [] }
  },
  parseAction,
  actors: actorsOf,
  apply: applyAction,
  view: toView,
  isOver: (t) => t.game.phase === 'done',
  bot: {
    next(t, seat) {
      const g = t.game
      if (g.phase === 'result') return { type: 'ready', round: g.round }
      if (g.phase !== 'bid') return null
      if (g.agents[seat]?.kind !== 'human') return { type: 'bid', round: g.round, first: null, second: null }
      return { type: 'bid', round: g.round, ...proxyBid(g, seat) }
    },
    // 대리 제안이 거절되면(그럴 일은 없어야 한다) 1·2차 모두 패스, 결과 화면이면 다음
    fallback(t) {
      const g = t.game
      if (g.phase === 'bid') return { type: 'bid', round: g.round, first: null, second: null }
      return g.phase === 'result' ? { type: 'ready', round: g.round } : null
    },
    delayMs: 700,
  },
}
