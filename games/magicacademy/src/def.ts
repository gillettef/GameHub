/**
 * 공통 방·진행 코드(@gamehub/net)에 마법학교 엔진을 연결한다. 서버(온라인)와 브라우저(한 기기)가 함께 쓴다.
 *
 * - 엔진(src/engine)은 옛 서버의 규칙 코드 그대로다: 판을 그 자리에서 바꾸는 함수들. 여기서는 판을 복제한 뒤 바꾸고,
 *   규칙에 맞지 않으면(엔진이 Error) 원래 판은 그대로 두고 RuleError 를 던진다. 난수는 판에 든 시드 상태(rng)를 쓴다.
 * - 좌석 i 의 플레이어 id 는 `p{i}`. 행동에는 좌석이 없고 보낸 연결의 좌석으로 적용하므로 남의 자리를 사칭할 수 없다.
 * - view: 옛 서버가 좌석마다 보내던 상태와 같다(덱·버림 더미·주사위 처리 정보·시험 계획 등 hidden 은 빼고,
 *   남의 엿본 탐험 카드와 장래희망은 가리고, 끝나면 장래희망은 공개). 관전은 모든 사람의 것을 가린다.
 * - 진행 단계에서 다음 활동으로 넘기는 것은 옛 서버처럼 3초 뒤 자동(GameDef.clock). 그동안 둘 사람이 없다.
 * - 봇: 옛 서버의 봇 한 차례(takeBotTurn)를 복제한 판에서 돌려 한 행동들을 기록하고, 하나씩 둔다(다시 굴리기·노트·확인이 한 수씩 보인다).
 */
import { RuleError, type ApplyContext, type GameDef } from '@gamehub/net'
import { actorOf, advance, applyAction, waitingToAdvance, type Action } from './engine/action'
import { runBotFallback, takeBotTurn } from './engine/autoplay'
import { BOT_PERSONALITIES, botChooseDream, pickBotPersonality } from './engine/bot'
import { classCardsLeft, createGame } from './engine/engine'
import { PUBLIC_RULES } from './engine/publicRules'
import { recording } from './engine/record'
import { createRng, withBotRng, withRng, type RngState } from './engine/rng'
import type { ActivityId, GameState, KeptToken, PublicGameState, StatKey } from './engine/types'

export type { Action } from './engine/action'

export interface Table {
  game: GameState
  /** 게임 난수 상태(주사위·덱·카드 id) */
  rng: RngState
  /** 좌석마다 봇 성향(BOT_PERSONALITIES 의 번호). 사람 자리도 정해 둔다: 나가거나 오래 끊기면 봇이 이 성향으로 대신 둔다 */
  bots: number[]
  /** 진행 단계에서 다음 활동을 기다린 시간(ms, 시계가 센다) */
  waited: number
}

export interface View {
  /** 옛 서버가 이 좌석에 보내던 상태 */
  game: PublicGameState
  /** 내 플레이어 id. 관전이면 null */
  me: string | null
}

/** 진행 단계에서 활동 하나가 끝나고 다음 활동을 시작하기까지(옛 서버 RESOLVE_STEP_MS) */
export const RESOLVE_STEP_MS = 3000

export const playerId = (seat: number): string => `p${seat}`
export const seatOf = (id: string): number => Number(id.slice(1))

const ACTIVITIES: readonly ActivityId[] = ['tournament', 'creature', 'duel', 'exploration', 'lab']
const STATS: readonly StatKey[] = ['intelligence', 'stamina', 'charm', 'spellPower']
const TOKENS: readonly KeptToken[] = ['intelligence', 'stamina', 'charm', 'mana']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max
const isCardId = (v: unknown): v is string => typeof v === 'string' && /^c\d{1,5}$/.test(v)
const isPlayerId = (v: unknown): v is string => typeof v === 'string' && /^p[0-4]$/.test(v)
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v)
/** 정해진 키 말고는 없어야 한다 */
const onlyKeys = (raw: Record<string, unknown>, keys: string[]) => Object.keys(raw).every((k) => k === 'type' || keys.includes(k))

