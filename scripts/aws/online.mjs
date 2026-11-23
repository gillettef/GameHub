// 온라인 대전 방 관리 (의존성 없음). 서버가 게임 상태의 단일 기준이다.
// - 규칙 엔진(rules.js)을 서버에서 돌리고 시간도 서버 시계로 흐르게 한다(클라이언트 조작으로 모래를 아낄 수 없음).
// - 방 코드 5자리 + 좌석별 비밀 토큰. 상태는 메모리에만 있다(서버 재시작 시 사라짐).
import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O, 1/I/L 제외
const COUNTDOWN_MS = 3000;
const SYNC_MS = 2000;            // 변화가 없어도 이 간격으로 상태를 다시 보낸다
const IDLE_MS = 2 * 60 * 60_000; // 2시간 동안 아무도 없으면 방을 지운다
const LOG_TAIL = 40;

const pickOne = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);

/** 규칙 엔진을 읽는다. 배포본(dist)에는 빌드 산출물, 개발·테스트에서는 원본을 쓴다. */
export async function loadRules() {
  try { return await import('../../dist/src/rules.js'); } catch { return import('../../prototype/src/rules.js'); }
}

export function sanitizeConfig(body = {}) {
  return {
    greatMin: pickOne(Number(body.greatMin), [5, 10, 20], 20),
    target: pickOne(Number(body.target), [10, 15, 25], 25),
    handleMs: pickOne(Number(body.handleMs), [0, 1000], 1000),
    side: pickOne(String(body.side), ['random', '0', '1'], 'random'),
  };
}

