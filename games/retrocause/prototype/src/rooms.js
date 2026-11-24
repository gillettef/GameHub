// 온라인 방 관리. 네트워크 코드는 없고(서버 serve.mjs 가 HTTP·SSE 로 감싼다), 판정은 engine.js 가 한다.
// 상태는 메모리에만 있다. 서버를 재시작하면 진행 중인 방은 사라진다(프로토타입).
import { newGame, applyAction, finalScore, validGuess, FIGURES, shuffle, makeRng } from './engine.js';
import { chooseAction, guessMotives, BOT_STYLES } from './bots.js';
import { makeView } from './view.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['아그네스', '베르톨트', '세실리아', '도미닉', '엘로이즈', '페르디난트'];
const BOT_KEYS = ['greedy', 'rival', 'bluffer'];

export class RoomError extends Error {}
const fail = (msg) => { throw new RoomError(msg); };

function cleanName(name) {
  const s = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10);
  return s || '손님';
}

export class RoomHub {
  constructor({
    botDelay = 900, takeoverMs = 45_000, idleMs = 6 * 3600_000, maxRooms = 300,
    schedule = (fn, ms) => setTimeout(fn, ms), now = () => Date.now(),
    token = () => globalThis.crypto.randomUUID(), random = Math.random,
  } = {}) {
    Object.assign(this, { botDelay, takeoverMs, idleMs, maxRooms, schedule, now, token, random });
    this.rooms = new Map();
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(room) {
    room.version += 1;
    room.updatedAt = this.now();
    for (const fn of this.listeners) fn(room.code);
  }
  get(code) {
    const room = this.rooms.get(String(code ?? '').toUpperCase());
    if (!room) fail('방을 찾을 수 없습니다');
    return room;
  }
  member(room, token) {
    const m = room.members.find((x) => x.token === token);
    if (!m) fail('이 방의 참가자가 아닙니다');
    return m;
  }
  seatOf(room, token) { return room.seats ? room.seats.findIndex((s) => s.token === token) : -1; }

  newCode() {
    for (let i = 0; i < 50; i++) {
      let c = '';
      for (let k = 0; k < 4; k++) c += CODE_CHARS[Math.floor(this.random() * CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
    fail('방 코드를 만들 수 없습니다');
  }

  createRoom(name) {
    this.sweep();
    if (this.rooms.size >= this.maxRooms) fail('지금은 방을 더 만들 수 없습니다');
    const token = this.token();
    const code = this.newCode();
    const room = {
      code, phase: 'lobby', hostToken: token, members: [{ token, name: cleanName(name) }],
      targetPlayers: 4, seats: null, g: null, guesses: [], result: null,
      turnStartedAt: 0, version: 0, updatedAt: this.now(), timer: null,
    };
    this.rooms.set(code, room);
    this.emit(room);
    return { code, token };
  }

  join(code, name, token) {
    const room = this.get(code);
    const known = token && room.members.find((m) => m.token === token);
    if (known) {
      // 재접속: 봇에게 넘어간 자리가 있으면 되찾는다
      const seat = this.seatOf(room, token);
      if (seat >= 0 && room.seats[seat].bot) {
        room.seats[seat].bot = null;
        room.g.names[seat] = known.name;
      }
      this.emit(room);
      return { code: room.code, token };
    }
    if (room.phase !== 'lobby') fail('이미 시작한 방입니다');
    if (room.members.length >= 5) fail('방이 가득 찼습니다 (최대 5명)');
    const t = this.token();
    room.members.push({ token: t, name: cleanName(name) });
    if (room.targetPlayers < room.members.length) room.targetPlayers = room.members.length;
    this.emit(room);
    return { code: room.code, token: t };
  }

  leave(code, token) {
    const room = this.get(code);
    if (room.phase !== 'lobby') return;
    room.members = room.members.filter((m) => m.token !== token);
    if (!room.members.length) { this.rooms.delete(room.code); return; }
    if (room.hostToken === token) room.hostToken = room.members[0].token;
    this.emit(room);
  }

  configure(code, token, { players }) {
    const room = this.get(code);
    if (room.hostToken !== token) fail('방장만 바꿀 수 있습니다');
    if (room.phase !== 'lobby') fail('이미 시작했습니다');
    const n = Number(players);
    if (!(n >= 3 && n <= 5)) fail('인원은 3~5명입니다');
    if (n < room.members.length) fail('참가자보다 적게 정할 수 없습니다');
    room.targetPlayers = n;
    this.emit(room);
  }

  start(code, token) {
    const room = this.get(code);
    if (room.hostToken !== token) fail('방장만 시작할 수 있습니다');
    if (room.phase !== 'lobby' && room.phase !== 'result') fail('이미 진행 중입니다');
    const seed = Math.floor(this.random() * 1e9);
    const rng = makeRng(seed);
    const n = Math.max(room.targetPlayers, room.members.length);
    const botNames = shuffle(BOT_NAMES, rng);
    const seats = room.members.map((m) => ({ token: m.token, name: m.name, bot: null }));
    for (let i = 0; seats.length < n; i++) {
      const key = BOT_KEYS[Math.floor(rng() * BOT_KEYS.length)];
      seats.push({ token: null, name: `${botNames[i]} (봇)`, bot: { ...BOT_STYLES[key], activity: 0.8 } });
    }
    room.seats = shuffle(seats, rng); // 0번 자리가 시작 플레이어
    room.g = newGame({ names: room.seats.map((s) => s.name), seed });
    room.guesses = room.seats.map(() => null);
    room.result = null;
    room.phase = 'play';
    room.turnStartedAt = this.now();
    this.emit(room);
    this.runBots(room);
  }

  act(code, token, action) {
    const room = this.get(code);
    if (room.phase !== 'play') fail('지금은 행동할 수 없습니다');
    const seat = this.seatOf(room, token);
    if (seat < 0) fail('이 게임의 플레이어가 아닙니다');
    if (room.g.current !== seat) fail('당신의 차례가 아닙니다');
    if (room.seats[seat].bot) fail('이 자리는 지금 봇이 맡고 있습니다');
    this.apply(room, sanitizeAction(action));
  }

  apply(room, action) {
    try {
      room.g = applyAction(room.g, action);
    } catch (e) {
      fail(e.message);
    }
    room.turnStartedAt = this.now();
    if (room.g.over) this.toGuess(room);
    this.emit(room);
    this.runBots(room);
  }

  runBots(room) {
    if (room.timer || room.phase !== 'play') return;
    const seat = room.g.current;
    if (!room.seats[seat].bot) return;
    room.timer = this.schedule(() => {
      room.timer = null;
      if (room.phase !== 'play' || room.g.current !== seat || !room.seats[seat].bot) return;
      const rng = makeRng((room.g.seed + room.g.history.length * 977) >>> 0);
      this.apply(room, chooseAction(room.g, room.seats[seat].bot, rng));
    }, this.botDelay);
  }

  /** 오래 자리를 비운 플레이어의 차례를 봇에게 넘긴다 */
  takeover(code, token) {
    const room = this.get(code);
    this.member(room, token);
    if (room.phase !== 'play') fail('지금은 할 수 없습니다');
    const seat = room.g.current;
    if (room.seats[seat].bot) return;
    if (room.seats[seat].token === token) fail('자기 차례는 직접 진행하세요');
    if (this.now() - room.turnStartedAt < this.takeoverMs) fail(`${Math.ceil(this.takeoverMs / 1000)}초가 지나야 넘길 수 있습니다`);
    room.seats[seat].bot = { ...BOT_STYLES.rival, activity: 0.8 };
    room.g.names[seat] = `${room.seats[seat].name} (봇 대리)`;
    this.emit(room);
    this.runBots(room);
  }

  toGuess(room) {
    room.phase = 'guess';
    room.seats.forEach((s, p) => { if (s.bot) room.guesses[p] = guessMotives(room.g, p); });
    this.maybeResult(room);
  }

  guess(code, token, guess) {
    const room = this.get(code);
    if (room.phase !== 'guess') fail('지금은 추리할 수 없습니다');
    const seat = this.seatOf(room, token);
    if (seat < 0) fail('이 게임의 플레이어가 아닙니다');
    const clean = {};
    for (let q = 0; q < room.seats.length; q++) {
      if (q === seat) continue;
      const f = guess?.[q];
      if (!FIGURES.includes(f)) fail('모든 플레이어의 인물을 골라 주세요');
      clean[q] = f;
    }
    if (!validGuess(room.g, seat, clean)) fail('같은 인물을 두 번 적을 수 없습니다');
    room.guesses[seat] = clean;
    this.maybeResult(room);
    this.emit(room);
  }

  maybeResult(room) {
    // 봇 대리로 넘어간 자리도 사람이 돌아오지 않으면 봇이 추리한다
    room.seats.forEach((s, p) => { if (!room.guesses[p] && s.bot) room.guesses[p] = guessMotives(room.g, p); });
    if (room.guesses.every(Boolean)) {
      room.result = finalScore(room.g, room.guesses);
      room.phase = 'result';
    }
  }

  rematch(code, token) {
    const room = this.get(code);
    if (room.hostToken !== token) fail('방장만 다시 시작할 수 있습니다');
    if (room.phase !== 'result') fail('게임이 끝난 뒤에만 다시 할 수 있습니다');
    room.phase = 'lobby';
    room.g = null;
    room.seats = null;
    room.result = null;
    this.emit(room);
  }

  /** 참가자 한 명에게 보낼 화면 데이터 */
  view(code, token) {
    const room = this.get(code);
    this.member(room, token);
    const seat = this.seatOf(room, token);
    const base = {
      mode: 'online', code: room.code, phase: room.phase, version: room.version,
      isHost: room.hostToken === token, targetPlayers: room.targetPlayers,
      members: room.members.map((m) => ({ name: m.name, host: m.token === room.hostToken, me: m.token === token })),
    };
    if (!room.g) return base;
    return {
      ...base,
      ...makeView(room.g, seat),
      seatBots: room.seats.map((s) => !!s.bot),
      styleLabels: room.seats.map((s) => (s.bot && !s.token ? s.bot.label : null)),
      guessed: room.guesses.map(Boolean),
      turnAgeMs: this.now() - room.turnStartedAt,
      takeoverMs: this.takeoverMs,
      result: room.phase === 'result'
        ? { ...room.result, motives: room.g.motives, guesses: room.guesses }
        : null,
    };
  }

  sweep() {
    const t = this.now();
    for (const [code, room] of this.rooms) if (t - room.updatedAt > this.idleMs) this.rooms.delete(code);
  }
}

function sanitizeAction(a) {
  if (!a || typeof a !== 'object') fail('잘못된 행동입니다');
  if (a.type === 'place') return { type: 'place', cardId: String(a.cardId), slot: Number(a.slot) };
  if (a.type === 'exchange') return { type: 'exchange', cardId: String(a.cardId) };
  if (a.type === 'pass') return { type: 'pass' };
  fail('잘못된 행동입니다');
}
