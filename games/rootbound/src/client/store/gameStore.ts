/**
 * Zustand 전역 상태. 모든 탭이 필요한 데이터를 여기서 선로드해 두고 선택자로 좁게 구독한다 (F014).
 *
 * 진행은 공통 코드(@gamehub/net)가 맡는다: 한 기기(LocalGame)든 온라인(RoomClient)이든 화면은 좌석이 봐도 되는 상태(View)를 받아
 * applyView 로 여기에 넣고, 행동은 setSender 로 받은 함수로 보낸다(GameView.tsx 가 연결한다).
 *  - hotseat : 한 기기. 사람이 둘 이상이면 보는 사람이 바뀔 때 '기기 넘김'(handoffPending)이 다음 사람 손패를 가린다.
 *  - online  : 서버가 정본이다. 보낸 수가 반영된 상태가 올 때까지 연타를 막는다(sending).
 * 컴포넌트는 어느 모드든 같은 액션(confirmReveal·takeCard·selectHandCard·tapCell·confirmPlant·discard·surrender)만 쓴다.
 * 판 흐름 (Rules.md 4·5절): 이번 판 식물 공개(phase 'reveal') → 차례마다 가져오기(stage 'take') → 심기(stage 'plant').
 */
import { create } from 'zustand';
import type { Action, Direction, GoalId, MaskedGameState, PlayerId, Position, SpeciesId } from '../../engine';
import { getSpecies, legalPlantCells, legalSeedCells, posKey, samePos } from '../../engine';
import { asState } from '../game/derived';
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

/** 방 정보(화면용). 남은 시간은 받은 순간의 내 시계 기준이다 */
export interface RoomInfo {
  /** 접속 중인 사람 자리 (끊김 표시용) */
  connected: PlayerId[];
  /** 연속 시간 초과로 AI 가 대신 두는 사람 자리 (Rules.md 6.3) */
  autopilot: PlayerId[];
  /** 차례 제한 시간(초). null = 제한 없음 */
  turnTimeLimitSec: number | null;
  /** 지금 차례가 시간 초과되는 시각(내 시계 epoch ms). 시계가 없으면 null */
  turnDeadline: number | null;
  /** 이 정보를 받은 내 시계 시각 */
  serverNow: number;
}

/** 순서 = 메뉴 표시 순서. board 는 대국 화면 자체다 */
export const TABS: { id: TabId; label: string }[] = [
  { id: 'board', label: '골목' },
  { id: 'status', label: '점수' },
  { id: 'progress', label: '진행' },
  { id: 'cards', label: '타일' },
  { id: 'help', label: '설명' },
];

/** 화면이 받은 것 (GameView 가 RoomSnapshot<View> 에서 만든다) */
export interface ViewInput {
  mode: Mode;
  state: MaskedGameState;
  viewerId: PlayerId | null;
  room: RoomInfo;
  /** 한 기기에 사람이 둘 이상(돌려 하기): 보는 사람이 바뀌면 화면을 가린다 */
  hotseat: boolean;
  tutorial: boolean;
}

export interface GameStore {
  mode: Mode | null;
  state: MaskedGameState | null;
  /** 방 정보. 한 기기도 같은 모양(접속은 모두 켜짐, 제한 시간 없음) */
  room: RoomInfo | null;
  /** room 을 받은 내 시계 시각 */
  roomReceivedAt: number;
  /** 지금 화면을 보는 플레이어. 한 기기는 차례인 사람, 온라인은 나, 관전은 null */
  viewerId: PlayerId | null;
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
  hotseat: boolean;
  tutorial: boolean;
  /** 행동을 보내는 함수(엔진 행동 그대로, playerId 는 보내는 쪽이 뗀다) */
  sender: ((action: Action) => void) | null;

  applyView: (input: ViewInput) => void;
  setSender: (sender: ((action: Action) => void) | null) => void;
  /** 보낸 행동이 거절됐다(사유를 알린다) */
  rejected: (message: string) => void;
  dispatch: (action: Action) => void;
  selectHandCard: (index: number | null) => void;
  tapCell: (pos: Position) => void;
  setRotation: (d: Direction) => void;
  startSeedPick: () => void;
  clearSeed: () => void;
  confirmPlant: () => void;
  cancelPlant: () => void;
  /** 이번 판 식물 공개 단계의 "확인". 한 기기는 모두를 한 번에 확인한다(보내는 쪽이 처리) */
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
  tab: 'board' as TabId,
  ...CLEAR_SELECTION,
  showRootCounts: true,
  showLabels: false,
  notice: null,
  resultDismissed: false,
  cardModal: null as CardModalTarget | null,
  handoffPending: false,
  sending: false,
  hotseat: false,
  tutorial: false,
  sender: null,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...EMPTY,

