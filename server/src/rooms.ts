import type { WebSocket } from "ws";

export interface Player {
  id: string;
  name: string;
  socket: WebSocket;
}

export interface Room {
  code: string;
  hostId: string;
  players: Map<string, Player>;
}

const rooms = new Map<string, Room>();

function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code: string;
  do {
    code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

export function createRoom(host: Player): Room {
  const code = generateRoomCode();
  const room: Room = { code, hostId: host.id, players: new Map([[host.id, host]]) };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function joinRoom(code: string, player: Player): Room | undefined {
  const room = getRoom(code);
  if (!room) return undefined;
  room.players.set(player.id, player);
  return room;
}

export function leaveRoom(code: string, playerId: string): void {
  const room = getRoom(code);
  if (!room) return;
  room.players.delete(playerId);
  if (room.players.size === 0) {
    rooms.delete(room.code);
  }
}

export function broadcast(room: Room, message: unknown, excludePlayerId?: string): void {
  const payload = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.id === excludePlayerId) continue;
    if (player.socket.readyState === player.socket.OPEN) {
      player.socket.send(payload);
    }
  }
}
