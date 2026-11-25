import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DIRECTIONS, getSpecies, posKey } from '../../engine';
import type { CellView, PlantPreview } from '../game/derived';
import { plantArtUrl } from '../game/cardImages';
import { cx } from '../lib/cx';
import { hexPoints, px } from '../lib/hexGeometry';
import { BoardTextures } from './BoardTextures';
import styles from './HexBoard.module.css';

/** 화면 글자 최소 크기(px, CLAUDE.md 모바일 우선) */
const MIN_TEXT_PX = 12;

/*
 * 칸 모양은 사용자 시안(notes/design/board-2p.svg, 칸 반지름 68px)을 반지름 1로 옮긴 값이다:
 * 바깥 테두리(굵은 선) → 줄눈(반지름 1) → 지형 타일(0.95) → 구역 경계선 → 칸 위 요소.
 */
const CELL_R = 1.007;
const TILE_R = 0.95;
const HEX = hexPoints(TILE_R);
const HEX_INNER = hexPoints(0.8);
/** 입구: 자리 색 집 모양 + 자리 번호 */
const HOUSE = '0,-0.52 0.42,-0.12 0.42,0.44 -0.42,0.44 -0.42,-0.12';
/** 시안 좌표(px, 칸 중심 기준)를 그대로 쓰는 장식은 1/68 로 줄여 그린다 */
const ART_SCALE = 'scale(0.0147)';
const SPROUT_STEM = 'M0,-19V-39.4';
const SPROUT_LEAF_L = 'M0,-34q-15,-2.7 -17.7,-16.3q13.6,-1.4 17.7,16.3Z';
const SPROUT_LEAF_R = 'M0,-29.9q15,-1.4 19,-13.6q-13.6,-2.7 -19,13.6Z';
const WAVES = 'M-28.6,-5.4q14.3,-11.6 28.6,0t28.6,0M-28.6,17.7q14.3,-11.6 28.6,0t28.6,0';
/** 식물 썸네일: 자리 색 고리 바깥 반지름 / 그림 반지름 */
const THUMB_RING = 0.7;
const THUMB_ART = 0.58;

/** 이웃 방향 0~5(shared DIRECTIONS, Rules.md 2절)의 화면 각도(도) */
const DIR_DEG = [0, -60, -120, 180, 120, 60];
const DIRS = DIRECTIONS.map(([dq, dr], i) => [dq, dr, DIR_DEG[i] as number] as const);

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
  /** 칸마다 뿌리(큐브) 수를 보여 준다 */
  showRootCounts: boolean;
  /** 칸마다 칸 이름(C4)을 보여 준다 */
  showLabels?: boolean;
  onCellClick: (q: number, r: number) => void;
}

const terrainFill: Record<CellView['terrain'], string> = {
  empty: 'url(#rb-grass)',
  fertile: 'url(#rb-loam)',
  pond: 'url(#rb-water)',
  rock: 'url(#rb-gravel)',
};

/**
 * 정원 보드 (Rules.md 3절, 축 좌표 육각). SVG 라 컨테이너 크기에 맞춰 늘고 줄어든다(무스크롤, F015).
 * 바닥(테두리·줄눈·지형 질감·구역 경계)은 보드 좌표 그대로 한 번에 그려 질감이 칸마다 이어지고,
 * 칸마다 땅 주인 자리 색(옅게) → 지형 장식 → 입구(집 모양·번호) / 식물(카드 그림 썸네일 + 땅 주인 색 고리) → 뿌리 큐브 수(주인 색 배지)를 올린다.
 * 식물은 누구의 것도 아니므로 고리 색은 심은 사람이 아니라 그 칸의 땅 주인 색이다(Rules.md 1절).
 */
