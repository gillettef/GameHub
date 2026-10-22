import { describe, expect, it } from 'vitest'
import { PERSONAL_GOAL_DECK, roundGoalDeck, type LawId, type PersonalGoalId, type RoundGoalId } from '../cards'
import { STANDARD_LAYOUT, TIME } from '../dice'
import { finalScores } from '../final'
import { applyAction, getLegalActions, IllegalActionError, TURNS_PER_ROUND, type Action } from '../game'
import { checkRoundGoals, goalPoints, personalGoalPoints, revealRoundGoals } from '../goals'
import { createRng, nextInt } from '../rng'
import { createGame } from '../setup'
import type { Board, GameState, RolledDie, Round, RoundGoalCard } from '../types'
import { board, die, line, startGame } from './helpers'

// ─── 도우미 ─────────────────────────────────────────────────────────

const take = (s: GameState, slot: number): GameState =>
  applyAction(s, { type: 'takeSlot', player: s.currentPlayer, slot })

const place = (s: GameState, d: RolledDie, row: number, col: number): GameState =>
  applyAction(s, { type: 'place', player: s.currentPlayer, dieId: d.id, row, col })

const card = (id: RoundGoalId, round: Round, first: number | null = null, achieved: number[] = []): RoundGoalCard => ({
  id,
  round,
  first,
  achieved,
})

/** 라운드·목표·보드를 직접 정한 상태 (표준 우주) */
function staged(round: Round, goals: RoundGoalCard[], boards: Board[]): GameState {
  const base = startGame({ playerCount: boards.length, seed: 1 })
  return {
    ...base,
    phase: { kind: 'round', round },
    roundGoals: goals,
    players: base.players.map((p, i) => ({ ...p, board: boards[i] as Board })),
  }
}

function setBoard(s: GameState, player: number, b: Board): GameState {
  return { ...s, players: s.players.map((p) => (p.id === player ? { ...p, board: b } : p)) }
}

function playRandomly(seed: number, playerCount: number, law: LawId = 'standard'): GameState[] {
  let s = createGame({ playerCount, seed, law })
  let r = createRng(seed + 1)
  const history = [s]
  for (let guard = 0; guard < 2000; guard++) {
    const actions = getLegalActions(s)
    if (actions.length === 0) break
    let i: number
    ;[i, r] = nextInt(r, actions.length)
    s = applyAction(s, actions[i] as Action)
    history.push(s)
  }
  return history
}

const roundOf = (s: GameState) => (s.phase.kind === 'round' ? s.phase.round : null)

const T = () => die('red', TIME)
/** 선에 ⧗ 2개 → 시간의 씨앗 달성 */
const timeSeedBoard = () => board({ '0,1': [T()], '0,2': [T()] })

// ─── §5 개인 목표 고르기 ────────────────────────────────────────────

