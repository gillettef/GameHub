// 공통 방·진행 코드(@gamehub/net)에 RETROCAUSE 엔진을 연결한다. 서버(온라인)와 브라우저(한 기기)가 함께 쓴다.
//
// 진행: 놓기·교체·패스 차례(play) → 게임이 끝나면 모두 동시에 추리(guess) → 득점(over).
// 좌석 번호(방의 1번·2번…)와 엔진의 차례 순서는 다르다. 룰북 3장 14번(시작 플레이어는 무작위)대로 시드로 섞는다
// (옛 서버가 방 자리를 섞어 0번을 시작 플레이어로 삼고, 옛 혼자 하기가 내 자리를 무작위로 정한 것과 같다).
//
// 숨은 정보: 각자의 손패와 비밀 목표 인물, 덱 순서, 아직 공개하지 않은 추리. view 는 그 좌석의 손패·목표·추리만 보낸다.
// 시드는 표(Table)에만 있고 view 로 나가지 않는다(옛 화면은 시드를 보냈는데, 시드를 알면 덱 순서와 모든 목표를 다시 만들 수 있다).
// 버린 카드(교체·연쇄 정리)는 룰북대로 앞면이 위라 기록(history)에 그대로 공개한다.
import { RuleError, type ApplyContext, type GameDef } from '@gamehub/net'
import { BOT_STYLES, chooseAction, guessMotives, type BotKey, type BotStyle } from './engine/bots.ts'
import { FIGURES, applyAction, finalScore, isCardId, legalActions, makeRng, newGame, shuffle, validGuess } from './engine/engine.ts'
import type { Action as EngineAction, Figure, Game, Guess, Score } from './engine/types.ts'
import { makeView } from './engine/view.ts'
import { describe } from './describe.ts'

export type Action = EngineAction | { type: 'guess'; guess: Guess }

export type Phase = 'play' | 'guess' | 'over'

export interface Table {
  g: Game
  /** 셔플 시드(엔진의 g.seed 와 같다). 절대 view 로 내보내지 않는다 */
  seed: number
  /** 엔진의 차례 순서 번호 → 방의 좌석 번호. 0번이 시작 플레이어 */
  order: number[]
  /** 방의 좌석 번호 → 사람/봇 */
  kinds: ('human' | 'bot')[]
  /** 방의 좌석 번호 → 봇 유형(사람 자리는 null, 대리 진행은 견제형) */
  styles: (BotKey | null)[]
  /** 엔진의 차례 순서 번호 → 낸 추리. 결과가 나오기 전에는 남의 것을 보내지 않는다 */
  guesses: (Guess | null)[]
  result: Score | null
}

export interface ResultView extends Score {
  motives: Figure[]
  guesses: Guess[]
}

/** 그 좌석에 보내는 화면 정보. 번호는 모두 엔진의 차례 순서 번호다 */
export interface SeatView {
  phase: Phase
  /** 내 차례 순서 번호. 관전이면 null */
  me: number | null
  /** 차례 순서 번호 → 방의 좌석 번호 */
  seats: number[]
  names: string[]
  current: number
  round: number
  finalRound: boolean
  timeline: (string | null)[]
  endings: Game['endings']
  hand: string[]
  handCounts: number[]
  paradox: number[]
  deckCount: number
  discardCount: number
  history: Game['history']
  motive: Figure | null
  points: Game['rules']['points']
  endTrigger: Game['stats']['endTrigger']
  /** 봇 자리의 유형 이름(옛 화면과 같다). 사람 자리는 null */
  styles: (string | null)[]
  /** 추리를 냈는지(내용은 결과 때 공개) */
  guessed: boolean[]
  myGuess: Guess | null
  result: ResultView | null
}

const BOT_KEYS: BotKey[] = ['greedy', 'rival', 'bluffer']
/** 옛 서버와 같이 봇은 적극성 0.8, 자리를 비운 사람의 대리는 견제형 */
const botStyle = (key: BotKey | null): BotStyle => ({ ...BOT_STYLES[key ?? 'rival'], activity: 0.8 })

