/** GameDef 연결: 행동 모양 검사, 좌석별 가림, 거절, 차례 제한 시간·AI 대리, 봇으로 끝까지 */
import { RuleError, type SeatInfo } from '@gamehub/net'
import { describe, expect, it } from 'vitest'
import { AUTOPILOT_LOG_MARK, TIMEOUT_LOG_MARK, autoAction } from '../src/engine'
import { actorsOf, def, fromEngine, makeDef, parseAction, parseOptions, playerId, type Action, type Options, type Table } from '../src/def'

const ctx = (byBot = false) => ({ name: (i: number) => `${i}`, log: () => {}, byBot })
const humans = (n: number): SeatInfo[] => Array.from({ length: n }, (_, i) => ({ kind: 'human', name: `P${i}` }))
const setup = (seats: SeatInfo[], options: Partial<Options> = {}, seed = 7) =>
  def.setup({ seats, seed, options: { turnTime: null, tutorial: false, ...options } })

/** 공개 단계를 모두 확인한 판 */
function playing(seats: SeatInfo[], options: Partial<Options> = {}): Table {
  let t = setup(seats, options)
  for (const s of actorsOf(t)) t = def.apply(t, s, { type: 'CONFIRM' }, ctx())
  expect(t.game.phase).toBe('playing')
  return t
}

/** 엔진 자동 수를 그 좌석이 직접 둔 것처럼 둔다 */
function direct(t: Table, seat: number): Table {
  const a = fromEngine(autoAction(t.game, playerId(seat))!, t.game.turn)!
  return def.apply(t, seat, a, ctx())
}

/** 봇 수(def.bot.next) 하나를 그 좌석으로 둔다 */
function botMove(t: Table, seat: number): Table {
  const a = def.bot!.next(t, seat, {})
  expect(a).not.toBeNull()
  return def.apply(t, seat, a!, ctx(true))
}

describe('행동 모양 검사', () => {
  it('알려진 행동만, 필요한 키만 받는다', () => {
    expect(parseAction({ type: 'CONFIRM', playerId: 'p3' })).toEqual({ type: 'CONFIRM' })
    expect(parseAction({ type: 'TAKE', turn: 3, take: 1, extra: 1 })).toEqual({ type: 'TAKE', turn: 3, take: 1 })
    expect(parseAction({ type: 'TAKE', turn: 3, take: 'pile' })).toEqual({ type: 'TAKE', turn: 3, take: 'pile' })
    // v8: 명당 부르기는 가져오기를 함께 하지 않는다(take 는 버린다)
    expect(parseAction({ type: 'CALL', turn: 5, pos: { q: 1, r: 1 }, rotation: 2, take: 1 })).toEqual({ type: 'CALL', turn: 5, pos: { q: 1, r: 1 }, rotation: 2 })
    expect(parseAction({ type: 'CALL', turn: 5, pos: { q: 1, r: 1 } })).toEqual({ type: 'CALL', turn: 5, pos: { q: 1, r: 1 } })
    expect(parseAction({ type: 'PLANT', turn: 1, species: 'oak', pos: { q: 1, r: -2, x: 9 }, rotation: 3, seed: { q: 0, r: 0 } })).toEqual({
      type: 'PLANT',
      turn: 1,
      species: 'oak',
      pos: { q: 1, r: -2 },
      rotation: 3,
      seed: { q: 0, r: 0 },
    })
    for (const bad of [
      null,
      'TAKE',
      [],
      { type: 'READY' },
      { type: 'TAKE', take: 0 },
      { type: 'TAKE', turn: 1, take: -1 },
      { type: 'TAKE', turn: 1, take: 1.5 },
      { type: 'TAKE', turn: '1', take: 0 },
      { type: 'PLANT', turn: 1, species: 'rose', pos: { q: 0, r: 0 } },
      { type: 'PLANT', turn: 1, species: 'oak', pos: { q: 0.5, r: 0 } },
      { type: 'PLANT', turn: 1, species: 'oak', pos: { q: 999, r: 0 } },
      { type: 'PLANT', turn: 1, species: 'oak', pos: { q: 0, r: 0 }, rotation: 6 },
      { type: 'PLANT', turn: 1, species: 'oak', pos: { q: 0, r: 0 }, seed: 'x' },
      { type: 'DISCARD', turn: 1, species: '__proto__' },
      // v7 일과·생선 냄새·담 넘기는 없다
      { type: 'PICK_CHORE', turn: 1, chore: 'roam' },
      { type: 'TAKE', turn: 1, take: 'peek' },
      { type: 'MOVE', turn: 1, moves: [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, count: 1 }] },
      { type: 'CALL', turn: 1, pos: { q: 0, r: 0 }, rotation: 7 },
      { type: 'CALL', turn: 1 },
    ]) {
      expect(parseAction(bad)).toBeNull()
    }
  })

  it('옵션: 고를 수 있는 제한 시간만, 아니면 기본값', () => {
    expect(parseOptions({ turnTime: 60 })).toEqual({ turnTime: 60, tutorial: false })
    expect(parseOptions({ turnTime: null })).toEqual({ turnTime: null, tutorial: false })
    expect(parseOptions({ turnTime: 5 }).turnTime).toBe(90)
    expect(parseOptions(undefined)).toEqual({ turnTime: 90, tutorial: false })
  })
})

