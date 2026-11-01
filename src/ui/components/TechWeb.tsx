// 테크 웹 SVG: 행성 지도 회화(assets/techweb/map.webp) 위에 그림 배지 노드. 중심에서 6방향·3고리. 줄기는 연구하면 얻는 것(방향이 여는 자원·방위)의 색, 고리는 배경 원 색과 노드 안 숫자, 곁가지는 안쪽이 얻는 것의 색·테두리가 노선색, 연구 가능 노드는 맥동
import { useId, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Direction, PlayerState, TechNode } from '../../core/types';
import { DIRECTION_NAMES, TRUNK_NAMES, DIRECTION_UNLOCKS, BUILDING_DIRECTION, BUILDING_NAMES, UNIT_NAMES, DOCTRINE_NAMES, LEVEL_NAMES } from '../../core/data/constants';
import { CORE_ID } from '../../core/data/techWeb';
import { playerMods } from '../../core/engine/derive';
import { researchBlock, researchCost, webGraph } from '../../core/engine/research';
import { useGame } from '../useGame';
import { Icon } from './Icon';
import { useFresh } from '../motion';
import { Section } from './Section';
import { Sheet } from './Sheet';
import { instantSegs, modsSegs, type Seg } from '../describe';
import { DoctrineTag, Segs } from './DoctrineTag';
import { DIRECTION_TONE, EFFECT_TONE, twigTone } from '../tones';
import mapArt from '../assets/techweb/map.webp';
import styles from './TechWeb.module.css';

const RADIUS = [0, 62, 112, 160];
const TWIG_LEGEND: [string, string][] = [
  [EFFECT_TONE.military, '군사'],
  [EFFECT_TONE.health, '건강'],
  [EFFECT_TONE.spore, '포자 안개'],
  [EFFECT_TONE.colonist, '정착민'],
  [EFFECT_TONE.sight, '시야'],
];

const TWIG_OFFSET = 22;
/** 누른 점에서 이 거리(viewBox 단위, 402px 화면에서 약 28px) 안의 가장 가까운 노드를 연다 — 작은 곁가지도 손끝으로 맞히게 */
const TAP_REACH = 34;
const TWIG_SPREAD = 11; // 도

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}

export function TechWeb({ player }: { player: PlayerState }) {
  const { game, me, myTurn, check, act } = useGame();
  const [open, setOpen] = useState<string | null>(null);
  // 마우스를 올린 노드(터치는 해당 없음 — 터치는 누르면 시트가 열린다)
  const [hover, setHover] = useState<string | null>(null);
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

  // 노드마다 따로 누르는 원을 두면 곁가지(배지 반지름 8)가 줄기의 누르는 원에 가려진다.
  // 대신 웹 전체에서 누른 점과 가장 가까운 노드를 고른다(이웃 노드 사이 가운데가 경계)
  const nearestNode = (svg: SVGSVGElement, clientX: number, clientY: number): string | null => {
    const m = svg.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    let best: string | null = null;
    let bestD = TAP_REACH;
    for (const id of Object.keys(nodes)) {
      const at = pos[id];
      if (!at) continue;
      const d = Math.hypot(at[0] - pt.x, at[1] - pt.y);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  };
  const hoverNode = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse') return;
    const id = nearestNode(e.currentTarget, e.clientX, e.clientY);
    setHover((cur) => (cur === id ? cur : id));
  };
  const pickNode = (e: ReactMouseEvent<SVGSVGElement>) => {
    // VoiceOver·스위치 제어·키보드의 '활성화'는 좌표 없는 클릭(detail 0) — 그 노드를 바로 연다
    if (e.detail === 0) {
      const g = (e.target as Element).closest<SVGElement>('[data-node]');
      if (g?.dataset.node) setOpen(g.dataset.node);
      return;
    }
    const best = nearestNode(e.currentTarget, e.clientX, e.clientY);
    if (best) setOpen(best);
  };

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
  const unlockSegs = (dir: Direction, ring: number): Seg[] => {
    const u = DIRECTION_UNLOCKS[dir];
    const parts: Seg[] = [];
    if (u.building) parts.push({ text: `${BUILDING_NAMES[u.building]} ${LEVEL_NAMES[ring]}`, tone: DIRECTION_TONE[BUILDING_DIRECTION[u.building]] });
    for (const un of u.units ?? []) if (un.levels[ring]) parts.push({ text: `${UNIT_NAMES[un.kind]} ${LEVEL_NAMES[un.levels[ring]]}`, tone: EFFECT_TONE.military });
    if (u.command?.[ring]) parts.push({ text: `지휘 +${u.command[ring]}` });
    if (u.defense?.[ring]) parts.push({ text: `방위 +${u.defense[ring]}`, tone: EFFECT_TONE.military });
    return parts.flatMap((x, i) => (i ? [{ text: ' · ' }, x] : [x]));
  };

  const nodeBody = (n: TechNode) => (
    <>
    {n.kind === 'trunk' && (
      <p>
        <span style={{ color: DIRECTION_TONE[n.direction!] }}>{DIRECTION_NAMES[n.direction!]}</span> {n.ring}고리 줄기
      </p>
    )}
    {n.kind === 'trunk' && (
      <p>
        해금: <Segs segs={unlockSegs(n.direction!, n.ring)} />
      </p>
    )}
    {n.kind === 'twig' && (
      <p>
        <DoctrineTag doctrine={n.twig!.doctrine}>
          {DOCTRINE_NAMES[n.twig!.doctrine]} +{n.twig!.points}
        </DoctrineTag>
        {[instantSegs(n.twig!.instant), modsSegs(n.twig!.mods)]
          .filter((g) => g.length)
          .map((g, i) => (
            <span key={i}>
              {' · '}
              <Segs segs={g} />
            </span>
          ))}
      </p>
    )}
    </>
  );

  return (
    <Section
      tone={`var(--seat-${p.id})`}
      title={
        <>
          <Icon name="sci" /> 테크 웹{mine ? '' : ` · ${p.name}`}
        </>
      }
      extra={
        <>
          연구 {p.researched.length - 1} · <span style={{ color: 'var(--res-sci)' }}>과학 {p.res.sci}</span>
        </>
      }
    >
      <div className={styles.frame}>
        <img className={styles.map} src={mapArt} alt="" loading="lazy" decoding="async" draggable={false} />
        <svg viewBox="-212 -212 424 424" className={styles.web} role="group" aria-label={`${p.name} 테크 웹`} onClick={pickNode} onPointerMove={hoverNode} onPointerLeave={() => setHover(null)}>
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
                data-node={n.id}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  setOpen(n.id);
                }}
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
        {hover && nodes[hover] && pos[hover] && (
          <div
            className={`${styles.tip} ${pos[hover][1] < 0 ? styles.tipBelow : ''}`}
            style={{ left: `${Math.min(80, Math.max(20, ((pos[hover][0] + 212) / 424) * 100))}%`, top: `${((pos[hover][1] + 212) / 424) * 100}%` }}
            role="tooltip"
          >
            <strong>{nodeName(hover)}</strong>
            {nodeBody(nodes[hover])}
            <p className={styles.dim}>{has(hover) ? '연구함' : (researchBlock(game, p, hover) ?? '연구 가능')}</p>
          </div>
        )}
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
          {nodeBody(node)}
          <p className={styles.dim}>{has(open) ? '연구함' : (researchBlock(game, p, open) ?? '연구 가능')}</p>
        </Sheet>
      )}
    </Section>
  );
}
