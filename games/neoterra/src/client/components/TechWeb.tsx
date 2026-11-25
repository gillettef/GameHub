// 테크 웹 SVG: 행성 지도 회화(assets/techweb/map.webp) 위에 그림 배지 노드. 중심에서 6방향·3고리. 줄기는 연구하면 얻는 것(방향이 여는 자원·방위)의 색, 고리는 배경 원 색과 노드 안 숫자, 곁가지는 안쪽이 얻는 것의 색·테두리가 노선색, 연구 가능 노드는 맥동
// 내 차례에는 연구 가능 노드 안에 과학 비용을 쓰고, 상대 웹은 내 직전 차례 이후 새로 연구한 노드를 고리로 강조한다.
// 무거운 SVG 는 WebSvg(memo)로 떼어, 그 판의 연구·연구 가능·비용이 그대로면 다시 그리지 않는다
import { memo, useCallback, useId, useMemo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Direction, TechNode, PlayerState, WebLayout } from '../../engine/types';
import { DIRECTION_NAMES, TRUNK_NAMES, DIRECTION_UNLOCKS, BUILDING_DIRECTION, BUILDING_NAMES, UNIT_NAMES, DOCTRINE_NAMES, LEVEL_NAMES } from '../../engine/data/constants';
import { CORE_ID } from '../../engine/data/techWeb';
import { commandLeft, playerMods } from '../../engine/rules/derive';
import { researchBlock, researchCost, webGraph } from '../../engine/rules/research';
import { useApp } from '../store/app';
import { useGame } from '../useGame';
import { newlyResearched } from '../turnWatch';
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

/** 곁가지가 줄기에서 바깥으로 떨어진 거리. 반지름 10 곁가지가 다음 고리 줄기·이웃 곁가지·방향 이름표와 겹치지 않는 값(360px 에서도) */
const TWIG_OFFSET = 28;
/** 곁가지 배지 반지름 — 360px 화면에서 지름 약 17px */
const TWIG_R = 10;
/** 누른 점에서 이 거리(viewBox 단위, 402px 화면에서 약 28px) 안의 가장 가까운 노드를 연다 — 작은 곁가지도 손끝으로 맞히게 */
const TAP_REACH = 34;
const TWIG_SPREAD = 11; // 도

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}

function layoutPositions(layout: WebLayout): Record<string, [number, number]> {
  const pos: Record<string, [number, number]> = { [CORE_ID]: [0, 0] };
  layout.dirOrder.forEach((dir, i) => {
    const deg = i * 60;
    for (const ring of [1, 2, 3]) {
      pos[`t:${dir}:${ring}`] = polar(RADIUS[ring], deg);
      (layout.twigs[`t:${dir}:${ring}`] ?? []).forEach((tw, j) => {
        pos[`w:${tw}`] = polar(RADIUS[ring] + TWIG_OFFSET, deg + (j === 0 ? -TWIG_SPREAD : TWIG_SPREAD) * (ring === 1 ? 1.6 : ring === 2 ? 1.1 : 0.85));
      });
    }
  });
  return pos;
}

function nodeName(nodes: Record<string, TechNode>, id: string): string {
  const n = nodes[id];
  if (n.kind === 'core') return '착륙지(중심)';
  if (n.kind === 'twig') return `${n.twig!.name}(${DOCTRINE_NAMES[n.twig!.doctrine]} 곁가지)`;
  return `${TRUNK_NAMES[n.direction!][n.ring]}(${DIRECTION_NAMES[n.direction!]} ${n.ring}고리 줄기)`;
}
const shortName = (n: TechNode) => (n.kind === 'twig' ? n.twig!.name : n.kind === 'trunk' ? TRUNK_NAMES[n.direction!][n.ring] : '착륙지');

