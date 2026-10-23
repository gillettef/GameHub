/**
 * 온라인 대전 메시지 형식 (로드맵 8단계). 클라이언트와 서버(server/)가 함께 쓴다.
 *
 * 동기화 방식: 엔진이 결정적이므로 상태 대신 **행동 기록**을 주고받는다.
 * 서버가 기록의 원본을 갖고, 행동마다 엔진으로 검증한 뒤 모두에게 보낸다. 봇은 서버가 둔다.
 */
import type { Action, GameConfig, LawId } from '../engine'
import type { Seat } from './session'

export interface RoomSnapshot {
  id: string
  createdAt: number
  config: GameConfig
  seats: Seat[]
  actions: Action[]
  /** 자리별로 들어온 사람이 있는지 (봇 자리는 true) */
  claimed: boolean[]
}

export type ClientMessage =
  | { t: 'create'; token: string; seats: Seat[]; law: LawId | 'random' }
  | { t: 'join'; token: string; room: string; name: string }
  | { t: 'action'; token: string; room: string; index: number; action: Action }

export type ServerMessage =
  | { t: 'joined'; room: string; snapshot: RoomSnapshot; you: number[] }
  | { t: 'actions'; room: string; from: number; actions: Action[] }
  | { t: 'seats'; room: string; seats: Seat[]; claimed: boolean[] }
  | { t: 'error'; message: string }
