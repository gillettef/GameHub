import { memo, useCallback, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { CardId } from '@astraltab/shared';
import type { CellOverlay, CellView } from '../game/derived';
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
  /** 배치 후보 미리보기 표시(고스트 마커·예상 피해·위협). 후보가 없으면 undefined */
  overlay?: CellOverlay;
  /** 후보 칸에 그릴 카드 */
  ghostCardId?: CardId;
  /** Board 가 계산한 육각 위치·크기 (절대 배치) */
  style: CSSProperties;
}

/**
 * 육각 보드 한 칸. props 가 바뀐 칸만 다시 그린다 (F014).
 * 지형·영토·시야는 data 속성으로 넘기고 색·모양은 Board.module.css 가 정한다.
 * 육각 clip-path 는 `.hex` 레이어 하나에만 건다 — `.cell` 자체에 걸면 자손이 잘린다.
 */
export const Cell = memo(function Cell({ cell, legal, preview, overlay, ghostCardId, onClick, onPreviewStart, onPreviewEnd, style }: CellProps) {
  const m = cell.marker;

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

  return (
    <div
      className={styles.cell}
      style={style}
      data-legal={legal || undefined}
      data-candidate={overlay?.candidate || undefined}
      data-threat={overlay?.threat || undefined}
      data-hit={overlay?.hit ? (overlay.lethal ? 'lethal' : 'hit') : undefined}
      data-from-new={overlay?.fromNew || undefined}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onPointerLeave={endPress}
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
      {overlay?.candidate && ghostCardId && (
        <div className={styles.ghost} aria-hidden="true">
          <CardArt cardId={ghostCardId} className={styles.art} />
        </div>
      )}
      {overlay?.hit ? (
        <span className={styles.hitBadge} data-lethal={overlay.lethal || undefined} aria-hidden="true">
          {overlay.lethal ? '파괴' : '-' + overlay.hit}
        </span>
      ) : null}
      {overlay?.heal ? (
        <span className={styles.healBadge} aria-hidden="true">
          {'+' + overlay.heal}
        </span>
      ) : null}
      {m && (
          <div className={styles.marker} data-kind={m.kind} data-seat={m.seat}>
            <CardArt cardId={m.specId} className={styles.art} />
            <span className={styles.hp}>{m.hp}</span>
          </div>
      )}
    </div>
  );
});
