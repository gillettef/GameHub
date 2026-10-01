// 친구들과 플레이할 때의 편의 기능 스모크 테스트: 이모지, 방장 설정/내보내기, 제한 시간 자동 진행·자리 비움 봇·돌아오기, 다시 하기
// 사용법: BOT_SPEED=20 TURN_SPEED=45 PORT=8099 npm run dev 로 서버를 띄운 뒤 npm run smoke:social -- [포트]
import WebSocket from "ws";
import type { ServerMessage } from "../src/messages.js";

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
  console.log("[1] 이모지와 방 설정");
  const a = await makeRoom(["호스트", "손님", "구경꾼"]);
  const g = a.guests[0].client;
  assert(last(a.host, "room_settings")?.turnSeconds === 90, "기본 제한 시간 90초");
  send(g, { type: "emoji", emoji: "👍" });
  await wait(150);
  assert(last(a.host, "emoji")?.emoji === "👍", "이모지가 모두에게 전달");
  send(g, { type: "emoji", emoji: "💣" });
  await wait(150);
  assert(last(a.host, "emoji")?.emoji === "👍" && a.host.msgs.filter((m) => m.type === "emoji").length === 1, "목록에 없는 이모지는 무시");
  send(g, { type: "set_turn_seconds", seconds: 45 });
  await wait(150);
  assert(last(a.host, "room_settings")?.turnSeconds === 90, "방장이 아니면 제한 시간을 못 바꿈");
  send(a.host, { type: "set_turn_seconds", seconds: 7 });
  await wait(150);
  assert(last(a.host, "room_settings")?.turnSeconds === 90, "허용되지 않는 값은 거절");
  send(a.host, { type: "set_turn_seconds", seconds: 45 });
  await wait(150);
  assert(last(g, "room_settings")?.turnSeconds === 45, "방장이 45초로 변경 (모두에게 전달)");

  console.log("[2] 대기실에서 내보내기");
  const kicked = a.guests[1];
  send(g, { type: "kick_player", playerId: kicked.id });
  await wait(150);
  assert(last(g, "error"), "방장이 아니면 내보낼 수 없음");
  send(a.host, { type: "kick_player", playerId: kicked.id });
  await wait(200);
  assert(last(kicked.client, "kicked"), "내보낸 사람에게 kicked");
  assert(last(g, "player_left")?.playerId === kicked.id, "남은 사람에게 player_left");

  console.log("[3] 제한 시간 초과 → 자동 진행 → 자리 비움 봇 → 돌아오기");
  send(a.host, { type: "start_game" });
  await wait(300);
  const timer = last(g, "turn_timer");
  assert(timer && Object.keys(timer.waiting).length > 0, "행동을 기다리는 사람과 남은 시간이 전달");
  await wait(4500);
  const game = last(g, "game_state")!.game;
  const log = game.log.map((l) => l.message).join("\n");
  assert(/시간 안에 고르지 못해 자동으로 진행/.test(log), "시간 초과 시 자동 진행 기록");
  assert(/자리를 비워 봇이 이어받습니다/.test(log), "연속으로 놓치면 봇이 이어받음");
  assert(game.players[a.guests[0].id].isBot === true, "자리를 비운 손님의 자리를 봇이 맡음");
  send(g, { type: "resume_seat" });
  await wait(300);
  assert(last(g, "game_state")!.game.players[a.guests[0].id].isBot === false, "돌아오기로 자리를 되찾음");
  send(a.host, { type: "set_turn_seconds", seconds: 0 });
  await wait(200);
  assert(Object.keys(last(a.host, "turn_timer")!.waiting).length === 0, "제한 시간 없음으로 바꾸면 기다림 표시도 사라짐");

  console.log("[4] 다시 하기");
  send(a.host, { type: "rematch" });
  await wait(200);
  assert(last(a.host, "error")?.message.includes("끝난 뒤"), "게임이 끝나기 전에는 다시 하기 불가");
  for (const c of [a.host, g, kicked.client]) c.socket.close();

  console.log("[5] 게임이 끝나면 같은 멤버로 다시 하기 (사람은 시간 초과로 봇이 이어받아 자동으로 끝까지 진행)");
  const b = await makeRoom(["방장"]);
  send(b.host, { type: "add_bot" });
  await wait(200);
  send(b.host, { type: "start_game" });
  for (let i = 0; i < 240 && last(b.host, "game_state")?.game.phase !== "ended"; i++) await wait(500);
  assert(last(b.host, "game_state")?.game.phase === "ended", "게임이 끝까지 진행됨");
  send(b.host, { type: "rematch" });
  await wait(300);
  const reset = last(b.host, "room_reset");
  assert(reset && reset.players.length === 2 && reset.hostId === b.hostId, "대기실로 돌아오고 사람·봇이 그대로 남음");
  b.host.msgs.length = 0;
  send(b.host, { type: "start_game" });
  await wait(400);
  const again = last(b.host, "game_state")?.game;
  assert(again && again.round === 1 && again.players[b.hostId].isBot === false, "새 게임이 처음부터 시작되고 방장은 다시 사람");
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
