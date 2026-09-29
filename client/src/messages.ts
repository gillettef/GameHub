import type { ActivityId, GameState } from "./gameTypes";

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
  | { type: "submit_class_choice"; keepCardIds: string[] }
  | { type: "select_activity"; activityId: ActivityId; targetPlayerId?: string; useStamina?: boolean }
  | { type: "choose_lab_card"; cardId: string };

export type ServerMessage =
  | { type: "room_created"; roomCode: string; playerId: string; players: RoomPlayerInfo[] }
  | { type: "room_joined"; roomCode: string; playerId: string; players: RoomPlayerInfo[] }
  | { type: "player_joined"; playerId: string; playerName: string; isBot?: boolean }
  | { type: "player_left"; playerId: string }
  | { type: "game_state"; game: GameState }
  | { type: "error"; message: string };
