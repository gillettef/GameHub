import type { ActivityId, PublicGameState } from "./game/types.js";

export interface RoomPlayerInfo {
  id: string;
  name: string;
  isBot?: boolean;
}

export type ClientMessage =
  | { type: "create_room"; playerName: string }
  | { type: "join_room"; roomCode: string; playerName: string }
  | { type: "start_game" }
  | { type: "add_bot" }
  | { type: "remove_bot"; botId: string }
  | { type: "open_class_card" }
  | { type: "submit_class_choice"; keepCardIds: string[] }
  | { type: "roll_dice" }
  | { type: "select_activity"; activityId: ActivityId; targetPlayerId?: string; useStamina?: boolean }
  // cardId가 null이면 연구 카드를 고르지 않고 넘어간다
  | { type: "choose_lab_card"; cardId: string | null };

export type ServerMessage =
  | { type: "room_created"; roomCode: string; playerId: string; players: RoomPlayerInfo[] }
  | { type: "room_joined"; roomCode: string; playerId: string; players: RoomPlayerInfo[] }
  | { type: "player_joined"; playerId: string; playerName: string; isBot?: boolean }
  | { type: "player_left"; playerId: string }
  | { type: "game_state"; game: PublicGameState }
  | { type: "error"; message: string };
