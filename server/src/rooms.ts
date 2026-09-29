import type { WebSocket } from "ws";
import type { BotStrategy } from "./game/bot.js";
import type { GameState } from "./game/types.js";

export interface Player {
  id: string;
  name: string;
  // 봇은 소켓이 없고, 서버가 대신 행동한다
  socket?: WebSocket;
  bot?: BotStrategy;
}

export interface Room {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  game?: GameState;
  botTimer?: ReturnType<typeof setTimeout>;
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

// 사람이 한 명도 남지 않았으면 방을 정리하고 true를 반환한다 (봇만 남은 방이 계속 돌아가는 것을 방지)
export function leaveRoomIfNoHumans(room: Room): boolean {
  if ([...room.players.values()].some((p) => !p.bot)) return false;
  if (room.botTimer) clearTimeout(room.botTimer);
  rooms.delete(room.code);
  return true;
}

export function leaveRoom(code: string, playerId: string): void {
  const room = getRoom(code);
  if (!room) return;
  room.players.delete(playerId);
  if (leaveRoomIfNoHumans(room)) return;
  // 방장이 나가면 남은 사람 중 첫 번째가 방장을 이어받는다
  if (room.hostId === playerId) {
    room.hostId = [...room.players.values()].find((p) => !p.bot)!.id;
  }
}

export function broadcast(room: Room, message: unknown, excludePlayerId?: string): void {
  const payload = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.id === excludePlayerId) continue;
    if (player.socket && player.socket.readyState === player.socket.OPEN) {
      player.socket.send(payload);
    }
  }
}
