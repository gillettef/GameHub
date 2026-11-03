// 클라이언트·서버 공용 메시지 (한 곳에서만 정의)
import type { Action, GameState } from '../core/types';

export interface SeatInfo {
  name: string;
  isAI: boolean;
  connected: boolean;
  taken: boolean;
}

export interface LobbyInfo {
  room: string;
  seats: SeatInfo[];
  host: number;
  started: boolean;
}

export type ClientMsg =
  | { t: 'create'; name: string; seats: number }
  | { t: 'join'; room: string; name: string }
  | { t: 'resume'; room: string; token: string }
  | { t: 'start' }
  /** 대기실에서 내 이름 바꾸기(시작 전만) */
  | { t: 'rename'; name: string }
  | { t: 'action'; ver: number; action: Action }
  | { t: 'leave' }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'joined'; room: string; token: string; seat: number }
  | { t: 'lobby'; lobby: LobbyInfo }
  | { t: 'state'; state: GameState; seat: number }
  | { t: 'error'; message: string }
  | { t: 'pong' };

export const ROOM_CODE_LENGTH = 4;
export const NAME_MAX = 12;
