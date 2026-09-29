import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { createRoom, getRoom, joinRoom, leaveRoom, broadcast, type Player, type Room } from "./rooms.js";
import { createGame, selectActivity, submitClassChoice } from "./game/engine.js";
import type { ClientMessage, ServerMessage } from "./messages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

const app = express();

// 프로덕션 빌드 시 client/dist를 정적으로 서빙
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

function broadcastGameState(room: Room): void {
  const game = room.game;
  if (!game) return;
  // 다른 플레이어에게 제시된 수업카드는 비공개이므로 각자에게 본인 것만 포함해서 전송
  for (const player of room.players.values()) {
    const players = Object.fromEntries(
      Object.entries(game.players).map(([id, p]) => [id, id === player.id ? p : { ...p, offeredClassCards: [] }]),
    );
    // 수업카드/마법생물 덱 구성은 비공개이므로 전송하지 않는다
    const { equipmentPile: _ep, explorationPile: _xp, grimoirePile: _gp, classDeck: _cd, classDiscard: _cdd, creatureDeck: _deck, creatureDiscard: _discard, ...publicGame } = game;
    send(player.socket, {
      type: "game_state",
      game: { ...publicGame, players },
    });
  }
}

wss.on("connection", (socket) => {
  let currentRoomCode: string | undefined;
  let playerId: string | undefined;

  socket.on("message", (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: "error", message: "잘못된 메시지 형식입니다." });
      return;
    }

    if (message.type === "create_room") {
      playerId = randomUUID();
      const player: Player = { id: playerId, name: message.playerName, socket };
      const room = createRoom(player);
      currentRoomCode = room.code;
      send(socket, {
        type: "room_created",
        roomCode: room.code,
        playerId,
        players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name })),
      });
      return;
    }

    if (message.type === "join_room") {
      const room = getRoom(message.roomCode);
      if (!room) {
        send(socket, { type: "error", message: "존재하지 않는 방 코드입니다." });
        return;
      }
      if (room.game) {
        send(socket, { type: "error", message: "이미 게임이 시작된 방입니다." });
        return;
      }
      if (room.players.size >= 5) {
        send(socket, { type: "error", message: "방이 가득 찼습니다 (최대 5인)." });
        return;
      }
      playerId = randomUUID();
      const player: Player = { id: playerId, name: message.playerName, socket };
      joinRoom(room.code, player);
      currentRoomCode = room.code;
      send(socket, {
        type: "room_joined",
        roomCode: room.code,
        playerId,
        players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name })),
      });
      broadcast(room, { type: "player_joined", playerId, playerName: message.playerName }, playerId);
      return;
    }

    // 아래 액션들은 방에 참가한 뒤에만 유효
    if (!currentRoomCode || !playerId) {
      send(socket, { type: "error", message: "먼저 방에 참가해야 합니다." });
      return;
    }
    const room = getRoom(currentRoomCode);
    if (!room) return;

    if (message.type === "start_game") {
      if (room.hostId !== playerId) {
        send(socket, { type: "error", message: "방장만 게임을 시작할 수 있습니다." });
        return;
      }
      if (room.players.size < 2 || room.players.size > 5) {
        send(socket, { type: "error", message: "게임은 2~5인이 필요합니다." });
        return;
      }
      room.game = createGame([...room.players.values()].map((p) => ({ id: p.id, name: p.name })));
      broadcastGameState(room);
      return;
    }

    if (message.type === "submit_class_choice") {
      if (!room.game) return;
      try {
        submitClassChoice(room.game, playerId, message.keepCardIds);
        broadcastGameState(room);
      } catch (err) {
        send(socket, { type: "error", message: err instanceof Error ? err.message : "알 수 없는 오류" });
      }
      return;
    }

    if (message.type === "select_activity") {
      if (!room.game) return;
      try {
        selectActivity(room.game, playerId, message.activityId, message.targetPlayerId);
        broadcastGameState(room);
      } catch (err) {
        send(socket, { type: "error", message: err instanceof Error ? err.message : "알 수 없는 오류" });
      }
      return;
    }
  });

  socket.on("close", () => {
    if (currentRoomCode && playerId) {
      const room = getRoom(currentRoomCode);
      leaveRoom(currentRoomCode, playerId);
      if (room) {
        broadcast(room, { type: "player_left", playerId });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
