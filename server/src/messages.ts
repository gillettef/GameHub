import type { ActivityId, GameState } from "./game/types.js";

export type ClientMessage =
  | { type: "create_room"; playerName: string }
  | { type: "join_room"; roomCode: string; playerName: string }
  | { type: "start_game" }
  | { type: "submit_class_choice"; keepCardIds: string[] }
  | { type: "select_activity"; activityId: ActivityId; targetPlayerId?: string };

export type ServerMessage =
  | { type: "room_created"; roomCode: string; playerId: string; players: { id: string; name: string }[] }
  | { type: "room_joined"; roomCode: string; playerId: string; players: { id: string; name: string }[] }
  | { type: "player_joined"; playerId: string; playerName: string }
  | { type: "player_left"; playerId: string }
  | { type: "game_state"; game: GameState }
  | { type: "error"; message: string };
