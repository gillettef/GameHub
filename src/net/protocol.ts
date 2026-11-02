/**
 * 온라인 대결 프로토콜 — 브라우저(src/net/online.ts)와 Node 서버(server/)가 함께 쓴다.
 *
 * 동기화 모델: 서버(server/hub.ts, 방마다 메모리에 하나)가 상태의 기준이다.
 * - 클라이언트는 자기 차례에 액션을 바로 화면에 적용(낙관적)하고 `{t:'action', action, from}`을 보낸다.
 *   `from`은 적용 전 state.version.
 * - 서버는 version·차례·합법성을 확인해 적용하고, 상대에게만 같은 액션을 전달한다.
 *   거부하면 보낸 쪽에 현재 상태(`state`)를 보내 되돌리게 한다.
 * - 받은 쪽은 core의 resolveAction으로 같은 연출을 재생한다(core가 결정적이라 결과가 같다).
 * 방장의 자리(🔵 선공 seat 0 / 🔴 후공 seat 1)는 방을 만들 때 서버가 무작위로 정하고, 참가자는 남은 자리.
 */
import type { Action, GameState, Player } from '../core/types';
import { isAction, isGameState } from '../core/validate';

/** 헷갈리는 글자(0/O, 1/I/L)를 뺀 방 코드 글자 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;
/** 마지막 활동 후 방을 지우기까지 */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
/** 이보다 긴 메시지는 무시 */
export const MAX_MESSAGE_BYTES = 4096;

export const isRoomCode = (x: string): boolean =>
  x.length === ROOM_CODE_LENGTH && [...x].every((ch) => ROOM_CODE_ALPHABET.includes(ch));

/** 사용자가 입력한 코드를 정규화(대문자, 공백·하이픈 제거) */
export const normalizeRoomCode = (x: string): string => x.toUpperCase().replace(/[\s-]/g, '');

export function randomRoomCode(rand: () => number): string {
  let s = '';
  for (let k = 0; k < ROOM_CODE_LENGTH; k++) s += ROOM_CODE_ALPHABET[Math.floor(rand() * ROOM_CODE_ALPHABET.length)];
  return s;
}

/** 방 접속 경로. 쿼리: id=클라이언트 식별자, create=1이면 새 방 */
export const roomPath = (code: string) => `/api/room/${code}`;

export type ErrorCode =
  /** 없는(또는 만료된) 방에 참가 */
  | 'notFound'
  /** 이미 있는 코드로 방 만들기 */
  | 'taken'
  /** 두 자리가 다 찼다 */
  | 'full'
  /** 잘못된 요청(식별자 없음 등) */
  | 'badRequest';

export type ClientMsg =
  | { t: 'action'; action: Action; from: number }
  /** 서버 상태를 다시 받는다(어긋났을 때) */
  | { t: 'sync' }
  /** 끝난 판을 새로 시작 */
  | { t: 'again' };

export type ServerMsg =
  /** full = 두 자리가 모두 찼다(상대가 한 번은 들어왔다) */
  | { t: 'welcome'; seat: Player; state: GameState; online: [boolean, boolean]; full: boolean }
  /** 상대가 둔 수. from = 적용 전 version */
  | { t: 'action'; action: Action; from: number }
  /** 상태 교체(재동기화·거부·새 판) */
  | { t: 'state'; state: GameState }
  | { t: 'presence'; online: [boolean, boolean] }
  | { t: 'error'; code: ErrorCode };

/** WebSocket 종료 코드 (4000번대는 앱 정의) */
export const CLOSE_ERROR = 4000;
/** 같은 자리로 다른 탭·기기가 접속해 밀려남 */
export const CLOSE_REPLACED = 4001;

const ERROR_CODES: readonly string[] = ['notFound', 'taken', 'full', 'badRequest'];
const isBoolPair = (x: unknown): x is [boolean, boolean] =>
  Array.isArray(x) && x.length === 2 && x.every((b) => typeof b === 'boolean');
const isVersion = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;

function parse(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES * 8) return null;
  try {
    const d: unknown = JSON.parse(raw);
    return d && typeof d === 'object' ? (d as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 서버가 받은 문자열 → ClientMsg. 모양이 틀리면 null */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  if (typeof raw === 'string' && raw.length > MAX_MESSAGE_BYTES) return null;
  const d = parse(raw);
  if (!d) return null;
  switch (d.t) {
    case 'action':
      return isAction(d.action) && isVersion(d.from) ? { t: 'action', action: d.action, from: d.from } : null;
    case 'sync':
    case 'again':
      return { t: d.t };
    default:
      return null;
  }
}

/** 클라이언트가 받은 문자열 → ServerMsg. 모양이 틀리면 null */
export function parseServerMsg(raw: unknown): ServerMsg | null {
  const d = parse(raw);
  if (!d) return null;
  switch (d.t) {
    case 'welcome':
      return (d.seat === 0 || d.seat === 1) && isGameState(d.state) && isBoolPair(d.online)
        ? { t: 'welcome', seat: d.seat, state: d.state, online: d.online, full: d.full === true }
        : null;
    case 'action':
      return isAction(d.action) && isVersion(d.from) ? { t: 'action', action: d.action, from: d.from } : null;
    case 'state':
      return isGameState(d.state) ? { t: 'state', state: d.state } : null;
    case 'presence':
      return isBoolPair(d.online) ? { t: 'presence', online: d.online } : null;
    case 'error':
      return typeof d.code === 'string' && ERROR_CODES.includes(d.code) ? { t: 'error', code: d.code as ErrorCode } : null;
    default:
      return null;
  }
}
