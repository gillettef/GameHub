// 공통 방·진행 코드(@gamehub/net)에 루트바운드 엔진을 연결한다. 서버(온라인)와 브라우저(한 기기)가 함께 쓴다.
//
// 좌석 번호 = 엔진의 자리(seat), 엔진 플레이어 id 는 `p<좌석>`. 봇 자리는 엔진의 'ai', 사람 자리는 'human'.
// 진행(v7 「골목 일과」, Rules.md 5절): 이번 판 식물 공개(모두 동시에 CONFIRM) → 라운드마다 일과 고르기(PICK_CHORE, 선부터 한 사람씩)
// → 차례마다 고른 일과대로: 가져오기(TAKE) → 심기(PLANT, 심을 칸이 없으면 DISCARD) / 담 넘기(MOVE) / 명당 부르기(CALL) → 라운드 수를 채우면 종료.
// 규칙 판단은 모두 엔진(applyAction)이 한다. 여기서는 좌석 ↔ 플레이어 id, 행동 모양 검사, 가림, 차례 제한 시간만 다룬다.
//
// 숨은 정보(view 가 가린다, 옛 서버 maskState 와 같다): 남의 손 카드(장수만), 카드 더미 순서(장수만), 보드·더미 난수 시드.
// 관전자는 모든 손 카드가 가려진다. 마켓·생선 냄새로 편 카드·펼친 일과·고른 일과·이번 판 식물·심은 식물·뿌리·기록은 공개다.
//
// 차례 제한 시간(Rules.md 6.3, 온라인만, 방장이 방을 만들 때 고른다): GameDef.clock 으로 잰다.
// 넘으면 엔진의 자동 수(autoAction), 차례를 끝내는 단계(심기·담 넘기·명당 부르기)의 시간 초과가 연달아 2번이면 그 자리는 AI 가 대신 둔다
// ('다시 내가 두기'로 되찾는다). 일과 고르기·가져오기 시간 초과는 자동으로 두지만 세지 않는다.
// 접속이 끊긴 사람의 차례는 공통 코드가 45초 뒤 봇(def.bot)으로 대신 둔다.
import { RuleError, type GameDef } from '@gamehub/net'
import { requestAiDecision } from './ai/search'
import { tutorialBotAction } from './ai/tutorial'
import {
  AFK_STRIKES_FOR_AUTOPILOT,
  AUTOPILOT_LOG_MARK,
  DEFAULT_TURN_TIME_SEC,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TIMEOUT_LOG_MARK,
  TURN_TIME_OPTIONS_SEC,
  applyAction,
  autoAction,
  createInitialState,
  createPlayer,
  MOVE_MAX,
  MOVE_TIMES,
  isChoreId,
  isDirection,
  isSpeciesId,
  joinPlayer,
  maskState,
  maybeStart,
  type Action as EngineAction,
  type ChoreId,
  type Direction,
  type GameLogEntry,
  type GameState,
  type MaskedGameState,
  type MoveStep,
  type PlayerId,
  type Position,
  type SpeciesId,
} from './engine'

/** 화면 → 서버 행동. 좌석은 접속이 정하므로 playerId 를 받지 않는다. turn = 고를 때 본 차례 번호(늦게 도착한 수 거절) */
export type Action =
  | { type: 'CONFIRM' }
  /** 일과 고르기 단계: 펼친 일과 중 하나 */
  | { type: 'PICK_CHORE'; turn: number; chore: ChoreId }
  /** take: 마켓 번호, 'pile' 카드 더미 맨 위(뒷면), 'peek' 생선 냄새로 편 카드 */
  | { type: 'TAKE'; turn: number; take: number | 'pile' | 'peek' }
  | { type: 'PLANT'; turn: number; species: SpeciesId; pos: Position; rotation?: Direction; seed?: Position }
  | { type: 'DISCARD'; turn: number; species: SpeciesId }
  /** 담 넘기: 1~2번 이동 */
  | { type: 'MOVE'; turn: number; moves: MoveStep[] }
  /** 명당 부르기: 내 칸 위 식물 칸, 새 방향(생략하면 그대로), 그다음 가져올 마켓 번호(가져올 수 있을 때만) */
  | { type: 'CALL'; turn: number; pos: Position; rotation?: Direction; take?: number }
  | { type: 'SURRENDER' }
  /** AI 대리 중인 내 자리를 되찾는다 */
  | { type: 'RESUME' }

