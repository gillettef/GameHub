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
export type TabId = 'board' | 'status' | 'progress' | 'cards' | 'help';
/** 확대해서 볼 카드. 손패는 index(같은 카드 여러 장 구분), 카탈로그(카드 탭)는 카드 id */
export type CardModalTarget = { kind: 'hand'; index: number } | { kind: 'spec'; cardId: CardId };
export type Connection = 'idle' | 'connecting' | 'connected' | 'disconnected';

/** 순서 = 하단 독 표시 순서. 대국 진행(보드·상태·진행) 다음에 참고 자료(카드·설명)를 둔다
 * (2026-09-23 카드 탭 추가하며 재배치) */
export const TABS: { id: TabId; label: string }[] = [
  { id: 'board', label: '보드' },
  { id: 'status', label: '상태' },
  { id: 'progress', label: '진행' },
  { id: 'cards', label: '카드' },
  { id: 'help', label: '설명' },
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
  /** 배치 후보 칸. 카드를 고르고 칸을 탭하면 곧바로 놓지 않고 여기에 보류해 미리보기(예상 전투)를 보여 준다.
   * '배치 확정'(confirmPlacement)을 눌러야 엔진에 PLACE 가 전송된다 — 취소는 클라이언트에서만 일어난다 */
  pendingPos: { x: number; y: number } | null;
  /** 손패 교체 모드(패스/턴 종료 시 함께 버릴 카드 고르기, Rules.md 5.2, 2026-09-23).
   * Hand 카드 클릭이 배치 대신 "버릴 카드 고르기"로 바뀔 뿐, 배치 선택 자체를 지우지는 않는다 */
  discardMode: boolean;
  /** 교체 모드에서 고른 카드 id 들(다중 집합 — 같은 카드 여러 장 가능). index 가 아니라 cardId 로
   * 추적한다 — 같은 턴에 카드를 배치하면 손패 배열이 바뀌어 index 가 밀릴 수 있기 때문이다.
   * PASS 를 보낼 때 실제로 그만큼 손패에 없으면 엔진이 거부한다(validateDiscard) */
  discardCardIds: CardId[];
  /** 보드에서 탭해 살펴보는 마커 id (모바일엔 호버가 없어 탭으로 정보를 본다) */
  inspectedMarkerId: string | null;
  /** 마지막 안내 문구 (배치 거부 사유 등). 다음에 할 일을 적는다 */
  notice: string | null;
  /** 결과 오버레이를 닫고 보드를 살펴보는 중인지 */
  resultDismissed: boolean;
  /** 카드 확대 모달(2026-10-01). 손패 카드를 탭하면 바로 고르지 않고 크게 보여 준 뒤 모달 안에서 고른다 */
  cardModal: CardModalTarget | null;
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
  /** 보류 중인 배치 후보를 실제로 놓는다 */
  confirmPlacement: () => void;
  cancelPlacement: () => void;
  pass: () => void;
  toggleDiscardMode: () => void;
  /** willSelect: 이 카드를 교체 목록에 추가(true)할지 뺄(false)지. Hand.tsx 가 현재 선택 여부로 계산한다 */
  setDiscardCard: (cardId: CardId, willSelect: boolean) => void;
  surrender: () => void;
  openCardModal: (target: CardModalTarget) => void;
  closeCardModal: () => void;
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
  pendingPos: null as { x: number; y: number } | null,
  discardMode: false,
  discardCardIds: [] as CardId[],
  inspectedMarkerId: null as string | null,
  notice: null,
  resultDismissed: false,
  cardModal: null as CardModalTarget | null,
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
      // 턴이 바뀌면 선택·확인 단계를 정리한다. 손패 교체 선택은 cardId 로 추적하므로(index 아님)
      // 같은 턴 안에서 배치로 손패가 바뀌어도 안전하다 — 실제로 그만큼 남아 있지 않으면 PASS 시점에
      // 엔진이 거부한다.
      // 이번 턴에 처음 배치가 성립했으면 손패가 밀리므로 선택도 함께 푼다
      selectedHandIndex: turnChanged || placedNow(prev.state, state, you) ? null : prev.selectedHandIndex,
      pendingPos: turnChanged || placedNow(prev.state, state, you) ? null : prev.pendingPos,
      discardMode: turnChanged ? false : prev.discardMode,
      discardCardIds: turnChanged ? [] : prev.discardCardIds,
      cardModal: turnChanged ? null : prev.cardModal,
      sending: false,
    });
  },

  setConnection: (connection) => set({ connection }),

  dispatch: (action) => {
    const { mode, state, room, sending } = get();
    if (!state) return;
    if (mode === 'online') {
      if (!room || sending) return;
      set({ sending: true });
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
    const turnChanged = next.turn !== state.turn || next.phase !== state.phase;
    set({
      state: maskState(next, null),
      viewerId: next.currentPlayerId ?? get().viewerId,
      selectedHandIndex: turnChanged || action.type === 'PLACE' ? null : get().selectedHandIndex,
      pendingPos: null,
      discardMode: turnChanged ? false : get().discardMode,
      discardCardIds: turnChanged ? [] : get().discardCardIds,
      notice: null,
      cardModal: null,
      handoffPending: viewerChanged && next.phase === 'playing',
    });
  },

  placeAt: (x, y) => {
    const { state, viewerId, selectedHandIndex, dispatch, setNotice } = get();
    if (!state || !viewerId) return;
    // 마커가 있는 칸을 탭하면 배치 대신 정보를 보여 준다. 카드를 안 골랐을 때 빈 칸을 탭하면 정보를 닫는다
    const marker = state.markers.find((m) => m.pos.x === x && m.pos.y === y);
    if (marker || selectedHandIndex === null) {
      set({ inspectedMarkerId: marker && marker.id !== get().inspectedMarkerId ? marker.id : null });
      return;
    }
    set({ inspectedMarkerId: null });
    const cardId = state.players.find((p) => p.id === viewerId)?.hand[selectedHandIndex];
    if (!cardId) return;
    const err = validatePlacement(state, viewerId, cardId, { x, y });
    if (err) {
      setNotice(err.message);
      return;
    }
    // 같은 후보 칸을 다시 탭하면 후보를 거둔다. 다른 칸이면 후보를 옮긴다. 실제 배치는 confirmPlacement
    const cur = get().pendingPos;
    set({ pendingPos: cur && cur.x === x && cur.y === y ? null : { x, y }, notice: null });
  },

  confirmPlacement: () => {
    const { state, viewerId, selectedHandIndex, pendingPos, dispatch, setNotice } = get();
    if (!state || !viewerId || selectedHandIndex === null || !pendingPos) return;
    const cardId = state.players.find((p) => p.id === viewerId)?.hand[selectedHandIndex];
    if (!cardId) return;
    const err = validatePlacement(state, viewerId, cardId, pendingPos);
    if (err) {
      set({ pendingPos: null });
      setNotice(err.message);
      return;
    }
    dispatch({ type: 'PLACE', playerId: viewerId, cardId, pos: pendingPos });
  },

  cancelPlacement: () => set({ pendingPos: null }),

  pass: () => {
    // dispatch 결과(성공/실패)를 기다리지 않고 여기서 먼저 선택을 지우면, 서버 거부·통신 실패 시
    // 사용자가 무엇을 골랐었는지 알 길 없이 선택만 사라진다 — 리셋은 성공 경로(dispatch 안의
    // applySnapshot/핫시트 성공 분기)에만 맡긴다.
    const { viewerId, discardCardIds, dispatch } = get();
    if (!viewerId) return;
    dispatch({ type: 'PASS', playerId: viewerId, ...(discardCardIds.length > 0 ? { discardCardIds } : {}) });
  },

  // discardMode 를 끌 때는 선택을 지우지 않는다 — 배치 모드로 잠깐 돌아갔다 와도 고른 카드가 유지된다.
  // 켤 때만 배치용 선택(selectedHandIndex)과 겹치지 않게 지운다.
  toggleDiscardMode: () =>
    set((s) => ({ discardMode: !s.discardMode, selectedHandIndex: s.discardMode ? s.selectedHandIndex : null, pendingPos: null })),

  setDiscardCard: (cardId, willSelect) =>
    set((s) => {
      if (willSelect) return { discardCardIds: [...s.discardCardIds, cardId] };
      const next = [...s.discardCardIds];
      const idx = next.indexOf(cardId);
      if (idx !== -1) next.splice(idx, 1);
      return { discardCardIds: next };
    }),

  surrender: () => {
    const { viewerId, dispatch } = get();
    if (viewerId) dispatch({ type: 'SURRENDER', playerId: viewerId });
  },

  openCardModal: (target) => set({ cardModal: target }),
  closeCardModal: () => set({ cardModal: null }),
  acknowledgeHandoff: () => set({ handoffPending: false }),

  setTab: (tab) => {
    if (get().tab !== tab) set({ tab });
  },

  selectHandCard: (index) => {
    if (!selectIsMyTurn(get())) return;
    set({ selectedHandIndex: index, pendingPos: null, notice: null });
  },
  setNotice: (message) => set({ notice: message }),
  clearNotice: () => set({ notice: null }),
  dismissResult: () => set({ resultDismissed: true }),
  reset: () => set({ ...EMPTY }),
}));

// ---------------------------------------------------------------------------
// 선택자 (컴포넌트는 필요한 조각만 구독한다)
// ---------------------------------------------------------------------------

/** 직전 스냅샷에서는 아직 안 놓았고 지금은 놓은 상태인가 (내 배치가 방금 성립) */
function placedNow(prev: MaskedGameState | null, next: MaskedGameState, you: PlayerId): boolean {
  const was = prev?.players.find((p) => p.id === you)?.actedThisTurn ?? false;
  const is = next.players.find((p) => p.id === you)?.actedThisTurn ?? false;
  return !was && is;
}

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