describe('§5-3 개인 목표 카드 고르기', () => {
  it('§5-3 각자 개인 목표 카드를 2장 받는다 (서로 겹치지 않음), 아직 고르지 않았다', () => {
    const s = createGame({ playerCount: 4, seed: 3 })
    for (const p of s.players) {
      expect(p.personalOffer).toHaveLength(2)
      expect(p.personalGoal).toBeNull()
      for (const g of p.personalOffer) expect(PERSONAL_GOAL_DECK).toContain(g)
    }
    expect(new Set(s.players.flatMap((p) => p.personalOffer)).size).toBe(8)
  })

  it('§5-3 받은 카드 중에서 1장을 고른다', () => {
    const s = createGame({ playerCount: 2, seed: 3 })
    const goal = s.players[1]?.personalOffer[1] as PersonalGoalId
    const after = applyAction(s, { type: 'choosePersonalGoal', player: 1, goal })
    expect(after.players[1]?.personalGoal).toBe(goal)
    expect(after.players[0]?.personalGoal).toBeNull()
    expect(after.phase).toEqual({ kind: 'setup' })
  })

  it('§5-3 받지 않은 카드는 고를 수 없다', () => {
    const s = createGame({ playerCount: 2, seed: 3 })
    const notMine = PERSONAL_GOAL_DECK.find((g) => !s.players[0]?.personalOffer.includes(g)) as PersonalGoalId
    expect(() => applyAction(s, { type: 'choosePersonalGoal', player: 0, goal: notMine })).toThrow(IllegalActionError)
    // 다른 사람이 받은 카드도 안 된다
    const theirs = s.players[1]?.personalOffer[0] as PersonalGoalId
    expect(() => applyAction(s, { type: 'choosePersonalGoal', player: 0, goal: theirs })).toThrow(IllegalActionError)
  })

  it('§5-3 두 번 고를 수 없다 (1장만)', () => {
    let s = createGame({ playerCount: 2, seed: 3 })
    const [a, b] = s.players[0]?.personalOffer as [PersonalGoalId, PersonalGoalId]
    s = applyAction(s, { type: 'choosePersonalGoal', player: 0, goal: a })
    expect(() => applyAction(s, { type: 'choosePersonalGoal', player: 0, goal: b })).toThrow(IllegalActionError)
    expect(() => applyAction(s, { type: 'choosePersonalGoal', player: 0, goal: a })).toThrow(IllegalActionError)
  })

  it('없는 플레이어는 고를 수 없다', () => {
    const s = createGame({ playerCount: 2, seed: 3 })
    const g = s.players[0]?.personalOffer[0] as PersonalGoalId
    expect(() => applyAction(s, { type: 'choosePersonalGoal', player: 2, goal: g })).toThrow(IllegalActionError)
  })

  it('§5-3 모두 고르기 전에는 시장에서 가져오는 등 다른 행동을 할 수 없다', () => {
    let s = createGame({ playerCount: 2, seed: 3 })
    expect(() => take(s, 0)).toThrow(IllegalActionError)
    s = applyAction(s, { type: 'choosePersonalGoal', player: 0, goal: s.players[0]?.personalOffer[0] as PersonalGoalId })
    expect(() => take(s, 0)).toThrow(IllegalActionError)
  })

  it('§5-3 모두 고르면(순서 무관) 1라운드가 시작되고, 시작 플레이어의 차례다', () => {
    let s = createGame({ playerCount: 3, seed: 4 })
    for (const id of [2, 0, 1]) {
      s = applyAction(s, { type: 'choosePersonalGoal', player: id, goal: s.players[id]?.personalOffer[0] as PersonalGoalId })
    }
    expect(s.phase).toEqual({ kind: 'round', round: 1 })
    expect(s.currentPlayer).toBe(s.startPlayer)
    expect(() => take(s, 0)).not.toThrow()
  })

  it('§5-3 게임이 시작된 뒤에는 개인 목표를 고를 수 없다', () => {
    const s = startGame({ playerCount: 2, seed: 3 })
    const other = s.players[0]?.personalOffer[1] as PersonalGoalId
    expect(() => applyAction(s, { type: 'choosePersonalGoal', player: 0, goal: other })).toThrow(IllegalActionError)
  })

  it('준비 단계의 합법 행동 = 아직 고르지 않은 사람마다 받은 카드 2장', () => {
    let s = createGame({ playerCount: 3, seed: 5 })
    expect(getLegalActions(s)).toHaveLength(6)
    expect(getLegalActions(s).every((a) => a.type === 'choosePersonalGoal')).toBe(true)
    s = applyAction(s, { type: 'choosePersonalGoal', player: 1, goal: s.players[1]?.personalOffer[0] as PersonalGoalId })
    const left = getLegalActions(s)
    expect(left).toHaveLength(4)
    expect(left.some((a) => a.player === 1)).toBe(false)
  })
})

// ─── §5 라운드 목표 공개 ────────────────────────────────────────────

