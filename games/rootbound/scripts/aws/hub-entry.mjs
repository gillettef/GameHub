// GameHub 허브 안에서 실행할 때의 진입점(허브 games.json 의 "mode": "inproc"). 단독 실행(로컬 /dev)은 server/src/index.ts.
// server/dist/app.mjs 는 서버·shared·express·socket.io 를 한 파일로 묶은 esbuild 번들이다(npm run build -w @rootbound/server).
// 그래서 운영 서버에는 node_modules 도 tsx 도 필요 없다.
// 정적 파일(client/dist/prod, gzip)·SPA 폴백·/api·/socket.io 모두 서버 앱이 맡으므로 모든 요청을 넘긴다.
// 방 스냅샷·통계는 예전 단독 서비스와 같은 위치(server/data/prod)에 둔다 — 허브를 다시 시작해도 진행 중인 방이 복원된다.
import path from 'node:path';

export async function mount(ctx) {
  const { createRootboundServer } = await import('../../server/dist/app.mjs');
  const server = createRootboundServer({
    appEnv: 'prod',
    dataDir: path.join(ctx.dir, 'server', 'data', 'prod'),
    clientDist: path.join(ctx.dir, 'client', 'dist', 'prod'),
    log: ctx.log,
  });
  server.start();
  return {
    handle(req, res) {
      server.handle(req, res);
      return true;
    },
    upgrade: (req, socket, head) => server.upgrade(req, socket, head),
    close: () => server.close(),
  };
}
