/**
 * Zustand 전역 상태. 모든 탭이 필요한 데이터를 여기서 선로드해 두고 선택자로 좁게 구독한다 (F014).
 *
 * 두 모드:
 *  - hotseat : 한 기기에서 번갈아 둔다. 규칙은 shared 엔진이 계산하고, 진행 중 차례가 넘어가면
 *              '기기 넘김' 오버레이(handoffPending)가 다음 사람 손패를 가린다. 튜토리얼은 봇 좌석(botIds)이 있다.
 *  - online  : 서버가 정본이다. 액션은 소켓으로 보내고, 상태는 서버가 보낸 스냅샷(가려진 상태)으로만 덮어쓴다.
 * 컴포넌트는 어느 모드든 같은 액션(draft·tapCell·confirmPlant·discard·surrender)만 쓴다.
 */
import { create } from 'zustand';
import type { Action, Direction, MaskedGameState, PlayerId, Position, RoomInfo, RoomSnapshot, SpeciesId } from '@rootbound/shared';
import { getSpecies, legalPlantCells, legalSeedCells, maskState, posKey, samePos } from '@rootbound/shared';
import { asState, directionsFor } from '../game/derived';
import { applyHotseatAction, createHotseatGame, hotseatPlayerId, type HotseatConfig } from '../game/hotseat';
import { tutorialBotAction } from '../game/tutorialBot';
import { api } from '../socket/client';

export type Mode = 'hotseat' | 'online';
export type TabId = 'board' | 'status' | 'progress' | 'cards' | 'help';
/** 확대해서 볼 것: 손패 카드(index), 카탈로그의 종, 보드의 칸 */
export type CardModalTarget = { kind: 'hand'; index: number } | { kind: 'species'; species: SpeciesId } | { kind: 'cell'; pos: Position };
export type Connection = 'idle' | 'connecting' | 'connected' | 'disconnected';

/** 순서 = 하단 독 표시 순서 */
export const TABS: { id: TabId; label: string }[] = [
  { id: 'board', label: '정원' },
  { id: 'status', label: '점수' },
  { id: 'progress', label: '진행' },
  { id: 'cards', label: '카드' },
  { id: 'help', label: '설명' },
];

interface GameStore {
  mode: Mode | null;
  state: MaskedGameState | null;
  /** 온라인 방 정보. 핫시트는 null */
  room: RoomInfo | null;
  /** room 을 받은 내 시계 시각(lib/turnClock.ts 가 서버 시계 차이를 보정) */
  roomReceivedAt: number;
  /** 지금 화면을 보는 플레이어. 핫시트는 차례인 사람, 온라인은 나 */
  viewerId: PlayerId | null;
  connection: Connection;
  tab: TabId;
  /** 고른 손패 카드 index */
  selectedHandIndex: number | null;
  /** 심을 후보 칸. 고르면 곧바로 심지 않고 미리보기를 보여 준다 */
  pendingPos: Position | null;
  /** 칡 방향 */
  pendingDirection: Direction | null;
  /** 민들레 씨앗 칸 */
  pendingSeed: Position | null;
  /** 보드 탭이 씨앗 칸 고르기 모드인가 */
  seedPicking: boolean;
  /** 영향력 숫자 표시 */
  showInfluence: boolean;
  notice: string | null;
  resultDismissed: boolean;
  cardModal: CardModalTarget | null;
  handoffPending: boolean;
  sending: boolean;
  /** 핫시트에서 브라우저 봇이 두는 좌석 (튜토리얼) */
  botIds: PlayerId[];
  tutorial: boolean;

  startHotseat: (config: HotseatConfig) => void;
  startTutorial: (nickname: string) => void;
  applySnapshot: (snapshot: RoomSnapshot) => void;
  setConnection: (connection: Connection) => void;
  dispatch: (action: Action) => void;
  draft: (species: SpeciesId) => void;
  selectHandCard: (index: number | null) => void;
  tapCell: (pos: Position) => void;
  setDirection: (d: Direction) => void;
  startSeedPick: () => void;
  clearSeed: () => void;
  confirmPlant: () => void;
  cancelPlant: () => void;
  discard: (species: SpeciesId) => void;
  surrender: () => void;
  openCardModal: (target: CardModalTarget) => void;
  closeCardModal: () => void;
  acknowledgeHandoff: () => void;
  setTab: (tab: TabId) => void;
  toggleInfluence: () => void;
  setNotice: (message: string) => void;
  clearNotice: () => void;
  dismissResult: () => void;
  reset: () => void;
}

const CLEAR_SELECTION = { selectedHandIndex: null, pendingPos: null, pendingDirection: null, pendingSeed: null, seedPicking: false } as const;

