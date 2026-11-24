// 온라인 대전 방 서비스 (의존성 없음). 게임 상태는 서버 메모리에만 있고, 각 플레이어에게는 자기가 알아도 되는 정보만 보낸다.
// 서버를 재시작하면 진행 중인 방은 사라진다(정적 서버와 같은 프로세스).
import { randomUUID, randomInt } from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = 300;
const IDLE_MS = 6 * 60 * 60 * 1000;
const MAX_BODY = 16 * 1024;
const PHASE_KIND = { plan: 'moves', attack: 'attacks', blockade: 'blockades', occupy: 'occupations' };

export function createRoomService(engine, { now = () => Date.now() } = {}) {
  const rooms = new Map();
  const other = (p) => (p === 'A' ? 'B' : 'A');

  function newCode() {
    for (;;) {
      let c = '';
      for (let i = 0; i < 5; i++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
      if (!rooms.has(c)) return c;
    }
  }

  function sweep() {
    const t = now();
    for (const [code, r] of rooms) {
      const live = r.clients.A.size + r.clients.B.size;
      if (!live && t - r.updated > IDLE_MS) rooms.delete(code);
    }
  }

  function freshGame(room) {
    room.game = engine.newGame({ seed: randomInt(2 ** 31) });
    room.pending = {};
    room.rematch = {};
  }

  function create() {
    sweep();
    if (rooms.size >= MAX_ROOMS) throw httpError(503, '방이 너무 많습니다. 잠시 뒤 다시 시도하세요.');
    const room = {
      code: newCode(),
      tokens: { A: randomUUID(), B: null },
      clients: { A: new Set(), B: new Set() },
      created: now(),
      updated: now(),
    };
    freshGame(room);
    rooms.set(room.code, room);
    return { code: room.code, token: room.tokens.A, pid: 'A' };
  }

  function getRoom(code) {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) throw httpError(404, '방을 찾을 수 없습니다. 코드를 확인하거나 새 방을 만드세요.');
    return room;
  }

  function join(code) {
    const room = getRoom(code);
    if (room.tokens.B) throw httpError(409, '이미 두 명이 들어간 방입니다.');
    room.tokens.B = randomUUID();
    touch(room);
    return { code: room.code, token: room.tokens.B, pid: 'B' };
  }

  function auth(room, token) {
    for (const pid of ['A', 'B']) if (token && room.tokens[pid] === token) return pid;
    throw httpError(403, '이 방의 플레이어가 아닙니다.');
  }

  function touch(room) {
    room.updated = now();
    broadcast(room);
  }

  function view(room, pid) {
    const v = engine.playerView(room.game, pid);
    const opp = other(pid);
    v.online = {
      code: room.code,
      oppJoined: Boolean(room.tokens[opp]),
      oppConnected: room.clients[opp].size > 0,
      waiting: { me: pid in room.pending, opp: opp in room.pending },
      rematch: { me: Boolean(room.rematch[pid]), opp: Boolean(room.rematch[opp]) },
    };
    return v;
  }

  function broadcast(room) {
    for (const pid of ['A', 'B']) {
      if (!room.clients[pid].size) continue;
      const data = `event: view\ndata: ${JSON.stringify(view(room, pid))}\n\n`;
      for (const res of room.clients[pid]) res.write(data);
    }
  }

  // 제출을 검증하고 보관한다. 두 명이 모두 내면 엔진으로 처리한다.
  function act(room, pid, kind, payload) {
    const g = room.game;
    if (kind === 'rematch') {
      if (g.phase !== 'over') throw httpError(400, '게임이 끝난 뒤에만 다시 할 수 있습니다.');
      room.rematch[pid] = true;
      if (room.rematch.A && room.rematch.B) freshGame(room);
      touch(room);
      return;
    }
    if (PHASE_KIND[g.phase] !== kind) throw httpError(409, '지금 단계에서 할 수 없는 행동입니다. 화면을 새로 고치세요.');
    if (!room.tokens.B) throw httpError(409, '상대가 아직 들어오지 않았습니다.');
    if (pid in room.pending) throw httpError(409, '이미 제출했습니다. 상대를 기다리는 중입니다.');
    room.pending[pid] = validate(g, pid, kind, payload);
    if (g.phase === 'blockade') {
      for (const p of ['A', 'B']) {
        if (!(p in room.pending) && !engine.blockadeOptions(g).some((o) => o.blocker === p)) room.pending[p] = [];
      }
    }
    if ('A' in room.pending && 'B' in room.pending) {
      const both = room.pending;
      room.pending = {};
      if (kind === 'moves') engine.submitMoves(g, both);
      else if (kind === 'attacks') engine.submitAttacks(g, both);
      else if (kind === 'blockades') engine.submitBlockades(g, both);
      else engine.submitOccupations(g, both);
      // 봉쇄 단계에서 한쪽만 선택지가 있으면 다른 쪽은 자동으로 낸 것으로 본다
      if (g.phase === 'blockade') {
        for (const p of ['A', 'B']) {
          if (!engine.blockadeOptions(g).some((o) => o.blocker === p)) room.pending[p] = [];
        }
      }
    }
    touch(room);
  }

  function validate(g, pid, kind, payload) {
    if (kind === 'moves') {
      if (!Array.isArray(payload) || payload.length !== 3) throw httpError(400, '함대 3개의 이동이 필요합니다.');
      payload.forEach((m, i) => {
        if (!engine.legalMoves(g, pid, i + 1).includes(m)) throw httpError(400, `함대 ${i + 1}: 갈 수 없는 성계입니다.`);
      });
      return payload.map(String);
    }
    if (kind === 'attacks') {
      if (!Array.isArray(payload) || payload.some((x) => ![1, 2, 3].includes(x))) throw httpError(400, '잘못된 공격 목록입니다.');
      return [...new Set(payload)];
    }
    if (kind === 'blockades') {
      const mine = engine.blockadeOptions(g).filter((o) => o.blocker === pid).map((o) => o.idx);
      if (!Array.isArray(payload) || payload.some((x) => !mine.includes(x))) throw httpError(400, '봉쇄할 수 없는 카드입니다.');
      return [...new Set(payload)];
    }
    if (kind === 'occupations') {
      if (!Array.isArray(payload)) throw httpError(400, '잘못된 점령 목록입니다.');
      const orders = payload.map((o) => ({ fid: Number(o?.fid), kind: String(o?.kind), ...(o?.kind === 'decoy' ? { slot: Number(o.slot) } : {}) }));
      const err = engine.validateOccupations(g, pid, orders);
      if (err) throw httpError(400, err);
      return orders;
    }
    throw httpError(400, '알 수 없는 행동입니다.');
  }

  // ---------------------------------------------------------------- HTTP
  async function handle(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean); // api, rooms, CODE, verb
    try {
      if (parts[1] !== 'rooms') throw httpError(404, '없는 주소입니다.');
      if (req.method === 'POST' && parts.length === 2) return send(res, 201, create());
      const room = getRoom(parts[2]);
      const verb = parts[3];
      if (req.method === 'POST' && verb === 'join') return send(res, 200, join(room.code));
      if (req.method === 'GET' && verb === 'events') {
        const pid = auth(room, url.searchParams.get('token'));
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.write('retry: 2000\n\n');
        room.clients[pid].add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 20000);
        req.on('close', () => { clearInterval(ping); room.clients[pid].delete(res); touch(room); });
        touch(room);
        return undefined;
      }
      if (req.method === 'GET' && verb === 'state') {
        const pid = auth(room, url.searchParams.get('token'));
        return send(res, 200, view(room, pid));
      }
      if (req.method === 'POST' && verb === 'action') {
        const body = await readJson(req);
        const pid = auth(room, body.token);
        act(room, pid, String(body.kind), body.payload);
        return send(res, 200, view(room, pid));
      }
      throw httpError(404, '없는 주소입니다.');
    } catch (e) {
      const status = e.status ?? 500;
      if (status === 500) console.error(e);
      return send(res, status, { error: status === 500 ? '서버 오류가 났습니다.' : e.message });
    }
  }

  return { handle, create, join, act, view, rooms, getRoom, auth };
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(httpError(413, '요청이 너무 큽니다.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(httpError(400, 'JSON 형식이 아닙니다.')); }
    });
    req.on('error', reject);
  });
}
