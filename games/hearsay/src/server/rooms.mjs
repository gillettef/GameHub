// 방 관리와 /api 처리. 의존성 없이 node:http 위에서 SSE(서버→클라이언트)와 POST(행동)로 동작한다.
// scripts/aws/serve.mjs 가 dist/server/rooms.mjs 를 불러 /api/* 요청을 넘긴다.
import { randomBytes, randomInt } from 'node:crypto';
import { Game, RuleError } from '../engine/game.js';
import { BotBrain, PERSONA_IDS, BOT_NAMES } from '../engine/bot.js';
import { MIN_PLAYERS, MAX_PLAYERS } from '../engine/rules.js';

const MAX_ROOMS = 300;
const MAX_CLIENTS_PER_ROOM = 24;
const IDLE_MS = 2 * 60 * 60 * 1000;
const ENDED_MS = 30 * 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVXYZ23456789'; // W는 일부 한글 고정폭 글꼴에서 ₩로 보여 뺀다

export const rooms = new Map();

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const newToken = () => randomBytes(16).toString('hex');
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || '이야기꾼';

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

export class Room {
  constructor({ size, timing }) {
    this.code = newCode();
    this.size = size;
    this.timing = timing;
    this.seats = []; // { name, token, isBot, persona }
    this.hostToken = null;
    this.game = null;
    this.brains = new Map();
    this.clients = new Set(); // { res, seat }
    this.timer = null;
    this.botTimers = new Map();
    this.lastActive = Date.now();
    this.endedAt = null;
  }

  seatOf(token) { return this.seats.findIndex((s) => !s.isBot && s.token === token); }

  addHuman(name) {
    if (this.game) throw new HttpError(409, '이미 시작한 방입니다');
    if (this.seats.length >= this.size) throw new HttpError(409, '자리가 없습니다');
    const token = newToken();
    this.seats.push({ name: cleanName(name), token, isBot: false, persona: null });
    if (!this.hostToken) this.hostToken = token;
    this.touch();
    return { seat: this.seats.length - 1, token };
  }

  fillBots() {
    const usedNames = new Set(this.seats.map((s) => s.name));
    const names = BOT_NAMES.filter((n) => !usedNames.has(n));
    let k = randomInt(PERSONA_IDS.length);
    while (this.seats.length < this.size) {
      const persona = PERSONA_IDS[k++ % PERSONA_IDS.length];
      const name = names.splice(randomInt(names.length), 1)[0] ?? `봇 ${this.seats.length + 1}`;
      this.seats.push({ name, token: null, isBot: true, persona });
    }
  }

  start(now = Date.now()) {
    if (this.game) throw new HttpError(409, '이미 시작했습니다');
    this.fillBots();
    this.game = new Game({
      players: this.seats.map((s) => ({ name: s.name, isBot: s.isBot, persona: s.persona })),
      seed: randomInt(2 ** 31),
      timing: this.timing,
    });
    this.seats.forEach((s, i) => {
      if (s.isBot) this.brains.set(i, new BotBrain(this.game, i, s.persona, randomInt(2 ** 31)));
    });
    this.game.hooks.onForget = (season, column) => {
      for (const b of this.brains.values()) b.onForget(season, column);
    };
    this.game.start(now);
    this.update();
  }

  touch() { this.lastActive = Date.now(); }

  lobbyView(seat) {
    return {
      lobby: true,
      code: this.code,
      size: this.size,
      seats: this.seats.map((s) => ({ name: s.name, isBot: s.isBot })),
      you: seat,
      isHost: seat >= 0 && this.seats[seat]?.token === this.hostToken,
    };
  }

  viewFor(seat) {
    const now = Date.now();
    if (!this.game) return this.lobbyView(seat);
    return { lobby: false, code: this.code, isHost: this.seats[seat]?.token === this.hostToken, ...this.game.view(seat, now) };
  }

  send(client) {
    try { client.res.write(`data: ${JSON.stringify(this.viewFor(client.seat))}\n\n`); } catch { /* 끊긴 연결 */ }
  }

