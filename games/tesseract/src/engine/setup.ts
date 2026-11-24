/**
 * 게임 생성과 주사위 수급 (§4 구성물, §5 게임 준비)
 */
import {
  LAW_DECK,
  PERSONAL_GOAL_DECK,
  PERSONAL_GOAL_DRAW,
  roundGoalDeck,
  type LawId,
  type RoundGoalId,
} from './cards'
import { allOrientations, FACES, faceValue, layoutClasses, type DieLayout, type Face, type FaceColors } from './dice'
import { EVENT_DECK } from './events'
import { revealRoundGoals } from './goals'
import { createRng, drawOne, nextInt, shuffle, type RngState } from './rng'
import {
  COLORS,
  type Board,
  type Die,
  type GameConfig,
  type GameState,
  type PlayerState,
  type RolledDie,
  type Round,
  type StartRoll,
} from './types'

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4
/** 전용 주사위 수 (§4) */
export const DICE_COUNT = 120
export const BOARD_ROWS = 3
export const BOARD_COLS = 5
/** 시장 보드에 인쇄된 칸 수 (4인 + 풍요의 우주) */
export const MARKET_BOARD_SLOTS = 5

/** 쓰는 시장 칸 수: 플레이어 수 (§5). 풍요의 우주는 +1 (§11-1) */
export function marketSlotCount(playerCount: number, law: LawId = 'standard'): number {
  return law === 'abundance' ? playerCount + 1 : playerCount
}

/** 칸마다 넣는 주사위 수: 라운드 번호 (§5 시장 채우기). 4라운드에는 시장을 쓰지 않는다. */
export function dicePerSlot(round: Round): number {
  if (round === 4) throw new Error('4라운드에는 시장을 쓰지 않습니다.')
  return round
}

/**
 * 시장 채우기 (§5): 주머니에서 뽑아 굴린 뒤 1번 칸부터 순서대로, 칸마다 perSlot개.
 * 주머니가 모자라면 남은 만큼만 채운다.
 */
export function fillMarket(
  rng: RngState,
  bag: readonly Die[],
  slotCount: number,
  perSlot: number,
): [RolledDie[][], Die[], RngState] {
  let r = rng
  let rest = bag.slice()
  const market: RolledDie[][] = []
  for (let s = 0; s < slotCount; s++) {
    const slot: RolledDie[] = []
    for (let i = 0; i < perSlot; i++) {
      let rolled: RolledDie | null
      ;[rolled, rest, r] = drawAndRoll(r, rest)
      if (rolled) slot.push(rolled)
    }
    market.push(slot)
  }
  return [market, rest, r]
}

/** 굴리기: 그 주사위의 24가지 방향 중 하나가 균등하게 나온다 */
export function roll(rng: RngState, die: Die): [RolledDie, RngState] {
  const orientations = allOrientations(die.layout)
  const [i, next] = nextInt(rng, orientations.length)
  const orientation = orientations[i]
  if (!orientation) throw new Error('roll: 방향 인덱스 오류')
  return [{ id: die.id, colors: die.colors, layout: die.layout, orientation }, next]
}

/** 주머니에서 무작위로 1개 뽑아 굴린다. 주머니가 비면 null */
export function drawAndRoll(
  rng: RngState,
  bag: readonly Die[],
): [RolledDie | null, Die[], RngState] {
  if (bag.length === 0) return [null, bag.slice(), rng]
  const [die, rest, r1] = drawOne(rng, bag)
  const [rolled, r2] = roll(r1, die)
  return [rolled, rest, r2]
}

/** 무작위 면 배치 (§2 v0.6: 주사위마다 다름). 여섯 면을 여섯 자리에 섞어 넣으면 30가지 배치가 고르게 나온다 */
export function randomLayout(rng: RngState): [DieLayout, RngState] {
  const [faces, next] = shuffle(rng, FACES)
  return [faces as unknown as DieLayout, next]
}

/** 숫자 면 1~5에 다섯 색을 무작위로 하나씩 (§2 면의 색, v0.7) */
export function randomFaceColors(rng: RngState): [FaceColors, RngState] {
  const [colors, next] = shuffle(rng, COLORS)
  return [colors as unknown as FaceColors, next]
}

/** 면 배치 하나당 주사위 수 (§2 v0.8: 30가지 × 4개 = 120개) */
export const DICE_PER_LAYOUT = 4

