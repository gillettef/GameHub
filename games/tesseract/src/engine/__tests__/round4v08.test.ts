/**
 * v0.8 4라운드: 사건 카드(§11-4), 자유 넘기기(§9), 4라운드 목표(§5·§11-2), 4차원 점수(§9), 끝 정산 순서(§9 4라운드 끝).
 */
import { describe, expect, it } from 'vitest'
import { ROUND_GOALS, type LawId, type RoundGoalId } from '../cards'
import { STANDARD_LAYOUT, TIME, tip, TIP_DIRECTIONS, type TipDirection } from '../dice'
import { EVENT_DECK, EVENTS, eventFreeTips, resolveEndEvent, tipRules, vacuumCount } from '../events'
import { applyAction, getLegalActions, IllegalActionError } from '../game'
import { checkRoundGoals, goalPoints } from '../goals'
import { scoreTops } from '../scoring'
import { createGame } from '../setup'
import { finishRound4, isFreeTipDie, legalTimeActions, rollTargets, startRound4, type TimeAction } from '../time'
import type { Board, Color, Die, EventId, GameState, RolledDie, RoundGoalCard } from '../types'
import { board, colorsWith, die } from './helpers'

const S = STANDARD_LAYOUT

/** 기준 배치 ⧗ 주사위(⧗/2): forward → 5, back → 2, left → 3, right → 4 */
const T = (color: Color = 'red'): RolledDie => die(color, TIME, 2)

const bases = new Map<number, GameState>()
function base(n: number): GameState {
  let b = bases.get(n)
  if (!b) {
    b = createGame({ playerCount: n, seed: 1, law: 'standard' })
    bases.set(n, b)
  }
  return b
}

interface Stage {
  lead?: number
  events?: EventId[]
  law?: LawId
  /** 공개된 목표 카드 (그대로) */
  goals?: RoundGoalCard[]
  /** 플레이어별 잔해 수 */
  debris?: number[]
  bag?: Die[]
}

let debrisId = 50000
const debrisDie = (): Die => ({ id: debrisId++, colors: colorsWith('red', 1), layout: S })

/** 4라운드 준비 직전 상태 (3라운드 끝) */
function stage(boards: Board[], o: Stage = {}): GameState {
  const b = base(boards.length)
  const lead = o.lead ?? 0
  return {
    ...b,
    phase: { kind: 'round', round: 4 },
    market: [],
    leadPlayer: lead,
    currentPlayer: lead,
    law: o.law ?? 'standard',
    eventDeck: o.events ?? [],
    roundGoals: o.goals ?? [],
    bag: o.bag ?? b.bag,
    players: b.players.map((p, i) => ({
      ...p,
      board: boards[i] as Board,
      debris: Array.from({ length: o.debris?.[i] ?? 0 }, debrisDie),
    })),
  }
}

const round4 = (boards: Board[], o: Stage = {}): GameState => startRound4(stage(boards, o))

const card = (id: RoundGoalId, first: number | null = null, achieved: number[] = []): RoundGoalCard => ({
  id,
  round: ROUND_GOALS[id].round,
  first,
  achieved,
})

const tipDie = (s: GameState, d: RolledDie, direction: TipDirection): GameState =>
  applyAction(s, { type: 'roll', player: s.currentPlayer, dieId: d.id, direction })
const pass = (s: GameState): GameState => applyAction(s, { type: 'pass', player: s.currentPlayer })
const cellOf = (s: GameState, p: number, row: number, col: number): RolledDie[] =>
  s.players[p]?.board.cells[row]?.[col] ?? []
const dirsOf = (b: Board, row: number, col: number, events: EventId[], law: LawId = 'standard') =>
  rollTargets(b, { row, col }, law, events)
    .map((t) => t.direction)
    .sort()

/** 첫 번째 합법 행동을 계속 골라 끝까지. 행동 직전의 차례 플레이어 목록 */
function playFirst(s0: GameState): { order: number[]; last: GameState } {
  let s = s0
  const order: number[] = []
  for (let guard = 0; guard < 100 && s.phase.kind === 'round'; guard++) {
    const action = getLegalActions(s)[0]
    if (!action) break
    order.push(s.currentPlayer)
    s = applyAction(s, action)
  }
  return { order, last: s }
}

/** 칸 문자열 지도 (r=빨강 b=파랑 g=초록 y=노랑 k=검정 t=⧗ .=진공), 모두 1층 윗면 1 */
const C: Record<string, Color> = { r: 'red', b: 'blue', g: 'green', y: 'yellow', k: 'black' }
const map = (...rows: string[]): Board =>
  board(
    Object.fromEntries(
      rows.flatMap((row, r) =>
        [...row].flatMap((ch, c) => (ch === '.' ? [] : [[`${r},${c}`, [ch === 't' ? T() : die(C[ch] as Color, 1)]]])),
      ),
    ),
  )

// ─── 사건 카드 공개 ──────────────────────────────────────────────────

