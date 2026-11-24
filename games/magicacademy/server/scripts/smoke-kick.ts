// 게임 중 내보내기 스모크 테스트: 방장이 게임 도중 친구(끊긴 사람·접속 중인 사람)를 내보내면 그 사람이 게임에서 완전히 빠지고
// 남은 사람끼리 이어 가는지, 2명 미만이 되는 내보내기는 거부되는지, 내보내진 자리로 rejoin이 안 되는지 확인합니다.
// 사용법: BOT_SPEED=20 PORT=8099 npm run dev 로 서버를 띄운 뒤 npm run smoke:kick -- [포트]
import WebSocket from "ws";
import type { ServerMessage } from "../src/messages.js";
import { nextAction } from "./smoke-actions.js";

const port = Number(process.argv[2]) || 8099;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Client {
  socket: WebSocket;
  msgs: ServerMessage[];
  keys: Set<string>;
}

function connect(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}/ws`);
    const client: Client = { socket, msgs: [], keys: new Set() };
    socket.on("message", (raw) => client.msgs.push(JSON.parse(raw.toString())));
    socket.on("open", () => resolve(client));
    socket.on("error", reject);
  });
}

const send = (c: Client, msg: object) => c.socket.send(JSON.stringify(msg));
const last = <T extends ServerMessage["type"]>(c: Client, type: T) =>
  [...c.msgs].reverse().find((m) => m.type === type) as Extract<ServerMessage, { type: T }> | undefined;
const gameOf = (c: Client) => last(c, "game_state")?.game;

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`실패: ${message}`);
  console.log(`  ok - ${message}`);
}

// 사람 역할을 하는 클라이언트가 지금 해야 할 일을 한 번 한다 (같은 상황에서 중복 전송하지 않음)
function act(c: Client, playerId: string): boolean {
  const game = gameOf(c);
  const action = game && nextAction(game, playerId);
  if (!action || c.keys.has(action.key)) return false;
  c.keys.add(action.key);
  send(c, action.message);
  return true;
}

async function makeRoom(names: string[], bots = 0) {
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
  for (let i = 0; i < bots; i++) {
    send(host, { type: "add_bot" });
    await wait(100);
  }
  return { host, hostId: created.playerId, guests, code: created.roomCode };
}

async function main() {
  console.log("[1] 사람 3명: 접속이 끊긴 사람의 차례에 게임이 멈춰 있다가, 방장이 내보내면 바로 이어짐");
  const a = await makeRoom(["방장", "손님", "잠수"]);
  const [guest, ghost] = a.guests;
  send(a.host, { type: "start_game" });
  await wait(400);
  // 선 정하기(주사위)부터 끊긴 사람을 기다리게 한다: 잠수가 끊긴 상태로 두고 나머지만 행동
  ghost.client.socket.terminate();
  await wait(300);
  for (let i = 0; i < 40; i++) {
    act(a.host, a.hostId);
    act(guest.client, guest.id);
    await wait(100);
  }
  const waiting = gameOf(a.host)!;
  assert(waiting.players[ghost.id], "끊긴 사람의 자리가 유지됨");
  assert(!waiting.log.some((l) => l.message.includes("봇이 이어받")), "봇이 대신하지 않음");
  assert(last(a.host, "presence")?.offline.includes(ghost.id), "끊김이 모두에게 표시됨");
  // 게임이 어디선가 멈춰 있어야 한다 (끊긴 사람이 필요한 단계)
  const before = JSON.stringify([waiting.round, waiting.phase, waiting.log.length]);
  await wait(800);
  assert(JSON.stringify([gameOf(a.host)!.round, gameOf(a.host)!.phase, gameOf(a.host)!.log.length]) === before, "끊긴 사람을 게임이 기다림");

  send(guest.client, { type: "kick_player", playerId: ghost.id });
  await wait(200);
  assert(last(guest.client, "error"), "방장이 아니면 내보낼 수 없음");
  send(a.host, { type: "kick_player", playerId: ghost.id });
  await wait(400);
  const afterKick = gameOf(a.host)!;
  assert(!afterKick.players[ghost.id] && !afterKick.turnOrder.includes(ghost.id), "내보낸 사람이 게임에서 완전히 빠짐 (봇 대체 아님)");
  assert(afterKick.turnOrder.length === 2, "남은 2명으로 진행");
  assert(afterKick.log.some((l) => l.message.includes("내보내졌어요")), "내보냈다는 기록이 남음");
  assert(last(a.host, "player_left")?.playerId === ghost.id, "남은 사람에게 player_left");
  const rejoin = await connect();
  send(rejoin, { type: "rejoin_room", roomCode: a.code, playerId: ghost.id });
  await wait(200);
  assert(last(rejoin, "rejoin_failed"), "내보내진 자리로는 rejoin 불가");

  console.log("[2] 남은 두 사람이 내보내기 이후 끝까지 진행 (선·차례·굴림 상태가 일관되게 정리됨)");
  for (let i = 0; i < 6000 && gameOf(a.host)?.phase !== "ended"; i++) {
    act(a.host, a.hostId);
    act(guest.client, guest.id);
    await wait(50);
  }
  const done = gameOf(a.host)!;
  assert(done.phase === "ended", `게임이 끝까지 진행됨 (round=${done.round}, phase=${done.phase})`);

  console.log("[3] 2명 미만이 되는 내보내기는 거부");
  const c = await makeRoom(["방장"], 1);
  send(c.host, { type: "start_game" });
  await wait(400);
  const bot = gameOf(c.host)!.turnOrder.find((id) => id !== c.hostId)!;
  send(c.host, { type: "kick_player", playerId: bot });
  await wait(200);
  assert(last(c.host, "error")?.message.includes("2명 이상"), "2명뿐이면 내보낼 수 없음");
  assert(gameOf(c.host)!.turnOrder.length === 2, "인원이 그대로");
  c.host.socket.close();

  console.log("[4] 여러 시점에서 내보내도 게임이 멈추지 않음 (사람 4명, 서로 다른 시점에 내보내기)");
  for (let trial = 0; trial < 3; trial++) {
    const d = await makeRoom(["방장", "가", "나", "다"]);
    send(d.host, { type: "start_game" });
    const actors = [{ c: d.host, id: d.hostId }, ...d.guests.map((g) => ({ c: g.client, id: g.id }))];
    const kickAfter = 3 + trial * 20; // 행동 횟수 기준으로 서로 다른 단계에서 내보낸다
    let acted = 0;
    let kicked = false;
    for (let i = 0; i < 6000 && gameOf(d.host)?.phase !== "ended"; i++) {
      for (const actor of actors) if (act(actor.c, actor.id)) acted++;
      if (!kicked && acted >= kickAfter) {
        kicked = true;
        const victim = d.guests[trial % 3];
        send(d.host, { type: "kick_player", playerId: victim.id });
        actors.splice(actors.findIndex((x) => x.id === victim.id), 1);
      }
      await wait(30);
    }
    assert(gameOf(d.host)?.phase === "ended" && kicked, `시도 ${trial + 1}: ${kickAfter}번째 행동 뒤에 내보내도 끝까지 진행 (round=${gameOf(d.host)?.round}, phase=${gameOf(d.host)?.phase})`);
    for (const x of actors) x.c.socket.close();
  }
  console.log("모두 통과");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