export function TechWeb({ player }: { player: PlayerState }) {
  const { game, me, myTurn, watching, check, act } = useGame();
  const mark = useApp((s) => s.mark);
  const [open, setOpen] = useState<string | null>(null);
  // 마우스를 올린 노드(터치는 해당 없음 — 터치는 누르면 시트가 열린다)
  const [hover, setHover] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const { nodes } = webGraph(game.layout);
  const layoutKey = game.layout.dirOrder.join(',') + '|' + Object.values(game.layout.twigs).flat().join(',');
  // 배치가 같으면 위치도 같다(상태는 행동마다 깊은 복사라 layout 객체는 매번 새것 — 키로 비교)
  const pos = useMemo(() => layoutPositions(game.layout), [layoutKey]);
  const p = player;
  const mine = p.id === me && !watching;
  const mods = playerMods(p);
  const has = (id: string) => p.researched.includes(id);

  // 연구 가능 노드(내 웹만)와 내 차례의 비용
  const can = mine ? Object.keys(nodes).filter((id) => nodes[id].kind !== 'core' && !has(id) && !researchBlock(game, p, id)) : [];
  const costs = mine && myTurn ? can.map((id) => researchCost(game, p, id, mods)) : [];
  const fresh = mine ? [] : [...newlyResearched(mark, p.id, p.researched)];
  // 열린 곳(점선) 중 지금 과학·지휘로 바로 연구할 수 있는 곳
  const affordable = mine && myTurn && commandLeft(game, p) > 0 ? costs.filter((c) => c <= p.res.sci).length : 0;

  const pick = useCallback((id: string) => setOpen(id), []);
  const hoverTo = useCallback((id: string | null) => setHover((cur) => (cur === id ? cur : id)), []);

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

  const node = open ? nodes[open] : null;
  const newNames = fresh.filter((id) => nodes[id]).map((id) => shortName(nodes[id]));

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
        <WebSvg
          layout={game.layout}
          layoutKey={layoutKey}
          pos={pos}
          name={p.name}
          researched={p.researched.join(',')}
          can={can.join(',')}
          costs={costs.join(',')}
          fresh={fresh.join(',')}
          pulse={mine && myTurn}
          onPick={pick}
          onHover={hoverTo}
        />
        {hover && nodes[hover] && pos[hover] && (
          <div
            className={`${styles.tip} ${pos[hover][1] < 0 ? styles.tipBelow : ''}`}
            style={{ left: `${Math.min(80, Math.max(20, ((pos[hover][0] + 212) / 424) * 100))}%`, top: `${((pos[hover][1] + 212) / 424) * 100}%` }}
            role="tooltip"
          >
            <strong>{nodeName(nodes, hover)}</strong>
            {nodeBody(nodes[hover])}
            <p className={styles.dim}>{has(hover) ? '연구함' : (researchBlock(game, p, hover) ?? '연구 가능')}</p>
          </div>
        )}
      </div>
      {/* 웹 아래: 연구 가능한 곳(내 웹) 또는 새로 연구한 곳(상대 웹) + 보는 법 */}
      <div className={styles.chips}>
        {mine && can.length > 0 && (
          <span className={styles.chipsLabel}>
            열린 곳 {can.length}
            {myTurn ? ` · 지금 연구 가능 ${affordable}` : ''}
          </span>
        )}
        {mine &&
          can.map((id, i) => (
            <button key={id} className={styles.chip} onClick={() => setOpen(id)} style={{ '--tone': nodes[id].kind === 'twig' ? `var(--${nodes[id].twig!.doctrine})` : `var(--ring${nodes[id].ring})` } as CSSProperties}>
              {shortName(nodes[id])}
              {myTurn && <b className={`${styles.chipCost} ${costs[i] > p.res.sci ? styles.short : ''}`}>{costs[i]}</b>}
            </button>
          ))}
        {!mine && newNames.length > 0 && <span className={styles.newNote}>내 직전 차례 이후 새 연구: {newNames.join(', ')}</span>}
        <button className={styles.help} onClick={() => setHelp(true)}>
          보는 법
        </button>
      </div>
      {help && (
        <Sheet title="테크 웹 보는 법" onClose={() => setHelp(false)}>
          <ul className={styles.legend}>
            <li>
              큰 배지 = 줄기. 색은 연구하면 얻는 것(
              {game.layout.dirOrder.map((d, i) => (
                <span key={d} style={{ color: DIRECTION_TONE[d] }}>
                  {i ? ' ' : ''}● {DIRECTION_NAMES[d]}
                </span>
              ))}
              ).
            </li>
            <li>배지 안 숫자·테두리·배경 원 = 고리(1~3). 시대가 올라야 바깥 고리를 연구할 수 있습니다.</li>
            <li>
              작은 배지 = 곁가지. 안쪽 색 = 얻는 것(자원은 위와 같고
              {TWIG_LEGEND.map(([c, l]) => (
                <span key={l} style={{ color: c }}>
                  {' '}● {l}
                </span>
              ))}
              ), 테두리 = 노선색.
            </li>
            <li>채운 배지 = 연구함 · 점선 고리 = 지금 연구 가능.</li>
            <li>
              내 차례에는 연구할 수 있는 줄기 배지 안과 웹 아래 칩에 <span style={{ color: 'var(--res-sci)' }}>과학 비용</span>이 보입니다(곁가지는 칩에만). 이미 연구한 노드 두 곳과 닿으면 1 싸집니다.
            </li>
            <li>열린 곳 = 웹에서 이어져 연구할 수 있는 자리(점선) · 지금 연구 가능 = 그중 지금 과학으로 감당되는 곳.</li>
            <li>상대 웹의 실선 고리 = 내 직전 차례 이후 새로 연구한 노드.</li>
          </ul>
        </Sheet>
      )}
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

interface WebSvgProps {
  layout: WebLayout;
  layoutKey: string;
  pos: Record<string, [number, number]>;
  name: string;
  /** 쉼표로 이은 노드 id — 문자열이라 memo 비교가 값 비교가 된다 */
  researched: string;
  can: string;
  /** can 과 같은 순서의 비용(내 차례가 아니면 빈 문자열) */
  costs: string;
  fresh: string;
  pulse: boolean;
  onPick: (id: string) => void;
  onHover: (id: string | null) => void;
}

const WebSvg = memo(
  function WebSvg({ layout, pos, name, researched, can, costs, fresh: freshKey, pulse, onPick, onHover }: WebSvgProps) {
    // 판마다 gradient id 가 겹치지 않게(useId 의 콜론은 url() 에서 빼 둔다)
    const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const gid = (k: string) => `ntTw${k}${uid}`;
    // 막 연구한 노드·막 이어진 선은 꽃피고 뻗어 나간다
    const fresh = useFresh(1000);
    const { nodes } = webGraph(layout);
    const done = useMemo(() => new Set(researched.split(',')), [researched]);
    const canList = can ? can.split(',') : [];
    const costList = costs ? costs.split(',') : [];
    const costOf = new Map(canList.map((id, i) => [id, costList[i]]));
    const canSet = new Set(canList);
    const newSet = new Set(freshKey ? freshKey.split(',') : []);
    const has = (id: string) => done.has(id);
    const edges = useMemo(() => {
      const out: [string, string][] = [];
      for (const [a, list] of Object.entries(webGraph(layout).adj)) for (const b of list) if (a < b) out.push([a, b]);
      return out;
    }, [layout]);

    // 노드마다 따로 누르는 원을 두면 곁가지가 줄기의 누르는 원에 가려진다.
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
      onHover(nearestNode(e.currentTarget, e.clientX, e.clientY));
    };
    const pickNode = (e: ReactMouseEvent<SVGSVGElement>) => {
      // VoiceOver·스위치 제어·키보드의 '활성화'는 좌표 없는 클릭(detail 0) — 그 노드를 바로 연다
      if (e.detail === 0) {
        const g = (e.target as Element).closest<SVGElement>('[data-node]');
        if (g?.dataset.node) onPick(g.dataset.node);
        return;
      }
      const best = nearestNode(e.currentTarget, e.clientX, e.clientY);
      if (best) onPick(best);
    };

    // 노드는 판 크기에 매인 대상(data-compact): 누른 점에서 가장 가까운 노드를 고르므로 실제 누르는 범위는 더 넓다
    return (
      <svg data-compact viewBox="-212 -212 424 424" className={styles.web} role="group" aria-label={`${name} 테크 웹`} onClick={pickNode} onPointerMove={hoverNode} onPointerLeave={() => onHover(null)}>
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
        {layout.dirOrder.map((dir, i) => {
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
            const isDone = has(n.id);
            const bloom = isDone && fresh(`n:${n.id}`);
            const isCan = canSet.has(n.id);
            const cost = costOf.get(n.id);
            const isNew = newSet.has(n.id);
            // 배지 반지름 — 장식은 모두 이 안. 연구 가능 점선 고리·새 연구 고리는 바깥 r+5 에만
            const r = n.kind === 'core' ? 16 : n.kind === 'trunk' ? 14 : TWIG_R;
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
                  onPick(n.id);
                }}
                tabIndex={0}
                className={styles.node}
                role="button"
                aria-label={`${nodeName(nodes, n.id)} · ${isDone ? (isNew ? '새로 연구함' : '연구함') : isCan ? `연구 가능${cost ? `, 과학 ${cost}` : ''}` : '잠김'}`}
              >
                <circle r={n.kind === 'twig' ? 16 : n.kind === 'core' ? 26 : 24} className={styles.hit} />
                {/* 맥동은 내 차례에만, 연구 가능 점선 고리만 — SVG 는 합성 레이어가 아니라 계속 돌리면 무겁다 */}
                {isCan && <circle r={r + 5} className={`${styles.canRing} ${pulse ? 'anim-pulse' : ''}`} />}
                {isNew && <circle r={r + 5} className={styles.newRing} />}
                {bloom && (
                  <>
                    <circle r={r} className={`${styles.ripple} anim-ripple`} style={{ stroke: color }} />
                    <circle r={r} className={`${styles.ripple} anim-ripple`} style={{ stroke: color, '--delay': '180ms' } as CSSProperties} />
                  </>
                )}
                <g className={`${!isDone && !isCan ? styles.off : ''} ${bloom ? 'anim-bloom' : ''}`}>
                  <circle r={r + 1.5} cx={1} cy={2} className={styles.drop} />
                  <circle r={r} fill={`url(#${gid('Bezel')})`} style={{ stroke: rim }} className={styles.bezel} />
                  <circle r={inner} style={{ stroke: color, fill: isDone ? color : 'var(--bg)' }} className={`${styles.dot} ${isCan ? styles.can : ''}`} />
                  {isDone && <circle r={inner} fill={`url(#${gid('Shade')})`} />}
                  <ellipse cx={-inner * 0.25} cy={-inner * 0.4} rx={inner * 0.62} ry={inner * 0.4} fill={`url(#${gid('Gloss')})`} />
                  {n.kind === 'core' && <circle r={4} style={{ fill: isDone ? 'var(--accent-contrast)' : 'var(--accent)' }} />}
                  {cost && n.kind === 'trunk' ? (
                    // 내 차례의 연구 비용(과학) — 줄기 빈 배지 안쪽에. 곁가지는 배지가 작아 웹 아래 칩에만 쓴다
                    <text className={styles.cost} textAnchor="middle" dominantBaseline="central">
                      {cost}
                    </text>
                  ) : (
                    n.kind === 'trunk' && (
                      // 고리 번호: 연구 전에는 줄기 색, 연구 후(채운 배지)에는 바탕색 글자
                      <text className={styles.ringNo} style={{ fill: isDone ? 'var(--bg)' : color }} textAnchor="middle" dominantBaseline="central">
                        {n.ring}
                      </text>
                    )
                  )}
                </g>
              </g>
            );
          })}
      </svg>
    );
  },
  (a, b) =>
    a.layoutKey === b.layoutKey &&
    a.pos === b.pos &&
    a.name === b.name &&
    a.researched === b.researched &&
    a.can === b.can &&
    a.costs === b.costs &&
    a.fresh === b.fresh &&
    a.pulse === b.pulse &&
    a.onPick === b.onPick &&
    a.onHover === b.onHover,
);
