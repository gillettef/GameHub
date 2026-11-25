// 공통 방·진행 코드(@gamehub/net)에 SIGHTLINE 엔진을 연결한다. 서버(온라인)와 브라우저(한 기기)가 함께 쓴다.
//
// 좌석 번호(방의 1번·2번…)와 정원의 좌석(북·동·남·서)은 다르다. 1번 자리가 남쪽이고, 시계 방향으로 이어 앉는다
// (옛 서버가 방장·봇 대전의 사람을 남쪽에 앉힌 것과 같다). 차례 순서는 엔진이 시드로 정한 첫 플레이어부터 시계 방향이다.
//
// 숨은 정보: 손님 말의 문양(소속)과 각자의 명단·기억. view 는 엔진의 viewFor 를 그대로 쓴다(옛 서버가 좌석마다 보낸 것과 같다).
// 셔플·중립을 정한 시드는 표(Table)에만 있고 view 로 나가지 않는다(시드를 알면 모든 명단을 알 수 있다).
import { RuleError, type GameDef } from '@gamehub/net'
import { isSeat, type Seat } from './engine/board.ts'
import { chooseAction } from './engine/bot.ts'
import { act, createGame, legalMoves, makeRng, playerIndexOfSeat, viewFor, type Action, type State, type View } from './engine/rules.ts'

export type { Action }

/** 방의 좌석 번호 → 정원의 좌석. 1번이 남쪽, 시계 방향 */
export const SEAT_ORDER: Record<3 | 4, Seat[]> = { 4: ['S', 'W', 'N', 'E'], 3: ['S', 'N', 'E'] }

export interface Table {
  game: State
  /** 셔플 시드. 봇의 흔들림에도 쓴다. 절대 view 로 내보내지 않는다 */
  seed: number
  /** 방의 좌석 번호 → 정원의 좌석 */
  seats: Seat[]
  kinds: ('human' | 'bot')[]
}

/** 그 좌석에 보내는 화면 정보. 기록은 방의 log 로 따로 간다 */
export type SeatView = Omit<View, 'log'> & {
  /** 방의 좌석 번호 → 정원의 좌석 */
  seats: Seat[]
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isPieceId = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 16

/** 신뢰할 수 없는 입력 → 행동. 형식만 본다(합법 여부는 엔진). 필요한 키만 새 객체로 옮긴다 */
export function parseAction(raw: unknown): Action | null {
  if (!isObject(raw)) return null
  switch (raw.type) {
    case 'move':
      return isPieceId(raw.pieceId) && isSeat(raw.dir) && (raw.steps === 1 || raw.steps === 2) ? { type: 'move', pieceId: raw.pieceId, dir: raw.dir, steps: raw.steps } : null
    case 'accuse':
    case 'contact':
      return isPieceId(raw.pieceId) ? { type: raw.type, pieceId: raw.pieceId } : null
    case 'scout':
      return isSeat(raw.seat) ? { type: 'scout', seat: raw.seat } : null
    case 'scoutAccuse':
      if (raw.pieceId === null) return { type: 'scoutAccuse', pieceId: null }
      return isPieceId(raw.pieceId) ? { type: 'scoutAccuse', pieceId: raw.pieceId } : null
    case 'pass':
      return { type: 'pass' }
    default:
      return null
  }
}

/** 방의 좌석 번호 → 엔진의 차례 순서 번호 */
export const playerOf = (t: Table, seat: number): number => playerIndexOfSeat(t.game, t.seats[seat]!)

/** 지금 차례인 방의 좌석 번호 */
function actorSeat(t: Table): number {
  return t.seats.indexOf(t.game.players[t.game.turn]!.seat)
}

/** 봇의 흔들림 난수: 같은 판·같은 차례면 같은 수(재생해도 같다) */
const botRng = (t: Table, player: number) => makeRng((t.seed ^ Math.imul(t.game.seq + 1, 0x9e3779b1) ^ Math.imul(player + 1, 0x85ebca6b)) >>> 0)

export const def: GameDef<Table, Action, SeatView> = {
  slug: 'sightline',
  minSeats: 3,
  maxSeats: 4,
  setup({ seats, seed }) {
    const order = SEAT_ORDER[seats.length as 3 | 4]
    if (!order) throw new RuleError('3~4인만 지원합니다.')
    return { game: createGame({ seats: order, seed }), seed, seats: order, kinds: seats.map((s) => s.kind) }
  },
  parseAction,
  actors: (t) => (t.game.phase === 'over' ? [] : [actorSeat(t)]),
  apply(t, seat, action, ctx) {
    const game = structuredClone(t.game)
    const lines: { round: number; seat: Seat | null; text: string }[] = []
    const err = act(game, playerOf(t, seat), action, (line) => lines.push(line))
    if (err) throw new RuleError(err)
    const proxy = ctx.byBot && t.kinds[seat] === 'human' ? ' (대리)' : ''
    for (const line of lines) ctx.log(`R${line.round} · ${line.text}${line.seat ? proxy : ''}`, line.seat ?? 'sys')
    return { ...t, game }
  },
  view(t, seat) {
    const player = seat === null ? null : playerOf(t, seat)
    const { log: _log, ...v } = viewFor(t.game, player !== null && player >= 0 ? player : null)
    void _log
    return { ...v, seats: t.seats }
  },
  isOver: (t) => t.game.phase === 'over',
  bot: {
    next(t, seat) {
      const player = playerOf(t, seat)
      return chooseAction(viewFor(t.game, player), botRng(t, player))
    },
    // 봇이 고른 행동이 거절되면(그럴 일은 없어야 한다) 정찰은 지목 없이 마치고, 아니면 첫 합법 이동, 없으면 넘긴다
    fallback(t, seat) {
      const player = playerOf(t, seat)
      if (t.game.phase === 'scout') return { type: 'scoutAccuse', pieceId: null }
      const m = legalMoves(t.game.pieces, t.game.players[player]!.seat, t.game.emptySeats)[0]
      return m ? { type: 'move', pieceId: m.pieceId, dir: m.dir, steps: m.steps } : { type: 'pass' }
    },
    delayMs: 900,
  },
}
