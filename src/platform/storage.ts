/** 플랫폼 종속 코드 모음. 앱(Capacitor 등)으로 포장할 때 이 파일만 교체하면 된다. */
import type { GameState } from '../game/types';

const KEY = 'smilepark.save.v2';

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s && s.players && s.phase ? s : null;
  } catch {
    return null;
  }
}

export function saveGame(s: GameState | null) {
  try {
    if (!s || s.phase === 'gameOver') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 저장 불가 환경에서는 무시 */
  }
}

export function hasSave(): boolean {
  return loadGame() !== null;
}

/** 가벼운 햅틱 (지원 기기만) */
export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* noop */
  }
}
