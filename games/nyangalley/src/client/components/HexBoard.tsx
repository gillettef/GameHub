import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DIRECTIONS, getSpecies, posKey } from '../../engine';
import { crewName, type CellView, type PlantPreview } from '../game/derived';
import { cx } from '../lib/cx';
import { ART_SEATS, catArtId, hexPoints, hideoutArtId, px, spotArtUrl, terrainArtId } from '../lib/hexGeometry';
import { BoardTextures } from './BoardTextures';
import styles from './HexBoard.module.css';

/** 화면 글자 최소 크기(px, CLAUDE.md 모바일 우선) */
const MIN_TEXT_PX = 12;

/*
 * 칸 층: 바깥 테두리(굵은 선) → 줄눈(반지름 1) → 지형 그림(0.95) → 조각 경계선 → 칸 위 요소.
 * 그림(public/art)은 꼭짓점까지 반지름 1 기준이라 scale 만 주면 된다.
 */
const CELL_R = 1.007;
const TILE_R = 0.95;
const TILE_SCALE = `scale(${TILE_R})`;
const HEX = hexPoints(TILE_R);
const HEX_INNER = hexPoints(0.8);
/** 자리 3(그림 없음) 아지트에 두르는 자리 색 테 */
const HEX_SEAT_RING = hexPoints(0.72);
/** 명당 타일 반지름: 땅 주인 색 테(0.95)가 둘레에 보이게 조금 작게 */
const SPOT_R = 0.8;
/** 고양이 토큰 반지름: 빈 칸은 가운데 크게, 명당 칸은 오른쪽 아래에 작게 */
const CAT_R = 0.5;
const CAT_R_SPOT = 0.34;
const CAT_SPOT_DX = 0.5;
const CAT_SPOT_DY = 0.44;

/** 이웃 방향 0~5(shared DIRECTIONS, Rules.md 2절)의 화면 각도(도) */
const DIR_DEG = [0, -60, -120, 180, 120, 60];
const DIRS = DIRECTIONS.map(([dq, dr], i) => [dq, dr, DIR_DEG[i] as number] as const);

interface HexBoardProps {
  cells: CellView[];
  /** 지금 고른 카드로 놓을 수 있는 칸 */
  legal: Set<string>;
  /** 카드를 고르기 전: legal 은 손패 어느 카드로든 놓을 수 있는 칸이고, 옅게 그린다 */
  legalFaint?: boolean;
  /** 멀리 보내기(씨앗) 고르기 중이면 고양이를 보낼 수 있는 칸 */
  seedLegal?: Set<string>;
  pendingKey?: string | null;
  seedKey?: string | null;
  preview?: PlantPreview | null;
  /** 칸마다 고양이(큐브) 마릿수를 보여 준다(2마리 이상, 놓기 미리보기는 늘) */
  showRootCounts: boolean;
  /** 칸마다 칸 이름(C4)을 보여 준다 */
  showLabels?: boolean;
  onCellClick: (q: number, r: number) => void;
}

