import { memo, useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { CellView } from '../game/derived';
import { kindLabel } from '../game/derived';
import { CardArt } from '../game/cardArt';
import styles from './Board.module.css';

/** 지형 7종(2026-09-28) 전용 장식 요소. `vein`은 이미 위에서 따로 그린다.
 * `space`/`asteroid`는 장식 없이 `.hex[data-terrain]` 배경색만으로 충분하다 */
function TerrainDecorator({ terrain }: { terrain: CellView['terrain'] }) {
  switch (terrain) {
    case 'nebula':
      return <span className={styles.nebula} aria-hidden="true" />;
    case 'debrisField':
      return <span className={styles.debrisField} aria-hidden="true" />;
    case 'ionStorm':
      return <span className={styles.ionStorm} aria-hidden="true" />;
    case 'relicSite':
      return <span className={styles.relicSite} aria-hidden="true" />;
    case 'gravityRift':
      return <span className={styles.gravityRift} aria-hidden="true" />;
    case 'gunEmplacement':
      return <span className={styles.gunEmplacement} aria-hidden="true" />;
    case 'jammingField':
      return <span className={styles.jammingField} aria-hidden="true" />;
    default:
      return null;
  }
}

/** 툴팁 대략 높이(px). 위쪽 여유가 이보다 적으면 아래로 뒤집는다 */
const TOOLTIP_SPACE = 160;
/** 툴팁 대략 너비(px, Board.module.css .tooltip width 168 + 여유) */
const TOOLTIP_WIDTH = 168;
/** 화면(앱 프레임) 가장자리에서 남겨 둘 최소 여백 */
const TOOLTIP_MARGIN = 8;
/** 배치 프리뷰(길게 누르기) 판정 시간(ms) */
const LONG_PRESS_MS = 450;
/** 이 이상 움직이면 스크롤/드래그 의도로 보고 길게 누르기를 취소한다 */
const LONG_PRESS_MOVE_CANCEL_PX = 10;

interface CellProps {
  cell: CellView;
  /** 선택한 카드를 놓을 수 있는 칸 */
  legal: boolean;
  /** 길게 눌러 배치 프리뷰 중인 칸(새로 넓어질 시야) */
  preview: boolean;
  onClick: (x: number, y: number) => void;
  /** legal 칸을 길게 누르기 시작/종료 (배치 프리뷰). 누르는 동안만 보여주고 떼면 사라진다 —
   * 실제 배치는 이 콜백과 무관하게 짧은 탭(click)에서만 일어난다 */
  onPreviewStart: (x: number, y: number) => void;
  onPreviewEnd: () => void;
  /** Board 가 계산한 육각 위치·크기 (절대 배치) */
  style: CSSProperties;
}

/**
 * 육각 보드 한 칸. props 가 바뀐 칸만 다시 그린다 (F014).
 * 지형·영토·시야는 data 속성으로 넘기고 색·모양은 Board.module.css 가 정한다.
 * 육각 clip-path 는 `.hex` 레이어 하나에만 건다 — `.cell` 자체에 걸면 자손인 마커 툴팁이
 * 육각 밖으로 못 빠져나가고 잘린다(clip-path 는 자손의 오버플로까지 함께 자른다).
 */
export const Cell = memo(function Cell({ cell, legal, preview, onClick, onPreviewStart, onPreviewEnd, style }: CellProps) {
  const m = cell.marker;
  const cellRef = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(cell.y < 3);
  const [shift, setShift] = useState(0);

  // 배치 프리뷰(길게 누르기). click 은 pointerup 다음에 발생하므로, 길게 누르기가 발동됐으면
  // longPressFired 를 true 로 남겨 뒀다가 handleClick 에서 소비하고 배치를 막는다 — 즉 "누르고 있는
  // 동안 미리보기, 떼면 사라지고, 다시 짧게 탭해야 실제로 배치"된다.
  // pointerId 를 기억해 둔다 — 핀치줌(Board.tsx 의 2손가락 확대/축소) 중 같은 칸에 두 번째 손가락이
  // 닿아도 첫 손가락의 눌림 상태를 건드리지 않게 한다(ui-tab-reviewer 지적, 2026-09-28).
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);
  const activePointerId = useRef<number | null>(null);

  const clearPressTimer = () => {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const endPress = useCallback(
    (e?: ReactPointerEvent<HTMLDivElement>) => {
      if (e && activePointerId.current !== null && e.pointerId !== activePointerId.current) return;
      clearPressTimer();
      pressOrigin.current = null;
      activePointerId.current = null;
      if (longPressFired.current) onPreviewEnd();
    },
    [onPreviewEnd],
  );

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!legal || activePointerId.current !== null) return; // 이미 다른 손가락이 누르고 있으면 무시
    activePointerId.current = e.pointerId;
    pressOrigin.current = { x: e.clientX, y: e.clientY };
    longPressFired.current = false;
    clearPressTimer();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 일부 환경(구형 브라우저)엔 없을 수 있다 — 없어도 동작엔 지장 없다 */
    }
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onPreviewStart(cell.x, cell.y);
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activePointerId.current) return;
    const origin = pressOrigin.current;
    if (!origin) return;
    if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > LONG_PRESS_MOVE_CANCEL_PX) endPress(e);
  };

  const handleClick = () => {
    if (longPressFired.current) {
      // 길게 누른 뒤 뗀 직후의 click 은 소비만 하고 배치하지 않는다(위 주석)
      longPressFired.current = false;
      return;
    }
    onClick(cell.x, cell.y);
  };

  /** 호버·포커스 시점에 실제 화면 위 여유를 재서 위/아래·좌우를 정한다 (확대 모드의 스크롤 컨테이너에서도
   * 정확하다 — 칸 좌표(x, y)만 보는 고정 판정은 스크롤 위치나 화면 폭에 따라 틀릴 수 있다).
   * 좌우는 앱 프레임(#root, 폭 고정) 기준으로 자른다 — 맵이 프레임보다 넓게 확대되면 브라우저
   * 창 기준(window.innerWidth)으로는 넘치는 걸 못 잡는다. */
  const updateTooltipSide = () => {
    const rect = cellRef.current?.getBoundingClientRect();
    if (!rect) return;
    setBelow(rect.top < TOOLTIP_SPACE);
    const frame = document.getElementById('root')?.getBoundingClientRect();
    const min = (frame?.left ?? 0) + TOOLTIP_WIDTH / 2 + TOOLTIP_MARGIN;
    const max = (frame?.right ?? window.innerWidth) - TOOLTIP_WIDTH / 2 - TOOLTIP_MARGIN;
    const center = rect.left + rect.width / 2;
    const clamped = Math.min(Math.max(center, min), max);
    setShift(clamped - center);
  };

  return (
    <div
      className={styles.cell}
      style={style}
      ref={cellRef}
      data-legal={legal || undefined}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onPointerLeave={endPress}
      onMouseEnter={m ? updateTooltipSide : undefined}
      onFocus={m ? updateTooltipSide : undefined}
      onKeyDown={
        legal
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(cell.x, cell.y);
              }
            }
          : undefined
      }
      role={legal ? 'button' : undefined}
      tabIndex={legal ? 0 : -1}
      aria-label={`(${cell.x},${cell.y})`}
    >
      <div className={styles.hex} data-terrain={cell.terrain} data-owner={cell.ownerSeat ?? undefined} data-sight={cell.inSight || undefined} aria-hidden="true">
        {cell.terrain === 'vein' && <span className={styles.vein} aria-hidden="true" />}
        <TerrainDecorator terrain={cell.terrain} />
        {preview && <span className={styles.previewMark} aria-hidden="true" />}
      </div>
      {m && (
        <>
          <div className={styles.marker} data-kind={m.kind} data-seat={m.seat}>
            <CardArt cardId={m.specId} className={styles.art} />
            <span className={styles.hp}>{m.hp}</span>
          </div>
          {/* .marker 의 형제로 둔다: .cell(칸)도 .marker(코어)도 clip-path 육각이라, 자손이면 밖으로 못 빠져나간다 */}
          <div
            className={styles.tooltip}
            data-below={below || undefined}
            style={{ '--tooltip-shift': `${shift}px` } as CSSProperties}
            role="tooltip"
          >
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
        </>
      )}
    </div>
  );
});
