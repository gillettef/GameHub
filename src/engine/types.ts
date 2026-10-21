/**
 * 게임 상태 타입. 모든 상태는 직렬화 가능한 JSON이어야 한다 (CLAUDE.md 아키텍처 원칙).
 */
import type { Orientation } from './dice'
import type { RngState } from './rng'

export type Color = 'red' | 'blue' | 'green' | 'yellow' | 'black'

export const COLORS: readonly Color[] = ['red', 'blue', 'green', 'yellow', 'black']

export type DieId = number

/** 주머니 안의 주사위 (방향 없음) */
export interface Die {
  id: DieId
  color: Color
}

/** 굴려져 방향이 정해진 주사위 (시장, 보드 위) */
export interface RolledDie extends Die {
  orientation: Orientation
}

/** 기둥: 아래(1층)부터 위 순서. 빈 배열 = 진공 또는 아직 비어 있는 칸 */
export type Pillar = RolledDie[]

/**
 * 개인 차원 보드 5×3 (§4).
 * cells[row][col], row 0 = 선(맨 앞줄), row 1·2 = 평면. col 0 = 왼쪽(1번 칸).
 */
export interface Board {
  cells: Pillar[][]
}

export interface PlayerState {
  id: number
  board: Board
  /** 버리거나 무너진 주사위. 게임 끝에 1개당 -1점 (§2) */
  debris: Die[]
}

export type Round = 1 | 2 | 3 | 4

export type Phase = { kind: 'round'; round: Round } | { kind: 'ended' }

export interface GameConfig {
  playerCount: number
  seed: number
}

export interface GameState {
  /** 상태 스키마 버전 (저장/동기화 호환성용) */
  schema: 1
  config: GameConfig
  rng: RngState
  phase: Phase
  bag: Die[]
  /** 시장 칸. null = 빈 칸 */
  market: (RolledDie | null)[]
  players: PlayerState[]
  startPlayer: number
  currentPlayer: number
}
