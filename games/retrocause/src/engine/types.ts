// RETROCAUSE 엔진의 자료형. 모양은 옛 엔진(prototype/src/*.js)과 같다(같은 시드·행동에서 JSON 이 같아야 비교 테스트가 통과한다).

export type Figure = '하인' | '왕비' | '대신' | '경비대장' | '궁정 의사' | '광대'

/** 대상(성·왕·금고·경비·성문)과 그 두 상태. 첫 상태가 시작 상태다 */
export interface Subject {
  id: string
  states: [string, string]
}

/** 사실: 대상 = 상태 */
export interface Fact {
  subject: string
  state: string
}

export interface Card {
  id: string
  title: string
  figure: Figure
  cond: Fact | null
  effect: Fact
}

export interface Rules {
  slotsByPlayers: Record<number, number>
  handSize: number
  points: { decisive: number; card: number; deduction: number; paradox: number }
}

export type Action = { type: 'place'; cardId: string; slot: number } | { type: 'exchange'; cardId: string } | { type: 'pass' }

export type ContradictionKind = 'condition' | 'ending'
export type IllegalReason = 'occupied' | ContradictionKind

export interface Removed {
  slot: number
  cardId: string
  kind: ContradictionKind
}

/** 공개 기록 한 줄 */
export interface HistoryEntry {
  player: number
  type: Action['type']
  round: number
  cardId?: string
  slot?: number
  removed?: Removed[]
}

export interface Game {
  rules: Rules
  seed: number
  rngState: number
  names: string[]
  endings: Fact[]
  motives: Figure[]
  timeline: (string | null)[]
  deck: string[]
  discard: string[]
  hands: string[][]
  paradox: number[]
  current: number
  round: number
  turns: number[]
  finalRound: boolean
  over: boolean
  history: HistoryEntry[]
  stats: { cascades: number; removedCards: number; endTrigger: 'timeline' | 'deck' | null }
}

/** 추리: 상대 번호(문자열 키) → 인물 */
export type Guess = Record<string, Figure>

export interface ScoreRow {
  player: number
  name: string
  figure: Figure
  decisive: number
  cards: number
  correct: number
  paradox: number
  total: number
}

export interface DecisiveInfo {
  ending: Fact
  slot?: number
  cardId?: string
  figure: Figure | null
}

export interface Score {
  rows: ScoreRow[]
  winners: number[]
  decisive: DecisiveInfo[]
  unresolved: Fact[]
}