/** 행동 객체 형식 검사. 내용(합법성)은 규칙 엔진이 다시 검사한다. */
export function sanitizeAction(a) {
  if (!a || typeof a !== 'object') return null;
  const int = (v) => (Number.isInteger(v) && v >= 0 && v < 5 ? v : null);
  const id = (v) => (typeof v === 'string' && v.length < 40 ? v : null);
  switch (a.type) {
    case 'end': return { type: 'end' };
    case 'resign': return { type: 'resign' };
    case 'summon': return id(a.unitId) && int(a.c) !== null && int(a.r) !== null ? { type: 'summon', unitId: a.unitId, c: a.c, r: a.r } : null;
    case 'move': return id(a.unitId) && int(a.c) !== null && int(a.r) !== null ? { type: 'move', unitId: a.unitId, c: a.c, r: a.r, flip: a.flip === true } : null;
    case 'attack': return id(a.unitId) && id(a.targetId) && ['flip', 'push'].includes(a.mode) ? { type: 'attack', unitId: a.unitId, targetId: a.targetId, mode: a.mode } : null;
    default: return null;
  }
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createRooms({ rules, now = () => Date.now(), maxRooms = 300 } = {}) {
  const rooms = new Map();

  const newCode = () => {
    let c;
    do c = Array.from(randomBytes(5), (b) => ALPHABET[b % ALPHABET.length]).join(''); while (rooms.has(c));
    return c;
  };
  const newToken = () => randomBytes(16).toString('hex');
  const get = (code) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) throw new HttpError(404, '방을 찾을 수 없다. 코드를 확인하라.');
    return room;
  };
  const seatOf = (room, token) => {
    const seat = room.tokens.indexOf(token);
    if (!token || seat < 0) throw new HttpError(403, '이 방의 참가자가 아니다.');
    return seat;
  };

  function startGame(room) {
    const c = room.cfg;
    room.state = rules.newGame({ greatMs: c.greatMin * 60_000, target: c.target, handleMs: c.handleMs });
    room.startAt = now() + COUNTDOWN_MS;
    room.lastTick = room.startAt;
    room.rematch = [false, false];
  }

  /** 서버 시계로 시간을 흘린다. */
  function advance(room) {
    const s = room.state;
    if (!s || s.over) return;
    const t = now();
    if (t < room.startAt) return;
    const dt = t - room.lastTick;
    room.lastTick = t;
    if (dt > 0) rules.tick(s, dt);
  }

  function phase(room) {
    if (!room.state) return 'waiting';
    if (room.state.over) return 'over';
    return now() < room.startAt ? 'countdown' : 'playing';
  }

  function snapshot(room, seat) {
    const s = room.state;
    return {
      code: room.code, seat, phase: phase(room), serverNow: now(), startAt: room.startAt,
      online: [0, 1].map((p) => [...room.clients].some((cl) => cl.seat === p)),
      joined: room.tokens.map(Boolean),
      rematch: room.rematch,
      cfg: room.cfg,
      state: s ? { ...s, log: s.log.slice(-LOG_TAIL) } : null,
    };
  }

  const signature = (room) => {
    const s = room.state;
    const online = [...room.clients].map((c) => c.seat).sort().join('');
    return s ? `${phase(room)}|${s.seq}|${s.turn}|${s.active}|${s.over}|${room.rematch}|${online}` : `w|${room.tokens.map(Boolean)}|${online}`;
  };

  function broadcast(room) {
    for (const cl of room.clients) cl.seat = room.tokens.indexOf(cl.token); // 재대국으로 좌석이 바뀌었을 수 있다
    room.sig = signature(room);
    room.sentAt = now();
    for (const cl of room.clients) cl.send(snapshot(room, cl.seat));
  }

  return {
    rooms,
    create(body) {
      if (rooms.size >= maxRooms) throw new HttpError(503, '지금은 방이 너무 많다. 잠시 뒤에 다시 시도하라.');
      const cfg = sanitizeConfig(body);
      const seat = cfg.side === 'random' ? (randomBytes(1)[0] & 1) : Number(cfg.side);
      const code = newCode();
      const token = newToken();
      const room = { code, cfg, tokens: [null, null], clients: new Set(), state: null, startAt: null, lastTick: null, rematch: [false, false], touched: now(), sig: '', sentAt: 0 };
      room.tokens[seat] = token;
      rooms.set(code, room);
      return { code, token, seat };
    },
    info(code) {
      const room = get(code);
      return { code: room.code, phase: phase(room), full: room.tokens.every(Boolean), cfg: room.cfg };
    },
    join(code) {
      const room = get(code);
      const seat = room.tokens.indexOf(null);
      if (seat < 0) throw new HttpError(409, '방이 가득 찼다.');
      const token = newToken();
      room.tokens[seat] = token;
      room.touched = now();
      startGame(room);
      broadcast(room);
      return { code: room.code, token, seat };
    },
    act(code, token, rawAction) {
      const room = get(code);
      const seat = seatOf(room, token);
      room.touched = now();
      const action = sanitizeAction(rawAction);
      if (!action) throw new HttpError(400, '잘못된 행동이다.');
      const s = room.state;
      if (!s) throw new HttpError(409, '아직 상대가 들어오지 않았다.');
      advance(room);
      if (action.type === 'resign') {
        const res = rules.resign(s, seat);
        broadcast(room);
        return res;
      }
      if (phase(room) === 'countdown') throw new HttpError(409, '아직 시작 전이다.');
      if (s.over) throw new HttpError(409, '이미 끝난 게임이다.');
      if (s.active !== seat) throw new HttpError(409, '지금은 상대 차례다.');
      const res = rules.apply(s, action) || { ok: true };
      broadcast(room);
      return res;
    },
    rematch(code, token) {
      const room = get(code);
      const seat = seatOf(room, token);
      if (!room.state || !room.state.over) throw new HttpError(409, '게임이 끝난 뒤에만 다시 할 수 있다.');
      room.rematch[seat] = true;
      if (room.rematch.every(Boolean)) {
        room.tokens.reverse(); // 선후를 바꿔 다시 한다
        startGame(room);
      }
      broadcast(room);
      return { ok: true };
    },
    /** SSE 구독. send(snapshot)를 받는다. 해제 함수를 돌려준다. */
    subscribe(code, token, send) {
      const room = get(code);
      const seat = seatOf(room, token);
      const client = { seat, send, token };
      room.clients.add(client);
      room.touched = now();
      advance(room);
      broadcast(room);
      return () => {
        room.clients.delete(client);
        room.touched = now();
        if (rooms.has(room.code)) broadcast(room);
      };
    },
    /** 주기 실행: 시간 흐름, 변경 알림, 오래된 방 정리. */
    step() {
      const t = now();
      for (const room of rooms.values()) {
        if (!room.clients.size && t - room.touched > IDLE_MS) { rooms.delete(room.code); continue; }
        advance(room);
        if (signature(room) !== room.sig || t - room.sentAt > SYNC_MS) broadcast(room);
      }
    },
  };
}
