import { isGameState } from '../core/validate';
import type { GameState, Player } from '../core/types';

const KEY = 'election-mancala:save:v1';

/** AI 대결만 기기에 저장한다 (온라인 판은 서버가 갖고 있다) */
export interface SavedGame {
  mode: 'ai';
  /** AI가 맡은 자리. 예전 저장(필드 없음)은 AI = 🔴 */
  aiPlayer: Player;
  state: GameState;
  log: string[];
  savedAt: number;
}

/** 진행 중인 판을 저장. 끝난 판이면 지운다. 저장소를 못 쓰는 환경이면 조용히 무시 */
export function saveGame(game: Omit<SavedGame, 'savedAt'>): void {
  try {
    if (game.state.phase === 'over') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ ...game, savedAt: Date.now() }));
  } catch {
    /* 사생활 보호 모드 등 */
  }
}

export function loadGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<SavedGame>;
    // 예전 버전의 'local'(한 기기 2인) 저장은 더 이상 이어할 수 없다
    if (d.mode !== 'ai' || !isGameState(d.state) || d.state.phase === 'over') return null;
    const log = Array.isArray(d.log) ? d.log.filter((x): x is string => typeof x === 'string').slice(0, 5) : [];
    const aiPlayer: Player = d.aiPlayer === 0 ? 0 : 1;
    return { mode: d.mode, aiPlayer, state: d.state, log, savedAt: Number(d.savedAt) || 0 };
  } catch {
    return null;
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}

// ---------- 온라인 ----------

const CLIENT_ID_KEY = 'election-mancala:client-id';
const ROOM_KEY = 'election-mancala:online-room';

/** 이 기기의 온라인 식별자. 같은 방에 다시 접속할 때 원래 자리를 찾는 데 쓴다 */
export function clientId(): string {
  try {
    const old = localStorage.getItem(CLIENT_ID_KEY);
    if (old && /^[\w-]{8,64}$/.test(old)) return old;
    const id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    // 저장소를 못 쓰면 이번 실행 동안만 유지
    return (memoryId ??= crypto.randomUUID());
  }
}
let memoryId: string | undefined;

export interface SavedRoom {
  code: string;
  savedAt: number;
}

/** 마지막으로 들어간 방 (메뉴의 '다시 접속'용) */
export function saveRoom(code: string): void {
  try {
    localStorage.setItem(ROOM_KEY, JSON.stringify({ code, savedAt: Date.now() }));
  } catch {
    /* 무시 */
  }
}

export function loadRoom(maxAgeMs: number): SavedRoom | null {
  try {
    const d = JSON.parse(localStorage.getItem(ROOM_KEY) ?? 'null') as Partial<SavedRoom> | null;
    if (!d || typeof d.code !== 'string' || typeof d.savedAt !== 'number') return null;
    if (Date.now() - d.savedAt > maxAgeMs) return null;
    return { code: d.code, savedAt: d.savedAt };
  } catch {
    return null;
  }
}

export function clearRoom(): void {
  try {
    localStorage.removeItem(ROOM_KEY);
  } catch {
    /* 무시 */
  }
}

const THEME_KEY = 'election-mancala:theme';
export type ThemePref = 'auto' | 'light' | 'dark';

export function loadTheme(): ThemePref {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveTheme(t: ThemePref): void {
  try {
    if (t === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch {
    /* 무시 */
  }
}