const EMPTY = {
  mode: null,
  state: null,
  room: null,
  roomReceivedAt: 0,
  viewerId: null,
  connection: 'idle' as Connection,
  tab: 'board' as TabId,
  ...CLEAR_SELECTION,
  showInfluence: false,
  notice: null,
  resultDismissed: false,
  cardModal: null as CardModalTarget | null,
  handoffPending: false,
  sending: false,
  botIds: [] as PlayerId[],
  tutorial: false,
};

/** 튜토리얼 고정 설정 */
export const TUTORIAL_SEED = 20261007;
const BOT_DELAY_MS = 900;
let botTimer: number | null = null;

export const useGameStore = create<GameStore>((set, get) => ({
  ...EMPTY,

  startHotseat: (config) => {
    const state = createHotseatGame(config);
    set({ ...EMPTY, mode: 'hotseat', state: maskState(state, null), viewerId: state.currentPlayerId });
  },

  startTutorial: (nickname) => {
    const state = createHotseatGame({ nicknames: [nickname.trim() || '나', '연습 봇'], seed: TUTORIAL_SEED });
    set({ ...EMPTY, mode: 'hotseat', state: maskState(state, null), viewerId: hotseatPlayerId(0), botIds: [hotseatPlayerId(1)], tutorial: true });
    if (state.currentPlayerId === hotseatPlayerId(1)) scheduleBot();
  },

  applySnapshot: ({ room, state, you }) => {
    const prev = get();
    const p = prev.state;
    const moved = p?.turn !== state.turn || p?.phase !== state.phase || p?.draftIndex !== state.draftIndex;
    const playStarted = p?.phase === 'drafting' && state.phase === 'playing';
    // 접속·끊김처럼 게임 상태는 그대로인 브로드캐스트면 state 참조를 지켜 파생값 재계산과 보드 재그리기를 피한다
    const same =
      p !== null &&
      prev.mode === 'online' &&
      !moved &&
      p.log.length === state.log.length &&
      p.plants.length === state.plants.length &&
      p.players.every((x, i) => x.isReady === state.players[i]?.isReady && x.surrenderedOrder === state.players[i]?.surrenderedOrder) &&
      p.players.length === state.players.length;
    set({
      mode: 'online',
      room,
      roomReceivedAt: Date.now(),
      ...(same ? {} : { state }),
      viewerId: you,
      connection: 'connected',
      tutorial: false,
      botIds: [],
      handoffPending: false,
      ...(moved ? CLEAR_SELECTION : {}),
      // 드래프트가 끝나 심기가 시작되면 정원 탭으로 데려간다. 드래프트 중 카드 탭을 보던 사람이 첫 차례를 놓치지 않게(2026-10-08 운영 기록)
      ...(playStarted ? { tab: 'board' as TabId, cardModal: null } : { cardModal: moved && prev.cardModal?.kind === 'hand' ? null : prev.cardModal }),
      // 내가 보낸 수가 반영된 스냅샷(상태가 바뀐 것)이 와야 연타 잠금을 푼다. 실패는 dispatch 가 푼다
      sending: same ? prev.sending : false,
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
      });
      return;
    }
    const result = applyHotseatAction(asState(state), action);
    if (result.error) {
      set({ notice: result.error });
      return;
    }
    const next = result.state;
    const { botIds, viewerId } = get();
    const botTurn = next.currentPlayerId !== null && botIds.includes(next.currentPlayerId) && next.phase !== 'finished';
    // 봇이 있으면(튜토리얼) 화면 주인은 그대로. 없으면 차례인 사람이 화면을 본다
    const nextViewer = botIds.length > 0 ? viewerId : (next.currentPlayerId ?? viewerId);
    // 진행 중에 보는 사람이 바뀌면 손패를 가려야 하므로 기기 넘김. 드래프트는 공개 정보라 넘김 없이 이어 둔다
    const handoff = botIds.length === 0 && next.phase === 'playing' && nextViewer !== viewerId;
    set({ state: maskState(next, null), viewerId: nextViewer, ...CLEAR_SELECTION, notice: null, cardModal: null, handoffPending: handoff });
    if (botTurn) scheduleBot();
  },

  draft: (species) => {
    const { viewerId, dispatch } = get();
    if (viewerId) dispatch({ type: 'DRAFT', playerId: viewerId, species });
  },

  selectHandCard: (index) => {
    if (!selectIsMyTurn(get())) return;
    set({ ...CLEAR_SELECTION, selectedHandIndex: index, notice: null });
  },

  tapCell: (pos) => {
    const { state, viewerId, selectedHandIndex, pendingPos, seedPicking } = get();
    if (!state?.board || !viewerId) return;
    const s = asState(state);
    if (seedPicking && pendingPos) {
      if (!legalSeedCells(s, pendingPos).some((p) => samePos(p, pos))) {
        set({ notice: '씨앗은 심을 칸에서 두 칸 이내 빈 칸에만 놓을 수 있습니다' });
        return;
      }
      set({ pendingSeed: pos, seedPicking: false, notice: null });
      return;
    }
    const species = selectedHandIndex !== null ? state.players.find((p) => p.id === viewerId)?.hand[selectedHandIndex] : undefined;
    const occupied = s.plants.some((p) => samePos(p.pos, pos)) || s.board!.entrances.some((e) => samePos(e, pos));
    if (!species && !occupied && selectIsMyTurn(get())) {
      const hand = state.players.find((p) => p.id === viewerId)?.hand ?? [];
      if (hand.some((sp) => legalPlantCells(s, viewerId, sp).some((p) => samePos(p, pos)))) {
        set({ notice: '먼저 아래 손패에서 심을 카드를 고르세요' });
        return;
      }
    }
    if (!species || occupied) {
      // 카드를 안 골랐거나 식물·입구 칸이면 그 칸을 크게 보여 준다
      set({ cardModal: { kind: 'cell', pos } });
      return;
    }
    if (!legalPlantCells(s, viewerId, species).some((p) => samePos(p, pos))) {
      set({ notice: getSpecies(species).pondPlanting ? '뿌리가 닿는 칸이나 연못 옆 빈 칸에만 심을 수 있습니다' : '내 뿌리가 닿는 빈 칸에만 심을 수 있습니다' });
      return;
    }
    if (pendingPos && posKey(pendingPos) === posKey(pos)) {
      set({ pendingPos: null, pendingDirection: null, pendingSeed: null });
      return;
    }
    const sp = getSpecies(species);
    set({ pendingPos: pos, pendingDirection: sp.line ? (directionsFor(state, pos)[0] ?? null) : null, pendingSeed: null, notice: null });
  },

  setDirection: (d) => set({ pendingDirection: d }),
  startSeedPick: () => set({ seedPicking: true, pendingSeed: null }),
  clearSeed: () => set({ seedPicking: false, pendingSeed: null }),

  confirmPlant: () => {
    const { state, viewerId, selectedHandIndex, pendingPos, pendingDirection, pendingSeed, dispatch } = get();
    if (!state || !viewerId || selectedHandIndex === null || !pendingPos) return;
    const species = state.players.find((p) => p.id === viewerId)?.hand[selectedHandIndex];
    if (!species) return;
    const sp = getSpecies(species);
    dispatch({
      type: 'PLANT',
      playerId: viewerId,
      species,
      pos: pendingPos,
      ...(sp.line && pendingDirection !== null ? { direction: pendingDirection } : {}),
      ...(sp.seed && pendingSeed ? { seed: pendingSeed } : {}),
    });
  },

  cancelPlant: () => set({ pendingPos: null, pendingDirection: null, pendingSeed: null, seedPicking: false }),

  discard: (species) => {
    const { viewerId, dispatch } = get();
    if (viewerId) dispatch({ type: 'DISCARD', playerId: viewerId, species });
  },

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
  toggleInfluence: () => set((s) => ({ showInfluence: !s.showInfluence })),
  setNotice: (message) => set({ notice: message }),
  clearNotice: () => set({ notice: null }),
  dismissResult: () => set({ resultDismissed: true }),
  reset: () => {
    if (botTimer !== null) window.clearTimeout(botTimer);
    botTimer = null;
    set({ ...EMPTY });
  },
}));

