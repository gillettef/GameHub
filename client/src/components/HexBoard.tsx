import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getSpecies } from '@rootbound/shared';
import type { CellView, PlantPreview } from '../game/derived';
import { cx } from '../lib/cx';
import styles from './HexBoard.module.css';

const SQRT3 = Math.sqrt(3);
/** 화면 글자 최소 크기(px, CLAUDE.md 모바일 우선) */
const MIN_TEXT_PX = 12;

/** 축 좌표 → 픽셀 (pointy-top, 반지름 1) */
const px = (q: number, r: number) => ({ x: SQRT3 * (q + r / 2), y: 1.5 * r });
const hexPoints = (scale: number) =>
  [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return `${(Math.cos(a) * scale).toFixed(3)},${(Math.sin(a) * scale).toFixed(3)}`;
    })
    .join(' ');
const HEX = hexPoints(0.95);
const HEX_INNER = hexPoints(0.8);
const HOUSE = 'M-0.42 0.38V-0.06L0 -0.42L0.42 -0.06V0.38Z';
/** 연못 물결·돌밭 돌 표시 (좌석색 땅과 헷갈리지 않게 지형을 모양으로도 구분한다) */
const WAVES = 'M-0.5 -0.12q0.125 -0.14 0.25 0t0.25 0t0.25 0t0.25 0M-0.5 0.2q0.125 -0.14 0.25 0t0.25 0t0.25 0t0.25 0';
const STONES = 'M-0.38 0.18a0.2 0.15 0 1 0 0.4 0a0.2 0.15 0 1 0 -0.4 0M0.05 -0.12a0.18 0.13 0 1 0 0.36 0a0.18 0.13 0 1 0 -0.36 0';

interface HexBoardProps {
  cells: CellView[];
  /** 지금 고른 카드로 심을 수 있는 칸 */
  legal: Set<string>;
  /** 카드를 고르기 전: legal 은 손패 어느 카드로든 심을 수 있는 칸이고, 옅게 그린다 */
  legalFaint?: boolean;
  /** 씨앗 고르기 중이면 씨앗을 놓을 수 있는 칸 */
  seedLegal?: Set<string>;
  pendingKey?: string | null;
  seedKey?: string | null;
  preview?: PlantPreview | null;
  viewerSeat: number;
  showInfluence: boolean;
  onCellClick: (q: number, r: number) => void;
}

/**
 * 정원 보드 (Rules.md 3절, 축 좌표 육각). SVG 라 컨테이너 크기에 맞춰 늘고 줄어든다(무스크롤, F015).
 * 칸 채움: 지형 → 땅 주인 좌석색(옅게) → 식물(좌석색 원 + 종 첫 글자) / 입구(집 모양) / 씨앗(점).
 */