export interface Options {
  /** 차례 제한 시간(초). null = 없음. 한 기기는 늘 null */
  turnTime: number | null
  /** 튜토리얼 판: 봇 자리가 약한 연습 봇이다 */
  tutorial: boolean
}

/**
 * 차례 시계. 시간만 흐를 때는 같은 객체 안에서 leftMs 를 줄인다(상태가 바뀐 것으로 치지 않아 1초마다 전체 상태를 다시 보내지 않는다).
 * 행동이 들어와 차례가 바뀌면 새 시계를 만든다. mode 'autopilot' 은 AI 대리 자리가 두기 전 기다리는 시간이다
 */
interface Clock {
  key: string
  mode: 'turn' | 'autopilot'
  leftMs: number
}

export interface Table {
  game: GameState
  options: Options
  /** 좌석별 연속 시간 초과(차례를 끝내는 단계만 센다). 직접 두면 0 */
  strikes: number[]
  /** 연속 시간 초과로 AI 가 대신 두는 사람 좌석 */
  autopilot: number[]
  clock: Clock | null
}

export interface View {
  /** 그 좌석이 봐도 되는 게임(남의 손·카드 더미 순서·시드는 가려져 있다) */
  game: MaskedGameState
  /** 내 플레이어 id. 관전이면 null */
  me: PlayerId | null
  autopilot: number[]
  turnTime: number | null
  /** 지금 차례(공개 단계는 모두)의 남은 시간. 시계가 없으면 null. 화면은 받은 뒤 흐른 시간만큼 줄여 보인다 */
  leftMs: number | null
  tutorial: boolean
}

/** 시간 초과를 세는 단계: 차례를 끝내는 단계 */
const ENDING_STAGES: ReadonlySet<GameState['stage']> = new Set(['plant', 'move', 'call'])

/** AI 대리 자리가 두기 전 기다리는 시간 */
const AUTOPILOT_DELAY_MS = 800
const POS_LIMIT = 30

export const playerId = (seat: number): PlayerId => `p${seat}`
export const seatOf = (id: PlayerId | null): number | null => (id && /^p\d$/.test(id) ? Number(id.slice(1)) : null)

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max

function parsePos(raw: unknown): Position | null {
  if (!isObject(raw) || !isInt(raw.q, -POS_LIMIT, POS_LIMIT) || !isInt(raw.r, -POS_LIMIT, POS_LIMIT)) return null
  return { q: raw.q, r: raw.r }
}

