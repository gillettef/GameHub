/**
 * Zustand 전역 상태. 모든 탭이 필요한 데이터를 여기서 선로드해 두고 선택자로 좁게 구독한다 (F014).
 *
 * 두 모드:
 *  - hotseat : 한 기기에서 번갈아 둔다. 규칙은 shared 엔진이 계산하고, 진행 중 차례가 넘어가면
 *              '기기 넘김' 오버레이(handoffPending)가 다음 사람 손패를 가린다. 튜토리얼은 봇 자리(botIds)가 있다.
 *  - online  : 서버가 정본이다. 액션은 소켓으로 보내고, 상태는 서버가 보낸 스냅샷(가려진 상태)으로만 덮어쓴다.
 * 컴포넌트는 어느 모드든 같은 액션(confirmReveal·takeCard·selectHandCard·tapCell·confirmPlant·discard·surrender)만 쓴다.
 * 판 흐름 (Rules.md 4·5절): 이번 판 식물 공개(phase 'reveal') → 차례마다 가져오기(stage 'take') → 심기(stage 'plant').
 */
import { create } from 'zustand';
import type { Action, Direction, GameState, GoalId, MaskedGameState, PlayerId, Position, RoomInfo, RoomSnapshot, SpeciesId } from '@rootbound/shared';
import { applyAction, getSpecies, legalPlantCells, legalSeedCells, maskState, posKey, samePos } from '@rootbound/shared';
import { asState } from '../game/derived';
import { confirmAllHotseat, createHotseatGame, hotseatPlayerId, type HotseatConfig } from '../game/hotseat';
import { api } from '../socket/client';
import { createHotseatDriver } from './hotseatDriver';
import { findMe, selectCanPlant, selectCanTake } from './selectors';

// 선택자는 store/selectors.ts. 기존 import 경로('../store/gameStore')를 지키려고 다시 내보낸다
export * from './selectors';

type Mode = 'hotseat' | 'online';
export type TabId = 'board' | 'status' | 'progress' | 'cards' | 'help';
/** 확대해서 볼 것: 손패 카드(index), 마켓 카드(index, 내 가져오기 차례), 카드 더미 뒷면(내 가져오기 차례), 카탈로그의 종, 목표 카드, 보드의 칸 */
type CardModalTarget =
  | { kind: 'hand'; index: number }
  | { kind: 'market'; index: number }
  | { kind: 'pile' }
  | { kind: 'species'; species: SpeciesId }
  | { kind: 'goal'; goal: GoalId }
  | { kind: 'cell'; pos: Position };
type Connection = 'idle' | 'connecting' | 'connected' | 'disconnected';

/** 순서 = 하단 독 표시 순서 */
export const TABS: { id: TabId; label: string }[] = [
  { id: 'board', label: '정원' },
  { id: 'status', label: '점수' },
  { id: 'progress', label: '진행' },
  { id: 'cards', label: '카드' },
  { id: 'help', label: '설명' },
];

export interface GameStore {
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
  /** 뿌리 모양 회전 (0~5) */
  pendingRotation: Direction;
  /** 민들레 씨앗 칸 */
  pendingSeed: Position | null;
  /** 보드 탭이 씨앗 칸 고르기 모드인가 */
  seedPicking: boolean;
  /** 칸마다 뿌리(큐브) 수 표시 */
  showRootCounts: boolean;
  /** 칸마다 칸 이름(C4) 표시. 게임 기록의 칸을 찾을 때 켠다 */
  showLabels: boolean;
  notice: string | null;
  resultDismissed: boolean;
  cardModal: CardModalTarget | null;
  handoffPending: boolean;
  sending: boolean;
  /** 핫시트에서 브라우저 봇이 두는 자리 (튜토리얼) */
  botIds: PlayerId[];
  tutorial: boolean;

