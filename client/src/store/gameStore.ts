/**
 * Zustand 전역 상태. 모든 탭이 필요한 데이터를 여기서 선로드해 두고 선택자로 좁게 구독한다 (F014).
 *
 * 두 모드:
 *  - hotseat : 한 기기에서 번갈아 둔다. 규칙은 game/hotseat.ts(엔진 직접 호출)가 계산하고,
 *              턴이 넘어가면 '기기 넘김' 오버레이(handoffPending)가 다음 사람 손패를 가린다.
 *  - online  : 서버가 정본이다. 액션은 소켓으로 보내고, 상태는 서버가 보낸 스냅샷(가려진 상태)으로만 덮어쓴다.
 * 컴포넌트는 어느 모드든 같은 액션(placeAt·pass·surrender·dispatch)만 쓴다.
 */
import { create } from 'zustand';
import type { Action, CardId, MaskedGameState, PlayerId, RoomInfo, RoomSnapshot } from '@astraltab/shared';
import { maskState, validatePlacement } from '@astraltab/shared';
import { applyHotseatAction, createHotseatGame, type HotseatConfig } from '../game/hotseat';
import { api } from '../socket/client';

export type Mode = 'hotseat' | 'online';
export type TabId = 'board' | 'status' | 'progress';
export type Connection = 'idle' | 'connecting' | 'connected' | 'disconnected';

export const TABS: { id: TabId; label: string }[] = [
  { id: 'board', label: '보드' },
  { id: 'status', label: '상태' },
  { id: 'progress', label: '진행' },
];

interface GameStore {
  mode: Mode | null;
  state: MaskedGameState | null;
  /** 온라인 방 정보. 핫시트는 null */
  room: RoomInfo | null;
  /** 지금 화면을 보는 플레이어. 핫시트는 턴 플레이어, 온라인은 나 */
  viewerId: PlayerId | null;
  connection: Connection;
  tab: TabId;
  /** 보드 탭에서 고른 손패 카드 (손패 index). 배치 후 해제 */
  selectedHandIndex: number | null;
  /** 마지막 안내 문구 (배치 거부 사유 등). 다음에 할 일을 적는다 */
  notice: string | null;
  /** 결과 오버레이를 닫고 보드를 살펴보는 중인지 */
  resultDismissed: boolean;
  /** 기권 확인 단계 (보드·진행 탭이 공유) */
  surrenderConfirming: boolean;
  /** 핫시트: 턴이 넘어가 기기를 넘겨야 함. 다음 사람이 '시작'을 누를 때까지 화면을 가린다 */
  handoffPending: boolean;
  /** 온라인: 서버 응답을 기다리는 중 (연타 방지) */
  sending: boolean;

  startHotseat: (config: HotseatConfig) => void;
  /** 온라인: 서버 스냅샷으로 덮어쓰기 */
  applySnapshot: (snapshot: RoomSnapshot) => void;
  setConnection: (connection: Connection) => void;
  dispatch: (action: Action) => void;
  placeAt: (x: number, y: number) => void;
  pass: () => void;
  surrender: () => void;
  setSurrenderConfirming: (on: boolean) => void;
  acknowledgeHandoff: () => void;
  setTab: (tab: TabId) => void;
  selectHandCard: (index: number | null) => void;
  setNotice: (message: string) => void;
  clearNotice: () => void;
  dismissResult: () => void;
  /** 게임·방 상태를 비운다 (랜딩으로 돌아갈 때) */
  reset: () => void;
}