describe('§11-4 v0.8 사건 카드 10장 (시작 4장, 끝 6장)', () => {
  it('§4 사건 카드 10장: 시작 = 역행·시간 균열·자전·지진, 끝 = 침식·중력파·왕관의 저주·빅뱅·대번식·대홍수', () => {
    expect(EVENT_DECK).toHaveLength(10)
    const start = EVENT_DECK.filter((e) => EVENTS[e].when === 'start').sort()
    const end = EVENT_DECK.filter((e) => EVENTS[e].when === 'end').sort()
    expect(start).toEqual(['earthquake', 'regression', 'rotation', 'timeRift'])
    expect(end).toEqual(['bigBang', 'crownCurse', 'erosion', 'flood', 'gravityWave', 'proliferation'])
    expect(EVENTS.regression.name).toBe('역행')
    expect(EVENTS.timeRift.name).toBe('시간 균열')
    expect(EVENTS.rotation.name).toBe('자전')
    expect(EVENTS.earthquake.name).toBe('지진')
    expect(EVENTS.erosion.name).toBe('침식')
    expect(EVENTS.gravityWave.name).toBe('중력파')
    expect(EVENTS.crownCurse.name).toBe('왕관의 저주')
    expect(EVENTS.bigBang.name).toBe('빅뱅')
    expect(EVENTS.proliferation.name).toBe('대번식')
    expect(EVENTS.flood.name).toBe('대홍수')
  })

  it('§9 준비: 사건 더미 위에서 2장을 공개 순서대로 공개하고 더미에서 뺀다', () => {
    const s = round4([board({ '1,1': [T()] }), board({})], { events: ['flood', 'rotation', 'erosion', 'bigBang'] })
    expect(s.time?.events).toEqual(['flood', 'rotation'])
    expect(s.eventDeck).toEqual(['erosion', 'bigBang'])
  })

  it('§9 준비: 실제 게임 진행에서 3라운드 끝의 사건 더미 앞 2장이 4라운드에 공개된다', () => {
    let s = createGame({ playerCount: 2, seed: 5, law: 'standard' })
    const deck = s.eventDeck
    // 3라운드 끝까지 첫 합법 행동으로 진행
    for (let guard = 0; guard < 2000 && s.time === null; guard++) {
      const a = getLegalActions(s)[0]
      if (!a) break
      s = applyAction(s, a)
    }
    expect(s.time?.events).toEqual(deck.slice(0, 2))
    expect(s.eventDeck).toEqual(deck.slice(2))
  })

  it('경계값: 사건 더미가 비어 있으면 공개하지 않는다 (사건 없음)', () => {
    const s = round4([board({ '1,1': [T()] }), board({})], { events: [] })
    expect(s.time?.events).toEqual([])
  })

  it('tipRules: 시작 사건만 넘기기 규칙을 바꾼다', () => {
    expect(tipRules([])).toEqual({ noVacuum: false, sidewaysOnly: false, noUphill: false })
    expect(tipRules(['timeRift'])).toEqual({ noVacuum: true, sidewaysOnly: false, noUphill: false })
    expect(tipRules(['rotation', 'earthquake'])).toEqual({ noVacuum: false, sidewaysOnly: true, noUphill: true })
    expect(tipRules(['flood', 'erosion', 'regression'])).toEqual({ noVacuum: false, sidewaysOnly: false, noUphill: false })
  })
})

// ─── 시작 사건 ───────────────────────────────────────────────────────

