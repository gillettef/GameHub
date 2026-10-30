// localStorage 래퍼 — 접근은 이 파일에서만, 키는 nt:v1:*, 모두 try/catch
import type { GameState } from '../core/types';

const P = 'nt:v1:';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(P + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, v: unknown): void {
  try {
    localStorage.setItem(P + key, JSON.stringify(v));
  } catch {
    /* 저장 공간 부족·비공개 창: 무시 */
  }
}
function remove(key: string): void {
  try {
    localStorage.removeItem(P + key);
  } catch {
    /* 무시 */
  }
}

export interface LocalSave {
  game: GameState;
  me: number;
  savedAt: number;
}

export const storage = {
  loadLocal: () => read<LocalSave>('local'),
  saveLocal: (game: GameState, me: number, savedAt: number) => write('local', { game, me, savedAt }),
  clearLocal: () => remove('local'),
  loadName: () => read<string>('name') ?? '',
  saveName: (n: string) => write('name', n),
  loadSession: () => read<{ room: string; token: string }>('session'),
  saveSession: (room: string, token: string) => write('session', { room, token }),
  clearSession: () => remove('session'),
};
