import { memo, useCallback, useMemo } from 'react';
import type { MaskedGameState } from '../../engine';
import { legalCallCells, legalSeedCells, posKey, samePos } from '../../engine';
import { CallBar } from '../components/CallBar';
import { GoalList } from '../components/GoalList';
import { Hand } from '../components/Hand';
import { HexBoard } from '../components/HexBoard';
import { Market } from '../components/Market';
import { PlantBar } from '../components/PlantBar';
import { RevealPanel } from '../components/RevealPanel';
import { asState, buildCells, previewCall, previewPlant } from '../game/derived';
import { usePlantable } from '../game/usePlantable';
import { selectCanCall, selectCanPlant, selectSelectedSpecies, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './BoardTab.module.css';

/** 놓기 미리보기. 보드(③)와 놓기 확인 바(④)가 같은 값을 쓴다 */
function usePreview() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const species = useGameStore(selectSelectedSpecies);
  const pendingPos = useGameStore((s) => s.pendingPos);
  const pendingRotation = useGameStore((s) => s.pendingRotation);
  const pendingSeed = useGameStore((s) => s.pendingSeed);
  return useMemo(
    () =>
      state && viewerId && species && pendingPos ? previewPlant(state, viewerId, species, pendingPos, pendingRotation, pendingSeed) : null,
    [state, viewerId, species, pendingPos, pendingRotation, pendingSeed],
  );
}

/** 명당 부르기 미리보기와, 방향을 바꾼 명당을 그린 상태 */
function useCallPreview() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const canCall = useGameStore(selectCanCall);
  const pos = useGameStore((s) => s.callPos);
  const rotation = useGameStore((s) => s.callRotation);
  return useMemo(() => {
    if (!state?.board || !viewerId || !canCall || !pos) return { preview: null, shown: null };
    const shown: MaskedGameState = { ...state, plants: state.plants.map((p) => (samePos(p.pos, pos) ? { ...p, rotation } : p)) };
    return { preview: previewCall(state, viewerId, pos, rotation), shown };
  }, [state, viewerId, canCall, pos, rotation]);
}

/**
 * ③ 골목 보드 (F008, F009): 소문(목표) 카드 축소판 → 보드(남는 높이 전부).
 * 이번 판 명당 공개 단계에는 보드 대신 공개 화면(RevealPanel)을 보여 준다.
 */
export const BoardArea = memo(function BoardArea() {
  const state = useGameStore(selectState);
  const species = useGameStore(selectSelectedSpecies);
  const selectedIndex = useGameStore((s) => s.selectedHandIndex);
  const pendingPos = useGameStore((s) => s.pendingPos);
  const pendingSeed = useGameStore((s) => s.pendingSeed);
  const seedPicking = useGameStore((s) => s.seedPicking);
  const showRootCounts = useGameStore((s) => s.showRootCounts);
  const showLabels = useGameStore((s) => s.showLabels);
  const tapCell = useGameStore((s) => s.tapCell);
  const canPlant = useGameStore(selectCanPlant);
  const canCall = useGameStore(selectCanCall);
  const viewerId = useGameStore(selectViewerId);
  const callPos = useGameStore((s) => s.callPos);
  const { perCard, anyLegal } = usePlantable();
  const plantPreview = usePreview();
  const call = useCallPreview();
  const calling = canCall && !!callPos;
  const preview = calling ? call.preview : plantPreview;

  const shownState = call.shown ?? state;
  const cells = useMemo(() => (shownState ? buildCells(shownState) : []), [shownState]);
  // 고른 타일은 그 타일로 놓을 칸. 고르기 전에는 손 전체로 놓을 수 있는 칸과 부를 수 있는 내 칸 위 명당을 옅게
  // (첫 차례에 어디를 눌러야 할지 바로 보이게). 명당을 부르는 중이면 부를 수 있는 명당
  const callable = useMemo(
    () => (state?.board && viewerId && canCall ? legalCallCells(asState(state), viewerId).map(posKey) : []),
    [state, viewerId, canCall],
  );
  const legal = useMemo(() => {
    if (!state?.board || !viewerId || !canPlant || seedPicking) return new Set<string>();
    if (calling) return new Set(callable);
    if (species && selectedIndex !== null) return perCard[selectedIndex] ?? new Set<string>();
    return callable.length ? new Set([...anyLegal, ...callable]) : anyLegal;
  }, [state, viewerId, calling, callable, canPlant, species, selectedIndex, seedPicking, perCard, anyLegal]);
  const pendingKey = calling && callPos ? posKey(callPos) : pendingPos ? posKey(pendingPos) : null;
  const markKey = pendingSeed ? posKey(pendingSeed) : null;
  const seedLegal = useMemo(
    () => (state?.board && seedPicking && pendingPos ? new Set(legalSeedCells(asState(state), pendingPos).map(posKey)) : undefined),
    [state, seedPicking, pendingPos],
  );
  const onCellClick = useCallback((q: number, r: number) => tapCell({ q, r }), [tapCell]);

  if (!state) return null;
  if (state.phase === 'reveal') return <RevealPanel />;
  if (!state.board) return null;

  return (
    <div className={styles.root}>
      <div className={styles.goals}>
        <GoalList goals={state.goals} compact />
      </div>
      <div className={styles.boardArea} data-compact>
        <HexBoard
          cells={cells}
          legal={legal}
          legalFaint={canPlant && !species && !calling}
          seedLegal={seedLegal}
          pendingKey={pendingKey}
          seedKey={markKey}
          preview={preview}
          showRootCounts={showRootCounts}
          showLabels={showLabels}
          onCellClick={onCellClick}
        />
      </div>
    </div>
  );
});

/**
 * ④ 내 영역: 펼친 타일(가져오기) · 내 타일 · 놓기 확인 바(방향·멀리 보내기·예상 결과) · 명당 부르기 바.
 * 행동 고르기 단계에는 펼친 타일·주머니(가져오기), 내 타일 → 보드 칸(놓기), 보드의 내 칸 위 명당(부르기)을 모두 누를 수 있다.
 * 놓을 칸이나 부를 명당을 고르면 펼친 타일 대신 확인 바가 나온다(Rules.md 5.1).
 */
export const HandArea = memo(function HandArea() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const canPlant = useGameStore(selectCanPlant);
  const canCall = useGameStore(selectCanCall);
  const callPos = useGameStore((s) => s.callPos);
  const pendingPos = useGameStore((s) => s.pendingPos);
  const { plantable } = usePlantable();
  const preview = usePreview();
  const call = useCallPreview();
  if (!state || state.phase !== 'playing') return null;
  return (
    <div className={styles.bottom}>
      {/* 놓을 칸·부를 명당을 고른 뒤에는 펼친 타일을 접어 보드 높이를 지킨다 */}
      {canCall && callPos ? (
        <CallBar preview={call.preview} />
      ) : canPlant && pendingPos ? (
        <PlantBar preview={preview} />
      ) : (
        <Market />
      )}
      {viewerId && (
        <div className={styles.handPanel}>
          <Hand plantable={plantable} canPlant={canPlant} />
        </div>
      )}
    </div>
  );
});
