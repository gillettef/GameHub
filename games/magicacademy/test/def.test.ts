// GameDef 계약: 행동 검사, 거절해도 판이 그대로인지, 좌석별로 가린 상태, 봇·시계로 끝까지, 이어 하기 재생, 그리고 지금 규칙의 큰 흐름
import { LocalGame } from '@gamehub/net/client'
import { Match, RuleError, type SeatInfo, type Timers } from '@gamehub/net'
import { describe, expect, test } from 'vitest'
import { def, parseAction, RESOLVE_STEP_MS, type Action, type Table } from '../src/def'
import { BALANCE } from '../src/engine/config'
import { effectiveStat } from '../src/engine/types'

const ctx = { log: () => {}, name: (i: number) => `${i + 1}번`, byBot: false }
const seats = (n: number, humans = 1): SeatInfo[] => Array.from({ length: n }, (_, i) => (i < humans ? { kind: 'human', name: `사람${i + 1}` } : { kind: 'bot', name: `봇 ${i + 1}` }))
const newTable = (n = 3, seed = 7, humans = n) => def.setup({ seats: seats(n, humans), seed, options: undefined })

/** 시계와 봇으로 한 걸음: 둘 사람이 없으면 다음 활동, 있으면 그 자리 봇의 수 */
function step(t: Table, memory: Record<string, unknown>[]): Table {
  const [seat] = def.actors(t)
  if (seat === undefined) return def.clock!.advance(t, RESOLVE_STEP_MS, ctx)
  const action = def.bot!.next(t, seat, (memory[seat] ??= {}))
  if (!action) throw new Error('봇이 둘 수를 못 찾았다')
  return def.apply(t, seat, action, ctx)
}
function playUntil(t: Table, done: (t: Table) => boolean, limit = 5000): Table {
  const memory: Record<string, unknown>[] = []
  for (let i = 0; i < limit && !done(t) && !def.isOver(t); i++) t = step(t, memory)
  return t
}

describe('parseAction', () => {
  test('형식이 맞는 행동만 받는다', () => {
    expect(parseAction({ type: 'class', cardId: 'c12', mode: 'note' })).toEqual({ type: 'class', cardId: 'c12', mode: 'note' })
    expect(parseAction({ type: 'class', cardId: null })).toEqual({ type: 'class', cardId: null, mode: 'learn' })
    expect(parseAction({ type: 'select', activityId: 'duel', target: 'p2', cardId: 'c3' })).toEqual({ type: 'select', activityId: 'duel', target: 'p2', cardId: 'c3' })
    expect(parseAction({ type: 'roll' })).toEqual({ type: 'roll' })
    expect(parseAction({ type: 'reroll', dice: [0, 2] })).toEqual({ type: 'reroll', dice: [0, 2] })
    expect(parseAction({ type: 'note', stat: 'charm' })).toEqual({ type: 'note', stat: 'charm' })
    expect(parseAction({ type: 'confirm' })).toEqual({ type: 'confirm' })
  })
  test('모르는 키·값, 다른 사람 행세(player·playerId), 장래희망 바꾸기는 거절한다', () => {
    const bad: unknown[] = [
      null,
      'confirm',
      [],
      { type: 'confirm', playerId: 'p1' },
      { type: 'roll', player: 1 },
      { type: 'class', cardId: 'c1', mode: 'steal' },
      { type: 'class', cardId: '<b>' },
      { type: 'select', activityId: 'nap' },
      { type: 'select', activityId: 'duel', target: 'p9' },
      { type: 'roll', count: -1 },
      { type: 'roll', count: 1.5 },
      { type: 'reroll', dice: [] },
      { type: 'reroll', dice: ['0'] },
      { type: 'note', stat: 'luck' },
      { type: 'adjust', delta: 2 },
      { type: 'pick' },
      { type: 'dream', dreamId: 'c1' },
      { type: 'leave' },
    ]
    for (const raw of bad) expect(parseAction(raw), JSON.stringify(raw)).toBeNull()
  })
})

