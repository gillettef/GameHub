import { memo } from 'react';
import type { CellView } from '../game/derived';
import { kindLabel } from '../game/derived';
import styles from './Board.module.css';

interface CellProps {
  cell: CellView;
  /** 선택한 카드를 놓을 수 있는 칸 */
  legal: boolean;
  onClick: (x: number, y: number) => void;
}

/**
 * 격자 한 칸. props 가 바뀐 칸만 다시 그린다 (F014).
 * 지형·영토·시야는 data 속성으로 넘기고 색은 Board.module.css 가 정한다.
 */
export const Cell = memo(function Cell({ cell, legal, onClick }: CellProps) {
  const m = cell.marker;
  return (
    <div
      className={styles.cell}
      data-terrain={cell.terrain}
      data-owner={cell.ownerSeat ?? undefined}
      data-sight={cell.inSight || undefined}
      data-legal={legal || undefined}
      onClick={() => onClick(cell.x, cell.y)}
      aria-label={`(${cell.x},${cell.y})`}
    >
      {cell.terrain === 'vein' && <span className={styles.vein} aria-hidden="true" />}
      {m && (
        <div className={styles.marker} data-kind={m.kind} data-seat={m.seat}>
          <span className={styles.hp}>{m.hp}</span>
          <span className={styles.seatBadge}>{m.seat + 1}</span>
          <div className={styles.tooltip} data-below={cell.y < 3 || undefined} role="tooltip">
            <strong>{m.name}</strong>
            <span className={styles.tooltipMeta}>
              {kindLabel(m.kind)} · {m.ownerName} (좌석 {m.seat + 1})
            </span>
            <dl>
              <dt>체력</dt>
              <dd>
                {m.hp} / {m.maxHp}
              </dd>
              <dt>공격</dt>
              <dd>{m.attack}</dd>
              <dt>사거리</dt>
              <dd>{m.range}</dd>
              <dt>시야</dt>
              <dd>{m.sight}</dd>
              <dt>점수</dt>
              <dd>{m.score}</dd>
              {m.production > 0 && (
                <>
                  <dt>생산</dt>
                  <dd>{m.production}</dd>
                </>
              )}
              {m.remainingTurns !== null && (
                <>
                  <dt>남은 턴</dt>
                  <dd>{m.remainingTurns}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
});
