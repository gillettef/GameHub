/**
 * 로그인 없음. 닉네임과 재접속용 playerToken 을 localStorage 에 둔다 (CLAUDE.md "DB 없는 상태 관리").
 * 서버는 roomId + playerToken 으로 같은 사람을 알아본다 (F007).
 */
const TOKEN_KEY = 'astraltab.playerToken';
const NICK_KEY = 'astraltab.nickname';
const ROOM_PW_PREFIX = 'astraltab.roomPassword.';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* 시크릿 창 등: 세션 동안만 메모리로 */
  }
}

let memoryToken: string | null = null;

export function getPlayerToken(): string {
  const stored = read(TOKEN_KEY);
  if (stored) return stored;
  if (!memoryToken) {
    memoryToken = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    write(TOKEN_KEY, memoryToken);
  }
  return memoryToken;
}

export function getNickname(): string {
  return read(NICK_KEY) ?? '';
}

export function setNickname(nickname: string): void {
  write(NICK_KEY, nickname.trim());
}

/** 방 비밀번호는 재접속 때 다시 묻지 않도록 방별로 기억한다 */
export function getRoomPassword(roomId: string): string | null {
  return read(ROOM_PW_PREFIX + roomId);
}

export function setRoomPassword(roomId: string, password: string | null): void {
  write(ROOM_PW_PREFIX + roomId, password);
}
