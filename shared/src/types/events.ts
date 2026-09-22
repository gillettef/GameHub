/**
 * Socket.io 이벤트 이름과 페이로드 타입의 단일 정의.
 * 서버·클라이언트 모두 이 파일만 참조한다. 문자열 리터럴 하드코딩 금지.
 */
import type { Action, GameState } from './index.js';

/** 클라이언트 → 서버 */
export interface ClientToServerEvents {
  'room:join': (payload: { roomId: string; playerToken: string; nickname: string }) => void;
  'game:action': (payload: { roomId: string; action: Action }) => void;
}

/** 서버 → 클라이언트 */
export interface ServerToClientEvents {
  'game:state': (state: GameState) => void;
  'game:error': (payload: { message: string }) => void;
}
