import type { WebSocket } from "ws";
import type { BotStrategy } from "./game/bot.js";
import type { GameState } from "./game/types.js";

export interface Player {
  id: string;
  name: string;
  // 봇은 소켓이 없고, 서버가 대신 행동한다
  socket?: WebSocket;
  bot?: BotStrategy;
  // 접속이 끊긴 사람을 기다리는 유예 타이머 (그 안에 돌아오면 같은 자리로 복귀)
  graceTimer?: ReturnType<typeof setTimeout>;
  // 접속이 끊겨 봇이 대신 맡게 된 사람 (돌아오면 다시 사람에게 돌려준다)
  wasHuman?: boolean;
  // 방장이 내보냈거나 스스로 나가서 봇이 영구히 이어받은 자리 (다시 하기 때 방에서 뺀다)
  left?: boolean;
  // 제한 시간 안에 행동하지 못한 연속 횟수 (직접 행동하면 0으로 돌아간다)
  strikes?: number;
  // 이모지를 마지막으로 보낸 시각 (도배 방지)
  lastEmojiAt?: number;
}

export interface Room {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  game?: GameState;
  botTimer?: ReturnType<typeof setTimeout>;
  // 게임 종료 후 방을 자동 삭제하기 위한 타이머
  expireTimer?: ReturnType<typeof setTimeout>;
  // 한 번 행동하는 데 주어지는 시간(초), 0이면 제한 없음 (방장이 대기실에서 정한다)
  turnSeconds: number;
  // 지금 행동을 기다리는 사람들의 마감 시각 (fp: 어떤 상황에서 기다리는지, 상황이 바뀌면 마감도 새로 시작)
  waits: Map<string, { fp: string; deadline: number }>;
  turnTimer?: ReturnType<typeof setTimeout>;
}

export const DEFAULT_TURN_SECONDS = 90;
export const TURN_SECONDS_OPTIONS = [0, 45, 90, 180];

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
  const room: Room = { code, hostId: host.id, players: new Map([[host.id, host]]), turnSeconds: DEFAULT_TURN_SECONDS, waits: new Map() };
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
  deleteRoom(room);
  return true;
}

export function deleteRoom(room: Room): void {
  if (room.botTimer) clearTimeout(room.botTimer);
  if (room.expireTimer) clearTimeout(room.expireTimer);
  if (room.turnTimer) clearTimeout(room.turnTimer);
  for (const p of room.players.values()) if (p.graceTimer) clearTimeout(p.graceTimer);
  rooms.delete(room.code);
}

// 게임이 끝난 방은 일정 시간이 지나면 메모리에서 삭제한다 (이미 예약돼 있으면 무시)
export const ENDED_ROOM_TTL_MS = 5 * 60 * 1000;
export function scheduleRoomExpiry(room: Room, ttlMs = ENDED_ROOM_TTL_MS): void {
  if (room.expireTimer) return;
  room.expireTimer = setTimeout(() => deleteRoom(room), ttlMs);
}

export function leaveRoom(code: string, playerId: string): void {
  const room = getRoom(code);
  if (!room) return;
  const leaving = room.players.get(playerId);
  if (leaving?.graceTimer) clearTimeout(leaving.graceTimer);
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
