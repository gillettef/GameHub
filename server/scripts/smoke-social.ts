// 친구들과 플레이할 때의 편의 기능 스모크 테스트: 이모지, 방장 설정/내보내기, 제한 시간 자동 진행·자리 비움 봇·돌아오기, 다시 하기
// 사용법: BOT_SPEED=20 TURN_SPEED=45 PORT=8099 npm run dev 로 서버를 띄운 뒤 npm run smoke:social -- [포트]
import WebSocket from "ws";
import type { ServerMessage } from "../src/messages.js";
import { nextAction } from "./smoke-actions.js";

const port = Number(process.argv[2]) || 8099;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Client {
  socket: WebSocket;
  msgs: ServerMessage[];
}

function connect(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}/ws`);
    const client: Client = { socket, msgs: [] };
    socket.on("message", (raw) => client.msgs.push(JSON.parse(raw.toString())));
    socket.on("open", () => resolve(client));
    socket.on("error", reject);
  });
}

const send = (c: Client, msg: object) => c.socket.send(JSON.stringify(msg));
const last = <T extends ServerMessage["type"]>(c: Client, type: T) =>
  [...c.msgs].reverse().find((m) => m.type === type) as Extract<ServerMessage, { type: T }> | undefined;

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`실패: ${message}`);
  console.log(`  ok - ${message}`);
}

async function makeRoom(names: string[]) {
  const host = await connect();
  send(host, { type: "create_room", playerName: names[0] });
  await wait(200);
  const created = last(host, "room_created")!;
  const guests: { client: Client; id: string }[] = [];
  for (const name of names.slice(1)) {
    const client = await connect();
    send(client, { type: "join_room", roomCode: created.roomCode, playerName: name });
    await wait(200);
    guests.push({ client, id: last(client, "room_joined")!.playerId });
  }
  return { host, hostId: created.playerId, guests, code: created.roomCode };
}

async function main() {
  console.log("[1] 이모지");
  const a = await makeRoom(["호스트", "손님", "구경꾼"]);
  const g = a.guests[0].client;
  send(g, { type: "emoji", emoji: "👍" });
  await wait(150);
  assert(last(a.host, "emoji")?.emoji === "👍", "이모지가 모두에게 전달");
  send(g, { type: "emoji", emoji: "💣" });
  await wait(150);
  assert(last(a.host, "emoji")?.emoji === "👍" && a.host.msgs.filter((m) => m.type === "emoji").length === 1, "목록에 없는 이모지는 무시");

  console.log("[2] 대기실에서 내보내기");
  const kicked = a.guests[1];
  send(g, { type: "kick_player", playerId: kicked.id });
  await wait(150);
  assert(last(g, "error"), "방장이 아니면 내보낼 수 없음");
  send(a.host, { type: "kick_player", playerId: kicked.id });
  await wait(200);
  assert(last(kicked.client, "kicked"), "내보낸 사람에게 kicked");
  assert(last(g, "player_left")?.playerId === kicked.id, "남은 사람에게 player_left");

  console.log("[3] 다시 하기");
  send(a.host, { type: "rematch" });
  await wait(200);
  assert(last(a.host, "error")?.message.includes("끝난 뒤"), "게임이 끝나기 전에는 다시 하기 불가");
  for (const c of [a.host, g, kicked.client]) c.socket.close();

  console.log("[4] 게임이 끝나면 같은 멤버로 다시 하기 (사람 1명이 직접 끝까지 진행)");
  const b = await makeRoom(["방장"]);
  send(b.host, { type: "add_bot" });
  await wait(200);
  send(b.host, { type: "start_game" });
  let lastKey = "";
  for (let i = 0; i < 3000 && last(b.host, "game_state")?.game.phase !== "ended"; i++) {
    const game = last(b.host, "game_state")?.game;
    const action = game && nextAction(game, b.hostId);
    if (action && action.key !== lastKey) {
      lastKey = action.key;
      send(b.host, action.message);
    }
    await wait(100);
  }
  assert(last(b.host, "game_state")?.game.phase === "ended", "게임이 끝까지 진행됨");
  send(b.host, { type: "rematch" });
  await wait(300);
  const reset = last(b.host, "room_reset");
  assert(reset && reset.players.length === 2 && reset.hostId === b.hostId, "대기실로 돌아오고 사람·봇이 그대로 남음");
  b.host.msgs.length = 0;
  send(b.host, { type: "start_game" });
  await wait(400);
  const again = last(b.host, "game_state")?.game;
  assert(again && again.round === 1 && again.players[b.hostId].isBot === false, "새 게임이 처음부터 시작되고 방장은 사람");
  b.host.socket.close();
  console.log("모든 스모크 테스트 통과");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