describe('§11-4 시작 사건', () => {
  it('역행: 각자 자유 넘기기 1회를 받는다', () => {
    expect(eventFreeTips(['regression', 'flood'])).toBe(1)
    expect(eventFreeTips(['flood', 'erosion'])).toBe(0)
    const s = round4([board({ '1,1': [T()] }), board({ '0,0': [die('red', 1)] })], { events: ['regression', 'flood'] })
    expect(s.time?.free).toEqual([1, 1])
  })

  it('규칙서 예: 영원의 우주와 역행이 함께 나오면 자유 넘기기는 2회', () => {
    const s = round4([board({ '1,1': [T()] }), board({ '0,0': [die('red', 1)] })], { events: ['regression', 'flood'], law: 'eternal' })
    expect(s.time?.free).toEqual([2, 2])
  })

  it('시간 균열: 진공으로는 넘길 수 없다 (옆 기둥 위로만)', () => {
    // (1,2)의 ⧗: 왼쪽 (1,1)에 1 → 3을 올릴 수 있음, 나머지는 진공
    const b = board({ '1,2': [T()], '1,1': [die('red', 1)] })
    expect(dirsOf(b, 1, 2, [])).toEqual(['back', 'forward', 'left', 'right'])
    expect(dirsOf(b, 1, 2, ['timeRift'])).toEqual(['left'])
  })

  it('시간 균열: 사방이 진공인 ⧗ 주사위는 넘길 곳이 없어 잔해가 된다 (§9)', () => {
    const d = T()
    const s = round4([board({ '1,2': [d] }), board({})], { events: ['timeRift'] })
    expect(legalTimeActions(s)).toEqual([{ type: 'scrap', player: 0, dieId: d.id }])
    expect(() => tipDie(s, d, 'forward')).toThrow(IllegalActionError)
    const after = applyAction(s, { type: 'scrap', player: 0, dieId: d.id })
    expect(after.players[0]?.debris.map((x) => x.id)).toEqual([d.id])
  })

  it('자전: 왼쪽·오른쪽으로만 넘길 수 있다', () => {
    const b = board({ '1,2': [T()] })
    expect(dirsOf(b, 1, 2, ['rotation'])).toEqual(['left', 'right'])
    const d = T()
    const s = round4([board({ '1,2': [d] }), board({})], { events: ['rotation'] })
    expect(() => tipDie(s, d, 'forward')).toThrow(IllegalActionError)
    expect(() => tipDie(s, d, 'back')).toThrow(IllegalActionError)
    expect(cellOf(tipDie(s, d, 'left'), 0, 1, 1).map((x) => x.id)).toEqual([d.id])
  })

  it('자전: 왼쪽 끝 칸의 ⧗은 오른쪽으로만, 좌우가 막히면 잔해', () => {
    expect(dirsOf(board({ '1,0': [T()] }), 1, 0, ['rotation'])).toEqual(['right'])
    const d = T()
    const s = round4([board({ '1,0': [d], '1,1': [die('red', 5)] }), board({})], { events: ['rotation'] })
    expect(legalTimeActions(s)).toEqual([{ type: 'scrap', player: 0, dieId: d.id }])
  })

  it('지진: 넘기는 주사위가 있던 기둥(그 주사위 포함)보다 높은 옆 기둥 위로는 넘길 수 없다', () => {
    // (1,2) ⧗ 1층. 왼쪽 (1,1) 2층(위 2) → 3을 올릴 수 있지만 더 높아서 불가. 오른쪽 (1,3) 1층(1) → 같은 높이라 가능
    const b = board({ '1,2': [T()], '1,1': [die('red', 1), die('red', 2)], '1,3': [die('red', 1)] })
    expect(dirsOf(b, 1, 2, [])).toEqual(['back', 'forward', 'left', 'right'])
    expect(dirsOf(b, 1, 2, ['earthquake'])).toEqual(['back', 'forward', 'right'])
  })

  it('지진: 원래 기둥이 더 높으면 낮은 기둥 위로, 진공으로는 넘길 수 있다 (높이에는 넘기는 주사위 포함)', () => {
    // (1,2) [1, ⧗] = 2층. 왼쪽 (1,1) 2층 → 같은 높이라 가능, 오른쪽 (1,3) 3층 → 불가
    const b = board({
      '1,2': [die('red', 1), T()],
      '1,1': [die('red', 1), die('red', 2)],
      '1,3': [die('red', 1), die('red', 2), die('red', 3)],
    })
    expect(dirsOf(b, 1, 2, ['earthquake'])).toEqual(['back', 'forward', 'left'])
  })

  it('규칙서: 시작 사건이 겹쳐 넘길 곳이 없어진 ⧗ 주사위는 잔해가 된다 (자전 + 시간 균열)', () => {
    const d = T()
    const s = round4([board({ '1,2': [d], '0,2': [die('red', 1)], '2,2': [die('red', 1)] }), board({})], {
      events: ['rotation', 'timeRift'],
    })
    // 앞·뒤는 기둥이 있어 넘길 수 있지만 자전에 막히고, 좌우는 진공이라 시간 균열에 막힌다
    expect(dirsOf(s.players[0]?.board as Board, 1, 2, [])).toEqual(['back', 'forward', 'left', 'right'])
    expect(legalTimeActions(s)).toEqual([{ type: 'scrap', player: 0, dieId: d.id }])
  })

  it('시작 사건은 4라운드 내내 적용되고, 법칙의 쌓기 규칙과 함께 따진다', () => {
    // 자전 + 평평한 우주: 왼쪽 3 위에 3, 오른쪽 4 위에 4를 올릴 수 있음 (표준이면 둘 다 불가)
    const b = board({ '1,2': [T()], '1,1': [die('red', 3)], '1,3': [die('red', 4)] })
    expect(dirsOf(b, 1, 2, ['rotation'], 'standard')).toEqual([])
    expect(dirsOf(b, 1, 2, ['rotation'], 'flat')).toEqual(['left', 'right'])
    // 뒤집힌 우주: 3 위에 3은 안 되고 4 위에 4도 안 됨
    expect(dirsOf(b, 1, 2, ['rotation'], 'inverted')).toEqual([])
  })

  it('시작 사건은 자유 넘기기에도 적용된다 (자전 + 역행)', () => {
    const n = die('red', 3)
    const s = round4([board({ '1,2': [n] }), board({})], { events: ['rotation', 'regression'] })
    const moves = legalTimeActions(s).filter((a): a is Extract<TimeAction, { type: 'roll' }> => a.type === 'roll')
    expect(moves.map((a) => a.direction).sort()).toEqual(['left', 'right'])
    expect(() => tipDie(s, n, 'forward')).toThrow(IllegalActionError)
  })

  it('끝 정산에서 시작 사건은 아무것도 하지 않는다', () => {
    const s = stage([board({ '1,1': [die('red', 1)] }), board({})], { debris: [1, 0] })
    for (const e of ['regression', 'timeRift', 'rotation', 'earthquake'] as const) expect(resolveEndEvent(s, e)).toBe(s)
  })
})

// ─── 끝 사건 ─────────────────────────────────────────────────────────

