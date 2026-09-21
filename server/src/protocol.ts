import type { GameAction } from './engine/actions';
import type { Division } from './engine/types';
import type { GameView } from './engine/view';

// WebSocket 메시지 (JSON). 클라이언트와 공유하는 계약

export interface RoomPlayerView {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
}

export interface RoomView {
  code: string;
  status: 'lobby' | 'playing' | 'over';
  division: Division;
  players: RoomPlayerView[];
}

// 방 채팅 (test_insight C9): 게임 상태와 별개로 방에 쌓이고, 대기실·게임 중 모두 쓴다. 관전자는 읽기만
export interface ChatMessage {
  id: number;
  playerId: string;
  name: string;
  text: string;
  at: number; // epoch ms
}
export const CHAT_MAX_LENGTH = 200;

export type ClientMessage =
  | { type: 'createRoom'; name: string; seed?: number }
  | { type: 'joinRoom'; code: string; name: string }
  | { type: 'rejoin'; code: string; playerId: string; token: string }
  | { type: 'spectate'; code: string }
  | { type: 'setDivision'; division: Division }
  | { type: 'addBot' }
  | { type: 'removeBot'; playerId: string }
  | { type: 'kick'; playerId: string } // 호스트가 대기실에서 참가자를 내보낸다 (봇 포함, 자기 자신 제외)
  | { type: 'startGame' }
  | { type: 'action'; action: GameAction }
  | { type: 'chat'; text: string };

export type ServerMessage =
  | { type: 'joined'; code: string; playerId: string; token: string }
  | { type: 'spectating'; code: string }
  | { type: 'kicked' } // 호스트가 이 참가자를 방에서 내보냈다 (클라이언트는 세션을 지우고 로비로)
  | { type: 'room'; room: RoomView }
  | { type: 'state'; view: GameView }
  | { type: 'chat'; messages: ChatMessage[] } // 방의 최근 채팅 전체 (입장·재접속 때, 새 메시지마다)
  | { type: 'error'; message: string };
