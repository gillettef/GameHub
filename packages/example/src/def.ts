import { RuleError, type GameDef } from '@gamehub/net'
import { MAX_TAKE, createGame, legalTakes, take, type State } from './engine/stones'

export interface Action {
  take: number
}

export const def: GameDef<State, Action, State> = {
  slug: 'example',
  minSeats: 2,
  maxSeats: 4,
  setup: ({ seats }) => createGame(seats.length),
  parseAction: (raw) => {
    const n = (raw as { take?: unknown } | null)?.take
    return Number.isInteger(n) ? { take: n as number } : null
  },
  actors: (s) => (s.winner === null ? [s.turn] : []),
  apply(s, seat, action, ctx) {
    if (!legalTakes(s).includes(action.take)) throw new RuleError(`${action.take}개는 가져갈 수 없습니다.`)
    const next = take(s, action.take)
    ctx.log(`${ctx.name(seat)}: ${action.take}개 (남은 돌 ${next.stones})`)
    return next
  },
  view: (s) => s,
  isOver: (s) => s.winner !== null,
  bot: {
    next: (s) => ({ take: s.stones % (MAX_TAKE + 1) || 1 }),
    delayMs: 600,
  },
}
