// 온라인 대전 메시지 형식 (클라이언트 ↔ 서버, JSON)
import type { BotLevel, GameState, Intervention } from '../core/types';

export const ROOM_CODE_RE = /^[A-Z2-9]{4}$/;

export type ClientMsg =
  | { t: 'ping' }
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'leave' }
  | { t: 'add-bot' }
  | { t: 'bot-level'; seat: number }
  | { t: 'remove-seat'; seat: number }
  | { t: 'start' }
  | { t: 'design'; round: number; slots: number[] }
  | { t: 'intervene'; round: number; turn: number; iv: Intervention }
  | { t: 'rematch' };

export interface SeatView {
  name: string;
  kind: 'human' | 'bot';
  level: BotLevel;
  /** 사람 자리면 그 사람 pid */
  pid: string | null;
  online: boolean;
}

export interface RoomView {
  code: string;
  host: string;
  me: string;
  /** 대기실이면 대기 자리, 게임 중이면 게임 자리 순서 */
  seats: SeatView[];
  /** 내 게임 자리 (관전·대기실이면 null) */
  mySeat: number | null;
  /** 나에게 보여도 되는 정보만 남긴 게임 상태 */
  game: GameState | null;
}

export type ServerMsg =
  | { t: 'pong' }
  | { t: 'joined'; code: string; token: string; pid: string }
  | { t: 'room'; room: RoomView }
  | { t: 'error'; msg: string }
  | { t: 'left' };
