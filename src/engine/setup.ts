/**
 * 게임 생성과 주사위 수급 (§4 구성물, §5 게임 준비)
 */
import { ALL_ORIENTATIONS, FACES, faceValue, type Face } from './dice'
import { createRng, drawOne, nextInt, type RngState } from './rng'
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
export const DICE_PER_COLOR = 24
export const BOARD_ROWS = 3
export const BOARD_COLS = 5
/** 시장 보드에 인쇄된 칸 수 (4인 + 풍요의 우주) */
export const MARKET_BOARD_SLOTS = 5

/** 쓰는 시장 칸 수: 플레이어 수 (§5) */
export function marketSlotCount(playerCount: number): number {
  return playerCount
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

/** 굴리기: 24가지 방향 중 하나가 균등하게 나온다 */
export function roll(rng: RngState, die: Die): [RolledDie, RngState] {
  const [i, next] = nextInt(rng, ALL_ORIENTATIONS.length)
  const orientation = ALL_ORIENTATIONS[i]
  if (!orientation) throw new Error('roll: 방향 인덱스 오류')
  return [{ id: die.id, color: die.color, orientation: { ...orientation } }, next]
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

export function createDice(): Die[] {
  return COLORS.flatMap((color, c) =>
    Array.from({ length: DICE_PER_COLOR }, (_, i) => ({ id: c * DICE_PER_COLOR + i, color })),
  )
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

  const players: PlayerState[] = Array.from({ length: playerCount }, (_, id) => ({
    id,
    board: createBoard(),
    debris: [],
    planeScore: null,
  }))

  // §5-6 시작 플레이어 → §5 라운드 시작: 1라운드 시장 채우기
  const [startPlayer, startRolls, rngAfterStart] = rollForStartPlayer(createRng(seed), playerCount)
  const [market, bag, rng] = fillMarket(
    rngAfterStart,
    createDice(),
    marketSlotCount(playerCount),
    dicePerSlot(1),
  )

  return {
    schema: 1,
    config: { playerCount, seed },
    rng,
    phase: { kind: 'round', round: 1 },
    bag,
    market,
    players,
    startRolls,
    startPlayer,
    leadPlayer: startPlayer,
    currentPlayer: startPlayer,
    turn: { circuit: 0, picks: 0, hand: [], taken: false },
    time: null,
  }
}