/** 신뢰할 수 없는 입력 → 행동. 모양만 본다(합법 여부는 엔진). 필요한 키만 새 객체로 옮긴다 */
export function parseAction(raw: unknown): Action | null {
  if (!isObject(raw)) return null
  switch (raw.type) {
    case 'CONFIRM':
    case 'SURRENDER':
    case 'RESUME':
      return { type: raw.type }
  }
  if (!isInt(raw.turn, 0, 100_000)) return null
  const turn = raw.turn
  switch (raw.type) {
    case 'PICK_CHORE':
      return isChoreId(raw.chore) ? { type: 'PICK_CHORE', turn, chore: raw.chore } : null
    case 'TAKE':
      if (raw.take === 'pile' || raw.take === 'peek') return { type: 'TAKE', turn, take: raw.take }
      return isInt(raw.take, 0, 9) ? { type: 'TAKE', turn, take: raw.take } : null
    case 'MOVE': {
      if (!Array.isArray(raw.moves) || raw.moves.length < 1 || raw.moves.length > MOVE_TIMES) return null
      const moves: MoveStep[] = []
      for (const m of raw.moves as unknown[]) {
        if (!isObject(m)) return null
        const from = parsePos(m.from)
        const to = parsePos(m.to)
        if (!from || !to || !isInt(m.count, 1, MOVE_MAX)) return null
        moves.push({ from, to, count: m.count })
      }
      return { type: 'MOVE', turn, moves }
    }
    case 'CALL': {
      const pos = parsePos(raw.pos)
      if (!pos) return null
      const a: Extract<Action, { type: 'CALL' }> = { type: 'CALL', turn, pos }
      if (raw.rotation !== undefined) {
        if (!isDirection(raw.rotation)) return null
        a.rotation = raw.rotation
      }
      if (raw.take !== undefined) {
        if (!isInt(raw.take, 0, 9)) return null
        a.take = raw.take
      }
      return a
    }
    case 'DISCARD':
      return isSpeciesId(raw.species) ? { type: 'DISCARD', turn, species: raw.species } : null
    case 'PLANT': {
      const pos = parsePos(raw.pos)
      if (!isSpeciesId(raw.species) || !pos) return null
      const a: Extract<Action, { type: 'PLANT' }> = { type: 'PLANT', turn, species: raw.species, pos }
      if (raw.rotation !== undefined) {
        if (!isDirection(raw.rotation)) return null
        a.rotation = raw.rotation
      }
      if (raw.seed !== undefined) {
        const seed = parsePos(raw.seed)
        if (!seed) return null
        a.seed = seed
      }
      return a
    }
  }
  return null
}

export function parseOptions(raw: unknown): Options {
  const o = isObject(raw) ? raw : {}
  const turnTime = TURN_TIME_OPTIONS_SEC.includes(o.turnTime as number | null) ? (o.turnTime as number | null) : DEFAULT_TURN_TIME_SEC
  return { turnTime, tutorial: o.tutorial === true }
}

/** 엔진 행동으로(좌석의 플레이어 id 를 붙인다) */
function toEngine(a: Exclude<Action, { type: 'RESUME' }>, id: PlayerId): EngineAction {
  switch (a.type) {
    case 'CONFIRM':
    case 'SURRENDER':
      return { type: a.type, playerId: id }
    case 'PICK_CHORE':
      return { type: 'PICK_CHORE', playerId: id, chore: a.chore }
    case 'TAKE':
      return { type: 'TAKE', playerId: id, take: a.take }
    case 'DISCARD':
      return { type: 'DISCARD', playerId: id, species: a.species }
    case 'PLANT': {
      const e: Extract<EngineAction, { type: 'PLANT' }> = { type: 'PLANT', playerId: id, species: a.species, pos: a.pos }
      if (a.rotation !== undefined) e.rotation = a.rotation
      if (a.seed !== undefined) e.seed = a.seed
      return e
    }
    case 'MOVE':
      return { type: 'MOVE', playerId: id, moves: a.moves.map((m) => ({ from: m.from, to: m.to, count: m.count })) }
    case 'CALL': {
      const e: Extract<EngineAction, { type: 'CALL' }> = { type: 'CALL', playerId: id, pos: a.pos }
      if (a.rotation !== undefined) e.rotation = a.rotation
      if (a.take !== undefined) e.take = a.take
      return e
    }
  }
}

/** 엔진 행동(AI·자동 수) → 행동. 엔진의 READY 처럼 여기서 낼 수 없는 것은 null */
export function fromEngine(a: EngineAction, turn: number): Action | null {
  switch (a.type) {
    case 'CONFIRM':
    case 'SURRENDER':
      return { type: a.type }
    case 'PICK_CHORE':
      return { type: 'PICK_CHORE', turn, chore: a.chore }
    case 'TAKE':
      return { type: 'TAKE', turn, take: a.take }
    case 'DISCARD':
      return { type: 'DISCARD', turn, species: a.species }
    case 'PLANT': {
      const p: Extract<Action, { type: 'PLANT' }> = { type: 'PLANT', turn, species: a.species, pos: a.pos }
      if (a.rotation !== undefined) p.rotation = a.rotation
      if (a.seed !== undefined) p.seed = a.seed
      return p
    }
    case 'MOVE':
      return { type: 'MOVE', turn, moves: a.moves.map((m) => ({ from: m.from, to: m.to, count: m.count })) }
    case 'CALL': {
      const c: Extract<Action, { type: 'CALL' }> = { type: 'CALL', turn, pos: a.pos }
      if (a.rotation !== undefined) c.rotation = a.rotation
      if (a.take !== undefined) c.take = a.take
      return c
    }
    default:
      return null
  }
}

