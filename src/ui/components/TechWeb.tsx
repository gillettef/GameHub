// 테크 웹 SVG: 행성 지도 회화(assets/techweb/map.webp) 위에 그림 배지 노드. 중심에서 6방향·3고리. 줄기는 연구하면 얻는 것(방향이 여는 자원·방위)의 색, 고리는 배경 원 색과 노드 안 숫자, 곁가지는 안쪽이 얻는 것의 색·테두리가 노선색, 연구 가능 노드는 맥동
import { useId, useState, type CSSProperties } from 'react';
import type { Direction, PlayerState, Res, TwigDef } from '../../core/types';
import { DIRECTION_NAMES, TRUNK_NAMES, DIRECTION_UNLOCKS, BUILDING_NAMES, UNIT_NAMES, DOCTRINE_NAMES, LEVEL_NAMES } from '../../core/data/constants';
import { CORE_ID } from '../../core/data/techWeb';
import { playerMods } from '../../core/engine/derive';
import { researchBlock, researchCost, webGraph } from '../../core/engine/research';
import { useGame } from '../useGame';
import { Icon } from './Icon';
import { useFresh } from '../motion';
import { Section } from './Section';
import { Sheet } from './Sheet';
import { instantText, modsText } from '../describe';
import mapArt from '../assets/techweb/map.webp';
import styles from './TechWeb.module.css';

const RADIUS = [0, 62, 112, 160];
/** 방향(줄기)이 여는 것의 색: 농업=식량, 산업=생산, 동력=에너지, 학술=과학, 문화=문화, 방위=방위 */
export const DIRECTION_TONE: Record<Direction, string> = {
  agri: 'var(--res-food)',
  industry: 'var(--res-prod)',
  power: 'var(--res-energy)',
  academic: 'var(--res-sci)',
  culture: 'var(--res-culture)',
  defense: 'var(--danger)',
};
const RES_TONE: Record<keyof Res, string> = {
  food: 'var(--res-food)',
  prod: 'var(--res-prod)',
  energy: 'var(--res-energy)',
  sci: 'var(--res-sci)',
  culture: 'var(--res-culture)',
};
/** 곁가지가 주는 것의 색: 정착민 → 자원(즉시·생산 단계) → 군사 → 건강 → 포자 안개 → 시야 → 비용 할인 순으로 첫 효과 */
export function twigTone(t: TwigDef): string {
  const { instant: i, mods: m } = t;
  if (i?.colonist) return 'var(--eff-colonist)';
  const res = (Object.keys(RES_TONE) as (keyof Res)[]).find((k) => i?.gain?.[k] || m?.income?.[k]);
  if (res) return RES_TONE[res];
  if (m?.might || m?.raidBonus || (m?.unitPower && Object.values(m.unitPower).some(Boolean))) return 'var(--danger)';
  if (m?.health) return 'var(--eff-health)';
  if (m?.sporeCap) return 'var(--eff-spore)';
  if (m?.sight) return 'var(--eff-sight)';
  if (m?.foodUpkeep) return RES_TONE.food;
  if (m?.researchDiscount || m?.trunkDiscount) return RES_TONE.sci;
  return `var(--${t.doctrine})`;
}
const TWIG_LEGEND: [string, string][] = [
  ['var(--danger)', '군사'],
  ['var(--eff-health)', '건강'],
  ['var(--eff-spore)', '포자 안개'],
  ['var(--eff-colonist)', '정착민'],
  ['var(--eff-sight)', '시야'],
];
const TWIG_OFFSET = 22;
const TWIG_SPREAD = 11; // 도

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}

