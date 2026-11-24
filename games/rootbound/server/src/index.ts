/**
 * 단독 실행 진입점(로컬 /dev, 수동 확인). 운영은 GameHub 허브 안에서 돈다(scripts/aws/hub-entry.mjs → app.ts).
 *
 * 환경 변수 (dev 는 scripts/dev.ps1 이 넣는다):
 *  PORT         수신 포트. 기본 3101
 *  HOST         바인드 주소. 기본 0.0.0.0 (친구 접속·터널용)
 *  APP_ENV      dev | prod (헬스 응답과 로그에 표시)
 *  CLIENT_DIST  빌드된 클라이언트 디렉터리. 지정하면 정적 서빙 + SPA 폴백
 *  DATA_DIR     JSON 스냅샷 디렉터리 (F006). 기본 server/data/<APP_ENV>
 */
import { join, resolve } from 'node:path';
import { createRootboundServer } from './app.js';

const PORT = Number(process.env.PORT ?? 3101);
const HOST = process.env.HOST ?? '0.0.0.0';
const APP_ENV = process.env.APP_ENV ?? 'dev';

const server = createRootboundServer({
  appEnv: APP_ENV,
  dataDir: resolve(process.env.DATA_DIR ?? join(process.cwd(), 'data', APP_ENV)),
  clientDist: process.env.CLIENT_DIST ? resolve(process.env.CLIENT_DIST) : null,
});

server.httpServer.listen(PORT, HOST, () => {
  console.log(`[server] http://${HOST}:${PORT}`);
  server.start();
});
