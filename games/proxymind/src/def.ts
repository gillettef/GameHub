// 공통 방·진행 코드(@gamehub/net)에 PROXYMIND 엔진을 연결한다. 서버(온라인)와 브라우저(한 기기)가 함께 쓴다.
//
// 방의 좌석 번호 = 엔진의 플레이어 번호(시계 방향). 각자 다음 좌석이 내 로봇의 설계자다.
// 설계 단계는 아직 놓지 않은 모든 설계자가 동시에 둘 차례(actors)이고, 실행 단계는 지금 로봇의 조종사 한 명이다.
//
// 숨은 정보(view 에서 가린다, 옛 서버의 redact 와 같거나 더 좁다):
// - 다른 설계자의 손패(뽑은 5개)와 공개 전 배치(pending): 개수만 -1 로 남긴다(누가 놓기를 마쳤는지는 공개)
// - 주머니 순서(개수만 -1 로)와 난수 상태(rng = 0). 시드는 표(Table)에만 있고 view 로 나가지 않는다
// - 옛 서버는 게임이 끝나면 전체 상태를 보냈지만 이제 끝난 뒤에도 난수·주머니는 가린다(끝나면 손패·배치는 이미 비어 있다)
import { RuleError, type GameDef } from '@gamehub/net'
import { botDesign, botIntervention } from './engine/ai'
import { MAX_PLAYERS, MIN_PLAYERS, TILES } from './engine/data'
import { createGame, currentBot, playTurn, submitDesign } from './engine/engine'
import type { BotLevel, GameState, Intervention } from './engine/types'
import { eventSeat, eventText } from './text'

export type Action = { type: 'design'; slots: number[] } | { type: 'intervene'; iv: Intervention }

export interface Options {
  /** 봇 실력(모든 봇 자리에 같이 적용) */
  level: BotLevel
}

export interface Table {
  game: GameState
  /** 봇의 흔들림 난수에 쓴다. 절대 view 로 내보내지 않는다 */
  seed: number
  kinds: ('human' | 'bot')[]
}

/** 그 좌석에 보내는 게임 상태. 엔진의 GameState 모양을 유지해 화면이 엔진의 판정 함수를 그대로 쓴다 */
export type SeatView = GameState

const TILE_COUNT = TILES.reduce((a, t) => a + t.count, 0)
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max

function parseIv(raw: unknown): Intervention | null {
  if (!isObject(raw)) return null
  if (raw.k === 'none' || raw.k === 'thrust') return { k: raw.k }
  if (raw.k === 'turn' && (raw.dir === 'L' || raw.dir === 'R')) return { k: 'turn', dir: raw.dir }
  if (raw.k === 'block' && isInt(raw.slot, 0, 2)) return { k: 'block', slot: raw.slot }
  return null
}

/** 신뢰할 수 없는 입력 → 행동. 형식만 본다(손패에 있는지 등은 apply). 필요한 키만 새 객체로 옮긴다 */
export function parseAction(raw: unknown): Action | null {
  if (!isObject(raw)) return null
  switch (raw.type) {
    case 'design': {
      const s = raw.slots
      if (!Array.isArray(s) || s.length !== 3 || !s.every((x) => isInt(x, 0, TILE_COUNT - 1)) || new Set(s).size !== 3) return null
      return { type: 'design', slots: [...(s as number[])] }
    }
    case 'intervene': {
      const iv = parseIv(raw.iv)
      return iv ? { type: 'intervene', iv } : null
    }
    default:
      return null
  }
}

export function parseOptions(raw: unknown): Options {
  return { level: isObject(raw) && raw.level === 'easy' ? 'easy' : 'normal' }
}

export function actors(g: GameState): number[] {
  if (g.phase === 'design') return g.players.flatMap((p, i) => (p.pending ? [] : [i]))
  if (g.phase === 'exec') return [currentBot(g)]
  return []
}

