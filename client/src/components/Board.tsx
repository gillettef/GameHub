import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CellView } from '../game/derived';
import { Cell } from './Cell';
import styles from './Board.module.css';

interface BoardProps {
  size: number;
  cells: CellView[];
  legal: Set<string>;
  /** 보는 사람의 좌석. 시야 오버레이 색을 정한다 */
  viewerSeat: number;
  onCellClick: (x: number, y: number) => void;
}

/** 격자선 두께 (px). 셀 크기 계산에 쓴다 */
const GAP = 1;

/**
 * 격자 보드 (F008). 부모 영역의 짧은 변에 맞춰 정사각으로 그리고 스크롤을 만들지 않는다 (F015).
 * 셀 크기는 ResizeObserver 로 계산해 CSS 변수로 넘긴다.
 */
export const Board = memo(function Board({ size, cells, legal, viewerSeat, onCellClick }: BoardProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx] = useState(32);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const fit = () => {
      const rect = el.getBoundingClientRect();
      const side = Math.min(rect.width, rect.height);
      const px = Math.floor((side - GAP * (size + 1)) / size);
      setCellPx(Math.max(px, 12));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [size]);

  const style = {
    '--n': size,
    '--cell': `${cellPx}px`,
    '--gap': `${GAP}px`,
    '--sight-color': `var(--color-seat-${viewerSeat}, var(--color-white))`,
  } as CSSProperties;

  return (
    <div className={styles.area} ref={areaRef}>
      <div className={styles.grid} style={style} role="grid" aria-label={`${size}×${size} 보드`}>
        {cells.map((cell) => (
          <Cell key={cell.key} cell={cell} legal={legal.has(cell.key)} onClick={onCellClick} />
        ))}
      </div>
    </div>
  );
});
