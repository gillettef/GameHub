// 기기에 저장하는 것: 진행 중인 한 기기 게임(이어 하기)과 봇 속도. 같은 origin 의 다른 게임과 겹치지 않게 eleven: 접두어
import type { LocalSave } from '@gamehub/net/client';
import type { Action } from '../def';

export type BotSpeed = 'normal' | 'fast' | 'turbo';

/** 진행 중인 한 기기 게임. 형식은 @gamehub/net 의 LocalSave(시드 + 행동 기록) */
export interface SavedLocal {
  v: 1;
  createdAt: number;
  save: LocalSave<Action>;
}

const CURRENT_KEY = 'eleven:current';
const SPEED_KEY = 'eleven:botSpeed';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 저장 없이 진행
  }
}

export function loadCurrent(): SavedLocal | null {
  const s = read<SavedLocal>(CURRENT_KEY);
  return s && s.v === 1 && Array.isArray(s.save?.history) ? s : null;
}

export function saveCurrent(value: SavedLocal): void {
  write(CURRENT_KEY, value);
}

export function clearCurrent(): void {
  write(CURRENT_KEY, null);
}

export function loadBotSpeed(): BotSpeed {
  const v = read<string>(SPEED_KEY);
  return v === 'fast' || v === 'turbo' ? v : 'normal';
}

export function saveBotSpeed(speed: BotSpeed): void {
  write(SPEED_KEY, speed);
}