/**
 * 골목 보드 (Rules.md 3절, 축 좌표 육각). SVG 라 컨테이너 크기에 맞춰 늘고 줄어든다(무스크롤, F015).
 * 바닥(테두리·줄눈·지형 그림·조각 경계)은 보드가 바뀔 때만 다시 만들고, 지형 그림은 `<defs>` 의 그림 하나를 `<use>` 로 칸마다 다시 쓴다.
 * 칸마다 영역 주인 자리 색(반투명 + 테) → 아지트 그림 / 명당 타일(회전 반영) → 하이라이트, 그 위 별도 층에 고양이 토큰 + 마릿수를 올린다.
 * 명당은 누구의 것도 아니므로 둘레 색은 놓은 사람이 아니라 그 칸 영역 주인 색이다(Rules.md 1절).
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
      return { key: c.key, transform: `translate(${x.toFixed(3)} ${y.toFixed(3)}) ${TILE_SCALE}`, href: `#${terrainArtId[c.terrain]}` };
    });
    // 조각(골목 조각, 7칸 묶음) 경계: 이웃 칸과 조각 번호가 다른 변
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
  // 마릿수 배지는 고양이 토큰 오른쪽 아래에 붙는다. 보드가 아주 작으면(ppu<17) 12px 하한보다 칸 크기를 우선한다(의도된 예외).
  // 배지는 별도 층이라 이웃 칸에 조금 걸쳐도 된다
  const countFont = Math.min(Math.max(0.5, fontFloor), 0.7);
  const countR = Math.max(0.26, countFont * 0.56);
  // 칸 이름은 칸 위쪽 끝에 작게, 12px 하한을 지킨다. 별도 층이라 4인 보드(ppu≈18 → 0.67)에서 칸 위로 조금 넘쳐도 된다.
  // 상한 0.8 은 "E10" 이 칸 폭(√3)을 넘지 않는 크기다
  const labelFont = Math.min(Math.max(0.36, fontFloor), 0.8);

  return (
    <svg ref={svgRef} className={styles.board} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="group" aria-label="골목 보드">
      <BoardTextures />
      <path d={ground.outline} className={styles.frame} aria-hidden="true" />
      <path d={ground.outline} className={styles.grout} aria-hidden="true" />
      <g aria-hidden="true">
        {ground.tiles.map((t) => (
          <use key={t.key} href={t.href} transform={t.transform} />
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
        const label =
          `${c.label} ${terrainName(c.terrain)}` +
          (c.entranceSeat >= 0 ? ` · ${crewName(c.entranceSeat)} 아지트` : '') +
          (c.plant ? ` · 명당 ${getSpecies(c.plant.species).name}` : '') +
          (c.owner >= 0 ? ` · ${crewName(c.owner)} 영역, 고양이 ${c.cubes}마리` : '');
        return (
          <g
            key={c.key}
            transform={`translate(${x.toFixed(3)} ${y.toFixed(3)})`}
            className={cx(styles.cell, interactive && styles.clickable)}
            onClick={() => onCellClick(c.q, c.r)}
            // 놓을 수 있는 칸·멀리 보내기 칸만 키보드로 고를 수 있게 한다(탭 정지 수를 줄인다)
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
            {c.entranceSeat >= 0 && (
              <g className={styles.entrance} style={{ '--seat': `var(--color-seat-${c.entranceSeat})` } as CSSProperties}>
                <use href={`#${hideoutArtId(c.entranceSeat)}`} transform={TILE_SCALE} />
                {c.entranceSeat >= ART_SEATS && <polygon points={HEX_SEAT_RING} className={styles.seatRing} />}
              </g>
            )}
            {c.plant && (
              <g key={c.plant.id} className={styles.plant}>
                <image
                  href={spotArtUrl(c.plant.species)}
                  x={-SPOT_R}
                  y={-SPOT_R}
                  width={SPOT_R * 2}
                  height={SPOT_R * 2}
                  // 규칙 회전 1번 = (dq,dr)→(−dr,dq+dr) = 화면 시계 방향 60°
                  transform={c.plant.rotation ? `rotate(${c.plant.rotation * 60})` : undefined}
                />
              </g>
            )}
            {flipTo !== undefined && (
              <polygon points={HEX_INNER} className={styles.flip} style={flipTo >= 0 ? ({ '--owner': `var(--color-seat-${flipTo})` } as CSSProperties) : undefined} />
            )}
            {interactive && <polygon points={HEX_INNER} className={isSeedLegal ? styles.seedLegal : legalFaint ? styles.legalFaint : styles.legal} />}
            {pendingKey === c.key && <polygon points={HEX} className={styles.pending} />}
            {seedKey === c.key && <circle r={0.3} className={styles.seedPending} />}
          </g>
        );
      })}
      {/* 고양이 토큰은 칸 반복 뒤 별도 층에 그려, 명당 칸 토큰·배지가 아래 줄 칸에 가려지지 않게 한다 */}
      <g aria-hidden="true">
        {cells.map((c) => {
          const touched = preview?.touched.get(c.key);
          if (!(c.cubes > 0 || touched !== undefined)) return null;
          const [seat, count] = touched ?? [c.owner, c.cubes];
          const { x, y } = px(c.q, c.r);
          const small = c.plant !== null;
          const r = small ? CAT_R_SPOT : CAT_R;
          const tx = small ? x + CAT_SPOT_DX : x;
          const ty = small ? y + CAT_SPOT_DY : y;
          // 마릿수: 2마리 이상이면(설정에서 끌 수 있다), 놓기 미리보기로 바뀌는 칸은 늘 보여 준다
          const showCount = touched !== undefined || (showRootCounts && count >= 2);
          return (
            <g
              key={c.key}
              className={cx(styles.cats, touched !== undefined && styles.catsChanged)}
              transform={`translate(${tx.toFixed(3)} ${ty.toFixed(3)})`}
              style={seat >= 0 ? ({ '--owner': `var(--color-seat-${seat})` } as CSSProperties) : undefined}
            >
              {seat >= 0 ? (
                <>
                  <use href={`#${catArtId(seat)}`} transform={`scale(${r})`} />
                  {seat >= ART_SEATS && <circle r={r * 0.94} className={styles.catRing} />}
                </>
              ) : (
                <circle r={r * 0.7} className={styles.catEmpty} />
              )}
              {showCount && (
                <g transform={seat >= 0 ? `translate(${(r * 0.72).toFixed(3)} ${(r * 0.72).toFixed(3)})` : undefined}>
                  <circle r={countR} className={styles.countBadge} />
                  <text textAnchor="middle" dominantBaseline="central" style={{ fontSize: countFont }}>
                    {count}
                  </text>
                </g>
              )}
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
  return t === 'pond' ? '개울' : t === 'rock' ? '공사장' : t === 'fertile' ? '햇볕 자리' : '골목길';
}