describe('§5 라운드 시작: 목표 카드 2장 공개', () => {
  it('§5 게임 시작 때 1라운드 목표 2장이 공개되고 더미에서 빠진다', () => {
    const s = createGame({ playerCount: 2, seed: 8 })
    expect(s.roundGoals).toHaveLength(2)
    for (const c of s.roundGoals) {
      expect(c).toMatchObject({ round: 1, first: null, achieved: [] })
      expect(roundGoalDeck(1)).toContain(c.id)
      expect(s.goalDecks[0]).not.toContain(c.id)
    }
    expect(new Set(s.roundGoals.map((c) => c.id)).size).toBe(2)
    expect(s.goalDecks.map((d) => d.length)).toEqual([6, 8, 8, 0])
  })

  it('§5-4 라운드 목표 더미는 시드에 따라 섞인다', () => {
    const shown = new Set(Array.from({ length: 20 }, (_, seed) => createGame({ playerCount: 2, seed }).roundGoals.map((c) => c.id).join()))
    expect(shown.size).toBeGreaterThan(1)
  })

  it('§5 라운드가 바뀔 때마다 그 라운드 목표 2장을 공개, 4라운드는 재설계 중이라 공개 없음', () => {
    const states = playRandomly(70, 3)
    const at = (r: Round) => states.find((s) => roundOf(s) === r) as GameState
    expect(at(1).roundGoals.map((c) => c.round)).toEqual([1, 1])
    expect(at(2).roundGoals.map((c) => c.round)).toEqual([1, 1, 2, 2])
    expect(at(3).roundGoals.map((c) => c.round)).toEqual([1, 1, 2, 2, 3, 3])
    const r4 = states.find((s) => s.time !== null) as GameState
    expect(r4.roundGoals).toHaveLength(6)
    for (const c of at(3).roundGoals) expect(roundGoalDeck(c.round)).toContain(c.id)
  })

  it('revealRoundGoals: 더미 위에서 2장, 더미가 비면 공개 없음', () => {
    const s = startGame({ playerCount: 2, seed: 1 })
    const top2 = s.goalDecks[1]?.slice(0, 2)
    const r2 = revealRoundGoals(s, 2)
    expect(r2.roundGoals.slice(2).map((c) => c.id)).toEqual(top2)
    expect(r2.goalDecks[1]).toHaveLength(6)
    expect(revealRoundGoals(s, 4).roundGoals).toEqual(s.roundGoals)
  })
})

// ─── §5 선착·달성 마커 ──────────────────────────────────────────────

