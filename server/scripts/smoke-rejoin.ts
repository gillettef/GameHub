// 재접속 스모크 테스트: 게임 도중 연결이 끊겼다가 (1) 유예 시간 안에 돌아오는 경우, (2) 봇이 자리를 맡은 뒤 돌아오는 경우를 확인합니다.
// 사용법: AWAY_GRACE_MS=1500 BOT_SPEED=20 PORT=8099 npm run dev 로 서버를 띄운 뒤 npm run smoke:rejoin -- [포트]
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

async function main() {
  const host = await connect();
  send(host, { type: "create_room", playerName: "호스트" });
  await wait(200);
  const created = last(host, "room_created");
  assert(created, "방 생성");
  const guest = await connect();
  send(guest, { type: "join_room", roomCode: created.roomCode, playerName: "손님" });
  await wait(200);
  const joined = last(guest, "room_joined");
  assert(joined, "손님 입장");
  send(host, { type: "start_game" });
  await wait(300);
  assert(last(guest, "game_state"), "게임 시작");

  console.log("[1] 유예 시간 안에 복귀");
  guest.socket.terminate();
  await wait(300);
  const back1 = await connect();
  send(back1, { type: "rejoin_room", roomCode: created.roomCode, playerId: joined.playerId });
  await wait(300);
  assert(last(back1, "room_rejoined")?.playerId === joined.playerId, "같은 playerId로 복귀");
  assert(last(back1, "game_state")?.game.players[joined.playerId]?.isBot === false, "봇으로 바뀌지 않음");

  console.log("[2] 유예 시간이 지나 봇이 맡은 뒤 복귀");
  back1.socket.terminate();
  await wait(2500);
  const back2 = await connect();
  send(back2, { type: "rejoin_room", roomCode: created.roomCode, playerId: joined.playerId });
  await wait(300);
  assert(last(back2, "room_rejoined"), "봇이 맡은 뒤에도 복귀 성공");
  assert(last(back2, "game_state")?.game.players[joined.playerId]?.isBot === false, "다시 사람으로 돌아옴");

  console.log("[3] 없는 방/자리");
  const stranger = await connect();
  send(stranger, { type: "rejoin_room", roomCode: created.roomCode, playerId: "nope" });
  await wait(200);
  assert(last(stranger, "rejoin_failed"), "없는 자리는 rejoin_failed");

  console.log("모두 통과");
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
