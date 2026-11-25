// 공통 방·진행 코드(@gamehub/net)에 HEARSAY 엔진을 연결한다. 서버(온라인)와 브라우저(한 기기)가 함께 쓴다.
// 실시간 게임이다: 단계마다 제한 시간이 있어 def.clock 이 진행 쪽(서버·한 기기 Match) 시계로 시간을 흘린다.
// 숨길 것: 망각된 진실(엔진이 지운다), 남이 고른 구역 카드·쥔 증언 토큰(공개 전), 회상 카드 순서·난수, 봇의 기억. view 는 그 좌석의 것만 보낸다.
// 기록(공통 로그)은 남기지 않는다 — 지난 일을 되짚어 볼 수단을 주지 않는다(기둥 1).
import { RuleError, type GameDef } from '@gamehub/net'
import { BOT_NAMES, PERSONA_IDS, assertion, chooseClaim, chooseQuestion, newBrain, onForget, testimony, type Brain } from './engine/bot.ts'
import {
  RuleError as EngineRuleError,
  ask,
  askableSeasons,
  claim,
  fist,
  newGame,
  say,
  start,
  tick,
  view as engineView,
  type Game,
  type GameView,
  type OnForget,
  type Token,
} from './engine/game.ts'
import { mulberry32 } from './engine/random.ts'
import { EMPTY, GREY, HOUSE_IDS, MAX_PLAYERS, MIN_PLAYERS, PLOT_IDS, SEASONS, type PlotId } from './engine/rules.ts'

export interface Options {
  /** 한 기기에서 사람 둘 이상이 돌려 하기: 할 일을 마친 사람은 차례에서 빠진다(다음 사람에게 기기를 넘기도록) */
  passPlay: boolean
}

export interface Table {
  g: Game
  /** 좌석마다의 기억(봇이 쓰고, 사람 자리는 자리를 비웠을 때 대리 진행이 쓴다) */
  brains: Brain[]
  /** 진행 쪽 시계(ms, 시작 = 0) */
  now: number
  /** 속삭임 시간에 말을 마친 질문 번호(봇이 모두 말한 뒤 주먹을 내밀도록) */
  talked: number[]
  passPlay: boolean
}

export type Action =
  | { type: 'claim'; plot: PlotId }
  | { type: 'ask'; plot: PlotId; season: number }
  | { type: 'fist'; choice: Token }
  | { type: 'say'; text: string; assert: string | null }
  /** 속삭임 시간에 할 말이 없다(봇) */
  | { type: 'quiet' }

export interface View extends GameView {
  passPlay: boolean
}

/** 봇은 속삭임이 시작되고 이만큼 지난 뒤에야 주먹을 내민다(옛 서버: 9~18초). 사람의 주장을 들을 시간 */
export const BOT_FIST_AFTER_MS = 9_000
export const TEXT_MAX = 140

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const TOKENS: readonly string[] = [...HOUSE_IDS, GREY, EMPTY]
const ANSWERS: readonly string[] = [...HOUSE_IDS, GREY]

export function parseOptions(raw: unknown): Options {
  return { passPlay: isObject(raw) && raw.passPlay === true }
}

/** 신뢰할 수 없는 입력 → 행동. 좌석은 행동에 담지 않는다(접속한 자리로만 둔다) */
export function parseAction(raw: unknown): Action | null {
  if (!isObject(raw)) return null
  switch (raw.type) {
    case 'claim':
      return PLOT_IDS.includes(raw.plot as PlotId) ? { type: 'claim', plot: raw.plot as PlotId } : null
    case 'ask':
      return PLOT_IDS.includes(raw.plot as PlotId) && Number.isInteger(raw.season) && (raw.season as number) >= 1 && (raw.season as number) <= SEASONS
        ? { type: 'ask', plot: raw.plot as PlotId, season: raw.season as number }
        : null
    case 'fist':
      return TOKENS.includes(raw.choice as string) ? { type: 'fist', choice: raw.choice as string } : null
    case 'say': {
      if (typeof raw.text !== 'string' || raw.text.length > 1000) return null
      // eslint-disable-next-line no-control-regex
      const text = raw.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, TEXT_MAX)
      if (!text) return null
      if (raw.assert !== undefined && raw.assert !== null && !ANSWERS.includes(raw.assert as string)) return null
      return { type: 'say', text, assert: typeof raw.assert === 'string' ? raw.assert : null }
    }
    case 'quiet':
      return { type: 'quiet' }
    default:
      return null
  }
}

const forgetHook =
  (t: Table): OnForget =>
  (season, column) =>
    t.brains.forEach((b, i) => onForget(t.g, b, i, season, column))

const clone = (t: Table): Table => structuredClone(t)

/** 엔진의 규칙 위반을 공통 RuleError 로 */
function rules<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof EngineRuleError) throw new RuleError(e.message)
    throw e
  }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

/** 봇이 주먹을 내밀어도 되는 때인지 */
function botsMayFist(t: Table): boolean {
  const g = t.g
  return g.phase === 'whisper' && g.deadline !== null && g.timing.whisperMs - (g.deadline - t.now) >= BOT_FIST_AFTER_MS
}

/**
 * 지금 행동할 수 있는 좌석. 공통 진행 코드는 이 목록 앞쪽부터 자동 진행을 예약하므로 순서가 뜻을 가진다:
 * 할 일이 남은 좌석(속삭임에서는 아직 말하지 않은 좌석 먼저) → 할 일을 마쳤지만 말할 수 있는 사람.
 * 온라인·혼자 하는 한 기기에서는 사람은 말할 수 있는 단계 내내 들어 있다(말은 자유). 돌려 하기에서는 할 일이 남은 좌석만.
 */
