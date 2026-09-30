import type { ActivityId, PublicGameState } from "./game/types.js";

export interface RoomPlayerInfo {
  id: string;
  name: string;
  isBot?: boolean;
}

export type ClientMessage =
  | { type: "create_room"; playerName: string }
  | { type: "join_room"; roomCode: string; playerName: string }
  // 끊겼던 연결을 되살릴 때: 이전에 받은 방 코드와 플레이어 id로 같은 자리에 복귀한다
  | { type: "rejoin_room"; roomCode: string; playerId: string }
  // 연결이 살아 있는지 확인하는 신호 (서버는 pong으로 답한다)
  | { type: "ping" }
  | { type: "start_game" }
  | { type: "add_bot" }
  | { type: "remove_bot"; botId: string }
  // 2주차: 공개된 수업카드 중 1장을 가져간다 (cardId가 null이면 가져가지 않고 넘어간다)
  | { type: "take_class_card"; cardId: string | null }
  | { type: "roll_dice" }
  | { type: "select_activity"; activityId: ActivityId; targetPlayerId?: string; useStamina?: boolean }
  // 3주차 구역에 공개된 카드 중 1장을 고른다 (마법생물·연구 카드는 cardId가 null이면 가져가지 않고 넘어간다)
  | { type: "pick_activity_card"; cardId: string | null };

export type ServerMessage =
  | { type: "room_created"; roomCode: string; playerId: string; players: RoomPlayerInfo[] }
  | { type: "room_joined"; roomCode: string; playerId: string; players: RoomPlayerInfo[] }
  | { type: "room_rejoined"; roomCode: string; playerId: string; isHost: boolean; players: RoomPlayerInfo[] }
  | { type: "rejoin_failed" }
  | { type: "pong" }
  | { type: "player_joined"; playerId: string; playerName: string; isBot?: boolean }
  | { type: "player_left"; playerId: string }
  | { type: "game_state"; game: PublicGameState }
  | { type: "error"; message: string };
