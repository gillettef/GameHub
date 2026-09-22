import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@astraltab/shared';
import { createInitialState } from '@astraltab/shared';
import { checkAiHealth } from './ai/client.js';

const PORT = Number(process.env.PORT ?? 3101);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  const ai = await checkAiHealth();
  res.json({ ok: true, service: 'astraltab-server', ai });
});

const httpServer = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: true },
});

io.on('connection', (socket) => {
  console.log(`[socket] 연결: ${socket.id}`);

  // 스캐폴딩 단계: 방 참여 시 빈 초기 상태만 돌려준다. 실제 방 관리는 rooms/ 에서 구현한다.
  socket.on('room:join', ({ roomId }) => {
    socket.join(roomId);
    // 시드는 서버가 발급한다 (엔진은 난수를 만들지 않는다)
    socket.emit('game:state', createInitialState(roomId, (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0));
  });

  socket.on('disconnect', (reason) => {
    console.log(`[socket] 끊김: ${socket.id} (${reason})`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
});
