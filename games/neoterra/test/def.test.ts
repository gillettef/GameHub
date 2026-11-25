import { Match, RuleError, type SeatInfo } from '@gamehub/net'
import { describe, expect, it } from 'vitest'
import { actorOf, def, parseAction, type Table } from '../src/def'
import { HIDDEN } from '../src/engine/mask'
import type { Action } from '../src/engine/types'

const seats = (n: number, humans = 0): SeatInfo[] =>
  Array.from({ length: n }, (_, i) => (i < humans ? { kind: 'human', name: `사람${i + 1}` } : { kind: 'bot', name: `봇 ${i + 1}` }))

const ctx = (byBot = false) => ({ name: (i: number) => `${i + 1}번`, log: () => {}, byBot })

/** 봇끼리 끝까지(타이머 없이 바로) */
function playOut(t: Table, limit = 6000): { t: Table; moves: number } {
  let moves = 0
  while (!def.isOver(t) && moves < limit) {
    const seat = def.actors(t)[0]!
    let next: Table | null = null
    for (const choose of [() => def.bot!.next(t, seat, {}), () => def.bot!.fallback!(t, seat)]) {
      const a = choose()
      if (!a) continue
      try {
        next = def.apply(t, seat, a, ctx(true))
        break
      } catch (e) {
        if (!(e instanceof RuleError)) throw e
      }
    }
    if (!next) throw new Error('봇이 둘 수 있는 행동이 없습니다')
    t = next
    moves++
  }
  return { t, moves }
}

describe('def: 행동 형식 검사', () => {
  it('알려진 필드만 옮겨 담고 형식이 틀리면 null', () => {
    expect(parseAction({ type: 'pickQuest', slot: 0, seat: 3 })).toEqual({ type: 'pickQuest', slot: 0 })
    expect(parseAction({ type: 'pickQuest', slot: 5 })).toBeNull()
    expect(parseAction({ type: 'research', node: 5 })).toBeNull()
    expect(parseAction({ type: 'build', kind: 'farm', level: 1 })).toEqual({ type: 'build', kind: 'farm', level: 1 })
    expect(parseAction({ type: 'build', kind: 'castle', level: 1 })).toBeNull()
    expect(parseAction({ type: 'disband', group: 'unit', kind: 'farm', level: 0 })).toBeNull()
    expect(parseAction({ type: 'disband', group: 'building', kind: 'farm', level: 0 })).toEqual({ type: 'disband', group: 'building', kind: 'farm', level: 0 })
    expect(parseAction({ type: 'launch', slot: 2, replace: 1 })).toEqual({ type: 'launch', slot: 2, replace: 1 })
    expect(parseAction({ type: 'launch', slot: 3 })).toBeNull()
    expect(parseAction({ type: 'raid', card: 0, target: 1, effect: 'lootProd', swarm: 'yes' })).toBeNull()
    expect(parseAction({ type: 'raid', card: 0, target: 1, effect: 'lootProd', swarm: false })).toEqual({ type: 'raid', card: 0, target: 1, effect: 'lootProd' })
    expect(parseAction({ type: 'endTurn', extra: 1 })).toEqual({ type: 'endTurn' })
    expect(parseAction({ type: 'respond', choice: -1 })).toBeNull()
    expect(parseAction(null)).toBeNull()
    expect(parseAction([])).toBeNull()
    expect(parseAction({ type: 'cheat' })).toBeNull()
  })
})

