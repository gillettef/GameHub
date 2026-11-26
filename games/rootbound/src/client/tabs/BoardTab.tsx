import { memo, useCallback, useMemo } from 'react';
import type { MaskedGameState } from '../../engine';
import { legalCallCells, legalMoveSources, legalMoveTargets, legalSeedCells, posKey, samePos } from '../../engine';
import { CallBar } from '../components/CallBar';
import { ChoreRow } from '../components/ChoreRow';
import { GoalList } from '../components/GoalList';
import { Hand } from '../components/Hand';
import { HexBoard } from '../components/HexBoard';
import { Market } from '../components/Market';
import { MoveBar } from '../components/MoveBar';
import { PlantBar } from '../components/PlantBar';
import { RevealPanel } from '../components/RevealPanel';
import { applyMoves, asState, buildCells, plantBonus, previewCall, previewMoves, previewPlant } from '../game/derived';
import { usePlantable } from '../game/usePlantable';
import { selectCanCall, selectCanMove, selectCanPlant, selectSelectedSpecies, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './BoardTab.module.css';

/** 놓기 미리보기(식빵 굽기면 놓은 칸 +1). 보드(③)와 놓기 확인 바(④)가 같은 값을 쓴다 */
function usePreview() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const species = useGameStore(selectSelectedSpecies);
  const pendingPos = useGameStore((s) => s.pendingPos);
  const pendingRotation = useGameStore((s) => s.pendingRotation);
  const pendingSeed = useGameStore((s) => s.pendingSeed);
  return useMemo(
    () =>
      state && viewerId && species && pendingPos ? previewPlant(state, viewerId, species, pendingPos, pendingRotation, pendingSeed, plantBonus(state, viewerId)) : null,
    [state, viewerId, species, pendingPos, pendingRotation, pendingSeed],
  );
}

/** 담 넘기 미리보기: 정한 이동 + 지금 이동(도착 칸까지 골랐으면) */
function useMovePreview() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const canMove = useGameStore(selectCanMove);
  const steps = useGameStore((s) => s.moveSteps);
  const from = useGameStore((s) => s.moveFrom);
  const to = useGameStore((s) => s.moveTo);
  const count = useGameStore((s) => s.moveCount);
  return useMemo(() => {
    if (!state?.board || !viewerId || !canMove) return null;
    const moves = from && to ? [...steps, { from, to, count }] : steps;
    return previewMoves(state, viewerId, moves);
  }, [state, viewerId, canMove, steps, from, to, count]);
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
  const canMove = useGameStore(selectCanMove);
  const canCall = useGameStore(selectCanCall);
  const viewerId = useGameStore(selectViewerId);
  const moveSteps = useGameStore((s) => s.moveSteps);
  const moveFrom = useGameStore((s) => s.moveFrom);
  const moveTo = useGameStore((s) => s.moveTo);
  const callPos = useGameStore((s) => s.callPos);
  const { perCard, anyLegal } = usePlantable();
  const plantPreview = usePreview();
  const movePreview = useMovePreview();
  const call = useCallPreview();
  const preview = canMove ? movePreview : canCall ? call.preview : plantPreview;

  const shownState = call.shown ?? state;
  const cells = useMemo(() => (shownState ? buildCells(shownState) : []), [shownState]);
  // 고른 타일은 그 타일로 놓을 칸, 고르기 전에는 손 전체로 놓을 수 있는 칸을 옅게(첫 차례에 어디를 눌러야 할지 바로 보이게).
  // 담 넘기는 출발 칸(내 칸) → 도착 칸(맞닿은 칸), 명당 부르기는 내 칸 위 명당
  const legal = useMemo(() => {
    if (!state?.board || !viewerId) return new Set<string>();
    if (canMove) {
      const base = applyMoves(state, viewerId, moveSteps);
      return new Set((moveFrom ? legalMoveTargets(base, moveFrom) : legalMoveSources(base, viewerId)).map(posKey));
    }
    if (canCall) return new Set(legalCallCells(asState(state), viewerId).map(posKey));
    if (!canPlant || seedPicking) return new Set<string>();
    return species && selectedIndex !== null ? (perCard[selectedIndex] ?? new Set<string>()) : anyLegal;
  }, [state, viewerId, canMove, canCall, moveSteps, moveFrom, canPlant, species, selectedIndex, seedPicking, perCard, anyLegal]);
  const pendingKey = canMove ? (moveFrom ? posKey(moveFrom) : null) : canCall ? (callPos ? posKey(callPos) : null) : pendingPos ? posKey(pendingPos) : null;
  const markKey = canMove ? (moveTo ? posKey(moveTo) : null) : pendingSeed ? posKey(pendingSeed) : null;
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
          legalFaint={canPlant && !species}
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
 * ④ 내 영역: 일과 고르기 줄 · 펼친 타일(가져오기) · 내 타일 · 놓기 확인 바(방향·멀리 보내기·예상 결과) · 담 넘기 바 · 명당 부르기 바.
 * 일과 고르기 차례에는 펼친 일과, 가져오기 차례에는 펼친 타일, 놓기 차례에는 내 타일·보드,
 * 담 넘기·명당 부르기 차례에는 보드와 그 바만 누를 수 있다(Rules.md 5절).
 */
export const HandArea = memo(function HandArea() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const canPlant = useGameStore(selectCanPlant);
  const canMove = useGameStore(selectCanMove);
  const canCall = useGameStore(selectCanCall);
  const pendingPos = useGameStore((s) => s.pendingPos);
  const { plantable } = usePlantable();
  const preview = usePreview();
  const movePreview = useMovePreview();
  const call = useCallPreview();
  if (!state || state.phase !== 'playing') return null;
  return (
    <div className={styles.bottom}>
      {/* 놓을 칸을 고른 뒤에는 펼친 타일을 접어 보드 높이를 지킨다(가져오기는 이미 끝났다) */}
      {state.stage === 'chore' ? (
        <ChoreRow />
      ) : canMove ? (
        <MoveBar preview={movePreview} />
      ) : canCall ? (
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