describe('§11-4 끝 사건', () => {
  const heights = (s: GameState, p: number) => (s.players[p]?.board.cells ?? []).map((row) => row.map((x) => x.length))

  it('침식: 가장 높은 기둥이 하나뿐이면 그 꼭대기 주사위를 잔해로', () => {
    const top = die('blue', 4)
    const s = stage([
      board({ '1,1': [die('red', 1), die('red', 2), top], '0,0': [die('red', 1), die('red', 2)] }),
      board({ '1,1': [die('red', 1), die('red', 2)], '1,3': [die('red', 1), die('red', 2)] }), // 가장 높은 기둥 2개 → 그대로
      board({}), // 빈 보드 → 그대로
    ])
    const after = resolveEndEvent(s, 'erosion')
    expect(cellOf(after, 0, 1, 1)).toHaveLength(2)
    expect(after.players[0]?.debris.map((d) => d.id)).toEqual([top.id])
    expect(after.players[0]?.debris[0]).toEqual({ id: top.id, colors: top.colors, layout: top.layout })
    expect(after.players[1]).toEqual(s.players[1])
    expect(after.players[2]).toEqual(s.players[2])
  })

  it('침식: 1층짜리만 있고 하나뿐이면 그 주사위가 잔해가 되어 진공이 된다', () => {
    const only = die('red', 3)
    const after = resolveEndEvent(stage([board({ '0,2': [only] }), board({})]), 'erosion')
    expect(cellOf(after, 0, 0, 2)).toEqual([])
    expect(after.players[0]?.debris.map((d) => d.id)).toEqual([only.id])
  })

  it('중력파: 4층 이상인 기둥마다 꼭대기 주사위 1개를 잔해로 (3층은 그대로)', () => {
    const s = stage([
      board({
        '0,0': [die('red', 1), die('red', 2), die('red', 3), die('red', 4)],
        '1,1': [die('red', 1), die('red', 2), die('red', 3), die('red', 4), die('red', 5)],
        '2,2': [die('red', 1), die('red', 2), die('red', 3)],
      }),
      board({ '0,0': [die('red', 1), die('red', 2), die('red', 3)] }),
    ])
    const after = resolveEndEvent(s, 'gravityWave')
    expect(heights(after, 0)[0]?.[0]).toBe(3)
    expect(heights(after, 0)[1]?.[1]).toBe(4) // 1개만 (다시 4층이 되어도 한 번만)
    expect(heights(after, 0)[2]?.[2]).toBe(3)
    expect(after.players[0]?.debris).toHaveLength(2)
    expect(after.players[1]).toEqual(s.players[1])
  })

  it('왕관의 저주: 목표 점수가 1점 이상이고 가장 높은 사람은 주머니에서 1개를 잔해로', () => {
    const s = stage([board({}), board({}), board({})], { goals: [card('timeSeed', 1, [0]), card('cross', 1)] })
    // 0번 2 + 2 = 4, 1번 4 + 4 = 8, 2번 0
    expect([0, 1, 2].map((p) => goalPoints(s, p))).toEqual([2, 8, 0])
    const after = resolveEndEvent(s, 'crownCurse')
    expect(after.players.map((p) => p.debris.length)).toEqual([0, 1, 0])
    expect(after.bag).toHaveLength(s.bag.length - 1)
    // 잔해가 된 주사위는 주머니에서 나온 것
    const got = after.players[1]?.debris[0] as Die
    expect(s.bag.some((d) => d.id === got.id)).toBe(true)
    expect(after.bag.some((d) => d.id === got.id)).toBe(false)
  })

  it('왕관의 저주: 동점이면 모두, 모두 0점이면 아무도 아님, 주머니가 비면 하지 않음', () => {
    const tie = stage([board({}), board({}), board({})], { goals: [card('timeSeed', null, [0, 1])] })
    expect(resolveEndEvent(tie, 'crownCurse').players.map((p) => p.debris.length)).toEqual([1, 1, 0])
    const zero = stage([board({}), board({})], { goals: [card('timeSeed')] })
    expect(resolveEndEvent(zero, 'crownCurse')).toEqual(zero)
    const empty = stage([board({}), board({})], { goals: [card('timeSeed', 0)], bag: [] })
    expect(resolveEndEvent(empty, 'crownCurse').players.map((p) => p.debris.length)).toEqual([0, 0])
  })

  it('빅뱅: 목표 점수가 가장 낮은 사람(동점이면 모두)은 잔해 1개를 주머니로', () => {
    const s = stage([board({}), board({}), board({})], { goals: [card('timeSeed', 0)], debris: [2, 2, 3] })
    const after = resolveEndEvent(s, 'bigBang')
    expect(after.players.map((p) => p.debris.length)).toEqual([2, 1, 2])
    expect(after.bag).toHaveLength(s.bag.length + 2)
    // 돌려보낸 잔해는 주머니에 들어간다
    for (const p of [1, 2]) {
      const gone = s.players[p]?.debris.find((d) => !after.players[p]?.debris.some((x) => x.id === d.id)) as Die
      expect(after.bag.some((d) => d.id === gone.id)).toBe(true)
    }
  })

  it('빅뱅: 모두 0점이면 모두 돌려보내고, 잔해가 없으면 하지 않는다', () => {
    const s = stage([board({}), board({})], { debris: [0, 1] })
    const after = resolveEndEvent(s, 'bigBang')
    expect(after.players.map((p) => p.debris.length)).toEqual([0, 0])
    expect(after.bag).toHaveLength(s.bag.length + 1)
  })

  it('대번식: 꼭대기 초록이 3개 이상인 사람은 잔해 1개를 주머니로 (이어지지 않아도, 덮인 초록은 무관)', () => {
    const s = stage(
      [
        map('g.g.g', '.....', '.....'),
        board({ '0,0': [die('green', 1)], '0,2': [die('green', 1)], '0,4': [die('green', 1), die('red', 2)] }),
        map('ggg..', '.....', '.....'),
      ],
      { debris: [1, 1, 0] },
    )
    const after = resolveEndEvent(s, 'proliferation')
    expect(after.players.map((p) => p.debris.length)).toEqual([0, 1, 0])
  })

  it('대홍수: 진공(1행 포함)이 5칸 이상인 사람은 주머니에서 1개를 잔해로 (4칸은 아님)', () => {
    const five = map('.....', 'rrrrr', 'rrrrr')
    const four = map('....r', 'rrrrr', 'rrrrr')
    expect(vacuumCount(five)).toBe(5)
    expect(vacuumCount(four)).toBe(4)
    expect(vacuumCount(board({}))).toBe(15)
    const s = stage([five, four, board({})])
    const after = resolveEndEvent(s, 'flood')
    expect(after.players.map((p) => p.debris.length)).toEqual([1, 0, 1])
    expect(after.bag).toHaveLength(s.bag.length - 2)
    // 주머니가 비면 하지 않는다
    expect(resolveEndEvent({ ...s, bag: [] }, 'flood').players.map((p) => p.debris.length)).toEqual([0, 0, 0])
  })

  it('§9 4라운드 끝에 끝 사건이 공개한 순서대로 발동한다 (대번식 → 대홍수 ≠ 대홍수 → 대번식)', () => {
    // 잔해 0, 꼭대기 초록 3, 진공 12
    const b = () => map('ggg..', '.....', '.....')
    const a = round4([b(), board({ '0,0': [die('red', 1)] })], { events: ['proliferation', 'flood'] })
    const z = round4([b(), board({ '0,0': [die('red', 1)] })], { events: ['flood', 'proliferation'] })
    expect(a.phase).toEqual({ kind: 'ended' })
    expect(z.phase).toEqual({ kind: 'ended' })
    // 대번식 먼저: 돌려보낼 잔해가 없고, 대홍수로 1개 → 1
    expect(a.players[0]?.debris).toHaveLength(1)
    // 대홍수 먼저: 1개 받고 대번식으로 돌려보냄 → 0
    expect(z.players[0]?.debris).toHaveLength(0)
  })

  it('§9 끝 사건은 ⧗ 주사위를 모두 넘긴 뒤(4라운드 끝)에 발동한다', () => {
    const d = T()
    // 대홍수: 진공 14 → 끝에 잔해 1. 넘기기 전에는 발동하지 않음
    let s = round4([board({ '1,1': [d] }), board({ '0,0': [die('red', 1)] })], { events: ['flood', 'rotation'] })
    expect(s.players.map((p) => p.debris.length)).toEqual([0, 0])
    s = tipDie(s, d, 'left')
    expect(s.phase).toEqual({ kind: 'ended' })
    expect(s.players.map((p) => p.debris.length)).toEqual([1, 1])
  })
})