export function actors(t: Table): number[] {
  const g = t.g
  const all = range(g.n)
  const people = (keep: (i: number) => boolean) => (t.passPlay ? [] : all.filter((i) => !g.players[i]!.isBot && keep(i)))
  switch (g.phase) {
    case 'choose':
      return [g.questioner]
    case 'claim': {
      const pending = (i: number) => g.claims![i] === null
      return [...all.filter(pending), ...people((i) => !pending(i))]
    }
    case 'whisper': {
      const pending = (i: number) => g.fists![i] === null
      const quiet = (i: number) => t.talked[i] !== g.questionNo
      const ready = botsMayFist(t)
      return [
        ...all.filter((i) => pending(i) && quiet(i)),
        ...all.filter((i) => pending(i) && !quiet(i) && (ready || !g.players[i]!.isBot)),
        ...people((i) => !pending(i)),
      ]
    }
    case 'claimResult':
    case 'result':
      return people(() => true)
    default:
      return []
  }
}

export const def: GameDef<Table, Action, View, Options> = {
  slug: 'hearsay',
  // 기둥 1(망각): 지난 행동을 진행 쪽(서버·한 기기) 메모리에도 남기지 않는다
  keepHistory: false,
  minSeats: MIN_PLAYERS,
  maxSeats: MAX_PLAYERS,
  parseOptions,
  setup({ seats, seed, options }) {
    // 봇 이름·성격·기억의 난수는 게임 난수와 따로 둔다(게임 진행은 옛 엔진과 같은 시드 흐름)
    const r = mulberry32((seed ^ 0x5bd1e995) >>> 0)
    const names = BOT_NAMES.filter((n) => !seats.some((s) => s.name === n))
    let k = Math.floor(r() * PERSONA_IDS.length)
    const players = seats.map((s) => {
      if (s.kind !== 'bot') return { name: s.name, isBot: false, persona: null }
      const name = names.splice(Math.floor(r() * names.length), 1)[0] ?? s.name
      return { name, isBot: true, persona: PERSONA_IDS[k++ % PERSONA_IDS.length]! }
    })
    const g = newGame({ players, seed })
    // 사람 자리의 대리 진행은 거짓말하지 않는 기록형으로 기억한다
    const brains = players.map((p) => newBrain(p.persona ?? 'archivist', Math.floor(r() * 2 ** 31)))
    start(g, 0)
    return { g, brains, now: 0, talked: players.map(() => 0), passPlay: parseOptions(options).passPlay }
  },
  parseAction,
  actors,
  apply(t, seat, action) {
    const next = clone(t)
    const g = next.g
    rules(() => {
      switch (action.type) {
        case 'claim':
          return claim(g, seat, action.plot, next.now)
        case 'ask':
          return ask(g, seat, action.plot, action.season, next.now)
        case 'fist':
          return fist(g, seat, action.choice, next.now)
        case 'say':
          say(g, seat, action.text, next.now, action.assert ? { answer: action.assert } : null)
          if (g.phase === 'whisper') next.talked[seat] = g.questionNo
          return
        case 'quiet':
          if (g.phase !== 'whisper') throw new EngineRuleError('지금은 속삭임 시간이 아닙니다')
          next.talked[seat] = g.questionNo
          return
      }
    })
    return next
  },
  view: (t, seat) => ({ ...engineView(t.g, seat ?? -1, t.now), passPlay: t.passPlay }),
  isOver: (t) => t.g.phase === 'ended',
  clock: {
    advance(t, ms) {
      if (t.g.phase === 'ended' || ms <= 0) return t
      const now = t.now + ms
      // 제한 시간 전이면 시계만 옮긴다(남은 시간·말이 흩어지는 시간은 view 가 now 로 계산한다)
      if (t.g.deadline === null || now < t.g.deadline) return { ...t, now }
      const next = clone(t)
      next.now = now
      tick(next.g, now, forgetHook(next))
      return next
    },
    syncMs: 1000,
  },
  bot: {
    // 봇의 결정은 그 좌석 두뇌의 난수·회상 기록만 바꾼다(규칙 상태는 apply 로만 바뀐다)
    next(t, seat) {
      const g = t.g
      const b = t.brains[seat]!
      switch (g.phase) {
        case 'claim':
          return g.claims![seat] === null ? { type: 'claim', plot: chooseClaim(g, b) } : null
        case 'choose':
          return g.questioner === seat ? { type: 'ask', ...chooseQuestion(g, b, seat) } : null
        case 'whisper': {
          if (g.fists![seat] !== null) return null
          // 자리를 비운 사람의 대리는 말하지 않고 증언만 한다
          if (g.players[seat]!.isBot && t.talked[seat] !== g.questionNo) {
            const a = assertion(g, b, seat)
            return a ? { type: 'say', text: a.text, assert: a.answer } : { type: 'quiet' }
          }
          return { type: 'fist', choice: testimony(g, b, seat) }
        }
        default:
          return null
      }
    },
    fallback(t, seat) {
      const g = t.g
      if (g.phase === 'claim' && g.claims![seat] === null) return { type: 'claim', plot: g.plots[0]!.id }
      if (g.phase === 'choose' && g.questioner === seat) {
        for (const pi of g.drawn!) {
          const s = askableSeasons(g, pi)[0]
          if (s !== undefined) return { type: 'ask', plot: g.plots[pi]!.id, season: s }
        }
      }
      if (g.phase === 'whisper' && g.fists![seat] === null) return { type: 'fist', choice: EMPTY }
      return null
    },
    delayMs: 1500,
  },
}
