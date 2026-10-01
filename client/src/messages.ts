import type { ActivityId, GameState } from "./gameTypes";

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
  // 방(게임)에서 자발적으로 나간다 (게임 중이면 봇이 자리를 이어받고, 다시 돌아올 수 없다)
  | { type: "leave_room" }
  | { type: "start_game" }
  | { type: "add_bot" }
  | { type: "remove_bot"; botId: string }
  // 2주차: 공개된 수업카드 중 1장을 가져간다 (cardId가 null이면 가져가지 않고 넘어간다)
  | { type: "take_class_card"; cardId: string | null }
  | { type: "roll_dice"; diceCount?: number; tokenCounts?: Partial<Record<"intelligence" | "stamina" | "charm", number>> }
  // 모두 굴린 뒤 결과를 확인하고 다음으로 넘긴다
  // 결과 확인 전에 지력토큰 1개당 주사위 1개를 다시 굴린다 (굴린 주사위 중 원하는 것만: 0부터 시작하는 번호)
  | { type: "reroll_dice"; diceIndexes: number[] }
  | { type: "confirm_roll" }
  | { type: "select_activity"; activityId: ActivityId; targetPlayerId?: string }
  // 4주차(정리): 다음 달로 남길 토큰을 고른다 (지력토큰 1개, 체력토큰 1개, 또는 "none"으로 남기지 않기)
  | { type: "keep_token"; choice: "intelligence" | "stamina" | "none" }
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
  | { type: "host_changed"; hostId: string }
  | { type: "left_room" }
  | { type: "game_state"; game: GameState }
  | { type: "error"; message: string };
