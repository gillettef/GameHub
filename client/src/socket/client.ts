/**
 * Socket.io 클라이언트 (F004, F007). 이벤트 이름·타입은 shared/src/types/events.ts 만 쓴다.
 * 요청은 ack 를 Promise 로 감싸고, 서버가 응답하지 않으면 시간 제한으로 실패 처리한다.
 * 재연결은 socket.io 가 알아서 하고, 다시 연결되면 RoomPage 가 room:join 을 다시 보낸다.
 */
import { io, type Socket } from 'socket.io-client';
import type { Ack, Action, ClientToServerEvents, JoinPayload, MapId, PlayerId, RoomId, ServerToClientEvents } from '@astraltab/shared';
import { recordSyncRtt } from '../lib/vitals';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const ACK_TIMEOUT_MS = 5000;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({ autoConnect: false, path: '/socket.io', transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function connectSocket(): AppSocket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

function withTimeout<T extends object>(run: (done: (res: Ack<T>) => void) => void): Promise<Ack<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, message: '서버 응답이 없습니다. 연결을 확인하고 다시 시도하세요' });
    }, ACK_TIMEOUT_MS);
    run((res) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(res);
    });
  });
}

export const api = {
  createRoom(payload: { playerToken: string; nickname: string; password?: string; mapId?: MapId }) {
    return withTimeout<{ roomId: RoomId; playerId: PlayerId }>((done) => connectSocket().emit('room:create', payload, done));
  },
  joinRoom(payload: JoinPayload) {
    return withTimeout<{ playerId: PlayerId }>((done) => connectSocket().emit('room:join', payload, done));
  },
  leaveRoom(roomId: RoomId) {
    return withTimeout((done) => connectSocket().emit('room:leave', { roomId }, done));
  },
  setMap(roomId: RoomId, mapId: MapId) {
    return withTimeout((done) => connectSocket().emit('room:setMap', { roomId, mapId }, done));
  },
  addAi(roomId: RoomId) {
    return withTimeout<{ playerId: PlayerId }>((done) => connectSocket().emit('room:addAi', { roomId }, done));
  },
  removeAi(roomId: RoomId, playerId: PlayerId) {
    return withTimeout((done) => connectSocket().emit('room:removeAi', { roomId, playerId }, done));
  },
  setTurnTime(roomId: RoomId, seconds: number | null) {
    return withTimeout((done) => connectSocket().emit('room:setTurnTime', { roomId, seconds }, done));
  },
  resume(roomId: RoomId) {
    return withTimeout((done) => connectSocket().emit('game:resume', { roomId }, done));
  },
  sendAction(roomId: RoomId, action: Action) {
    const started = performance.now();
    return withTimeout((done) => connectSocket().emit('game:action', { roomId, action }, done)).then((res) => {
      // 동기화 왕복 시간 표본 (F004, 웹 성능 기록 lib/vitals.ts)
      if (res.ok) recordSyncRtt(performance.now() - started);
      return res;
    });
  },
};
