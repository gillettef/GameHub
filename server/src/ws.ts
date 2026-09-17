import type { WebSocket, WebSocketServer } from 'ws';
import { viewFor } from './engine/view';
import type { ClientMessage, ServerMessage } from './protocol';
import { RoomError, RoomManager, roomView } from './rooms';
import type { Room } from './rooms';

interface Session {
  socket: WebSocket;
  roomCode?: string;
  playerId?: string;
}

const MAX_MESSAGE_BYTES = 64 * 1024;

export function attachWebSocket(wss: WebSocketServer, rooms: RoomManager): void {
  const sessions = new Map<WebSocket, Session>();

  const send = (socket: WebSocket, msg: ServerMessage) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
  };

  const broadcast = (room: Room) => {
    const view = roomView(room);
    for (const session of sessions.values()) {
      if (session.roomCode !== room.code || !session.playerId) continue;
      send(session.socket, { type: 'room', room: view });
      if (room.game) send(session.socket, { type: 'state', view: viewFor(room.game, session.playerId) });
    }
  };

  const bind = (session: Session, room: Room, playerId: string, token: string) => {
    // 같은 참가자의 이전 연결은 끊는다
    for (const other of sessions.values()) {
      if (other !== session && other.roomCode === room.code && other.playerId === playerId) {
        other.roomCode = undefined;
        other.playerId = undefined;
        other.socket.close();
      }
    }
    session.roomCode = room.code;
    session.playerId = playerId;
    send(session.socket, { type: 'joined', code: room.code, playerId, token });
    broadcast(room);
  };

  const handle = (session: Session, msg: ClientMessage) => {
    switch (msg.type) {
      case 'createRoom': {
        const { room, player } = rooms.create(msg.name, typeof msg.seed === 'number' ? msg.seed : undefined);
        bind(session, room, player.id, player.token);
        return;
      }
      case 'joinRoom': {
        if (typeof msg.code !== 'string') throw new RoomError('code required');
        const { room, player } = rooms.join(msg.code, msg.name);
        bind(session, room, player.id, player.token);
        return;
      }
      case 'rejoin': {
        if (typeof msg.code !== 'string' || typeof msg.playerId !== 'string' || typeof msg.token !== 'string') throw new RoomError('invalid rejoin');
        const { room, player } = rooms.rejoin(msg.code, msg.playerId, msg.token);
        bind(session, room, player.id, player.token);
        return;
      }
    }

    if (!session.roomCode || !session.playerId) throw new RoomError('join a room first');
    switch (msg.type) {
      case 'setDivision':
        broadcast(rooms.setDivision(session.roomCode, session.playerId, msg.division));
        return;
      case 'startGame':
        broadcast(rooms.start(session.roomCode, session.playerId));
        return;
      case 'action':
        if (!msg.action || typeof msg.action !== 'object' || typeof msg.action.type !== 'string') throw new RoomError('invalid action');
        broadcast(rooms.act(session.roomCode, session.playerId, msg.action));
        return;
      default:
        throw new RoomError(`unknown message type: ${(msg as { type: string }).type}`);
    }
  };

  wss.on('connection', (socket) => {
    const session: Session = { socket };
    sessions.set(socket, session);

    socket.on('message', (raw) => {
      if (raw.toString().length > MAX_MESSAGE_BYTES) {
        send(socket, { type: 'error', message: 'message too large' });
        return;
      }
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        send(socket, { type: 'error', message: 'invalid JSON' });
        return;
      }
      try {
        handle(session, msg);
      } catch (e) {
        if (e instanceof RoomError) send(socket, { type: 'error', message: e.message });
        else {
          console.error(e);
          send(socket, { type: 'error', message: 'internal error' });
        }
      }
    });

    socket.on('close', () => {
      sessions.delete(socket);
      if (session.roomCode && session.playerId) {
        const room = rooms.disconnect(session.roomCode, session.playerId);
        if (room) broadcast(room);
      }
    });
  });
}
