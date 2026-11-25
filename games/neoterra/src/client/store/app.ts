// 대국 화면의 UI 상태(Zustand). 게임 상태의 권위는 공통 진행 코드(@gamehub/net: 한 기기 LocalGame, 온라인 서버)이고,
// App 의 GameView 가 받은 화면(내 좌석으로 가린 상태)·행동 전송기를 여기에 옮겨 둔다
import { create } from 'zustand';
import type { Action, GameState, LogEntry } from '../../engine/types';
import { storage, type Settings } from './storage';

/** 온라인 연결 상태. 한 기기 대전은 null */
export type Conn = 'open' | 'closed' | null;

/** 내 차례가 끝난 순간의 표시: 다음 내 차례에 "그 뒤 무슨 일이 있었나"를 보여 주는 기준 */
export interface TurnMark {
  /** 그때 기록의 마지막 몇 줄(라운드|자리|글) — 새 기록에서 이 줄들을 찾아 그 뒤를 새 일로 본다 */
  anchor: string[];
  /** 그때 기록 길이 — 같은 줄이 여러 번 있어도 기준 위치를 정확히 찾는다 */
  logLen: number;
  /** 그때 자리별 연구한 노드 */
  researched: Record<number, string[]>;
}

/** 한 번에 하나씩 차례로 여는 요약 창 */
export type Notice = { kind: 'era'; era: number } | { kind: 'turn'; entries: LogEntry[] };

/** 확인 창(행동 전에 한 번 묻기) */
export interface Confirm {
  title: string;
  text: string;
  ok: string;
  onOk: () => void;
}

export interface AppState {
  mode: 'local' | 'online' | null;
  /** 내 좌석으로 가린 상태 */
  game: GameState | null;
  me: number;
  /** 관전(온라인, 좌석 없음): 행동하지 않는다 */
  watching: boolean;
  toast: { text: string; id: number } | null;
  /** 모드별 행동 전송기 */
  send: ((a: Action) => void) | null;
  /** 되돌리기(한 기기 대전만) — 내 마지막 행동을 취소. 되돌릴 게 없으면 canUndo 가 false */
  undo: (() => void) | null;
  canUndo: boolean;
  conn: Conn;
  mark: TurnMark | null;
  confirm: Confirm | null;
  settings: Settings;
  /** 요약 창 대기열(시대 요약 → 차례 요약). 결정·확인 창·시대 배너가 없을 때 맨 앞 하나만 연다 */
  notices: Notice[];
  /** 지금 떠 있는 시대 전환 배너(없으면 null) */
  eraBanner: number | null;
  pushNotice: (n: Notice) => void;
  shiftNotice: () => void;
  set: (p: Partial<AppState>) => void;
  showToast: (text: string) => void;
  setSettings: (p: Partial<Settings>) => void;
}

let toastId = 0;

export const useApp = create<AppState>((set, get) => ({
  mode: null,
  game: null,
  me: 0,
  watching: false,
  toast: null,
  send: null,
  undo: null,
  canUndo: false,
  conn: null,
  mark: null,
  confirm: null,
  settings: storage.loadSettings(),
  notices: [],
  eraBanner: null,
  // 시대 요약이 늘 차례 요약보다 먼저
  pushNotice: (n) => set((st) => ({ notices: n.kind === 'era' ? [n, ...st.notices.filter((x) => x.kind !== 'era')] : [...st.notices.filter((x) => x.kind !== 'turn'), n] })),
  shiftNotice: () => set((st) => ({ notices: st.notices.slice(1) })),
  set: (p) => set(p),
  showToast: (text) => set({ toast: { text, id: ++toastId } }),
  setSettings: (p) => {
    const next = { ...get().settings, ...p };
    storage.saveSettings(next);
    set({ settings: next });
  },
}));