// ─── 자유 넘기기 ─────────────────────────────────────────────────────

describe('§9 v0.8 자유 넘기기', () => {
  it('§11-1 영원의 우주: 각자 자유 넘기기 1회, 표준 우주는 0회', () => {
    const bs = () => [board({ '1,1': [T()] }), board({ '0,0': [die('red', 1)] })]
    expect(round4(bs(), { law: 'eternal' }).time?.free).toEqual([1, 1])
    expect(round4(bs()).time?.free).toEqual([0, 0])
  })

  it('윗면이 ⧗이 아닌 꼭대기 1개를 같은 규칙으로 넘기고, 자유 넘기기가 1 줄어든다 (⧗ 주사위는 그대로)', () => {
    const n = die('blue', 3)
    const t = T()
    const s = round4([board({ '1,2': [n], '2,4': [t] }), board({})], { law: 'eternal' })
    const after = tipDie(s, n, 'forward')
    const moved = cellOf(after, 0, 0, 2)[0] as RolledDie
    expect(moved.id).toBe(n.id)
    expect(moved.orientation).toEqual(tip(S, n.orientation, 'forward'))
    expect(cellOf(after, 0, 1, 2)).toEqual([])
    expect(after.time?.free[0]).toBe(0)
    expect(after.time?.pending[0]).toEqual([t.id])
    // 차례는 넘어가고(상대도 자유 넘기기 1), 다시 돌아오면 남은 ⧗ 주사위는 반드시 넘겨야 한다
    expect(after.currentPlayer).toBe(1)
    const back = pass(after)
    expect(back.currentPlayer).toBe(0)
    expect(legalTimeActions(back).length).toBeGreaterThan(0)
    expect(legalTimeActions(back).every((a) => a.type !== 'pass' && a.dieId === t.id)).toBe(true)
  })

  it('⧗ 주사위가 남아 있어도 그 대신 자유 넘기기를 쓸 수 있다 (합법 행동에 둘 다 있음)', () => {
    const n = die('blue', 3)
    const t = T()
    const s = round4([board({ '1,2': [n], '2,4': [t] }), board({})], { law: 'eternal' })
    const actions = legalTimeActions(s)
    expect(actions.some((a) => a.type === 'roll' && a.dieId === n.id)).toBe(true)
    expect(actions.some((a) => a.type === 'roll' && a.dieId === t.id)).toBe(true)
    // ⧗ 주사위가 남았으니 포기는 없다
    expect(actions.some((a) => a.type === 'pass')).toBe(false)
    expect(() => pass(s)).toThrow(IllegalActionError)
  })

  it('자유 넘기기로는 넘길 곳이 없는 주사위를 고를 수 없다 (잔해로 만들 수 없음)', () => {
    // (0,0)의 3: 오른쪽·뒤가 5 꼭대기 → 넘길 곳 없음
    const stuck = die('blue', 3)
    const s = round4([board({ '0,0': [stuck], '0,1': [die('red', 5)], '1,0': [die('red', 5)] }), board({})], { law: 'eternal' })
    expect(rollTargets(s.players[0]?.board as Board, { row: 0, col: 0 })).toEqual([])
    expect(() => applyAction(s, { type: 'scrap', player: 0, dieId: stuck.id })).toThrow(IllegalActionError)
    for (const d of TIP_DIRECTIONS) expect(() => tipDie(s, stuck, d)).toThrow(IllegalActionError)
    expect(legalTimeActions(s).some((a) => a.type !== 'pass' && a.dieId === stuck.id)).toBe(false)
  })

  it('자유 넘기기가 없으면 숫자 꼭대기를 넘길 수 없다', () => {
    const n = die('blue', 3)
    const s = round4([board({ '1,2': [n], '2,4': [T()] }), board({})])
    expect(() => tipDie(s, n, 'forward')).toThrow(IllegalActionError)
    expect(isFreeTipDie(s, n.id)).toBe(false)
  })

  it('꼭대기가 아닌 주사위·남의 주사위는 자유 넘기기로도 넘길 수 없다', () => {
    const under = die('red', 1)
    const theirs = die('red', 3)
    const s = round4([board({ '1,2': [under, die('red', 2)], '2,4': [T()] }), board({ '1,1': [theirs] })], { law: 'eternal' })
    expect(() => tipDie(s, under, 'forward')).toThrow(IllegalActionError)
    expect(() => tipDie(s, theirs, 'forward')).toThrow(IllegalActionError)
  })

  it('§9 준비: 자유 넘기기로 ⧗이 위로 온 주사위는 ⧗ 주사위가 되지 않고, 자유 넘기기로도 다시 넘길 수 없다', () => {
    const n = die('blue', 3)
    const dir = TIP_DIRECTIONS.find((d) => tip(S, n.orientation, d).top === TIME) as TipDirection
    expect(dir).toBeDefined()
    // 영원의 우주 + 역행 = 2회. 가운데 칸이라 어느 방향이든 진공으로 넘길 수 있다
    let s = round4([board({ '1,2': [n] }), board({})], { law: 'eternal', events: ['regression'] })
    expect(s.time?.free[0]).toBe(2)
    s = tipDie(s, n, dir)
    expect(s.time?.pending[0]).toEqual([])
    expect(s.time?.free[0]).toBe(1)
    expect(s.currentPlayer).toBe(1)
    s = pass(s)
    expect(s.currentPlayer).toBe(0)
    // 이제 n은 윗면이 ⧗인 꼭대기
    expect(legalTimeActions(s).some((a) => a.type !== 'pass' && a.dieId === n.id)).toBe(false)
    expect(isFreeTipDie(s, n.id)).toBe(false)
    expect(() => tipDie(s, n, 'back')).toThrow(IllegalActionError)
    expect(legalTimeActions(s)).toEqual([{ type: 'pass', player: 0 }])
  })

  it('포기(pass): ⧗ 주사위를 다 넘긴 뒤에만, 남은 자유 넘기기를 모두 포기한다', () => {
    const t = T()
    let s = round4([board({ '1,2': [t], '0,0': [die('red', 1)] }), board({ '0,0': [die('red', 1)] })], {
      law: 'eternal',
      events: ['regression'],
    })
    expect(() => pass(s)).toThrow(IllegalActionError)
    s = tipDie(s, t, 'back')
    // 1번: ⧗ 없음, 자유 2회 → 포기하면 0
    expect(s.currentPlayer).toBe(1)
    expect(legalTimeActions(s)).toContainEqual({ type: 'pass', player: 1 })
    s = pass(s)
    expect(s.time?.free[1]).toBe(0)
    expect(s.currentPlayer).toBe(0)
    s = pass(s)
    expect(s.time?.free).toEqual([0, 0])
    expect(s.phase).toEqual({ kind: 'ended' })
  })

  it('포기할 자유 넘기기가 없으면 pass는 안 되고, 1~3라운드에도 안 된다', () => {
    const s = round4([board({ '1,2': [T()] }), board({})])
    expect(() => pass(s)).toThrow(IllegalActionError)
    const r1 = { ...base(2), phase: { kind: 'round', round: 1 } } as GameState
    expect(() => applyAction(r1, { type: 'pass', player: r1.currentPlayer })).toThrow(IllegalActionError)
  })

  it('넘길 숫자 꼭대기가 없으면 합법 행동은 포기뿐이다', () => {
    const s = round4([board({}), board({ '1,1': [T()] })], { law: 'eternal', lead: 0 })
    expect(s.currentPlayer).toBe(0)
    expect(legalTimeActions(s)).toEqual([{ type: 'pass', player: 0 }])
  })

  it('경계값: 아무도 ⧗ 주사위가 없어도 자유 넘기기가 있으면 바로 끝나지 않고, 모두 포기하면 끝난다', () => {
    let s = round4([board({ '0,0': [die('red', 1)] }), board({ '0,0': [die('red', 1)] })], { law: 'eternal', lead: 1 })
    expect(s.phase).toEqual({ kind: 'round', round: 4 })
    expect(s.currentPlayer).toBe(1)
    s = pass(s)
    expect(s.currentPlayer).toBe(0)
    s = pass(s)
    expect(s.phase).toEqual({ kind: 'ended' })
  })

  it('§9 차례 순서: 남은 자유 넘기기도 넘길 것으로 친다 (나 ⧗ 3 + 자유 1, 상대 ⧗ 2 + 자유 1)', () => {
    const mine = () => board({ '2,0': [T()], '2,2': [T()], '2,4': [T()], '0,2': [die('red', 1)] })
    const theirs = () => board({ '2,0': [T()], '2,2': [T()], '0,2': [die('red', 1)] })
    const a = playFirst(round4([mine(), theirs()], { law: 'eternal', lead: 0 }))
    expect(a.order).toEqual([0, 1, 0, 1, 0, 1, 0])
    expect(a.last.phase).toEqual({ kind: 'ended' })
    const b = playFirst(round4([mine(), theirs()], { law: 'eternal', lead: 1 }))
    expect(b.order).toEqual([1, 0, 1, 0, 1, 0, 0])
  })

  it('§9 차례 순서: ⧗ 주사위가 없는 사람도 자유 넘기기가 있으면 차례가 온다', () => {
    const t = T()
    const n = die('red', 3)
    let s = round4([board({ '1,1': [t] }), board({ '1,1': [n] })], { events: ['regression'], lead: 0 })
    s = tipDie(s, t, 'forward')
    expect(s.currentPlayer).toBe(1)
    s = tipDie(s, n, 'forward')
    expect(s.time?.free).toEqual([1, 0])
    expect(s.currentPlayer).toBe(0)
  })

  it('isFreeTipDie: 현재 플레이어의 윗면이 ⧗이 아닌 꼭대기만', () => {
    const n = die('red', 3)
    const t = T()
    const under = die('red', 1)
    const s = round4([board({ '1,2': [n], '2,4': [t], '0,0': [under, die('red', 2)] }), board({})], { law: 'eternal' })
    expect(isFreeTipDie(s, n.id)).toBe(true)
    expect(isFreeTipDie(s, t.id)).toBe(false)
    expect(isFreeTipDie(s, under.id)).toBe(false)
  })
})

