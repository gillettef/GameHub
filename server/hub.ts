// 온라인 방 관리 (전송 계층과 무관). 방 상태는 서버 메모리에만 둔다 — DB 없음, 서버가 재시작되면 진행 중인 방은 사라진다.
// 게임 정산은 src/core 규칙 엔진을 그대로 쓰고, 각자에게는 viewFor 로 볼 수 있는 정보만 보낸다.
import { randomBytes, randomInt } from 'node:crypto';
import { MAX_AGENTS, MIN_AGENTS, createGame, finishGame, nextRound, resolveRound } from '../src/core';
import type { AiLevel, GameState, Guesses, Offer, RoundBid, Submission } from '../src/core';
import { ROOM_CODE_RE, type ClientMsg, type RoomView, type SeatView, type ServerMsg } from '../src/online/protocol';

export interface Conn {
  send(msg: ServerMsg): void;
}

export interface HubOptions {
  /** 0 이상 n 미만 정수 (테스트에서 고정) */
  randInt?: (n: number) => number;
  maxRooms?: number;
  /** 대기실에서 끊긴 사람을 방에서 빼기까지 */
  lobbyGraceMs?: number;
  /** 방장이 끊겼을 때 다른 사람에게 넘기기까지 */
  hostGraceMs?: number;
  /** 모두 끊긴 방을 지우기까지 */
  emptyRoomMs?: number;
}

interface Member {
  pid: string;
  token: string;
  name: string;
  conn: Conn | null;
  timer?: ReturnType<typeof setTimeout>;
}

type LobbySeat = { kind: 'human'; pid: string } | { kind: 'ai'; name: string; level: AiLevel };

interface Room {
  code: string;
  host: string;
  members: Map<string, Member>;
  /** 대기실 자리 */
  seats: LobbySeat[];
  game: GameState | null;
  /** 게임 자리(에이전트 인덱스) → 사람 pid. AI 자리는 null */
  seatPids: (string | null)[];
  subs: Record<number, RoundBid>;
  guesses: Record<number, Guesses>;
  ready: Set<number>;
  hostTimer?: ReturnType<typeof setTimeout>;
  emptyTimer?: ReturnType<typeof setTimeout>;
}

