import type { WebSocket } from "ws";
import type { BotStrategy } from "./game/bot.js";
import type { GameState } from "./game/types.js";

export interface Player {
  id: string;
  name: string;
  // 재접속(rejoin_room) 비밀 토큰. id 는 게임 상태·참가자 목록으로 모두에게 공개되므로 복귀 증명은 이 값으로 한다.
  // 본인에게만 room_created·room_joined 로 한 번 보내고 다른 메시지에는 절대 넣지 않는다. 봇은 없다
  token?: string;
  // 봇은 소켓이 없고, 서버가 대신 행동한다
  socket?: WebSocket;
  bot?: BotStrategy;
  // 접속이 끊긴 뒤 도는 타이머: 대기실·끝난 게임에서는 자리 정리용, 게임 중에는 (방장이면) 방장 이양용.
  // 게임 중에는 접속이 끊겨도 자리가 무기한 유지되고, 돌아오면 같은 자리로 복귀한다 (기획_정리.md 37절)
  graceTimer?: ReturnType<typeof setTimeout>;
  // 스스로 나가서 봇이 영구히 이어받은 자리 (돌아올 수 없고, 다시 하기 때 방에서 뺀다)
  left?: boolean;
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
  // 접속 중인 사람이 한 명도 없을 때 방을 지우기 위한 타이머
  emptyTimer?: ReturnType<typeof setTimeout>;
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
  deleteRoom(room);
  return true;
}

export function deleteRoom(room: Room): void {
  if (room.botTimer) clearTimeout(room.botTimer);
  if (room.expireTimer) clearTimeout(room.expireTimer);
  if (room.emptyTimer) clearTimeout(room.emptyTimer);
  for (const p of room.players.values()) if (p.graceTimer) clearTimeout(p.graceTimer);
  rooms.delete(room.code);
}

// 게임이 끝난 방은 일정 시간이 지나면 메모리에서 삭제한다 (이미 예약돼 있으면 무시)
export const ENDED_ROOM_TTL_MS = 5 * 60 * 1000;
export function scheduleRoomExpiry(room: Room, ttlMs = ENDED_ROOM_TTL_MS): void {
  if (room.expireTimer) return;
  room.expireTimer = setTimeout(() => deleteRoom(room), ttlMs);
}

// 전원이 끊긴 채 이 시간이 지나면 방(진행 중인 게임 포함)을 지운다. 한 명이라도 연결돼 있으면 방은 유지된다
export const ALL_AWAY_ROOM_TTL_MS = 30 * 60 * 1000;
// 게임 중 방장이 끊긴 채 이 시간이 지나면 접속 중인 사람에게 방장을 넘긴다
export const HOST_AWAY_HANDOVER_MS = 30 * 1000;

// 접속 중인 사람(소켓이 있는 사람)이 있는가
export const hasConnectedHuman = (room: Room): boolean => [...room.players.values()].some((p) => !p.bot && p.socket);

// 접속 상태가 바뀔 때마다 호출: 전원이 끊겼으면 정리 타이머를 걸고, 누군가 연결돼 있으면 풀어 준다
export function syncEmptyRoomExpiry(room: Room, ttlMs = ALL_AWAY_ROOM_TTL_MS): void {
  if (hasConnectedHuman(room)) {
    if (room.emptyTimer) clearTimeout(room.emptyTimer);
    room.emptyTimer = undefined;
  } else if (!room.emptyTimer) {
    room.emptyTimer = setTimeout(() => deleteRoom(room), ttlMs);
  }
}

// 새 방장 후보: 접속 중인 사람 우선, 없으면 사람 중 첫 번째 (사람이 없으면 undefined)
export function pickHost(room: Room, excludeId?: string): Player | undefined {
  const humans = [...room.players.values()].filter((p) => !p.bot && p.id !== excludeId);
  return humans.find((p) => p.socket) ?? humans[0];
}

export function leaveRoom(code: string, playerId: string): void {
  const room = getRoom(code);
  if (!room) return;
  const leaving = room.players.get(playerId);
  if (leaving?.graceTimer) clearTimeout(leaving.graceTimer);
  room.players.delete(playerId);
  if (leaveRoomIfNoHumans(room)) return;
  // 방장이 나가면 남은 사람 중 접속 중인 첫 번째가 방장을 이어받는다
  if (room.hostId === playerId) {
    room.hostId = pickHost(room)!.id;
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
