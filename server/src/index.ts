import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { createRoom, getRoom, joinRoom, leaveRoom, broadcast, type Player } from "./rooms.js";
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
      send(socket, { type: "room_created", roomCode: room.code, playerId });
      return;
    }

    if (message.type === "join_room") {
      const room = getRoom(message.roomCode);
      if (!room) {
        send(socket, { type: "error", message: "존재하지 않는 방 코드입니다." });
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
