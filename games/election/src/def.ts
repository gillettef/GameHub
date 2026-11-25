/**
 * 공통 방·진행 코드(@gamehub/net)에 유세 대작전 엔진을 연결한다. 서버(온라인)와 브라우저(한 기기)가 함께 쓴다.
 *
 * - 좌석(0 = 방장/첫 자리, 1)과 후보 색(0 = 🔵 파랑 선공, 1 = 🔴 빨강)은 다르다. 판을 만들 때 시드로 추첨해
 *   어느 좌석이 파랑(선공)인지 정한다(옛 게임: 온라인 방장 자리·AI 대결 내 색을 무작위로 정함).
 * - 숨길 정보가 없는 완전 정보 게임이다. view 는 시드(봇 난수의 근원)만 빼고 상태와 마지막 행동을 그대로 보낸다.
 *   화면은 마지막 행동을 직전 상태에 다시 적용(resolveAction)해 자동 내리기 박자를 연출한다.
 */
import { RuleError, type GameDef } from '@gamehub/net'
import { chooseActions } from './engine/ai'
import { HOLE_LABELS, PLAYER_EMOJI, PLAYER_NAMES } from './engine/constants'
import { mulberry32 } from './engine/rng'
import { initialState, isLegal, legalActions, resolveAction, score, winner } from './engine/rules'
import type { Action, GameEvent, GameState, Player } from './engine/types'
import { isAction } from './engine/validate'

export type { Action }

export interface Table {
  game: GameState
  /** 🔵 파랑(선공)을 맡은 좌석 */
  blue: Player
  /** 봇 난수용. 화면에는 보내지 않는다 */
  seed: number
  /** 마지막 행동(연출용) */
  last: Action | null
  kinds: ('human' | 'bot')[]
}

export interface View {
  game: GameState
  blue: Player
  last: Action | null
}

/** 후보 색 → 좌석 */
export const seatOf = (blue: Player, p: Player): number => (p === 0 ? blue : 1 - blue)
/** 좌석 → 후보 색 */
export const colorOf = (blue: Player, seat: number): Player => (seat === blue ? 0 : 1)

/** 사건 → 기록 한 줄. 남기지 않을 사건이면 null (옛 화면의 속보 문구에 좌석 이름을 붙였다) */
export function describe(e: GameEvent, name: (p: Player) => string): string | null {
  switch (e.type) {
    case 'setup':
      return `${PLAYER_EMOJI[e.player]} ${name(e.player)} · ${HOLE_LABELS[e.hole]} 사전 배치`
    case 'place':
      return `${PLAYER_EMOJI[e.player]} ${name(e.player)} · ${HOLE_LABELS[e.hole]} 예비군 투입`
    case 'pick':
      return `${PLAYER_EMOJI[e.player]} ${name(e.player)} · ${HOLE_LABELS[e.hole]}에서 버스 출발 (${e.count}명)`
    case 'lost':
      return `🚌 놓을 곳이 없어 ${e.tokens.length}명 낙선`
    case 'gameOver':
      return '🏁 선거일!'
    default:
      return null
  }
}

/** 신뢰할 수 없는 입력 → 행동. 형식만 보고 알려진 필드만 새로 담는다(합법 여부는 apply) */
export function parseAction(raw: unknown): Action | null {
  if (!isAction(raw)) return null
  switch (raw.type) {
    case 'setup':
    case 'place':
    case 'pick':
      return { type: raw.type, hole: raw.hole }
    case 'endPlace':
      return { type: 'endPlace' }
    case 'drop':
      return { type: 'drop', color: raw.color }
  }
}

const REJECT: Record<GameState['phase'], string> = {
  setup: '포화되지 않은 권역에 놓아 주세요.',
  place: '포화되지 않은 권역에 예비군을 놓아 주세요.',
  pick: '지지자가 있는 권역에서 버스를 출발시켜 주세요.',
  sow: '버스에 탄 지지자 색을 골라 내려 주세요.',
  over: '이미 선거일이 끝났습니다.',
}

export const def: GameDef<Table, Action, View> = {
  slug: 'election',
  minSeats: 2,
  maxSeats: 2,
  setup: ({ seats, seed }) => ({
    game: initialState(),
    blue: mulberry32(seed)() < 0.5 ? 0 : 1,
    seed,
    last: null,
    kinds: seats.map((s) => s.kind),
  }),
  parseAction,
  actors: (t) => (t.game.phase === 'over' ? [] : [seatOf(t.blue, t.game.current)]),
  apply(t, seat, action, ctx) {
    // 행동에는 좌석이 없다. 지금 둘 후보의 좌석과 다르면 거절한다(Match 도 actors 로 막는다)
    if (t.game.phase === 'over' || seatOf(t.blue, t.game.current) !== seat) throw new RuleError('지금은 내 차례가 아닙니다.')
    if (!isLegal(t.game, action)) throw new RuleError(REJECT[t.game.phase])
    // resolveAction 은 입력을 복제한 뒤 바꾸므로 거절·예외에도 t 는 그대로다
    const steps = resolveAction(t.game, action)
    const game = steps[steps.length - 1]!.state
    const name = (p: Player) => ctx.name(seatOf(t.blue, p))
    // 자리를 비운 사람 대신 봇이 둔 수
    const proxy = ctx.byBot && t.kinds[seat] === 'human' ? ' (대리)' : ''
    for (const step of steps) {
      for (const e of step.events) {
        const line = describe(e, name)
        if (line) ctx.log(line + proxy, e.type === 'gameOver' ? 'over' : e.type)
      }
    }
    if (game.phase === 'over') {
      const [b, r] = score(game)
      const w = winner(game)
      ctx.log(`개표 ${PLAYER_NAMES[0]} ${b} : ${r} ${PLAYER_NAMES[1]} · ${w === null ? '무승부' : `${PLAYER_NAMES[w]} 후보 당선`}`, 'over')
    }
    return { ...t, game, last: action }
  },
  view: (t) => ({ game: t.game, blue: t.blue, last: t.last }),
  isOver: (t) => t.game.phase === 'over',
  bot: {
    // 한 차례(투입 → 출발 → 갈림길 내리기)를 한 번에 정해 두고 하나씩 둔다. 계획이 상태와 어긋나면 다시 정한다
    next(t, _seat, memory) {
      const s = t.game
      const plan = memory.plan as { from: number; actions: Action[] } | undefined
      const planned = plan ? plan.actions[s.version - plan.from] : undefined
      if (planned && isLegal(s, planned)) return planned
      const rng = mulberry32((t.seed ^ Math.imul(s.version + 1, 0x9e3779b1)) >>> 0)
      const actions = chooseActions(s, rng)
      memory.plan = { from: s.version, actions }
      return actions[0] ?? null
    },
    fallback: (t) => legalActions(t.game)[0] ?? null,
    delayMs: 900,
  },
}
