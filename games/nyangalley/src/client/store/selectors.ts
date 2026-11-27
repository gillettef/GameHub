/**
 * 스토어 선택자. 컴포넌트는 필요한 값만 좁게 구독한다 (F014).
 * gameStore 와 서로 import 하지만 여기서는 타입만 가져오므로 실행 순서 문제는 없다. 기존 경로를 위해 gameStore 가 다시 내보낸다.
 */
import type { MaskedGameState, PlayerId, SpeciesId } from '../../engine';
import { actOptions, canTake, getSpecies, legalCallCells, type ActOptions } from '../../engine';
import { asState, awaitingConfirm, type CatMove } from '../game/derived';
import type { GameStore, TabId } from './gameStore';

type MaskedPlayer = MaskedGameState['players'][number];

/** 화면을 보는 사람의 플레이어 정보 (가려진 상태에서도 내 손 카드는 보인다) */
export const findMe = (state: MaskedGameState | null, viewerId: PlayerId | null): MaskedPlayer | undefined =>
  viewerId ? state?.players.find((p) => p.id === viewerId) : undefined;

export const selectState = (s: GameStore): MaskedGameState | null => s.state;
export const selectViewerId = (s: GameStore): PlayerId | null => s.viewerId;
export const selectTab = (s: GameStore): TabId => s.tab;
/** 내 플레이어 정보. state 가 바뀔 때만 새 참조가 된다 */
export const selectMe = (s: GameStore): MaskedPlayer | undefined => findMe(s.state, s.viewerId);
/** 내 차례(행동 고르기·가져오기 두 번째 어느 단계든) */
export const selectIsMyTurn = (s: GameStore): boolean =>
  s.state !== null && s.state.phase === 'playing' && s.state.currentPlayerId === s.viewerId && !s.handoffPending && !s.sending;
/** 내 행동 고르기 단계 (Rules.md 5.1) */
export const selectCanAct = (s: GameStore): boolean => selectIsMyTurn(s) && s.state?.stage === 'act';
/** 가져오기 두 번째 타일 단계 (Rules.md 5.1 1) */
export const selectTakingSecond = (s: GameStore): boolean => selectIsMyTurn(s) && s.state?.stage === 'take';
/** 행동 고르기 단계에서 아직 행동을 고르지 않았나(④ 행동 고르기 판을 보여 준다) */
export const selectChoosingAct = (s: GameStore): boolean => selectCanAct(s) && s.actMode === null;
/** 지금 타일 1개를 가져올 수 있나: '가져오기'를 고른 행동 고르기 단계(손 3장 미만) 또는 가져오기 두 번째 (Rules.md 5.1 1) */
export const selectCanTake = (s: GameStore): boolean =>
  ((selectCanAct(s) && s.actMode === 'take') || selectTakingSecond(s)) && !!s.state && !!s.viewerId && canTake(s.state, s.viewerId);
/** 지금 손 타일을 놓을(버릴) 수 있나: '놓기'를 고른 행동 고르기 단계 (Rules.md 5.1 2) */
export const selectCanPlant = (s: GameStore): boolean => selectCanAct(s) && s.actMode === 'plant';
/** 지금 명당을 부를 수 있나: '부르기'를 고른 행동 고르기 단계이고 내 칸 위 명당이 있다 (Rules.md 5.1 3) */
export const selectCanCall = (s: GameStore): boolean =>
  selectCanAct(s) && s.actMode === 'call' && !!s.state?.board && !!s.viewerId && legalCallCells(asState(s.state), s.viewerId).length > 0;
/** 이번 차례에 할 수 있는 행동 (행동 고르기 판의 버튼 활성). 엔진 actOptions 그대로. 매번 새 객체라 useGameStore 로 바로 구독하지 말 것(useMemo 로) */
export const selectActOptions = (s: Pick<GameStore, 'state' | 'viewerId'>): ActOptions | null =>
  s.state?.board && s.viewerId && s.state.phase === 'playing' ? actOptions(asState(s.state), s.viewerId) : null;
/** 공개 단계에서 내가 아직 확인하지 않았나 (Rules.md 4절 8) */
export const selectAwaitingMyConfirm = (s: GameStore): boolean => s.state !== null && awaitingConfirm(s.state, s.viewerId);

/** 고른 손패 카드의 종 */
export const selectSelectedSpecies = (s: GameStore): SpeciesId | null => {
  if (s.selectedHandIndex === null) return null;
  return selectMe(s)?.hand[s.selectedHandIndex] ?? null;
};

/**
 * 지금 확인 중인 고양이 앉히기(놓기 칸·방향·멀리 보내기 또는 부를 명당·방향). 없으면 null.
 * 매번 새 객체라 useGameStore 로 바로 구독하지 말 것(필드를 구독해 useMemo 로)
 */
export const catMoveOf = (s: GameStore): CatMove | null => {
  if (selectCanCall(s)) return s.callPos ? { kind: 'call', pos: s.callPos, rotation: s.callRotation } : null;
  const species = selectSelectedSpecies(s);
  if (!selectCanPlant(s) || !species || !s.pendingPos) return null;
  return { kind: 'plant', species, pos: s.pendingPos, rotation: s.pendingRotation, seed: getSpecies(species).seed ? s.pendingSeed : null };
};
