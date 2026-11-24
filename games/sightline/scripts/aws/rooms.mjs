// 온라인 대전 방 관리. 서버가 게임 상태를 쥐고, 좌석마다 걸러 낸 화면 정보만 SSE로 보낸다.
// 상태는 메모리에만 있다(재시작하면 진행 중인 방은 사라진다).
import { randomBytes } from 'node:crypto';
import { createGame, act, viewFor } from '../../dist/engine/rules.js';
import { chooseAction } from '../../dist/engine/bot.js';

const SEATS = { 3: ['N', 'E', 'S'], 4: ['N', 'E', 'S', 'W'] };
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS ?? 900);
const ROOM_TTL_MS = 3 * 60 * 60 * 1000;
const MAX_ROOMS = 300;
const BOT_NAMES = ['봇 로즈', '봇 히드라', '봇 해바', '봇 아이비'];

const rooms = new Map();

const code4 = () => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from(randomBytes(4), (b) => A[b % A.length]).join(''); } while (rooms.has(c));
  return c;
};
const token = () => randomBytes(16).toString('hex');
const clean = (s, max = 16) => String(s ?? '').replace(/[<>&"'`]/g, '').trim().slice(0, max);

export class ApiError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

function lobbyInfo(room) {
  return {
    code: room.code, size: room.size, started: !!room.state, host: room.hostSeat,
    slots: SEATS[room.size].map((seat) => {
      const s = room.slots[seat];
      return { seat, name: s?.name ?? null, bot: !!s?.bot, online: !!s && (s.bot || s.clients.size > 0) };
    }),
  };
}

function playerIndex(room, seat) {
  return room.state ? room.state.players.findIndex((p) => p.seat === seat) : -1;
}

function payloadFor(room, seat) {
  const out = { lobby: lobbyInfo(room), mySeat: seat };
  if (room.state) {
    const idx = seat ? playerIndex(room, seat) : null;
    out.view = viewFor(room.state, idx < 0 ? null : idx);
    out.names = Object.fromEntries(SEATS[room.size].map((s) => [s, room.slots[s]?.name ?? '']));
  }
  return out;
}

function broadcast(room) {
  room.updated = Date.now();
  for (const seat of SEATS[room.size]) {
    const s = room.slots[seat];
    if (!s || s.bot) continue;
    const data = `data: ${JSON.stringify(payloadFor(room, seat))}\n\n`;
    for (const res of s.clients) res.write(data);
  }
  scheduleBot(room);
}

function scheduleBot(room) {
  const st = room.state;
  if (!st || st.phase === 'over' || room.botTimer) return;
  const seat = st.players[st.turn].seat;
  if (!room.slots[seat]?.bot) return;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!room.state || room.state.phase === 'over') return;
    const i = room.state.turn;
    if (room.state.players[i].seat !== seat) return;
    const a = chooseAction(viewFor(room.state, i));
    const err = act(room.state, i, a);
    if (err) act(room.state, i, { type: 'pass' });
    broadcast(room);
  }, BOT_DELAY_MS);
}

function getRoom(code) {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room) throw new ApiError(404, '방을 찾을 수 없습니다.');
  return room;
}

function auth(room, body) {
  const seat = body?.seat;
  const s = room.slots[seat];
  if (!s || s.bot || s.token !== body?.token) throw new ApiError(403, '권한이 없습니다.');
  return seat;
}

function startGame(room) {
  room.state = createGame({ seats: SEATS[room.size], seed: randomBytes(4).readUInt32LE(0) });
}

// ---------- API ----------
export function createRoom(body) {
  if (rooms.size >= MAX_ROOMS) throw new ApiError(503, '방이 너무 많습니다. 잠시 뒤에 다시 시도하세요.');
  const size = Number(body?.size) === 3 ? 3 : 4;
  const name = clean(body?.name) || '후원자';
  const room = { code: code4(), size, slots: {}, state: null, created: Date.now(), updated: Date.now(), botTimer: null };
  const seats = SEATS[size];
  const seat = seats.includes(body?.seat) ? body.seat : seats[0];
  const tk = token();
  room.slots[seat] = { name, token: tk, bot: false, clients: new Set() };
  room.hostSeat = seat;
  rooms.set(room.code, room);
  if (body?.vsBots) {
    seats.forEach((s, k) => { if (!room.slots[s]) room.slots[s] = { name: BOT_NAMES[k], bot: true, clients: new Set() }; });
    startGame(room);
    scheduleBot(room);
  }
  return { code: room.code, seat, token: tk };
}

