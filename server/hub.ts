/**
 * 방 목록과 소켓 연결(메모리). 판단은 room.ts(순수)가 하고 여기서는 방 보관·소켓 전달만 한다.
 * DB가 없으므로 서버를 재시작하면 진행 중인 방은 사라진다.
 * 소켓은 아래 최소 인터페이스만 쓰므로 ws 없이도 테스트할 수 있다.
 */
import type { Player } from '../src/core/types';
import { CLOSE_ERROR, CLOSE_REPLACED, ROOM_TTL_MS, parseClientMsg, type ServerMsg } from '../src/net/protocol';
import { emptyRoom, handleMessage, joinRoom, type Outgoing, type RoomData } from './room';

export interface Sock {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

const OPEN = 1;

interface Room {
  data: RoomData;
  /** 접속 중인 소켓과 그 자리 */
  socks: Map<Sock, Player>;
  /** 마지막 활동 시각(ms) */
  touched: number;
}

const rooms = new Map<string, Room>();

export const roomCount = (): number => rooms.size;

/** 테스트용: 모든 방을 지운다 */
export const resetRooms = (): void => rooms.clear();

function send(ws: Sock, msg: ServerMsg): void {
  try {
    if (ws.readyState === OPEN) ws.send(JSON.stringify(msg));
  } catch {
    /* 이미 닫힌 소켓 */
  }
}

function presence(room: Room, except?: Sock): [boolean, boolean] {
  const on: [boolean, boolean] = [false, false];
  for (const [w, seat] of room.socks) if (w !== except && w.readyState === OPEN) on[seat] = true;
  return on;
}

/** 접속 상태를 알린다. skip에게는 보내지 않고, closing은 접속자로 세지 않는다 */
function broadcastPresence(room: Room, skip?: Sock, closing?: Sock): void {
  const msg: ServerMsg = { t: 'presence', online: presence(room, closing) };
  for (const w of room.socks.keys()) if (w !== skip && w !== closing) send(w, msg);
}

function dispatch(room: Room, self: Sock, out: Outgoing[]): void {
  for (const o of out) {
    if (o.to === 'self') send(self, o.msg);
    else for (const w of room.socks.keys()) if (o.to === 'all' || w !== self) send(w, o.msg);
  }
}

export interface SockEvents {
  onMessage(raw: string): void;
  onClose(): void;
}

/**
 * 방 코드(검사 끝난 값)로 들어온 연결. 반환된 핸들러를 소켓의 message/close 에 연결한다.
 * hostSeat = 방을 새로 만들 때 방장 자리(🔵 선공 0 / 🔴 후공 1).
 */
export function connect(
  code: string,
  ws: Sock,
  clientId: string,
  create: boolean,
  hostSeat: Player,
  now: number = Date.now(),
): SockEvents | null {
  const room = rooms.get(code) ?? { data: emptyRoom(), socks: new Map<Sock, Player>(), touched: now };
  const result = joinRoom(room.data, clientId, create, hostSeat);
  if (!result.ok) {
    // 브라우저 WebSocket은 HTTP 오류 본문을 읽을 수 없으므로, 연결을 받은 뒤 오류를 알리고 닫는다
    send(ws, { t: 'error', code: result.error });
    ws.close(CLOSE_ERROR, result.error);
    return null;
  }

  const { seat } = result;
  rooms.set(code, room);
  room.data = result.data;
  room.touched = now;
  // 같은 자리의 예전 연결(다른 탭·끊긴 기기)은 정리
  for (const [old, s] of [...room.socks]) {
    if (s !== seat) continue;
    room.socks.delete(old);
    old.close(CLOSE_REPLACED, 'replaced');
  }
  room.socks.set(ws, seat);

  const state = room.data.state;
  if (state) send(ws, { t: 'welcome', seat, state, online: presence(room), full: !room.data.seats.includes(null) });
  broadcastPresence(room, ws);

  return {
    onMessage(raw) {
      if (!room.socks.has(ws)) return;
      const msg = parseClientMsg(raw);
      if (!msg) return;
      const r = handleMessage(room.data, seat, msg);
      room.data = r.data;
      room.touched = Date.now();
      dispatch(room, ws, r.out);
    },
    onClose() {
      if (!room.socks.has(ws)) return;
      broadcastPresence(room, undefined, ws);
      room.socks.delete(ws);
      room.touched = Date.now();
    },
  };
}

/** 접속자가 없고 ROOM_TTL_MS 동안 쓰지 않은 방을 지운다 */
export function sweep(now: number = Date.now()): void {
  for (const [code, room] of rooms) {
    if (room.socks.size === 0 && now - room.touched > ROOM_TTL_MS) rooms.delete(code);
  }
}
