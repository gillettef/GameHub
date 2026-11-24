import { createHash } from 'node:crypto';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import type { Ack, ClientToServerEvents, PlayerId, RoomId, ServerToClientEvents } from '@rootbound/shared';
import { maskState } from '@rootbound/shared';
import { checkAiHealth } from './ai/client.js';
import { createAiRunner } from './game/aiTurn.js';
import { SnapshotStore } from './persistence/snapshots.js';
import { StatsLog, parseVitals } from './persistence/stats.js';
import { RoomError, RoomManager, type Room } from './rooms/manager.js';
import { isCurrentFormat } from './rooms/validate.js';

/**
 * 환경 변수 (dev 는 scripts/dev.ps1, 운영은 systemd unit(scripts/aws/units.sh)이 넣는다):
 *  PORT         수신 포트. dev 3101 / 운영 3201
 *  HOST         바인드 주소. 기본 0.0.0.0 (친구 접속·터널용)
 *  APP_ENV      dev | prod (헬스 응답과 로그에 표시)
 *  CLIENT_DIST  빌드된 클라이언트 디렉터리. 지정하면 정적 서빙 + SPA 폴백 (운영 서버)
 *  DATA_DIR     JSON 스냅샷 디렉터리 (F006). 기본 server/data/<APP_ENV>
 *  AI_BASE_URL  Python AI 서비스 주소 (server/src/ai/client.ts)
 */
const PORT = Number(process.env.PORT ?? 3101);
const HOST = process.env.HOST ?? '0.0.0.0';
const APP_ENV = process.env.APP_ENV ?? 'dev';
const CLIENT_DIST = process.env.CLIENT_DIST ? resolve(process.env.CLIENT_DIST) : null;
const DATA_DIR =resolve(process.env.DATA_DIR ?? join(process.cwd(), 'data', APP_ENV));

interface SocketData {
  roomId: RoomId | null;
  playerId: PlayerId | null;
}

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const app = express();
app.use(cors());
app.use(express.json({ limit: '8kb' }));

/** 판 요약에는 재접속 토큰 원본 대신 잘린 해시만 남긴다 (재방문 집계용) */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 12);
const manager = new RoomManager({ hashToken });
const snapshots = new SnapshotStore(DATA_DIR);
const stats = new StatsLog(DATA_DIR);

// ---------------------------------------------------------------------------
// 남용 방지 (공개 IP 로 열려 있다): 방 만들기 빈도, 비밀번호 대입, 웹 성능 기록 빈도
// ---------------------------------------------------------------------------

const MINUTE_MS = 60_000;
/** 방 만들기: 주소당 분당 5개, 주소당 열린 로비 3개까지 */
const MAX_CREATES_PER_MINUTE = 5;
const MAX_OPEN_LOBBIES_PER_IP = 3;
/** 비밀번호 오입력: 5번 틀리면 5분간 입장 시도를 막는다 */
const MAX_JOIN_FAILURES = 5;
const JOIN_LOCK_MS = 5 * MINUTE_MS;
/** 웹 성능 기록: 주소당 분당 10건, 서버 전체 분당 300건, 기억하는 주소 5000개까지 */
const MAX_VITALS_PER_IP = 10;
const MAX_VITALS_GLOBAL = 300;
const MAX_VITALS_IPS = 5000;

/** 방 만들기 기록(주소별 최근 시각)과 방을 만든 주소 */
const createHits = new Map<string, number[]>();
const roomOwnerIp = new Map<RoomId, string>();
/** 비밀번호 오입력 기록(주소별) */
const joinFailures = new Map<string, { count: number; until: number }>();
const vitalsHits = new Map<string, { count: number; resetAt: number }>();
const vitalsGlobal = { count: 0, resetAt: 0 };

function assertCanCreate(ip: string, now: number): void {
  const hits = (createHits.get(ip) ?? []).filter((t) => now - t < MINUTE_MS);
  if (hits.length >= MAX_CREATES_PER_MINUTE) throw new RoomError('방을 너무 자주 만들었습니다. 잠시 후 다시 시도하세요');
  const open = [...roomOwnerIp].filter(([id, owner]) => owner === ip && manager.get(id)?.state.phase === 'lobby').length;
  if (open >= MAX_OPEN_LOBBIES_PER_IP) throw new RoomError('이미 열어 둔 대기실이 많습니다. 쓰지 않는 방에서 나가 주세요');
}

