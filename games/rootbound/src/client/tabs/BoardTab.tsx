import { memo, useCallback, useMemo } from 'react';
import { legalSeedCells, posKey } from '../../engine';
import { GoalList } from '../components/GoalList';
import { Hand } from '../components/Hand';
import { HexBoard } from '../components/HexBoard';
import { Market } from '../components/Market';
import { PlantBar } from '../components/PlantBar';
import { RevealPanel } from '../components/RevealPanel';
import { asState, buildCells, previewPlant } from '../game/derived';
import { usePlantable } from '../game/usePlantable';
import { selectCanPlant, selectSelectedSpecies, selectState, selectViewerId, useGameStore } from '../store/gameStore';
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
    () => (state && viewerId && species && pendingPos ? previewPlant(state, viewerId, species, pendingPos, pendingRotation, pendingSeed) : null),
    [state, viewerId, species, pendingPos, pendingRotation, pendingSeed],
  );
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
  const { perCard, anyLegal } = usePlantable();
  const preview = usePreview();

  const cells = useMemo(() => (state ? buildCells(state) : []), [state]);
  // 고른 타일은 그 타일로 놓을 칸, 고르기 전에는 손 전체로 놓을 수 있는 칸을 옅게(첫 차례에 어디를 눌러야 할지 바로 보이게)
  const legal = useMemo(
    () => (!state || !canPlant || seedPicking ? new Set<string>() : species && selectedIndex !== null ? (perCard[selectedIndex] ?? new Set<string>()) : anyLegal),
    [state, canPlant, species, selectedIndex, seedPicking, perCard, anyLegal],
  );
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
          legalFaint={!species}
          seedLegal={seedLegal}
          pendingKey={pendingPos ? posKey(pendingPos) : null}
          seedKey={pendingSeed ? posKey(pendingSeed) : null}
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
 * ④ 내 영역: 펼친 타일(가져오기) · 내 타일 · 놓기 확인 바(방향·멀리 보내기·예상 결과).
 * 가져오기 차례에는 펼친 타일만, 놓기 차례에는 내 타일·보드만 누를 수 있다(Rules.md 5절).
 */
export const HandArea = memo(function HandArea() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const canPlant = useGameStore(selectCanPlant);
  const pendingPos = useGameStore((s) => s.pendingPos);
  const { plantable } = usePlantable();
  const preview = usePreview();
  if (!state || state.phase !== 'playing') return null;
  return (
    <div className={styles.bottom}>
      {/* 놓을 칸을 고른 뒤에는 펼친 타일을 접어 보드 높이를 지킨다(가져오기는 이미 끝났다) */}
      {canPlant && pendingPos ? <PlantBar preview={preview} /> : <Market />}
      {viewerId && (
        <div className={styles.handPanel}>
          <Hand plantable={plantable} canPlant={canPlant} />
        </div>
      )}
    </div>
  );
});
