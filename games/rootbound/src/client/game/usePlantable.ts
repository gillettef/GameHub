import { useMemo } from 'react';
import { legalPlantCells, posKey } from '../../engine';
import { findMe, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { asState } from './derived';

/**
 * 손패 카드마다 심을 칸 key(개수 0 이면 그 카드는 음영 + 고르기 잠금)와, 손패 어느 카드로든 심을 수 있는 칸.
 * 보드(③)와 내 카드(④)가 함께 쓴다. 상태가 바뀔 때만 계산한다(엔진 legalPlantCells 그대로)
 */
export function usePlantable(): { perCard: Set<string>[]; plantable: number[]; anyLegal: Set<string> } {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  return useMemo(() => {
    const anyLegal = new Set<string>();
    if (!state?.board || !viewerId || state.phase !== 'playing') return { perCard: [] as Set<string>[], plantable: [] as number[], anyLegal };
    const s = asState(state);
    const hand = findMe(state, viewerId)?.hand ?? [];
    const cellsByCard = hand.map((sp) => legalPlantCells(s, viewerId, sp));
    const perCard = cellsByCard.map((cells) => new Set(cells.map(posKey)));
    for (const keys of perCard) for (const k of keys) anyLegal.add(k);
    return { perCard, plantable: cellsByCard.map((cells) => cells.length), anyLegal };
  }, [state, viewerId]);
}