const EMPTY = {
  mode: null,
  state: null,
  room: null,
  viewerId: null,
  connection: 'idle' as Connection,
  tab: 'board' as TabId,
  selectedHandIndex: null,
  notice: null,
  resultDismissed: false,
  surrenderConfirming: false,
  handoffPending: false,
  sending: false,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...EMPTY,

  startHotseat: (config) => {
    const state = createHotseatGame(config);
    set({
      ...EMPTY,
      mode: 'hotseat',
      state: maskState(state, null),
      viewerId: state.currentPlayerId,
      handoffPending: true,
    });
  },

  applySnapshot: ({ room, state, you }) => {
    const prev = get();
    const turnChanged = prev.state?.turn !== state.turn || prev.state?.phase !== state.phase;
    set({
      mode: 'online',
      room,
      state,
      viewerId: you,
      connection: 'connected',
      // 턴이 바뀌면 선택·확인 단계를 정리한다
      selectedHandIndex: turnChanged ? null : prev.selectedHandIndex,
      surrenderConfirming: turnChanged ? false : prev.surrenderConfirming,
      sending: false,
    });
  },

  setConnection: (connection) => set({ connection }),

  dispatch: (action) => {
    const { mode, state, room, sending } = get();
    if (!state) return;
    if (mode === 'online') {
      if (!room || sending) return;
      set({ sending: true, surrenderConfirming: false });
      void api.sendAction(room.roomId, action).then((res) => {
        if (!res.ok) set({ notice: res.message, sending: false });
        // 성공하면 room:state 스냅샷이 곧 도착해 sending 을 내린다
      });
      return;
    }
    // 핫시트: 로컬 엔진 적용. 가려지지 않은 전체 상태이므로 그대로 넣어도 된다
    const result = applyHotseatAction(state, action);
    if (result.error) {
      set({ notice: result.error });
      return;
    }
    const next = result.state;
    const viewerChanged = next.currentPlayerId !== null && next.currentPlayerId !== get().viewerId;
    set({
      state: maskState(next, null),
      viewerId: next.currentPlayerId ?? get().viewerId,
      selectedHandIndex: null,
      notice: null,
      surrenderConfirming: false,
      handoffPending: viewerChanged && next.phase === 'playing',
    });
  },

  placeAt: (x, y) => {
    const { state, viewerId, selectedHandIndex, dispatch, setNotice } = get();
    if (!state || !viewerId || selectedHandIndex === null) return;
    const cardId = state.players.find((p) => p.id === viewerId)?.hand[selectedHandIndex];
    if (!cardId) return;
    const err = validatePlacement(state, viewerId, cardId, { x, y });
    if (err) {
      setNotice(err.message);
      return;
    }
    dispatch({ type: 'PLACE', playerId: viewerId, cardId, pos: { x, y } });
  },

  pass: () => {
    const { viewerId, dispatch } = get();
    if (viewerId) dispatch({ type: 'PASS', playerId: viewerId });
  },

  surrender: () => {
    const { viewerId, dispatch } = get();
    if (viewerId) dispatch({ type: 'SURRENDER', playerId: viewerId });
  },

  setSurrenderConfirming: (on) => set({ surrenderConfirming: on }),
  acknowledgeHandoff: () => set({ handoffPending: false }),

  setTab: (tab) => {
    if (get().tab !== tab) set({ tab });
  },

  selectHandCard: (index) => {
    if (!selectIsMyTurn(get())) return;
    set({ selectedHandIndex: index, notice: null });
  },
  setNotice: (message) => set({ notice: message }),
  clearNotice: () => set({ notice: null }),
  dismissResult: () => set({ resultDismissed: true }),
  reset: () => set({ ...EMPTY }),
}));

// ---------------------------------------------------------------------------
// 선택자 (컴포넌트는 필요한 조각만 구독한다)
// ---------------------------------------------------------------------------

export const selectState = (s: GameStore): MaskedGameState | null => s.state;
export const selectViewerId = (s: GameStore): PlayerId | null => s.viewerId;
export const selectTab = (s: GameStore): TabId => s.tab;
export const selectIsMyTurn = (s: GameStore): boolean =>
  s.state !== null && s.state.phase === 'playing' && s.state.currentPlayerId === s.viewerId && !s.handoffPending && !s.sending;

/** 선택된 손패 카드 id. index 로 고르지만 배치·하이라이트는 cardId 로 한다 */
export const selectSelectedCardId = (s: GameStore): CardId | null => {
  if (s.selectedHandIndex === null || !s.state || !s.viewerId) return null;
  const player = s.state.players.find((p) => p.id === s.viewerId);
  return player?.hand[s.selectedHandIndex] ?? null;
};
