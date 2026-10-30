// 온라인 방 관리: 방·자리·재접속 토큰, 엔진 정산(서버 권위), 사람별 가림, AI 인계. 모든 상태는 메모리
import { randomBytes, randomInt } from 'node:crypto';
import type { WebSocket } from 'ws';
import { createGame } from '../src/core/engine/setup';
import { applyAction } from '../src/core/engine/turn';
import { chooseAction } from '../src/core/ai';
import { maskFor } from '../src/core/mask';
import type { Action, GameState } from '../src/core/types';
import { MAX_PLAYERS, MIN_PLAYERS } from '../src/core/data/constants';
import type { ClientMsg, LobbyInfo, ServerMsg } from '../src/online/protocol';
import { NAME_MAX, ROOM_CODE_LENGTH } from '../src/online/protocol';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = 200;
const AI_DELAY_MS = 700;
const TAKEOVER_MS = 60_000;
const LOBBY_DROP_MS = 45_000;
const CREATE_PER_MIN = 3;
const AI_FAIL_LIMIT = 5;
const IDLE_ROOM_MS = 2 * 60 * 60_000;
const EMPTY_ROOM_MS = 10 * 60_000;

interface Seat {
  name: string;
  token: string;
  taken: boolean;
  ws: WebSocket | null;
  /** 떠났거나 오래 끊겨 AI 가 맡는 중 */
  ai: boolean;
  leftAt: number | null;
}

interface Room {
  code: string;
  seats: Seat[];
  host: number;
  game: GameState | null;
  lastActive: number;
  aiTimer: ReturnType<typeof setTimeout> | null;
  aiFails: number;
}

interface Conn {
  room: string | null;
  seat: number;
}

const rooms = new Map<string, Room>();
const conns = new WeakMap<WebSocket, Conn>();
const creates = new WeakMap<WebSocket, number[]>();

const isOpen = (ws: WebSocket | null) => !!ws && ws.readyState === ws.OPEN;
const humansOnline = (r: Room) => r.seats.some((s) => !s.ai && isOpen(s.ws));

