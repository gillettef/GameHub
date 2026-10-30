import type { WebSocket, WebSocketServer } from 'ws';
import { BotDriver } from './bot/driver';
import { viewFor } from './engine/view';
import type { ClientMessage, ServerMessage } from './protocol';
import { RoomError, RoomManager, roomView } from './rooms';
import type { Room } from './rooms';

interface Session {
  socket: WebSocket;
  tokens: number; // 속도 제한용 (토큰 버킷)
  refilledAt: number;
  created: number; // 이 연결로 만든 방 수
  alive: boolean; // 하트비트: 마지막 ping 이후 pong 을 받았는가
  roomCode?: string;
  playerId?: string; // 관전자는 없음
  spectator?: boolean;
}

const MAX_MESSAGE_BYTES = 64 * 1024;
const SPECTATOR_ID = '';
const RATE_BURST = 30; // 소켓 하나가 한꺼번에 보낼 수 있는 메시지 수
const RATE_PER_SEC = 10; // 이후 초당 회복량
const MAX_ROOMS_PER_SOCKET = 5; // 연결 하나로 만들 수 있는 방 수
const HEARTBEAT_MS = 30_000;

export interface WsOptions {
  noRateLimit?: boolean; // 테스트 전용: 지연 없이 보내는 외부 봇을 위해 속도 제한을 끈다
  allowClientSeed?: boolean; // 테스트 전용: createRoom 의 seed 를 받는다 (운영에서는 무시 — 시드를 알면 비공개 카드를 추측할 수 있다)
  botDelayMs?: number;
  botWatchMs?: number; // 봇이 경기 영향 주사위 전에 기다리는 경기 보기 시간
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

  const bots = new BotDriver(rooms, broadcast, options.botDelayMs, options.botWatchMs);

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
        if (session.created >= MAX_ROOMS_PER_SOCKET) throw new RoomError('too many rooms');
        session.created++;
        const { room, player } = rooms.create(msg.name, options.allowClientSeed && typeof msg.seed === 'number' ? msg.seed : undefined);
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
      case 'setEmblem':
        broadcast(rooms.setEmblem(session.roomCode, session.playerId, msg.emblem));
        return;
      case 'addBot':
        broadcast(rooms.addBot(session.roomCode, session.playerId));
        return;
      case 'removeBot':
        if (typeof msg.playerId !== 'string') throw new RoomError('playerId required');
        broadcast(rooms.removeBot(session.roomCode, session.playerId, msg.playerId));
        return;
      case 'kick': {
        if (typeof msg.playerId !== 'string') throw new RoomError('playerId required');
        const { room, kicked } = rooms.kick(session.roomCode, session.playerId, msg.playerId);
        // 내보낸 참가자의 연결에 알리고 방에서 떼어 낸다 (연결은 유지 — 로비로 돌아가 다른 방에 들어갈 수 있다)
        for (const other of sessions.values()) {
          if (other.roomCode === room.code && other.playerId === kicked.id) {
            send(other.socket, { type: 'kicked' });
            detach(other);
          }
        }
        broadcast(room);
        return;
      }
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
      case 'rematch': {
        const room = rooms.rematch(session.roomCode, session.playerId);
        bots.forgetRoom(room.code); // 봇 기억(난수·거부 기록)도 새 판으로
        broadcast(room);
        return;
      }
      case 'matchWatched':
        bots.rewatch(rooms.markWatched(session.roomCode, session.playerId, msg.week, msg.actor));
        return;
      case 'chat':
        broadcastChat(rooms.chat(session.roomCode, session.playerId, msg.text));
        return;
      default:
        throw new RoomError(`unknown message type: ${(msg as { type: string }).type}`);
    }
  };

  wss.on('connection', (socket) => {
    const session: Session = { socket, tokens: RATE_BURST, refilledAt: Date.now(), created: 0, alive: true };
    sessions.set(socket, session);
    socket.on('pong', () => (session.alive = true));

    socket.on('message', (raw) => {
      const now = Date.now();
      session.tokens = Math.min(RATE_BURST, session.tokens + ((now - session.refilledAt) / 1000) * RATE_PER_SEC);
      session.refilledAt = now;
      if (!options.noRateLimit && session.tokens < 1) {
        send(socket, { type: 'error', message: 'too many requests' });
        return;
      }
      session.tokens -= 1;
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

  // 하트비트: 응답 없는 반쯤 끊긴 연결을 정리해 '연결됨'으로 남지 않게 한다
  const heartbeat = setInterval(() => {
    for (const s of sessions.values()) {
      if (!s.alive) {
        s.socket.terminate();
        continue;
      }
      s.alive = false;
      s.socket.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));

  return bots;
}
