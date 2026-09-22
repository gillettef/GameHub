import http from 'node:http';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import cors from 'cors';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import type { ClientToServerEvents, PlayerId, RoomId, ServerToClientEvents } from '@astraltab/shared';
import { maskState } from '@astraltab/shared';
import { checkAiHealth } from './ai/client.js';
import { createAiRunner } from './game/aiTurn.js';
import { SnapshotStore } from './persistence/snapshots.js';
import { RoomError, RoomManager, type Room } from './rooms/manager.js';

/**
 * 환경 변수 (scripts/dev.ps1, scripts/serve.ps1 이 넣는다):
 *  PORT         수신 포트. dev 3101 / prod 3201 / test 3301
 *  HOST         바인드 주소. 기본 0.0.0.0 (친구 접속·터널용)
 *  APP_ENV      dev | prod | test (헬스 응답과 로그에 표시)
 *  CLIENT_DIST  빌드된 클라이언트 디렉터리. 지정하면 정적 서빙 + SPA 폴백 (운영·테스트 서버)
 *  DATA_DIR     JSON 스냅샷 디렉터리 (F006). 기본 server/data/<APP_ENV>
 *  AI_BASE_URL  Python AI 서비스 주소 (server/src/ai/client.ts)
 */
const PORT = Number(process.env.PORT ?? 3101);
const HOST = process.env.HOST ?? '0.0.0.0';
const APP_ENV = process.env.APP_ENV ?? 'dev';
const CLIENT_DIST = process.env.CLIENT_DIST ? resolve(process.env.CLIENT_DIST) : null;
export const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), 'data', APP_ENV));

interface SocketData {
  roomId: RoomId | null;
  playerId: PlayerId | null;
}

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const app = express();
app.use(cors());
app.use(express.json());

const manager = new RoomManager();
const snapshots = new SnapshotStore(DATA_DIR);

// F007: 서버 시작 시 스냅샷 복원
for (const room of snapshots.loadAll()) manager.load(room);
console.log(`[server] 복원된 방 ${manager.list().length}개`);

app.get('/api/health', async (_req, res) => {
  const ai = await checkAiHealth();
  res.json({ ok: true, service: 'astraltab-server', env: APP_ENV, ai, rooms: manager.list().length });
});

// 입장 전 확인 (비밀번호 필요 여부 등, F003)
app.get('/api/rooms/:roomId', (req, res) => {
  try {
    res.json(manager.peek(req.params.roomId));
  } catch (err) {
    res.status(404).json({ message: err instanceof RoomError ? err.message : '없는 방입니다' });
  }
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
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  cors: { origin: true },
});

// ---------------------------------------------------------------------------
// 브로드캐스트: 방의 모든 소켓에 받는 사람 기준으로 가린 상태를 보낸다 (F004)
// ---------------------------------------------------------------------------

function socketsIn(roomId: RoomId): AppSocket[] {
  const ids = io.sockets.adapter.rooms.get(roomId);
  if (!ids) return [];
  const out: AppSocket[] = [];
  for (const id of ids) {
    const s = io.sockets.sockets.get(id);
    if (s) out.push(s);
  }
  return out;
}

function connectedPlayers(roomId: RoomId): PlayerId[] {
  const set = new Set<PlayerId>();
  for (const s of socketsIn(roomId)) if (s.data.playerId) set.add(s.data.playerId);
  return [...set].sort();
}

function broadcast(room: Room): void {
  const connected = connectedPlayers(room.roomId);
  const info = manager.info(room, connected);
  for (const s of socketsIn(room.roomId)) {
    const you = s.data.playerId;
    if (!you) continue;
    s.emit('room:state', { room: info, state: maskState(room.state, you), you });
  }
}

/** 변경 후 공통 처리: 저장 → 브로드캐스트 → AI 턴이면 실행 */
function commit(room: Room): void {
  snapshots.save(room);
  broadcast(room);
  ai.maybeRun(room.roomId);
}

const ai = createAiRunner({ manager, onChange: commit });

function fail(err: unknown): { ok: false; message: string } {
  if (err instanceof RoomError) return { ok: false, message: err.message };
  console.error('[socket] 처리 오류', err);
  return { ok: false, message: '서버 오류가 났습니다. 잠시 후 다시 시도하세요' };
}