function recordCreate(ip: string, now: number, roomId: RoomId): void {
  createHits.set(ip, [...(createHits.get(ip) ?? []).filter((t) => now - t < MINUTE_MS), now]);
  roomOwnerIp.set(roomId, ip);
}

function assertJoinAllowed(ip: string, now: number): void {
  const lock = joinFailures.get(ip);
  if (lock && lock.count >= MAX_JOIN_FAILURES && now < lock.until) throw new RoomError('입장 시도가 너무 많습니다. 몇 분 뒤 다시 시도하세요');
}

function recordJoinFailure(ip: string, now: number): void {
  const lock = joinFailures.get(ip);
  const cur = lock && now < lock.until ? lock : { count: 0, until: 0 };
  joinFailures.set(ip, { count: cur.count + 1, until: now + JOIN_LOCK_MS });
}

/** 웹 성능 기록을 받아도 되는가. 받으면 횟수를 센다 */
function allowVitals(ip: string, now: number): boolean {
  if (now >= vitalsGlobal.resetAt) Object.assign(vitalsGlobal, { count: 0, resetAt: now + MINUTE_MS });
  if (vitalsGlobal.count >= MAX_VITALS_GLOBAL) return false;
  vitalsGlobal.count++;
  const hit = vitalsHits.get(ip);
  if (hit && now < hit.resetAt && hit.count >= MAX_VITALS_PER_IP) return false;
  if (!hit && vitalsHits.size >= MAX_VITALS_IPS) return false;
  vitalsHits.set(ip, hit && now < hit.resetAt ? { count: hit.count + 1, resetAt: hit.resetAt } : { count: 1, resetAt: now + MINUTE_MS });
  return true;
}

/** 만료된 남용 방지 기록을 지운다 (시간마다) */
function pruneAbuseRecords(now: number): void {
  for (const [ip, h] of vitalsHits) if (now >= h.resetAt) vitalsHits.delete(ip);
  for (const [ip, ts] of createHits) if (ts.every((t) => now - t >= MINUTE_MS)) createHits.delete(ip);
  for (const id of roomOwnerIp.keys()) if (!manager.get(id)) roomOwnerIp.delete(id);
  for (const [ip, f] of joinFailures) if (now >= f.until) joinFailures.delete(ip);
}

// F007: 서버 시작 시 스냅샷 복원. 예전 게임(우주 전투판) 형식 스냅샷은 이어 갈 수 없어 rooms-legacy/ 로 격리한다
for (const room of snapshots.loadAll()) {
  if (!isCurrentFormat(room)) {
    snapshots.quarantine(room.roomId);
    console.log(`[server] 예전 형식 스냅샷을 rooms-legacy/ 로 옮김 ${room.roomId}`);
    continue;
  }
  manager.load(room);
}
console.log(`[server] 복원된 방 ${manager.list().length}개`);

app.get('/api/health', async (_req, res) => {
  const ai = await checkAiHealth();
  res.json({ ok: true, service: 'rootbound-server', env: APP_ENV, ai, rooms: manager.list().length });
});

// 웹 성능 기록 (FCP·LCP·동기화 왕복·FPS). 같은 출처만, 빈도 상한(allowVitals) 안에서 받는다.
// 파일 크기 상한은 StatsLog 가 지킨다
app.post('/api/vitals', (req, res) => {
  const now = Date.now();
  const origin = req.get('origin');
  if (origin && origin !== `${req.protocol}://${req.get('host')}`) return void res.status(403).end();
  if (!allowVitals(req.ip ?? 'unknown', now)) return void res.status(429).end();
  const record = parseVitals(req.body, now);
  if (record) stats.vitals(record);
  res.status(204).end();
});

// 입장 전 확인 (비밀번호 필요 여부 등, F003)
app.get('/api/rooms/:roomId', (req, res) => {
  try {
    res.json(manager.peek(req.params.roomId));
  } catch (err) {
    res.status(404).json({ message: err instanceof RoomError ? err.message : '없는 방입니다' });
  }
});