  update() {
    this.touch();
    for (const c of this.clients) this.send(c);
    if (!this.game) return;
    if (this.game.phase === 'ended' && !this.endedAt) this.endedAt = Date.now();
    this.scheduleTick();
    this.scheduleBots();
  }

  scheduleTick() {
    clearTimeout(this.timer);
    const g = this.game;
    if (g.deadline === null) return;
    this.timer = setTimeout(() => {
      if (g.tick(Date.now())) this.update(); else this.scheduleTick();
    }, Math.max(0, g.deadline - Date.now()) + 30);
  }

  scheduleBots() {
    const g = this.game;
    // 단계가 바뀌면 지난 단계의 봇 예약을 모두 지운다 (같은 단계 안에서는 같은 행동을 두 번 하지 않는다)
    const epoch = `${g.season}|${g.questionNo}|${g.phase}|${g.council?.left}`;
    if (epoch !== this.botEpoch) {
      for (const t of this.botTimers.values()) clearTimeout(t);
      this.botTimers.clear();
      this.botEpoch = epoch;
    }
    const scale = this.timing?.botScale ?? 1;
    const plan = (key, delayMs, fn) => {
      if (this.botTimers.has(key)) return;
      this.botTimers.set(key, setTimeout(() => {
        try {
          if (fn()) this.update();
        } catch (e) {
          if (!(e instanceof RuleError)) console.error('bot error', e);
        }
      }, delayMs * scale));
    };
    for (const [i, brain] of this.brains) {
      if (g.phase === 'claim' && g.claims[i] === null) {
        plan(`claim:${g.season}:${i}`, 900 + randomInt(2200), () => {
          if (g.phase !== 'claim' || g.claims[i] !== null) return false;
          g.claim(i, brain.chooseClaim(), Date.now());
          return true;
        });
      }
      if (g.phase === 'choose' && g.questioner === i) {
        const qkey = `${g.season}:${g.council?.kind}:${g.council?.left}`;
        plan(`ask:${qkey}`, 1800 + randomInt(2200), () => {
          if (g.phase !== 'choose' || g.questioner !== i) return false;
          const { plot, season } = brain.chooseQuestion();
          g.ask(i, plot, season, Date.now());
          return true;
        });
      }
      if (g.phase === 'whisper' && g.fists[i] === undefined) {
        const qn = g.questionNo;
        plan(`say:${qn}:${i}`, 1200 + randomInt(6000), () => {
          if (g.phase !== 'whisper' || g.questionNo !== qn) return false;
          const a = brain.assertion();
          if (!a) return false;
          g.say(i, a.text, Date.now(), a.answer ? { answer: a.answer } : null);
          return true;
        });
        plan(`fist:${qn}:${i}`, 9000 + randomInt(9000), () => {
          if (g.phase !== 'whisper' || g.questionNo !== qn || g.fists[i] !== undefined) return false;
          g.fist(i, brain.testimony(), Date.now());
          return true;
        });
      }
    }
  }

  act(seat, body) {
    const g = this.game;
    if (!g) throw new HttpError(409, '아직 시작하지 않았습니다');
    const now = Date.now();
    g.tick(now);
    switch (body.type) {
      case 'claim': g.claim(seat, String(body.plot), now); break;
      case 'ask': g.ask(seat, String(body.plot), Number(body.season), now); break;
      case 'fist': g.fist(seat, String(body.choice), now); break;
      case 'say': g.say(seat, body.text, now, body.assert ? { answer: String(body.assert) } : null); break;
      default: throw new HttpError(400, '알 수 없는 행동');
    }
    this.update();
  }

  close() {
    clearTimeout(this.timer);
    for (const t of this.botTimers.values()) clearTimeout(t);
    for (const c of this.clients) { try { c.res.end(); } catch { /* */ } }
  }
}

