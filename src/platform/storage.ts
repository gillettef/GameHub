/** 저장 관련 플랫폼 코드. 앱(Capacitor 등)으로 포장할 때 이 파일을 교체하면 된다. */
import type { GameState } from '../game/types';

/**
 * 저장 스키마 버전.
 * GameState 구조 변경 시 올릴 것 — 버전이 다른 저장은 불러오지 않고 버린다.
 */
export const SAVE_VERSION = 3;

const KEY = 'smilepark.save';
/** 이전 형식(버전 필드 없음)의 키. 발견하면 지운다. */
const LEGACY_KEYS = ['smilepark.save.v2'];

interface SaveFile {
  v: number;
  savedAt: number;
  state: GameState;
}

const PHASES = ['construct', 'promote', 'operate', 'manage', 'gameOver'];

/** 불러온 상태가 최소한의 구조를 갖췄는지 확인 (필수 필드 누락 시 버림) */
function isValidState(s: unknown): s is GameState {
  if (!s || typeof s !== 'object') return false;
  const g = s as Partial<GameState>;
  return (
    Array.isArray(g.players) &&
    g.players.length > 0 &&
    g.players.every((p) => p && Array.isArray(p.facilities) && typeof p.money === 'number' && typeof p.vp === 'number' && !!p.staff) &&
    typeof g.phase === 'string' &&
    PHASES.includes(g.phase) &&
    typeof g.round === 'number' &&
    typeof g.maxRounds === 'number' &&
    Array.isArray(g.market) &&
    Array.isArray(g.log) &&
    Array.isArray(g.visitorRow)
  );
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** hasSave() 결과 캐시. undefined = 아직 확인 안 함 */
let saveExists: boolean | undefined;

export function loadGame(): GameState | null {
  const ls = storage();
  if (!ls) return null;
  try {
    for (const k of LEGACY_KEYS) ls.removeItem(k);
    const raw = ls.getItem(KEY);
    if (!raw) {
      saveExists = false;
      return null;
    }
    const file = JSON.parse(raw) as Partial<SaveFile>;
    if (file?.v !== SAVE_VERSION || !isValidState(file.state)) throw new Error('호환되지 않는 저장');
    saveExists = true;
    return { ...file.state, notice: null };
  } catch {
    clearSave();
    return null;
  }
}

export function saveGame(s: GameState | null) {
  const ls = storage();
  if (!ls) return;
  try {
    if (!s || s.phase === 'gameOver') {
      ls.removeItem(KEY);
      saveExists = false;
      return;
    }
    // notice(일회성 알림)는 저장하지 않는다 — 이어하기 시 옛 토스트가 다시 뜨지 않게
    const file: SaveFile = { v: SAVE_VERSION, savedAt: Date.now(), state: { ...s, notice: null } };
    ls.setItem(KEY, JSON.stringify(file));
    saveExists = true;
  } catch {
    /* 저장 불가 환경(용량 초과·사생활 모드 등)에서는 무시 */
  }
}

export function clearSave() {
  saveExists = false;
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* noop */
  }
}

/** 이어하기 가능한 저장이 있는지. 처음 한 번만 실제로 읽어 검증하고 이후엔 캐시를 쓴다. */
export function hasSave(): boolean {
  if (saveExists === undefined) loadGame();
  return saveExists === true;
}
