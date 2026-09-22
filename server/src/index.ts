import http from 'node:http';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@astraltab/shared';
import { DEFAULT_MAP_ID, createInitialState } from '@astraltab/shared';
import { checkAiHealth } from './ai/client.js';

/**
 * 환경 변수 (scripts/dev.ps1, scripts/serve.ps1 이 넣는다):
 *  PORT         수신 포트. dev 3101 / prod 3201 / test 3301
 *  HOST         바인드 주소. 기본 0.0.0.0 (친구 접속·터널용)
 *  APP_ENV      dev | prod | test (헬스 응답과 로그에 표시)
 *  CLIENT_DIST  빌드된 클라이언트 디렉터리. 지정하면 정적 서빙 + SPA 폴백 (운영·테스트 서버)
 *  DATA_DIR     JSON 스냅샷 디렉터리 (F006, Phase 2). 기본 server/data/<APP_ENV>
 *  AI_BASE_URL  Python AI 서비스 주소 (server/src/ai/client.ts)
 */
const PORT = Number(process.env.PORT ?? 3101);
const HOST = process.env.HOST ?? '0.0.0.0';
const APP_ENV = process.env.APP_ENV ?? 'dev';
const CLIENT_DIST = process.env.CLIENT_DIST ? resolve(process.env.CLIENT_DIST) : null;
export const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), 'data', APP_ENV));

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  const ai = await checkAiHealth();
  res.json({ ok: true, service: 'astraltab-server', env: APP_ENV, ai });
});

// 운영·테스트 서버: 빌드된 클라이언트를 같은 포트에서 서빙한다 (친구는 주소 하나만 알면 된다)
if (CLIENT_DIST) {
  if (!existsSync(join(CLIENT_DIST, 'index.html'))) {
    console.error(`[server] CLIENT_DIST 에 index.html 이 없습니다: ${CLIENT_DIST}. 먼저 클라이언트를 빌드하세요.`);
    process.exit(1);
  }
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(join(CLIENT_DIST, 'index.html'));
  });
}

const httpServer = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: true },
});

io.on('connection', (socket) => {
  console.log(`[socket] 연결: ${socket.id}`);

  // 스캐폴딩 단계: 방 참여 시 빈 초기 상태만 돌려준다. 실제 방 관리는 rooms/ 에서 구현한다 (Phase 2).
  socket.on('room:join', ({ roomId }) => {
    socket.join(roomId);
    // 시드는 서버가 발급한다 (엔진은 난수를 만들지 않는다)
    socket.emit('game:state', createInitialState(roomId, DEFAULT_MAP_ID, (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0));
  });

  socket.on('disconnect', (reason) => {
    console.log(`[socket] 끊김: ${socket.id} (${reason})`);
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[server] env=${APP_ENV} http://${HOST}:${PORT}${CLIENT_DIST ? ` (client: ${CLIENT_DIST})` : ''}`);
  console.log(`[server] data dir: ${DATA_DIR}`);
});
