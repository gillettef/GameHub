import type { ActivityId, KeptToken, GameState } from "./gameTypes";

export interface RoomPlayerInfo {
  id: string;
  name: string;
  isBot?: boolean;
}

export type ClientMessage =
  | { type: "create_room"; playerName: string }
  | { type: "join_room"; roomCode: string; playerName: string }
  // 끊겼던 연결을 되살릴 때: 이전에 받은 방 코드와 플레이어 id로 같은 자리에 복귀한다
  | { type: "rejoin_room"; roomCode: string; playerId: string; token: string }
  // 연결이 살아 있는지 확인하는 신호 (서버는 pong으로 답한다)
  | { type: "ping" }
  // 방(게임)에서 자발적으로 나간다 (게임 중이면 봇이 자리를 이어받고, 다시 돌아올 수 없다)
  | { type: "leave_room" }
  | { type: "start_game" }
  | { type: "add_bot" }
  | { type: "remove_bot"; botId: string }
  // 방장 전용: 친구 내보내기(게임 중이면 게임에서 완전히 제외), 같은 멤버로 다시 하기
  | { type: "kick_player"; playerId: string }
  | { type: "rematch" }
  // 리액션 이모지
  | { type: "emoji"; emoji: string }
  // 2주차: 공개된 수업카드 중 1장을 가져간다 (cardId가 null이면 가져가지 않고 넘어간다)
  | { type: "take_class_card"; cardId: string | null }
  // assist: 보조 능력치 기운(마법 경연 체력기운, 설정으로 켰을 때만)을 낼 개수
  | { type: "roll_dice"; diceCount?: number; assist?: number }
  // 시험 달 1주차 벼락치기: from 기운 1개를 시험 과목 기운 1개로 바꾼다 (null이면 하지 않고 넘어간다). 선부터 한 명씩
  | { type: "cram"; from: KeptToken | null }
  // 장래희망(56절 B2): 받은 카드 중 1장을 고른다 (처음 몇 개월만 바꿀 수 있다)
  | { type: "choose_dream"; dreamId: string }
  // 내 차례에 굴린 결과를 확인하고 다음 사람에게 넘긴다
  // 결과 확인 전에 마나기운 1개당 주사위 1개를 다시 굴린다 (굴린 주사위 중 원하는 것만: 0부터 시작하는 번호)
  | { type: "reroll_dice"; diceIndexes: number[] }
  | { type: "confirm_roll" }
  | { type: "select_activity"; activityId: ActivityId; targetPlayerId?: string; cardId?: string }
  // 3주차 구역에 공개된 카드 중 1장을 고른다 (마법생물·연구 카드는 cardId가 null이면 가져가지 않고 넘어간다)
  | { type: "pick_activity_card"; cardId: string | null };

export type ServerMessage =
  | { type: "room_created"; roomCode: string; playerId: string; token: string; players: RoomPlayerInfo[] }
  | { type: "room_joined"; roomCode: string; playerId: string; token: string; players: RoomPlayerInfo[] }
  | { type: "room_rejoined"; roomCode: string; playerId: string; isHost: boolean; players: RoomPlayerInfo[] }
  | { type: "rejoin_failed" }
  | { type: "pong" }
  | { type: "player_joined"; playerId: string; playerName: string; isBot?: boolean }
  // kicked가 true면 방장이 내보낸 것 (남은 사람들에게 안내를 띄운다)
  | { type: "player_left"; playerId: string; kicked?: boolean }
  | { type: "host_changed"; hostId: string }
  | { type: "left_room" }
  | { type: "kicked" }
  | { type: "room_reset"; hostId: string; players: RoomPlayerInfo[] }
  // 접속이 끊긴 사람들의 id (끊겨도 자리는 유지되고, 돌아오면 같은 자리로 복귀한다)
  | { type: "presence"; offline: string[] }
  | { type: "emoji"; playerId: string; emoji: string }
  | { type: "game_state"; game: GameState }
  | { type: "error"; message: string };
