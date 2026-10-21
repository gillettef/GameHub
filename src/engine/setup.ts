/**
 * 게임 생성과 주사위 수급 (§4 구성물, §5 게임 준비)
 */
import { ALL_ORIENTATIONS } from './dice'
import { createRng, drawOne, nextInt, type RngState } from './rng'
import {
  COLORS,
  type Board,
  type Die,
  type GameConfig,
  type GameState,
  type PlayerState,
  type RolledDie,
} from './types'

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4
export const DICE_PER_COLOR = 24
export const BOARD_ROWS = 3
export const BOARD_COLS = 5
export const MARKET_SLOTS = 6

/** 시장에 놓는 주사위 수: 플레이어 수 + 2 (§5) */
export function marketSize(playerCount: number): number {
  return playerCount + 2
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

export function createGame(config: GameConfig): GameState {
  const { playerCount, seed } = config
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(`플레이어 수는 ${MIN_PLAYERS}~${MAX_PLAYERS}명이어야 합니다 (${playerCount})`)
  }

  let rng = createRng(seed)
  let bag = createDice()

  const market: (RolledDie | null)[] = []
  for (let i = 0; i < marketSize(playerCount); i++) {
    let rolled: RolledDie | null
    ;[rolled, bag, rng] = drawAndRoll(rng, bag)
    market.push(rolled)
  }

  const players: PlayerState[] = Array.from({ length: playerCount }, (_, id) => ({
    id,
    board: createBoard(),
    debris: [],
  }))

  return {
    schema: 1,
    config: { playerCount, seed },
    rng,
    phase: { kind: 'round', round: 1 },
    bag,
    market,
    players,
    startPlayer: 0,
    currentPlayer: 0,
  }
}
