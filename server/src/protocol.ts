import type { GameAction } from './engine/actions';
import type { Division } from './engine/types';
import type { GameView } from './engine/view';

// WebSocket 메시지 (JSON). 클라이언트와 공유하는 계약

export interface RoomPlayerView {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
}

export interface RoomView {
  code: string;
  status: 'lobby' | 'playing' | 'over';
  division: Division;
  players: RoomPlayerView[];
}

export type ClientMessage =
  | { type: 'createRoom'; name: string; seed?: number }
  | { type: 'joinRoom'; code: string; name: string }
  | { type: 'rejoin'; code: string; playerId: string; token: string }
  | { type: 'spectate'; code: string }
  | { type: 'setDivision'; division: Division }
  | { type: 'startGame' }
  | { type: 'action'; action: GameAction };

export type ServerMessage =
  | { type: 'joined'; code: string; playerId: string; token: string }
  | { type: 'spectating'; code: string }
  | { type: 'room'; room: RoomView }
  | { type: 'state'; view: GameView }
  | { type: 'error'; message: string };