const isActive = (g: GameState, seat: number) => g.players[seat]?.surrenderedOrder === null
const currentSeat = (g: GameState) => seatOf(g.currentPlayerId)
const clockKey = (g: GameState) => `${g.phase}:${g.turn}`

/** 지금 상태에 맞는 새 시계. 제한 없음·진행 중 아님·AI 자리 차례·기다리는 사람이 없는 판(사람 1명)이면 null */
function freshClock(t: Pick<Table, 'game' | 'options' | 'autopilot'>): Clock | null {
  const g = t.game
  const limit = t.options.turnTime
  if (limit === null || (g.phase !== 'reveal' && g.phase !== 'playing')) return null
  const key = clockKey(g)
  const cur = currentSeat(g)
  if (g.phase === 'playing' && cur !== null && t.autopilot.includes(cur)) return { key, mode: 'autopilot', leftMs: AUTOPILOT_DELAY_MS }
  if (g.players.filter((p) => p.kind === 'human' && p.surrenderedOrder === null).length <= 1) return null
  if (g.phase === 'playing' && (cur === null || g.players[cur]?.kind === 'ai')) return null
  return { key, mode: 'turn', leftMs: limit * 1000 }
}

/** 차례가 바뀌었으면 새 시계, 그대로면(공개 단계에서 한 사람이 확인 등) 원래 시계 */
function withClock(next: Omit<Table, 'clock'> & { clock: Clock | null }, reset = false): Table {
  if (!reset && next.clock && next.clock.key === clockKey(next.game)) return next as Table
  return { ...next, clock: freshClock(next) }
}

/** 받아들여진 행동을 직접 했으면 자리에 있는 것이다: 연속 시간 초과와 AI 대리를 푼다 */
function release(t: Table, seat: number): Table {
  if (!t.strikes[seat] && !t.autopilot.includes(seat)) return t
  return { ...t, strikes: t.strikes.map((n, i) => (i === seat ? 0 : n)), autopilot: t.autopilot.filter((s) => s !== seat) }
}

/** 엔진이 next 에 새로 붙인 기록 앞에 안내 한 줄을 끼운다(옛 서버와 같다: 진행 탭에서 그 줄 위에 이유가 보인다) */
function noteBefore(prev: GameState, next: GameState, id: PlayerId, message: string): GameState {
  const note: GameLogEntry = { turn: prev.turn, round: prev.round, playerId: id, kind: 'system', message }
  const at = prev.log.length
  return { ...next, log: [...next.log.slice(0, at), note, ...next.log.slice(at)] }
}

const appendNote = (g: GameState, id: PlayerId, message: string): GameState => ({
  ...g,
  log: [...g.log, { turn: g.turn, round: g.round, playerId: id, kind: 'system', message }],
})

const secLabel = (sec: number) => (sec % 60 === 0 ? `${sec / 60}분` : `${sec}초`)

/** 행동해야 하는 좌석: 공개 단계는 아직 확인하지 않은 사람 모두, 진행 중에는 차례인 사람(맨 앞) + 되찾기를 할 수 있는 AI 대리 자리 */
export function actorsOf(t: Table): number[] {
  const g = t.game
  if (g.phase === 'reveal') return g.players.filter((p) => p.surrenderedOrder === null && !p.isReady).map((p) => p.seat)
  if (g.phase !== 'playing') return []
  const cur = currentSeat(g)
  const out = cur === null ? [] : [cur]
  for (const s of t.autopilot) if (s !== cur && isActive(g, s)) out.push(s)
  return out
}

