import { memo, useCallback, useMemo } from 'react';
import { computeInfluence, legalPlantCells, legalSeedCells, posKey } from '@rootbound/shared';
import { DraftPanel } from '../components/DraftPanel';
import { GoalList } from '../components/GoalList';
import { Hand } from '../components/Hand';
import { HexBoard } from '../components/HexBoard';
import { PlantBar } from '../components/PlantBar';
import { asState, buildCells, legalKeys, previewPlant } from '../game/derived';
import { selectIsMyTurn, selectSelectedSpecies, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './BoardTab.module.css';

/**
 * 정원 탭 (F008, F009). 드래프트 중에는 드래프트 화면, 진행 중에는 보드 + 손패 + 심기 확인 바.
 * 위→아래 한 방향: 목표 칩 → 보드(남는 높이 전부) → 바닥 패널(확인 바 · 손패 · 차례 안내).
 */
export const BoardTab = memo(function BoardTab() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const isMyTurn = useGameStore(selectIsMyTurn);
  const species = useGameStore(selectSelectedSpecies);
  const selectedIndex = useGameStore((s) => s.selectedHandIndex);
  const pendingPos = useGameStore((s) => s.pendingPos);
  const pendingDirection = useGameStore((s) => s.pendingDirection);
  const pendingSeed = useGameStore((s) => s.pendingSeed);
  const seedPicking = useGameStore((s) => s.seedPicking);
  const showInfluence = useGameStore((s) => s.showInfluence);
  const toggleInfluence = useGameStore((s) => s.toggleInfluence);
  const tapCell = useGameStore((s) => s.tapCell);

  const cells = useMemo(() => (state ? buildCells(state) : []), [state]);
  // 손패 카드마다 심을 칸 수 (0 이면 그 카드는 음영 + 고르기 잠금)와, 손패 어느 카드로든 심을 수 있는 칸. 상태가 바뀔 때만 계산한다
  const { plantable, anyLegal } = useMemo(() => {
    const anyLegal = new Set<string>();
    if (!state?.board || !viewerId || state.phase !== 'playing') return { plantable: [] as number[], anyLegal };
    const s = asState(state);
    const inf = computeInfluence(s);
    const hand = state.players.find((p) => p.id === viewerId)?.hand ?? [];
    const plantable = hand.map((sp) => {
      const cells = legalPlantCells(s, viewerId, sp, inf);
      for (const c of cells) anyLegal.add(posKey(c));
      return cells.length;
    });
    return { plantable, anyLegal };
  }, [state, viewerId]);
  // 카드를 고르기 전에는 손패 전체로 심을 수 있는 칸을 옅게 보여 준다(첫 차례에 어디를 눌러야 할지 바로 보이게)
  const legal = useMemo(
    () => (!state || !isMyTurn || seedPicking ? new Set<string>() : species ? legalKeys(state, viewerId, species) : anyLegal),
    [state, isMyTurn, viewerId, species, seedPicking, anyLegal],
  );
  const seedLegal = useMemo(
    () => (state?.board && seedPicking && pendingPos ? new Set(legalSeedCells(asState(state), pendingPos).map(posKey)) : undefined),
    [state, seedPicking, pendingPos],
  );
  const preview = useMemo(
    () => (state && viewerId && species && pendingPos ? previewPlant(state, viewerId, species, pendingPos, pendingDirection, pendingSeed) : null),
    [state, viewerId, species, pendingPos, pendingDirection, pendingSeed],
  );
  const onCellClick = useCallback((q: number, r: number) => tapCell({ q, r }), [tapCell]);

  if (!state || !viewerId) return null;
  if (state.phase === 'drafting') return <DraftPanel />;
  if (!state.board) return null;

  const me = state.players.find((p) => p.id === viewerId);
  const current = state.players.find((p) => p.id === state.currentPlayerId);
  const stuck = isMyTurn && state.phase === 'playing' && plantable.length > 0 && plantable.every((n) => n === 0);
  const selectedDead = selectedIndex !== null && plantable[selectedIndex] === 0;
  const hint =
    state.phase === 'finished'
      ? '게임이 끝났습니다'
      : !isMyTurn
        ? `${current?.nickname ?? ''}의 차례`
        : stuck
          ? '심을 칸이 없습니다. 카드를 눌러 한 장 버리세요'
          : !species
            ? '빛나는 칸에 심을 수 있습니다. 먼저 손패에서 카드를 고르세요'
            : selectedDead
              ? '이 카드는 지금 심을 칸이 없습니다. 다른 카드를 고르세요'
              : !pendingPos
              ? '밝게 빛나는 칸에 심을 수 있습니다'
              : '결과를 보고 심기를 누르세요';

  return (
    <div className={styles.root}>
      <div className={styles.goals}>
        <GoalList goals={state.goals} compact />
      </div>
      <div className={styles.boardArea}>
        <HexBoard
          cells={cells}
          legal={legal}
          legalFaint={!species}
          seedLegal={seedLegal}
          pendingKey={pendingPos ? posKey(pendingPos) : null}
          seedKey={pendingSeed ? posKey(pendingSeed) : null}
          preview={preview}
          viewerSeat={me?.seat ?? 0}
          showInfluence={showInfluence}
          onCellClick={onCellClick}
        />
      </div>
      <div className={styles.bottom}>
        {isMyTurn && pendingPos ? <PlantBar preview={preview} /> : null}
        {state.phase === 'playing' && (
          <div className={styles.handPanel}>
            <Hand plantable={plantable} />
          </div>
        )}
        <div className={styles.turnBar}>
          <span className={isMyTurn ? styles.hintMine : styles.hint}>{hint}</span>
          <button type="button" className={showInfluence ? styles.toggleOn : styles.toggle} onClick={toggleInfluence} aria-pressed={showInfluence} title="칸마다 내 영향력:상대 최고 영향력 보기">
            영향력
          </button>
        </div>
      </div>
    </div>
  );
});
