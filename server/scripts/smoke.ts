// 스모크 테스트: 실행 중인 서버에 가짜 플레이어 N명이 WebSocket으로 접속해 한 판을 끝까지 진행합니다.
// 플레이테스트 전에 서버/프로토콜이 정상인지 빠르게 확인하는 용도입니다.
// 사용법: (다른 터미널에서 서버 실행 후) npm run smoke -- [인원(2~5)] [포트]
import WebSocket from "ws";
import type { ServerMessage } from "../src/messages.js";
import type { PublicGameState } from "../src/game/types.js";
import { nextAction } from "./smoke-actions.js";

const count = Number(process.argv[2]) || 3;
const port = Number(process.argv[3]) || 8080;

interface Client {
  name: string;
  socket: WebSocket;
  playerId?: string;
  game?: PublicGameState;
  errors: string[];
  lastAction?: string;
  onState: () => void;
}

function connect(name: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}/ws`);
    const client: Client = { name, socket, errors: [], onState: () => {} };
    socket.on("open", () => resolve(client));
    socket.on("error", reject);
    socket.on("message", (raw) => {
      const msg: ServerMessage = JSON.parse(raw.toString());
      if (msg.type === "room_created" || msg.type === "room_joined") client.playerId = msg.playerId;
      if (msg.type === "error") client.errors.push(msg.message);
      if (msg.type === "game_state") {
        client.game = msg.game;
        client.onState();
      }
    });
  });
}

const send = (c: Client, msg: object) => c.socket.send(JSON.stringify(msg));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const clients: Client[] = [];
  const host = await connect("호스트");
  clients.push(host);
  let roomCode = "";
  host.socket.once("message", (raw) => {
    const msg: ServerMessage = JSON.parse(raw.toString());
    if (msg.type === "room_created") roomCode = msg.roomCode;
  });
  send(host, { type: "create_room", playerName: "호스트" });
  await wait(200);
  if (!roomCode) throw new Error("방 생성 실패");

  for (let i = 1; i < count; i++) {
    const c = await connect(`손님${i}`);
    clients.push(c);
    send(c, { type: "join_room", roomCode, playerName: c.name });
    await wait(100);
  }

  const act = (c: Client) => {
    if (!c.game || !c.playerId) return;
    const action = nextAction(c.game, c.playerId);
    // 같은 상황에서 중복 전송하지 않도록 표식(key)이 바뀔 때만 행동한다
    if (!action || c.lastAction === action.key) return;
    c.lastAction = action.key;
    send(c, action.message);
  };
  for (const c of clients) c.onState = () => act(c);

  send(host, { type: "start_game" });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && host.game?.phase !== "ended") await wait(100);

  const game = host.game;
  const errors = clients.flatMap((c) => c.errors);
  if (!game || game.phase !== "ended") throw new Error(`게임이 끝나지 않았습니다 (phase=${game?.phase}, round=${game?.round}, errors=${errors.join("|")})`);
  if (errors.length) throw new Error(`서버 오류 메시지 수신: ${errors.join(" | ")}`);

  // 비공개 정보가 클라이언트로 새지 않는지 확인
  const raw = JSON.stringify(game);
  for (const key of ["classDecks", "creatureDeck", "labPile", "explorationPile", "grimoirePile", "hidden"]) {
    if (raw.includes(`"${key}"`)) throw new Error(`비공개 필드가 전송되었습니다: ${key}`);
  }
  for (const c of clients) {
    for (const [id, p] of Object.entries(c.game!.players)) {
      if (id !== c.playerId && p.peekedExploration) throw new Error("다른 플레이어가 엿본 탐험 카드가 노출되었습니다");
    }
  }

  console.log(`스모크 테스트 통과: ${count}인 ${game.round}라운드 종료, 승자 ${game.winnerIds?.map((id) => game.players[id].name).join(", ")}`);
  for (const c of clients) c.socket.close();
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("스모크 테스트 실패:", err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