/** 봇 좌석 차례면 잠시 뒤 한 수를 둔다 (드래프트 포함) */
function scheduleBot(): void {
  if (botTimer !== null) window.clearTimeout(botTimer);
  botTimer = window.setTimeout(() => {
    botTimer = null;
    const { state, botIds, dispatch } = useGameStore.getState();
    const cur = state?.currentPlayerId;
    if (!state || !cur || !botIds.includes(cur) || state.phase === 'finished') return;
    const action = tutorialBotAction(asState(state), cur);
    if (action) dispatch(action);
  }, BOT_DELAY_MS);
}

// ---------------------------------------------------------------------------
// 선택자
// ---------------------------------------------------------------------------

export const selectState = (s: GameStore): MaskedGameState | null => s.state;
export const selectViewerId = (s: GameStore): PlayerId | null => s.viewerId;
export const selectTab = (s: GameStore): TabId => s.tab;
export const selectIsMyTurn = (s: GameStore): boolean =>
  s.state !== null && (s.state.phase === 'playing' || s.state.phase === 'drafting') && s.state.currentPlayerId === s.viewerId && !s.handoffPending && !s.sending;

/** 고른 손패 카드의 종 */
export const selectSelectedSpecies = (s: GameStore): SpeciesId | null => {
  if (s.selectedHandIndex === null || !s.state || !s.viewerId) return null;
  return s.state.players.find((p) => p.id === s.viewerId)?.hand[s.selectedHandIndex] ?? null;
};
