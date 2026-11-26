import { memo } from 'react';
import type { SpeciesId } from '../../engine';
import { DIRECTIONS, getSpecies, posKey, rotateSpot } from '../../engine';
import { hexPoints, px } from '../lib/hexGeometry';
import styles from './RootDiagram.module.css';

const HEX = hexPoints(0.92);

interface DiagramCell {
  q: number;
  r: number;
  label: string;
  tone: 'self' | 'plus' | 'minus' | 'seed' | 'none';
}

/** 명당의 고양이 모양(뿌리 모양)을 거리 2 이내 19칸 그림으로 (Rules.md 7절 표를 그림으로). 숫자는 그 칸에 모이는 고양이 수 */
function cellsFor(species: SpeciesId, rotation: number): DiagramCell[] {
  const sp = getSpecies(species);
  const map = new Map<string, DiagramCell>();
  for (let q = -2; q <= 2; q++)
    for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) map.set(posKey({ q, r }), { q, r, label: '', tone: 'none' });
  const put = (q: number, r: number, tone: DiagramCell['tone'], text: string) => {
    const c = map.get(posKey({ q, r }));
    if (c) Object.assign(c, { label: text, tone });
  };
  // 캣닢 화분(민들레 씨앗) 멀리 보내기: 두 칸 안 어디든 → 빈 칸을 옅게 표시
  if (sp.seed) for (const c of map.values()) if (c.q !== 0 || c.r !== 0) c.tone = 'seed';
  if (sp.wither) DIRECTIONS.forEach(([dq, dr]) => put(dq, dr, 'minus', `−${sp.wither}`));
  for (const spot of sp.roots) {
    const { dq, dr, n } = rotateSpot(spot, rotation);
    put(dq, dr, dq === 0 && dr === 0 ? 'self' : 'plus', String(n));
  }
  return [...map.values()];
}

/**
 * 카드에 그리는 고양이 모양 미니 도식. 가운데가 명당을 놓는 칸, 숫자는 그 칸에 모이는 고양이 수(확대 카드에서만).
 * 미니 카드에서는 색으로만 보여 준다: 주황 = 놓는 칸, 갈색 = 고양이가 모이는 칸, 빨강 = 남의 고양이를 쫓아내는 칸(빗자루 할머니),
 * 옅은 갈색 = 멀리 보낼 수 있는 칸(캣닢 화분). rotation 은 놓을 때 고르는 방향(0 = 카드에 그린 그대로).
 */
export const RootDiagram = memo(function RootDiagram({ species, size = 72, rotation = 0 }: { species: SpeciesId; size?: number; rotation?: number }) {
  const cells = cellsFor(species, rotation);
  const showLabels = size >= 80;
  // 12px 하한: viewBox 폭 8.8 단위가 size px 로 그려진다
  const labelSize = Math.max(1, 12 / (size / 8.8));
  return (
    <svg className={styles.root} viewBox="-4.4 -3.9 8.8 7.8" width={size} height={(size * 7.8) / 8.8} role="img" aria-label={`${getSpecies(species).name} 고양이 모양`}>
      {cells.map((c) => {
        const { x, y } = px(c.q, c.r);
        return (
          <g key={posKey(c)} transform={`translate(${x.toFixed(3)} ${y.toFixed(3)})`}>
            <polygon points={HEX} className={styles[c.tone]} />
            {/* 미니 카드(작은 크기)에서는 숫자가 12px 밑으로 작아져 색만 보여 준다. 숫자는 확대 카드에서 */}
            {c.label && showLabels && (
              <text className={styles.label} textAnchor="middle" dominantBaseline="central" style={{ fontSize: labelSize }}>
                {c.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
});
