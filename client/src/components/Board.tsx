import { memo, useEffect, useMemo, useRef, type CSSProperties } from 'react';
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

/** 보기 고정 반지름(s). 손가락으로 정확히 짚을 수 있는 크기 (2026-09-23 사용자 지시: 축소판을 없애고
 * 확대판만 기본으로 쓰면서 더 키웠다) */
const ZOOM_S = 34;

interface Geometry {
  /** 육각 하나의 가로 폭 (pointy-top 기준) */
  hexW: number;
  hexH: number;
  /** 보드 전체 픽셀 크기 */
  boardW: number;
  boardH: number;
}

function geometryFromS(size: number, s: number): Geometry {
  const hexW = Math.sqrt(3) * s;
  const hexH = 2 * s;
  return {
    hexW,
    hexH,
    boardW: size * hexW + hexW / 2,
    boardH: (size - 1) * 1.5 * s + hexH,
  };
}

/**
 * 육각 보드 (F008, odd-r 오프셋). 고정 크기 확대판만 쓴다(2026-09-23 사용자 지시: 축소판 폐기).
 * 부모 영역보다 커지면 스크롤해서 살펴본다. 셀은 절대 배치 + clip-path 육각형.
 */
export const Board = memo(function Board({ size, cells, legal, viewerSeat, onCellClick }: BoardProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const geo = useMemo(() => geometryFromS(size, ZOOM_S), [size]);

  // 처음 열릴 때 내 코어(없으면 보드 중앙)를 화면 가운데로 스크롤한다
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const myCore = cells.find((c) => c.marker?.kind === 'core' && c.marker.seat === viewerSeat);
    const rowStep = geo.hexH * 0.75;
    const targetX = myCore
      ? geo.hexW / 2 + myCore.x * geo.hexW + (myCore.y % 2 === 1 ? geo.hexW / 2 : 0)
      : geo.boardW / 2;
    const targetY = myCore ? geo.hexH / 2 + myCore.y * rowStep : geo.boardH / 2;
    viewport.scrollLeft = Math.max(0, targetX - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, targetY - viewport.clientHeight / 2);
    // 처음 한 번만 가운데로 맞춘다. cells 는 매 턴 갱신되므로 의존성에 넣지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, viewerSeat]);

  const style = {
    '--sight-color': `var(--color-seat-${viewerSeat}, var(--color-white))`,
    width: `${geo.boardW}px`,
    height: `${geo.boardH}px`,
  } as CSSProperties;

  // 칸 위치·크기 스타일은 cells·geo 가 바뀔 때만 다시 만든다. legal(손패 선택)이 바뀔 때마다
  // 새 객체를 만들면 Cell 의 React.memo 가 style 참조 비교에서 매번 실패해 전체가 다시 그려진다.
  const cellStyles = useMemo(() => {
    const rowStep = geo.hexH * 0.75;
    const map = new Map<string, CSSProperties>();
    for (const cell of cells) {
      const cellCx = geo.hexW / 2 + cell.x * geo.hexW + (cell.y % 2 === 1 ? geo.hexW / 2 : 0);
      const cellCy = geo.hexH / 2 + cell.y * rowStep;
      map.set(cell.key, {
        left: `${cellCx - geo.hexW / 2}px`,
        top: `${cellCy - geo.hexH / 2}px`,
        width: `${geo.hexW}px`,
        height: `${geo.hexH}px`,
      });
    }
    return map;
  }, [cells, geo]);

  return (
    <div className={styles.area}>
      <div className={styles.viewport} ref={viewportRef}>
        <div className={styles.grid} style={style} role="group" aria-label={`육각 보드 ${size}×${size}칸`}>
          {cells.map((cell) => (
            <Cell key={cell.key} cell={cell} legal={legal.has(cell.key)} onClick={onCellClick} style={cellStyles.get(cell.key)!} />
          ))}
        </div>
      </div>
    </div>
  );
});
