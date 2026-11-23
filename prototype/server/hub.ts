// 온라인 방 관리 (전송 계층과 무관). 방 상태는 서버 메모리에만 둔다 — 서버가 재시작되면 진행 중인 방은 사라진다.
// 게임 진행은 src/core 규칙 엔진을 그대로 쓰고, 각자에게는 redact 로 볼 수 있는 정보만 보낸다.
import { randomBytes, randomInt } from 'node:crypto';
import { MAX_PLAYERS, MIN_PLAYERS, botDesign, botIntervention, createGame, currentBot, playTurn, submitDesign } from '../src/core';
import type { BotLevel, GameState, Intervention } from '../src/core/types';
import { ROOM_CODE_RE, type ClientMsg, type RoomView, type SeatView, type ServerMsg } from '../src/online/protocol';

export interface Conn {
  send(msg: ServerMsg): void;
}

export interface HubOptions {
  maxRooms?: number;
  /** 봇이 실행 차례를 진행하기까지 기다리는 시간 (사람이 볼 수 있게) */
  botDelayMs?: number;
  /** 대기실에서 끊긴 사람을 방에서 빼기까지 */
  lobbyGraceMs?: number;
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

type Seat = { kind: 'human'; pid: string } | { kind: 'bot'; name: string; level: BotLevel };

interface Room {
  code: string;
  host: string;
  members: Map<string, Member>;
  seats: Seat[];
  game: GameState | null;
  botTimer?: ReturnType<typeof setTimeout>;
  emptyTimer?: ReturnType<typeof setTimeout>;
}

class HubError extends Error {}

const BOT_NAMES = ['봇 알파', '봇 브라보', '봇 찰리', '봇 델타', '봇 에코'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const cleanName = (s: unknown): string => (typeof s === 'string' ? s.replace(/[<>&"'\s]/g, '').slice(0, 10) : '');
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

function cleanIv(raw: unknown): Intervention | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.k === 'none' || o.k === 'thrust') return { k: o.k };
  if (o.k === 'turn' && (o.dir === 'L' || o.dir === 'R')) return { k: 'turn', dir: o.dir };
  if (o.k === 'block' && isInt(o.slot) && o.slot >= 0 && o.slot < 3) return { k: 'block', slot: o.slot };
  return null;
}

/** 자리 seat 에게 보낼 게임: 다른 설계자의 손패와 공개 전 배치, 주머니 순서와 난수 상태를 가린다 */
export function redact(game: GameState, seat: number | null): GameState {
  if (game.phase === 'done') return game;
  return {
    ...game,
    rng: 0,
    bag: game.bag.map(() => -1),
    players: game.players.map((p, i) =>
      i === seat ? p : { ...p, hand: p.hand.map(() => -1), pending: p.pending ? p.pending.map(() => -1) : null },
    ),
  };
}

export class Hub {
  private rooms = new Map<string, Room>();
  private where = new Map<Conn, { code: string; pid: string }>();
  private opts: Required<HubOptions>;

  constructor(o: HubOptions = {}) {
    this.opts = {
      maxRooms: o.maxRooms ?? 200,
      botDelayMs: o.botDelayMs ?? 1100,
      lobbyGraceMs: o.lobbyGraceMs ?? 45_000,
      emptyRoomMs: o.emptyRoomMs ?? 30 * 60_000,
    };
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  disconnect(conn: Conn): void {
    const at = this.where.get(conn);
    this.where.delete(conn);
    if (!at) return;
    const room = this.rooms.get(at.code);
    const m = room?.members.get(at.pid);
    if (!room || !m || m.conn !== conn) return;
    m.conn = null;
    if (!room.game) m.timer = setTimeout(() => this.removeMember(room, m.pid), this.opts.lobbyGraceMs);
    this.syncEmpty(room);
    this.broadcast(room);
  }

  handle(conn: Conn, raw: unknown): void {
    if (!raw || typeof raw !== 'object' || typeof (raw as { t?: unknown }).t !== 'string') return conn.send({ t: 'error', msg: '잘못된 요청입니다.' });
    try {
      this.dispatch(conn, raw as ClientMsg);
    } catch (e) {
      conn.send({ t: 'error', msg: e instanceof HubError ? e.message : '요청을 처리하지 못했습니다.' });
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
        this.where.delete(conn);
        this.removeMember(room, me.pid);
        return conn.send({ t: 'left' });
      case 'add-bot': {
        this.lobbyHost(room, me);
        if (room.seats.length >= MAX_PLAYERS) throw new HubError(`최대 ${MAX_PLAYERS}명까지입니다.`);
        const used = new Set(room.seats.map((s) => (s.kind === 'bot' ? s.name : '')));
        room.seats.push({ kind: 'bot', name: BOT_NAMES.find((n) => !used.has(n)) ?? '봇', level: 'normal' });
        break;
      }
      case 'bot-level': {
        this.lobbyHost(room, me);
        const s = room.seats[msg.seat];
        if (s?.kind === 'bot') s.level = s.level === 'normal' ? 'easy' : 'normal';
        break;
      }
      case 'remove-seat':
        this.lobbyHost(room, me);
        if (room.seats[msg.seat]?.kind === 'bot') room.seats.splice(msg.seat, 1);
        break;
      case 'start': {
        this.lobbyHost(room, me);
        if (room.seats.length < MIN_PLAYERS) throw new HubError(`${MIN_PLAYERS}명 이상이어야 시작할 수 있습니다. 봇을 추가하세요.`);
        room.game = createGame(
          room.seats.map((s) =>
            s.kind === 'bot' ? { name: s.name, kind: 'bot' as const, level: s.level } : { name: room.members.get(s.pid)!.name, kind: 'human' as const },
          ),
          randomInt(2 ** 31),
        );
        break;
      }
      case 'design': {
        const { game, seat } = this.playing(room, me);
        if (game.phase !== 'design' || msg.round !== game.round || game.players[seat]!.pending) return;
        if (!Array.isArray(msg.slots) || !msg.slots.every(isInt)) throw new HubError('잘못된 배치입니다.');
        try {
          submitDesign(game, seat, msg.slots);
        } catch (e) {
          throw new HubError((e as Error).message);
        }
        break;
      }
      case 'intervene': {
        const { game, seat } = this.playing(room, me);
        if (game.phase !== 'exec' || msg.round !== game.round || msg.turn !== game.turn || currentBot(game) !== seat) return;
        const iv = cleanIv(msg.iv);
        if (!iv) throw new HubError('잘못된 개입입니다.');
        try {
          playTurn(game, iv);
        } catch (e) {
          throw new HubError((e as Error).message);
        }
        break;
      }
      case 'rematch': {
        if (room.host !== me.pid) throw new HubError('방장만 할 수 있습니다.');
        if (room.game?.phase !== 'done') throw new HubError('게임이 끝난 뒤에 할 수 있습니다.');
        room.seats = room.seats.filter((s) => s.kind === 'bot' || room.members.has(s.pid));
        room.game = null;
        break;
      }
      default:
        throw new HubError('알 수 없는 요청입니다.');
    }
    this.progress(room);
    this.broadcast(room);
  }

  // ── 방 만들기·들어가기 ─────────────────────────────────

  private create(conn: Conn, rawName: unknown): void {
    const name = cleanName(rawName);
    if (!name) throw new HubError('이름을 입력하세요.');
    if (this.rooms.size >= this.opts.maxRooms) throw new HubError('방이 너무 많습니다. 잠시 뒤 다시 시도하세요.');
    let code = '';
    do code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    while (this.rooms.has(code));
    const room: Room = { code, host: '', members: new Map(), seats: [], game: null };
    this.rooms.set(code, room);
    const m = this.addMember(room, conn, name);
    room.host = m.pid;
    this.broadcast(room);
  }

  private join(conn: Conn, rawCode: unknown, rawName: unknown): void {
    const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
    const name = cleanName(rawName);
    if (!ROOM_CODE_RE.test(code)) throw new HubError('방 코드는 4자리입니다.');
    if (!name) throw new HubError('이름을 입력하세요.');
    const room = this.rooms.get(code);
    if (!room) throw new HubError('방을 찾을 수 없습니다.');
    if (room.game) throw new HubError('이미 게임이 시작된 방입니다.');
    if (room.seats.length >= MAX_PLAYERS) throw new HubError('방이 가득 찼습니다.');
    if ([...room.members.values()].some((m) => m.name === name)) throw new HubError('같은 이름이 이미 있습니다.');
    this.addMember(room, conn, name);
    this.broadcast(room);
  }

  private rejoin(conn: Conn, rawCode: unknown, token: unknown): void {
    const room = typeof rawCode === 'string' ? this.rooms.get(rawCode) : undefined;
    const m = room && [...room.members.values()].find((x) => x.token === token);
    if (!room || !m) return conn.send({ t: 'left' });
    if (m.conn && m.conn !== conn) this.where.delete(m.conn);
    clearTimeout(m.timer);
    m.conn = conn;
    this.where.set(conn, { code: room.code, pid: m.pid });
    conn.send({ t: 'joined', code: room.code, token: m.token, pid: m.pid });
    this.syncEmpty(room);
    this.broadcast(room);
  }

  private addMember(room: Room, conn: Conn, name: string): Member {
    const m: Member = { pid: randomBytes(6).toString('hex'), token: randomBytes(16).toString('hex'), name, conn };
    room.members.set(m.pid, m);
    room.seats.push({ kind: 'human', pid: m.pid });
    this.where.set(conn, { code: room.code, pid: m.pid });
    conn.send({ t: 'joined', code: room.code, token: m.token, pid: m.pid });
    return m;
  }

  /** 사람이 나가면: 대기실에서는 자리를 지우고, 게임 중에는 그 자리를 봇이 이어받는다 */
  private removeMember(room: Room, pid: string): void {
    const m = room.members.get(pid);
    if (!m) return;
    clearTimeout(m.timer);
    room.members.delete(pid);
    const idx = room.seats.findIndex((s) => s.kind === 'human' && s.pid === pid);
    if (idx >= 0) {
      if (room.game) {
        room.seats[idx] = { kind: 'bot', name: `${m.name}(봇)`, level: 'normal' };
        const p = room.game.players[idx]!;
        p.kind = 'bot';
        p.name = `${m.name}(봇)`;
      } else room.seats.splice(idx, 1);
    }
    if (room.members.size === 0) return this.closeRoom(room);
    if (room.host === pid) room.host = [...room.members.keys()][0]!;
    this.progress(room);
    this.broadcast(room);
  }

  private closeRoom(room: Room): void {
    clearTimeout(room.botTimer);
    clearTimeout(room.emptyTimer);
    this.rooms.delete(room.code);
  }

  private syncEmpty(room: Room): void {
    clearTimeout(room.emptyTimer);
    if ([...room.members.values()].every((m) => !m.conn)) room.emptyTimer = setTimeout(() => this.closeRoom(room), this.opts.emptyRoomMs);
  }

  private mine(conn: Conn): { room: Room; me: Member } {
    const at = this.where.get(conn);
    const room = at && this.rooms.get(at.code);
    const me = room?.members.get(at!.pid);
    if (!room || !me) throw new HubError('방에 들어가 있지 않습니다.');
    return { room, me };
  }

  private lobbyHost(room: Room, me: Member): void {
    if (room.host !== me.pid) throw new HubError('방장만 할 수 있습니다.');
    if (room.game) throw new HubError('게임 중에는 바꿀 수 없습니다.');
  }

  private playing(room: Room, me: Member): { game: GameState; seat: number } {
    const seat = room.seats.findIndex((s) => s.kind === 'human' && s.pid === me.pid);
    if (!room.game || seat < 0) throw new HubError('게임에 참가하고 있지 않습니다.');
    return { game: room.game, seat };
  }

  // ── 봇 진행 ─────────────────────────────────────────

  /** 봇 설계자는 바로 놓고, 봇 조종사의 실행 차례는 잠깐 기다렸다 진행한다 */
  private progress(room: Room): void {
    const g = room.game;
    if (!g || g.phase === 'done') return;
    if (g.phase === 'design') {
      for (let d = 0; d < g.n; d++) {
        if (g.players[d]!.kind === 'bot' && !g.players[d]!.pending) {
          submitDesign(g, d, botDesign(g, d, randomInt(2 ** 31)));
          if (g.phase !== 'design') break;
        }
      }
    }
    if (g.phase === 'exec' && g.players[currentBot(g)]!.kind === 'bot' && !room.botTimer) {
      room.botTimer = setTimeout(() => {
        room.botTimer = undefined;
        if (room.game !== g || g.phase !== 'exec' || g.players[currentBot(g)]!.kind !== 'bot') return;
        playTurn(g, botIntervention(g, randomInt(2 ** 31)));
        this.progress(room);
        this.broadcast(room);
      }, this.opts.botDelayMs);
    }
  }

  private broadcast(room: Room): void {
    for (const m of room.members.values()) {
      if (!m.conn) continue;
      const mySeat = room.game ? room.seats.findIndex((s) => s.kind === 'human' && s.pid === m.pid) : -1;
      const seats: SeatView[] = room.seats.map((s) =>
        s.kind === 'bot'
          ? { name: s.name, kind: 'bot', level: s.level, pid: null, online: true }
          : { name: room.members.get(s.pid)?.name ?? '?', kind: 'human', level: 'normal', pid: s.pid, online: !!room.members.get(s.pid)?.conn },
      );
      const view: RoomView = {
        code: room.code,
        host: room.host,
        me: m.pid,
        seats,
        mySeat: mySeat >= 0 ? mySeat : null,
        game: room.game ? redact(room.game, mySeat >= 0 ? mySeat : null) : null,
      };
      m.conn.send({ t: 'room', room: view });
    }
  }
}
