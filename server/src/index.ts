import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { BALANCE } from "./game/config.js";
import { createRoom, getRoom, joinRoom, leaveRoom, leaveRoomIfNoHumans, scheduleRoomExpiry, broadcast, type Player, type Room } from "./rooms.js";
import { BOT_NAMES, chooseActivityAction, chooseLabCard, pickBotPersonality, playClassTurn } from "./game/bot.js";
import {
  availableActivities,
  chooseLabCard as submitLabChoice,
  classCardsLeft,
  createGame,
  duelTargets,
  openClassCard,
  selectActivity,
  submitClassChoice,
  submitRoll,
} from "./game/engine.js";
import type { ClientMessage, ServerMessage } from "./messages.js";
import type { GameState, PublicRules } from "./game/types.js";

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

function send(socket: WebSocket | undefined, message: ServerMessage): void {
  if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

const playerInfo = (room: Room) =>
  [...room.players.values()].map((p) => ({ id: p.id, name: p.name, isBot: p.bot ? true : undefined }));

// 봇이 생각하는 시간 (테스트에서는 BOT_SPEED=20 처럼 배속을 줄 수 있음)
const BOT_SPEED = Number(process.env.BOT_SPEED) || 1;
const BOT_MIN_DELAY_MS = 1000 / BOT_SPEED;
const BOT_MAX_DELAY_MS = 2000 / BOT_SPEED;
const MAX_PLAYERS = 5;

// 봇의 평소 판단이 예외를 내더라도 게임이 멈추지 않도록 가장 단순한 행동으로 대신한다
function runBotFallback(game: GameState, botId: string): void {
  if (game.pendingRoll) {
    submitRoll(game, botId);
  } else if (game.phase === "class") {
    submitClassChoice(game, botId, []);
  } else if (game.pendingLab) {
    submitLabChoice(game, botId, null);
  } else if (game.phase === "activity") {
    const activityId = availableActivities(game, botId)[0];
    if (activityId) selectActivity(game, botId, activityId, activityId === "duel" ? duelTargets(game, botId)[0] : undefined, false);
  }
}

// 봇이 행동해야 하는 상황이면 잠시 생각하는 시간을 두고 한 번 행동한 뒤, 다음 행동을 다시 예약한다
function scheduleBots(room: Room): void {
  if (room.botTimer) return;
  const game = room.game;
  if (!game || game.phase === "ended") return;

  let actorId: string | undefined;
  if (game.pendingRoll) {
    // 주사위를 굴려야 하는 봇은 사람처럼 버튼을 누른다 (사람이 굴리는 동안 봇도 자기 몫을 굴림)
    actorId = game.pendingRoll.entries.find((e) => e.dice === null && room.players.get(e.playerId)?.bot)?.playerId;
  } else if (game.phase === "class") {
    actorId = game.turnOrder.find((id) => room.players.get(id)?.bot && !game.players[id].hasActedThisPhase);
  } else if (game.phase === "activity") {
    // 연구 카드를 고르는 중이면 그 플레이어가 행동할 차례
    const currentId = game.pendingLab?.playerId ?? game.activityOrder[game.activityTurnPointer];
    if (room.players.get(currentId)?.bot) actorId = currentId;
  }
  if (!actorId) return;

  const botId = actorId;
  const delay = BOT_MIN_DELAY_MS + Math.random() * (BOT_MAX_DELAY_MS - BOT_MIN_DELAY_MS);
  room.botTimer = setTimeout(() => {
    room.botTimer = undefined;
    const bot = room.players.get(botId);
    if (!bot?.bot || !room.game) return;
    try {
      if (room.game.pendingRoll) {
        submitRoll(room.game, botId);
      } else if (room.game.phase === "class") {
        playClassTurn(room.game, botId, bot.bot);
      } else if (room.game.phase === "activity" && room.game.pendingLab) {
        submitLabChoice(room.game, botId, chooseLabCard(room.game, bot.bot));
      } else if (room.game.phase === "activity") {
        const { activityId, targetPlayerId, useStamina } = chooseActivityAction(room.game, botId, bot.bot);
        selectActivity(room.game, botId, activityId, targetPlayerId, useStamina);
      }
    } catch (err) {
      console.error("봇 행동 오류:", err);
      try {
        runBotFallback(room.game, botId);
      } catch (fallbackErr) {
        console.error("봇 대체 행동도 실패:", fallbackErr);
        return;
      }
    }
    broadcastGameState(room);
    scheduleBots(room);
  }, delay);
}

// 화면에 보여 줄 규칙 수치 (비용 안내가 서버 설정과 어긋나지 않도록 서버가 알려 준다)
const PUBLIC_RULES: PublicRules = {
  openCardCost: BALANCE.openCardCost,
  activityMaxParticipants: BALANCE.activityMaxParticipants,
  activitySecondParticipantCost: BALANCE.activitySecondParticipantCost,
  duelCharmFee: BALANCE.duelCharmFee,
  midtermRound: BALANCE.midtermRound,
  midtermRevealRound: BALANCE.midtermRevealRound,
  finalRevealRound: BALANCE.finalRevealRound,
  charmExchangeRate: BALANCE.charmExchangeRate,
  charmExchangeRateMin: BALANCE.charmExchangeRateMin,
  tournamentRewards: BALANCE.tournamentRewards,
};

function broadcastGameState(room: Room): void {
  const game = room.game;
  if (!game) return;
  if (game.phase === "ended") scheduleRoomExpiry(room);
  // 다른 플레이어에게 제시된 수업카드는 비공개이므로 각자에게 본인 것만 포함해서 전송
  for (const player of room.players.values()) {
    if (player.bot) continue;
    const players = Object.fromEntries(
      Object.entries(game.players).map(([id, p]) => [
        id,
        id === player.id ? p : { ...p, offeredClassCards: [], peekedExploration: null },
      ]),
    );
    // 펼쳐진 연구 카드 후보는 고르는 본인에게만 보여 준다
    const pendingLab = game.pendingLab
      ? { playerId: game.pendingLab.playerId, cards: game.pendingLab.playerId === player.id ? game.pendingLab.cards : [] }
      : null;
    // 카드 덱 구성과 주사위 처리 정보는 비공개이므로 전송하지 않는다
    const { hidden: _h, labPile: _lp, explorationPile: _xp, grimoirePile: _gp, classDeck: _cd, classDiscard: _cdd, creatureDeck: _deck, creatureDiscard: _discard, ...publicGame } = game;
    send(player.socket, {
      type: "game_state",
      game: { ...publicGame, players, pendingLab, classLeft: classCardsLeft(game), rules: PUBLIC_RULES },
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
        players: playerInfo(room),
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
        players: playerInfo(room),
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

    if (message.type === "add_bot") {
      if (room.hostId !== playerId) {
        send(socket, { type: "error", message: "방장만 봇을 추가할 수 있습니다." });
        return;
      }
      if (room.game) {
        send(socket, { type: "error", message: "게임이 시작된 뒤에는 봇을 추가할 수 없습니다." });
        return;
      }
      if (room.players.size >= MAX_PLAYERS) {
        send(socket, { type: "error", message: "방이 가득 찼습니다 (최대 5인)." });
        return;
      }
      const usedNames = new Set([...room.players.values()].map((p) => p.name));
      const name = BOT_NAMES.find((n) => !usedNames.has(`${n} 🤖`)) ?? BOT_NAMES[0];
      const bot: Player = { id: randomUUID(), name: `${name} 🤖`, bot: pickBotPersonality() };
      room.players.set(bot.id, bot);
      broadcast(room, { type: "player_joined", playerId: bot.id, playerName: bot.name, isBot: true });
      return;
    }

    if (message.type === "remove_bot") {
      const target = room.players.get(message.botId);
      if (room.hostId !== playerId || room.game || !target?.bot) {
        send(socket, { type: "error", message: "봇을 제거할 수 없습니다." });
        return;
      }
      room.players.delete(target.id);
      broadcast(room, { type: "player_left", playerId: target.id });
      return;
    }

    if (message.type === "start_game") {
      if (room.hostId !== playerId) {
        send(socket, { type: "error", message: "방장만 게임을 시작할 수 있습니다." });
        return;
      }
      if (room.players.size < 2 || room.players.size > 5) {
        send(socket, { type: "error", message: "게임은 2~5인이 필요합니다." });
        return;
      }
      if (room.expireTimer) {
        clearTimeout(room.expireTimer);
        room.expireTimer = undefined;
      }
      room.game = createGame([...room.players.values()].map((p) => ({ id: p.id, name: p.name, isBot: !!p.bot })));
      broadcastGameState(room);
      scheduleBots(room);
      return;
    }

    if (message.type === "open_class_card") {
      if (!room.game) return;
      try {
        openClassCard(room.game, playerId);
        broadcastGameState(room);
      } catch (err) {
        send(socket, { type: "error", message: err instanceof Error ? err.message : "알 수 없는 오류" });
        // 동시에 같은 카드를 열려는 경우 등 화면이 낡았을 수 있으니 최신 상태를 다시 보낸다
        broadcastGameState(room);
      }
      return;
    }

    if (message.type === "roll_dice") {
      if (!room.game) return;
      try {
        submitRoll(room.game, playerId);
        broadcastGameState(room);
        scheduleBots(room);
      } catch (err) {
        send(socket, { type: "error", message: err instanceof Error ? err.message : "알 수 없는 오류" });
        broadcastGameState(room);
      }
      return;
    }

    if (message.type === "submit_class_choice") {
      if (!room.game) return;
      try {
        submitClassChoice(room.game, playerId, message.keepCardIds);
        broadcastGameState(room);
        scheduleBots(room);
      } catch (err) {
        send(socket, { type: "error", message: err instanceof Error ? err.message : "알 수 없는 오류" });
      }
      return;
    }

    if (message.type === "choose_lab_card") {
      if (!room.game) return;
      try {
        submitLabChoice(room.game, playerId, message.cardId);
        broadcastGameState(room);
        scheduleBots(room);
      } catch (err) {
        send(socket, { type: "error", message: err instanceof Error ? err.message : "알 수 없는 오류" });
      }
      return;
    }

    if (message.type === "select_activity") {
      if (!room.game) return;
      try {
        selectActivity(room.game, playerId, message.activityId, message.targetPlayerId, message.useStamina);
        broadcastGameState(room);
        scheduleBots(room);
      } catch (err) {
        send(socket, { type: "error", message: err instanceof Error ? err.message : "알 수 없는 오류" });
      }
      return;
    }
  });

  socket.on("close", () => {
    if (currentRoomCode && playerId) {
      const room = getRoom(currentRoomCode);
      const leaving = room?.players.get(playerId);
      if (room && leaving && room.game && room.game.phase !== "ended") {
        // 게임 도중 접속이 끊기면 봇이 자리를 이어받아 남은 사람들이 계속 플레이할 수 있게 한다
        leaving.bot = pickBotPersonality();
        leaving.socket = undefined;
        if (room.game.players[playerId]) room.game.players[playerId].isBot = true;
        room.game.log.push({ round: room.game.round, message: `${leaving.name}님의 연결이 끊겨 봇이 이어받습니다` });
        if (leaveRoomIfNoHumans(room)) return;
        broadcastGameState(room);
        scheduleBots(room);
        return;
      }
      leaveRoom(currentRoomCode, playerId);
      if (room) {
        broadcast(room, { type: "player_left", playerId });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  // 같은 와이파이의 스마트폰으로 접속할 때 사용할 주소 (플레이테스트용)
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) console.log(`  스마트폰 접속 주소: http://${addr.address}:${PORT}`);
    }
  }
});
