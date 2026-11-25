// 정원 설계도 A (룰북 v2.3 그림 1). 좌표: x 1..7 = a..g (서→동), y 1..7 (북→남)
export type Seat = 'N' | 'E' | 'S' | 'W'
/** 문양: 좌석 문양 넷과 중립(달) */
export type Crest = Seat | 'X'

export const SIZE = 7
export const DIRS: readonly Seat[] = ['N', 'E', 'S', 'W']
export const DV: Record<Seat, readonly [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }
export const OPP: Record<Seat, Seat> = { N: 'S', S: 'N', E: 'W', W: 'E' }
export const SEATS_CW: readonly Seat[] = ['N', 'E', 'S', 'W']

export const SEAT_INFO: Record<Crest, { label: string; crest: string; color: string }> = {
  N: { label: '북', crest: '장미', color: '#c0392b' },
  E: { label: '동', crest: '수국', color: '#2e6fbf' },
  S: { label: '남', crest: '해바라기', color: '#c99a06' },
  W: { label: '서', crest: '담쟁이', color: '#2e8b57' },
  X: { label: '중립', crest: '달', color: '#9aa0a6' },
}

export const isSeat = (v: unknown): v is Seat => v === 'N' || v === 'E' || v === 'S' || v === 'W'

type Edge = readonly [number, number, Seat]
const rot = ([x, y, d]: Edge): Edge => [8 - y, x, DIRS[(DIRS.indexOf(d) + 1) % 4]!]
function orbit(c: Edge): Edge[] {
  const o = [c]
  for (let i = 0; i < 3; i++) o.push(rot(o[o.length - 1]!))
  return o
}

/** 생울타리: 칸 (x,y)의 d 쪽 변. 양쪽 칸에 모두 기록한다. */
export const HEDGES = new Set<string>()
for (const seed of [[3, 3, 'N'], [2, 2, 'S'], [4, 1, 'S']] as const) {
  for (const [x, y, d] of orbit(seed)) {
    HEDGES.add(`${x},${y},${d}`)
    const [dx, dy] = DV[d]
    HEDGES.add(`${x + dx},${y + dy},${OPP[d]}`)
  }
}

export const PAVILION = [4, 4] as const
export const RENDEZVOUS: readonly (readonly [number, number])[] = [[3, 3], [5, 3], [5, 5], [3, 5]]
/** 시작 칸 번호 1..16 → [x, y, 방향]. 13~16은 4인 전용. */
export const START: readonly Edge[] = [
  [2, 2, 'S'], [3, 2, 'S'], [5, 2, 'E'], [6, 2, 'W'], [2, 3, 'N'], [6, 3, 'W'],
  [2, 5, 'E'], [6, 5, 'S'], [2, 6, 'E'], [3, 6, 'W'], [5, 6, 'N'], [6, 6, 'N'],
  [4, 1, 'S'], [1, 4, 'E'], [7, 4, 'W'], [4, 7, 'N'],
]

export const hasHedge = (x: number, y: number, d: Seat) => HEDGES.has(`${x},${y},${d}`)
export const inBoard = (x: number, y: number) => x >= 1 && x <= SIZE && y >= 1 && y <= SIZE
export const isPavilion = (x: number, y: number) => x === PAVILION[0] && y === PAVILION[1]
export const isRendezvous = (x: number, y: number) => RENDEZVOUS.some(([a, b]) => a === x && b === y)
export const cellName = (x: number, y: number) => `${'abcdefg'[x - 1]}${y}`
