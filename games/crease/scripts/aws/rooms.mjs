// CREASE 온라인 대전방 (의존성 없음, 메모리 저장).
// 서버가 규칙 엔진으로 모든 행동을 검증하고, 상태는 SSE로 방 참가자에게 보낸다.
// 재시작하면 진행 중인 방은 사라진다(t4g.nano 단일 프로세스 전제).
import { randomUUID, randomInt } from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_ROOMS = 300;
const ROOM_IDLE_MS = 3 * 60 * 60 * 1000; // 3시간 동안 아무 일 없으면 정리
const AWAY_TAKEOVER_MS = 45 * 1000; // 연결이 끊긴 플레이어의 차례는 45초 뒤 봇이 대신한다
const BOT_STEP_MS = 650;
const NAME_MAX = 12;

export function createRooms({ engine, chooseTurn, RULES, now = () => Date.now(), timers = { setTimeout, clearTimeout } }) {
  const {
    newGame, startTurn, doStep, doFold, finishTurn, legalSteps, legalFolds, toView, cellName, unkey, isCoveredCol,
  } = engine;
  const rooms = new Map();

  const cleanName = (s, fallback) => {
    const t = String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, NAME_MAX);
    return t || fallback;
  };

  function newCode() {
    for (let k = 0; k < 50; k++) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
      if (!rooms.has(c)) return c;
    }
    throw httpError(503, '방을 더 만들 수 없습니다');
  }

  function httpError(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
  }

  function getRoom(code) {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) throw httpError(404, '방을 찾을 수 없습니다');
    return room;
  }

  function seatOf(room, token) {
    const i = room.seats.findIndex((s) => s.token && s.token === token);
    if (i < 0) throw httpError(403, '이 방의 참가자가 아닙니다');
    return i;
  }

  function create({ n, name, bots } = {}) {
    sweep();
    if (rooms.size >= MAX_ROOMS) throw httpError(503, '서버가 붐빕니다. 잠시 뒤 다시 시도해 주세요');
    n = Number(n);
    if (![2, 3, 4].includes(n)) throw httpError(400, '인원은 2~4명입니다');
    const botSeats = Array.isArray(bots) ? bots.map(Boolean) : [];
    const code = newCode();
    const token = randomUUID();
    const seats = Array.from({ length: n }, (_, i) => ({
      kind: i === 0 ? 'human' : (botSeats[i] ? 'bot' : 'open'),
      name: i === 0 ? cleanName(name, '방장') : (botSeats[i] ? `봇 ${i + 1}` : ''),
      token: i === 0 ? token : null,
      connections: 0,
      lastSeen: now(),
    }));
    const room = {
      code, n, seats, status: 'lobby', state: null, clients: new Set(), log: [], version: 0,
      touched: now(), timer: null, seed: randomInt(1, 2 ** 31),
    };
    rooms.set(code, room);
    log(room, `${seats[0].name}님이 방을 만들었습니다`);
    return { code, token, seat: 0 };
  }

  function join(code, { name } = {}) {
    const room = getRoom(code);
    if (room.status !== 'lobby') throw httpError(409, '이미 시작한 게임입니다');
    const i = room.seats.findIndex((s) => s.kind === 'open');
    if (i < 0) throw httpError(409, '빈자리가 없습니다');
    const token = randomUUID();
    Object.assign(room.seats[i], { kind: 'human', name: cleanName(name, `플레이어 ${i + 1}`), token, lastSeen: now() });
    log(room, `${room.seats[i].name}님이 들어왔습니다`);
    broadcast(room);
    return { code: room.code, token, seat: i };
  }

  function setSeat(code, token, { seat, kind }) {
    const room = getRoom(code);
    if (seatOf(room, token) !== 0) throw httpError(403, '방장만 자리를 바꿀 수 있습니다');
    if (room.status !== 'lobby') throw httpError(409, '이미 시작한 게임입니다');
    const s = room.seats[Number(seat)];
    if (!s || Number(seat) === 0) throw httpError(400, '바꿀 수 없는 자리입니다');
    if (s.kind === 'human') throw httpError(409, '사람이 앉은 자리입니다');
    if (kind === 'bot') Object.assign(s, { kind: 'bot', name: `봇 ${Number(seat) + 1}` });
    else Object.assign(s, { kind: 'open', name: '' });
    broadcast(room);
  }

  function start(code, token) {
    const room = getRoom(code);
    if (seatOf(room, token) !== 0) throw httpError(403, '방장만 시작할 수 있습니다');
    if (room.status !== 'lobby') throw httpError(409, '이미 시작했습니다');
    room.seats.forEach((s, i) => { if (s.kind === 'open') Object.assign(s, { kind: 'bot', name: `봇 ${i + 1}` }); });
    room.state = newGame(room.n, room.seed, RULES);
    room.status = 'playing';
    startTurn(room.state);
    log(room, '게임 시작');
    afterChange(room);
  }

  function describe(a) {
    if (a.type === 'step') return `→ ${cellName(...a.to)}`;
    const side = a.side === 'L' ? '왼쪽' : '오른쪽';
    return a.type === 'fold' ? `${side} ${a.width}선 접기` : `${side} 펼치기`;
  }

  function applyAction(room, a, byBot = false) {
    const s = room.state;
    const p = s.players[s.current];
    const who = room.seats[s.current].name + (byBot && room.seats[s.current].kind === 'human' ? '(대리)' : '');
    const before = { score: p.score, carried: p.carried };
    if (a.type === 'step') {
      const to = [Number(a.to?.[0]), Number(a.to?.[1])];
      if (!legalSteps(s).some(([c, r]) => c === to[0] && r === to[1])) throw httpError(400, '갈 수 없는 칸입니다');
      doStep(s, to);
      a = { type: 'step', to };
    } else if (a.type === 'fold' || a.type === 'unfold') {
      const ok = legalFolds(s).find((b) => b.type === a.type && b.side === a.side && (a.type === 'unfold' || b.width === Number(a.width)));
      if (!ok) throw httpError(400, '지금 할 수 없는 접기입니다');
      doFold(s, ok);
      a = ok;
    } else if (a.type === 'end') {
      endTurn(room, who);
      return;
    } else {
      throw httpError(400, '알 수 없는 행동입니다');
    }
    let msg = `${who}: ${describe(a)}`;
    if (p.score > before.score) msg += ` · ${p.score - before.score}점 득점`;
    else if (p.carried > before.carried) msg += ' · 조각 줍기';
    log(room, msg, { kind: 'act', seat: p.id, action: a });
  }

  function endTurn(room, who) {
    const s = room.state;
    const spawned = finishTurn(s);
    log(room, `${who}: 차례 끝`);
    if (spawned != null) {
      const [c, r] = unkey(spawned);
      log(room, `별똥별 → ${cellName(c, r)}${s.lastBurst ? ` · 날개 터뜨리기(${s.lastBurst === 'L' ? '왼쪽' : '오른쪽'})` : ''}`, { kind: 'spawn' });
    }
    if (s.over) {
      room.status = 'over';
      log(room, `게임 끝 · ${s.players.map((q) => `${room.seats[q.id].name} ${q.score}`).join(' / ')}`, { kind: 'over' });
      return;
    }
    if (s.activeIds) log(room, `동점 결승 라운드: ${s.activeIds.map((i) => room.seats[i].name).join(' · ')}`);
    startTurn(s);
  }

  function act(code, token, action) {
    const room = getRoom(code);
    const seat = seatOf(room, token);
    if (room.status !== 'playing') throw httpError(409, '진행 중인 게임이 아닙니다');
    if (room.state.current !== seat) throw httpError(409, '내 차례가 아닙니다');
    room.seats[seat].lastSeen = now();
    applyAction(room, action || {});
    afterChange(room);
  }

  // 봇 차례(또는 오래 자리를 비운 사람의 차례)를 진행한다
  function afterChange(room) {
    room.version++;
    room.touched = now();
    broadcast(room);
    if (room.timer) { timers.clearTimeout(room.timer); room.timer = null; }
    if (room.status !== 'playing') return;
    const seat = room.seats[room.state.current];
    const away = seat.kind === 'human' && seat.connections === 0;
    if (seat.kind === 'bot') room.timer = timers.setTimeout(() => runBot(room), BOT_STEP_MS);
    else if (away) room.timer = timers.setTimeout(() => runBot(room), AWAY_TAKEOVER_MS);
  }

  function runBot(room) {
    room.timer = null;
    if (room.status !== 'playing' || !rooms.has(room.code)) return;
    const s = room.state;
    const seat = room.seats[s.current];
    if (seat.kind === 'human' && seat.connections > 0) return; // 돌아왔으면 맡긴다
    // 차례를 한 번에 정해 두고 행동을 하나씩 보낸다
    if (!room.botPlan || room.botPlan.turn !== s.turn) room.botPlan = { turn: s.turn, actions: chooseTurn(s, 'balanced') };
    const a = room.botPlan.actions.shift();
    try {
      applyAction(room, a || { type: 'end' }, true);
    } catch {
      applyAction(room, { type: 'end' }, true);
    }
    afterChange(room);
  }

  function log(room, text, extra = {}) {
    room.log.push({ t: now(), text, ...extra });
    if (room.log.length > 60) room.log.splice(0, room.log.length - 60);
  }

  function snapshot(room, forSeat = null) {
    return {
      code: room.code,
      n: room.n,
      status: room.status,
      version: room.version,
      you: forSeat,
      seats: room.seats.map((s) => ({ kind: s.kind, name: s.name, online: s.kind === 'bot' || s.connections > 0 })),
      view: room.state ? toView(room.state) : null,
      log: room.log.slice(-25),
    };
  }

  function send(res, data) {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch { /* 끊긴 연결은 close 에서 정리 */ }
  }

  function broadcast(room) {
    for (const c of room.clients) send(c.res, snapshot(room, c.seat));
  }

  function subscribe(code, token, res) {
    const room = getRoom(code);
    const seat = token ? seatOf(room, token) : null; // 토큰 없이 들어오면 관전
    const client = { res, seat };
    room.clients.add(client);
    if (seat != null) { room.seats[seat].connections++; room.seats[seat].lastSeen = now(); }
    send(res, snapshot(room, seat));
    if (seat != null) broadcast(room);
    if (seat != null && room.status === 'playing' && room.state.current === seat) afterChange(room);
    return () => {
      room.clients.delete(client);
      if (seat != null) {
        room.seats[seat].connections = Math.max(0, room.seats[seat].connections - 1);
        room.seats[seat].lastSeen = now();
        if (rooms.has(room.code)) afterChange(room);
      }
    };
  }

  function sweep() {
    const t = now();
    for (const [code, room] of rooms) {
      if (t - room.touched > ROOM_IDLE_MS && room.clients.size === 0) {
        if (room.timer) timers.clearTimeout(room.timer);
        rooms.delete(code);
      }
    }
  }

  void isCoveredCol;
  return { create, join, setSeat, start, act, subscribe, snapshot: (code, token) => {
    const room = getRoom(code);
    return snapshot(room, token ? seatOf(room, token) : null);
  }, sweep, rooms, _runBot: runBot };
}
