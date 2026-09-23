import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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

/** 보기 기본 반지름(s). 2026-09-23 사용자 지시로 한 번 확대판을 기본으로 키웠으나, 2026-09-24
 * 사용자 지시로 다시 최소(축소)값을 기본으로 되돌렸다. 핀치 확대/축소로 MIN_ZOOM_S~MAX_ZOOM_S 사이를 벗어날 수 있다 */
const MIN_ZOOM_S = 20;
const MAX_ZOOM_S = 56;
const ZOOM_S = MIN_ZOOM_S;

/** 두 터치 지점 사이 거리 (핀치 확대/축소 판정용) */
function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

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
 * 육각 보드 (F008, odd-r 오프셋). 기본 크기는 최소 줌(MIN_ZOOM_S, 2026-09-24 사용자 지시)이고
 * 핀치로 확대할 수 있다. 부모 영역보다 커지면 스크롤해서 살펴본다. 셀은 절대 배치 + clip-path 육각형.
 */
export const Board = memo(function Board({ size, cells, legal, viewerSeat, onCellClick }: BoardProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoomS, setZoomS] = useState(ZOOM_S);
  const zoomSRef = useRef(zoomS);
  const geo = useMemo(() => geometryFromS(size, zoomS), [size, zoomS]);

  // 처음 열릴 때 내 코어(없으면 보드 중앙)를 화면 가운데로 스크롤한다. 기본 확대 크기 기준으로
  // 한 번만 계산한다 — zoomS(핀치 확대/축소)가 바뀔 때마다 다시 가운데로 돌아가면 안 되므로
  // geo 대신 기본 ZOOM_S 로 새로 구한 좌표를 쓰고, 의존성에서도 zoomS·geo 를 뺀다.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const initGeo = geometryFromS(size, ZOOM_S);
    const myCore = cells.find((c) => c.marker?.kind === 'core' && c.marker.seat === viewerSeat);
    const rowStep = initGeo.hexH * 0.75;
    const targetX = myCore
      ? initGeo.hexW / 2 + myCore.x * initGeo.hexW + (myCore.y % 2 === 1 ? initGeo.hexW / 2 : 0)
      : initGeo.boardW / 2;
    const targetY = myCore ? initGeo.hexH / 2 + myCore.y * rowStep : initGeo.boardH / 2;
    viewport.scrollLeft = Math.max(0, targetX - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, targetY - viewport.clientHeight / 2);
    // 처음 한 번만 가운데로 맞춘다. cells 는 매 턴 갱신되므로 의존성에 넣지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, viewerSeat]);

  // 모바일 핀치 확대/축소 (2026-09-24 사용자 지시). 축소판이 없어 확대판만 쓰는 만큼, 손가락으로
  // 기본 크기보다 더 키우거나 줄일 수 있게 한다. transform 대신 실제 s(반지름)를 바꿔서
  // 기존 셀 좌표 계산(cellStyles)과 네이티브 overflow:auto 스크롤을 그대로 재사용한다.
  const pendingAnchor = useRef<{ ratioX: number; ratioY: number; midX: number; midY: number } | null>(null);
  const pinch = useRef<{ dist: number; s: number } | null>(null);

  useEffect(() => {
    zoomSRef.current = zoomS;
  }, [zoomS]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinch.current = { dist: touchDistance(e.touches[0]!, e.touches[1]!), s: zoomSRef.current };
    };
    const onTouchMove = (e: TouchEvent) => {
      const p = pinch.current;
      if (!p || e.touches.length !== 2) return;
      e.preventDefault();
      const [t0, t1] = [e.touches[0]!, e.touches[1]!];
      const scale = touchDistance(t0, t1) / p.dist;
      const nextS = Math.min(MAX_ZOOM_S, Math.max(MIN_ZOOM_S, p.s * scale));

      // 핀치 중심 아래 있던 보드 좌표를 기억해 뒀다가, 크기가 바뀐 뒤 같은 자리에 오도록 스크롤을 보정한다
      const rect = el.getBoundingClientRect();
      const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
      const midY = (t0.clientY + t1.clientY) / 2 - rect.top;
      const curGeo = geometryFromS(size, zoomSRef.current);
      pendingAnchor.current = {
        ratioX: (el.scrollLeft + midX) / curGeo.boardW,
        ratioY: (el.scrollTop + midY) / curGeo.boardH,
        midX,
        midY,
      };
      setZoomS(nextS);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [size]);

  // 핀치로 크기가 바뀐 직후, 기억해 둔 보드 좌표가 다시 손가락 아래 오도록 스크롤을 보정한다
  useLayoutEffect(() => {
    const el = viewportRef.current;
    const anchor = pendingAnchor.current;
    if (!el || !anchor) return;
    el.scrollLeft = anchor.ratioX * geo.boardW - anchor.midX;
    el.scrollTop = anchor.ratioY * geo.boardH - anchor.midY;
    pendingAnchor.current = null;
  }, [geo]);

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
