// 나가기 스모크 테스트: (1) 대기실에서 방장이 나가면 방장 이양, (2) 게임 중 나가면 봇이 이어받고 다시 돌아올 수 없음, (3) 사람이 모두 나가면 방 삭제
// 사용법: BOT_SPEED=20 PORT=8099 npm run dev 로 서버를 띄운 뒤 npm run smoke:leave -- [포트]
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

async function makeRoom() {
  const host = await connect();
  send(host, { type: "create_room", playerName: "호스트" });
  await wait(200);
  const created = last(host, "room_created")!;
  const guest = await connect();
  send(guest, { type: "join_room", roomCode: created.roomCode, playerName: "손님" });
  await wait(200);
  const joined = last(guest, "room_joined")!;
  return { host, guest, code: created.roomCode, hostId: created.playerId, hostToken: created.token, guestId: joined.playerId };
}

async function main() {
  console.log("[1] 대기실에서 방장이 나가면 방장 이양");
  const a = await makeRoom();
  send(a.host, { type: "leave_room" });
  await wait(200);
  assert(last(a.host, "left_room"), "나간 사람에게 left_room 응답");
  assert(last(a.guest, "player_left")?.playerId === a.hostId, "남은 사람에게 player_left");
  assert(last(a.guest, "host_changed")?.hostId === a.guestId, "손님이 새 방장");

  console.log("[2] 게임 중 나가면 봇이 이어받고 돌아올 수 없음");
  const b = await makeRoom();
  send(b.host, { type: "start_game" });
  await wait(300);
  send(b.host, { type: "leave_room" });
  await wait(300);
  assert(last(b.host, "left_room"), "left_room 응답");
  const game = last(b.guest, "game_state")!.game;
  assert(game.players[b.hostId]?.isBot === true, "나간 자리를 봇이 이어받음");
  assert(last(b.guest, "host_changed")?.hostId === b.guestId, "방장이 남은 사람에게 넘어감");
  const back = await connect();
  send(back, { type: "rejoin_room", roomCode: b.code, playerId: b.hostId, token: b.hostToken });
  await wait(200);
  assert(last(back, "rejoin_failed"), "나간 자리로는 재접속 불가");

  console.log("[3] 사람이 모두 나가면 방 삭제");
  send(b.guest, { type: "leave_room" });
  await wait(200);
  const gone = await connect();
  send(gone, { type: "join_room", roomCode: b.code, playerName: "늦은손님" });
  await wait(200);
  assert(last(gone, "error"), "방이 삭제되어 입장 불가");

  console.log("모두 통과");
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
