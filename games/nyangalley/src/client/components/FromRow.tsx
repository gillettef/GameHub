import { memo } from 'react';
import { cellLabel } from '../../engine';
import { useFromChoices } from '../game/useFromChoices';
import { selectState, useGameStore } from '../store/gameStore';
import styles from './PlantBar.module.css';

/**
 * 쉬는 고양이가 모자랄 때 데려올 칸 (Rules.md 6.2, 2026-11-27): 놓기 확인 바·부르기 바 아래 한 줄.
 * 고르지 않으면 자동(가장 높이 쌓인 칸 → 명당 없는 칸 → 칸 순서). 고르기를 누르면 보드의 점선 내 칸을 1마리마다 한 번씩 누른다.
 * 데려올 고양이가 없으면 아무것도 그리지 않는다
 */
export const FromRow = memo(function FromRow() {
  const state = useGameStore(selectState);
  const picks = useGameStore((s) => s.fromPicks);
  const picking = useGameStore((s) => s.fromPicking);
  const start = useGameStore((s) => s.startFromPick);
  const clear = useGameStore((s) => s.clearFrom);
  const { need } = useFromChoices();
  if (!state?.board || need <= 0) return null;
  const board = state.board;
  // 같은 칸을 여러 번 고르면 "E4 2마리" 로 묶는다(고른 순서대로)
  const counts = new Map<string, number>();
  for (const p of picks) {
    const label = cellLabel(board, p);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const chosen = [...counts].map(([label, n]) => `${label} ${n}마리`).join(', ');
  return (
    <div className={styles.seedRow} role="group" aria-label="데려올 칸">
      {picking ? (
        <span className={styles.hint} aria-live="polite">
          보드에서 데려올 내 칸(점선)을 누르세요 · {picks.length}/{need}마리
        </span>
      ) : picks.length ? (
        <span className={styles.hint}>
          쉬는 고양이가 모자라 {chosen}를 데려옵니다
        </span>
      ) : (
        <span className={styles.hint}>
          쉬는 고양이가 모자라 {need}마리를 데려옵니다 · 지금은 가장 높이 쌓인 칸에서
        </span>
      )}
      {picking || picks.length ? (
        <button type="button" className="pill pill--outline" onClick={clear}>
          자동으로
        </button>
      ) : (
        <button type="button" className="pill pill--outline" onClick={start}>
          데려올 칸 고르기
        </button>
      )}
    </div>
  );
});