describe('apply', () => {
  test('차례가 아닌 좌석·규칙에 맞지 않는 행동은 RuleError 이고 판을 건드리지 않는다', () => {
    const t = newTable(3)
    const before = JSON.stringify(t)
    const [actor] = def.actors(t)
    expect(actor).toBeDefined()
    const other = (actor! + 1) % 3
    expect(() => def.apply(t, other, { type: 'roll' }, ctx)).toThrow(RuleError)
    expect(() => def.apply(t, actor!, { type: 'confirm' }, ctx)).toThrow(RuleError) // 굴리기 전에는 확인할 수 없다
    expect(() => def.apply(t, actor!, { type: 'class', cardId: null, mode: 'learn' }, ctx)).toThrow(RuleError)
    expect(JSON.stringify(t)).toBe(before)
  })
  test('적용하면 새 판을 돌려주고 원래 판은 그대로다. 엔진 기록이 방 기록으로 간다', () => {
    const t = newTable(2)
    const before = JSON.stringify(t)
    const [actor] = def.actors(t)
    const logs: string[] = []
    const next = def.apply(t, actor!, { type: 'roll' }, { ...ctx, log: (text) => void logs.push(text) })
    expect(next).not.toBe(t)
    expect(JSON.stringify(t)).toBe(before)
    expect(next.game.pendingRoll!.entries.find((e) => e.playerId === `p${actor}`)!.dice).not.toBeNull()
    const confirmed = def.apply(next, actor!, { type: 'confirm' }, { ...ctx, log: (text) => void logs.push(text) })
    expect(confirmed.game.pendingRoll!.entries.find((e) => e.playerId === `p${actor}`)!.confirmed).toBe(true)
  })
  test('같은 시드·같은 행동이면 같은 판(주사위까지)', () => {
    const moves: { seat: number; action: Action }[] = []
    const memory: Record<string, unknown>[] = []
    let a = newTable(3, 99)
    for (let i = 0; i < 5000; i++) {
      const [seat] = def.actors(a)
      if (seat === undefined) {
        a = def.clock!.advance(a, RESOLVE_STEP_MS, ctx)
        continue
      }
      const action = def.bot!.next(a, seat, (memory[seat] ??= {}))!
      moves.push({ seat, action })
      a = def.apply(a, seat, action, ctx)
      if (a.game.round >= 3) break
    }
    // 시계로 넘기던 진행은 다음 행동 앞에서 먼저 한다(이어 하기와 같은 방식)
    let b = newTable(3, 99)
    for (const m of moves) b = def.apply(b, m.seat, m.action, ctx)
    expect(JSON.stringify(b.game)).toBe(JSON.stringify(a.game))
    expect(JSON.stringify(newTable(3, 100).game)).not.toBe(JSON.stringify(newTable(3, 99).game))
  })
})

describe('view: 좌석마다 볼 수 있는 것만', () => {
  test('덱·버림 더미·주사위 처리·시험 계획·난수·봇 성향은 보내지 않는다', () => {
    const t = newTable(4)
    const v = def.view(t, 0)
    const text = JSON.stringify(v)
    for (const key of ['hidden', 'labPile', 'explorationPile', 'classDeck', 'classDiscard', 'creatureDeck', 'creatureDiscard', 'rng', 'bots', 'examPlan', 'newsDeck']) {
      expect(text.includes(`"${key}"`), key).toBe(false)
    }
    expect(v.me).toBe('p0')
    expect(v.game.classLeft).toBeGreaterThan(0)
  })
  test('장래희망·엿본 탐험 카드는 본인만, 관전은 아무도, 끝나면 장래희망 공개', () => {
    const t = newTable(3)
    t.game.players.p1!.peekedExploration = { id: 'c1', name: '비밀', description: '', successText: '', failureText: '' }
    const dream1 = t.game.players.p1!.dream
    expect(dream1).toBeTruthy()
    const mine = def.view(t, 1).game.players
    expect(mine.p1!.dream).toEqual(dream1)
    expect(mine.p1!.peekedExploration?.name).toBe('비밀')
    expect(mine.p0!.dream).toBeNull()
    expect(mine.p0!.dreamOptions).toBeUndefined()
    const other = def.view(t, 0).game.players.p1!
    expect(other.dream).toBeNull()
    expect(other.dreamOptions).toBeUndefined()
    expect(other.peekedExploration).toBeNull()
    const watch = def.view(t, null)
    expect(watch.me).toBeNull()
    for (const p of Object.values(watch.game.players)) {
      expect(p.dream).toBeNull()
      expect(p.peekedExploration).toBeNull()
    }
    const ended: Table = { ...t, game: { ...t.game, phase: 'ended' } }
    expect(def.view(ended, 0).game.players.p1!.dream).toEqual(dream1)
    expect(def.view(ended, 0).game.players.p1!.peekedExploration).toBeNull()
  })
})