export function createRoom({ name, size, mode, timing }) {
  if (rooms.size >= MAX_ROOMS) sweep(true);
  if (rooms.size >= MAX_ROOMS) throw new HttpError(503, '방이 너무 많습니다. 잠시 뒤에 다시 시도하세요');
  const n = Number(size);
  if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS) throw new HttpError(400, '인원은 4~6명입니다');
  const room = new Room({ size: n, timing });
  rooms.set(room.code, room);
  const { token } = room.addHuman(name);
  if (mode === 'solo') room.start();
  return { code: room.code, token };
}

export function sweep(aggressive = false) {
  const now = Date.now();
  for (const [code, r] of rooms) {
    const idle = now - r.lastActive;
    const dead = idle > IDLE_MS || (r.endedAt && now - r.endedAt > ENDED_MS) || (aggressive && r.clients.size === 0 && idle > 10 * 60 * 1000);
    if (dead) { r.close(); rooms.delete(code); }
  }
}
const sweeper = setInterval(sweep, 5 * 60 * 1000);
sweeper.unref?.();

/** 종료 정리(GameHub 허브가 내려갈 때): 방 정리 타이머와 모든 방(틱·봇 타이머, SSE 연결)을 닫는다 */
export function shutdown() {
  clearInterval(sweeper);
  for (const r of rooms.values()) r.close();
  rooms.clear();
}

// ───────── HTTP ─────────
async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 8 * 1024) throw new HttpError(413, '요청이 너무 큽니다');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'JSON 형식 오류'); }
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(obj));
}

function getRoom(code) {
  const r = rooms.get(String(code).toUpperCase());
  if (!r) throw new HttpError(404, '방을 찾을 수 없습니다');
  return r;
}

/** /api/* 를 처리했으면 true */
export async function handleApi(req, res, url) {
  if (!url.pathname.startsWith('/api/')) return false;
  try {
    const parts = url.pathname.split('/').filter(Boolean); // ['api','rooms',code?,action?]
    if (parts[1] !== 'rooms') throw new HttpError(404, '없는 경로');
    if (parts.length === 2 && req.method === 'POST') {
      const body = await readJson(req);
      json(res, 200, createRoom({ name: body.name, size: body.size, mode: body.mode === 'solo' ? 'solo' : 'multi' }));
      return true;
    }
    const room = getRoom(parts[2]);
    const action = parts[3] ?? '';
    if (req.method === 'GET' && action === '') {
      json(res, 200, { code: room.code, size: room.size, started: !!room.game, seats: room.seats.map((s) => ({ name: s.name, isBot: s.isBot })) });
      return true;
    }
    if (req.method === 'GET' && action === 'stream') {
      const seat = room.seatOf(url.searchParams.get('token'));
      if (seat < 0) throw new HttpError(403, '이 방의 참가자가 아닙니다');
      if (room.clients.size >= MAX_CLIENTS_PER_ROOM) throw new HttpError(429, '연결이 너무 많습니다');
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 2000\n\n');
      const client = { res, seat };
      room.clients.add(client);
      room.send(client);
      const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { /* */ } }, 20_000);
      req.on('close', () => { clearInterval(hb); room.clients.delete(client); });
      return true;
    }
    if (req.method !== 'POST') throw new HttpError(405, '허용되지 않는 메서드');
    const body = await readJson(req);
    if (action === 'join') {
      const { token } = room.addHuman(body.name);
      room.update();
      json(res, 200, { code: room.code, token });
      return true;
    }
    const seat = room.seatOf(body.token);
    if (seat < 0) throw new HttpError(403, '이 방의 참가자가 아닙니다');
    if (action === 'start') {
      if (body.token !== room.hostToken) throw new HttpError(403, '방장만 시작할 수 있습니다');
      room.start();
      json(res, 200, { ok: true });
      return true;
    }
    if (action === 'act') {
      room.act(seat, body);
      json(res, 200, { ok: true });
      return true;
    }
    throw new HttpError(404, '없는 경로');
  } catch (e) {
    if (e instanceof HttpError) json(res, e.status, { error: e.message });
    else if (e instanceof RuleError) json(res, 409, { error: e.message });
    else { console.error(e); json(res, 500, { error: '서버 오류' }); }
    return true;
  }
}