function attach(socket: AppSocket, roomId: RoomId, playerId: PlayerId): void {
  if (socket.data.roomId && socket.data.roomId !== roomId) socket.leave(socket.data.roomId);
  socket.data.roomId = roomId;
  socket.data.playerId = playerId;
  socket.join(roomId);
}

io.on('connection', (socket: AppSocket) => {
  socket.data.roomId = null;
  socket.data.playerId = null;

  socket.on('room:create', (payload, ack) => {
    try {
      const { room, playerId } = manager.create(payload);
      attach(socket, room.roomId, playerId);
      ack({ ok: true, roomId: room.roomId, playerId });
      commit(room);
      console.log(`[room] 생성 ${room.roomId} by ${payload.nickname}`);
    } catch (err) {
      ack(fail(err));
    }
  });

  socket.on('room:join', (payload, ack) => {
    try {
      const { room, playerId, reconnected } = manager.join(payload);
      attach(socket, room.roomId, playerId);
      ack({ ok: true, playerId });
      if (reconnected) broadcast(room);
      else commit(room);
      console.log(`[room] ${reconnected ? '재접속' : '입장'} ${room.roomId} ${playerId}`);
    } catch (err) {
      ack(fail(err));
    }
  });

  socket.on('room:leave', ({ roomId }, ack) => {
    try {
      const playerId = socket.data.playerId;
      if (!playerId || socket.data.roomId !== roomId) throw new RoomError('이 방에 있지 않습니다');
      const room = manager.leave(roomId, playerId);
      socket.leave(roomId);
      socket.data.roomId = null;
      socket.data.playerId = null;
      ack({ ok: true });
      if (room) commit(room);
      else snapshots.delete(roomId);
    } catch (err) {
      ack(fail(err));
    }
  });

  socket.on('room:setMap', ({ roomId, mapId }, ack) => {
    try {
      const playerId = requirePlayer(socket, roomId);
      const room = manager.setMap(roomId, playerId, mapId);
      ack({ ok: true });
      commit(room);
    } catch (err) {
      ack(fail(err));
    }
  });

  socket.on('room:addAi', ({ roomId }, ack) => {
    try {
      const playerId = requirePlayer(socket, roomId);
      const { room, playerId: aiId } = manager.addAi(roomId, playerId);
      ack({ ok: true, playerId: aiId });
      commit(room);
    } catch (err) {
      ack(fail(err));
    }
  });

  socket.on('room:removeAi', ({ roomId, playerId: aiId }, ack) => {
    try {
      const playerId = requirePlayer(socket, roomId);
      const room = manager.removeAi(roomId, playerId, aiId);
      ack({ ok: true });
      commit(room);
    } catch (err) {
      ack(fail(err));
    }
  });

  socket.on('game:action', ({ roomId, action }, ack) => {
    try {
      const playerId = requirePlayer(socket, roomId);
      const room = manager.act(roomId, playerId, action);
      ack({ ok: true });
      commit(room);
    } catch (err) {
      ack(fail(err));
    }
  });

  socket.on('disconnect', (reason) => {
    const { roomId } = socket.data;
    if (roomId) {
      const room = manager.get(roomId);
      // 접속 목록 갱신만. 게임 상태는 그대로 (비동기 턴 F005 · 재접속 F007)
      if (room) setTimeout(() => broadcast(room), 0);
    }
    console.log(`[socket] 끊김: ${socket.id} (${reason})`);
  });
});

function requirePlayer(socket: AppSocket, roomId: RoomId): PlayerId {
  const playerId = socket.data.playerId;
  if (!playerId || socket.data.roomId !== roomId) throw new RoomError('먼저 방에 입장하세요');
  return playerId;
}

httpServer.listen(PORT, HOST, () => {
  console.log(`[server] env=${APP_ENV} http://${HOST}:${PORT}${CLIENT_DIST ? ` (client: ${CLIENT_DIST})` : ''}`);
  console.log(`[server] data dir: ${DATA_DIR}`);
  // 복원된 방 중 AI 턴에서 멈춘 방은 이어서 돌린다
  for (const room of manager.list()) ai.maybeRun(room.roomId);
});