export const HexBoard = memo(function HexBoard({ cells, legal, legalFaint, seedLegal, pendingKey, seedKey, preview, viewerSeat, showInfluence, onCellClick }: HexBoardProps) {
  const box = useMemo(() => {
    const pts = cells.map((c) => px(c.q, c.r));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs) - 1;
    const minY = Math.min(...ys) - 1.1;
    return { minX, minY, w: Math.max(...xs) + 1 - minX, h: Math.max(...ys) + 1.1 - minY };
  }, [cells]);
  const viewBox = `${box.minX.toFixed(2)} ${box.minY.toFixed(2)} ${box.w.toFixed(2)} ${box.h.toFixed(2)}`;

  // 화면에서 보드 1단위가 몇 픽셀인지 재서, 글자가 12px 밑으로 내려가지 않게 SVG 글자 크기에 하한을 둔다
  const svgRef = useRef<SVGSVGElement>(null);
  const [ppu, setPpu] = useState(20);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setPpu(Math.min(r.width / box.w, r.height / box.h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box.w, box.h]);
  const fontFloor = MIN_TEXT_PX / ppu;
  const plantFont = Math.max(0.62, fontFloor);
  const inflFont = Math.max(0.7, fontFloor);
  const smallFont = Math.max(0.5, fontFloor);

  return (
    <svg ref={svgRef} className={styles.board} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="group" aria-label="정원 보드">
      {cells.map((c) => {
        const { x, y } = px(c.q, c.r);
        const flipTo = preview?.flips.get(c.key);
        const touched = preview?.touched.get(c.key);
        const isLegal = legal.has(c.key);
        const isSeedLegal = seedLegal?.has(c.key) ?? false;
        const interactive = isLegal || isSeedLegal;
        const ownerStyle = c.owner >= 0 ? ({ '--owner': `var(--color-seat-${c.owner})` } as CSSProperties) : undefined;
        const mine = c.influence[viewerSeat] ?? 0;
        const rival = Math.max(0, ...c.influence.filter((_, i) => i !== viewerSeat));
        const label = `(${c.q},${c.r}) ${terrainName(c.terrain)}${c.plant ? ` · ${getSpecies(c.plant.species).name}` : ''}${c.owner >= 0 ? ` · 좌석 ${c.owner + 1} 땅` : ''}`;
        return (
          <g
            key={c.key}
            transform={`translate(${x.toFixed(3)} ${y.toFixed(3)})`}
            className={cx(styles.cell, (isLegal || isSeedLegal) && styles.clickable)}
            onClick={() => onCellClick(c.q, c.r)}
            // 심을 수 있는 칸·씨앗 칸만 키보드로 고를 수 있게 한다(탭 정지 수를 줄인다)
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onCellClick(c.q, c.r);
                    }
                  }
                : undefined
            }
            aria-label={label}
          >
            <polygon points={HEX} className={cx(styles.ground, styles[c.terrain])} />
            {c.owner >= 0 && <polygon points={HEX} className={styles.owned} style={ownerStyle} />}
            {c.terrain === 'fertile' && <circle r={0.16} cy={-0.5} className={styles.fertileDot} />}
            {c.terrain === 'pond' && <path d={WAVES} className={styles.waves} />}
            {c.terrain === 'rock' && <path d={STONES} className={styles.stones} />}
            {flipTo !== undefined && (
              <polygon points={HEX_INNER} className={styles.flip} style={flipTo >= 0 ? ({ '--owner': `var(--color-seat-${flipTo})` } as CSSProperties) : undefined} />
            )}
            {(isLegal || isSeedLegal) && <polygon points={HEX_INNER} className={isSeedLegal ? styles.seedLegal : legalFaint ? styles.legalFaint : styles.legal} />}
            {c.entranceSeat >= 0 && <path d={HOUSE} className={styles.entrance} style={{ '--seat': `var(--color-seat-${c.entranceSeat})` } as CSSProperties} />}
            {c.plant && (
              <g key={c.plant.id} className={styles.plant} style={{ '--seat': `var(--color-seat-${c.plantSeat})` } as CSSProperties}>
                <circle r={0.58} />
                <text textAnchor="middle" dominantBaseline="central" style={{ fontSize: plantFont }}>
                  {getSpecies(c.plant.species).name.slice(0, 1)}
                </text>
              </g>
            )}
            {c.seedSeats.map((seat, i) => (
              <circle key={i} r={0.12} cx={-0.35 + i * 0.25} cy={0.55} className={styles.seed} style={{ '--seat': `var(--color-seat-${seat})` } as CSSProperties} />
            ))}
            {pendingKey === c.key && <polygon points={HEX} className={styles.pending} />}
            {seedKey === c.key && <circle r={0.3} className={styles.seedPending} />}
            {touched !== undefined && !c.plant ? (
              <text className={styles.infl} textAnchor="middle" dominantBaseline="central" y={c.entranceSeat >= 0 ? 0.62 : 0} style={{ fontSize: inflFont }}>
                {touched}
              </text>
            ) : (
              showInfluence &&
              !c.plant &&
              c.entranceSeat < 0 &&
              (mine > 0 || rival > 0) && (
                <text className={styles.inflSmall} textAnchor="middle" dominantBaseline="central" style={{ fontSize: smallFont }}>
                  {mine}:{rival}
                </text>
              )
            )}
          </g>
        );
      })}
    </svg>
  );
});

function terrainName(t: CellView['terrain']): string {
  return t === 'pond' ? '연못' : t === 'rock' ? '돌밭' : t === 'fertile' ? '비옥토' : '빈 땅';
}