/** 신뢰할 수 없는 입력 → 행동. 형식만 본다(합법 여부는 엔진) */
export function parseAction(raw: unknown): Action | null {
  if (!isObject(raw)) return null
  switch (raw.type) {
    case 'class': {
      if (!onlyKeys(raw, ['cardId', 'mode'])) return null
      const mode = raw.mode ?? 'learn'
      if (!(raw.cardId === null || isCardId(raw.cardId)) || (mode !== 'learn' && mode !== 'note')) return null
      return { type: 'class', cardId: raw.cardId, mode }
    }
    case 'cram':
      return onlyKeys(raw, ['from']) && (raw.from === null || oneOf(TOKENS, raw.from)) ? { type: 'cram', from: raw.from } : null
    case 'select': {
      if (!onlyKeys(raw, ['activityId', 'target', 'cardId']) || !oneOf(ACTIVITIES, raw.activityId)) return null
      if (raw.target !== undefined && !isPlayerId(raw.target)) return null
      if (raw.cardId !== undefined && !isCardId(raw.cardId)) return null
      return {
        type: 'select',
        activityId: raw.activityId,
        ...(raw.target !== undefined ? { target: raw.target } : {}),
        ...(raw.cardId !== undefined ? { cardId: raw.cardId } : {}),
      }
    }
    case 'pick':
      return onlyKeys(raw, ['cardId']) && (raw.cardId === null || isCardId(raw.cardId)) ? { type: 'pick', cardId: raw.cardId } : null
    case 'roll': {
      if (!onlyKeys(raw, ['count', 'assist'])) return null
      if (raw.count !== undefined && !isInt(raw.count, 0, 30)) return null
      if (raw.assist !== undefined && !isInt(raw.assist, 0, 30)) return null
      return { type: 'roll', ...(raw.count !== undefined ? { count: raw.count } : {}), ...(raw.assist !== undefined ? { assist: raw.assist } : {}) }
    }
    case 'reroll': {
      const dice = raw.dice
      if (!onlyKeys(raw, ['dice']) || !Array.isArray(dice) || dice.length < 1 || dice.length > 30 || !dice.every((i) => isInt(i, 0, 29))) return null
      return { type: 'reroll', dice: [...(dice as number[])] }
    }
    case 'adjust':
      return onlyKeys(raw, ['delta']) && (raw.delta === 1 || raw.delta === -1) ? { type: 'adjust', delta: raw.delta } : null
    case 'note':
      return onlyKeys(raw, ['stat']) && oneOf(STATS, raw.stat) ? { type: 'note', stat: raw.stat } : null
    case 'confirm':
      return onlyKeys(raw, []) ? { type: 'confirm' } : null
    default:
      // 장래희망 바꾸기(dream)는 지금 규칙(받은 카드 1장, 바꾸는 기간 0개월)에서 쓸 수 없고 차례와 상관없는 행동이라 받지 않는다
      return null
  }
}

/** 엔진 함수를 부르는 동안 새로 생긴 기록을 방 기록으로 옮긴다 */
function logSince(before: number, game: GameState, log: (text: string) => void): void {
  for (const entry of game.log.slice(before)) log(entry.message)
}

/** 진행 단계에서 기다리는 활동을 모두 시작한다(이어 하기 재생은 시계 없이 행동만 다시 두므로, 행동 앞에서 밀린 진행을 먼저 한다) */
function flush(game: GameState): void {
  for (let guard = 0; waitingToAdvance(game) && guard < 20; guard++) advance(game)
}

export function apply(t: Table, seat: number, action: Action, ctx: Pick<ApplyContext, 'log'>): Table {
  const next = structuredClone(t)
  const before = next.game.log.length
  withRng(next.rng, () => {
    flush(next.game)
    if (actorOf(next.game) !== playerId(seat)) throw new RuleError('지금은 내 차례가 아니에요.')
    try {
      applyAction(next.game, playerId(seat), action)
    } catch (e) {
      if (e instanceof Error) throw new RuleError(e.message)
      throw e
    }
  })
  next.waited = 0
  logSince(before, next.game, ctx.log)
  return next
}

/** 덱·버림 더미와 주사위 처리·시험 계획(hidden)은 보내지 않는다 */
type ServerOnly = 'hidden' | 'labPile' | 'explorationPile' | 'classDeck' | 'classDiscard' | 'creatureDeck' | 'creatureDiscard'
const SERVER_ONLY = new Set<string>(['hidden', 'labPile', 'explorationPile', 'classDeck', 'classDiscard', 'creatureDeck', 'creatureDiscard'] satisfies ServerOnly[])

/** 그 좌석에 보여도 되는 상태: 옛 server/src/app.ts broadcastGameState 와 같다. 관전(seat null)은 모두의 비밀을 가린다 */
export function redact(game: GameState, seat: number | null): PublicGameState {
  const me = seat === null ? null : playerId(seat)
  const ended = game.phase === 'ended'
  const players = Object.fromEntries(
    Object.entries(game.players).map(([id, p]) => [id, id === me ? p : { ...p, peekedExploration: null, ...(ended ? {} : { dream: null, dreamOptions: undefined }) }]),
  )
  const pub = Object.fromEntries(Object.entries(game).filter(([key]) => !SERVER_ONLY.has(key))) as Omit<GameState, ServerOnly>
  return { ...pub, players, classLeft: classCardsLeft(game), rules: PUBLIC_RULES }
}