  startHotseat: (config: HotseatConfig) => void;
  startTutorial: (nickname: string) => void;
  applySnapshot: (snapshot: RoomSnapshot) => void;
  setConnection: (connection: Connection) => void;
  dispatch: (action: Action) => void;
  selectHandCard: (index: number | null) => void;
  tapCell: (pos: Position) => void;
  setRotation: (d: Direction) => void;
  startSeedPick: () => void;
  clearSeed: () => void;
  confirmPlant: () => void;
  cancelPlant: () => void;
  /** 이번 판 식물 공개 단계의 "확인". 한 기기는 모두를 한 번에 확인한다 */
  confirmReveal: () => void;
  /** 가져오기 차례에 마켓 index 번 카드, 또는 'pile' = 카드 더미 맨 위 1장을 가져온다 (TAKE) */
  takeCard: (index: number | 'pile') => void;
  discard: (species: SpeciesId) => void;
  surrender: () => void;
  openCardModal: (target: CardModalTarget) => void;
  closeCardModal: () => void;
  acknowledgeHandoff: () => void;
  setTab: (tab: TabId) => void;
  toggleRootCounts: () => void;
  toggleLabels: () => void;
  setNotice: (message: string) => void;
  clearNotice: () => void;
  dismissResult: () => void;
  reset: () => void;
}

const CLEAR_SELECTION = { selectedHandIndex: null, pendingPos: null, pendingRotation: 0 as Direction, pendingSeed: null, seedPicking: false } as const;

const EMPTY = {
  mode: null,
  state: null,
  room: null,
  roomReceivedAt: 0,
  viewerId: null,
  connection: 'idle' as Connection,
  tab: 'board' as TabId,
  ...CLEAR_SELECTION,
  showRootCounts: true,
  showLabels: false,
  notice: null,
  resultDismissed: false,
  cardModal: null as CardModalTarget | null,
  handoffPending: false,
  sending: false,
  botIds: [] as PlayerId[],
  tutorial: false,
};

/** 튜토리얼 고정 설정 */
const TUTORIAL_SEED = 20261007;

// 핫시트 구동(store/hotseatDriver.ts). useGameStore 는 아래에서 만들어지므로 접근자로 늦게 읽는다
const hotseat = createHotseatDriver(() => useGameStore, CLEAR_SELECTION);