function send(ws: WebSocket | null, msg: ServerMsg): void {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function cleanName(n: unknown): string {
  const s = typeof n === 'string' ? n.replace(/[\u0000-\u001f]/g, '').trim().slice(0, NAME_MAX) : '';
  return s || '개척자';
}

function newCode(): string {
  for (let i = 0; i < 100; i++) {
    let c = '';
    for (let j = 0; j < ROOM_CODE_LENGTH; j++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  throw new Error('방 코드 생성 실패');
}

function lobbyOf(r: Room): LobbyInfo {
  return {
    room: r.code,
    host: r.host,
    started: !!r.game,
    seats: r.seats.map((s) => ({ name: s.name, isAI: s.ai || !s.taken, connected: isOpen(s.ws), taken: s.taken })),
  };
}

function broadcast(r: Room): void {
  const lobby = lobbyOf(r);
  r.seats.forEach((s, i) => {
    send(s.ws, { t: 'lobby', lobby });
    if (r.game) send(s.ws, { t: 'state', state: maskFor(r.game, i), seat: i });
  });
}

function actorOf(g: GameState): number {
  return g.pending.length ? g.pending[0].player : g.current;
}

/** AI(또는 AI 가 맡은 자리) 차례면 잠시 뒤 한 수 둔다. 보는 사람이 없으면 멈춘다 */
function scheduleAI(r: Room): void {
  if (r.aiTimer || !r.game || r.game.gameOver || !humansOnline(r) || r.aiFails >= AI_FAIL_LIMIT) return;
  const who = actorOf(r.game);
  if (!r.game.players[who].isAI) return;
  r.aiTimer = setTimeout(() => {
    r.aiTimer = null;
    const g = r.game;
    if (!g || g.gameOver) return;
    const actor = actorOf(g);
    if (!g.players[actor].isAI) return;
    const a = chooseAction(g, actor) ?? { type: 'endTurn' as const };
    let res = applyAction(g, actor, a);
    if (res.error) res = applyAction(g, actor, g.pending.length ? { type: 'respond', choice: 0 } : { type: 'endTurn' });
    if (!res.error) {
      r.game = res.state;
      r.aiFails = 0;
      broadcast(r);
    } else if (++r.aiFails >= AI_FAIL_LIMIT) {
      console.error(`방 ${r.code}: AI 가 진행하지 못해 멈춤 — ${res.error}`);
    }
    scheduleAI(r);
  }, AI_DELAY_MS);
}

function setSeatAI(r: Room, seat: number, ai: boolean): void {
  r.seats[seat].ai = ai;
  if (r.game) {
    // 엔진 상태의 isAI 는 표시·AI 진행 여부에만 쓰이므로 서버가 직접 갱신한다
    r.game = { ...r.game, players: r.game.players.map((p) => (p.id === seat ? { ...p, isAI: ai } : p)) };
  }
}

/** 이 소켓이 이미 다른 자리에 붙어 있으면 떼어 낸다(소켓당 자리 1개) */
function detach(ws: WebSocket): void {
  const conn = conns.get(ws);
  if (!conn?.room) return;
  const r = rooms.get(conn.room);
  const s = r?.seats[conn.seat];
  conns.delete(ws);
  if (!r || !s || s.ws !== ws) return;
  s.ws = null;
  s.leftAt = Date.now();
  broadcast(r);
}

function attach(ws: WebSocket, r: Room, seat: number): void {
  const s = r.seats[seat];
  if (s.ws && s.ws !== ws) s.ws.close();
  s.ws = ws;
  s.leftAt = null;
  conns.set(ws, { room: r.code, seat });
  if (s.ai && r.game) setSeatAI(r, seat, false);
  send(ws, { t: 'joined', room: r.code, token: s.token, seat });
  r.lastActive = Date.now();
  broadcast(r);
  scheduleAI(r);
}

function handle(ws: WebSocket, msg: ClientMsg): void {
  const conn = conns.get(ws) ?? { room: null, seat: -1 };
  switch (msg.t) {
    case 'ping':
      send(ws, { t: 'pong' });
      return;
    case 'create': {
      const now = Date.now();
      const recent = (creates.get(ws) ?? []).filter((t) => now - t < 60_000);
      if (recent.length >= CREATE_PER_MIN) return send(ws, { t: 'error', message: '방을 너무 자주 만들었습니다. 잠시 뒤 다시 시도하세요' });
      creates.set(ws, [...recent, now]);
      if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', message: '서버가 가득 찼습니다. 잠시 뒤 다시 시도하세요' });
      const n = Number(msg.seats);
      if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS) return send(ws, { t: 'error', message: '인원은 2~4명' });
      const r: Room = {
        code: newCode(),
        seats: Array.from({ length: n }, () => ({ name: '', token: randomBytes(16).toString('hex'), taken: false, ws: null, ai: false, leftAt: null })),
        host: 0,
        game: null,
        lastActive: Date.now(),
        aiTimer: null,
        aiFails: 0,
      };
      detach(ws);
      r.seats[0].taken = true;
      r.seats[0].name = cleanName(msg.name);
      rooms.set(r.code, r);
      attach(ws, r, 0);
      return;
    }
    case 'join': {
      const r = rooms.get(String(msg.room).toUpperCase());
      if (!r) return send(ws, { t: 'error', message: '방을 찾을 수 없습니다' });
      if (r.game) return send(ws, { t: 'error', message: '이미 시작한 방입니다' });
      const seat = r.seats.findIndex((s) => !s.taken);
      if (seat < 0) return send(ws, { t: 'error', message: '자리가 없습니다' });
      const cur = conns.get(ws);
      if (cur?.room === r.code && r.seats[cur.seat]?.ws === ws) return send(ws, { t: 'joined', room: r.code, token: r.seats[cur.seat].token, seat: cur.seat });
      detach(ws);
      r.seats[seat].taken = true;
      r.seats[seat].name = cleanName(msg.name);
      attach(ws, r, seat);
      return;
    }
    case 'resume': {
      const r = rooms.get(String(msg.room).toUpperCase());
      if (!r) return send(ws, { t: 'error', message: '방을 찾을 수 없습니다(서버가 다시 시작되었을 수 있습니다)' });
      const seat = r.seats.findIndex((s) => s.taken && s.token === msg.token);
      if (seat < 0) return send(ws, { t: 'error', message: '방을 찾을 수 없습니다' });
      if (conns.get(ws)?.room !== r.code || conns.get(ws)?.seat !== seat) detach(ws);
      attach(ws, r, seat);
      return;
    }
    case 'start': {
      const r = conn.room ? rooms.get(conn.room) : null;
      if (!r) return;
      if (conn.seat !== r.host) return send(ws, { t: 'error', message: '방장만 시작할 수 있습니다' });
      if (r.game) return;
      let ai = 0;
      r.seats.forEach((s) => {
        if (!s.taken) {
          s.taken = true;
          s.ai = true;
          s.name = `AI ${++ai}`;
        }
      });
      r.game = createGame(Array.from({ length: 4 }, () => randomInt(2 ** 32)), r.seats.map((s) => ({ name: s.name, isAI: s.ai })));
      r.lastActive = Date.now();
      broadcast(r);
      scheduleAI(r);
      return;
    }
    case 'action': {
      const r = conn.room ? rooms.get(conn.room) : null;
      if (!r?.game) return send(ws, { t: 'error', message: '진행 중인 게임이 없습니다' });
      if (r.seats[conn.seat]?.ws !== ws) return;
      if (msg.ver !== r.game.ver) return send(ws, { t: 'error', message: '화면이 최신이 아닙니다 — 다시 시도하세요' });
      const res = applyAction(r.game, conn.seat, msg.action as Action);
      if (res.error) return send(ws, { t: 'error', message: res.error });
      r.game = res.state;
      r.lastActive = Date.now();
      broadcast(r);
      scheduleAI(r);
      return;
    }
    case 'leave': {
      const r = conn.room ? rooms.get(conn.room) : null;
      if (!r) return;
      const s = r.seats[conn.seat];
      s.ws = null;
      conns.delete(ws);
      if (r.game) {
        setSeatAI(r, conn.seat, true);
        s.token = randomBytes(16).toString('hex'); // 떠난 자리는 다시 붙을 수 없다
        broadcast(r);
        scheduleAI(r);
      } else {
        s.taken = false;
        s.name = '';
        if (conn.seat === r.host) {
          const next = r.seats.findIndex((x) => x.taken);
          if (next < 0) rooms.delete(r.code);
          else r.host = next;
        }
        broadcast(r);
      }
      return;
    }
  }
}

export function onConnection(ws: WebSocket): void {
  let count = 0;
  let windowStart = Date.now();
  ws.on('message', (data) => {
    const now = Date.now();
    if (now - windowStart > 1000) {
      windowStart = now;
      count = 0;
    }
    if (++count > 20) {
      // 초당 20개를 넘으면 버리고, 계속 넘으면 끊는다
      if (count > 60) ws.terminate();
      return;
    }
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data)) as ClientMsg;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    try {
      handle(ws, msg);
    } catch (e) {
      console.error('처리 오류', e);
      send(ws, { t: 'error', message: '서버 오류' });
    }
  });
  ws.on('error', () => ws.terminate());
  ws.on('close', () => detach(ws));
}

