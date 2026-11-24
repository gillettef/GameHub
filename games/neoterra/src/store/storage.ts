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

/** AI 한 행동 사이 쉬는 시간 단계 */
export type AiSpeed = 'normal' | 'fast' | 'instant';

/** 화면 설정(기기마다 따로) */
export interface Settings {
  aiSpeed: AiSpeed;
  /** 내 차례가 돌아오면 지난 차례 이후 상대 행동 요약을 띄운다 */
  turnSummary: boolean;
  /** 첫 판 코치 문구 */
  coach: boolean;
}

export const DEFAULT_SETTINGS: Settings = { aiSpeed: 'normal', turnSummary: true, coach: true };

function loadSettings(): Settings {
  const s = read<Partial<Settings>>('settings');
  if (!s || typeof s !== 'object') return { ...DEFAULT_SETTINGS };
  return {
    aiSpeed: s.aiSpeed === 'fast' || s.aiSpeed === 'instant' ? s.aiSpeed : 'normal',
    turnSummary: s.turnSummary !== false,
    coach: s.coach !== false,
  };
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
  loadSettings,
  saveSettings: (v: Settings) => write('settings', v),
};
