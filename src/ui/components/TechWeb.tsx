// 테크 웹 SVG: 중심에서 6방향·3고리. 고리별 색, 곁가지는 노선색, 연구 가능 노드는 맥동
import { useState } from 'react';
import type { PlayerState } from '../../core/types';
import { DIRECTION_NAMES, DIRECTION_UNLOCKS, BUILDING_NAMES, UNIT_NAMES, DOCTRINE_NAMES, LEVEL_NAMES } from '../../core/data/constants';
import { CORE_ID } from '../../core/data/techWeb';
import { playerMods } from '../../core/engine/derive';
import { researchBlock, researchCost, webGraph } from '../../core/engine/research';
import { useGame } from '../useGame';
import { Icon } from './Icon';
import { Section } from './Section';
import { Sheet } from './Sheet';
import { instantText, modsText } from '../describe';
import styles from './TechWeb.module.css';

const RADIUS = [0, 62, 112, 160];
const TWIG_OFFSET = 22;
const TWIG_SPREAD = 11; // 도

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}

export function TechWeb({ player }: { player: PlayerState }) {
  const { game, me, check, act } = useGame();
  const [open, setOpen] = useState<string | null>(null);
  const { nodes, adj } = webGraph(game.layout);
  const p = player;
  const mine = p.id === me;
  const mods = playerMods(p);

  const pos: Record<string, [number, number]> = { [CORE_ID]: [0, 0] };
  game.layout.dirOrder.forEach((dir, i) => {
    const deg = i * 60;
    for (const ring of [1, 2, 3]) {
      pos[`t:${dir}:${ring}`] = polar(RADIUS[ring], deg);
      (game.layout.twigs[`t:${dir}:${ring}`] ?? []).forEach((tw, j) => {
        pos[`w:${tw}`] = polar(RADIUS[ring] + TWIG_OFFSET, deg + (j === 0 ? -TWIG_SPREAD : TWIG_SPREAD) * (ring === 1 ? 1.6 : ring === 2 ? 1.1 : 0.85));
      });
    }
  });

  const edges: [string, string][] = [];
  for (const [a, list] of Object.entries(adj)) for (const b of list) if (a < b) edges.push([a, b]);
  const has = (id: string) => p.researched.includes(id);

  const node = open ? nodes[open] : null;
  const nodeName = (id: string) => {
    const n = nodes[id];
    if (n.kind === 'core') return '착륙지(중심)';
    if (n.kind === 'twig') return `${n.twig!.name}(${DOCTRINE_NAMES[n.twig!.doctrine]} 곁가지)`;
    return `${DIRECTION_NAMES[n.direction!]} ${n.ring}고리 줄기`;
  };
  const unlockText = (dir: keyof typeof DIRECTION_UNLOCKS, ring: number) => {
    const u = DIRECTION_UNLOCKS[dir];
    const parts: string[] = [];
    if (u.building) parts.push(`${BUILDING_NAMES[u.building]} ${LEVEL_NAMES[ring]}`);
    if (u.unit && u.unit.levels[ring]) parts.push(`${UNIT_NAMES[u.unit.kind]} ${LEVEL_NAMES[u.unit.levels[ring]]}`);
    if (u.command?.[ring]) parts.push(`지휘 +${u.command[ring]}`);
    if (u.defense?.[ring]) parts.push(`방위 +${u.defense[ring]}`);
    return parts.join(' · ');
  };

  return (
    <Section
      tone={`var(--seat-${p.id})`}
      title={
        <>
          <Icon name="sci" /> 테크 웹{mine ? '' : ` · ${p.name}`}
        </>
      }
      extra={`연구 ${p.researched.length - 1} · 과학 ${p.res.sci}`}
    >
      <svg viewBox="-192 -192 384 384" className={styles.web} role="img" aria-label={`${p.name} 테크 웹`}>
        {[1, 2, 3].map((r) => (
          <circle key={r} r={RADIUS[r]} className={styles.ring} style={{ stroke: `var(--ring${r})` }} />
        ))}
        {edges.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={pos[a][0]}
            y1={pos[a][1]}
            x2={pos[b][0]}
            y2={pos[b][1]}
            className={`${styles.edge} ${has(a) && has(b) ? styles.edgeOn : ''}`}
          />
        ))}
        {game.layout.dirOrder.map((dir, i) => {
          const [x, y] = polar(180, i * 60);
          return (
            <text key={dir} x={x} y={y} className={styles.dirLabel} textAnchor="middle" dominantBaseline="middle">
              {DIRECTION_NAMES[dir]}
            </text>
          );
        })}
        {Object.values(nodes).map((n) => {
          const [x, y] = pos[n.id];
          const done = has(n.id);
          const can = mine && !done && !researchBlock(game, p, n.id);
          const r = n.kind === 'core' ? 14 : n.kind === 'trunk' ? 12 : 7;
          const color = n.kind === 'twig' ? `var(--${n.twig!.doctrine})` : n.kind === 'core' ? 'var(--accent)' : `var(--ring${n.ring})`;
          return (
            <g
              key={n.id}
              transform={`translate(${x} ${y})`}
              onClick={() => setOpen(n.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(n.id)}
              tabIndex={0}
              className={styles.node}
              role="button"
              aria-label={`${nodeName(n.id)} · ${done ? '연구함' : can ? '연구 가능' : '잠김'}`}
            >
              <circle r={n.kind === 'twig' ? 15 : 20} className={styles.hit} />
              {can && <circle r={r + 5} className={styles.canRing} />}
              <g className={can ? 'anim-pulse' : undefined}>
                <circle r={r} style={{ stroke: color, fill: done ? color : 'var(--bg)' }} className={`${styles.dot} ${can ? styles.can : ''} ${!done && !can ? styles.off : ''}`} />
              </g>
            </g>
          );
        })}
      </svg>
      <p className={styles.legend}>
        <span style={{ color: 'var(--ring1)' }}>● 1고리</span> <span style={{ color: 'var(--ring2)' }}>● 2고리</span> <span style={{ color: 'var(--ring3)' }}>● 3고리</span> · 작은 점 = 곁가지(노선색) · 채운 점 = 연구함 · 점선 고리 = 지금 연구 가능
      </p>
      {node && open && (
        <Sheet
          title={node.kind === 'twig' ? node.twig!.name : node.kind === 'core' ? '착륙지(중심)' : `${DIRECTION_NAMES[node.direction!]} ${node.ring}고리 줄기`}
          onClose={() => setOpen(null)}
          actions={
            mine && node.kind !== 'core' && !has(open)
              ? [{ label: `연구 — 과학 ${researchCost(game, p, open, mods)} · 지휘 1`, onClick: () => act({ type: 'research', node: open }), disabled: check({ type: 'research', node: open }) }]
              : []
          }
        >
          {node.kind === 'trunk' && <p>해금: {unlockText(node.direction!, node.ring)}</p>}
          {node.kind === 'twig' && (
            <p style={{ color: `var(--${node.twig!.doctrine})` }}>
              {DOCTRINE_NAMES[node.twig!.doctrine]} +{node.twig!.points}
              {[instantText(node.twig!.instant), modsText(node.twig!.mods)].filter(Boolean).map((t) => ` · ${t}`)}
            </p>
          )}
          <p className={styles.dim}>{has(open) ? '연구함' : (researchBlock(game, p, open) ?? '연구 가능')}</p>
        </Sheet>
      )}
    </Section>
  );
}