/** 그 좌석이 봐도 되는 상태(관전은 null). 화면에 필요한 이번 라운드의 사건만 남긴다 */
export function redact(g: GameState, seat: number | null): SeatView {
  let from = 0
  for (let i = g.log.length - 1; i >= 0; i--)
    if (g.log[i]!.t === 'round') {
      from = i
      break
    }
  return {
    ...g,
    rng: 0,
    bag: g.bag.map(() => -1),
    log: g.log.slice(from),
    players: g.players.map((p, i) => (i === seat ? p : { ...p, hand: p.hand.map(() => -1), pending: p.pending ? p.pending.map(() => -1) : null })),
  }
}

/** 봇의 흔들림 난수: 같은 판·같은 단계면 같은 수(재생해도 같다) */
function botSeed(t: Table, seat: number): number {
  const g = t.game
  const step = g.round * 16 + (g.phase === 'exec' ? 8 + g.turn : 0)
  return (t.seed ^ Math.imul(step + 1, 0x9e3779b1) ^ Math.imul(seat + 1, 0x85ebca6b)) >>> 0
}

export const def: GameDef<Table, Action, SeatView, Options> = {
  slug: 'proxymind',
  minSeats: MIN_PLAYERS,
  maxSeats: MAX_PLAYERS,
  parseOptions,
  setup({ seats, seed, options }) {
    const level = options?.level ?? 'normal'
    const game = createGame(
      seats.map((s) => ({ name: s.name, kind: s.kind, level: s.kind === 'bot' ? level : 'normal' })),
      seed,
    )
    return { game, seed, kinds: seats.map((s) => s.kind) }
  },
  parseAction,
  actors: (t) => actors(t.game),
  apply(t, seat, action, ctx) {
    if (!actors(t.game).includes(seat)) throw new RuleError('지금은 내 차례가 아닙니다.')
    const g = structuredClone(t.game)
    const from = g.log.length
    try {
      if (action.type === 'design') {
        if (g.phase !== 'design') throw new RuleError('설계 단계가 아닙니다.')
        submitDesign(g, seat, action.slots)
      } else {
        if (g.phase !== 'exec') throw new RuleError('실행 단계가 아닙니다.')
        playTurn(g, action.iv)
      }
    } catch (e) {
      if (e instanceof RuleError) throw e
      throw new RuleError(e instanceof Error ? `${e.message}.` : '할 수 없는 행동입니다.')
    }
    const proxy = ctx.byBot && t.kinds[seat] === 'human' ? ' (대리)' : ''
    if (action.type === 'design') ctx.log(`${ctx.name(seat)} 설계 완료${proxy}`, String(seat))
    // 개입 안 함은 엔진이 사건을 남기지 않는다. 대신 둔 것만 알린다
    else if (proxy && action.iv.k === 'none') ctx.log(`${ctx.name(seat)} 개입 안 함${proxy}`, String(seat))
    for (const e of g.log.slice(from)) {
      const text = eventText(g, e, ctx.name)
      if (text === null) continue
      const who = eventSeat(e)
      ctx.log(e.t === 'intervene' ? text + proxy : text, who === null ? 'sys' : String(who))
    }
    return { ...t, game: g }
  },
  view: (t, seat) => redact(t.game, seat),
  isOver: (t) => t.game.phase === 'done',
  bot: {
    next(t, seat) {
      const g = t.game
      if (g.phase === 'design') return g.players[seat]!.pending ? null : { type: 'design', slots: botDesign(g, seat, botSeed(t, seat)) }
      if (g.phase === 'exec' && currentBot(g) === seat) return { type: 'intervene', iv: botIntervention(g, botSeed(t, seat)) }
      return null
    },
    // 봇이 고른 수가 거절되면(그럴 일은 없어야 한다) 손패 앞 3개를 놓거나 개입하지 않는다
    fallback(t, seat) {
      const g = t.game
      if (g.phase === 'design') return { type: 'design', slots: g.players[seat]!.hand.slice(0, 3) }
      return { type: 'intervene', iv: { k: 'none' } }
    },
    delayMs: 900,
  },
}