export const phaseOf = (t: Table): Phase => (t.result ? 'over' : t.g.over ? 'guess' : 'play')

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isFigure = (v: unknown): v is Figure => typeof v === 'string' && (FIGURES as readonly string[]).includes(v)

/** 신뢰할 수 없는 입력 → 행동. 형식만 본다(합법 여부는 apply). 필요한 키만 새 객체로 옮긴다 */
export function parseAction(raw: unknown): Action | null {
  if (!isObject(raw)) return null
  switch (raw.type) {
    case 'place':
      return isCardId(raw.cardId) && Number.isInteger(raw.slot) && (raw.slot as number) >= 0 && (raw.slot as number) < 15
        ? { type: 'place', cardId: raw.cardId, slot: raw.slot as number }
        : null
    case 'exchange':
      return isCardId(raw.cardId) ? { type: 'exchange', cardId: raw.cardId } : null
    case 'pass':
      return { type: 'pass' }
    case 'guess': {
      if (!isObject(raw.guess)) return null
      const entries = Object.entries(raw.guess)
      if (entries.length > 5) return null
      const guess: Guess = {}
      for (const [q, f] of entries) {
        if (!/^[0-4]$/.test(q) || !isFigure(f)) return null
        guess[q] = f
      }
      return { type: 'guess', guess }
    }
    default:
      return null
  }
}

/** 엔진의 거절 이유 → 사용자에게 보일 말 */
function ruleMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (m === '손에 없는 카드') return '손에 없는 카드입니다.'
  if (m === '금지 배치: occupied') return '빈 칸이 아닙니다.'
  if (m === '금지 배치: condition') return '그 칸에서는 카드의 조건이 거짓입니다.'
  if (m === '금지 배치: ending') return '결말과 어긋나는 칸입니다.'
  if (m === '덱이 비어 교체할 수 없다') return '덱이 비어 교체할 수 없습니다.'
  if (m === '지금은 패스할 수 없다') return '빈 칸이 있고 덱이 남아 있으면 패스할 수 없습니다.'
  return m
}

/** 모두 추리했으면 득점한다 */
function finish(t: Table, ctx: Pick<ApplyContext, 'log'>): Table {
  if (!t.guesses.every(Boolean)) return t
  const result = finalScore(t.g, t.guesses)
  ctx.log(`득점 · 승리 ${result.winners.map((w) => t.g.names[w]).join(', ')}`, 'sys')
  return { ...t, result }
}

/** 게임이 끝나면 추리 단계: 봇 자리는 바로 추리한다(옛 서버와 같다) */
function startGuess(t: Table, ctx: Pick<ApplyContext, 'log'>): Table {
  ctx.log('게임 끝 · 추리 단계', 'sys')
  const guesses = t.guesses.map((g, p) => g ?? (t.kinds[t.order[p]!] === 'bot' ? guessMotives(t.g, p) : null))
  return finish({ ...t, guesses }, ctx)
}

/** 추리 검사(옛 서버와 같다): 나를 뺀 모든 플레이어에게 인물 하나씩, 같은 인물은 한 번만 */
function cleanGuess(g: Game, p: number, raw: Guess): Guess {
  const clean: Guess = {}
  for (let q = 0; q < g.names.length; q++) {
    if (q === p) continue
    const f = raw[q]
    if (!isFigure(f)) throw new RuleError('모든 플레이어의 인물을 골라 주세요.')
    clean[q] = f
  }
  if (!validGuess(g, p, clean)) throw new RuleError('같은 인물을 두 번 적을 수 없습니다.')
  return clean
}