describe('시작과 좌석', () => {
  it('좌석 번호 = 엔진 자리, 봇 자리는 AI(바로 확인), 사람은 공개 단계에서 확인한다', () => {
    const t = setup([{ kind: 'human', name: '가' }, { kind: 'bot', name: 'AI 1' }, { kind: 'human', name: '나' }])
    expect(t.game.phase).toBe('reveal')
    expect(t.game.players.map((p) => [p.id, p.seat, p.kind, p.nickname])).toEqual([
      ['p0', 0, 'human', '가'],
      ['p1', 1, 'ai', 'AI 1'],
      ['p2', 2, 'human', '나'],
    ])
    expect(actorsOf(t)).toEqual([0, 2])
  })

  it('온라인 서버는 카드 더미를 보드 시드와 따로 섞는다(같은 시드여도 손이 다르다)', () => {
    const a = makeDef({ deckKey: () => [1, 2, 3, 4] }).setup({ seats: humans(2), seed: 7, options: parseOptions({}) })
    const b = makeDef({ deckKey: () => [5, 6, 7, 8] }).setup({ seats: humans(2), seed: 7, options: parseOptions({}) })
    expect(a.game.board).toEqual(b.game.board)
    expect(a.game.goals).toEqual(b.game.goals)
    expect([...a.game.pile, ...a.game.market]).not.toEqual([...b.game.pile, ...b.game.market])
  })
})

describe('좌석이 봐도 되는 것', () => {
  it('내 손만 보이고, 남의 손·카드 더미 순서·시드는 가린다. 관전자는 아무 손도 못 본다', () => {
    const t = playing(humans(3))
    const v = def.view(t, 1)
    expect(v.me).toBe('p1')
    expect(v.game.players[1]!.hand).toEqual(t.game.players[1]!.hand)
    expect(v.game.players[0]!.hand).toEqual([])
    expect(v.game.players[0]!.handCount).toBe(t.game.players[0]!.hand.length)
    expect(v.game.pile).toEqual([])
    expect(v.game.pileCount).toBe(t.game.pile.length)
    expect(v.game.rngSeed).toBe(0)
    expect(v.game.deckSeed).toEqual([])
    expect(v.game.market).toEqual(t.game.market)
    const w = def.view(t, null)
    expect(w.me).toBeNull()
    expect(w.game.players.every((p) => p.hand.length === 0)).toBe(true)
    // 상태는 JSON 으로 보낼 수 있어야 한다
    expect(JSON.parse(JSON.stringify(v))).toEqual(v)
  })

  it('카드 더미에서 가져온 카드는 기록에도 이름이 남지 않는다', () => {
    const t = playing(humans(2))
    const next = def.apply(t, 0, { type: 'TAKE', turn: t.game.turn, take: 'pile' }, ctx())
    const seen = def.view(next, 1)
    const card = next.game.players[0]!.hand.at(-1)!
    expect(seen.game.players[0]!.hand).toEqual([])
    expect(seen.game.log.at(-1)!.message).not.toContain(card)
  })
})