  applyView: ({ mode, state, viewerId, room, hotseat, tutorial }) => {
    const prev = get();
    const p = prev.state;
    const moved = p?.turn !== state.turn || p?.phase !== state.phase || prev.viewerId !== viewerId;
    // 공개 단계 → 1라운드로 넘어가면 정원 화면으로
    const playStarted = p !== null && p.phase !== state.phase && state.phase === 'playing';
    // 접속·끊김처럼 게임 상태는 그대로인 알림이면 state 참조를 지켜 파생값 재계산과 보드 재그리기를 피한다
    const same =
      p !== null &&
      !moved &&
      p.log.length === state.log.length &&
      p.plants.length === state.plants.length &&
      p.market.length === state.market.length &&
      p.players.every((x, i) => x.isReady === state.players[i]?.isReady && x.surrenderedOrder === state.players[i]?.surrenderedOrder) &&
      p.players.length === state.players.length;
    // 한 기기 돌려 하기: 진행 중에 보는 사람이 바뀌면(다음 사람 차례) 손패를 가린다.
    // 공개 단계에는 차례가 없으므로 넘기지 않는다(모두 확인하고 1라운드가 열릴 때도 가리지 않는다: 첫 차례는 자리 0)
    const handoff = hotseat && state.phase === 'playing' && p?.phase === 'playing' && prev.viewerId !== null && viewerId !== prev.viewerId;
    set({
      mode,
      room,
      roomReceivedAt: room.serverNow,
      ...(same ? {} : { state }),
      viewerId,
      hotseat,
      tutorial,
      handoffPending: hotseat && state.phase === 'playing' && (handoff || prev.handoffPending),
      ...(moved ? CLEAR_SELECTION : {}),
      ...(playStarted
        ? { tab: 'board' as TabId, cardModal: null }
        : { cardModal: moved && (prev.cardModal?.kind === 'hand' || prev.cardModal?.kind === 'market' || prev.cardModal?.kind === 'pile') ? null : prev.cardModal }),
      // 내가 보낸 수가 반영된 상태(바뀐 것)가 와야 연타 잠금을 푼다. 거절은 rejected 가 푼다
      sending: same ? prev.sending : false,
    });
  },

  setSender: (sender) => set({ sender }),

  rejected: (message) => set({ notice: message, sending: false }),

  dispatch: (action) => {
    const { mode, state, sending, sender } = get();
    if (!state || !sender || sending) return;
    if (mode === 'online') {
      set({ sending: true });
      // 답이 오지 않으면(연결이 끊긴 사이 등) 잠금을 풀어 다시 누를 수 있게 한다
      window.setTimeout(() => {
        if (get().sending && get().state === state) set({ sending: false });
      }, 5000);
    }
    sender(action);
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
        set({ notice: '멀리 보내는 고양이는 놓을 칸에서 두 칸 안, 개울·공사장·아지트가 아닌 칸에만 보낼 수 있습니다' });
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
        set({ notice: '먼저 아래 내 타일에서 놓을 타일을 고르세요' });
        return;
      }
    }
    if (!species || occupied) {
      // 타일을 안 골랐거나 명당·아지트 칸이면 그 칸을 크게 보여 준다
      set({ cardModal: { kind: 'cell', pos } });
      return;
    }
    if (!legalPlantCells(s, viewerId, species).some((p) => samePos(p, pos))) {
      set({ notice: getSpecies(species).pondPlanting ? '내 칸, 내 칸·아지트와 맞닿은 빈 칸, 개울 옆 빈 칸에만 놓을 수 있습니다' : '내 칸이나 내 칸·아지트와 맞닿은 빈 칸에만 놓을 수 있습니다' });
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
    const { state, viewerId, dispatch } = get();
    if (!state || !viewerId || state.phase !== 'reveal') return;
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
  reset: () => set({ ...EMPTY }),
}));