/** 주기 정리: 오래 끊긴 자리는 AI 인계(게임 중) 또는 자리 비움(대기실), 빈 방·오래된 방 삭제 */
export function sweep(now = Date.now()): void {
  for (const r of rooms.values()) {
    if (!r.game) {
      let changed = false;
      r.seats.forEach((s) => {
        if (s.taken && !isOpen(s.ws) && s.leftAt && now - s.leftAt > LOBBY_DROP_MS) {
          s.taken = false;
          s.name = '';
          s.ws = null;
          s.leftAt = null;
          s.token = randomBytes(16).toString('hex');
          changed = true;
        }
      });
      if (changed) {
        if (!r.seats[r.host].taken || !isOpen(r.seats[r.host].ws)) {
          const next = r.seats.findIndex((x) => x.taken && isOpen(x.ws));
          if (next >= 0) r.host = next;
        }
        broadcast(r);
      }
    }
    if (r.game) {
      r.seats.forEach((s, i) => {
        if (s.taken && !s.ai && !isOpen(s.ws) && s.leftAt && now - s.leftAt > TAKEOVER_MS) {
          setSeatAI(r, i, true);
          broadcast(r);
          scheduleAI(r);
        }
      });
    }
    const anyone = r.seats.some((s) => isOpen(s.ws));
    if (now - r.lastActive > IDLE_ROOM_MS || (!anyone && now - r.lastActive > EMPTY_ROOM_MS)) {
      if (r.aiTimer) clearTimeout(r.aiTimer);
      rooms.delete(r.code);
    }
  }
}

export function roomCount(): number {
  return rooms.size;
}