export function TechWeb({ player }: { player: PlayerState }) {
  const { game, me, myTurn, check, act } = useGame();
  const [open, setOpen] = useState<string | null>(null);
  // 판마다 gradient id 가 겹치지 않게(useId 의 콜론은 url() 에서 빼 둔다)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gid = (k: string) => `ntTw${k}${uid}`;
  // 막 연구한 노드·막 이어진 선은 꽃피고 뻗어 나간다
  const fresh = useFresh(1000);
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
    return `${TRUNK_NAMES[n.direction!][n.ring]}(${DIRECTION_NAMES[n.direction!]} ${n.ring}고리 줄기)`;
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
      <div className={styles.frame}>
        <img className={styles.map} src={mapArt} alt="" loading="lazy" decoding="async" draggable={false} />
        <svg viewBox="-212 -212 424 424" className={styles.web} role="group" aria-label={`${p.name} 테크 웹`}>
          <defs>
            {/* 배지 테두리(금속)·광택·안쪽 그늘 */}
            <radialGradient id={gid('Bezel')} cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" style={{ stopColor: 'var(--text-dim)' }} />
              <stop offset="0.55" style={{ stopColor: 'var(--surface-2)' }} />
              <stop offset="1" style={{ stopColor: 'var(--bg)' }} />
            </radialGradient>
            <radialGradient id={gid('Gloss')} cx="0.38" cy="0.28" r="0.6">
              <stop offset="0" style={{ stopColor: 'var(--text)', stopOpacity: 0.55 }} />
              <stop offset="1" style={{ stopColor: 'var(--text)', stopOpacity: 0 }} />
            </radialGradient>
            <radialGradient id={gid('Shade')} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0.6" style={{ stopColor: 'var(--bg)', stopOpacity: 0 }} />
              <stop offset="1" style={{ stopColor: 'var(--bg)', stopOpacity: 0.55 }} />
            </radialGradient>
          </defs>
          {[1, 2, 3].map((r) => (
            <g key={r} style={{ stroke: `var(--ring${r})` }}>
              <circle r={RADIUS[r]} className={styles.ringBand} />
              <circle r={RADIUS[r]} className={styles.ring} />
            </g>
          ))}
          {edges.map(([a, b]) => {
            const on = has(a) && has(b);
            // fresh 는 연구한 노드에만 묻는다(안 그러면 연구 전에 '본 것'으로 기록됨)
            const draw = on && fresh(`e:${a}-${b}`);
            // 선은 먼저 연구한 쪽에서 새 노드 쪽으로 그린다
            const [from, to] = draw && fresh(`n:${a}`) ? [b, a] : [a, b];
            return (
              <g key={`${a}-${b}`}>
                <line x1={pos[a][0]} y1={pos[a][1]} x2={pos[b][0]} y2={pos[b][1]} className={styles.edgeUnder} />
                <line x1={pos[a][0]} y1={pos[a][1]} x2={pos[b][0]} y2={pos[b][1]} className={`${styles.edge} ${on && !draw ? styles.edgeOn : ''}`} />
                {draw && <line x1={pos[from][0]} y1={pos[from][1]} x2={pos[to][0]} y2={pos[to][1]} pathLength={1} className={`${styles.edge} ${styles.edgeOn} anim-draw`} />}
              </g>
            );
          })}
          {game.layout.dirOrder.map((dir, i) => {
            const [x, y] = polar(200, i * 60);
            return (
              <text key={dir} x={x} y={y} className={styles.dirLabel} style={{ fill: DIRECTION_TONE[dir] }} textAnchor="middle" dominantBaseline="middle">
                {DIRECTION_NAMES[dir]}
              </text>
            );
          })}
          {Object.values(nodes)
            .sort((a, b) => (a.kind === 'twig' ? 0 : 1) - (b.kind === 'twig' ? 0 : 1))
            .map((n) => {
            const [x, y] = pos[n.id];
            const done = has(n.id);
            const bloom = done && fresh(`n:${n.id}`);
            const can = mine && !done && !researchBlock(game, p, n.id);
            // 배지 반지름 — 장식은 모두 이 안. 연구 가능 점선 고리는 바깥 r+5 에만
            const r = n.kind === 'core' ? 16 : n.kind === 'trunk' ? 14 : 8;
            // 안쪽 = 연구하면 얻는 것, 테두리 = 줄기는 고리색·곁가지는 노선색
            const color = n.kind === 'twig' ? twigTone(n.twig!) : n.kind === 'core' ? 'var(--accent)' : DIRECTION_TONE[n.direction!];
            const rim = n.kind === 'trunk' ? `var(--ring${n.ring})` : n.kind === 'twig' ? `var(--${n.twig!.doctrine})` : color;
            const inner = r - (n.kind === 'twig' ? 2.5 : 4);
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
                <circle r={n.kind === 'twig' ? 16 : n.kind === 'core' ? 26 : 24} className={styles.hit} />
                {can && <circle r={r + 5} className={`${styles.canRing} ${myTurn ? 'anim-pulse' : ''}`} />}
                {bloom && (
                  <>
                    <circle r={r} className={`${styles.ripple} anim-ripple`} style={{ stroke: color }} />
                    <circle r={r} className={`${styles.ripple} anim-ripple`} style={{ stroke: color, '--delay': '180ms' } as CSSProperties} />
                  </>
                )}
                {/* 맥동은 내 차례에만, 연구 가능 점선 고리만 — SVG 는 합성 레이어가 아니라 계속 돌리면 무겁다 */}
                <g className={`${!done && !can ? styles.off : ''} ${bloom ? 'anim-bloom' : ''}`}>
                  <circle r={r + 1.5} cx={1} cy={2} className={styles.drop} />
                  <circle r={r} fill={`url(#${gid('Bezel')})`} style={{ stroke: rim }} className={styles.bezel} />
                  <circle r={inner} style={{ stroke: color, fill: done ? color : 'var(--bg)' }} className={`${styles.dot} ${can ? styles.can : ''}`} />
                  {done && <circle r={inner} fill={`url(#${gid('Shade')})`} />}
                  <ellipse cx={-inner * 0.25} cy={-inner * 0.4} rx={inner * 0.62} ry={inner * 0.4} fill={`url(#${gid('Gloss')})`} />
                  {n.kind === 'core' && <circle r={4} style={{ fill: done ? 'var(--accent-contrast)' : 'var(--accent)' }} />}
                  {n.kind === 'trunk' && (
                    // 고리 번호: 연구 전에는 줄기 색, 연구 후(채운 배지)에는 바탕색 글자
                    <text className={styles.ringNo} style={{ fill: done ? 'var(--bg)' : color }} textAnchor="middle" dominantBaseline="central">
                      {n.ring}
                    </text>
                  )}
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      <p className={styles.legend}>
        큰 배지 색 = 연구하면 얻는 것({game.layout.dirOrder.map((d, i) => (
          <span key={d} style={{ color: DIRECTION_TONE[d] }}>
            {i ? ' ' : ''}● {DIRECTION_NAMES[d]}
          </span>
        ))}) · 배지 안 숫자·테두리·배경 원 = 고리 · 작은 배지 = 곁가지(안쪽 색 = 얻는 것, 자원은 위와 같고{TWIG_LEGEND.map(([c, l]) => (
          <span key={l} style={{ color: c }}>
            {' '}● {l}
          </span>
        ))} · 테두리 = 노선색) · 채운 배지 = 연구함 · 점선 고리 = 지금 연구 가능
      </p>
      {node && open && (
        <Sheet
          title={node.kind === 'twig' ? node.twig!.name : node.kind === 'core' ? '착륙지(중심)' : TRUNK_NAMES[node.direction!][node.ring]}
          onClose={() => setOpen(null)}
          actions={
            mine && node.kind !== 'core' && !has(open)
              ? [{ label: `연구 — 과학 ${researchCost(game, p, open, mods)} · 지휘 1`, onClick: () => act({ type: 'research', node: open }), disabled: check({ type: 'research', node: open }) }]
              : []
          }
        >
          {node.kind === 'trunk' && <p>{DIRECTION_NAMES[node.direction!]} {node.ring}고리 줄기</p>}
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
