import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Position } from '../../engine';
import { catMoveOf, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { fromChoices } from './derived';

/**
 * 데려올 칸 고르기 (Rules.md 6.2): 데려와야 하는 수와, 다음에 고를 수 있는 내 칸. 놓기 확인 바·부르기 바·보드가 함께 쓴다.
 * 고를 것이 없으면 need 0
 */
export function useFromChoices(): { need: number; eligible: Position[] } {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  // catMoveOf 는 매번 새 객체라 필드끼리 얕게 비교한다(칸 객체는 스토어의 같은 참조)
  const move = useGameStore(useShallow(catMoveOf));
  const fromPicks = useGameStore((s) => s.fromPicks);
  return useMemo(
    () => (state?.board && viewerId && move ? fromChoices(state, viewerId, move, fromPicks) : { need: 0, eligible: [] }),
    [state, viewerId, move, fromPicks],
  );
}