describe('§5 라운드 목표: 선착 4점 / 달성 2점', () => {
  it('§5 가장 먼저 달성한 사람은 선착 칸, 이후 달성한 사람은 달성 칸', () => {
    let s = staged(1, [card('timeSeed', 1)], [timeSeedBoard(), timeSeedBoard(), board({})])
    s = checkRoundGoals(s, 1, false)
    expect(s.roundGoals[0]).toMatchObject({ first: 1, achieved: [] })
    s = checkRoundGoals(s, 0, false)
    expect(s.roundGoals[0]).toMatchObject({ first: 1, achieved: [0] })
    s = checkRoundGoals(s, 2, false)
    expect(s.roundGoals[0]).toMatchObject({ first: 1, achieved: [0] })
    expect([0, 1, 2].map((p) => goalPoints(s, p))).toEqual([2, 4, 0])
  })

  it('§5 같은 목표로 두 번 마커를 놓지 않는다 (선착한 사람은 달성 칸에 넣지 않음)', () => {
    let s = staged(1, [card('timeSeed', 1)], [timeSeedBoard(), board({})])
    s = checkRoundGoals(s, 0, false)
    const again = checkRoundGoals(s, 0, true)
    expect(again.roundGoals[0]).toMatchObject({ first: 0, achieved: [] })
    expect(goalPoints(again, 0)).toBe(4)
  })

  it('§5 한 번 얻은 목표 점수는 확정: 나중에 조건이 깨져도 잃지 않는다', () => {
    let s = staged(1, [card('timeSeed', 1)], [timeSeedBoard(), board({})])
    s = checkRoundGoals(s, 0, false)
    s = setBoard(s, 0, board({}))
    s = checkRoundGoals(s, 0, true)
    expect(s.roundGoals[0]?.first).toBe(0)
    expect(goalPoints(s, 0)).toBe(4)
  })

  it('§5 다른 라운드의 목표 카드는 달성할 수 없다 (지난 라운드 카드 포함)', () => {
    // 2라운드 중: 1라운드 목표(시간의 씨앗) 조건을 갖춰도 마커를 놓지 않는다
    const s = checkRoundGoals(staged(2, [card('timeSeed', 1)], [timeSeedBoard(), board({})]), 0, true)
    expect(s.roundGoals[0]).toMatchObject({ first: null, achieved: [] })
    // 1라운드 중에 3라운드 목표(시간의 지붕) 조건을 갖춰도 안 된다
    const roof = board({ '0,1': [T()], '0,2': [T()], '0,3': [T()] })
    const s2 = checkRoundGoals(staged(1, [card('timeRoof', 3)], [roof, board({})]), 0, true)
    expect(s2.roundGoals[0]?.first).toBeNull()
  })

  it('§5 미달성이면 마커가 없고, 목표가 없으면 0점', () => {
    const s = checkRoundGoals(staged(1, [card('timeSeed', 1)], [board({ '0,2': [T()] }), board({})]), 0, true)
    expect(s.roundGoals[0]).toMatchObject({ first: null, achieved: [] })
    expect(goalPoints(s, 0)).toBe(0)
  })

  it('goalPoints: 여러 카드의 선착·달성을 모두 더한다', () => {
    const s = staged(
      3,
      [card('timeSeed', 1, 0, [1]), card('rainbow', 1, 1, [0]), card('cross', 2, null, [0, 1]), card('skyscraper', 3, 0)],
      [board({}), board({})],
    )
    expect(goalPoints(s, 0)).toBe(4 + 2 + 2 + 4)
    expect(goalPoints(s, 1)).toBe(2 + 4 + 2)
  })

  it("고립('roundDone')은 라운드를 마친 뒤에만 판정한다", () => {
    const line5 = line(...Array.from({ length: 5 }, () => die('red', 1)))
    const iso = board({ ...line5, '1,1': [die('blue', 1)], '1,3': [die('blue', 1)], '2,0': [die('blue', 1)], '2,2': [die('blue', 1)], '2,3': [die('blue', 1)], '2,4': [die('blue', 1)] })
    const s = staged(2, [card('isolation', 2)], [iso, board({})])
    expect(checkRoundGoals(s, 0, false).roundGoals[0]?.first).toBeNull()
    expect(checkRoundGoals(s, 0, true).roundGoals[0]?.first).toBe(0)
  })
})