export function applyMove(t: Table, seat: number, action: Action, byBot: boolean): Table {
  const g = t.game
  const id = playerId(seat)
  if ('turn' in action && action.turn !== g.turn) throw new RuleError('차례가 이미 넘어갔습니다. 바뀐 골목을 보고 다시 두세요')
  if (action.type === 'RESUME') {
    if (!t.autopilot.includes(seat)) throw new RuleError('AI가 대신 두는 자리가 아닙니다')
    // 대리 중에 지나간 시간 때문에 곧바로 시간 초과되지 않게 시계를 새로 잰다
    return withClock(release(t, seat), true)
  }
  const r = applyAction(g, toEngine(action, id))
  if (r.error) throw new RuleError(r.error)
  const next: Table = { ...t, game: r.state }
  return withClock(byBot ? next : release(next, seat))
}

/** 시계가 다 됐을 때: AI 대리 자리는 AI 수, 공개 단계는 남은 사람 확인, 진행 중에는 자동 수와 연속 시간 초과 */
function onDeadline(t: Table, clock: Clock): Table {
  const g = t.game
  const limit = t.options.turnTime ?? 0
  if (g.phase === 'reveal') {
    let game = g
    for (const p of g.players) {
      if (game.phase !== 'reveal' || p.isReady || p.surrenderedOrder !== null) continue
      const r = applyAction(game, { type: 'CONFIRM', playerId: p.id })
      if (!r.error) game = noteBefore(game, r.state, p.id, `${p.nickname}: 시간이 지나 자동으로 확인`)
    }
    return withClock({ ...t, game }, true)
  }
  const seat = currentSeat(g)
  if (seat === null) return t
  const id = playerId(seat)
  const me = g.players[seat]!
  if (clock.mode === 'autopilot') {
    const a = requestAiDecision(g, id)
    let r = a ? applyAction(g, a) : { state: g, error: 'AI 응답 없음' }
    if (r.error) {
      const auto = autoAction(g, id)
      r = auto ? applyAction(g, auto) : r
    }
    if (r.error) throw new Error(r.error)
    return withClock({ ...t, game: r.state })
  }
  const auto = autoAction(g, id)
  const r = auto ? applyAction(g, auto) : { state: g, error: '둘 수 있는 수가 없습니다' }
  if (r.error) throw new Error(r.error)
  let game = noteBefore(g, r.state, id, `${me.nickname}: 시간 초과(${secLabel(limit)})로 ${TIMEOUT_LOG_MARK}`)
  // 연속 시간 초과는 차례 단위로 센다: 한 라운드에 일과 고르기·가져오기·심기가 있으므로 차례를 끝내는 단계(심기·담 넘기·명당 부르기)만 센다 (Rules.md 6.3)
  const strikes = (t.strikes[seat] ?? 0) + (ENDING_STAGES.has(g.stage) ? 1 : 0)
  let autopilot = t.autopilot
  if (strikes >= AFK_STRIKES_FOR_AUTOPILOT && game.phase !== 'finished' && !autopilot.includes(seat)) {
    autopilot = [...autopilot, seat]
    game = appendNote(game, id, `${me.nickname}: ${strikes}번 연속 시간 초과로 ${AUTOPILOT_LOG_MARK}. '다시 내가 두기'를 누르면 되찾습니다`)
  }
  return withClock({ ...t, game, autopilot, strikes: t.strikes.map((n, i) => (i === seat ? strikes : n)) })
}

export function advanceClock(t: Table, ms: number): Table {
  const clock = t.clock
  if (!clock || ms <= 0) return t
  clock.leftMs -= ms
  if (clock.leftMs > 0) return t
  try {
    return onDeadline(t, clock)
  } catch (e) {
    // 자동 수가 거절되는 일은 없어야 한다. 매초 다시 시도하지 않도록 이 차례의 시계는 멈춘다
    console.error('[nyangalley] 시간 초과 처리 실패', e)
    clock.leftMs = Infinity
    return t
  }
}