export const def: GameDef<Table, Action, SeatView> = {
  slug: 'retrocause',
  minSeats: 3,
  maxSeats: 5,
  setup({ seats, seed }) {
    const n = seats.length
    if (n < 3 || n > 5) throw new RuleError('3~5인만 지원합니다.')
    const rng = makeRng((seed ^ 0x5bd1e995) >>> 0)
    const order = shuffle(
      seats.map((_, i) => i),
      rng,
    )
    const styles = seats.map((s) => (s.kind === 'bot' ? BOT_KEYS[Math.floor(rng() * BOT_KEYS.length)]! : null))
    const g = newGame({ names: order.map((i) => seats[i]!.name), seed })
    return { g, seed, order, kinds: seats.map((s) => s.kind), styles, guesses: order.map(() => null), result: null }
  },
  parseAction,
  actors(t) {
    const phase = phaseOf(t)
    if (phase === 'play') return [t.order[t.g.current]!]
    if (phase === 'guess') return t.guesses.flatMap((g, p) => (g ? [] : [t.order[p]!]))
    return []
  },
  apply(t, seat, action, ctx) {
    const p = t.order.indexOf(seat)
    if (p < 0) throw new RuleError('이 게임의 플레이어가 아닙니다.')
    const proxy = ctx.byBot && t.kinds[seat] === 'human' ? ' (대리)' : ''
    const name = t.g.names[p]!
    const phase = phaseOf(t)
    if (phase === 'over') throw new RuleError('이미 끝난 게임입니다.')
    if (phase === 'play') {
      if (action.type === 'guess') throw new RuleError('추리는 게임이 끝난 뒤에 합니다.')
      if (t.g.current !== p) throw new RuleError('지금은 내 차례가 아닙니다.')
      let g: Game
      try {
        g = applyAction(t.g, action)
      } catch (e) {
        throw new RuleError(ruleMessage(e))
      }
      const line = describe(g.history.at(-1)!, name)
      ctx.log(line.text + proxy, line.warn ? 'warn' : g.history.at(-1)!.type)
      if (g.finalRound && !t.g.finalRound) ctx.log(`종료 라운드 시작 (${g.stats.endTrigger === 'timeline' ? '시간선이 가득 참' : '덱이 비었음'})`, 'sys')
      const next: Table = { ...t, g }
      return g.over ? startGuess(next, ctx) : next
    }
    if (action.type !== 'guess') throw new RuleError('게임이 끝났습니다. 다른 플레이어의 비밀 목표를 추리하세요.')
    if (t.guesses[p]) throw new RuleError('이미 추리를 냈습니다.')
    const guesses = [...t.guesses]
    guesses[p] = cleanGuess(t.g, p, action.guess)
    ctx.log(`${name} 추리 제출${proxy}`, 'guess')
    return finish({ ...t, guesses }, ctx)
  },
  view(t, seat) {
    const p = seat === null ? -1 : t.order.indexOf(seat)
    const { seed: _seed, seat: _seat, over: _over, ...v } = makeView(t.g, p)
    void _seed
    void _seat
    void _over
    return {
      ...v,
      phase: phaseOf(t),
      me: p >= 0 ? p : null,
      seats: t.order,
      styles: t.order.map((s) => (t.kinds[s] === 'bot' ? BOT_STYLES[t.styles[s] ?? 'rival'].label : null)),
      guessed: t.guesses.map(Boolean),
      myGuess: p >= 0 ? (t.guesses[p] ?? null) : null,
      result: t.result ? { ...t.result, motives: t.g.motives, guesses: t.guesses.map((g) => g ?? {}) } : null,
    }
  },
  isOver: (t) => t.result !== null,
  bot: {
    next(t, seat) {
      const p = t.order.indexOf(seat)
      const phase = phaseOf(t)
      if (phase === 'guess') return { type: 'guess', guess: guessMotives(t.g, p) }
      if (phase !== 'play' || t.g.current !== p) return null
      // 옛 서버와 같은 흔들림 난수: 같은 판·같은 차례면 같은 수(재생해도 같다)
      const rng = makeRng((t.seed + t.g.history.length * 977) >>> 0)
      return chooseAction(t.g, botStyle(t.styles[seat] ?? null), rng)
    },
    // 봇이 고른 행동이 거절되면(그럴 일은 없어야 한다) 첫 합법 행동(놓기 → 교체 → 패스 순)
    fallback(t, seat) {
      const p = t.order.indexOf(seat)
      if (phaseOf(t) === 'guess') return { type: 'guess', guess: guessMotives(t.g, p) }
      return legalActions(t.g)[0] ?? null
    },
    delayMs: 900,
  },
}
