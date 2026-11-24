// 재접속 스모크 테스트: 게임 도중 연결이 끊겼다가 (1) 바로 돌아오는 경우, (2) 한참 뒤에 돌아오는 경우(자리가 유지되고 봇이 대신하지 않음)를 확인합니다.
// 사용법: BOT_SPEED=20 PORT=8099 npm run dev 로 서버를 띄운 뒤 npm run smoke:rejoin -- [포트]
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

  console.log("[1] 끊겼다가 바로 복귀");
  guest.socket.terminate();
  await wait(300);
  assert(last(host, "presence")?.offline.includes(joined.playerId), "남은 사람에게 '연결 끊김'이 전달");
  const back1 = await connect();
  send(back1, { type: "rejoin_room", roomCode: created.roomCode, playerId: joined.playerId, token: joined.token });
  await wait(300);
  assert(last(back1, "room_rejoined")?.playerId === joined.playerId, "같은 playerId로 복귀");
  assert(last(back1, "game_state")?.game.players[joined.playerId]?.isBot === false, "봇으로 바뀌지 않음");
  assert(last(host, "presence")?.offline.length === 0, "복귀하면 '연결 끊김'이 사라짐");

  console.log("[2] 오래 끊겨 있어도 자리가 유지되고 봇이 대신하지 않음 (게임은 기다림)");
  back1.socket.terminate();
  await wait(3000);
  const stateWhileAway = last(host, "game_state")!.game;
  assert(stateWhileAway.players[joined.playerId]?.isBot === false, "끊긴 자리를 봇이 맡지 않음");
  assert(!stateWhileAway.log.some((l) => l.message.includes("봇이 이어받")), "봇 인계 기록이 없음");
  const back2 = await connect();
  send(back2, { type: "rejoin_room", roomCode: created.roomCode, playerId: joined.playerId, token: joined.token });
  await wait(300);
  assert(last(back2, "room_rejoined"), "오래 끊긴 뒤에도 복귀 성공");
  assert(last(back2, "game_state")?.game.players[joined.playerId]?.isBot === false, "복귀한 자리는 계속 사람");

  console.log("[3] 없는 방/자리");
  const stranger = await connect();
  send(stranger, { type: "rejoin_room", roomCode: created.roomCode, playerId: "nope", token: joined.token });
  await wait(200);
  assert(last(stranger, "rejoin_failed"), "없는 자리는 rejoin_failed");

  console.log("[4] 공개된 playerId만으로는 남의 자리를 가로챌 수 없음 (비밀 토큰 필요)");
  const snapshot = JSON.stringify(host.msgs);
  assert(!snapshot.includes(joined.token), "손님의 토큰은 다른 사람에게 한 번도 전달되지 않음");
  assert(created.token !== joined.token, "자리마다 토큰이 다름");
  for (const token of [undefined, "", created.token, joined.token.toUpperCase()]) {
    const thief = await connect();
    send(thief, { type: "rejoin_room", roomCode: created.roomCode, playerId: joined.playerId, token } as never);
    await wait(200);
    assert(last(thief, "rejoin_failed") && !last(thief, "room_rejoined"), `틀린 토큰(${token === undefined ? "없음" : token === "" ? "빈 값" : "다른 값"})은 rejoin_failed`);
  }
  assert(last(back2, "game_state") && back2.socket.readyState === back2.socket.OPEN, "진짜 주인의 연결은 끊기지 않음");

  console.log("모두 통과");
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