export function toView(t: Table, seat: number | null): View {
  const g = t.game
  const me = seat !== null && seat >= 0 && seat < g.players.length ? playerId(seat) : null
  const c = t.clock
  return {
    // 관전자('')는 아무의 손도 보지 않는다. maskState(null) 은 가리지 않으므로 넘기지 않는다
    game: maskState(g, me ?? ''),
    me,
    autopilot: t.autopilot,
    turnTime: t.options.turnTime,
    leftMs: c && c.mode === 'turn' && Number.isFinite(c.leftMs) ? Math.max(0, Math.round(c.leftMs)) : null,
    tutorial: t.options.tutorial,
  }
}

export interface DefOptions {
  /**
   * 카드 더미 셔플 키. 온라인 서버는 보드 시드와 따로 암호학적 난수를 넣는다(공개된 보드·목표로 시드를 맞혀 손패를
   * 역산할 수 없게, 옛 서버와 같다). 없으면 보드 시드에서 만든다(한 기기: 이어 하기가 같은 판을 다시 만들 수 있게)
   */
  deckKey?(): number[]
}

export function makeDef(opts: DefOptions = {}): GameDef<Table, Action, View, Options> {
  return {
    slug: 'nyangalley',
    minSeats: MIN_PLAYERS,
    maxSeats: MAX_PLAYERS,
    parseOptions,
    setup({ seats, seed, options }) {
      const o = parseOptions(options)
      let game = opts.deckKey ? createInitialState('room', seed, opts.deckKey()) : createInitialState('room', seed)
      seats.forEach((s, i) => {
        const r = joinPlayer(game, createPlayer(playerId(i), s.name, s.kind === 'bot' ? 'ai' : 'human'))
        if (r.error) throw new Error(r.error)
        game = r.state
      })
      for (const p of game.players) {
        if (p.kind === 'human') game = applyAction(game, { type: 'READY', playerId: p.id }).state
      }
      game = maybeStart(game)
      if (game.phase !== 'reveal' && game.phase !== 'playing') throw new Error('게임을 시작하지 못했습니다')
      const t = { game, options: o, strikes: seats.map(() => 0), autopilot: [] as number[] }
      return { ...t, clock: freshClock(t) }
    },
    parseAction,
    actors: actorsOf,
    apply: (t, seat, action, ctx) => applyMove(t, seat, action, ctx.byBot),
    view: toView,
    isOver: (t) => t.game.phase === 'finished',
    clock: { advance: (t, ms) => advanceClock(t, ms) },
    bot: {
      next(t, seat) {
        const g = t.game
        const id = playerId(seat)
        const me = g.players[seat]
        if (!me || me.surrenderedOrder !== null) return null
        if (g.phase === 'reveal') return me.isReady ? null : { type: 'CONFIRM' }
        if (g.phase !== 'playing' || g.currentPlayerId !== id) return null
        // 튜토리얼의 봇 자리는 약한 연습 봇, 그 밖(봇 자리·자리를 비운 사람 대리)은 AI. 둘 다 그 자리가 보는 가린 상태만 쓴다
        const a = t.options.tutorial && me.kind === 'ai' ? tutorialBotAction(maskState(g, id) as unknown as GameState, id) : requestAiDecision(g, id)
        return a ? fromEngine(a, g.turn) : null
      },
      // AI 수가 거절되면(그럴 일은 없어야 한다) 엔진의 자동 수
      fallback(t, seat) {
        const a = autoAction(t.game, playerId(seat))
        return a ? fromEngine(a, t.game.turn) : null
      },
      delayMs: 700,
    },
  }
}

/** 한 기기(브라우저)용. 온라인 서버는 server/app.ts 가 더미 셔플 키를 넣어 만든다 */
export const def = makeDef()
