// 온라인 멀티 메시지 형식 (클라이언트·서버 공용). 서버가 규칙 엔진으로 정산하고, 각자에게는 볼 수 있는 정보만 보낸다.
import type { AiLevel, GameState, Guesses, RoundBid } from '../core';

/** 대기실·게임 자리 (게임 중에는 인덱스 = 에이전트 인덱스) */
export interface SeatView {
  kind: 'human' | 'ai';
  name: string;
  /** 사람 자리의 공개 id (재접속 토큰과 다르다) */
  pid?: string;
  online?: boolean;
  level?: AiLevel;
}

export interface RoomView {
  code: string;
  /** 내 공개 id */
  me: string;
  host: string;
  seats: SeatView[];
  /** 게임 (다른 사람 비밀 구단·이후 이벤트·난수 상태는 가려져 있다). 없으면 대기실 */
  game: GameState | null;
  /** 내 자리 (게임 중) */
  mySeat: number | null;
  /** 이번 단계(제안·지목·다음 라운드 준비)를 마친 자리 */
  done: number[];
  /** 이번 라운드에 내가 낸 제안 (재접속 시 대기 화면용) */
  myBid: RoundBid | null;
}

export type ClientMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'leave' }
  | { t: 'add-ai' }
  | { t: 'ai-level'; seat: number }
  | { t: 'remove-seat'; seat: number }
  | { t: 'kick'; pid: string }
  | { t: 'start' }
  | { t: 'bid'; round: number; bid: RoundBid }
  | { t: 'ready'; round: number }
  | { t: 'guess'; picks: Guesses }
  | { t: 'rematch' }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'joined'; code: string; token: string }
  | { t: 'room'; room: RoomView }
  | { t: 'rejoin-failed' }
  | { t: 'left' }
  | { t: 'kicked' }
  | { t: 'error'; msg: string }
  | { t: 'pong' };

export const ROOM_CODE_RE = /^[A-Z0-9]{4}$/;