// ─── 4라운드 목표 ────────────────────────────────────────────────────

describe('§5 v0.8 4라운드 목표: 4라운드 끝에 한 번 판정, 달성한 사람 모두 3점 (선착 없음)', () => {
  it('달성한 사람은 모두 달성 칸(3점), 선착 칸은 비어 있다', () => {
    const full = () => map('rrrrr', 'rrrrr', 'rrrrr')
    const s = round4([full(), full(), board({ '0,0': [die('red', 1), die('red', 2), die('red', 3)] })], {
      goals: [card('filledSky'), card('evenHorizon')],
    })
    expect(s.phase).toEqual({ kind: 'ended' })
    expect(s.roundGoals[0]).toEqual({ id: 'filledSky', round: 4, first: null, achieved: [0, 1] })
    expect(s.roundGoals[1]).toEqual({ id: 'evenHorizon', round: 4, first: null, achieved: [0, 1] })
    expect([0, 1, 2].map((p) => goalPoints(s, p))).toEqual([6, 6, 0])
  })

  it('1~3라운드 목표의 마커와 점수는 그대로이고 4라운드 목표만 판정한다', () => {
    const s = round4([map('rrrrr', 'rrrrr', 'rrrrr'), board({})], {
      goals: [card('timeSeed', 1, [0]), card('filledSky')],
    })
    expect(s.roundGoals[0]).toEqual(card('timeSeed', 1, [0]))
    expect(goalPoints(s, 0)).toBe(2 + 3)
    expect(goalPoints(s, 1)).toBe(4)
  })

  it('4라운드 도중에는 판정하지 않는다 (조건을 만족해도 마커 없음, checkRoundGoals도 무시)', () => {
    // 1행이 이미 무지개이고 ⧗ 주사위가 남아 4라운드가 진행 중
    const rainbow = board({
      '0,0': [die('red', 1)],
      '0,1': [die('blue', 1)],
      '0,2': [die('green', 1)],
      '0,3': [die('yellow', 1)],
      '0,4': [die('black', 1)],
      '2,2': [T()],
    })
    const going = round4([rainbow, board({})], {
      goals: [card('frontRainbow')],
    })
    expect(going.phase).toEqual({ kind: 'round', round: 4 })
    expect(ROUND_GOALS.frontRainbow.check(going.players[0]?.board as Board, 'standard')).toBe(true)
    expect(going.roundGoals[0]?.achieved).toEqual([])
    expect(checkRoundGoals(going, 0, true)).toBe(going)
  })

  it('넘기기를 마친 최종 보드로 판정한다 (메운 하늘: 진공 3 → 넘겨서 2)', () => {
    const t = T() // forward → 5
    const cells: Record<string, RolledDie[]> = {}
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) cells[`${r},${c}`] = [die('red', 1)]
    delete cells['0,1']
    delete cells['0,2']
    delete cells['0,3']
    cells['1,1'] = [die('red', 1), t]
    let s = round4([board(cells), board({})], { goals: [card('filledSky')] })
    expect(vacuumCount(s.players[0]?.board as Board)).toBe(3)
    s = tipDie(s, t, 'forward')
    expect(s.phase).toEqual({ kind: 'ended' })
    expect(s.roundGoals[0]?.achieved).toEqual([0])
    expect(goalPoints(s, 0)).toBe(3)
  })

  it('§9 정산 순서: 끝 사건 뒤에 4라운드 목표를 판정한다 (침식이 왕관을 깬다)', () => {
    const tower = () => board({ '1,1': [die('red', 1), die('red', 2), die('red', 3), die('red', 4), die('red', 5)], '0,0': [die('red', 4)] })
    const plain = round4([tower(), board({})], { goals: [card('crown')] })
    expect(plain.roundGoals[0]?.achieved).toEqual([0])
    const eroded = round4([tower(), board({})], { goals: [card('crown')], events: ['erosion', 'rotation'] })
    expect(eroded.players[0]?.debris).toHaveLength(1)
    expect(eroded.roundGoals[0]?.achieved).toEqual([])
  })

  it('§11-4 끝 사건의 "목표 점수"에는 4라운드 목표가 들어가지 않는다 (왕관의 저주·빅뱅)', () => {
    // 0번: 1라운드 달성 2점, 4라운드 목표 없음. 1번: 1~3라운드 0점, 4라운드 목표 2장 달성(6점)
    const goals = [card('timeSeed', null, [0]), card('filledSky'), card('mirrorHorizon')]
    const s = round4([board({}), map('rrrrr', 'rrrrr', 'rrrrr')], { goals, events: ['crownCurse', 'bigBang'], debris: [0, 1] })
    expect([0, 1].map((p) => goalPoints(s, p))).toEqual([2, 6])
    // 왕관의 저주는 0번(2점)에게, 빅뱅은 1번(0점)에게
    expect(s.players.map((p) => p.debris.length)).toEqual([1, 0])
  })
})

