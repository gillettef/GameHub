/** 마지막 돌: 돌아가며 1~3개를 가져가고, 마지막 돌을 가져간 사람이 이긴다 */
export interface State {
  stones: number
  turn: number
  players: number
  winner: number | null
}

export const START = 21
export const MAX_TAKE = 3

export function createGame(players: number): State {
  return { stones: START, turn: 0, players, winner: null }
}

/** 지금 가져갈 수 있는 개수들 */
export function legalTakes(s: State): number[] {
  if (s.winner !== null) return []
  return Array.from({ length: Math.min(MAX_TAKE, s.stones) }, (_, i) => i + 1)
}

export function take(s: State, count: number): State {
  if (!legalTakes(s).includes(count)) throw new Error(`${count}개는 가져갈 수 없습니다.`)
  const stones = s.stones - count
  return { ...s, stones, turn: (s.turn + 1) % s.players, winner: stones === 0 ? s.turn : null }
}
