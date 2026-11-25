// 공통 방·진행 코드(@gamehub/net)에 LASTGRAIN 엔진을 연결한다. 서버(온라인)와 브라우저(봇 대전)가 함께 쓴다.
// 실시간 게임이라 def.clock 이 모래를 흘린다. 판정은 늘 진행 쪽(서버 또는 한 기기의 Match) 시계로 한다.
// 숨길 정보가 없는 게임이라 모든 좌석이 같은 상태를 본다(엔진 기록은 공통 기록으로 옮겨 보낸다).
import { RuleError, type ClockContext, type GameDef } from '@gamehub/net'
import { chooseAction, isLevel, type Level } from './engine/bot.ts'
import { mulberry32 } from './engine/random.ts'
import { apply, clone, newGame, resign, tick, type Action, type State } from './engine/rules.ts'

export type Act = Action | { type: 'resign' }

export interface Options {
  /** 대모래시계(분) */
  greatMin: 5 | 10 | 20
  target: 10 | 15 | 25
  /** 세우기·눕히기 조작 시간(모래시계 하나당) */
  handleMs: 0 | 1000
  /** 봇 난이도 */
  level: Level
  /** 시작 전 세는 시간. 온라인은 3초, 봇 대전은 0 */
  countdown: 0 | 3000
}

export interface Table {
  game: State
  /** 시작까지 남은 시간. 이 동안은 모래가 흐르지 않고 아무도 둘 수 없다 */
  countdown: number
  level: Level
}

export interface View {
  game: State
  countdown: number
}

const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isCell = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 5
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 40

export function parseOptions(raw: unknown): Options {
  const o = isObject(raw) ? raw : {}
  return {
    greatMin: pick(o.greatMin, [5, 10, 20] as const, 20),
    target: pick(o.target, [10, 15, 25] as const, 25),
    handleMs: pick(o.handleMs, [0, 1000] as const, 1000),
    level: isLevel(o.level) ? o.level : 'normal',
    countdown: pick(o.countdown, [0, 3000] as const, 3000),
  }
}

export function parseAction(raw: unknown): Act | null {
  if (!isObject(raw)) return null
  switch (raw.type) {
    case 'end':
      return { type: 'end' }
    case 'resign':
      return { type: 'resign' }
    case 'summon':
      return isId(raw.unitId) && isCell(raw.c) && isCell(raw.r) ? { type: 'summon', unitId: raw.unitId, c: raw.c, r: raw.r } : null
    case 'move':
      return isId(raw.unitId) && isCell(raw.c) && isCell(raw.r) ? { type: 'move', unitId: raw.unitId, c: raw.c, r: raw.r, flip: raw.flip === true } : null
    case 'attack':
      return isId(raw.unitId) && isId(raw.targetId) && (raw.mode === 'flip' || raw.mode === 'push')
        ? { type: 'attack', unitId: raw.unitId, targetId: raw.targetId, mode: raw.mode }
        : null
    default:
      return null
  }
}

/** 엔진이 새로 남긴 기록을 공통 기록으로 옮긴다(kind = 누구의 일인지: p0·p1) */
function relay(before: State, after: State, ctx: ClockContext): void {
  const n = Math.min(after.seq - before.seq, after.log.length)
  for (const line of after.log.slice(after.log.length - n)) ctx.log(line.text, line.p === null ? undefined : `p${line.p}`)
}

export const def: GameDef<Table, Act, View, Options> = {
  slug: 'lastgrain',
  minSeats: 2,
  maxSeats: 2,
  parseOptions,
  setup({ options }) {
    const o = options ?? parseOptions(undefined)
    return { game: newGame({ greatMs: o.greatMin * 60_000, target: o.target, handleMs: o.handleMs }), countdown: o.countdown, level: o.level }
  },
  parseAction,
  // 시작 전에는 아무도 두지 않는다. 기권도 자기 차례에만 한다(공통 진행 코드는 둘 차례인 좌석의 행동만 받는다)
  actors: (t) => (t.game.over || t.countdown > 0 ? [] : [t.game.active]),
  apply(t, seat, action, ctx) {
    if (t.countdown > 0) throw new RuleError('아직 시작 전이다.')
    const game = clone(t.game)
    const res = action.type === 'resign' ? resign(game, seat) : apply(game, action)
    if (!res.ok) throw new RuleError(res.error)
    relay(t.game, game, ctx)
    return { ...t, game }
  },
  view: (t) => ({ game: { ...t.game, log: [] }, countdown: t.countdown }),
  isOver: (t) => t.game.over,
  clock: {
    advance(t, ms, ctx) {
      if (t.game.over) return t
      const countdown = Math.max(0, t.countdown - ms)
      const flow = ms - (t.countdown - countdown)
      if (flow <= 0) return countdown === t.countdown ? t : { ...t, countdown }
      const game = clone(t.game)
      tick(game, flow)
      relay(t.game, game, ctx)
      return { ...t, countdown, game }
    },
    syncMs: 1000,
  },
  bot: {
    // 1수 앞 탐욕 봇. 행동 사이 지연 동안 자기 모래가 흐른다
    next(t, seat) {
      const g = t.game
      if (g.over || g.active !== seat || t.countdown > 0) return null
      return chooseAction(g, t.level, mulberry32((g.seq * 7919 + seat) >>> 0))
    },
    fallback: () => ({ type: 'end' }),
    delayMs: 1500,
  },
}
