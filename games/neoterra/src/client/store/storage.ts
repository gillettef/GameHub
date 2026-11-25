// localStorage 래퍼 — 접근은 이 파일에서만, 키는 neoterra:v1:*, 모두 try/catch
import type { LocalSave } from '@gamehub/net/client';
import type { Action } from '../../engine/types';

// 게임 허브에서는 여러 게임이 같은 출처의 localStorage 를 함께 쓰므로 게임 이름을 접두어로 쓴다
const P = 'neoterra:v1:';
/** 예전 접두어. 값이 남아 있으면 처음 읽을 때 한 번 옮긴다 */
const LEGACY_P = 'nt:v1:';

function migrate(key: string): void {
  if (localStorage.getItem(P + key) !== null) return;
  const old = localStorage.getItem(LEGACY_P + key);
  if (old === null) return;
  localStorage.setItem(P + key, old);
  localStorage.removeItem(LEGACY_P + key);
}

function read<T>(key: string): T | null {
  try {
    migrate(key);
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

/** 한 기기 대전 이어 하기: 공통 진행 코드의 저장(좌석·시드·행동 기록)과 화면에 보일 요약 */
export interface SavedLocal {
  v: 2;
  save: LocalSave<Action>;
  /** 처음 화면 「이어 하기」에 보일 시대·라운드 */
  era: number;
  round: number;
}

function loadLocal(): SavedLocal | null {
  // 옛 형식(상태 통째 저장, 'local')은 이어 둘 수 없어 지운다(docs/refactor-plan.md 6절: 저장 데이터 비호환)
  remove('local');
  const s = read<SavedLocal>('game');
  if (!s || s.v !== 2 || !s.save || !Array.isArray(s.save.seats) || !Array.isArray(s.save.history) || typeof s.save.seed !== 'number') return null;
  return s;
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
  loadLocal,
  saveLocal: (v: SavedLocal) => write('game', v),
  clearLocal: () => remove('game'),
  loadSettings,
  saveSettings: (v: Settings) => write('settings', v),
};
