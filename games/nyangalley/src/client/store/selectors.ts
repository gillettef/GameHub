/**
 * 스토어 선택자. 컴포넌트는 필요한 값만 좁게 구독한다 (F014).
 * gameStore 와 서로 import 하지만 여기서는 타입만 가져오므로 실행 순서 문제는 없다. 기존 경로를 위해 gameStore 가 다시 내보낸다.
 */
import type { MaskedGameState, PlayerId, SpeciesId } from '../../engine';
import { awaitingConfirm } from '../game/derived';
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
/** 내 차례(가져오기·심기 어느 단계든) */
export const selectIsMyTurn = (s: GameStore): boolean =>
  s.state !== null && s.state.phase === 'playing' && s.state.currentPlayerId === s.viewerId && !s.handoffPending && !s.sending;
/** 내 일과 고르기 차례 (Rules.md 5.1) */
export const selectCanPickChore = (s: GameStore): boolean => selectIsMyTurn(s) && s.state?.stage === 'chore';
/** 내 담 넘기 차례 (Rules.md 5.3) */
export const selectCanMove = (s: GameStore): boolean => selectIsMyTurn(s) && s.state?.stage === 'move';
/** 내 명당 부르기 차례 (Rules.md 5.3) */
export const selectCanCall = (s: GameStore): boolean => selectIsMyTurn(s) && s.state?.stage === 'call';
/** 내 가져오기 차례 (Rules.md 5절 1) */
export const selectCanTake = (s: GameStore): boolean => selectIsMyTurn(s) && s.state?.stage === 'take';
/** 내 심기 차례 (Rules.md 5절 2) */
export const selectCanPlant = (s: GameStore): boolean => selectIsMyTurn(s) && s.state?.stage === 'plant';
/** 공개 단계에서 내가 아직 확인하지 않았나 (Rules.md 4절 8) */
export const selectAwaitingMyConfirm = (s: GameStore): boolean => s.state !== null && awaitingConfirm(s.state, s.viewerId);

/** 고른 손패 카드의 종 */
export const selectSelectedSpecies = (s: GameStore): SpeciesId | null => {
  if (s.selectedHandIndex === null) return null;
  return selectMe(s)?.hand[s.selectedHandIndex] ?? null;
};