describe('진행', () => {
  test('2~5인 봇끼리 시계와 함께 12개월을 끝까지 둔다', () => {
    for (const n of [2, 3, 4, 5]) {
      const t = playUntil(newTable(n, 40 + n, 0), () => false, 20000)
      expect(def.isOver(t), `${n}인`).toBe(true)
      expect(def.actors(t)).toEqual([])
      expect(t.game.round).toBe(BALANCE.totalRounds)
      expect(t.game.examResults.map((r) => r.round)).toEqual([BALANCE.midtermRound, BALANCE.totalRounds])
      const best = Math.max(...t.game.turnOrder.map((id) => t.game.players[id]!.credit))
      expect(t.game.winnerIds!.every((id) => t.game.players[id]!.credit === best)).toBe(true)
    }
  }, 120_000)
  test('진행 단계에서는 둘 사람이 없고, 3초가 지나야 다음 활동이 시작된다', () => {
    const t = playUntil(newTable(3, 5, 0), (x) => def.actors(x).length === 0 && x.game.phase === 'activity')
    expect(t.game.activityStage).toBe('resolve')
    const early = def.clock!.advance(t, RESOLVE_STEP_MS - 1, ctx)
    expect(early).toBe(t) // 화면에 보일 변화가 없으면 같은 판
    expect(def.actors(early)).toEqual([])
    const later = def.clock!.advance(early, 1, ctx)
    expect(later).not.toBe(t)
    expect(later.game.activityResolvePointer > t.game.activityResolvePointer || later.game.pendingRoll !== null || later.game.pendingPick !== null).toBe(true)
  })
  test('차례: 학점이 낮은 사람부터, 판정 주사위는 주문력 개수, 다시 굴리기는 체력 번', () => {
    const t = playUntil(newTable(3, 12, 0), (x) => x.game.phase === 'class')
    const credits = t.game.classPickOrder.map((id) => t.game.players[id]!.credit)
    expect([...credits].sort((a, b) => a - b)).toEqual(credits)
    const r = playUntil(t, (x) => x.game.pendingRoll?.kind === 'creature' || x.game.pendingRoll?.kind === 'lab' || x.game.pendingRoll?.kind === 'exploration')
    const entry = r.game.pendingRoll!.entries[0]!
    const p = r.game.players[entry.playerId]!
    const news = r.game.news?.effect ?? {}
    expect(entry.diceCount).toBe(effectiveStat(p, 'spellPower') + (news.extraDice ?? 0))
    expect(entry.rerollsLeft).toBe(effectiveStat(p, 'stamina') + (news.rerollBonus ?? 0))
  })
  test('봇이 남의 행동을 하지 않고, 판단이 막히면 대신할 행동이 있다', () => {
    const t = playUntil(newTable(4, 3, 0), (x) => x.game.phase === 'activity' && x.game.activityStage === 'choose')
    const [seat] = def.actors(t)
    const a = def.bot!.next(t, seat!, {})
    expect(a?.type).toBe('select')
    expect(def.bot!.fallback!(t, seat!)?.type).toBe('select')
    expect(() => def.apply(t, seat!, a!, ctx)).not.toThrow()
  })
})

describe('공통 진행 코드와 함께', () => {
  /** 손으로 돌리는 타이머와 시계 */
  function manual() {
    let now = 0
    let queue: { at: number; fn: () => void; id: number }[] = []
    let ids = 0
    const timers: Timers = {
      set: (fn, ms) => {
        const id = ++ids
        queue.push({ at: now + ms, fn, id })
        return id
      },
      clear: (h) => void (queue = queue.filter((q) => q.id !== h)),
    }
    const run = (limit: number) => {
      for (let i = 0; i < limit && queue.length; i++) {
        queue.sort((a, b) => a.at - b.at)
        const next = queue.shift()!
        now = Math.max(now, next.at)
        next.fn()
      }
    }
    return { timers, now: () => now, run }
  }

  test('한 기기 봇끼리: 봇 예약과 시계로 끝까지, 이어 하기는 행동 기록만으로 같은 판이 된다', () => {
    const m = manual()
    let saved: ReturnType<LocalGame<Table, Action, unknown, undefined>['save']> | null = null
    const game = new LocalGame(def, { seats: seats(3, 0), seed: 77, timers: m.timers, now: m.now, onSave: (s) => (saved = s) })
    game.start()
    m.run(200)
    const mid = game.getState().room
    expect(saved).not.toBeNull()
    // 이어 하기: 저장한 행동만 다시 둔다(시계로 넘긴 진행은 다음 행동 앞에서 먼저 한다)
    const again = new LocalGame(def, { seats: saved!.seats, seed: saved!.seed, history: saved!.history, timers: manual().timers })
    const a = mid.view as { game: { round: number; log: unknown[] } }
    const b = again.getState().room.view as { game: { round: number; log: unknown[] } }
    expect(b.game.round).toBe(a.game.round)
    expect(JSON.stringify(b.game.log)).toBe(JSON.stringify(a.game.log.slice(0, b.game.log.length)))
    m.run(100000)
    expect(game.getState().room.status).toBe('over')
    game.dispose()
    again.dispose()
  }, 120_000)

  test('Match: 사람 차례는 기다리고, 그 사람이 두면 이어진다', () => {
    const m = manual()
    const match = new Match(def, {
      seats: seats(2, 1),
      seed: 5,
      options: undefined,
      timers: m.timers,
      now: m.now,
      autoDelay: (i) => (i === 0 ? null : 100),
      onChange: () => {},
    })
    match.schedule()
    for (let i = 0; i < 50 && !match.actors().includes(0); i++) m.run(1)
    expect(match.actors()).toEqual([0])
    const v = match.version
    m.run(5)
    expect(match.version).toBe(v) // 사람 차례에는 아무도 두지 않는다
    match.act(0, { type: 'roll' })
    match.act(0, { type: 'confirm' })
    expect(match.version).toBe(v + 2)
    match.stop()
  })
})
