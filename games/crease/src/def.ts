// 공통 방·진행 코드(@gamehub/net)에 CREASE 엔진을 연결한다. 서버(온라인)와 브라우저(한 기기)가 함께 쓴다.
// 행동 하나는 걸음 1칸·접기·펼치기·차례 끝 중 하나다. 한 차례는 여러 행동으로 이루어진다.
import { RuleError, type GameDef } from '@gamehub/net'
import { chooseTurn, isProfileName, type ProfileName } from './engine/bot.ts'
import {
  cellName,
  cloneState,
  doFold,
  doStep,
  finishTurn,
  legalFolds,
  legalSteps,
  mulberry32,
  newGame,
  sameFold,
  startTurn,
  toView,
  unkey,
  type FoldAction,
  type State,
  type TurnAction,
  type View,
} from './engine/engine.ts'
import { RULES } from './engine/rules.ts'

export type Action = TurnAction | { type: 'end' }

export interface Options {
  /** 좌석별 봇 성향(봇 대전 관전). 비면 모두 균형형 */
  profiles: ProfileName[]
}

export interface Table {
  game: State
  kinds: ('human' | 'bot')[]
  profiles: ProfileName[]
}

export const SIDE_NAME = { L: '왼쪽', R: '오른쪽' } as const

export function describeAction(a: TurnAction): string {
  if (a.type === 'step') return `→ ${cellName(...a.to)}`
  return a.type === 'fold' ? `${SIDE_NAME[a.side]} ${a.width}선 접기` : `${SIDE_NAME[a.side]} 펼치기`
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isSide = (v: unknown): v is 'L' | 'R' => v === 'L' || v === 'R'
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max

export function parseAction(raw: unknown): Action | null {
  if (!isObject(raw)) return null
  switch (raw.type) {
    case 'end':
      return { type: 'end' }
    case 'step': {
      const to = raw.to
      if (!Array.isArray(to) || to.length !== 2 || !isInt(to[0], 0, 8) || !isInt(to[1], 0, 4)) return null
      return { type: 'step', to: [to[0], to[1]] }
    }
    case 'fold':
      return isSide(raw.side) && isInt(raw.width, 1, 3) ? { type: 'fold', side: raw.side, width: raw.width } : null
    case 'unfold':
      return isSide(raw.side) ? { type: 'unfold', side: raw.side } : null
    default:
      return null
  }
}

export const def: GameDef<Table, Action, View, Options> = {
  slug: 'crease',
  minSeats: 2,
  maxSeats: 4,
  parseOptions: (raw) => {
    const list = isObject(raw) && Array.isArray(raw.profiles) ? raw.profiles : []
    return { profiles: list.slice(0, 4).map((p) => (isProfileName(p) ? p : 'balanced')) }
  },
  setup({ seats, seed, options }) {
    const game = newGame(seats.length, seed, RULES)
    startTurn(game)
    return { game, kinds: seats.map((s) => s.kind), profiles: seats.map((_, i) => options?.profiles?.[i] ?? 'balanced') }
  },
  parseAction,
  actors: (t) => (t.game.over ? [] : [t.game.current]),
  apply(t, seat, action, ctx) {
    const s = cloneState(t.game)
    const p = s.players[seat]!
    const who = ctx.name(seat) + (ctx.byBot && t.kinds[seat] === 'human' ? '(대리)' : '')
    if (action.type === 'end') {
      const spawned = finishTurn(s)
      ctx.log(`${who}: 차례 끝`)
      for (const k of spawned) {
        const burst = s.lastBurst ? ` · 날개 터뜨리기(${SIDE_NAME[s.lastBurst]})` : ''
        ctx.log(`별똥별 → ${cellName(...unkey(k))}${burst}`, 'spawn')
      }
      if (s.over) {
        ctx.log(`게임 끝 · ${s.players.map((q) => `${ctx.name(q.id)} ${q.score}`).join(' / ')}`, 'over')
      } else {
        if (s.activeIds) ctx.log(`동점 결승 라운드: ${s.activeIds.map((i) => ctx.name(i)).join(' · ')}`)
        startTurn(s)
      }
      return { ...t, game: s }
    }
    const before = { score: p.score, carried: p.carried }
    if (action.type === 'step') {
      if (!legalSteps(s).some(([c, r]) => c === action.to[0] && r === action.to[1])) throw new RuleError('갈 수 없는 칸입니다.')
      doStep(s, action.to)
    } else {
      const legal = legalFolds(s).find((b) => sameFold(action as FoldAction, b))
      if (!legal) throw new RuleError('지금 할 수 없는 접기입니다.')
      doFold(s, legal)
    }
    let msg = `${who}: ${describeAction(action)}`
    if (p.score > before.score) msg += ` · ${p.score - before.score}점 득점`
    else if (p.carried > before.carried) msg += ' · 조각 줍기'
    ctx.log(msg, 'act')
    return { ...t, game: s }
  },
  view: (t) => toView(t.game),
  isOver: (t) => t.game.over,
  bot: {
    // 차례를 한 번에 정해 두고 행동을 하나씩 둔다(보는 사람이 따라갈 수 있게)
    next(t, seat, memory) {
      const s = t.game
      let plan = memory.plan as { turn: number; actions: TurnAction[] } | undefined
      if (!plan || plan.turn !== s.turn) {
        const rnd = mulberry32((s.seed ^ Math.imul(s.turn + 1, 0x9e3779b1)) >>> 0)
        plan = { turn: s.turn, actions: chooseTurn(s, t.profiles[seat] ?? 'balanced', rnd) }
        memory.plan = plan
      }
      return plan.actions.shift() ?? { type: 'end' }
    },
    fallback: () => ({ type: 'end' }),
    delayMs: 650,
  },
}