export const AI_NAMES = ['AI 알파', 'AI 브라보', 'AI 찰리'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const cleanName = (s: unknown): string => (typeof s === 'string' ? s.replace(/[<>&"'\s]/g, '').slice(0, 12) : '');
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/** 클라이언트가 보낸 제안을 엔진이 받는 모양으로 정리 (모양이 틀리면 패스) */
function cleanOffer(o: unknown): Submission {
  if (!o || typeof o !== 'object') return null;
  const { playerId, clubId, demand } = o as Record<string, unknown>;
  return isInt(playerId) && isInt(clubId) && isInt(demand) ? ({ playerId, clubId, demand } as Offer) : null;
}

/** 사람 i 에게 보낼 게임: 다른 사람 비밀 구단·다음 라운드 이후 이벤트·구단 요구 카드 더미 순서·난수 상태를 가린다 (종료 후에는 전부 공개) */
export function redact(game: GameState, seat: number | null): GameState {
  if (game.phase === 'done') return game;
  return {
    ...game,
    rng: 0,
    events: game.events.slice(0, game.round + 1),
    needDecks: Object.fromEntries(Object.entries(game.needDecks).map(([c, d]) => [c, d.map(() => -1)])),
    agents: game.agents.map((a, i) => (i === seat ? a : { ...a, secret: -1 })),
  };
}

export class Hub {
  private rooms = new Map<string, Room>();
  private where = new Map<Conn, { code: string; pid: string }>();
  private randInt: (n: number) => number;
  private opts: Required<Omit<HubOptions, 'randInt'>>;

  constructor(o: HubOptions = {}) {
    this.randInt = o.randInt ?? ((n) => randomInt(n));
    this.opts = { maxRooms: o.maxRooms ?? 200, lobbyGraceMs: o.lobbyGraceMs ?? 45_000, hostGraceMs: o.hostGraceMs ?? 30_000, emptyRoomMs: o.emptyRoomMs ?? 30 * 60_000 };
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  // ── 연결 ───────────────────────────────────────────

  disconnect(conn: Conn): void {
    const at = this.where.get(conn);
    this.where.delete(conn);
    if (!at) return;
    const room = this.rooms.get(at.code);
    const m = room?.members.get(at.pid);
    if (!room || !m || m.conn !== conn) return;
    m.conn = null;
    if (!room.game) {
      m.timer = setTimeout(() => this.removeMember(room, m.pid), this.opts.lobbyGraceMs);
    }
    if (room.host === m.pid) {
      clearTimeout(room.hostTimer);
      room.hostTimer = setTimeout(() => this.passHost(room), this.opts.hostGraceMs);
    }
    this.syncEmpty(room);
    this.progress(room);
    this.broadcast(room);
  }

  handle(conn: Conn, raw: unknown): void {
    if (!raw || typeof raw !== 'object' || typeof (raw as { t?: unknown }).t !== 'string') return this.err(conn, '잘못된 요청입니다.');
    const msg = raw as ClientMsg;
    try {
      this.dispatch(conn, msg);
    } catch (e) {
      this.err(conn, e instanceof HubError ? e.message : '요청을 처리하지 못했습니다.');
    }
  }

  private dispatch(conn: Conn, msg: ClientMsg): void {
    switch (msg.t) {
      case 'ping':
        return conn.send({ t: 'pong' });
      case 'create':
        return this.create(conn, msg.name);
      case 'join':
        return this.join(conn, msg.code, msg.name);
      case 'rejoin':
        return this.rejoin(conn, msg.code, msg.token);
    }
    const { room, me } = this.mine(conn);
    switch (msg.t) {
      case 'leave':
        this.removeMember(room, me.pid);
        return conn.send({ t: 'left' });
      case 'add-ai': {
        this.lobbyHost(room, me);
        if (room.seats.length >= MAX_AGENTS) throw new HubError(`최대 ${MAX_AGENTS}명까지입니다.`);
        const used = new Set(room.seats.map((s) => (s.kind === 'ai' ? s.name : '')));
        room.seats.push({ kind: 'ai', name: AI_NAMES.find((n) => !used.has(n)) ?? 'AI', level: 'normal' });
        break;
      }
      case 'ai-level': {
        this.lobbyHost(room, me);
        const s = room.seats[msg.seat];
        if (s?.kind === 'ai') s.level = s.level === 'normal' ? 'easy' : 'normal';
        break;
      }
      case 'remove-seat':
        this.lobbyHost(room, me);
        if (room.seats[msg.seat]?.kind === 'ai') room.seats.splice(msg.seat, 1);
        break;
      case 'kick': {
        if (room.host !== me.pid) throw new HubError('방장만 할 수 있습니다.');
        const target = room.members.get(msg.pid);
        if (!target || target.pid === me.pid) return;
        if (target.conn) {
          target.conn.send({ t: 'kicked' });
          this.where.delete(target.conn);
        }
        this.removeMember(room, target.pid);
        return;
      }
      case 'start':
        this.start(room, me);
        break;
      case 'bid': {
        const at = this.playing(room, me, 'bid');
        if (!at || msg.round !== at.game.round || at.seat in room.subs) return;
        const { seat } = at;
        const bid = msg.bid as unknown as Record<string, unknown> | null;
        room.subs[seat] = { first: cleanOffer(bid?.first), second: cleanOffer(bid?.second) };
        break;
      }
      case 'ready': {
        const at = this.playing(room, me, 'result');
        if (!at || msg.round !== at.game.round) return;
        room.ready.add(at.seat);
        break;
      }
      case 'guess': {
        const at = this.playing(room, me, 'guess');
        if (!at || at.seat in room.guesses) return;
        const { game, seat } = at;
        const picks: Guesses = {};
        for (const [k, v] of Object.entries(msg.picks ?? {})) {
          const who = Number(k);
          if (isInt(who) && who !== seat && game.agents[who] && isInt(v) && game.clubs.includes(v)) picks[who] = v;
        }
        room.guesses[seat] = picks;
        break;
      }
      case 'rematch':
        if (room.host !== me.pid) throw new HubError('방장만 할 수 있습니다.');
        if (room.game?.phase !== 'done') throw new HubError('게임이 끝난 뒤에 할 수 있습니다.');
        room.seats = room.game.agents.flatMap((a, i): LobbySeat[] => {
          const pid = room.seatPids[i];
          if (pid) return room.members.has(pid) ? [{ kind: 'human', pid }] : [];
          return [{ kind: 'ai', name: a.name, level: a.level ?? 'normal' }];
        });
        // 게임 중 들어온 적 없는 사람(있을 수 없지만)이나 빠진 자리 보정
        for (const m of room.members.values()) if (!room.seats.some((s) => s.kind === 'human' && s.pid === m.pid)) room.seats.push({ kind: 'human', pid: m.pid });
        room.game = null;
        room.seatPids = [];
        this.resetStep(room);
        break;
      default:
        throw new HubError('알 수 없는 요청입니다.');
    }
    this.progress(room);
    this.broadcast(room);
  }

  // ── 방 만들기·참가 ─────────────────────────────────

  private create(conn: Conn, rawName: unknown): void {
    const name = cleanName(rawName);
    if (name.length < 2) throw new HubError('이름은 2자 이상이어야 합니다.');
    if (this.rooms.size >= this.opts.maxRooms) throw new HubError('서버에 방이 너무 많습니다. 잠시 뒤 다시 시도하세요.');
    this.detach(conn);
    let code = '';
    do code = Array.from({ length: 4 }, () => CODE_CHARS[this.randInt(CODE_CHARS.length)]).join('');
    while (this.rooms.has(code));
    const m = this.newMember(name);
    const room: Room = { code, host: m.pid, members: new Map([[m.pid, m]]), seats: [{ kind: 'human', pid: m.pid }], game: null, seatPids: [], subs: {}, guesses: {}, ready: new Set() };
    this.rooms.set(code, room);
    this.attach(conn, room, m);
  }

  private join(conn: Conn, rawCode: unknown, rawName: unknown): void {
    const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
    const room = ROOM_CODE_RE.test(code) ? this.rooms.get(code) : undefined;
    if (!room) throw new HubError('방을 찾을 수 없습니다. 코드를 확인하세요.');
    if (room.game) throw new HubError('이미 게임이 시작된 방입니다.');
    let name = cleanName(rawName);
    if (name.length < 2) throw new HubError('이름은 2자 이상이어야 합니다.');
    if (room.seats.length >= MAX_AGENTS) {
      // 자리가 꽉 찼으면 마지막 AI 자리를 사람에게 내준다
      const ai = room.seats.map((s) => s.kind).lastIndexOf('ai');
      if (ai < 0) throw new HubError('방이 가득 찼습니다.');
      room.seats.splice(ai, 1);
    }
    const names = new Set([...room.members.values()].map((x) => x.name));
    for (let n = 2; names.has(name); n++) name = `${cleanName(rawName).slice(0, 10)}${n}`;
    this.detach(conn);
    const m = this.newMember(name);
    room.members.set(m.pid, m);
    room.seats.push({ kind: 'human', pid: m.pid });
    this.attach(conn, room, m);
  }

  private rejoin(conn: Conn, rawCode: unknown, token: unknown): void {
    const room = typeof rawCode === 'string' ? this.rooms.get(rawCode.toUpperCase()) : undefined;
    const m = room && typeof token === 'string' ? [...room.members.values()].find((x) => x.token === token) : undefined;
    if (!room || !m) return conn.send({ t: 'rejoin-failed' });
    this.detach(conn);
    if (m.conn && m.conn !== conn) this.where.delete(m.conn);
    clearTimeout(m.timer);
    if (room.host === m.pid) clearTimeout(room.hostTimer);
    this.attach(conn, room, m);
  }

  private newMember(name: string): Member {
    return { pid: randomBytes(4).toString('hex'), token: randomBytes(16).toString('hex'), name, conn: null };
  }

  private attach(conn: Conn, room: Room, m: Member): void {
    m.conn = conn;
    this.where.set(conn, { code: room.code, pid: m.pid });
    conn.send({ t: 'joined', code: room.code, token: m.token });
    this.syncEmpty(room);
    this.broadcast(room);
  }

  /** 이 연결이 이미 다른 방에 있으면 그 방에서 나간다 */
  private detach(conn: Conn): void {
    const at = this.where.get(conn);
    if (!at) return;
    this.where.delete(conn);
    const room = this.rooms.get(at.code);
    if (room) this.removeMember(room, at.pid);
  }

  /** 방에서 빼기. 게임 중이면 그 자리는 AI 가 이어받는다. */
  private removeMember(room: Room, pid: string): void {
    const m = room.members.get(pid);
    if (!m) return;
    clearTimeout(m.timer);
    if (m.conn) this.where.delete(m.conn);
    room.members.delete(pid);
    room.seats = room.seats.filter((s) => !(s.kind === 'human' && s.pid === pid));
    const seat = room.seatPids.indexOf(pid);
    if (room.game && seat >= 0 && room.game.phase !== 'done') {
      room.seatPids[seat] = null;
      room.game = { ...room.game, agents: room.game.agents.map((a, i) => (i === seat ? { ...a, kind: 'ai' as const, level: 'normal' as const, persona: 'balanced' as const } : a)) };
      delete room.subs[seat];
      delete room.guesses[seat];
      room.ready.delete(seat);
    }
    if (!room.members.size) return this.deleteRoom(room);
    if (room.host === pid) this.passHost(room);
    this.syncEmpty(room);
    this.progress(room);
    this.broadcast(room);
  }

  /** 방장을 접속 중인 사람에게 넘긴다 (모두 끊겼으면 그대로) */
  private passHost(room: Room): void {
    clearTimeout(room.hostTimer);
    const cur = room.members.get(room.host);
    if (cur?.conn) return;
    const next = [...room.members.values()].find((m) => m.conn) ?? [...room.members.values()][0];
    if (next && next.pid !== room.host) {
      room.host = next.pid;
      this.broadcast(room);
    }
  }

  private syncEmpty(room: Room): void {
    const anyone = [...room.members.values()].some((m) => m.conn);
    clearTimeout(room.emptyTimer);
    room.emptyTimer = undefined;
    if (!anyone) room.emptyTimer = setTimeout(() => this.deleteRoom(room), this.opts.emptyRoomMs);
  }

  private deleteRoom(room: Room): void {
    clearTimeout(room.hostTimer);
    clearTimeout(room.emptyTimer);
    for (const m of room.members.values()) {
      clearTimeout(m.timer);
      if (m.conn) this.where.delete(m.conn);
    }
    this.rooms.delete(room.code);
  }

  // ── 게임 진행 ──────────────────────────────────────

  private start(room: Room, me: Member): void {
    this.lobbyHost(room, me);
    if (room.seats.length < MIN_AGENTS) throw new HubError(`${MIN_AGENTS}명 이상이어야 시작할 수 있습니다. AI를 추가하세요.`);
    const setup = room.seats.map((s) => (s.kind === 'ai' ? { name: s.name, kind: 'ai' as const, level: s.level } : { name: room.members.get(s.pid)!.name, kind: 'human' as const }));
    room.game = createGame(setup, this.randInt(0x7fffffff));
    room.seatPids = room.seats.map((s) => (s.kind === 'human' ? s.pid : null));
    this.resetStep(room);
  }

  private resetStep(room: Room): void {
    room.subs = {};
    room.guesses = {};
    room.ready = new Set();
  }

  /** 모두 제출했으면 정산하고 다음 단계로 (AI 만 남으면 끝까지 자동 진행) */
  private progress(room: Room): void {
    for (let guard = 0; guard < 20 && room.game; guard++) {
      const g = room.game;
      const humans = room.seatPids.flatMap((p, i) => (p && g.agents[i]!.kind === 'human' ? [i] : []));
      if (g.phase === 'bid' && humans.every((i) => i in room.subs)) {
        room.game = resolveRound(g, room.subs);
        this.resetStep(room);
      } else if (g.phase === 'result' && humans.filter((i) => room.members.get(room.seatPids[i]!)?.conn).every((i) => room.ready.has(i))) {
        room.game = nextRound(g);
        this.resetStep(room);
      } else if (g.phase === 'guess' && humans.every((i) => i in room.guesses)) {
        room.game = finishGame(g, room.guesses);
        this.resetStep(room);
      } else return;
    }
  }

  // ── 보내기 ─────────────────────────────────────────

  viewFor(room: Room, pid: string): RoomView {
    const g = room.game;
    const mySeat = g ? room.seatPids.indexOf(pid) : -1;
    const seat = mySeat >= 0 ? mySeat : null;
    const human = (p: string): SeatView => {
      const m = room.members.get(p);
      return { kind: 'human', name: m?.name ?? '?', pid: p, online: !!m?.conn };
    };
    const seats: SeatView[] = g
      ? g.agents.map((a, i) => {
          const p = room.seatPids[i];
          if (p) return { ...human(p), name: a.name, online: !!room.members.get(p)?.conn };
          return { kind: a.kind === 'ai' ? 'ai' : 'human', name: a.name, ...(a.level ? { level: a.level } : {}) };
        })
      : room.seats.map((s) => (s.kind === 'human' ? human(s.pid) : { kind: 'ai', name: s.name, level: s.level }));
    const done = !g ? [] : g.phase === 'bid' ? Object.keys(room.subs).map(Number) : g.phase === 'guess' ? Object.keys(room.guesses).map(Number) : g.phase === 'result' ? [...room.ready] : [];
    return {
      code: room.code,
      me: pid,
      host: room.host,
      seats,
      game: g ? redact(g, seat) : null,
      mySeat: seat,
      done,
      myBid: seat !== null ? (room.subs[seat] ?? null) : null,
    };
  }

  private broadcast(room: Room): void {
    if (!this.rooms.has(room.code)) return;
    for (const m of room.members.values()) m.conn?.send({ t: 'room', room: this.viewFor(room, m.pid) });
  }

  // ── 확인 ───────────────────────────────────────────

  private mine(conn: Conn): { room: Room; me: Member } {
    const at = this.where.get(conn);
    const room = at && this.rooms.get(at.code);
    const me = at && room?.members.get(at.pid);
    if (!room || !me) throw new HubError('방에 들어가 있지 않습니다.');
    return { room, me };
  }

  private lobbyHost(room: Room, me: Member): void {
    if (room.host !== me.pid) throw new HubError('방장만 할 수 있습니다.');
    if (room.game) throw new HubError('게임 중에는 바꿀 수 없습니다.');
  }

  /** 지금 이 단계에서 내 자리. 단계가 이미 넘어갔으면(늦게 도착한 중복 요청) null 이라 조용히 무시한다 */
  private playing(room: Room, me: Member, phase: GameState['phase']): { game: GameState; seat: number } | null {
    const game = room.game;
    const seat = room.seatPids.indexOf(me.pid);
    return game && seat >= 0 && game.phase === phase ? { game, seat } : null;
  }

  private err(conn: Conn, msg: string): void {
    conn.send({ t: 'error', msg });
  }
}

class HubError extends Error {}
