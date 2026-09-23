import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { CellView } from '../game/derived';
import { cx } from '../lib/cx';
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

/** 축소(기본) 보기에서 셀 한 변이 이보다 작아지지 않는다 (너무 빽빽해지는 것을 막는 안전장치일 뿐,
 * 이 값 때문에 보드가 컨테이너보다 커져 잘리는 일이 없도록 충분히 작게 둔다) */
const MIN_HEX = 6;
/** 확대 보기 고정 반지름(s). 손가락으로 정확히 짚을 수 있는 크기 */
const ZOOM_S = 26;

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

/** odd-r 오프셋 보드를 pointy-top 육각으로 배치할 크기를 계산한다 (F008, F015 무스크롤).
 * 컨테이너 가로·세로 모두에 맞춰 딱 들어차는 s를 골라, 어떤 맵 크기에서도 잘리지 않는다. */
function computeFitGeometry(size: number, availW: number, availH: number): Geometry {
  // W = sqrt(3)*s, H = 2*s, 행 간격 = 1.5*s. 홀수 행은 W/2 만큼 밀린다.
  const sByWidth = availW / (Math.sqrt(3) * (size + 0.5));
  const sByHeight = availH / (1.5 * size + 0.5);
  const s = Math.max(Math.min(sByWidth, sByHeight), MIN_HEX / 2);
  return geometryFromS(size, s);
}

/**
 * 육각 보드 (F008, odd-r 오프셋). 부모 영역 가로·세로 모두에 맞춰 채우고 스크롤을 만들지 않는다 (F015).
 * 셀은 절대 배치 + clip-path 육각형. 크기는 ResizeObserver 로 계산한다.
 */
export const Board = memo(function Board({ size, cells, legal, viewerSeat, onCellClick }: BoardProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [fitGeo, setFitGeo] = useState<Geometry>(() => computeFitGeometry(size, 320, 320));
  const [zoomed, setZoomed] = useState(false);
  const zoomGeo = useMemo(() => geometryFromS(size, ZOOM_S), [size]);
  const geo = zoomed ? zoomGeo : fitGeo;

  // 축소(기본) 보기는 컨테이너에 맞춰 다시 계산한다 (F015 무스크롤). 확대 보기는 고정 크기라 다시 잴 필요 없다.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const fit = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setFitGeo(computeFitGeometry(size, rect.width, rect.height));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [size]);

  // 확대로 전환하면 내 코어(없으면 보드 중앙)를 화면 가운데로 스크롤한다
  useEffect(() => {
    if (!zoomed) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const myCore = cells.find((c) => c.marker?.kind === 'core' && c.marker.seat === viewerSeat);
    const rowStep = zoomGeo.hexH * 0.75;
    const targetX = myCore
      ? zoomGeo.hexW / 2 + myCore.x * zoomGeo.hexW + (myCore.y % 2 === 1 ? zoomGeo.hexW / 2 : 0)
      : zoomGeo.boardW / 2;
    const targetY = myCore ? zoomGeo.hexH / 2 + myCore.y * rowStep : zoomGeo.boardH / 2;
    viewport.scrollLeft = Math.max(0, targetX - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, targetY - viewport.clientHeight / 2);
    // 확대 전환 시 한 번만 가운데로 맞춘다. cells 는 매 턴 갱신되므로 의존성에 넣지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomed, zoomGeo, viewerSeat]);

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
    <div className={styles.area} ref={areaRef}>
      <button
        type="button"
        className={cx('pill pill--outline', styles.zoomToggle)}
        onClick={() => setZoomed((z) => !z)}
        aria-pressed={zoomed}
      >
        {zoomed ? '축소' : '확대'}
      </button>
      <div className={cx(styles.viewport, zoomed && styles.viewportZoomed)} ref={viewportRef}>
        <div className={styles.grid} style={style} role="group" aria-label={`육각 보드 ${size}×${size}칸`}>
          {cells.map((cell) => (
            <Cell key={cell.key} cell={cell} legal={legal.has(cell.key)} onClick={onCellClick} style={cellStyles.get(cell.key)!} />
          ))}
        </div>
      </div>
    </div>
  );
});