// 운영 서버: 빌드된 클라이언트를 같은 포트에서 서빙한다 (친구는 주소 하나만 알면 된다)
if (CLIENT_DIST) {
  if (!existsSync(join(CLIENT_DIST, 'index.html'))) {
    console.error(`[server] CLIENT_DIST 에 index.html 이 없습니다: ${CLIENT_DIST}. 먼저 클라이언트를 빌드하세요.`);
    process.exit(1);
  }
  // 카드 디자인 SVG(장당 최대 600KB)·JS 번들을 gzip 으로 보낸다. 소켓 연결(socket.io)은 express 를 거치지 않는다
  app.use(compression());
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

/** 변경 후 공통 처리: 판 요약 → 저장 → 브로드캐스트 → 턴 타이머 → AI 턴이면 실행 */
function commit(room: Room): void {
  const record = manager.takeRecord(room);
  if (record) stats.game(record);
  snapshots.save(room);
  broadcast(room);
  scheduleTurnTimer(room);
  ai.maybeRun(room.roomId);
}

// ---------------------------------------------------------------------------
// 차례 제한 시간 (Rules.md 6.3): 방마다 다음 마감에 타이머 하나. 상태가 바뀔 때마다 다시 건다
// ---------------------------------------------------------------------------

const turnTimers = new Map<RoomId, NodeJS.Timeout>();

function scheduleTurnTimer(room: Room): void {
  const prev = turnTimers.get(room.roomId);
  if (prev) clearTimeout(prev);
  turnTimers.delete(room.roomId);
  const deadline = manager.deadline(room);
  if (deadline === null) return;
  const roomId = room.roomId;
  const timer = setTimeout(() => {
    turnTimers.delete(roomId);
    // 공개 단계는 확인이 끝나면 바로 playing 으로 넘어가므로 처리 전에 단계를 잡아 둔다
    const wasReveal = manager.get(roomId)?.state.phase === 'reveal';
    const timedOut = manager.timeoutTurn(roomId);
    if (timedOut) {
      console.log(`[timer] room=${roomId} 시간 초과 → ${wasReveal ? '자동 확인' : '자동 수'}`);
      commit(timedOut);
    } else {
      const latest = manager.get(roomId);
      if (latest) scheduleTurnTimer(latest);
    }
  }, Math.max(0, deadline - Date.now()) + 50);
  timer.unref();
  turnTimers.set(roomId, timer);
}

function clearTurnTimer(roomId: RoomId): void {
  const t = turnTimers.get(roomId);
  if (t) clearTimeout(t);
  turnTimers.delete(roomId);
}

const ai = createAiRunner({ manager, onChange: commit });

function fail(err: unknown): { ok: false; message: string } {
  if (err instanceof RoomError) return { ok: false, message: err.message };
  console.error('[socket] 처리 오류', err);
  return { ok: false, message: '서버 오류가 났습니다. 잠시 후 다시 시도하세요' };
}

function requirePlayer(socket: AppSocket, roomId: RoomId): PlayerId {
  const playerId = socket.data.playerId;
  if (!playerId || socket.data.roomId !== roomId) throw new RoomError('먼저 방에 입장하세요');
  return playerId;
}

/** 입장한 사람의 요청 공통 처리: 본인 확인 → 실행 → ack → commit. 실패는 ack 로 돌려준다 */
function handlePlayer<T extends object>(
  socket: AppSocket,
  roomId: RoomId,
  ack: (res: Ack<T>) => void,
  run: (playerId: PlayerId) => { room: Room; reply: T },
): void {
  try {
    const { room, reply } = run(requirePlayer(socket, roomId));
    ack({ ok: true, ...reply });
    commit(room);
  } catch (err) {
    ack(fail(err));
  }
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

  // 조작된 클라이언트 방어: 모든 요청 이벤트는 (객체 payload, ack 함수) 모양이어야 한다. 아니면 핸들러에
  // 넘기지 않는다 — 구조분해·ack 호출이 try 밖에서 던지면 socket.io 가 잡지 않아 프로세스가 죽는다
  socket.use(([event, payload, ack], next) => {
    if (typeof payload !== 'object' || payload === null || typeof ack !== 'function') {
      console.warn(`[socket] 잘못된 요청 무시: ${String(event)} from ${socket.id}`);
      return next(new Error('잘못된 요청입니다'));
    }
    next();
  });
  // next(err) 는 소켓에 'error' 를 일으킨다. 리스너가 없으면 EventEmitter 가 던지므로 받아서 버린다
  socket.on('error', () => undefined);

  socket.on('room:create', (payload, ack) => {
    try {
      const ip = socket.handshake.address;
      const now = Date.now();
      assertCanCreate(ip, now);
      const { room, playerId } = manager.create(payload);
      recordCreate(ip, now, room.roomId);
      attach(socket, room.roomId, playerId);
      ack({ ok: true, roomId: room.roomId, playerId });
      commit(room);
      console.log(`[room] 생성 ${room.roomId} by ${payload.nickname}`);
    } catch (err) {
      ack(fail(err));
    }
  });

  socket.on('room:join', (payload, ack) => {
    // 4자리 비밀번호 무차별 대입 방지: 같은 주소에서 실패가 쌓이면 잠시 막는다
    const ip = socket.handshake.address;
    try {
      assertJoinAllowed(ip, Date.now());
      const { room, playerId, reconnected } = manager.join(payload);
      attach(socket, room.roomId, playerId);
      ack({ ok: true, playerId });
      // 접속 목록이 바뀌었으니 저장·브로드캐스트·타이머까지 다시 한다
      commit(room);
      console.log(`[room] ${reconnected ? '재접속' : '입장'} ${room.roomId} ${playerId}`);
    } catch (err) {
      if (err instanceof RoomError && /비밀번호가 다릅니다/.test(err.message)) recordJoinFailure(ip, Date.now());
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
      else {
        clearTurnTimer(roomId);
        snapshots.delete(roomId);
      }
    } catch (err) {
      ack(fail(err));
    }
  });

  socket.on('room:setTurnTime', ({ roomId, seconds }, ack) =>
    handlePlayer(socket, roomId, ack, (playerId) => ({ room: manager.setTurnTime(roomId, playerId, seconds ?? null), reply: {} })),
  );

  socket.on('game:resume', ({ roomId }, ack) =>
    handlePlayer(socket, roomId, ack, (playerId) => ({ room: manager.resume(roomId, playerId), reply: {} })),
  );

  socket.on('room:addAi', ({ roomId }, ack) =>
    handlePlayer(socket, roomId, ack, (playerId) => {
      const { room, playerId: aiId } = manager.addAi(roomId, playerId);
      return { room, reply: { playerId: aiId } };
    }),
  );

  socket.on('room:removeAi', ({ roomId, playerId: aiId }, ack) =>
    handlePlayer(socket, roomId, ack, (playerId) => ({ room: manager.removeAi(roomId, playerId, aiId), reply: {} })),
  );

  socket.on('game:action', ({ roomId, action, turn }, ack) =>
    handlePlayer(socket, roomId, ack, (playerId) => ({
      room: manager.act(roomId, playerId, action, typeof turn === 'number' ? turn : undefined),
      reply: {},
    })),
  );

  socket.on('disconnect', (reason) => {
    const { roomId } = socket.data;
    if (roomId) {
      const room = manager.get(roomId);
      // 접속 목록 갱신만. 게임 상태는 그대로 (제한 시간 없는 방 · 재접속 F007)
      if (room) setTimeout(() => broadcast(room), 0);
    }
    console.log(`[socket] 끊김: ${socket.id} (${reason})`);
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[server] env=${APP_ENV} http://${HOST}:${PORT}${CLIENT_DIST ? ` (client: ${CLIENT_DIST})` : ''}`);
  console.log(`[server] data dir: ${DATA_DIR}`);
  // 복원된 방 중 AI 턴에서 멈춘 방은 이어서 돌리고, 사람 턴은 남은 제한 시간을 다시 건다
  for (const room of manager.list()) {
    scheduleTurnTimer(room);
    ai.maybeRun(room.roomId);
  }
  // 오래 방치된 방과 만료된 비밀번호 잠금을 시간마다 정리한다
  setInterval(() => {
    const now = Date.now();
    for (const { roomId: id, record } of manager.pruneStale()) {
      if (record) stats.game(record);
      clearTurnTimer(id);
      snapshots.delete(id);
      console.log(`[room] 방치된 방 정리 ${id}`);
    }
    pruneAbuseRecords(now);
  }, 60 * MINUTE_MS).unref();
});