export function joinRoom(code, body) {
  const room = getRoom(code);
  if (room.state) throw new ApiError(409, '이미 시작한 방입니다.');
  const free = SEATS[room.size].filter((s) => !room.slots[s]);
  if (!free.length) throw new ApiError(409, '빈 좌석이 없습니다.');
  const seat = free.includes(body?.seat) ? body.seat : free[0];
  const tk = token();
  room.slots[seat] = { name: clean(body?.name) || '후원자', token: tk, bot: false, clients: new Set() };
  broadcast(room);
  return { code: room.code, seat, token: tk };
}

export function hostCommand(code, body) {
  const room = getRoom(code);
  const seat = auth(room, body);
  if (seat !== room.hostSeat) throw new ApiError(403, '방장만 할 수 있습니다.');
  if (room.state) throw new ApiError(409, '이미 시작했습니다.');
  const seats = SEATS[room.size];
  if (body.cmd === 'addBot') {
    const s = seats.includes(body.target) && !room.slots[body.target] ? body.target : seats.find((x) => !room.slots[x]);
    if (!s) throw new ApiError(409, '빈 좌석이 없습니다.');
    room.slots[s] = { name: BOT_NAMES[seats.indexOf(s)], bot: true, clients: new Set() };
  } else if (body.cmd === 'removeBot') {
    if (room.slots[body.target]?.bot) delete room.slots[body.target];
  } else if (body.cmd === 'start') {
    if (seats.some((s) => !room.slots[s])) throw new ApiError(409, '모든 좌석이 차야 시작할 수 있습니다.');
    startGame(room);
  } else {
    throw new ApiError(400, '알 수 없는 명령입니다.');
  }
  broadcast(room);
  return { ok: true };
}

export function doAction(code, body) {
  const room = getRoom(code);
  const seat = auth(room, body);
  if (!room.state) throw new ApiError(409, '아직 시작하지 않았습니다.');
  const i = playerIndex(room, seat);
  const err = act(room.state, i, body.action);
  if (err) throw new ApiError(400, err);
  broadcast(room);
  return { ok: true };
}

export function rematch(code, body) {
  const room = getRoom(code);
  const seat = auth(room, body);
  if (seat !== room.hostSeat) throw new ApiError(403, '방장만 할 수 있습니다.');
  if (!room.state || room.state.phase !== 'over') throw new ApiError(409, '게임이 끝난 뒤에 할 수 있습니다.');
  startGame(room);
  broadcast(room);
  return { ok: true };
}

/** SSE 연결. seat/token 이 맞으면 그 좌석 화면, 아니면 관전 화면 */
export function openStream(code, seat, tk, res) {
  const room = getRoom(code);
  const s = room.slots[seat];
  const authed = s && !s.bot && s.token === tk;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`data: ${JSON.stringify(payloadFor(room, authed ? seat : null))}\n\n`);
  if (!authed) { res.end(); return; }
  s.clients.add(res);
  scheduleBot(room);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  res.on('close', () => { clearInterval(ping); s.clients.delete(res); broadcastLobbyOnly(room); });
  broadcastLobbyOnly(room);
}

function broadcastLobbyOnly(room) {
  if (room.state) return;
  for (const seat of SEATS[room.size]) {
    const s = room.slots[seat];
    if (!s || s.bot) continue;
    const data = `data: ${JSON.stringify(payloadFor(room, seat))}\n\n`;
    for (const res of s.clients) res.write(data);
  }
}

export function stats() {
  return { rooms: rooms.size };
}

setInterval(() => {
  const now = Date.now();
  for (const [c, r] of rooms) {
    const live = Object.values(r.slots).some((s) => s.clients?.size);
    if (now - r.updated > ROOM_TTL_MS || (!live && now - r.updated > 30 * 60 * 1000)) {
      if (r.botTimer) clearTimeout(r.botTimer);
      rooms.delete(c);
    }
  }
}, 60 * 1000).unref();
