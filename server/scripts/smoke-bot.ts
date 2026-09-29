// 봇 스모크 테스트: 사람 1명 + 봇 N명으로 한 판을 끝까지 진행하고, 게임 도중 접속이 끊긴 사람을 봇이 이어받는지도 확인합니다.
// 사용법: (다른 터미널에서 서버 실행 후) npm run smoke:bot -- [봇 수(1~4)] [포트]
import WebSocket from "ws";
import type { ServerMessage } from "../src/messages.js";
import type { ActivityId, PublicGameState } from "../src/game/types.js";

const botCount = Number(process.argv[2]) || 3;
const port = Number(process.argv[3]) || 8080;
const ACTIVITIES: ActivityId[] = ["tournament", "creature", "duel", "exploration", "lab"];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Human {
  socket: WebSocket;
  playerId?: string;
  roomCode?: string;
  game?: PublicGameState;
  errors: string[];
  lobbyBots: number;
  lastAction?: string;
}

function connect(): Promise<Human> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}/ws`);
    const h: Human = { socket, errors: [], lobbyBots: 0 };
    socket.on("open", () => resolve(h));
    socket.on("error", reject);
    socket.on("message", (raw) => {
      const msg: ServerMessage = JSON.parse(raw.toString());
      if (msg.type === "room_created") {
        h.playerId = msg.playerId;
        h.roomCode = msg.roomCode;
      }
      if (msg.type === "player_joined" && msg.isBot) h.lobbyBots += 1;
      if (msg.type === "error") h.errors.push(msg.message);
      if (msg.type === "game_state") {
        h.game = msg.game;
        act(h);
      }
    });
  });
}

const send = (h: Human, msg: object) => h.socket.send(JSON.stringify(msg));

// 사람 플레이어 역할: 봇과 같은 단순한 방식으로 행동한다
function act(h: Human) {
  const game = h.game;
  if (!game || !h.playerId) return;
  const key = `${game.round}:${game.phase}:${game.activityTurnPointer}:${game.pendingLab ? "lab" : ""}`;
  if (h.lastAction === key) return;
  const me = game.players[h.playerId];
  if (game.phase === "class" && !me.hasActedThisPhase) {
    h.lastAction = key;
    send(h, { type: "submit_class_choice", keepCardIds: me.offeredClassCards.slice(0, me.staminaTokens).map((c) => c.id) });
  } else if (game.phase === "activity" && game.pendingLab?.playerId === h.playerId) {
    h.lastAction = key;
    send(h, { type: "choose_lab_card", cardId: game.pendingLab.cards[0].id });
  } else if (game.phase === "activity" && !game.pendingLab && game.activityOrder[game.activityTurnPointer] === h.playerId) {
    h.lastAction = key;
    const targets = game.turnOrder.filter((id) => id !== h.playerId && !game.players[id].hasActedThisPhase);
    const free = ACTIVITIES.filter((a) => game.activitySlots[a] === null && (a !== "duel" || targets.length > 0));
    const activityId = free[Math.floor(Math.random() * free.length)];
    const targetPlayerId = activityId === "duel" ? targets[0] : undefined;
    send(h, { type: "select_activity", activityId, targetPlayerId });
  }
}

async function main() {
  // 1) 사람 1 + 봇 N: 한 판 완주
  const host = await connect();
  send(host, { type: "create_room", playerName: "사람" });
  await wait(200);
  for (let i = 0; i < botCount; i++) send(host, { type: "add_bot" });
  await wait(300);
  if (host.lobbyBots !== botCount) throw new Error(`봇 추가 실패 (${host.lobbyBots}/${botCount})`);
  send(host, { type: "add_bot" });
  send(host, { type: "start_game" });

  const started = Date.now();
  while (Date.now() - started < 240_000 && host.game?.phase !== "ended") await wait(200);
  if (host.game?.phase !== "ended") throw new Error(`게임이 끝나지 않았습니다 (round=${host.game?.round}, phase=${host.game?.phase}, errors=${host.errors.join("|")})`);
  const botPlayers = Object.values(host.game.players).filter((p) => p.isBot).length;
  if (botPlayers < botCount) throw new Error("게임 상태에 봇 표시가 없습니다");
  const unexpected = host.errors.filter((e) => !e.includes("가득") && !e.includes("추가할 수 없습니다"));
  if (unexpected.length) throw new Error(`서버 오류: ${unexpected.join(" | ")}`);
  console.log(`봇 게임 통과: 사람 1 + 봇 ${botCount}, ${host.game.round}라운드, ${Math.round((Date.now() - started) / 1000)}초`);
  host.socket.close();

  // 2) 게임 도중 접속이 끊긴 사람을 봇이 이어받는지 확인 (사람 2 + 봇 1 → 사람 1명 이탈)
  const a = await connect();
  send(a, { type: "create_room", playerName: "A" });
  await wait(200);
  const b = await connect();
  send(b, { type: "join_room", roomCode: a.roomCode, playerName: "B" });
  b.playerId = undefined;
  b.socket.on("message", (raw) => {
    const msg: ServerMessage = JSON.parse(raw.toString());
    if (msg.type === "room_joined") b.playerId = msg.playerId;
  });
  await wait(300);
  send(a, { type: "add_bot" });
  await wait(200);
  send(a, { type: "start_game" });
  await wait(500);
  b.socket.close(); // B가 수업 선택 전에 이탈
  const t2 = Date.now();
  while (Date.now() - t2 < 240_000 && a.game?.phase !== "ended") await wait(200);
  if (a.game?.phase !== "ended") throw new Error(`이탈 후 게임이 끝나지 않았습니다 (round=${a.game?.round}, phase=${a.game?.phase})`);
  if (!a.game.log.some((l) => l.message.includes("봇이 이어받습니다"))) throw new Error("봇 인계 로그가 없습니다");
  console.log("이탈 인계 통과: 접속이 끊긴 플레이어 자리를 봇이 이어받아 게임이 끝까지 진행되었습니다");
  a.socket.close();
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("봇 스모크 테스트 실패:", err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