describe('거절', () => {
  it('규칙 위반은 RuleError, 상태는 그대로', () => {
    const t = playing(humans(2))
    const before = JSON.stringify(t)
    expect(() => def.apply(t, 0, { type: 'TAKE', turn: t.game.turn, take: 5 }, ctx())).toThrow(RuleError)
    expect(() => def.apply(t, 1, { type: 'TAKE', turn: t.game.turn, take: 0 }, ctx())).toThrow('내 차례가 아닙니다')
    expect(() => def.apply(t, 0, { type: 'TAKE', turn: t.game.turn - 1, take: 0 }, ctx())).toThrow('차례가 이미 넘어갔습니다')
    expect(() => def.apply(t, 0, { type: 'RESUME' }, ctx())).toThrow(RuleError)
    expect(JSON.stringify(t)).toBe(before)
  })

  it('행동하는 좌석: 진행 중에는 차례인 사람만(공개 단계는 확인 전인 사람 모두)', () => {
    const t = playing(humans(3))
    expect(actorsOf(t)).toEqual([0])
  })
})

describe('차례 제한 시간 (Rules.md 6.3)', () => {
  const advance = (t: Table, ms: number) => def.clock!.advance(t, ms, { log: () => {} })

  it('사람이 한 명뿐이거나(나머지 봇) 제한이 없으면 시계가 없다', () => {
    expect(setup([{ kind: 'human', name: '나' }, { kind: 'bot', name: 'AI' }], { turnTime: 60 }).clock).toBeNull()
    expect(setup(humans(2), { turnTime: null }).clock).toBeNull()
    expect(setup(humans(2), { turnTime: 60 }).clock).not.toBeNull()
  })

  it('공개 단계는 모두에게 같은 시계, 지나면 남은 사람을 확인한다', () => {
    let t = setup(humans(3), { turnTime: 60 })
    t = def.apply(t, 1, { type: 'CONFIRM' }, ctx())
    t = advance(t, 59_000)
    expect(t.game.phase).toBe('reveal')
    expect(def.view(t, 0).leftMs).toBe(1000)
    t = advance(t, 1_000)
    expect(t.game.phase).toBe('playing')
    expect(t.game.log.filter((e) => e.message.includes('자동으로 확인'))).toHaveLength(2)
  })

  it('시간이 흘러도 상태 객체는 그대로다(1초마다 다시 보내지 않는다)', () => {
    const t = playing(humans(2), { turnTime: 60 })
    expect(advance(t, 1000)).toBe(t)
  })

  it('가져오기 두 번째 장 시간 초과는 자동으로 가져오지만 세지 않는다', () => {
    let t = playing(humans(2), { turnTime: 60 })
    t = def.apply(t, 0, { type: 'TAKE', turn: t.game.turn, take: 0 }, ctx())
    expect(t.game.stage).toBe('take')
    const hand = t.game.players[0]!.hand.length
    t = advance(t, 60_000)
    expect(t.game.players[0]!.hand).toHaveLength(hand + 1)
    expect(t.strikes[0]).toBe(0)
    expect(t.game.currentPlayerId).toBe('p1')
    expect(t.game.log.some((e) => e.playerId === 'p0' && e.message.includes(TIMEOUT_LOG_MARK))).toBe(true)
    // 새 차례 번호라 새 시계
    expect(def.view(t, 1).leftMs).toBe(60_000)
  })

  it('지나면 자동 수, 행동 고르기 시간 초과가 2번 이어지면 AI 가 대신 두고, 되찾을 수 있다', () => {
    let t = playing(humans(2), { turnTime: 60 })
    // 시계는 차례마다 하나다: 행동 고르기에서 시간이 다 되어 가져오기 첫 장을 자동으로 가져오면, 바로 다음 시계 틱에 두 번째 장도 자동
    const timeout = () => {
      const turn = t.game.turn
      t = advance(t, 60_000)
      if (t.game.turn === turn) {
        expect(t.game.stage).toBe('take')
        t = advance(t, 1_000)
      }
      expect(t.game.turn).toBeGreaterThan(turn)
    }
    // 자리 0: 행동 고르기 시간 초과 1
    expect(t.game.currentPlayerId).toBe('p0')
    timeout()
    expect(t.strikes[0]).toBe(1)
    expect(t.game.log.some((e) => e.playerId === 'p0' && e.message.includes(TIMEOUT_LOG_MARK))).toBe(true)
    // 자리 1 은 자리 0 차례가 올 때까지 직접 둔다(가져오기 두 번째 장 포함)
    for (let i = 0; i < 6 && t.game.currentPlayerId !== 'p0'; i++) t = direct(t, 1)
    expect(t.game.currentPlayerId).toBe('p0')
    expect(t.strikes).toEqual([1, 0])
    timeout()
    expect(t.strikes[0]).toBe(2)
    expect(t.autopilot).toEqual([0])
    expect(t.game.log.some((e) => e.message.includes(AUTOPILOT_LOG_MARK))).toBe(true)
    // AI 대리 자리는 차례가 아니어도 되찾기를 낼 수 있다
    expect(actorsOf(t)).toContain(0)
    for (let i = 0; i < 6 && t.game.currentPlayerId !== 'p0'; i++) t = botMove(t, 1)
    expect(t.game.currentPlayerId).toBe('p0')
    expect(t.clock?.mode).toBe('autopilot')
    expect(def.view(t, 0).leftMs).toBeNull()
    // 자리 0 의 행동을 AI 가 대신 한다
    expect(t.game.stage).toBe('act')
    const before = JSON.stringify(t.game)
    t = advance(t, 800)
    expect(JSON.stringify(t.game)).not.toBe(before)
    t = def.apply(t, 0, { type: 'RESUME' }, ctx())
    expect(t.autopilot).toEqual([])
    expect(t.strikes[0]).toBe(0)
  })

  it('직접 둔 행동은 연속 시간 초과를 풀지만, 자리를 비운 사람 대신 봇이 둔 수는 풀지 않는다', () => {
    let t = playing(humans(2), { turnTime: 60 })
    t = { ...t, strikes: [1, 0] }
    const byBot = botMove(t, 0)
    expect(byBot.strikes[0]).toBe(1)
    const mine = def.apply(t, 0, { type: 'TAKE', turn: t.game.turn, take: 0 }, ctx())
    expect(mine.strikes[0]).toBe(0)
  })
})

