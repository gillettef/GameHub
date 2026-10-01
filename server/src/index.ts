import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { BALANCE } from "./game/config.js";
import { MIN_CREATURE_COST } from "./game/creatures.js";
import { createRoom, getRoom, joinRoom, leaveRoom, leaveRoomIfNoHumans, scheduleRoomExpiry, broadcast, type Player, type Room } from "./rooms.js";
import { BOT_NAMES, chooseActivityAction, choosePick, pickBotPersonality, playClassTurn, rerollLowDice } from "./game/bot.js";
import {
  availableActivities,
  chooseActivityCard,
  classCardsLeft,
  createGame,
  duelTargets,
  selectActivity,
  takeClassCard,
  submitRoll,
  confirmRoll,
  rerollDice,
  advanceResolution,
  canAdvanceResolution,
  rollRevealed,
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
// 활동을 하나씩 진행할 때 다음 활동으로 넘어가기 전 기다리는 시간(결과를 눈으로 볼 수 있게), 봇이 주사위 결과를 확인하기 전 기다리는 시간
const RESOLVE_STEP_MS = 3000 / BOT_SPEED;
const ROLL_REVEAL_MS = 2500 / BOT_SPEED;
const MAX_PLAYERS = 5;
// 접속이 끊긴 사람이 돌아오기를 기다리는 시간 (이후엔 게임 중이면 봇이 자리를 맡고, 대기실이면 퇴장 처리)
const AWAY_GRACE_MS = Number(process.env.AWAY_GRACE_MS) || 45_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

// 봇의 평소 판단이 예외를 내더라도 게임이 멈추지 않도록 가장 단순한 행동으로 대신한다
function runBotFallback(game: GameState, botId: string): void {
  if (game.pendingRoll) {
    const entry = game.pendingRoll.entries.find((e) => e.playerId === botId);
    if (entry?.dice === null) submitRoll(game, botId);
    else confirmRoll(game, botId);
  } else if (game.phase === "class") {
    takeClassCard(game, botId, null);
  } else if (game.pendingPick) {
    // 반드시 골라야 하는 카드(탐험·마도서)는 첫 카드를, 나머지는 넘어간다
    const first = game.activityOffers[game.pendingPick.activityId]?.cards[0]?.id ?? null;
    const mustPick = game.pendingPick.mode === "reward" || game.pendingPick.activityId === "exploration";
    chooseActivityCard(game, botId, mustPick ? first : null);
  } else if (game.phase === "activity" && game.activityStage === "choose") {
    const activityId = availableActivities(game, botId)[0];
    if (activityId) selectActivity(game, botId, activityId, activityId === "duel" ? duelTargets(game, botId)[0] : undefined);
  }
}

// 봇이 행동해야 하는 상황이면 잠시 생각하는 시간을 두고 한 번 행동한 뒤, 다음 행동을 다시 예약한다
function scheduleBots(room: Room): void {
  if (room.botTimer) return;
  const game = room.game;
  if (!game || game.phase === "ended") return;

  let actorId: string | undefined;
  // advance: 사람·봇 상관없이 서버가 시간을 두고 다음 활동을 진행시키는 경우 (결과를 눈으로 볼 수 있는 간격)
  let advance = false;
  let delay = BOT_MIN_DELAY_MS + Math.random() * (BOT_MAX_DELAY_MS - BOT_MIN_DELAY_MS);
  if (game.pendingRoll) {
    // 주사위를 굴려야 하는 봇은 사람처럼 버튼을 누른다 (사람이 굴리는 동안 봇도 자기 몫을 굴림).
    // 모두 굴린 뒤에는 결과를 볼 시간을 준 다음 봇이 확인을 누른다
    const bots = game.pendingRoll.entries.filter((e) => room.players.get(e.playerId)?.bot);
    if (rollRevealed(game)) {
      actorId = bots.find((e) => !e.confirmed)?.playerId;
      delay = ROLL_REVEAL_MS;
    } else {
      actorId = bots.find((e) => e.dice === null)?.playerId;
    }
  } else if (game.phase === "class") {
    // 선부터 시계방향으로 한 명씩 수업카드를 고른다
    const currentId = game.classPickOrder[game.classPickPointer];
    if (room.players.get(currentId)?.bot) actorId = currentId;
  } else if (game.phase === "activity" && game.activityStage === "choose") {
    const currentId = game.activityOrder[game.activityTurnPointer];
    if (room.players.get(currentId)?.bot) actorId = currentId;
  } else if (game.phase === "activity") {
    if (game.pendingPick) {
      // 공개된 카드를 고르는 중이면 그 플레이어가 행동할 차례
      const currentId = game.pendingPick.playerId;
      if (room.players.get(currentId)?.bot) actorId = currentId;
    } else if (canAdvanceResolution(game)) {
      advance = true;
      delay = RESOLVE_STEP_MS;
    }
  }
  if (!actorId && !advance) return;

  const botId = actorId;
  room.botTimer = setTimeout(() => {
    room.botTimer = undefined;
    if (!room.game) return;
    if (advance) {
      try {
        advanceResolution(room.game);
      } catch (err) {
        console.error("활동 진행 오류:", err);
        return;
      }
      broadcastGameState(room);
      scheduleBots(room);
      return;
    }
    const bot = botId ? room.players.get(botId) : undefined;
    if (!botId || !bot?.bot) return;
    try {
      if (room.game.pendingRoll) {
        const entry = room.game.pendingRoll.entries.find((e) => e.playerId === botId);
        if (entry?.dice === null) submitRoll(room.game, botId);
        else {
          rerollLowDice(room.game, botId);
          confirmRoll(room.game, botId);
        }
      } else if (room.game.phase === "class") {
        playClassTurn(room.game, botId, bot.bot);
      } else if (room.game.phase === "activity" && room.game.pendingPick) {
        chooseActivityCard(room.game, botId, choosePick(room.game, bot.bot));
      } else if (room.game.phase === "activity") {
        const { activityId, targetPlayerId } = chooseActivityAction(room.game, botId, bot.bot);
        selectActivity(room.game, botId, activityId, targetPlayerId);
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
  openCardCostActivities: BALANCE.openCardCostActivities,
  activityMaxParticipants: BALANCE.activityMaxParticipants,
  activitySecondParticipantCost: BALANCE.activitySecondParticipantCost,
  duelCharmFee: BALANCE.duelCharmFee,
  midtermRound: BALANCE.midtermRound,
  midtermRevealRound: BALANCE.midtermRevealRound,
  finalRevealRound: BALANCE.finalRevealRound,
  charmExchangeRate: BALANCE.charmExchangeRate,
  charmExchangeRateMin: BALANCE.charmExchangeRateMin,
  tournamentRewards: BALANCE.tournamentRewards,
  creatureSetScore: BALANCE.creatureSetScore,
  creatureMinCost: MIN_CREATURE_COST,
};

function broadcastGameState(room: Room): void {
  const game = room.game;
  if (!game) return;
  if (game.phase === "ended") scheduleRoomExpiry(room);
  // 엿본 탐험 카드는 엿본 본인에게만 보여 준다 (공개된 수업카드·구역 카드는 모두에게 공개)
  for (const player of room.players.values()) {
    if (player.bot) continue;
    const players = Object.fromEntries(
      Object.entries(game.players).map(([id, p]) => [id, id === player.id ? p : { ...p, peekedExploration: null }]),
    );
    // 카드 덱 구성과 주사위 처리 정보는 비공개이므로 전송하지 않는다
    const { hidden: _h, labPile: _lp, explorationPile: _xp, grimoirePile: _gp, classDeck: _cd, classDiscard: _cdd, creatureDeck: _deck, creatureDiscard: _discard, ...publicGame } = game;
    send(player.socket, {
      type: "game_state",
      game: { ...publicGame, players, classLeft: classCardsLeft(game), rules: PUBLIC_RULES },
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

    if (message.type === "ping") {
      send(socket, { type: "pong" });
      return;
    }

    if (message.type === "rejoin_room") {
      const room = getRoom(message.roomCode);
      const player = room?.players.get(message.playerId);
      // 처음부터 봇이었던 자리는 사람이 되돌릴 수 없다
      if (!room || !player || (player.bot && !player.wasHuman)) {
        send(socket, { type: "rejoin_failed" });
        return;
      }
      const old = player.socket;
      player.socket = socket;
      if (old && old !== socket) old.terminate();
      if (player.graceTimer) {
        clearTimeout(player.graceTimer);
        player.graceTimer = undefined;
      }
      if (player.bot) {
        // 봇이 임시로 맡고 있던 자리를 다시 사람에게 돌려준다
        player.bot = undefined;
        player.wasHuman = undefined;
        if (room.game?.players[player.id]) room.game.players[player.id].isBot = false;
        room.game?.log.push({ round: room.game.round, message: `${player.name}님이 돌아왔습니다` });
      }
      playerId = player.id;
      currentRoomCode = room.code;
      send(socket, {
        type: "room_rejoined",
        roomCode: room.code,
        playerId: player.id,
        isHost: room.hostId === player.id,
        players: playerInfo(room),
      });
      if (room.game) broadcastGameState(room);
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

    if (message.type === "leave_room") {
      const leaving = room.players.get(playerId);
      const leftId = playerId;
      // 이 연결은 더 이상 방과 무관하다 (뒤늦은 close 이벤트가 유예 타이머를 만들지 않도록 소켓도 떼어 둔다)
      currentRoomCode = undefined;
      playerId = undefined;
      if (!leaving) return;
      leaving.socket = undefined;
      if (leaving.graceTimer) {
        clearTimeout(leaving.graceTimer);
        leaving.graceTimer = undefined;
      }
      send(socket, { type: "left_room" });
      handleVoluntaryLeave(room, leaving, leftId);
      return;
    }

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

    if (message.type === "reroll_dice") {
      if (!room.game) return;
      try {
        rerollDice(room.game, playerId, message.diceIndexes);
        broadcastGameState(room);
      } catch (err) {
        send(socket, { type: "error", message: err instanceof Error ? err.message : "알 수 없는 오류" });
        broadcastGameState(room);
      }
      return;
    }

    if (message.type === "confirm_roll") {
      if (!room.game) return;
      try {
        confirmRoll(room.game, playerId);
        broadcastGameState(room);
        scheduleBots(room);
      } catch (err) {
        send(socket, { type: "error", message: err instanceof Error ? err.message : "알 수 없는 오류" });
        broadcastGameState(room);
      }
      return;
    }

    if (message.type === "take_class_card") {
      if (!room.game) return;
      try {
        takeClassCard(room.game, playerId, message.cardId);
        broadcastGameState(room);
        scheduleBots(room);
      } catch (err) {
        send(socket, { type: "error", message: err instanceof Error ? err.message : "알 수 없는 오류" });
        // 화면이 낡았을 수 있으니 최신 상태를 다시 보낸다
        broadcastGameState(room);
      }
      return;
    }

    if (message.type === "pick_activity_card") {
      if (!room.game) return;
      try {
        chooseActivityCard(room.game, playerId, message.cardId);
        broadcastGameState(room);
        scheduleBots(room);
      } catch (err) {
        send(socket, { type: "error", message: err instanceof Error ? err.message : "알 수 없는 오류" });
        broadcastGameState(room);
      }
      return;
    }

    if (message.type === "select_activity") {
      if (!room.game) return;
      try {
        selectActivity(room.game, playerId, message.activityId, message.targetPlayerId);
        broadcastGameState(room);
        scheduleBots(room);
      } catch (err) {
        send(socket, { type: "error", message: err instanceof Error ? err.message : "알 수 없는 오류" });
      }
      return;
    }
  });

  socket.on("close", () => {
    if (!currentRoomCode || !playerId) return;
    const room = getRoom(currentRoomCode);
    const leaving = room?.players.get(playerId);
    // 이미 새 연결로 갈아탄 옛 소켓이 뒤늦게 닫히는 경우는 무시한다
    if (!room || !leaving || leaving.socket !== socket) return;
    leaving.socket = undefined;
    // 모바일에서 다른 앱을 잠깐 보고 오면 연결이 끊기므로, 바로 내보내지 않고 돌아올 시간을 준다
    if (leaving.graceTimer) clearTimeout(leaving.graceTimer);
    leaving.graceTimer = setTimeout(() => {
      leaving.graceTimer = undefined;
      handleAwayExpired(room, leaving);
    }, AWAY_GRACE_MS);
  });
});

// 유예 시간 안에 돌아오지 않은 플레이어를 정리한다
function handleAwayExpired(room: Room, leaving: Player): void {
  if (leaving.socket || !room.players.has(leaving.id)) return;
  if (room.game && room.game.phase !== "ended") {
    // 게임 도중 끝내 돌아오지 않으면 봇이 자리를 이어받아 남은 사람들이 계속 플레이할 수 있게 한다
    leaving.bot = pickBotPersonality();
    leaving.wasHuman = true;
    if (room.game.players[leaving.id]) room.game.players[leaving.id].isBot = true;
    room.game.log.push({ round: room.game.round, message: `${leaving.name}님의 연결이 끊겨 봇이 이어받습니다` });
    if (leaveRoomIfNoHumans(room)) return;
    broadcastGameState(room);
    scheduleBots(room);
    return;
  }
  const previousHostId = room.hostId;
  leaveRoom(room.code, leaving.id);
  if (!getRoom(room.code)) return;
  broadcast(room, { type: "player_left", playerId: leaving.id });
  notifyHostChange(room, previousHostId);
}

// 방장이 바뀌었으면 남은 사람들에게 알린다
function notifyHostChange(room: Room, previousHostId: string): void {
  if (room.hostId !== previousHostId) broadcast(room, { type: "host_changed", hostId: room.hostId });
}

// 자발적으로 나간 플레이어를 정리한다. 진행 중인 게임이면 기다리지 않고 바로 봇이 이어받고(돌아올 수 없음), 그 외에는 방에서 뺀다
function handleVoluntaryLeave(room: Room, leaving: Player, leavingId: string): void {
  const previousHostId = room.hostId;
  if (room.game && room.game.phase !== "ended") {
    leaving.bot = pickBotPersonality();
    leaving.wasHuman = undefined;
    if (room.game.players[leavingId]) room.game.players[leavingId].isBot = true;
    room.game.log.push({ round: room.game.round, message: `${leaving.name}님이 게임을 떠나 봇이 이어받습니다` });
    if (leaveRoomIfNoHumans(room)) return;
    // 봇이 된 방장은 방장 자리를 남은 사람에게 넘긴다
    if (room.hostId === leavingId) room.hostId = [...room.players.values()].find((p) => !p.bot)!.id;
    notifyHostChange(room, previousHostId);
    broadcastGameState(room);
    scheduleBots(room);
    return;
  }
  leaveRoom(room.code, leavingId);
  if (!getRoom(room.code)) return;
  broadcast(room, { type: "player_left", playerId: leavingId });
  notifyHostChange(room, previousHostId);
}

// 죽은 연결(전원 꺼짐, 백그라운드로 밀린 폰 등)을 주기적으로 찾아 끊는다 — 끊기면 위의 유예 절차가 시작된다
const aliveSockets = new WeakSet<WebSocket>();
wss.on("connection", (socket) => {
  aliveSockets.add(socket);
  socket.on("pong", () => aliveSockets.add(socket));
  socket.on("message", () => aliveSockets.add(socket));
});
setInterval(() => {
  for (const socket of wss.clients) {
    if (!aliveSockets.has(socket)) {
      socket.terminate();
      continue;
    }
    aliveSockets.delete(socket);
    socket.ping();
  }
}, HEARTBEAT_INTERVAL_MS).unref();

server.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  // 같은 와이파이의 스마트폰으로 접속할 때 사용할 주소 (플레이테스트용)
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) console.log(`  스마트폰 접속 주소: http://${addr.address}:${PORT}`);
    }
  }
});