/**
 * 전용 주사위 120개 (§4). 면 배치는 30가지가 4개씩(§2), 숫자 면의 색은 시드로 정한다.
 * 주머니에서 무작위로 뽑으므로 id 순서대로 배치를 나눠 줘도 된다
 */
export function createDice(rng: RngState): [Die[], RngState] {
  const layouts = layoutClasses()
  let r = rng
  const dice: Die[] = []
  for (let id = 0; id < DICE_COUNT; id++) {
    const layout = layouts[Math.floor(id / DICE_PER_LAYOUT) % layouts.length] as DieLayout
    let colors: FaceColors
    ;[colors, r] = randomFaceColors(r)
    dice.push({ id, colors, layout })
  }
  return [dice, r]
}

export function createBoard(): Board {
  return {
    cells: Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => [])),
  }
}

/**
 * 시작 플레이어 정하기 (§5-6): 모두 1개씩 굴려 가장 높은 숫자(⧗ = 0)가 시작.
 * 가장 높은 사람이 여럿이면 그 사람들끼리 다시 굴린다.
 */
export function rollForStartPlayer(
  rng: RngState,
  playerCount: number,
): [number, StartRoll[], RngState] {
  let contenders = Array.from({ length: playerCount }, (_, i) => i)
  const history: StartRoll[] = []
  let r = rng
  while (contenders.length > 1) {
    const round: StartRoll = []
    for (const player of contenders) {
      let i: number
      ;[i, r] = nextInt(r, FACES.length)
      round.push({ player, face: FACES[i] as Face })
    }
    history.push(round)
    const best = Math.max(...round.map((x) => faceValue(x.face)))
    contenders = round.filter((x) => faceValue(x.face) === best).map((x) => x.player)
  }
  return [contenders[0] as number, history, r]
}

export function createGame(config: GameConfig): GameState {
  const { playerCount, seed } = config
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(`플레이어 수는 ${MIN_PLAYERS}~${MAX_PLAYERS}명이어야 합니다 (${playerCount})`)
  }
  if (config.law !== undefined && !LAW_DECK.includes(config.law)) throw new Error(`쓸 수 없는 우주 법칙입니다 (${config.law})`)

  // §5-6 시작 플레이어
  const [startPlayer, startRolls, r1] = rollForStartPlayer(createRng(seed), playerCount)
  const [dice, r2] = createDice(r1)
  // §5-1 우주 법칙 1장
  let law: LawId
  let r3 = r2
  if (config.law !== undefined) law = config.law
  else [law, , r3] = drawOne(r2, LAW_DECK)
  // §5-3 개인 목표 2장씩
  const [personalDeck, r4] = shuffle(r3, PERSONAL_GOAL_DECK)
  // §5-4 라운드 목표를 라운드별로 섞어 더미로
  let r5 = r4
  const goalDecks: RoundGoalId[][] = []
  for (const round of [1, 2, 3, 4] as const) {
    let deck: RoundGoalId[]
    ;[deck, r5] = shuffle(r5, roundGoalDeck(round))
    goalDecks.push(deck)
  }
  // §5-4 사건 카드 더미
  const [eventDeck, r6] = shuffle(r5, EVENT_DECK)
  // §5 라운드 시작: 1라운드 시장 채우기
  const [market, bag, rng] = fillMarket(r6, dice, marketSlotCount(playerCount, law), dicePerSlot(1))

  const players: PlayerState[] = Array.from({ length: playerCount }, (_, id) => ({
    id,
    board: createBoard(),
    debris: [],
    lineScore: null,
    planeScore: null,
    towerScore: null,
    timeScore: null,
    personalOffer: personalDeck.slice(id * PERSONAL_GOAL_DRAW, (id + 1) * PERSONAL_GOAL_DRAW),
    personalGoal: null,
    timeDice: null,
  }))

  const state: GameState = {
    schema: 3,
    config: { playerCount, seed, ...(config.law !== undefined ? { law: config.law } : {}) },
    rng,
    phase: { kind: 'setup' },
    bag,
    market,
    players,
    startRolls,
    startPlayer,
    leadPlayer: startPlayer,
    currentPlayer: startPlayer,
    turn: { circuit: 0, picks: 0, hand: [], taken: false, rerolled: false, handRerolled: false },
    time: null,
    law,
    goalDecks,
    roundGoals: [],
    eventDeck,
  }
  return revealRoundGoals(state, 1)
}
