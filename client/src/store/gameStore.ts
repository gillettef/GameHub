/**
 * Zustand 전역 상태. 모든 탭이 필요한 데이터를 여기서 선로드해 두고 선택자로 좁게 구독한다 (F014).
 * 게임 상태(GameState)는 어댑터가 돌려준 전체 상태로만 덮어쓴다. 컴포넌트는 상태를 직접 수정하지 않는다.
 */
import { create } from 'zustand';
import type { Action, CardId, GameState, PlayerId } from '@astraltab/shared';
import { applyHotseatAction, createHotseatGame, type HotseatConfig } from '../game/hotseat';

export type Screen = 'setup' | 'game';
export type TabId = 'board' | 'status' | 'progress';

export const TABS: { id: TabId; label: string }[] = [
  { id: 'board', label: '보드' },
  { id: 'status', label: '상태' },
  { id: 'progress', label: '진행' },
];

interface GameStore {
  screen: Screen;
  state: GameState | null;
  /** 지금 화면을 보는 플레이어. 핫시트에서는 턴 플레이어를 따라간다 */
  viewerId: PlayerId | null;
  tab: TabId;
  /** 보드 탭에서 고른 손패 카드 (손패 index). 배치 후 해제 */
  selectedHandIndex: number | null;
  /** 마지막 안내 문구 (배치 거부 사유 등). 다음에 할 일을 적는다 */
  notice: string | null;
  /** 결과 오버레이를 닫고 보드를 살펴보는 중인지 */
  resultDismissed: boolean;

  startHotseat: (config: HotseatConfig) => void;
  dispatch: (action: Action) => void;
  setTab: (tab: TabId) => void;
  selectHandCard: (index: number | null) => void;
  setNotice: (message: string) => void;
  clearNotice: () => void;
  dismissResult: () => void;
  backToSetup: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  screen: 'setup',
  state: null,
  viewerId: null,
  tab: 'board',
  selectedHandIndex: null,
  notice: null,
  resultDismissed: false,

  startHotseat: (config) => {
    const state = createHotseatGame(config);
    set({
      screen: 'game',
      state,
      viewerId: state.currentPlayerId,
      tab: 'board',
      selectedHandIndex: null,
      notice: null,
      resultDismissed: false,
    });
  },

  dispatch: (action) => {
    const current = get().state;
    if (!current) return;
    const result = applyHotseatAction(current, action);
    if (result.error) {
      set({ notice: result.error });
      return;
    }
    const next = result.state;
    set({
      state: next,
      // 핫시트: 턴이 넘어가면 보는 사람도 바뀐다. 종료되면 마지막 시점을 유지
      viewerId: next.currentPlayerId ?? get().viewerId,
      selectedHandIndex: null,
      notice: null,
    });
  },

  setTab: (tab) => {
    if (get().tab !== tab) set({ tab });
  },

  selectHandCard: (index) => set({ selectedHandIndex: index, notice: null }),
  setNotice: (message) => set({ notice: message }),
  clearNotice: () => set({ notice: null }),
  dismissResult: () => set({ resultDismissed: true }),
  backToSetup: () =>
    set({ screen: 'setup', state: null, viewerId: null, selectedHandIndex: null, notice: null, resultDismissed: false }),
}));

// ---------------------------------------------------------------------------
// 선택자 (컴포넌트는 필요한 조각만 구독한다)
// ---------------------------------------------------------------------------

export const selectState = (s: GameStore): GameState | null => s.state;
export const selectViewerId = (s: GameStore): PlayerId | null => s.viewerId;
export const selectTab = (s: GameStore): TabId => s.tab;
export const selectIsMyTurn = (s: GameStore): boolean =>
  s.state !== null && s.state.phase === 'playing' && s.state.currentPlayerId === s.viewerId;

/** 선택된 손패 카드 id. index 로 고르지만 배치·하이라이트는 cardId 로 한다 */
export const selectSelectedCardId = (s: GameStore): CardId | null => {
  if (s.selectedHandIndex === null || !s.state || !s.viewerId) return null;
  const player = s.state.players.find((p) => p.id === s.viewerId);
  return player?.hand[s.selectedHandIndex] ?? null;
};
