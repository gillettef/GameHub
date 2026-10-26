import { describe, expect, it } from 'vitest'
import {
  colorsLink,
  LAW_DECK,
  LAWS,
  PERSONAL_GOAL_DECK,
  PERSONAL_GOALS,
  roundGoalDeck,
  ROUND_GOALS,
  type LawId,
  type PersonalGoalId,
  type RoundGoalId,
} from '../cards'
import { isValidOrientation, STANDARD_LAYOUT, TIME, type Face } from '../dice'
import { applyAction, getLegalActions, IllegalActionError, type Action } from '../game'
import { canStackOn, legalCells } from '../placement'
import { createRng, nextInt } from '../rng'
import { colorSegments, planeRegions, scoreLine, scorePlane } from '../scoring'
import { createGame, MARKET_BOARD_SLOTS, marketSlotCount } from '../setup'
import { rollTargets } from '../time'
import type { Board, Color, GameState, PlayerState, RolledDie } from '../types'
import { board, colorsWith, die, line, startGame } from './helpers'

// ─── 공통 도우미 ─────────────────────────────────────────────────────

const take = (s: GameState, slot: number): GameState =>
  applyAction(s, { type: 'takeSlot', player: s.currentPlayer, slot })

const place = (s: GameState, d: RolledDie, row: number, col: number): GameState =>
  applyAction(s, { type: 'place', player: s.currentPlayer, dieId: d.id, row, col })

function withCell(s: GameState, player: number, row: number, col: number, pillar: RolledDie[]): GameState {
  return {
    ...s,
    players: s.players.map((pl) =>
      pl.id === player
        ? { ...pl, board: { cells: pl.board.cells.map((r, ri) => r.map((x, ci) => (ri === row && ci === col ? pillar : x))) } }
        : pl,
    ),
  }
}

