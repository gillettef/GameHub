/**
 * 공통 방·진행 코드(@gamehub/net)에 테서랙트 엔진을 연결한다. 서버(온라인)와 브라우저(한 기기)가 함께 쓴다.
 *
 * 좌석마다 볼 수 있는 것만 보낸다(view): 난수 상태·시드, 덱 순서, 남의 개인 목표는 게임이 끝날 때까지 가린다.
 * 그래서 옛 방식(시드 + 행동 기록을 클라이언트가 재생)과 달리 앞으로의 굴림을 예측할 수 없다.
 * 게임이 끝나면 리플레이·통계를 위해 설정과 행동 기록 전체(record)를 보낸다.
 */
import { RuleError, type GameDef } from '@gamehub/net'
import { canUndo, type Seat } from './app/session'
import { chooseBotAction } from './bot/bot'
import {
  applyAction,
  createGame,
  getLegalActions,
  IllegalActionError,
  LAWS,
  PERSONAL_GOALS,
  TIME,
  TIP_DIRECTIONS,
  type Action,
  type Face,
  type GameConfig,
  type GameState,
  type LawId,
} from './engine'
import { describeAction } from './ui/describe'

export interface Options {
  law: LawId | 'random'
}

export interface Table {
  game: GameState
  /** 행동 기록 (게임이 끝나면 record 로 공개) */
  actions: Action[]
  kinds: Seat['kind'][]
  /** 마지막 행동을 되돌릴 수 있는지(한 기기 대전에서만 쓴다, canUndo) */
  undoable: boolean
}

export interface View {
  game: GameState
  /** 마지막 행동(연출·최근 줄용). 남의 개인 목표 고르기는 가린다 */
  last: Action | null
  /** 지금까지의 행동 수 */
  step: number
  undoable: boolean
  /** 게임이 끝났을 때만: 리플레이·통계용 전체 기록 */
  record: { config: GameConfig; actions: Action[] } | null
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isIndex = (v: unknown, max = 64): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < max
const isFace = (v: unknown) => v === TIME || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5)

/** 신뢰할 수 없는 입력 → 행동. 형식만 본다(합법 여부는 엔진) */
export function parseAction(raw: unknown): Action | null {
  if (!isObject(raw) || !isIndex(raw.player, 4)) return null
  const player = raw.player
  switch (raw.type) {
    case 'choosePersonalGoal':
      return typeof raw.goal === 'string' && Object.hasOwn(PERSONAL_GOALS, raw.goal)
        ? { type: 'choosePersonalGoal', player, goal: raw.goal as keyof typeof PERSONAL_GOALS }
        : null
    case 'reroll':
      return isIndex(raw.slot) && isIndex(raw.dieId, 1000) ? { type: 'reroll', player, slot: raw.slot, dieId: raw.dieId } : null
    case 'takeSlot':
      return isIndex(raw.slot) ? { type: 'takeSlot', player, slot: raw.slot } : null
    case 'rerollHand':
      return isIndex(raw.dieId, 1000) ? { type: 'rerollHand', player, dieId: raw.dieId } : null
    case 'discard':
      return isIndex(raw.dieId, 1000) ? { type: 'discard', player, dieId: raw.dieId } : null
    case 'place': {
      if (!isIndex(raw.dieId, 1000) || !isIndex(raw.row, 3) || !isIndex(raw.col, 5)) return null
      if (raw.front !== undefined && !isFace(raw.front)) return null
      const base = { type: 'place', player, dieId: raw.dieId, row: raw.row, col: raw.col } as const
      return raw.front === undefined ? base : { ...base, front: raw.front as Face }
    }
    case 'roll':
      return isIndex(raw.dieId, 1000) && TIP_DIRECTIONS.includes(raw.direction as never)
        ? { type: 'roll', player, dieId: raw.dieId, direction: raw.direction as (typeof TIP_DIRECTIONS)[number] }
        : null
    case 'scrap':
      return isIndex(raw.dieId, 1000) ? { type: 'scrap', player, dieId: raw.dieId } : null
    case 'pass':
      return { type: 'pass', player }
    default:
      return null
  }
}

/** 그 좌석에 보여도 되는 상태. 끝난 게임은 모두 공개한다 */
export function redact(game: GameState, seat: number | null): GameState {
  if (game.phase.kind === 'ended') return game
  return {
    ...game,
    config: { ...game.config, seed: 0 },
    rng: { s: 0 },
    // 덱은 미리 섞어 앞에서 뽑으므로 순서가 비밀이다. 구성은 공개 정보라 정렬해 둔다
    goalDecks: game.goalDecks.map((d) => [...d].sort()),
    eventDeck: [...game.eventDeck].sort(),
    bag: [...game.bag].sort((a, b) => a.id - b.id),
    players: game.players.map((p) => (p.id === seat ? p : { ...p, personalGoal: null, personalOffer: [] })),
  }
}

function actorsOf(game: GameState): number[] {
  if (game.phase.kind === 'setup') return game.players.filter((p) => p.personalGoal === null).map((p) => p.id)
  if (game.phase.kind === 'round') return [game.currentPlayer]
  return []
}

export const def: GameDef<Table, Action, View, Options> = {
  slug: 'tesseract',
  minSeats: 2,
  maxSeats: 4,
  parseOptions: (raw) => {
    const law = isObject(raw) ? raw.law : undefined
    return { law: typeof law === 'string' && Object.hasOwn(LAWS, law) ? (law as LawId) : 'random' }
  },
  setup({ seats, seed, options }) {
    const law = options?.law ?? 'random'
    const game = createGame({ playerCount: seats.length, seed, ...(law === 'random' ? {} : { law }) })
    return { game, actions: [], kinds: seats.map((s) => s.kind), undoable: false }
  },
  parseAction,
  actors: (t) => actorsOf(t.game),
  apply(t, seat, action, ctx) {
    if (action.player !== seat) throw new RuleError('내 자리의 행동이 아닙니다.')
    let game: GameState
    try {
      game = applyAction(t.game, action)
    } catch (e) {
      if (e instanceof IllegalActionError) throw new RuleError(e.message)
      throw e
    }
    const seats = t.kinds.map((kind, i) => ({ kind, name: ctx.name(i) }))
    ctx.log(describeAction(action, t.game, seats) + (ctx.byBot && t.kinds[seat] === 'human' ? ' (대리)' : ''))
    return { ...t, game, actions: [...t.actions, action], undoable: canUndo(t.game, game, action) }
  },
  view(t, seat) {
    const last = t.actions.at(-1) ?? null
    const ended = t.game.phase.kind === 'ended'
    return {
      game: redact(t.game, seat),
      last: last?.type === 'choosePersonalGoal' && last.player !== seat && !ended ? null : last,
      step: t.actions.length,
      undoable: t.undoable,
      record: ended ? { config: t.game.config, actions: t.actions } : null,
    }
  },
  isOver: (t) => t.game.phase.kind === 'ended',
  bot: {
    next: (t, seat) => chooseBotAction(t.game, seat),
    fallback: (t, seat) => getLegalActions(t.game).find((a) => a.player === seat) ?? null,
    delayMs: 700,
  },
}