export const useGameStore = create<GameStore>((set, get) => ({
  ...EMPTY,

  startHotseat: (config) => {
    const state = createHotseatGame(config);
    // 공개 단계에는 차례가 없으므로 자리 0이 화면을 본다(공개 정보만 보이고 손 카드는 보여 주지 않는다)
    set({ ...EMPTY, mode: 'hotseat', state: maskState(state, null), viewerId: state.currentPlayerId ?? hotseatPlayerId(0) });
  },

  startTutorial: (nickname) => {
    const state = createHotseatGame({ nicknames: [nickname.trim() || '나', '연습 봇'], seed: TUTORIAL_SEED });
    set({ ...EMPTY, mode: 'hotseat', state: maskState(state, null), viewerId: hotseatPlayerId(0), botIds: [hotseatPlayerId(1)], tutorial: true });
    if (state.currentPlayerId === hotseatPlayerId(1)) hotseat.scheduleBot();
  },

  applySnapshot: ({ room, state, you }) => {
    const prev = get();
    const p = prev.state;
    const moved = p?.turn !== state.turn || p?.phase !== state.phase;
    // 대기실 → 공개 단계, 공개 단계 → 1라운드로 넘어가면 정원 탭으로
    const playStarted = p !== null && p.phase !== state.phase && (state.phase === 'reveal' || state.phase === 'playing');
    // 접속·끊김처럼 게임 상태는 그대로인 브로드캐스트면 state 참조를 지켜 파생값 재계산과 보드 재그리기를 피한다
    const same =
      p !== null &&
      prev.mode === 'online' &&
      !moved &&
      p.log.length === state.log.length &&
      p.plants.length === state.plants.length &&
      p.market.length === state.market.length &&
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
      // 대기실에서 판이 시작되면 정원 탭으로 데려간다. 다른 탭을 보던 사람이 첫 차례를 놓치지 않게(2026-10-08 운영 기록)
      ...(playStarted ? { tab: 'board' as TabId, cardModal: null } : { cardModal: moved && (prev.cardModal?.kind === 'hand' || prev.cardModal?.kind === 'market' || prev.cardModal?.kind === 'pile') ? null : prev.cardModal }),
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
      void api.sendAction(room.roomId, action, state.turn).then((res) => {
        if (!res.ok) set({ notice: res.message, sending: false });
      });
      return;
    }
    // 핫시트에서는 서버 검증 = 엔진 검증. 거부되면 error 만 채워지고 state 는 그대로다
    hotseat.commit(applyAction(asState(state), action));
  },

  selectHandCard: (index) => {
    if (!selectCanPlant(get())) return;
    set({ ...CLEAR_SELECTION, selectedHandIndex: index, notice: null });
  },

  tapCell: (pos) => {
    const { state, viewerId, selectedHandIndex, pendingPos, seedPicking } = get();
    if (!state?.board || !viewerId) return;
    const s = asState(state);
    if (seedPicking && pendingPos) {
      if (!legalSeedCells(s, pendingPos).some((p) => samePos(p, pos))) {
        set({ notice: '씨앗은 심을 칸에서 두 칸 안, 연못·바위·입구가 아닌 칸에만 놓을 수 있습니다' });
        return;
      }
      set({ pendingSeed: pos, seedPicking: false, notice: null });
      return;
    }
    const species = selectedHandIndex !== null ? findMe(state, viewerId)?.hand[selectedHandIndex] : undefined;
    const occupied = s.plants.some((p) => samePos(p.pos, pos)) || s.board!.entrances.some((e) => samePos(e, pos));
    if (!species && !occupied && selectCanPlant(get())) {
      const hand = findMe(state, viewerId)?.hand ?? [];
      if (hand.some((sp) => legalPlantCells(s, viewerId, sp).some((p) => samePos(p, pos)))) {
        set({ notice: '먼저 아래 내 카드에서 심을 카드를 고르세요' });
        return;
      }
    }
    if (!species || occupied) {
      // 카드를 안 골랐거나 식물·입구 칸이면 그 칸을 크게 보여 준다
      set({ cardModal: { kind: 'cell', pos } });
      return;
    }
    if (!legalPlantCells(s, viewerId, species).some((p) => samePos(p, pos))) {
      set({ notice: getSpecies(species).pondPlanting ? '내 땅, 내 땅과 맞닿은 빈 칸, 연못 옆 빈 칸에만 심을 수 있습니다' : '내 땅이나 내 땅과 맞닿은 빈 칸에만 심을 수 있습니다' });
      return;
    }
    if (pendingPos && posKey(pendingPos) === posKey(pos)) {
      set({ pendingPos: null, pendingSeed: null });
      return;
    }
    // 회전은 칸을 옮겨도 그대로 둔다(같은 모양으로 여러 칸을 비교할 수 있게)
    set({ pendingPos: pos, pendingSeed: null, notice: null });
  },

  setRotation: (d) => set({ pendingRotation: d }),
  startSeedPick: () => set({ seedPicking: true, pendingSeed: null }),
  clearSeed: () => set({ seedPicking: false, pendingSeed: null }),

  confirmPlant: () => {
    const { state, viewerId, selectedHandIndex, pendingPos, pendingRotation, pendingSeed, dispatch } = get();
    if (!state || !viewerId || selectedHandIndex === null || !pendingPos) return;
    const species = findMe(state, viewerId)?.hand[selectedHandIndex];
    if (!species) return;
    const sp = getSpecies(species);
    dispatch({
      type: 'PLANT',
      playerId: viewerId,
      species,
      pos: pendingPos,
      rotation: pendingRotation,
      ...(sp.seed && pendingSeed ? { seed: pendingSeed } : {}),
    });
  },

  cancelPlant: () => set({ pendingPos: null, pendingSeed: null, seedPicking: false }),

  confirmReveal: () => {
    const { mode, state, viewerId, dispatch } = get();
    if (!state || !viewerId || state.phase !== 'reveal') return;
    if (mode === 'hotseat') {
      hotseat.commit(confirmAllHotseat(asState(state)));
      return;
    }
    dispatch({ type: 'CONFIRM', playerId: viewerId });
  },

  takeCard: (index) => {
    const { state, viewerId, dispatch } = get();
    if (!state || !viewerId || !selectCanTake(get())) return;
    if (index === 'pile' ? state.pileCount === 0 : index < 0 || index >= state.market.length) return;
    dispatch({ type: 'TAKE', playerId: viewerId, take: index });
  },

  discard: (species) => {
    const { viewerId, dispatch } = get();
    if (!viewerId || !selectCanPlant(get())) return;
    dispatch({ type: 'DISCARD', playerId: viewerId, species });
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
  toggleRootCounts: () => set((s) => ({ showRootCounts: !s.showRootCounts })),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  setNotice: (message) => set({ notice: message }),
  clearNotice: () => set({ notice: null }),
  dismissResult: () => set({ resultDismissed: true }),
  reset: () => {
    hotseat.cancelBot();
    set({ ...EMPTY });
  },
}));