/** 시드 RNG로 합법 행동을 무작위 선택해 게임 끝까지 (준비 단계 포함) */
function playRandomly(seed: number, playerCount: number, law: LawId): GameState[] {
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

function countDice(s: GameState): number {
  const onBoards = s.players.reduce((n, p) => n + p.board.cells.flat(2).length, 0)
  const debris = s.players.reduce((n, p) => n + p.debris.length, 0)
  const market = s.market.reduce((n, slot) => n + (slot?.length ?? 0), 0)
  return s.bag.length + market + onBoards + debris + s.turn.hand.length
}

/** 1라운드: 칸을 가져와 그 주사위를 선 가운데(첫 주사위)에 놓는다 */
function takePlace(s0: GameState, slot: number): GameState {
  const s = take(s0, slot)
  return place(s, s.turn.hand[0] as RolledDie, 0, 2)
}

const roundOf = (s: GameState) => (s.phase.kind === 'round' ? s.phase.round : null)

/** 1행 1층 n개를 왼쪽부터 (나머지 칸은 비움) */
const tops = (...faces: Face[]) => board(line(...faces.map((f) => die('red', f))))
const colors = (...cs: Color[]) => board(line(...cs.map((c) => die(c, 1))))

const goalCheck = (id: RoundGoalId, b: Board, law: LawId = 'standard') => ROUND_GOALS[id].check(b, law)

function player(b: Board, debris = 0, timeDice: number | null = null): PlayerState {
  return {
    id: 0,
    board: b,
    debris: Array.from({ length: debris }, (_, k) => ({ id: 9000 + k, colors: colorsWith('red', 1), layout: STANDARD_LAYOUT })),
    lineScore: null,
    planeScore: null,
    towerScore: null,
    timeScore: null,
    personalOffer: [],
    personalGoal: null,
    timeDice,
  }
}
const personal = (id: PersonalGoalId, b: Board, debris = 0, timeDice: number | null = null) =>
  PERSONAL_GOALS[id].check(player(b, debris, timeDice))

/** 높이만 중요한 기둥 (아래부터 1,2,3,... 빨강) */
const pillarOf = (h: number, color: Color = 'red'): RolledDie[] =>
  Array.from({ length: h }, (_, i) => die(color, (Math.min(i + 1, 5) as Face)))

// ─── §11-1 우주 법칙 ─────────────────────────────────────────────────

describe('§11-1 우주 법칙 카드 덱', () => {
  it('§11-1 v0.8 법칙은 8장이고, 영원의 우주·거울 우주를 포함한 8장 모두 덱에 들어간다', () => {
    expect(Object.keys(LAWS)).toHaveLength(8)
    expect([...LAW_DECK].sort()).toEqual(
      ['abundance', 'eternal', 'flat', 'inverted', 'mirror', 'shakyMarket', 'standard', 'void'].sort(),
    )
    for (const id of Object.keys(LAWS) as LawId[]) expect(LAWS[id].inDeck).toBe(true)
  })

  it('§5-1 config.law로 법칙을 고정할 수 있다 (v0.8: 영원의 우주·거울 우주도)', () => {
    expect(createGame({ playerCount: 2, seed: 1, law: 'void' }).law).toBe('void')
    expect(createGame({ playerCount: 2, seed: 1, law: 'eternal' }).law).toBe('eternal')
    expect(createGame({ playerCount: 2, seed: 1, law: 'mirror' }).law).toBe('mirror')
  })

  it('§5-1 법칙을 정하지 않으면 덱에서 1장 뽑는다 (시드마다 결정적, 여러 법칙이 나옴)', { timeout: 30000 }, () => {
    const laws = Array.from({ length: 60 }, (_, seed) => createGame({ playerCount: 2, seed }).law)
    for (const law of laws) expect(LAW_DECK).toContain(law)
    expect(new Set(laws).size).toBe(LAW_DECK.length)
    expect(createGame({ playerCount: 3, seed: 7 }).law).toBe(createGame({ playerCount: 3, seed: 7 }).law)
  })

  it.each(LAW_DECK.map((l) => [l]))('법칙 %s: 무작위 전체 진행에서 주사위 120개 보존, 게임이 끝난다', (law) => {
    for (const [seed, n] of [[101, 2], [102, 4]] as const) {
      const states = playRandomly(seed, n, law)
      for (const s of states) expect(countDice(s)).toBe(120)
      expect(states[states.length - 1]?.phase).toEqual({ kind: 'ended' })
    }
  })
})

describe('§11-1 표준 우주', () => {
  it('§11-1 표준 우주: 쌓기는 기본 오름차순 그대로', () => {
    expect(canStackOn(3, 4, 'standard')).toBe(true)
    expect(canStackOn(3, 3, 'standard')).toBe(false)
    expect(canStackOn(3, 2, 'standard')).toBe(false)
    expect(marketSlotCount(3, 'standard')).toBe(3)
  })
})

describe('§11-1 평평한 우주', () => {
  it('§11-1 평평한 우주: 아래와 같은 숫자도, 큰 숫자도 쌓을 수 있고 작은 숫자는 안 된다', () => {
    expect(canStackOn(3, 3, 'flat')).toBe(true)
    expect(canStackOn(3, 4, 'flat')).toBe(true)
    expect(canStackOn(3, 2, 'flat')).toBe(false)
    expect(canStackOn(5, 5, 'flat')).toBe(true)
    expect(canStackOn(1, 1, 'flat')).toBe(true)
  })

  it('§11-1 평평한 우주에서도 ⧗은 언제나, ⧗ 위는 끝', () => {
    expect(canStackOn(5, TIME, 'flat')).toBe(true)
    expect(canStackOn(TIME, TIME, 'flat')).toBe(false)
    expect(canStackOn(TIME, 1, 'flat')).toBe(false)
  })

  it('§11-1 평평한 우주: 3라운드 legalCells에 같은 숫자 꼭대기 칸이 들어간다', () => {
    const b = board({ '0,0': [die('red', 3)], '0,1': [die('red', 4)], '0,2': [die('red', TIME)] })
    const three = die('blue', 3)
    expect(legalCells(b, 3, three, 'flat')).toEqual([{ row: 0, col: 0 }])
    expect(legalCells(b, 3, three, 'standard')).toEqual([])
  })

  it('§11-1 평평한 우주: 게임 중 3라운드에 같은 숫자 위에 놓을 수 있다 (표준이면 불가)', () => {
    const setup = (law: LawId) => {
      let s = startGame({ playerCount: 2, seed: 3, law })
      s = { ...s, phase: { kind: 'round', round: 3 } }
      s = withCell(s, s.currentPlayer, 0, 0, [die('red', 3)])
      const d = die('blue', 3)
      s = take({ ...s, market: [[d, die('red', 5), die('red', 5)], [die('red', 1), die('red', 1), die('red', 1)]] }, 0)
      return { s, d }
    }
    const flat = setup('flat')
    const p = flat.s.currentPlayer
    const after = place(flat.s, flat.d, 0, 0)
    expect(after.players[p]?.board.cells[0]?.[0]?.map((x) => x.orientation.top)).toEqual([3, 3])
    const std = setup('standard')
    expect(() => place(std.s, std.d, 0, 0)).toThrow(IllegalActionError)
  })
})

describe('§11-1 뒤집힌 우주', () => {
  it('§11-1 뒤집힌 우주: 아래보다 작은 숫자만 쌓을 수 있다', () => {
    expect(canStackOn(4, 3, 'inverted')).toBe(true)
    expect(canStackOn(5, 1, 'inverted')).toBe(true)
    expect(canStackOn(4, 4, 'inverted')).toBe(false)
    expect(canStackOn(4, 5, 'inverted')).toBe(false)
    // 1 위에는 숫자를 올릴 수 없고 ⧗만
    for (const f of [1, 2, 3, 4, 5] as const) expect(canStackOn(1, f, 'inverted')).toBe(false)
    expect(canStackOn(1, TIME, 'inverted')).toBe(true)
  })

  it('§11-1 뒤집힌 우주에서도 ⧗은 언제나, ⧗ 위는 끝', () => {
    expect(canStackOn(2, TIME, 'inverted')).toBe(true)
    expect(canStackOn(TIME, 1, 'inverted')).toBe(false)
    expect(canStackOn(TIME, TIME, 'inverted')).toBe(false)
  })

  it('§11-1 뒤집힌 우주: 3라운드 legalCells는 더 큰 숫자 꼭대기만', () => {
    const b = board({ '0,0': [die('red', 2)], '0,1': [die('red', 4)], '0,2': [die('red', 3)] })
    expect(legalCells(b, 3, die('blue', 3), 'inverted')).toEqual([{ row: 0, col: 1 }])
  })

  it('§9 + §11-1 4라운드 넘기기도 법칙의 쌓기 규칙을 따른다 (해석: 법칙 문구는 "3라운드에"지만 §9가 3라운드 쌓기 규칙을 쓰므로 4라운드에도 적용 — 사용자 확인 필요)', () => {
    // 기준 배치 ⧗ 주사위(앞면 2): forward → 5, back → 2, left → 3, right → 4
    const T = die('red', TIME, 2)
    const b = board({
      '1,2': [T],
      '0,2': [die('red', 3)], // forward: 5를 3 위에
      '2,2': [die('red', 3)], // back: 2를 3 위에
      '1,1': [die('red', 3)], // left: 3을 3 위에
      // right (1,3)은 진공
    })
    const dirs = (law: LawId) => rollTargets(b, { row: 1, col: 2 }, law).map((t) => t.direction).sort()
    expect(dirs('standard')).toEqual(['forward', 'right'])
    expect(dirs('inverted')).toEqual(['back', 'right'])
    expect(dirs('flat')).toEqual(['forward', 'left', 'right'])
  })
})

describe('§11-1 공허의 우주', () => {
  it('colorsLink: 같은 색은 언제나, 검정은 공허의 우주에서만 만능', () => {
    expect(colorsLink('red', 'red', 'standard')).toBe(true)
    expect(colorsLink('red', 'black', 'standard')).toBe(false)
    expect(colorsLink('red', 'black', 'void')).toBe(true)
    expect(colorsLink('black', 'blue', 'void')).toBe(true)
    expect(colorsLink('red', 'blue', 'void')).toBe(false)
  })

  it('§11-1 공허의 우주: 선의 같은 색 연속에서 검정이 이어 준다', () => {
    // 빨강-검정-빨강-빨강 = 4칸 연속, 표준이면 빨강 2칸이 가장 긺
    const b = colors('red', 'black', 'red', 'red', 'blue')
    expect(scoreLine(b, 'void').total).toBe(4)
    expect(scoreLine(b, 'standard').total).toBe(2)
  })

  it('§11-1 공허의 우주 (해석: 검정 칸은 양쪽 색 구간에 모두 속할 수 있다)', () => {
    // 빨강빨강[검정]파랑파랑 → 빨강 3칸 + 파랑 3칸
    expect(colorSegments(['red', 'red', 'black', 'blue', 'blue'], 'void').sort()).toEqual([3, 3])
    expect(scoreLine(colors('red', 'red', 'black', 'blue', 'blue'), 'void').total).toBe(3)
    // 검정만 5칸 = 5칸 연속
    expect(colorSegments(['black', 'black', 'black', 'black', 'black'], 'void')).toEqual([5])
    // 검정 구간이 빨강 구간 안에 들어가면 따로 세지 않는다
    expect(colorSegments(['black', 'black', 'red', undefined, 'blue'], 'void').sort()).toEqual([1, 3])
    // 빈 칸에서는 끊긴다
    expect(colorSegments(['red', 'black', undefined, 'black', 'red'], 'void').sort()).toEqual([2, 2])
  })

  it('§11-1 공허의 우주: 평면 영역에서 검정이 여러 색 영역에 함께 속한다 (해석)', () => {
    const b = board({
      '0,0': [die('red', 1)],
      '0,1': [die('red', 1)],
      '1,1': [die('black', 1)],
      '1,2': [die('blue', 1)],
      '2,2': [die('blue', 1)],
    })
    expect(planeRegions(b, 'void').sort()).toEqual([3, 3])
    expect(scorePlane(b, 'void').total).toBe(3)
    expect(scorePlane(b, 'standard').total).toBe(2)
  })

  it('§11-1 공허의 우주: 다른 색과 맞닿지 않은 검정만의 무리도 영역이다', () => {
    const alone = board({ '2,2': [die('black', 1)], '2,3': [die('black', 1)], '2,4': [die('black', 1)] })
    expect(planeRegions(alone, 'void')).toEqual([3])
    // 빨강에 붙은 검정 무리는 빨강 영역에만 들어간다
    const touching = board({ '0,0': [die('red', 1)], '0,1': [die('black', 1)], '0,2': [die('black', 1)] })
    expect(planeRegions(touching, 'void')).toEqual([3])
  })

  it('§7 + §11-1 2라운드 확정 점수에 공허의 우주가 반영된다', () => {
    const states = playRandomly(56, 3, 'void')
    const r3 = states.find((s) => roundOf(s) === 3) as GameState
    for (const p of r3.players) expect(p.planeScore).toBe(scorePlane(p.board, 'void').total)
  })
})

describe('§11-1 흔들리는 시장', () => {
  const shaky = () => startGame({ playerCount: 3, seed: 21, law: 'shakyMarket' })

  it('§11-1 흔들리는 시장: 가져오기 전 시장 주사위 1개를 다시 굴린다 (id·색·배치 유지, 방향만 새로)', () => {
    const s = shaky()
    const d = s.market[1]?.[0] as RolledDie
    const after = applyAction(s, { type: 'reroll', player: s.currentPlayer, slot: 1, dieId: d.id })
    const rolled = after.market[1]?.[0] as RolledDie
    expect({ id: rolled.id, colors: rolled.colors, layout: rolled.layout }).toEqual({ id: d.id, colors: d.colors, layout: d.layout })
    expect(isValidOrientation(rolled.layout, rolled.orientation)).toBe(true)
    expect(after.rng).not.toEqual(s.rng)
    expect(after.turn.rerolled).toBe(true)
    // 다른 칸은 그대로
    expect(after.market[0]).toEqual(s.market[0])
    // 결정적
    expect(applyAction(s, { type: 'reroll', player: s.currentPlayer, slot: 1, dieId: d.id })).toEqual(after)
  })

  it('§11-1 흔들리는 시장: 턴마다 1회만', () => {
    const s = shaky()
    const d = s.market[0]?.[0] as RolledDie
    const e = s.market[1]?.[0] as RolledDie
    const after = applyAction(s, { type: 'reroll', player: s.currentPlayer, slot: 0, dieId: d.id })
    expect(() => applyAction(after, { type: 'reroll', player: s.currentPlayer, slot: 1, dieId: e.id })).toThrow(
      IllegalActionError,
    )
    expect(getLegalActions(after).every((a) => a.type === 'takeSlot')).toBe(true)
  })

  it('§11-1 흔들리는 시장: 가져온 뒤에는 다시 굴릴 수 없다', () => {
    const s = take(shaky(), 0)
    const e = s.market[1]?.[0] as RolledDie
    expect(() => applyAction(s, { type: 'reroll', player: s.currentPlayer, slot: 1, dieId: e.id })).toThrow(
      IllegalActionError,
    )
  })

  it('§11-1 흔들리는 시장: 다음 사람의 턴에는 다시 1회 쓸 수 있다', () => {
    let s = shaky()
    s = applyAction(s, { type: 'reroll', player: s.currentPlayer, slot: 0, dieId: s.market[0]?.[0]?.id as number })
    s = take(s, 0)
    s = place(s, s.turn.hand[0] as RolledDie, 0, 2)
    expect(s.turn.rerolled).toBe(false)
    expect(getLegalActions(s).some((a) => a.type === 'reroll')).toBe(true)
    const e = s.market[1]?.[0] as RolledDie
    expect(() => applyAction(s, { type: 'reroll', player: s.currentPlayer, slot: 1, dieId: e.id })).not.toThrow()
  })

  it('§11-1 흔들리는 시장: 이미 가져간 칸·없는 주사위·남의 차례는 안 된다', () => {
    let s = shaky()
    const gone = s.market[0]?.[0] as RolledDie
    s = place(take(s, 0), gone, 0, 2)
    expect(() => applyAction(s, { type: 'reroll', player: s.currentPlayer, slot: 0, dieId: gone.id })).toThrow(
      IllegalActionError,
    )
    const e = s.market[1]?.[0] as RolledDie
    expect(() => applyAction(s, { type: 'reroll', player: s.currentPlayer, slot: 2, dieId: e.id })).toThrow(
      IllegalActionError,
    )
    const other = (s.currentPlayer + 1) % 3
    expect(() => applyAction(s, { type: 'reroll', player: other, slot: 1, dieId: e.id })).toThrow(IllegalActionError)
  })

  it('§11-1 다른 법칙에서는 다시 굴릴 수 없고, 합법 행동에도 없다', () => {
    const s = startGame({ playerCount: 3, seed: 21, law: 'standard' })
    const d = s.market[0]?.[0] as RolledDie
    expect(() => applyAction(s, { type: 'reroll', player: s.currentPlayer, slot: 0, dieId: d.id })).toThrow(
      IllegalActionError,
    )
    expect(getLegalActions(s).some((a) => a.type === 'reroll')).toBe(false)
  })

  it('§11-1 흔들리는 시장: 합법 행동에 시장 주사위마다 다시 굴리기가 있다 (2라운드: 칸마다 2개)', () => {
    const states = playRandomly(57, 3, 'shakyMarket')
    const r2 = states.find((s) => roundOf(s) === 2 && s.turn.picks === 0 && !s.turn.taken) as GameState
    expect(getLegalActions(r2).filter((a) => a.type === 'reroll')).toHaveLength(6)
  })

  it('§11-1 흔들리는 시장은 1~3라운드만: 4라운드에는 다시 굴릴 수 없다', () => {
    const states = playRandomly(58, 2, 'shakyMarket')
    const r4 = states.find((s) => roundOf(s) === 4)
    if (!r4) return
    expect(() => applyAction(r4, { type: 'reroll', player: r4.currentPlayer, slot: 0, dieId: 0 })).toThrow(
      IllegalActionError,
    )
    expect(getLegalActions(r4).some((a) => a.type === 'reroll')).toBe(false)
  })
})

describe('§11-1 풍요의 우주', () => {
  it('§11-1 풍요의 우주: 시장 칸 = 플레이어 수 + 1', () => {
    expect(marketSlotCount(2, 'abundance')).toBe(3)
    expect(marketSlotCount(4, 'abundance')).toBe(MARKET_BOARD_SLOTS)
    for (const n of [2, 3, 4]) {
      const s = createGame({ playerCount: n, seed: 1, law: 'abundance' })
      expect(s.market).toHaveLength(n + 1)
      expect(s.bag).toHaveLength(120 - (n + 1))
    }
  })

  it('§11-1 풍요의 우주: 바퀴 끝 마지막 사람도 칸을 고를 수 있다 (남은 칸 2개)', () => {
    let s = startGame({ playerCount: 2, seed: 31, law: 'abundance' })
    s = takePlace(s, 0)
    expect(getLegalActions(s).filter((a) => a.type === 'takeSlot')).toHaveLength(2)
  })

  it('§11-1 풍요의 우주: 바퀴가 끝나고 남은 칸의 주사위는 주머니로 돌아간다 (방향 없이)', () => {
    let s = startGame({ playerCount: 2, seed: 31, law: 'abundance' })
    const leftover = s.market[2]?.[0] as RolledDie
    const bagBefore = s.bag.length
    s = takePlace(s, 0)
    s = takePlace(s, 1)
    expect(s.turn.circuit).toBe(1)
    const back = s.bag.find((d) => d.id === leftover.id)
    const inMarket = s.market.flatMap((m) => m ?? []).find((d) => d.id === leftover.id)
    // 새 시장에 다시 뽑혔을 수도 있으니 둘 중 한 곳에 있어야 한다
    expect(back ?? inMarket).toBeDefined()
    if (back) expect('orientation' in back).toBe(false)
    expect(s.market).toHaveLength(3)
    expect(s.market.every((m) => m?.length === 1)).toBe(true)
    expect(s.bag.length).toBe(bagBefore + 1 - 3)
    expect(countDice(s)).toBe(120)
  })

  it('§11-1 풍요의 우주: 라운드가 바뀔 때도 남은 칸은 주머니로 (2라운드 시장 칸마다 2개, 4칸)', () => {
    const states = playRandomly(59, 3, 'abundance')
    const r2 = states.find((s) => roundOf(s) === 2) as GameState
    expect(r2.market.map((m) => m?.length)).toEqual([2, 2, 2, 2])
    const r3 = states.find((s) => roundOf(s) === 3) as GameState
    expect(r3.market.map((m) => m?.length)).toEqual([3, 3, 3, 3])
    expect(countDice(r3)).toBe(120)
  })

  it('§11-1 다른 법칙에서는 바퀴 끝에 남는 칸이 없다', () => {
    let s = startGame({ playerCount: 2, seed: 31, law: 'standard' })
    expect(s.market).toHaveLength(2)
    const bagBefore = s.bag.length
    s = takePlace(s, 0)
    s = takePlace(s, 1)
    expect(s.bag.length).toBe(bagBefore - 2)
  })
})

// ─── §11-2 라운드 목표 ───────────────────────────────────────────────

describe('§11-2 라운드 목표 카드 덱', () => {
  it('§11-2 v0.8 1·2·3·4라운드 각 8장, 모두 32장 (§4)', () => {
    expect(roundGoalDeck(1)).toHaveLength(8)
    expect(roundGoalDeck(2)).toHaveLength(8)
    expect(roundGoalDeck(3)).toHaveLength(8)
    expect([...roundGoalDeck(4)].sort()).toEqual(
      ['colorRiver', 'crown', 'evenHorizon', 'filledSky', 'frontRainbow', 'horizonStairs', 'mirrorHorizon', 'twoContinents'].sort(),
    )
    expect(Object.keys(ROUND_GOALS)).toHaveLength(32)
    for (const id of Object.keys(ROUND_GOALS) as RoundGoalId[]) expect(ROUND_GOALS[id].id).toBe(id)
  })

  it('판정 시점: 1~3라운드는 고립만 라운드를 마친 뒤(roundDone), 4라운드 목표 8장은 모두 roundDone (§5)', () => {
    const done = (Object.keys(ROUND_GOALS) as RoundGoalId[]).filter((id) => ROUND_GOALS[id].when === 'roundDone')
    expect(done.filter((id) => ROUND_GOALS[id].round !== 4)).toEqual(['isolation'])
    expect(done.filter((id) => ROUND_GOALS[id].round === 4).sort()).toEqual([...roundGoalDeck(4)].sort())
  })
})

describe('§11-2 1라운드 목표 (선의 윗면·색)', () => {
  it('거울: 1·5번, 2·4번 칸의 윗면이 각각 같음', () => {
    expect(goalCheck('mirror', tops(1, 2, 3, 2, 1))).toBe(true)
    expect(goalCheck('mirror', tops(4, 5, 1, 5, 4))).toBe(true)
    expect(goalCheck('mirror', tops(1, 2, 3, 2, 5))).toBe(false)
    expect(goalCheck('mirror', tops(1, 2, 3, 4, 1))).toBe(false)
    // 선이 덜 찼으면 미달성
    expect(goalCheck('mirror', board({ '0,2': [die('red', 3)] }))).toBe(false)
  })

  it('§11-2 v0.8 거울: ⧗은 숫자가 아니라 1·5번이 모두 ⧗이어도 안 된다', () => {
    expect(goalCheck('mirror', tops(TIME, 2, 3, 2, TIME))).toBe(false)
    expect(goalCheck('mirror', tops(1, TIME, 3, TIME, 1))).toBe(false)
    // 가운데(3번)는 ⧗이어도 상관없다
    expect(goalCheck('mirror', tops(1, 2, TIME, 2, 1))).toBe(true)
  })

  it('무지개: 선의 5칸이 모두 다른 색', () => {
    expect(goalCheck('rainbow', colors('red', 'blue', 'green', 'yellow', 'black'))).toBe(true)
    expect(goalCheck('rainbow', colors('red', 'blue', 'green', 'yellow', 'red'))).toBe(false)
    expect(goalCheck('rainbow', board(line(die('red', 1), die('blue', 1), die('green', 1), die('yellow', 1))))).toBe(false)
  })

  it('계단: 윗면이 1씩 오르거나 내리는 연속 4칸', () => {
    expect(goalCheck('stairs', tops(1, 2, 3, 4, TIME))).toBe(true)
    expect(goalCheck('stairs', tops(5, 4, 3, 2, 1))).toBe(true)
    expect(goalCheck('stairs', tops(5, 2, 3, 4, 5))).toBe(true)
    // 1-2-3-2-1은 3칸 + 3칸이지 4칸 연속이 아니다
    expect(goalCheck('stairs', tops(1, 2, 3, 2, 1))).toBe(false)
    // ⧗에서 끊김
    expect(goalCheck('stairs', tops(1, 2, TIME, 3, 4))).toBe(false)
  })

  it('거인의 길: 윗면 합 18 이상 (⧗은 0)', () => {
    expect(goalCheck('giantPath', tops(5, 5, 4, 4, TIME))).toBe(true)
    expect(goalCheck('giantPath', tops(5, 5, 4, 3, TIME))).toBe(false)
    expect(goalCheck('giantPath', tops(5, 5, 5, 5, 5))).toBe(true)
  })

  it('홀짝: 홀수와 짝수가 번갈아 5칸', () => {
    expect(goalCheck('oddEven', tops(1, 2, 3, 4, 5))).toBe(true)
    expect(goalCheck('oddEven', tops(2, 5, 4, 1, 2))).toBe(true)
    expect(goalCheck('oddEven', tops(1, 2, 3, 4, 4))).toBe(false)
    expect(goalCheck('oddEven', board(line(die('red', 1), die('red', 2), die('red', 3), die('red', 4))))).toBe(false)
  })

  it('홀짝 (해석: ⧗은 홀수도 짝수도 아니므로 끊긴다)', () => {
    expect(goalCheck('oddEven', tops(1, 2, TIME, 4, 5))).toBe(false)
  })

  it('삼둥이: 윗면이 같은 주사위 3개 (이웃하지 않아도 됨)', () => {
    expect(goalCheck('triplets', tops(3, 1, 3, 5, 3))).toBe(true)
    expect(goalCheck('triplets', tops(3, 3, 1, 1, 5))).toBe(false)
  })

  it('§11-2 v0.8 삼둥이: ⧗ 제외 — ⧗ 3개는 안 되고, ⧗이 섞여도 같은 숫자 3개면 된다', () => {
    expect(goalCheck('triplets', tops(TIME, TIME, TIME, 1, 2))).toBe(false)
    expect(goalCheck('triplets', tops(TIME, 2, TIME, 2, 2))).toBe(true)
  })

  it('시간의 씨앗: 선에 ⧗ 2개 이상', () => {
    expect(goalCheck('timeSeed', tops(TIME, 1, TIME, 2, 3))).toBe(true)
    expect(goalCheck('timeSeed', tops(TIME, 1, 4, 2, 3))).toBe(false)
    // 선이 다 차지 않아도 ⧗ 2개면 달성
    expect(goalCheck('timeSeed', board({ '0,2': [die('red', TIME)], '0,3': [die('red', TIME)] }))).toBe(true)
  })

  it('낮은 대지: ⧗ 없이 윗면 합 10 이하', () => {
    expect(goalCheck('lowLand', tops(1, 1, 2, 3, 3))).toBe(true)
    expect(goalCheck('lowLand', tops(1, 1, 2, 3, 4))).toBe(false)
    expect(goalCheck('lowLand', tops(1, 1, 1, 1, TIME))).toBe(false)
  })

  it('낮은 대지 (해석: 선 5칸이 다 찬 뒤에 판정)', () => {
    expect(goalCheck('lowLand', board({ '0,2': [die('red', 1)] }))).toBe(false)
  })

  it('1라운드 목표는 선 1층만 본다 (위에 쌓인 주사위는 무관)', () => {
    const b = tops(1, 2, 3, 2, 1)
    b.cells[0]?.[0]?.push(die('red', 5))
    expect(goalCheck('mirror', b)).toBe(true)
  })
})

describe('§11-2 2라운드 목표 (평면)', () => {
  it('십자가: 상하좌우 4칸이 모두 채워진 주사위 1개', () => {
    const cross = { '1,2': [die('red', 1)], '0,2': [die('red', 1)], '2,2': [die('red', 1)], '1,1': [die('red', 1)], '1,3': [die('red', 1)] }
    expect(goalCheck('cross', board(cross))).toBe(true)
    expect(goalCheck('cross', board({ ...cross, '1,3': [] }))).toBe(false)
    // 가장자리 칸은 이웃이 4개가 아니므로 불가
    const full = Object.fromEntries(
      [0, 1, 2].flatMap((row) => [0, 4].map((col) => [`${row},${col}`, [die('red', 1)]])),
    )
    expect(goalCheck('cross', board({ ...full, '0,1': [die('red', 1)], '2,1': [die('red', 1)] }))).toBe(false)
  })

  it('기둥 색: 한 세로줄 3칸이 모두 같은 색', () => {
    expect(goalCheck('columnColor', board({ '0,4': [die('green', 1)], '1,4': [die('green', 2)], '2,4': [die('green', 3)] }))).toBe(true)
    expect(goalCheck('columnColor', board({ '0,4': [die('green', 1)], '1,4': [die('blue', 2)], '2,4': [die('green', 3)] }))).toBe(false)
    expect(goalCheck('columnColor', board({ '0,4': [die('green', 1)], '1,4': [die('green', 2)] }))).toBe(false)
  })

  it('계단 사슬: 윗면 1 차이 이웃 쌍 3개', () => {
    const b = { '0,0': [die('red', 1)], '1,0': [die('red', 2)], '2,0': [die('red', 3)], '2,1': [die('red', 4)] }
    expect(goalCheck('stepChain', board(b))).toBe(true)
    expect(goalCheck('stepChain', board({ ...b, '2,1': [] }))).toBe(false)
    // 선 안의 가로 쌍은 이웃 계단이 아니다 (§7)
    expect(goalCheck('stepChain', tops(1, 2, 3, 4, 5))).toBe(false)
  })

  it('계단 사슬: 게임 상태의 보드로 달성을 판정한다', () => {
    let s = startGame({ playerCount: 2, seed: 1 })
    s = { ...s, phase: { kind: 'round', round: 2 }, roundGoals: [{ id: 'stepChain', round: 2, first: null, achieved: [] }] }
    s = withCell(s, 0, 0, 0, [die('red', 1)])
    s = withCell(s, 0, 1, 0, [die('red', 2)])
    s = withCell(s, 0, 2, 0, [die('red', 3)])
    s = withCell(s, 0, 2, 1, [die('red', 4)])
    expect(goalCheck('stepChain', s.players[0]?.board as Board)).toBe(true)
  })

  it('대륙: 크기 6 이상의 영역 (선 포함)', () => {
    const red5 = line(...Array.from({ length: 5 }, () => die('red', 1)))
    expect(goalCheck('continent', board({ ...red5, '1,0': [die('red', 2)] }))).toBe(true)
    expect(goalCheck('continent', board(red5))).toBe(false)
    expect(goalCheck('continent', board({ ...red5, '1,0': [die('blue', 2)] }))).toBe(false)
  })

  it('§11-1 공허의 우주는 목표 카드에 적용하지 않는다 (v0.8): 기둥 색·대륙에서 검정은 만능이 아님', () => {
    const b = board({ '0,0': [die('red', 1)], '1,0': [die('black', 2)], '2,0': [die('red', 3)] })
    expect(goalCheck('columnColor', b, 'void')).toBe(false)
    const red5 = line(...Array.from({ length: 5 }, () => die('red', 1)))
    expect(goalCheck('continent', board({ ...red5, '1,0': [die('black', 2)] }), 'void')).toBe(false)
  })

  it('뿌리: 2·3행 주사위 중 같은 열 선 주사위와 색이 같은 것 3개', () => {
    const base = line(die('red', 1), die('blue', 1), die('green', 1), die('yellow', 1), die('black', 1))
    expect(goalCheck('roots', board({ ...base, '1,0': [die('red', 2)], '2,0': [die('red', 2)], '1,1': [die('blue', 2)] }))).toBe(true)
    expect(goalCheck('roots', board({ ...base, '1,0': [die('red', 2)], '2,0': [die('red', 2)], '1,1': [die('green', 2)] }))).toBe(false)
  })

  it('작은 씨앗: 2·3행에 윗면 1인 주사위 3개 (선의 1은 세지 않음)', () => {
    expect(goalCheck('smallSeed', board({ '1,0': [die('red', 1)], '2,0': [die('red', 1)], '1,4': [die('red', 1)] }))).toBe(true)
    const ones = line(...Array.from({ length: 5 }, () => die('red', 1)))
    expect(goalCheck('smallSeed', board({ ...ones, '1,0': [die('red', 1)], '1,1': [die('red', 1)] }))).toBe(false)
    expect(goalCheck('smallSeed', board({ '1,0': [die('red', 1)], '2,0': [die('red', 1)], '1,4': [die('red', 2)] }))).toBe(false)
  })

  it('모자이크: 2×2 구역 하나가 서로 다른 색 4개', () => {
    const quad = (c: [Color, Color, Color, Color]) =>
      board({ '1,1': [die(c[0], 1)], '1,2': [die(c[1], 1)], '2,1': [die(c[2], 1)], '2,2': [die(c[3], 1)] })
    expect(goalCheck('mosaic', quad(['red', 'blue', 'green', 'black']))).toBe(true)
    expect(goalCheck('mosaic', quad(['red', 'blue', 'green', 'red']))).toBe(false)
    expect(goalCheck('mosaic', board({ '1,1': [die('red', 1)], '1,2': [die('blue', 1)], '2,1': [die('green', 1)] }))).toBe(false)
    // 선과 2행에 걸친 구역도 된다
    expect(goalCheck('mosaic', board({ '0,0': [die('red', 1)], '0,1': [die('blue', 1)], '1,0': [die('green', 1)], '1,1': [die('yellow', 1)] }))).toBe(true)
  })

  it('고립: 진공 칸들이 서로 하나도 맞닿지 않음', () => {
    const line5 = line(...Array.from({ length: 5 }, () => die('red', 1)))
    // 진공: (1,0) (1,2) (1,4) (2,1)
    const ok = board({ ...line5, '1,1': [die('blue', 1)], '1,3': [die('blue', 1)], '2,0': [die('blue', 1)], '2,2': [die('blue', 1)], '2,3': [die('blue', 1)], '2,4': [die('blue', 1)] })
    expect(goalCheck('isolation', ok)).toBe(true)
    // 진공 (1,0)과 (2,0)이 맞닿음
    const bad = board({ ...line5, '1,1': [die('blue', 1)], '1,2': [die('blue', 1)], '1,3': [die('blue', 1)], '1,4': [die('blue', 1)], '2,2': [die('blue', 1)], '2,4': [die('blue', 1)] })
    expect(goalCheck('isolation', bad)).toBe(false)
    // 평면이 비어 있으면 진공이 모두 맞닿아 있다
    expect(goalCheck('isolation', board(line5))).toBe(false)
  })
})

describe('§11-2 3라운드 목표 (탑)', () => {
  it('마천루: 5층 이상 기둥 1개', () => {
    expect(goalCheck('skyscraper', board({ '1,1': pillarOf(5) }))).toBe(true)
    expect(goalCheck('skyscraper', board({ '1,1': pillarOf(4), '1,2': pillarOf(4) }))).toBe(false)
  })

  it('쌍둥이 탑: 높이가 같은 3층 이상 기둥 2개가 변으로 맞닿음', () => {
    expect(goalCheck('twinTowers', board({ '0,0': pillarOf(3), '0,1': pillarOf(3) }))).toBe(true)
    expect(goalCheck('twinTowers', board({ '1,0': pillarOf(4), '2,0': pillarOf(4) }))).toBe(true)
    expect(goalCheck('twinTowers', board({ '0,0': pillarOf(3), '1,1': pillarOf(3) }))).toBe(false) // 대각선
    expect(goalCheck('twinTowers', board({ '0,0': pillarOf(3), '0,1': pillarOf(4) }))).toBe(false)
    expect(goalCheck('twinTowers', board({ '0,0': pillarOf(2), '0,1': pillarOf(2) }))).toBe(false)
  })

  it('단색 탑: 모두 같은 색인 3층 이상 기둥', () => {
    expect(goalCheck('monoTower', board({ '0,0': pillarOf(3, 'yellow') }))).toBe(true)
    expect(goalCheck('monoTower', board({ '0,0': [die('red', 1), die('red', 2), die('blue', 3)] }))).toBe(false)
    expect(goalCheck('monoTower', board({ '0,0': pillarOf(2, 'yellow') }))).toBe(false)
  })

  it('숫자 계단: 맨 앞줄 꼭대기 앞면 연속 4칸 이상, 그 4칸에 2층 이상 기둥이 하나 이상 (v0.8)', () => {
    // 맨 앞줄 꼭대기 앞면 1-2-3-4-⧗. 2열은 2층 기둥(꼭대기 앞면 2)
    const top = (f: Face) => (f === 1 ? die('red', 2, 1) : f === TIME ? die('red', 2, TIME) : die('red', 1, f))
    const front = (...fs: Face[]) => {
      const b = board(line(...fs.map(top)))
      const row0 = b.cells[0] as RolledDie[][]
      row0[1] = [die('blue', 1), top(fs[1] as Face)]
      return b
    }
    expect(goalCheck('numberStairs', front(1, 2, 3, 4, TIME))).toBe(true)
    expect(goalCheck('numberStairs', front(1, 2, 3, TIME, 5))).toBe(false)
    // 선 앞면만으로는 안 됨 (3라운드 시작 때 이미 달성 방지)
    expect(goalCheck('numberStairs', board(line(...([1, 2, 3, 4, TIME] as Face[]).map(top))))).toBe(false)
    // 내림차순도 됨
    expect(goalCheck('numberStairs', front(5, 4, 3, 2, TIME))).toBe(true)
    // 윗면이 아니라 앞면을 본다: 윗면 1-2-3-4는 상관없음
    expect(goalCheck('numberStairs', board(line(die('red', 1, 5), die('red', 2, 1), die('red', 3, 1), die('red', 4, 1))))).toBe(false)
  })

  it('피라미드: 가운데(3열)가 가장 높고, 바깥으로 갈수록 높아지지 않음', () => {
    const cols = (...hs: number[]) => board(Object.fromEntries(hs.flatMap((h, col) => (h > 0 ? [[`0,${col}`, pillarOf(h)]] : []))))
    expect(goalCheck('pyramid', cols(1, 2, 3, 2, 1))).toBe(true)
    expect(goalCheck('pyramid', cols(1, 1, 2, 1, 1))).toBe(true)
    expect(goalCheck('pyramid', cols(0, 2, 3, 1, 0))).toBe(true)
    expect(goalCheck('pyramid', cols(2, 2, 2, 2, 2))).toBe(false)
    expect(goalCheck('pyramid', cols(1, 3, 2, 1, 1))).toBe(false)
    expect(goalCheck('pyramid', cols(2, 1, 3, 1, 1))).toBe(false) // 바깥으로 가며 다시 높아짐
    // 열별 최고 높이: 뒷줄 기둥도 그 열의 높이가 된다
    expect(goalCheck('pyramid', board({ '0,1': pillarOf(1), '2,2': pillarOf(2), '0,3': pillarOf(1) }))).toBe(true)
  })

  it('§11-2 v0.8 피라미드: 가운데(3열)가 혼자 가장 높아야 한다 (옆 열과 같은 높이는 안 됨)', () => {
    const cols = (...hs: number[]) => board(Object.fromEntries(hs.flatMap((h, col) => (h > 0 ? [[`0,${col}`, pillarOf(h)]] : []))))
    expect(goalCheck('pyramid', cols(1, 3, 3, 3, 1))).toBe(false)
    expect(goalCheck('pyramid', cols(1, 3, 3, 2, 1))).toBe(false)
    expect(goalCheck('pyramid', cols(3, 3, 3, 3, 1))).toBe(false)
    // 바깥 두 열끼리 같은 높이는 괜찮다
    expect(goalCheck('pyramid', cols(2, 2, 3, 2, 2))).toBe(true)
    expect(goalCheck('pyramid', cols(0, 0, 1, 0, 0))).toBe(true)
    expect(goalCheck('pyramid', cols(3, 2, 4, 2, 1))).toBe(false) // 바깥으로 가며 다시 높아짐
  })

  it('§11-2 v0.8 다섯 빛: 2층 이상 기둥의 꼭대기 색이 5색 모두 있음 (1층짜리·덮인 주사위는 무관)', () => {
    // 1층 주사위만으로는 안 된다
    expect(goalCheck('fiveLights', colors('red', 'blue', 'green', 'yellow', 'black'))).toBe(false)
    const stacked = (cs: Color[]) =>
      board(Object.fromEntries(cs.map((c, col) => [`0,${col}`, [die('black', 1), die(c, 2)]])))
    expect(goalCheck('fiveLights', stacked(['red', 'blue', 'green', 'yellow', 'black']))).toBe(true)
    // 4색은 2층 이상, 검정은 1층 → 안 됨
    const mixed = board({
      '0,0': [die('red', 1), die('red', 2)],
      '0,1': [die('red', 1), die('blue', 2)],
      '0,2': [die('red', 1), die('green', 2)],
      '0,3': [die('red', 1), die('yellow', 2)],
      '0,4': [die('black', 1)],
    })
    expect(goalCheck('fiveLights', mixed)).toBe(false)
    // 덮인 검정은 무관
    const covered = board({
      '0,0': [die('red', 1), die('red', 2)],
      '0,1': [die('red', 1), die('blue', 2)],
      '0,2': [die('red', 1), die('green', 2)],
      '0,3': [die('red', 1), die('yellow', 2)],
      '0,4': [die('red', 1), die('black', 2), die('red', 3)],
    })
    expect(goalCheck('fiveLights', covered)).toBe(false)
  })

  it('완벽한 계단: 아래부터 1·2·3·4·5가 차례로 쌓인 기둥 (1층 포함)', () => {
    expect(goalCheck('perfectStairs', board({ '1,1': pillarOf(5) }))).toBe(true)
    expect(goalCheck('perfectStairs', board({ '1,1': [...pillarOf(5), die('red', TIME)] }))).toBe(true)
    expect(goalCheck('perfectStairs', board({ '1,1': [die('red', 2), die('red', 3), die('red', 4), die('red', 5)] }))).toBe(false)
    expect(goalCheck('perfectStairs', board({ '1,1': [die('red', 1), die('red', 2), die('red', 3), die('red', 5)] }))).toBe(false)
  })

  it('§11-2 v0.8 시간의 지붕: 2층 이상 기둥의 꼭대기 ⧗ 3개 이상 (1층 ⧗은 무관)', () => {
    const T = () => die('red', TIME)
    const up = () => [die('red', 1), T()]
    expect(goalCheck('timeRoof', board({ '0,0': up(), '1,1': up(), '2,4': up() }))).toBe(true)
    expect(goalCheck('timeRoof', board({ '0,0': [die('red', 1), die('red', 2), T()], '1,1': up(), '2,4': up() }))).toBe(true)
    // 1층 ⧗은 세지 않는다
    expect(goalCheck('timeRoof', board({ '0,0': [T()], '1,1': up(), '2,4': [T()] }))).toBe(false)
    expect(goalCheck('timeRoof', board({ '0,0': [T()], '0,1': [T()], '0,2': [T()], '0,3': [T()] }))).toBe(false)
    expect(goalCheck('timeRoof', board({ '0,0': up(), '1,1': up() }))).toBe(false)
  })

  it('§11-2 v0.8 완벽한 계단: 뒤집힌 우주에서는 아래부터 5·4·3·2·1', () => {
    const down = () => [5, 4, 3, 2, 1].map((f) => die('red', f as Face))
    expect(goalCheck('perfectStairs', board({ '1,1': down() }), 'inverted')).toBe(true)
    expect(goalCheck('perfectStairs', board({ '1,1': [...down(), die('red', TIME)] }), 'inverted')).toBe(true)
    expect(goalCheck('perfectStairs', board({ '1,1': down() }), 'standard')).toBe(false)
    expect(goalCheck('perfectStairs', board({ '1,1': pillarOf(5) }), 'inverted')).toBe(false)
    expect(goalCheck('perfectStairs', board({ '1,1': down().slice(1) }), 'inverted')).toBe(false)
    // 다른 법칙은 1·2·3·4·5 그대로
    expect(goalCheck('perfectStairs', board({ '1,1': pillarOf(5) }), 'flat')).toBe(true)
  })
})

// ─── §11-3 개인 목표 ─────────────────────────────────────────────────

describe('§11-3 개인 목표 카드 (게임 끝 최종 상태)', () => {
  it('§11-3 개인 목표는 10장', () => {
    expect(PERSONAL_GOAL_DECK).toHaveLength(10)
    for (const id of PERSONAL_GOAL_DECK) expect(PERSONAL_GOALS[id].id).toBe(id)
  })

  it('빨강 숭배: 꼭대기 빨강 3개 이상 (덮인 빨강은 무관)', () => {
    expect(personal('redWorship', board({ '0,0': [die('red', 1)], '1,1': [die('blue', 1), die('red', 2)], '2,2': [die('red', 1)] }))).toBe(true)
    expect(personal('redWorship', board({ '0,0': [die('red', 1)], '1,1': [die('red', 1), die('blue', 2)], '2,2': [die('red', 1)] }))).toBe(false)
  })

  it('바다의 탑: 파랑만으로 된 3층 이상 기둥', () => {
    expect(personal('seaTower', board({ '1,1': pillarOf(3, 'blue') }))).toBe(true)
    expect(personal('seaTower', board({ '1,1': [die('blue', 1), die('blue', 2), die('red', 3)] }))).toBe(false)
    expect(personal('seaTower', board({ '1,1': pillarOf(2, 'blue') }))).toBe(false)
  })

  it('숲의 지붕: 꼭대기 초록이 변으로 이어진 3개', () => {
    expect(personal('forestRoof', board({ '0,0': [die('green', 1)], '0,1': [die('green', 1)], '1,1': [die('red', 1), die('green', 2)] }))).toBe(true)
    expect(personal('forestRoof', board({ '0,0': [die('green', 1)], '0,1': [die('green', 1)], '0,3': [die('green', 1)] }))).toBe(false)
    // 덮인 초록은 꼭대기가 아니다
    expect(personal('forestRoof', board({ '0,0': [die('green', 1)], '0,1': [die('green', 1)], '0,2': [die('green', 1), die('red', 2)] }))).toBe(false)
  })

  it('빛의 정면: 맨 앞줄 꼭대기 중 노랑 2개 이상', () => {
    expect(personal('lightFront', board({ '0,0': [die('yellow', 1)], '0,4': [die('red', 1), die('yellow', 2)] }))).toBe(true)
    expect(personal('lightFront', board({ '0,0': [die('yellow', 1)], '1,4': [die('yellow', 1)] }))).toBe(false)
    expect(personal('lightFront', board({ '0,0': [die('yellow', 1)], '0,4': [die('yellow', 1), die('red', 2)] }))).toBe(false)
  })

  it('공허 수집가: 탑 전체에 검정 5개 이상 (덮인 것 포함)', () => {
    const five = board({ '0,0': pillarOf(3, 'black'), '1,1': [die('red', 1), die('black', 2)], '2,2': [die('black', 1)] })
    expect(personal('voidCollector', five)).toBe(true)
    expect(personal('voidCollector', board({ '0,0': pillarOf(4, 'black') }))).toBe(false)
  })

  it('§11-3 v0.8 높이 숭배: 3층 이상 기둥 3개', () => {
    expect(personal('heightWorship', board({ '0,0': pillarOf(3), '0,1': pillarOf(3), '2,4': pillarOf(3) }))).toBe(true)
    expect(personal('heightWorship', board({ '0,0': pillarOf(4), '0,1': pillarOf(5), '2,4': pillarOf(3) }))).toBe(true)
    expect(personal('heightWorship', board({ '0,0': pillarOf(3), '0,1': pillarOf(5), '2,4': pillarOf(2) }))).toBe(false)
    expect(personal('heightWorship', board({ '0,0': pillarOf(6), '0,1': pillarOf(6) }))).toBe(false)
  })

  it('시간 지배자: 4라운드 준비 때 센 ⧗ 주사위 4개 이상 (게임 끝 보드와 무관)', () => {
    expect(personal('timeLord', board({}), 0, 4)).toBe(true)
    expect(personal('timeLord', board({}), 0, 3)).toBe(false)
    // 4라운드에 다 굴려 꼭대기 ⧗이 없어져도 준비 때 센 수로 판정
    expect(personal('timeLord', board({ '0,0': [die('red', 2)] }), 0, 5)).toBe(true)
  })

  it('시간 지배자: 4라운드 전에는 지금 꼭대기 ⧗ 수로 어림한다 (봇·진행 표시용)', () => {
    const T = () => die('red', TIME)
    expect(personal('timeLord', board({ '0,0': [T()], '0,1': [T()], '0,2': [T()], '0,3': [die('red', 1), T()] }))).toBe(true)
    expect(personal('timeLord', board({ '0,0': [T()], '0,1': [T()], '0,2': [T()] }))).toBe(false)
  })

  it('짝수 세계: 최종 선의 윗면이 모두 2 또는 4', () => {
    expect(personal('evenWorld', tops(2, 4, 2, 4, 4))).toBe(true)
    expect(personal('evenWorld', tops(2, 4, 3, 4, 4))).toBe(false)
    expect(personal('evenWorld', tops(2, 4, TIME, 4, 4))).toBe(false)
    // 4라운드에 선 주사위가 굴러 나가 빈 칸이 있으면 미달성
    expect(personal('evenWorld', board(line(die('red', 2), die('red', 4), die('red', 2), die('red', 4))))).toBe(false)
    // 선 주사위 위에 쌓인 것은 상관없다 (선 = 1행 1층)
    const covered = tops(2, 4, 2, 4, 4)
    covered.cells[0]?.[0]?.push(die('red', 5))
    expect(personal('evenWorld', covered)).toBe(true)
  })

  it('대칭 우주: 정면에서 본 열별 최고 높이가 좌우 대칭', () => {
    expect(personal('symmetry', board({ '0,0': pillarOf(1), '2,1': pillarOf(2), '1,2': pillarOf(5), '0,3': pillarOf(2), '1,4': pillarOf(1) }))).toBe(true)
    expect(personal('symmetry', board({ '0,0': pillarOf(1), '2,1': pillarOf(2), '0,3': pillarOf(2), '1,4': pillarOf(2) }))).toBe(false)
  })

  it('깨끗한 손: 잔해 2개 이하', () => {
    expect(personal('cleanHands', board({}), 0)).toBe(true)
    expect(personal('cleanHands', board({}), 2)).toBe(true)
    expect(personal('cleanHands', board({}), 3)).toBe(false)
  })
})

// ─── §11-2 4라운드 목표 (v0.8) ───────────────────────────────────────

describe('§11-2 v0.8 4라운드 목표 (꼭대기 = 위에서 내려다본 각 칸의 맨 위 주사위)', () => {
  /** 15칸 모두 1층 주사위, 색은 행마다 문자열로 (r=빨강 b=파랑 g=초록 y=노랑 k=검정 t=⧗ .=진공) */
  const C: Record<string, Color> = { r: 'red', b: 'blue', g: 'green', y: 'yellow', k: 'black' }
  const map = (...rows: string[]): Board =>
    board(
      Object.fromEntries(
        rows.flatMap((row, r) =>
          [...row].flatMap((ch, c) =>
            ch === '.' ? [] : [[`${r},${c}`, [ch === 't' ? die('red', TIME) : die(C[ch] as Color, 1)]]],
          ),
        ),
      ),
    )

  it('색의 강: 같은 색 꼭대기가 변으로 이어져 1행부터 3행까지 닿음', () => {
    expect(goalCheck('colorRiver', map('rbbbb', 'rgggg', 'ryyyy'))).toBe(true)
    // 구부러져도 된다
    expect(goalCheck('colorRiver', map('rbbbb', 'rrrgg', 'bbryy'))).toBe(true)
    // 2행까지만 닿는 색, 한 행에만 있는 색은 안 된다
    expect(goalCheck('colorRiver', map('rbbbb', 'rgggg', 'yyyyy'))).toBe(false)
    // 대각선은 이어지지 않는다
    expect(goalCheck('colorRiver', map('rbgyk', 'grbyg', 'kgrbb'))).toBe(false)
    // ⧗ 꼭대기·진공에서 끊긴다
    expect(goalCheck('colorRiver', map('r....', 't....', 'r....'))).toBe(false)
    expect(goalCheck('colorRiver', map('r....', '.....', 'r....'))).toBe(false)
    // 해석(목표에는 공허의 우주 미적용): 검정이 이어 주지 않는다
    expect(goalCheck('colorRiver', map('r....', 'k....', 'r....'), 'void')).toBe(false)
    // 덮인 색이 아니라 꼭대기 색
    const covered = board({ '0,0': [die('red', 1)], '1,0': [die('red', 1), die('blue', 2)], '2,0': [die('red', 1)] })
    expect(goalCheck('colorRiver', covered)).toBe(false)
  })

  it('메운 하늘: 진공(1행 포함) 2칸 이하', () => {
    expect(goalCheck('filledSky', map('rrrrr', 'rrrrr', 'rrrrr'))).toBe(true)
    expect(goalCheck('filledSky', map('rr.rr', 'rrrrr', 'rrrr.'))).toBe(true)
    expect(goalCheck('filledSky', map('rr.rr', 'rr.rr', 'rrrr.'))).toBe(false)
    // ⧗ 꼭대기는 진공이 아니다
    expect(goalCheck('filledSky', map('ttttt', 'ttttt', 'ttt..'))).toBe(true)
    expect(goalCheck('filledSky', board({}))).toBe(false)
  })

  it('왕관: 가장 높은 기둥의 꼭대기 윗면이 5 (가장 높은 기둥이 여럿이면 모두)', () => {
    expect(goalCheck('crown', board({ '1,1': pillarOf(5), '0,0': pillarOf(2) }))).toBe(true)
    expect(goalCheck('crown', board({ '1,1': pillarOf(4), '0,0': pillarOf(2) }))).toBe(false)
    // 가장 높은 기둥 둘 다 5여야 한다
    expect(goalCheck('crown', board({ '1,1': pillarOf(5), '2,2': pillarOf(5) }))).toBe(true)
    expect(goalCheck('crown', board({ '1,1': pillarOf(5), '2,2': [...pillarOf(4), die('red', TIME)] }))).toBe(false)
    // 1층짜리만 있어도 가장 높은 기둥이다
    expect(goalCheck('crown', board({ '0,0': [die('red', 5)], '0,1': [die('red', 5)] }))).toBe(true)
    expect(goalCheck('crown', board({ '0,0': [die('red', 5)], '0,1': [die('red', 4)] }))).toBe(false)
    // ⧗ 꼭대기는 5가 아니다
    expect(goalCheck('crown', board({ '1,1': [...pillarOf(5), die('red', TIME)] }))).toBe(false)
    expect(goalCheck('crown', board({}))).toBe(false)
  })

  it('고른 지평: 정면에서 본 열별 최고 높이의 최대-최소 차이가 1 이하', () => {
    const cols = (...hs: number[]) => board(Object.fromEntries(hs.flatMap((h, col) => (h > 0 ? [[`0,${col}`, pillarOf(h)]] : []))))
    expect(goalCheck('evenHorizon', cols(2, 2, 2, 2, 2))).toBe(true)
    expect(goalCheck('evenHorizon', cols(2, 3, 2, 3, 3))).toBe(true)
    expect(goalCheck('evenHorizon', cols(1, 3, 2, 2, 2))).toBe(false)
    // 주사위가 하나도 없는 열은 높이 0
    expect(goalCheck('evenHorizon', cols(0, 1, 1, 1, 1))).toBe(true)
    expect(goalCheck('evenHorizon', cols(0, 2, 2, 2, 2))).toBe(false)
    // 열별 최고 높이: 뒷줄 기둥이 그 열의 높이
    const back = board({ ...Object.fromEntries([0, 1, 2, 3, 4].map((c) => [`0,${c}`, pillarOf(1)])), '2,2': pillarOf(4) })
    expect(goalCheck('evenHorizon', back)).toBe(false)
    const back2 = board({ ...Object.fromEntries([0, 1, 2, 3, 4].map((c) => [`0,${c}`, pillarOf(1)])), '2,2': pillarOf(2) })
    expect(goalCheck('evenHorizon', back2)).toBe(true)
  })

  it('앞줄 무지개: 1행 꼭대기 5개가 모두 다른 색', () => {
    expect(goalCheck('frontRainbow', map('rbgyk', '.....', '.....'))).toBe(true)
    expect(goalCheck('frontRainbow', map('rbgyr', '.....', '.....'))).toBe(false)
    expect(goalCheck('frontRainbow', map('rbgy.', '.....', '.....'))).toBe(false)
    expect(goalCheck('frontRainbow', map('rbgyt', '.....', '.....'))).toBe(false)
    // 덮인 색이 아니라 꼭대기 색: 0,4를 덮으면 검정이 빨강이 된다
    const b = map('rbgyk', '.....', '.....')
    b.cells[0]?.[4]?.push(die('red', 2))
    expect(goalCheck('frontRainbow', b)).toBe(false)
  })

  it('거울 지평: 같은 행의 1↔5열, 2↔4열 꼭대기가 같은 색인 쌍 3개 이상', () => {
    expect(goalCheck('mirrorHorizon', map('rbgbr', 'y...y', '.....'))).toBe(true)
    expect(goalCheck('mirrorHorizon', map('rbgbr', 'y...k', '.....'))).toBe(false)
    // 다른 행끼리는 짝이 아니다
    expect(goalCheck('mirrorHorizon', map('rb...', '...br', 'r...r'))).toBe(false)
    // ⧗끼리는 같은 색이 아니다 (무색)
    expect(goalCheck('mirrorHorizon', map('rbgbr', 't...t', '.....'))).toBe(false)
    expect(goalCheck('mirrorHorizon', map('rrrrr', 'rrrrr', 'rrrrr'))).toBe(true)
  })

  it('두 대륙: 크기 3 이상인 같은 색 꼭대기 영역이 서로 다른 색으로 2개', () => {
    expect(goalCheck('twoContinents', map('rrr..', '.....', '..bbb'))).toBe(true)
    // 같은 색 두 영역은 안 됨
    expect(goalCheck('twoContinents', map('rrr..', '.....', '..rrr'))).toBe(false)
    expect(goalCheck('twoContinents', map('rrr..', '.....', '...bb'))).toBe(false)
    // 해석(목표에는 공허의 우주 미적용): 검정이 이어 주지 않는다
    expect(goalCheck('twoContinents', map('rrk..', '.....', '..bbb'), 'void')).toBe(false)
  })

  it('지평 계단: 1행 꼭대기 윗면이 왼쪽부터 1씩 오르거나 내리는 연속 4칸 (⧗에서 끊김)', () => {
    const front = (...fs: (Face | null)[]) =>
      board(Object.fromEntries(fs.flatMap((f, col) => (f === null ? [] : [[`0,${col}`, [die('red', f)]]]))))
    expect(goalCheck('horizonStairs', front(1, 2, 3, 4, 1))).toBe(true)
    expect(goalCheck('horizonStairs', front(5, 5, 4, 3, 2))).toBe(true)
    expect(goalCheck('horizonStairs', front(1, 2, 3, 2, 1))).toBe(false)
    expect(goalCheck('horizonStairs', front(1, 2, TIME, 3, 4))).toBe(false)
    expect(goalCheck('horizonStairs', front(1, 2, null, 3, 4))).toBe(false)
    // 1층이 아니라 꼭대기의 윗면을 본다
    const stacked = board({
      '0,0': [die('red', 1)],
      '0,1': [die('red', 1), die('red', 2)],
      '0,2': [die('red', 1), die('red', 3)],
      '0,3': [die('red', 1), die('red', 4)],
    })
    expect(goalCheck('horizonStairs', stacked)).toBe(true)
  })
})
