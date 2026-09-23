import { memo, useRef, useState, type CSSProperties } from 'react';
import type { CellView } from '../game/derived';
import { kindLabel } from '../game/derived';
import { CardArt } from '../game/cardArt';
import styles from './Board.module.css';

/** 툴팁 대략 높이(px). 위쪽 여유가 이보다 적으면 아래로 뒤집는다 */
const TOOLTIP_SPACE = 160;
/** 툴팁 대략 너비(px, Board.module.css .tooltip width 168 + 여유) */
const TOOLTIP_WIDTH = 168;
/** 화면(앱 프레임) 가장자리에서 남겨 둘 최소 여백 */
const TOOLTIP_MARGIN = 8;

interface CellProps {
  cell: CellView;
  /** 선택한 카드를 놓을 수 있는 칸 */
  legal: boolean;
  onClick: (x: number, y: number) => void;
  /** Board 가 계산한 육각 위치·크기 (절대 배치) */
  style: CSSProperties;
}

/**
 * 육각 보드 한 칸. props 가 바뀐 칸만 다시 그린다 (F014).
 * 지형·영토·시야는 data 속성으로 넘기고 색·모양은 Board.module.css 가 정한다.
 * 육각 clip-path 는 `.hex` 레이어 하나에만 건다 — `.cell` 자체에 걸면 자손인 마커 툴팁이
 * 육각 밖으로 못 빠져나가고 잘린다(clip-path 는 자손의 오버플로까지 함께 자른다).
 */
export const Cell = memo(function Cell({ cell, legal, onClick, style }: CellProps) {
  const m = cell.marker;
  const cellRef = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(cell.y < 3);
  const [shift, setShift] = useState(0);

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
      onClick={() => onClick(cell.x, cell.y)}
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
