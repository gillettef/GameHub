// UI 상태(Zustand). 게임 상태의 권위는 로컬 엔진 또는 서버
import { create } from 'zustand';
import type { Action, GameState } from '../core/types';
import type { LobbyInfo } from '../online/protocol';

export type Screen = 'home' | 'lobby' | 'game';

export interface AppState {
  screen: Screen;
  mode: 'local' | 'online' | null;
  game: GameState | null;
  me: number;
  viewing: number;
  lobby: LobbyInfo | null;
  toast: { text: string; id: number } | null;
  /** 모드별 행동 전송기 */
  send: ((a: Action) => void) | null;
  /** 되돌리기(로컬 AI 대전만) — 내 마지막 행동을 취소. 되돌릴 게 없으면 canUndo 가 false */
  undo: (() => void) | null;
  canUndo: boolean;
  set: (p: Partial<AppState>) => void;
  showToast: (text: string) => void;
}

let toastId = 0;

export const useApp = create<AppState>((set) => ({
  screen: 'home',
  mode: null,
  game: null,
  me: 0,
  viewing: 0,
  lobby: null,
  toast: null,
  send: null,
  undo: null,
  canUndo: false,
  set: (p) => set(p),
  showToast: (text) => set({ toast: { text, id: ++toastId } }),
}));
