import type { WebSocket, WebSocketServer } from 'ws';
import { BotDriver } from './bot/driver';
import { viewFor } from './engine/view';
import type { ClientMessage, ServerMessage } from './protocol';
import { RoomError, RoomManager, roomView } from './rooms';
import type { Room } from './rooms';

interface Session {
  socket: WebSocket;
  roomCode?: string;
  playerId?: string; // 관전자는 없음
  spectator?: boolean;
}

const MAX_MESSAGE_BYTES = 64 * 1024;
const SPECTATOR_ID = '';

export interface WsOptions {
  botDelayMs?: number;
}

export function attachWebSocket(wss: WebSocketServer, rooms: RoomManager, options: WsOptions = {}): BotDriver {
  const sessions = new Map<WebSocket, Session>();

  const send = (socket: WebSocket, msg: ServerMessage) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
  };

  const broadcast = (room: Room) => {
    const view = roomView(room);
    for (const session of sessions.values()) {
      if (session.roomCode !== room.code) continue;
      if (!session.playerId && !session.spectator) continue;
      send(session.socket, { type: 'room', room: view });
      if (room.game) send(session.socket, { type: 'state', view: viewFor(room.game, session.playerId ?? SPECTATOR_ID) });
    }
  };

  const broadcastChat = (room: Room) => {
    for (const session of sessions.values()) {
      if (session.roomCode !== room.code || (!session.playerId && !session.spectator)) continue;
      send(session.socket, { type: 'chat', messages: room.chat });
    }
  };

  const bots = new BotDriver(rooms, broadcast, options.botDelayMs);

  const detach = (session: Session) => {
    session.roomCode = undefined;
    session.playerId = undefined;
    session.spectator = undefined;
  };

  const bind = (session: Session, room: Room, playerId: string, token: string) => {
    // 같은 참가자의 이전 연결은 끊는다
    for (const other of sessions.values()) {
      if (other !== session && other.roomCode === room.code && other.playerId === playerId) {
        detach(other);
        other.socket.close();
      }
    }
    detach(session);
    session.roomCode = room.code;
    session.playerId = playerId;
    send(session.socket, { type: 'joined', code: room.code, playerId, token });
    send(session.socket, { type: 'chat', messages: room.chat });
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
      case 'spectate': {
        if (typeof msg.code !== 'string') throw new RoomError('code required');
        const room = rooms.get(msg.code);
        detach(session);
        session.roomCode = room.code;
        session.spectator = true;
        send(session.socket, { type: 'spectating', code: room.code });
        send(session.socket, { type: 'chat', messages: room.chat });
        send(session.socket, { type: 'room', room: roomView(room) });
        if (room.game) send(session.socket, { type: 'state', view: viewFor(room.game, SPECTATOR_ID) });
        return;
      }
    }

    if (!session.roomCode || !session.playerId) throw new RoomError(session.spectator ? 'spectators cannot act' : 'join a room first');
    switch (msg.type) {
      case 'setDivision':
        broadcast(rooms.setDivision(session.roomCode, session.playerId, msg.division));
        return;
      case 'addBot':
        broadcast(rooms.addBot(session.roomCode, session.playerId));
        return;
      case 'removeBot':
        if (typeof msg.playerId !== 'string') throw new RoomError('playerId required');
        broadcast(rooms.removeBot(session.roomCode, session.playerId, msg.playerId));
        return;
      case 'startGame': {
        const room = rooms.start(session.roomCode, session.playerId);
        broadcast(room);
        bots.poke(room);
        return;
      }
      case 'action': {
        if (!msg.action || typeof msg.action !== 'object' || typeof msg.action.type !== 'string') throw new RoomError('invalid action');
        const room = rooms.act(session.roomCode, session.playerId, msg.action);
        broadcast(room);
        bots.poke(room);
        return;
      }
      case 'chat':
        broadcastChat(rooms.chat(session.roomCode, session.playerId, msg.text));
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

  return bots;
}
