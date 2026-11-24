// 단독 서버(로컬 개발·플레이테스트·예전 systemd): app.ts 의 Express 앱과 WebSocket(/ws)을 한 포트로 연다.
// 운영은 GameHub 허브 안에서 실행된다(scripts/aws/hub-entry.mjs 가 dist/app.js 를 부른다).
import { createServer } from "node:http";
import os from "node:os";
import { app, upgrade } from "./app.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

const server = createServer(app);
server.on("upgrade", (req, socket, head) => {
  if (!upgrade(req, socket, head)) socket.destroy();
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
