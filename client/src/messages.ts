export type ClientMessage =
  | { type: "create_room"; playerName: string }
  | { type: "join_room"; roomCode: string; playerName: string };

export type ServerMessage =
  | { type: "room_created"; roomCode: string; playerId: string }
  | { type: "room_joined"; roomCode: string; playerId: string; players: { id: string; name: string }[] }
  | { type: "player_joined"; playerId: string; playerName: string }
  | { type: "player_left"; playerId: string }
  | { type: "error"; message: string };