describe('§5 라운드 목표: 게임 진행 중 판정', () => {
  /** 1라운드, 0번 차례, 시장 칸 0에 ⧗ 주사위 */
  function round1With(boards: Board[]): { s: GameState; d: RolledDie } {
    let s = staged(1, [card('timeSeed', 1)], boards)
    const d = T()
    s = { ...s, leadPlayer: 0, currentPlayer: 0, turn: { circuit: 1, picks: 0, hand: [], taken: false, rerolled: false } }
    s = { ...s, market: [[d], [die('blue', 3)]] }
    return { s, d }
  }

  it('§5 놓는 즉시 달성을 확인해 선착 마커를 놓는다', () => {
    const { s, d } = round1With([board({ '0,2': [T()] }), board({})])
    const after = place(take(s, 0), d, 0, 1)
    expect(after.roundGoals[0]?.first).toBe(0)
    expect(goalPoints(after, 0)).toBe(4)
  })

  it('§5 같은 라운드에 뒤이어 달성한 사람은 달성 마커 (2점)', () => {
    const { s, d } = round1With([board({ '0,2': [T()] }), board({ '0,2': [T()] })])
    let after = place(take(s, 0), d, 0, 1)
    const e = die('blue', TIME)
    after = { ...after, market: [null, [e]] }
    after = place(take(after, 1), e, 0, 3)
    expect(after.roundGoals[0]).toMatchObject({ first: 0, achieved: [1] })
    expect(goalPoints(after, 1)).toBe(2)
  })

  it('§5 턴 도중(손에 주사위가 남아 있어도) 놓는 즉시 달성한다', () => {
    let s = staged(2, [card('smallSeed', 2)], [board({ ...line(...Array.from({ length: 5 }, () => die('red', 3))), '1,0': [die('red', 1)], '1,1': [die('red', 1)] }), board({})])
    const a = die('green', 1)
    const b = die('green', 5)
    s = { ...s, leadPlayer: 0, currentPlayer: 0, turn: { circuit: 0, picks: 0, hand: [], taken: false, rerolled: false }, market: [[a, b], [die('red', 2), die('red', 2)]] }
    s = place(take(s, 0), a, 1, 2)
    expect(s.turn.hand).toHaveLength(1)
    expect(s.roundGoals[0]?.first).toBe(0)
  })

  it("§5 고립('roundDone'): 그 플레이어의 라운드 마지막 턴이 끝나면 판정, 그 전 턴에는 안 함", () => {
    const line5 = line(...Array.from({ length: 5 }, () => die('red', 1)))
    const iso = board({ ...line5, '1,1': [die('blue', 1)], '1,3': [die('blue', 1)], '2,0': [die('blue', 1)], '2,2': [die('blue', 1)], '2,3': [die('blue', 1)], '2,4': [die('blue', 1)] })
    const run = (circuit: number) => {
      let s = staged(2, [card('isolation', 2)], [iso, board({})])
      const [a, b] = [die('red', 2), die('red', 2)]
      s = { ...s, leadPlayer: 0, currentPlayer: 0, turn: { circuit, picks: 0, hand: [], taken: false, rerolled: false }, market: [[a, b], [die('red', 2), die('red', 2)]] }
      s = take(s, 0)
      s = applyAction(s, { type: 'discard', player: 0, dieId: a.id })
      return applyAction(s, { type: 'discard', player: 0, dieId: b.id })
    }
    expect(run(0).roundGoals[0]?.first).toBeNull()
    expect(run(TURNS_PER_ROUND[2] - 1).roundGoals[0]?.first).toBe(0)
  })

  it.todo(
    '§5 라운드 시작(목표 공개) 때 이미 조건을 갖춘 사람(예: 3라운드 다섯 빛·시간의 지붕·숫자 계단)의 선착 순서 (규칙 모호: 사용자 결정 필요 — 현재 엔진은 그 라운드에 먼저 주사위를 놓은 사람이 선착)',
  )

  it('§5 무작위 전체 진행: 마커는 그 라운드에만 늘고, 한 번 놓인 마커는 사라지지 않는다', () => {
    for (const [seed, n] of [[71, 2], [72, 3], [73, 4]] as const) {
      const states = playRandomly(seed, n)
      for (let i = 1; i < states.length; i++) {
        const prev = states[i - 1] as GameState
        const cur = states[i] as GameState
        for (const [k, c] of prev.roundGoals.entries()) {
          const now = cur.roundGoals[k] as RoundGoalCard
          if (c.first !== null) expect(now.first).toBe(c.first)
          expect(now.achieved.slice(0, c.achieved.length)).toEqual(c.achieved)
          const changed = now.first !== c.first || now.achieved.length !== c.achieved.length
          if (changed) expect(roundOf(prev)).toBe(c.round)
          // 같은 사람이 선착과 달성에 동시에 들어가지 않는다
          if (now.first !== null) expect(now.achieved).not.toContain(now.first)
          expect(new Set(now.achieved).size).toBe(now.achieved.length)
        }
      }
    }
  })
})