export const HexBoard = memo(function HexBoard({ cells, legal, legalFaint, seedLegal, pendingKey, seedKey, preview, showRootCounts, showLabels = false, onCellClick }: HexBoardProps) {
  const box = useMemo(() => {
    const pts = cells.map((c) => px(c.q, c.r));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs) - 1.2;
    const minY = Math.min(...ys) - 1.3;
    return { minX, minY, w: Math.max(...xs) + 1.2 - minX, h: Math.max(...ys) + 1.3 - minY };
  }, [cells]);
  const viewBox = `${box.minX.toFixed(2)} ${box.minY.toFixed(2)} ${box.w.toFixed(2)} ${box.h.toFixed(2)}`;

  // 바닥 층: 칸 위치·지형·구역만으로 정해지므로 보드가 바뀔 때만 다시 만든다
  const ground = useMemo(() => {
    const byKey = new Map(cells.map((c) => [posKey(c), c]));
    // 테두리·줄눈은 칸 육각을 하나의 path 로 합쳐 노드 수를 줄인다
    const outline = cells
      .map((c) => {
        const { x, y } = px(c.q, c.r);
        return `M${hexPoints(CELL_R, x, y).replace(/ /g, 'L')}Z`;
      })
      .join('');
    const tiles = cells.map((c) => {
      const { x, y } = px(c.q, c.r);
      return { key: c.key, points: hexPoints(TILE_R, x, y), fill: terrainFill[c.terrain] };
    });
    // 구역(정원 조각) 경계: 이웃 칸과 구역 번호가 다른 변
    let zone = '';
    for (const c of cells) {
      const { x, y } = px(c.q, c.r);
      for (const [dq, dr, deg] of DIRS) {
        const n = byKey.get(posKey({ q: c.q + dq, r: c.r + dr }));
        if (!n || n.tile === c.tile || n.q * 1000 + n.r < c.q * 1000 + c.r) continue;
        const a1 = (Math.PI / 180) * (deg - 30);
        const a2 = (Math.PI / 180) * (deg + 30);
        zone += `M${(x + Math.cos(a1)).toFixed(3)},${(y + Math.sin(a1)).toFixed(3)}L${(x + Math.cos(a2)).toFixed(3)},${(y + Math.sin(a2)).toFixed(3)}`;
      }
    }
    return { outline, tiles, zone };
    // 지형·구역은 판 중에 바뀌지 않는다. 칸 목록이 새로 와도 모양이 같으면 같은 키가 나온다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells.map((c) => `${c.key}${c.terrain}${c.tile}`).join('|')]);

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
  const seatFont = Math.max(0.56, fontFloor);
  // 뿌리 수 배지가 칸을 덮지 않게 상한을 둔다. 보드가 아주 작으면(ppu<15·17) 12px 하한보다 칸 크기를 우선한다(의도된 예외).
  // 식물 칸 배지는 별도 층이라 이웃 칸에 조금 걸쳐도 되므로 상한을 넉넉히 둔다
  const rootFont = Math.min(Math.max(0.7, fontFloor), 0.8);
  const smallFont = Math.min(Math.max(0.5, fontFloor), 0.7);
  const rootR = Math.max(0.36, rootFont * 0.5);
  // 칸 이름은 칸 위쪽 끝에 작게, 12px 하한을 지킨다. 별도 층이라 4인 보드(ppu≈18 → 0.67)에서 칸 위로 조금 넘쳐도 된다.
  // 상한 0.8 은 "E10" 이 칸 폭(√3)을 넘지 않는 크기다
  const labelFont = Math.min(Math.max(0.36, fontFloor), 0.8);
  const smallR = Math.max(0.3, smallFont * 0.56);

  return (
    <svg ref={svgRef} className={styles.board} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="group" aria-label="정원 보드">
      <BoardTextures />
      <path d={ground.outline} className={styles.frame} aria-hidden="true" />
      <path d={ground.outline} className={styles.grout} aria-hidden="true" />
      <g aria-hidden="true">
        {ground.tiles.map((t) => (
          <polygon key={t.key} points={t.points} fill={t.fill} />
        ))}
      </g>
      <path d={ground.zone} className={styles.zoneLine} aria-hidden="true" />
      {cells.map((c) => {
        const { x, y } = px(c.q, c.r);
        const flipTo = preview?.flips.get(c.key);
        const isLegal = legal.has(c.key);
        const isSeedLegal = seedLegal?.has(c.key) ?? false;
        const interactive = isLegal || isSeedLegal;
        const ownerStyle = c.owner >= 0 ? ({ '--owner': `var(--color-seat-${c.owner})` } as CSSProperties) : undefined;
        const label = `${c.label} ${terrainName(c.terrain)}${c.plant ? ` · ${getSpecies(c.plant.species).name}` : ''}${c.owner >= 0 ? ` · ${c.owner + 1}번 자리 땅, 뿌리 ${c.cubes}` : ''}`;
        const bare = !c.plant && c.entranceSeat < 0;
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
            <polygon points={HEX} className={styles.hit} />
            {c.owner >= 0 && <polygon points={HEX} className={styles.owned} style={ownerStyle} />}
            {c.terrain === 'fertile' && bare && (
              <g transform={ART_SCALE} className={styles.sprout}>
                <path d={SPROUT_STEM} className={styles.sproutStem} />
                <path d={SPROUT_LEAF_L} className={styles.sproutLeafHi} />
                <path d={SPROUT_LEAF_R} className={styles.sproutLeafLo} />
              </g>
            )}
            {c.terrain === 'pond' && (
              <g transform={ART_SCALE} className={styles.pondArt}>
                <path d={WAVES} className={styles.waves} />
                <ellipse cx={-20.4} cy={-30.6} rx={10.9} ry={3.4} className={styles.glint} />
              </g>
            )}
            {c.terrain === 'rock' && (
              <g transform={ART_SCALE} className={styles.rockArt}>
                <ellipse cx={-13.6} cy={4.1} rx={23.1} ry={16.3} />
                <ellipse cx={19.1} cy={-16.3} rx={15} ry={10.9} />
              </g>
            )}
            {flipTo !== undefined && (
              <polygon points={HEX_INNER} className={styles.flip} style={flipTo >= 0 ? ({ '--owner': `var(--color-seat-${flipTo})` } as CSSProperties) : undefined} />
            )}
            {(isLegal || isSeedLegal) && <polygon points={HEX_INNER} className={isSeedLegal ? styles.seedLegal : legalFaint ? styles.legalFaint : styles.legal} />}
            {c.entranceSeat >= 0 && (
              <g className={styles.entrance} style={{ '--seat': `var(--color-seat-${c.entranceSeat})` } as CSSProperties}>
                <polygon points={HOUSE} />
                <text textAnchor="middle" y={0.3} style={{ fontSize: seatFont }}>
                  {c.entranceSeat + 1}
                </text>
              </g>
            )}
            {c.plant && (
              <g key={c.plant.id} className={cx(styles.plant, c.owner < 0 && styles.plantWild)} style={c.owner >= 0 ? ({ '--seat': `var(--color-seat-${c.owner})` } as CSSProperties) : undefined}>
                <circle r={THUMB_RING} className={styles.thumbRing} />
                <image
                  href={plantArtUrl(c.plant.species)}
                  x={-THUMB_ART}
                  y={-THUMB_ART}
                  width={THUMB_ART * 2}
                  height={THUMB_ART * 2}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath="url(#rb-thumb)"
                />
                <circle r={THUMB_ART} className={styles.thumbEdge} />
              </g>
            )}
            {pendingKey === c.key && <polygon points={HEX} className={styles.pending} />}
            {seedKey === c.key && <circle r={0.3} className={styles.seedPending} />}
          </g>
        );
      })}
      {/* 뿌리 수 배지는 칸 반복 뒤 별도 층에 그려, 식물 칸 배지가 아래 줄 칸에 가려지지 않게 한다 */}
      <g aria-hidden="true">
        {cells.map((c) => {
          const touched = preview?.touched.get(c.key);
          if (!(showRootCounts || touched !== undefined) || !(c.cubes > 0 || touched !== undefined)) return null;
          const shown: [number, number] = touched ?? [c.owner, c.cubes];
          const { x, y } = px(c.q, c.r);
          const tx = c.plant ? x + 0.46 : x;
          const ty = c.plant ? y + 0.46 : y;
          return (
            <g
              key={c.key}
              className={cx(styles.cubes, touched !== undefined && styles.cubesChanged)}
              transform={`translate(${tx.toFixed(3)} ${ty.toFixed(3)})`}
              style={shown[0] >= 0 ? ({ '--owner': `var(--color-seat-${shown[0]})` } as CSSProperties) : undefined}
            >
              <circle r={c.plant ? smallR : rootR} className={shown[0] >= 0 ? styles.cubeDot : styles.cubeEmpty} />
              <text textAnchor="middle" dominantBaseline="central" style={{ fontSize: c.plant ? smallFont : rootFont }}>
                {shown[1]}
              </text>
            </g>
          );
        })}
      </g>
      {showLabels && (
        <g aria-hidden="true" className={styles.labels} style={{ fontSize: labelFont }}>
          {cells.map((c) => {
            const { x, y } = px(c.q, c.r);
            return (
              <text key={c.key} x={x.toFixed(3)} y={(y - 0.62).toFixed(3)} textAnchor="middle" dominantBaseline="central">
                {c.label}
              </text>
            );
          })}
        </g>
      )}
    </svg>
  );
});

function terrainName(t: CellView['terrain']): string {
  return t === 'pond' ? '연못' : t === 'rock' ? '바위' : t === 'fertile' ? '기름진 땅' : '빈 땅';
}
