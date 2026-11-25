/** 클라이언트 ↔ 서버 메시지(WebSocket, JSON). 모든 게임이 같은 형식을 쓰고 action·view·options 만 게임마다 다르다. */
import type { LogEntry } from './match'

export type ClientMessage =
  | { t: 'create'; name: string; seats: number; bots?: number[]; options?: unknown }
  | { t: 'join'; code: string; name: string }
  | { t: 'resume'; code: string; token: string }
  | { t: 'watch'; code: string }
  /** 방장: 대기실의 자리를 봇으로 바꾸거나 비운다 */
  | { t: 'seat'; seat: number; kind: 'bot' | 'open' }
  | { t: 'start' }
  /** version 은 이 행동을 고를 때 본 상태. 혼자 둘 차례면 어긋난 행동(두 번 누름)을 거절한다 */
  | { t: 'act'; action: unknown; version?: number }
  | { t: 'leave' }

export type RoomStatus = 'lobby' | 'playing' | 'over'

export interface SeatView {
  kind: 'human' | 'bot' | 'open'
  name: string
  online: boolean
}

export interface RoomSnapshot<V = unknown> {
  /** 한 기기 대전이면 null */
  code: string | null
  status: RoomStatus
  seats: SeatView[]
  /** 내 좌석. 관전이면 null */
  you: number | null
  host: number
  version: number
  actors: number[]
  view: V | null
  log: LogEntry[]
  options: unknown
}

export type ErrorReason =
  /** 방이 없다(재시작·정리). 저장한 접속 정보를 버린다 */
  | 'no-room'
  /** 그 방의 참가자가 아니다. 저장한 접속 정보를 버린다 */
  | 'bad-token'
  | 'full'
  | 'busy'
  | 'bad-request'
  /** 규칙·상태상 할 수 없다 */
  | 'rejected'

export type ServerMessage =
  /** 방에 들어왔다. 관전이면 token·seat 이 null */
  | { t: 'joined'; code: string; token: string | null; seat: number | null }
  | { t: 'room'; room: RoomSnapshot }
  | { t: 'error'; reason: ErrorReason; message: string }
  | { t: 'left' }
