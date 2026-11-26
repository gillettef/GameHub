import { memo } from 'react';
import { cellLabel, MOVE_TIMES, moveMaxCount } from '../../engine';
import { applyMoves, type PlantPreview } from '../game/derived';
import { cx } from '../lib/cx';
import { findMe, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './PlantBar.module.css';

/**
 * 담 넘기 바 (v7 「골목 일과」, Rules.md 5.3): 보드에서 출발 칸(내 칸) → 마릿수 1·2 → 도착 칸(맞닿은 칸)을 고르면
 * 예상 결과(내 칸·점수 변화)를 보여 준다. 두 번까지 옮길 수 있고, 두 번째 이동은 첫 이동을 적용한 보드 기준이다.
 * 취소·한 번 더 옮기기·이대로 끝내기 버튼은 화면 맨 아래(⑤ GameView)에 있다.
 */
export const MoveBar = memo(function MoveBar({ preview }: { preview: PlantPreview | null }) {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const steps = useGameStore((s) => s.moveSteps);
  const from = useGameStore((s) => s.moveFrom);
  const to = useGameStore((s) => s.moveTo);
  const count = useGameStore((s) => s.moveCount);
  const setMoveCount = useGameStore((s) => s.setMoveCount);
  if (!state?.board || !viewerId) return null;
  const board = state.board;
  const mySeat = findMe(state, viewerId)?.seat ?? 0;
  const max = from ? moveMaxCount(applyMoves(state, viewerId, steps), viewerId, from) : 0;
  const n = steps.length + 1;
  const myLand = preview?.landDelta[mySeat] ?? 0;
  const myScore = preview?.scoreDelta[mySeat] ?? 0;
  const done = steps.map((m) => `${cellLabel(board, m.from)}→${cellLabel(board, m.to)} ${m.count}마리`).join(', ');
  const hint = !from ? '고양이를 옮길 내 칸(빛나는 칸)을 누르세요' : !to ? `${cellLabel(board, from)}에서 옮길 마릿수를 고르고, 맞닿은 칸(빛나는 칸)을 누르세요` : `${cellLabel(board, from)} → ${cellLabel(board, to)} ${count}마리`;

  return (
    <div className={styles.bar} role="group" aria-label="담 넘기">
      <div className={styles.info}>
        <strong className={styles.name}>
          담 넘기 {Math.min(n, MOVE_TIMES)}/{MOVE_TIMES}번째
        </strong>
        <span className={styles.hint}>
          {done ? `정한 이동: ${done} · ` : ''}
          {hint}
        </span>
        {preview && (
          <span className={styles.stats}>
            <span className={myLand >= 0 ? styles.up : styles.down}>
              내 칸 {myLand >= 0 ? '+' : ''}
              {myLand}
            </span>
            <span className={myScore >= 0 ? styles.up : styles.down}>
              점수 {myScore >= 0 ? '+' : ''}
              {myScore}
            </span>
          </span>
        )}
      </div>
      {from && max > 0 && (
        <div className={styles.dirs} role="radiogroup" aria-label="옮길 고양이 수">
          {Array.from({ length: max }, (_, i) => i + 1).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={count === k} className={cx(styles.dir, count === k && styles.dirOn)} onClick={() => setMoveCount(k)}>
              {k}마리
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