interface PlanStep {
  action: Action
  /** 이 행동을 둔 뒤의 판(JSON). 실제 판이 이와 같아야 계획의 다음 행동을 이어서 둔다 */
  after: string
}
interface Plan {
  expect: string
  steps: PlanStep[]
}

/** 복제한 판에서 봇 한 차례를 돌려 그 좌석이 한 행동들을 얻는다 */
function simulate(t: Table, seat: number, memory: Record<string, unknown>, run: (game: GameState, id: string) => void): PlanStep[] {
  const id = playerId(seat)
  const clone = structuredClone(t)
  const botRng = (memory.rng ??= createRng(t.rng.s ^ (0x9e3779b9 * (seat + 1)))) as RngState
  const steps: PlanStep[] = []
  withRng(clone.rng, () =>
    withBotRng(botRng, () =>
      recording(
        (who, action, state) => {
          if (who === id) steps.push({ action, after: JSON.stringify(state) })
        },
        () => {
          flush(clone.game)
          run(clone.game, id)
        },
      ),
    ),
  )
  return steps
}

function botNext(t: Table, seat: number, memory: Record<string, unknown>): Action | null {
  // 지난번에 세운 계획(다시 굴리기 → 노트 → 확인 등)의 다음 수: 판이 계획대로 바뀌었을 때만
  const plan = memory.plan as Plan | undefined
  if (plan && plan.steps.length > 0 && plan.expect === JSON.stringify(t.game)) {
    const [step, ...rest] = plan.steps as [PlanStep, ...PlanStep[]]
    memory.plan = { expect: step.after, steps: rest } satisfies Plan
    return step.action
  }
  memory.plan = undefined
  const strategy = BOT_PERSONALITIES[t.bots[seat] ?? 0] ?? BOT_PERSONALITIES[0]!
  const steps = simulate(t, seat, memory, (game, id) => {
    try {
      takeBotTurn(game, id, strategy)
    } catch (e) {
      // 옛 서버처럼 판단이 예외를 내면 (이미 한 행동은 둔 채로) 가장 단순한 행동으로 대신한다
      console.error('[magicacademy] 봇 판단 오류', e)
      runBotFallback(game, id)
    }
  })
  const [first, ...rest] = steps
  if (!first) return null
  memory.plan = { expect: first.after, steps: rest } satisfies Plan
  return first.action
}

export const def: GameDef<Table, Action, View> = {
  slug: 'magicacademy',
  minSeats: 2,
  maxSeats: 5,
  setup({ seats, seed }) {
    // 성향은 따로 된 난수로 고른다(게임 난수를 쓰지 않아 같은 시드면 같은 판이 된다)
    const bots = withBotRng(createRng(seed * 7 + 3), () => seats.map(() => BOT_PERSONALITIES.indexOf(pickBotPersonality())))
    const rng = createRng(seed)
    const game = withRng(rng, () => createGame(seats.map((s, i) => ({ id: playerId(i), name: s.name, isBot: s.kind === 'bot' }))))
    // 봇은 받은 장래희망 카드 중 성향에 맞는 꿈을 고른다(지금 규칙은 1장이라 고를 것이 없다)
    withRng(rng, () =>
      seats.forEach((s, i) => {
        if (s.kind === 'bot' && (game.players[playerId(i)]?.dreamOptions?.length ?? 0) > 1) botChooseDream(game, playerId(i), BOT_PERSONALITIES[bots[i]!]!)
      }),
    )
    return { game, rng, bots, waited: 0 }
  },
  parseAction,
  actors(t) {
    const id = actorOf(t.game)
    return id === null ? [] : [seatOf(id)]
  },
  apply,
  view: (t, seat) => ({ game: redact(t.game, seat), me: seat === null ? null : playerId(seat) }),
  isOver: (t) => t.game.phase === 'ended',
  clock: {
    advance(t, ms, ctx) {
      if (!waitingToAdvance(t.game)) return t
      // 기다린 시간은 화면에 보이지 않는다: 다음 활동을 시작할 때만 새 판을 돌려준다(그 전에는 상태를 다시 보내지 않게 같은 판에 센다)
      t.waited += ms
      if (t.waited < RESOLVE_STEP_MS) return t
      const next = structuredClone(t)
      const before = next.game.log.length
      withRng(next.rng, () => advance(next.game))
      next.waited = 0
      logSince(before, next.game, ctx.log)
      return next
    },
    syncMs: 500,
  },
  bot: {
    next: botNext,
    fallback(t, seat) {
      const [first] = simulate(t, seat, {}, (game, id) => runBotFallback(game, id))
      return first?.action ?? null
    },
    delayMs: 1200,
  },
}
