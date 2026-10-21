/**
 * 게임 상태 타입. 모든 상태는 직렬화 가능한 JSON이어야 한다 (CLAUDE.md 아키텍처 원칙).
 */
import type { Face, Orientation } from './dice'
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
  /** 버리거나 못 놓거나 무너진 주사위. 게임 끝에 1개당 -1점 (§2) */
  debris: Die[]
  /** 2라운드 끝에 확정한 평면 점수 (§7). 확정 전에는 null */
  planeScore: number | null
}

export type Round = 1 | 2 | 3 | 4

export type Phase = { kind: 'round'; round: Round } | { kind: 'ended' }

export interface GameConfig {
  playerCount: number
  seed: number
}

/**
 * 시장 (§5 시장 채우기). 칸 하나 = 주사위 묶음 하나 (라운드 번호만큼).
 * 쓰는 칸 수 = 플레이어 수. null = 이번 바퀴에 이미 가져간 칸.
 * (빈 배열은 주머니가 떨어져 채우지 못한 칸)
 */
export type Market = (RolledDie[] | null)[]

/** 1~3라운드 턴 진행 상태 */
export interface TurnState {
  /** 라운드 안에서 몇 번째 바퀴인지 (0부터) */
  circuit: number
  /** 이번 바퀴에 턴을 마친 사람 수 */
  picks: number
  /** 현재 플레이어가 가져와서 아직 놓지 않은 주사위. 비어 있으면 칸을 고를 차례 */
  hand: RolledDie[]
  /** 이번 턴에 칸을 이미 가져갔는지 */
  taken: boolean
}

/** 시작 플레이어 결정 굴림 한 번 (§5-6). 동점이면 동점자끼리 다음 굴림 */
export type StartRoll = { player: number; face: Face }[]

export interface GameState {
  /** 상태 스키마 버전 (저장/동기화 호환성용) */
  schema: 1
  config: GameConfig
  rng: RngState
  phase: Phase
  bag: Die[]
  market: Market
  players: PlayerState[]
  /** 시작 플레이어를 정한 굴림 기록 (화면 연출용) */
  startRolls: StartRoll[]
  /** 게임 시작 플레이어 (첫 선) */
  startPlayer: number
  /** 이번 바퀴의 선. 바퀴가 끝나면 왼쪽(id + 1, 순환)으로 넘어간다 (§5 바퀴 끝) */
  leadPlayer: number
  currentPlayer: number
  turn: TurnState
}