describe('봇', () => {
  it.each([2, 3, 4])('%i인: 봇끼리 끝까지 두고, 한 수는 짧다', (n) => {
    let t = setup(Array.from({ length: n }, (_, i) => ({ kind: 'bot' as const, name: `AI ${i}` })))
    expect(t.game.phase).toBe('playing')
    const times: number[] = []
    for (let i = 0; i < 400 && !def.isOver(t); i++) {
      const seat = actorsOf(t)[0]!
      const start = performance.now()
      const a = def.bot!.next(t, seat, {}) as Action
      times.push(performance.now() - start)
      t = def.apply(t, seat, a, ctx(true))
    }
    expect(def.isOver(t)).toBe(true)
    expect(t.game.result?.ranking).toHaveLength(n)
    // 서버 봇 예산(BOT_TIME_LIMIT_MS 1000 → 탐색 450ms) 안
    expect(Math.max(...times)).toBeLessThan(450)
  })

  it('튜토리얼 판의 봇 자리는 연습 봇이 둔다(엔진이 받아 주는 수)', () => {
    let t = playing([{ kind: 'human', name: '나' }, { kind: 'bot', name: '연습 봇' }], { tutorial: true })
    for (let i = 0; i < 400 && !def.isOver(t); i++) t = botMove(t, actorsOf(t)[0]!)
    expect(def.isOver(t)).toBe(true)
  })

  it('대리: 자리를 비운 사람 차례면 그 자리가 보는 정보로 AI 가 둔다. 차례가 아니면 null', () => {
    const t = playing(humans(2))
    expect(def.bot!.next(t, 1, {})).toBeNull()
    expect(def.bot!.next(t, 0, {})).toMatchObject({ turn: t.game.turn })
    expect(['TAKE', 'PLANT', 'CALL']).toContain(def.bot!.next(t, 0, {})!.type)
    // 대신 둘 수가 거절되면 엔진 자동 수
    expect(def.bot!.fallback!(t, 0)).toEqual(fromEngine(autoAction(t.game, 'p0')!, t.game.turn))
  })

  it('기권: 차례에 기권하면 다음 사람으로, 둘이면 남은 사람이 이긴다', () => {
    const t = playing(humans(2))
    const after = def.apply(t, 0, { type: 'SURRENDER' }, ctx())
    expect(def.isOver(after)).toBe(true)
    expect(after.game.result?.ranking[0]).toBe(playerId(1))
  })
})