// ─── 4차원 점수 확정 ─────────────────────────────────────────────────

describe('§9 v0.8 4차원 점수: 4라운드 끝에 timeScore로 확정', () => {
  it('4라운드 중에는 null, 끝나면 최종 꼭대기 지도의 가장 넓은 같은 색 영역', () => {
    const t = T()
    let s = round4([board({ '1,1': [t], '0,0': [die('red', 1)] }), map('rr...', 'r....', '.....')])
    expect(s.players.map((p) => p.timeScore)).toEqual([null, null])
    s = tipDie(s, t, 'back')
    expect(s.phase).toEqual({ kind: 'ended' })
    expect(s.players.map((p) => p.timeScore)).toEqual([1, 3])
  })

  it('넘기기가 꼭대기 지도를 바꾼다: ⧗을 넘겨 새 윗면의 색으로 옆 칸을 메우면 영역이 이어진다', () => {
    // ⧗/2 forward → 윗면 5. 5의 면을 빨강으로
    const t: RolledDie = { ...T(), colors: colorsWith('red', 5) }
    const b = board({ '0,1': [die('red', 1)], '0,3': [die('red', 1)], '1,2': [t] })
    expect(scoreTops(b).total).toBe(1)
    const s = tipDie(round4([b, board({})]), t, 'forward')
    expect(s.players[0]?.timeScore).toBe(3)
  })

  it('넘기기로 아래에 숨어 있던 주사위의 색이 드러난다 (넘기기 한 번에 두 칸이 바뀜, §3-3)', () => {
    const t = { ...T(), colors: colorsWith('blue', 4) } // right → 4 = 파랑
    const b = board({ '1,1': [die('red', 1), t], '1,0': [die('red', 1)], '1,3': [die('blue', 1)] })
    const s = tipDie(round4([b, board({})]), t, 'right')
    // (1,0)-(1,1) 빨강 2칸, (1,2)-(1,3) 파랑 2칸
    expect(s.players[0]?.timeScore).toBe(2)
  })

  it('§11-1 공허의 우주가 4차원 점수에 적용된다', () => {
    const s = round4([map('rkr..', '.....', '.....'), board({})], { law: 'void' })
    expect(s.players[0]?.timeScore).toBe(3)
    const std = round4([map('rkr..', '.....', '.....'), board({})])
    expect(std.players[0]?.timeScore).toBe(1)
  })

  it('§9 정산 순서: 끝 사건 뒤에 4차원 점수를 확정한다 (침식으로 꼭대기가 바뀜)', () => {
    const b = () => board({ '0,0': [die('red', 1)], '0,1': [die('red', 1)], '0,2': [die('blue', 1), die('red', 2)] })
    expect(round4([b(), board({})]).players[0]?.timeScore).toBe(3)
    const eroded = round4([b(), board({})], { events: ['erosion', 'timeRift'] })
    expect(eroded.players[0]?.timeScore).toBe(2)
    expect(eroded.players[0]?.debris).toHaveLength(1)
  })

  it('finishRound4: 이미 확정된 1~3차원 점수는 바꾸지 않는다', () => {
    const s0 = stage([map('rrrrr', '.....', '.....'), board({})])
    const s = finishRound4({
      ...s0,
      time: { pending: [[], []], free: [0, 0], events: [] },
      players: s0.players.map((p) => ({ ...p, lineScore: 1, planeScore: 2, towerScore: 3 })),
    })
    expect(s.players[0]).toMatchObject({ lineScore: 1, planeScore: 2, towerScore: 3, timeScore: 5 })
    expect(s.phase).toEqual({ kind: 'ended' })
  })
})
