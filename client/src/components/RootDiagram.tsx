import { memo } from 'react';
import type { SpeciesId } from '@rootbound/shared';
import { getSpecies } from '@rootbound/shared';
import styles from './RootDiagram.module.css';

/** 축 좌표 → 픽셀 (pointy-top, 반지름 1) */
const px = (q: number, r: number) => ({ x: Math.sqrt(3) * (q + r / 2), y: 1.5 * r });
const HEX = [0, 1, 2, 3, 4, 5].map((i) => {
  const a = (Math.PI / 180) * (60 * i - 30);
  return `${(Math.cos(a) * 0.92).toFixed(3)},${(Math.sin(a) * 0.92).toFixed(3)}`;
}).join(' ');
const DIRS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

interface DiagramCell {
  q: number;
  r: number;
  label: string;
  tone: 'self' | 'plus' | 'minus' | 'none';
}

/** 종의 뿌리 모양을 거리 2 이내 19칸 그림으로 (Rules.md 7절 표를 그림으로) */
function cellsFor(species: SpeciesId): DiagramCell[] {
  const sp = getSpecies(species);
  const map = new Map<string, DiagramCell>();
  for (let q = -2; q <= 2; q++)
    for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) map.set(`${q},${r}`, { q, r, label: '', tone: 'none' });
  const put = (q: number, r: number, v: number, tone: DiagramCell['tone'], text?: string) => {
    const c = map.get(`${q},${r}`);
    if (c && v !== 0) Object.assign(c, { label: text ?? String(v), tone });
  };
  put(0, 0, sp.self, 'self');
  DIRS.forEach(([dq, dr]) => {
    if (sp.ring1) put(dq, dr, sp.ring1, 'plus', sp.fertileRing ? `${sp.ring1}+` : undefined);
    if (sp.wither) put(dq, dr, -sp.wither, 'minus', `−${sp.wither}`);
    if (sp.star2) put(dq * 2, dr * 2, sp.star2, 'plus');
  });
  if (sp.line) for (let k = 1; k <= sp.lineLength; k++) put(k, 0, sp.line, 'plus');
  return [...map.values()];
}

/**
 * 카드에 그리는 뿌리 모양 미니 다이어그램. 가운데가 심는 칸, 숫자는 그 칸에 주는 영향력(확대 카드에서만).
 * 미니 카드에서는 색으로만 보여 준다: 노랑 = 심는 칸, 초록 = 영향을 주는 칸, 빨강 = 상대 영향력을 깎는 칸.
 * 칡은 오른쪽(방향 0)을 예로 그린다(실제로는 심을 때 방향을 고른다).
 */
export const RootDiagram = memo(function RootDiagram({ species, size = 72 }: { species: SpeciesId; size?: number }) {
  const cells = cellsFor(species);
  const showLabels = size >= 80;
  // 12px 하한: viewBox 폭 8.8 단위가 size px 로 그려진다
  const labelSize = Math.max(1, 12 / (size / 8.8));
  return (
    <svg className={styles.root} viewBox="-4.4 -3.9 8.8 7.8" width={size} height={(size * 7.8) / 8.8} role="img" aria-label={`${getSpecies(species).name} 뿌리 모양`}>
      {cells.map((c) => {
        const { x, y } = px(c.q, c.r);
        return (
          <g key={`${c.q},${c.r}`} transform={`translate(${x.toFixed(3)} ${y.toFixed(3)})`}>
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