// ─── §10 최종 점수에 목표 반영 ──────────────────────────────────────

describe('§10 최종 점수: 목표 점수와 개인 목표', () => {
  function ended(opts: { law?: LawId; personal?: (PersonalGoalId | null)[]; debris?: number[]; goals?: RoundGoalCard[]; boards?: Board[] }): GameState {
    const base = startGame({ playerCount: 2, seed: 1, law: opts.law ?? 'standard' })
    return {
      ...base,
      phase: { kind: 'ended' },
      roundGoals: opts.goals ?? [],
      players: base.players.map((p, i) => ({
        ...p,
        board: opts.boards?.[i] ?? board({}),
        planeScore: 0,
        personalGoal: opts.personal?.[i] ?? null,
        debris: Array.from({ length: opts.debris?.[i] ?? 0 }, (_, k) => ({ id: 9000 + i * 100 + k, color: 'red' as const, layout: STANDARD_LAYOUT })),
      })),
    }
  }
  const scoreOf = (s: GameState, p: number) => finalScores(s).find((x) => x.player === p)

  it('§10 목표 점수 = 라운드 목표 카드에 놓인 내 마커 (선착 4 / 달성 2)', () => {
    const s = ended({ goals: [card('timeSeed', 1, 0, [1]), card('cross', 2, 1, [0])] })
    expect(scoreOf(s, 0)).toMatchObject({ goals: 6, total: 6 })
    expect(scoreOf(s, 1)).toMatchObject({ goals: 6, total: 6 })
  })

  it('§10 개인 목표: 게임 끝 최종 상태로 달성하면 6점', () => {
    const s = ended({ personal: ['cleanHands', 'cleanHands'], debris: [2, 3] })
    expect(scoreOf(s, 0)).toMatchObject({ personalGoal: 6, debris: -2, total: 4 })
    expect(scoreOf(s, 1)).toMatchObject({ personalGoal: 0, debris: -3, total: -3 })
  })

  it('§10 개인 목표: 보드 판정 (시간 지배자)', () => {
    const roof = board({ '0,1': [T()], '0,2': [T()], '0,3': [T()] })
    const s = ended({ personal: ['timeLord', 'timeLord'], boards: [roof, board({ '0,1': [T()] })] })
    expect(scoreOf(s, 0)?.personalGoal).toBe(6)
    expect(scoreOf(s, 1)?.personalGoal).toBe(0)
  })

  it('personalGoalPoints: 고르지 않았으면 0점', () => {
    const s = ended({ personal: [null, null] })
    expect(personalGoalPoints(s.players[0] as never)).toBe(0)
  })

  it('§10 목표·개인 목표 점수가 순위에 반영된다', () => {
    const s = ended({ personal: ['cleanHands', 'redWorship'], goals: [card('timeSeed', 1, 1)] })
    // 0번: 개인 목표 6, 1번: 선착 4
    expect(finalScores(s).map((x) => x.player)).toEqual([0, 1])
  })

  it('§10 + §11-1 최종 1차원 점수에 법칙(공허의 우주)이 반영된다', () => {
    const b = board(line(die('red', 1), die('black', 1), die('red', 1), die('red', 1), die('blue', 1)))
    expect(scoreOf(ended({ law: 'void', boards: [b, board({})] }), 0)?.line).toBe(6)
    expect(scoreOf(ended({ law: 'standard', boards: [b, board({})] }), 0)?.line).toBe(1)
  })

  it('§10 2차원 점수는 확정분을 쓰므로 법칙은 2라운드 끝에 이미 반영되어 있다', () => {
    const states = playRandomly(74, 2, 'mirror')
    const last = states[states.length - 1] as GameState
    const r3 = states.find((s) => roundOf(s) === 3) as GameState
    for (const sc of finalScores(last)) expect(sc.plane).toBe(r3.players[sc.player]?.planeScore)
  })
})