describe('def: 진행', () => {
  it('차례가 아닌 좌석·규칙 위반은 RuleError, 상태는 그대로', () => {
    const t = def.setup({ seats: seats(3, 1), seed: 7, options: undefined })
    const before = JSON.stringify(t)
    const other = (actorOf(t.game) + 1) % 3
    expect(() => def.apply(t, other, { type: 'endTurn' }, ctx())).toThrow(RuleError)
    expect(() => def.apply(t, actorOf(t.game), { type: 'research', node: 'none' }, ctx())).toThrow(RuleError)
    expect(JSON.stringify(t)).toBe(before)
  })

  it.each([
    [2, 11],
    [3, 22],
    [4, 33],
  ])('%i인 봇끼리 끝까지 둔다(시드 %i)', (n, seed) => {
    const { t } = playOut(def.setup({ seats: seats(n), seed, options: undefined }))
    expect(def.isOver(t)).toBe(true)
    expect(def.actors(t)).toEqual([])
  })

  it('같은 시드·행동이면 같은 상태(한 기기 이어 하기가 기록을 다시 둔다)', () => {
    const replay = (moves: { seat: number; action: Action }[]) => {
      let t = def.setup({ seats: seats(3, 1), seed: 99, options: undefined })
      for (const m of moves) t = def.apply(t, m.seat, m.action, ctx(true))
      return t
    }
    let t = def.setup({ seats: seats(3, 1), seed: 99, options: undefined })
    const moves: { seat: number; action: Action }[] = []
    for (let i = 0; i < 120 && !def.isOver(t); i++) {
      const seat = actorOf(t.game)
      const a = def.bot!.next(t, seat, {})!
      try {
        t = def.apply(t, seat, a, ctx(true))
      } catch {
        const f = def.bot!.fallback!(t, seat)!
        t = def.apply(t, seat, f, ctx(true))
        moves.push({ seat, action: f })
        continue
      }
      moves.push({ seat, action: a })
    }
    expect(JSON.stringify(replay(moves))).toBe(JSON.stringify(t))
  })
})

describe('def: 좌석별 가림', () => {
  const mid = () => {
    let t = def.setup({ seats: seats(3, 1), seed: 5, options: undefined })
    // 손패가 생길 때까지 둔다
    for (let i = 0; i < 400 && !t.game.players.some((p) => p.hand.length > 0); i++) {
      const seat = actorOf(t.game)
      t = def.apply(t, seat, def.bot!.next(t, seat, {}) ?? def.bot!.fallback!(t, seat)!, ctx(true))
    }
    return t
  }

  it('시드·난수·덱 순서·남의 손패를 가린다', () => {
    const t = mid()
    const holder = t.game.players.find((p) => p.hand.length > 0)!
    const viewer = (holder.id + 1) % 3
    const v = def.view(t, viewer).game
    expect(v.seed).toBe(0)
    expect(v.rngState).toEqual([0, 0, 0, 0])
    expect(Object.values(v.questDecks).flat().every((id) => id === HIDDEN)).toBe(true)
    expect(v.satDeck.every((id) => id === HIDDEN)).toBe(true)
    expect(v.players[holder.id]!.hand.every((h) => h.id === HIDDEN)).toBe(true)
    expect(def.view(t, holder.id).game.players[holder.id]!.hand).toEqual(holder.hand)
    // 관전은 모든 손패를 가린다
    expect(def.view(t, null).game.players.every((p) => p.hand.every((h) => h.id === HIDDEN))).toBe(true)
  })

  it('끝난 판은 손패를 공개한다', () => {
    const { t } = playOut(def.setup({ seats: seats(2), seed: 3, options: undefined }))
    const v = def.view(t, 0).game
    expect(v.players[1]!.hand).toEqual(t.game.players[1]!.hand)
  })
})

describe('def: 되돌리기 표시', () => {
  it('봇의 행동·정보가 드러난 행동이 끼면 0, 아니면 사람 행동마다 1씩', () => {
    const t = def.setup({ seats: seats(2, 1), seed: 1, options: undefined })
    expect(t.undo).toBe(0)
    // 퀘스트 고르기는 정보를 드러낸다
    const seat = actorOf(t.game)
    const a = def.bot!.next(t, seat, {})!
    const after = def.apply(t, seat, a, ctx())
    if (a.type === 'pickQuest' || a.type === 'endTurn') expect(after.undo).toBe(0)
    expect(def.apply(t, seat, a, ctx(true)).undo).toBe(0)
  })

  it('Match 로 사람 한 명 + 봇이 끝까지 진행된다', () => {
    const queue: (() => void)[] = []
    const match = new Match(def, {
      seats: seats(2),
      seed: 42,
      options: undefined,
      timers: { set: (fn) => queue.push(fn), clear: () => {} },
      autoDelay: () => 0,
      onChange: () => {},
    })
    match.schedule()
    for (let i = 0; i < 8000 && queue.length; i++) queue.shift()!()
    expect(match.over).toBe(true)
  })
})
