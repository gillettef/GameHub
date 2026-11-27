/**
 * 공용 보드: 육각 판 조립 지도(SVG). docs/design.md 10절.
 * 칸이 작게 보이는 화면(휴대폰)에서는 미니맵으로 보이고, 누르면 그 자리를 확대한다. 확대한 뒤 끌어서 옮긴다.
 */
import { memo, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactElement } from 'react'
import { MONSTERS, TILE_NAMES, type TileKind } from '../engine/data'
import { faceOf, hexCorners, rotate, tileCenter, type BoardMap } from '../engine/board'
import { TILE_R } from '../engine/tiles'
import type { View } from '../engine/game'
import { classIcon, isOpenView, reachable, tileIcon } from './helpers'

const CELL_R = 15
/** 이만큼 이상 크게 그려지면 확대 없이 바로 누른다(판정 원 지름 44px 이상) */
const DIRECT = 1
/** 눌러서 확대할 때의 배율(칸 지름 약 32px, 판정 원 46px) */
const ZOOM = 1.05
/** 두 손가락·휠·+ 버튼으로 키울 수 있는 최대 배율 */
const MAX_ZOOM = 2.6

type Cam = { x: number; y: number; s: number }
type Gesture = { kind: 'pan'; x: number; y: number; cx: number; cy: number; moved: boolean } | { kind: 'pinch'; d: number; s: number; moved: true }

type Box = { x: number; y: number; w: number; h: number }
const r1 = (n: number) => Math.round(n * 10) / 10
const pts = (c: [number, number][]) => c.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ')

function boundsOf(map: BoardMap, tiles: number[]): Box {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const ti of tiles) {
    const t = map.tiles[ti]
    if (!t) continue
    for (const [x, y] of hexCorners(...tileCenter(t.q, t.r))) {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
  }
  return { x: x0 - 3, y: y0 - 3, w: x1 - x0 + 6, h: y1 - y0 + 6 }
}

/** 판마다 같은 장식이 나오게 하는 작은 난수 */
function lcg(seed: number) {
  let a = seed >>> 0 || 1
  return () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296)
}

const ZONE_FILL: Record<string, string> = { castle: 'url(#bcm-f3)', ruin: 'url(#bcm-f2)', forest: 'url(#bcm-f1)', camp: 'url(#bcm-f1)' }
const ROAD: Record<number, string> = { 1: '#7a5d3a', 2: '#7b726a', 3: '#6c5a86', 4: '#c9a24c' }
const INK: Partial<Record<TileKind | 'hidden', string>> = {
  monster: '#e08a7a', boss: '#ff9a82', wander: '#e08a7a', treasure: '#f2d98e', shop: '#f2d98e', forge: '#e9a066', spring: '#8fc1e3',
  altar: '#c3a6ef', forest: '#9cc488', ruin: '#b4a99c', camp: '#ffb44a', throne: '#fff1c2', hidden: 'rgba(201,162,76,.6)',
}

/** 판 그림·길(판이 놓이면 바뀌지 않는 층) */
const MapArt = memo(function MapArt({ map }: { map: BoardMap }) {
  const out: ReactElement[] = []
  map.tiles.forEach((t, ti) => {
    const [cx, cy] = tileCenter(t.q, t.r)
    const f = faceOf(t)
    const rnd = lcg(ti * 977 + t.idx * 131 + t.side * 17 + t.set.length)
    out.push(<polygon key={`s${ti}`} points={pts(hexCorners(cx, cy + 3, TILE_R + 2))} fill="#000" opacity={0.5} />)
    out.push(<polygon key={`h${ti}`} points={pts(hexCorners(cx, cy))} fill={ZONE_FILL[t.set]} />)
    out.push(<polygon key={`x${ti}`} points={pts(hexCorners(cx, cy))} fill={t.set === 'ruin' || t.set === 'castle' ? 'url(#bcm-flag)' : 'url(#bcm-moss)'} />)
    if (t.set === 'castle') {
      out.push(<circle key={`w${ti}`} cx={cx} cy={cy} r={78} fill="none" stroke="#4a3a1c" strokeWidth={7} />)
      out.push(<circle key={`v${ti}`} cx={cx} cy={cy} r={78} fill="none" stroke="#7a5b20" strokeWidth={7} strokeDasharray="6 5" />)
      out.push(<circle key={`g${ti}`} cx={cx} cy={cy} r={40} fill="url(#bcm-glow)" />)
    }
    f.deco.forEach((d, k) => {
      const [dx, dy] = rotate(d.x, d.y, t.rot)
      const x = cx + dx
      const y = cy + dy
      if (d.type === 'lake' || d.type === 'pool')
        out.push(<ellipse key={`d${ti}.${k}`} cx={r1(x)} cy={r1(y)} rx={r1(24 * d.s)} ry={r1(16 * d.s)} transform={`rotate(${Math.round(rnd() * 180)} ${r1(x)} ${r1(y)})`} fill="#1b3247" stroke="#0e1824" strokeWidth={3} />)
      if (d.type === 'peak')
        for (let m = 0; m < 3; m++) {
          const px = x + (m - 1) * 13 * d.s
          const py = y + (m === 1 ? -4 : 3)
          const s = (m === 1 ? 15 : 11) * d.s
          out.push(<path key={`d${ti}.${k}.${m}`} d={`M${r1(px - s)} ${r1(py + s * 0.6)}L${r1(px)} ${r1(py - s)}L${r1(px + s)} ${r1(py + s * 0.6)}Z`} fill="#3b3438" stroke="#17121a" strokeWidth={1.2} />)
        }
      if (d.type === 'rubble')
        for (let m = 0; m < 6; m++) {
          const px = x + (rnd() - 0.5) * 30 * d.s
          const py = y + (rnd() - 0.5) * 22 * d.s
          const s = 4 + rnd() * 5
          out.push(<rect key={`d${ti}.${k}.${m}`} x={r1(px - s / 2)} y={r1(py - s / 2)} width={r1(s)} height={r1(s * 0.7)} transform={`rotate(${Math.round(rnd() * 90)} ${r1(px)} ${r1(py)})`} fill="#5a524a" stroke="#1d1916" strokeWidth={0.8} />)
        }
    })
    // 나무(숲)·돌(폐허)
    const cells = map.cells.filter((c) => c.tile === ti)
    for (let k = 0; k < 60; k++) {
      const lx = (rnd() - 0.5) * 170
      const ly = (rnd() - 0.5) * 190
      const x = cx + lx
      const y = cy + ly
      const inside = [0, 60, 120, 180, 240, 300].every((a) => lx * Math.cos((a * Math.PI) / 180) + ly * Math.sin((a * Math.PI) / 180) < TILE_R * 0.866 - 8)
      if (!inside || cells.some((c) => Math.hypot(c.x - x, c.y - y) < 24)) continue
      if (f.deco.some((d) => { const [dx, dy] = rotate(d.x, d.y, t.rot); return Math.hypot(cx + dx - x, cy + dy - y) < 30 * d.s })) continue
      if (t.set === 'castle') continue
      const s = 3.5 + rnd() * 3
      if (t.set === 'ruin') {
        if (rnd() < 0.5) out.push(<rect key={`t${ti}.${k}`} x={r1(x - s / 2)} y={r1(y - s / 2)} width={r1(s)} height={r1(s * 0.75)} fill="#5a524a" stroke="#1d1916" strokeWidth={0.7} />)
      } else
        out.push(<path key={`t${ti}.${k}`} d={`M${r1(x)} ${r1(y - s * 1.6)}L${r1(x + s)} ${r1(y + s * 0.4)}L${r1(x - s)} ${r1(y + s * 0.4)}ZM${r1(x)} ${r1(y - s * 0.6)}L${r1(x + s * 1.2)} ${r1(y + s * 1.3)}L${r1(x - s * 1.2)} ${r1(y + s * 1.3)}Z`} fill={rnd() < 0.5 ? '#2f4a2b' : '#3b5a33'} stroke="#121a10" strokeWidth={0.7} />)
    }
    out.push(<polygon key={`e${ti}`} points={pts(hexCorners(cx, cy))} fill="none" stroke="#0a0709" strokeWidth={2.5} />)
  })
  // 길
  const marks: ReactElement[] = []
  map.links.forEach(([a, b, rough], k) => {
    const A = map.cells[a]
    const B = map.cells[b]
    if (!A || !B) return
    const same = A.tile === B.tile
    let mx = (A.x + B.x) / 2
    let my = (A.y + B.y) / 2
    let d: string
    if (same) {
      const bend = (((a * 7 + b * 13) % 11) - 5) * 1.2
      const len = Math.hypot(B.x - A.x, B.y - A.y) || 1
      d = `M${A.x} ${A.y}Q${r1(mx - ((B.y - A.y) / len) * bend)} ${r1(my + ((B.x - A.x) / len) * bend)} ${B.x} ${B.y}`
    } else {
      // 판 사이 길은 실물처럼 맞닿은 변의 가운데(출구)를 지난다
      const ta = map.tiles[A.tile]
      const tb = map.tiles[B.tile]
      if (ta && tb) {
        const [ax, ay] = tileCenter(ta.q, ta.r)
        const [bx, by] = tileCenter(tb.q, tb.r)
        mx = (ax + bx) / 2
        my = (ay + by) / 2
      }
      d = `M${A.x} ${A.y}L${r1(mx)} ${r1(my)}L${B.x} ${B.y}`
    }
    const lo = Math.min(A.ring, B.ring)
    const hi = Math.max(A.ring, B.ring)
    out.push(<path key={`r${k}`} d={d} fill="none" stroke="#0a0709" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />)
    out.push(<path key={`q${k}`} d={d} fill="none" stroke={ROAD[A.ring === B.ring ? A.ring : lo]} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />)
    if (rough) out.push(<path key={`p${k}`} d={d} fill="none" stroke="#b5574f" strokeWidth={7} strokeDasharray="1.6 5" />)
    if (lo === 2 && hi === 3)
      marks.push(
        <g key={`m${k}`} transform={`translate(${r1(mx)} ${r1(my)})`}>
          <path d="M-8 6V-1a8 8 0 0 1 16 0V6Z" fill="#1a1208" stroke="#c9a24c" strokeWidth={1.8} />
          <path d="M-4 6V1a4 4 0 0 1 8 0V6" fill="#0c090e" />
        </g>,
      )
  })
  return (
    <g>
      {out}
      {marks}
    </g>
  )
})

function Defs() {
  return (
    <defs>
      <radialGradient id="bcm-f1" cx="40%" cy="35%" r="75%"><stop offset="0" stopColor="#34492c" /><stop offset="1" stopColor="#1c2818" /></radialGradient>
      <radialGradient id="bcm-f2" cx="40%" cy="35%" r="75%"><stop offset="0" stopColor="#47413a" /><stop offset="1" stopColor="#26221e" /></radialGradient>
      <radialGradient id="bcm-f3" cx="50%" cy="50%" r="70%"><stop offset="0" stopColor="#3d2c55" /><stop offset="1" stopColor="#1c1428" /></radialGradient>
      <radialGradient id="bcm-st1" cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#4f6141" /><stop offset="1" stopColor="#1f2a1b" /></radialGradient>
      <radialGradient id="bcm-st2" cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#6e655b" /><stop offset="1" stopColor="#2b2622" /></radialGradient>
      <radialGradient id="bcm-st3" cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#5e4a7a" /><stop offset="1" stopColor="#211830" /></radialGradient>
      <radialGradient id="bcm-st4" cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#e8c874" /><stop offset=".55" stopColor="#8a6726" /><stop offset="1" stopColor="#3d2a0c" /></radialGradient>
      <radialGradient id="bcm-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#c9a24c" stopOpacity=".5" /><stop offset="1" stopColor="#c9a24c" stopOpacity="0" /></radialGradient>
      <pattern id="bcm-flag" width="22" height="16" patternUnits="userSpaceOnUse"><path d="M0 0H22M0 8H22M6 0V8M17 8V16" stroke="#000" strokeOpacity=".22" fill="none" /></pattern>
      <pattern id="bcm-moss" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r="1.1" fill="#5c7a4a" fillOpacity=".35" /><circle cx="10" cy="10" r=".9" fill="#5c7a4a" fillOpacity=".3" /></pattern>
    </defs>
  )
}

/** 칸 안에 말을 늘어놓을 자리 */
const PAWN_SPOTS: [number, number][] = [[0, 13], [-11, 9], [11, 9], [-14, -2], [14, -2]]

export function Board({ view, me, canAct, targets, onTile }: { view: View; me: number | null; canAct: boolean; targets: Set<number>; onTile(i: number): void }) {
  const map = view.map
  const box = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 360, h: 360 })
  /** 카메라: 보는 중심(판 좌표)과 배율. null 이면 보드 전체가 들어오게 */
  const [cam, setCam] = useState<Cam | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => {
      const r = el.getBoundingClientRect()
      setSize({ w: Math.max(120, r.width), h: Math.max(120, r.height) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const final = view.phase === 'final' || (view.phase === 'over' && view.demon !== null)
  // 최종전은 성 판과 폐허 고리만 보인다(밀려난 말이 폐허 판에 있을 수 있다)
  const shownTiles = useMemo(() => map.tiles.map((t, i) => ({ t, i })).filter(({ t }) => !final || Math.abs(t.q) + Math.abs(t.r) + Math.abs(t.q + t.r) <= 2).map(({ i }) => i), [map, final])
  const bounds = useMemo(() => boundsOf(map, shownTiles), [map, shownTiles])
  const fit = Math.min(size.w / bounds.w, size.h / bounds.h)
  const maxScale = Math.max(MAX_ZOOM, fit * 2)
  const clampS = (v: number) => Math.min(maxScale, Math.max(fit, v))
  const scale = cam ? clampS(cam.s) : fit
  const zoomed = scale > fit * 1.02
  const vw = size.w / scale
  const vh = size.h / scale
  const clampC = (v: number, lo: number, len: number, seen: number) => (seen >= len ? lo + len / 2 : Math.min(Math.max(v, lo + seen / 2), lo + len - seen / 2))
  const cx = zoomed && cam ? clampC(cam.x, bounds.x, bounds.w, vw) : bounds.x + bounds.w / 2
  const cy = zoomed && cam ? clampC(cam.y, bounds.y, bounds.h, vh) : bounds.y + bounds.h / 2
  const vb = `${r1(cx - vw / 2)} ${r1(cy - vh / 2)} ${r1(vw)} ${r1(vh)}`
  /** 칸을 바로 누를 수 있는 배율인가(판정 원 지름 44px 이상) */
  const interactive = scale >= DIRECT
  const direct = fit >= DIRECT
  /** 숫자 배지·말 배율: 작게 보일수록 키운다(최대 1.5배) */
  const bk = r1(Math.min(1.5, Math.max(1, 1 / scale)))

  // 확대 중에 내 말이 움직이면 따라간다(렌더 중 상태 맞추기: 이펙트로 한 번 더 그리지 않게)
  const myPos = me === null ? -1 : (view.players[me]?.pos ?? -1)
  const [followed, setFollowed] = useState(myPos)
  if (followed !== myPos) {
    setFollowed(myPos)
    const c = map.cells[myPos]
    if (c && cam && zoomed) setCam({ ...cam, x: c.x, y: c.y })
  }

  /** 화면 점(client)을 고정한 채 배율을 바꾼다 */
  const zoomAt = (s2: number, clientX: number, clientY: number) => {
    const r = svg.current?.getBoundingClientRect()
    if (!r) return
    const ns = clampS(s2)
    if (ns <= fit * 1.02) return setCam(null)
    const ox = clientX - (r.left + r.width / 2)
    const oy = clientY - (r.top + r.height / 2)
    const wx = cx + ox / scale
    const wy = cy + oy / scale
    setCam({ x: wx - ox / ns, y: wy - oy / ns, s: ns })
  }
  const zoomCenter = (factor: number) => {
    const r = svg.current?.getBoundingClientRect()
    if (r) zoomAt(scale * factor, r.left + r.width / 2, r.top + r.height / 2)
  }

  // 마우스 휠(PC): 커서 자리를 기준으로 확대·축소. React 의 onWheel 은 passive 라 직접 붙인다
  const wheel = useRef<(e: WheelEvent) => void>(() => {})
  useLayoutEffect(() => {
    wheel.current = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(scale * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY)
    }
  })
  useLayoutEffect(() => {
    const el = svg.current
    if (!el) return
    const h = (e: WheelEvent) => wheel.current(e)
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [])

  const reach = me === null ? new Set<number>() : reachable(view, me, canAct)
  const demonSeat = view.demon?.seat ?? -1
  const shownSet = new Set(shownTiles)

  const nearest = (x: number, y: number): number => {
    let best = -1
    let bd = 34 * 34
    map.cells.forEach((c, i) => {
      if (!shownSet.has(c.tile)) return
      const d = (c.x - x) ** 2 + (c.y - y) ** 2
      if (d < bd) {
        bd = d
        best = i
      }
    })
    return best
  }
  // 한 손가락: 끌어서 이동(확대 중일 때), 두 손가락: 벌리고 오므려 확대·축소, 움직이지 않고 떼면 누르기
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // 합성 이벤트 등 잡을 수 없는 포인터
    }
    // 첫 손가락(primary)이 닿으면 떼는 이벤트를 놓친 옛 포인터는 없는 것으로 본다
    if (e.isPrimary) pointers.current.clear()
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    if (pts.length === 1) gesture.current = { kind: 'pan', x: e.clientX, y: e.clientY, cx, cy, moved: false }
    else if (pts.length === 2) {
      const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }]
      gesture.current = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: scale, moved: true }
    }
  }
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    const pts = [...pointers.current.values()]
    if (g.kind === 'pinch' && pts.length >= 2) {
      const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }]
      zoomAt((g.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.d, (a.x + b.x) / 2, (a.y + b.y) / 2)
      return
    }
    if (g.kind === 'pan') {
      const dx = e.clientX - g.x
      const dy = e.clientY - g.y
      if (!g.moved && Math.hypot(dx, dy) < 8) return
      g.moved = true
      if (zoomed) setCam({ x: g.cx - dx / scale, y: g.cy - dy / scale, s: scale })
    }
  }
  const onUp = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (pointers.current.size > 0) {
      // 두 손가락 중 하나를 뗐다: 남은 손가락으로 이어서 끌되 누르기로 보지 않는다
      const [rest] = [...pointers.current.values()] as [{ x: number; y: number }]
      gesture.current = { kind: 'pan', x: rest.x, y: rest.y, cx, cy, moved: true }
      return
    }
    gesture.current = null
    if (!g || g.moved) return
    const r = svg.current?.getBoundingClientRect()
    if (!r) return
    const wx = cx + (e.clientX - (r.left + r.width / 2)) / scale
    const wy = cy + (e.clientY - (r.top + r.height / 2)) / scale
    // 칸이 작게 보이면 먼저 그 자리를 확대한다
    if (!interactive) return setCam({ x: wx, y: wy, s: Math.max(scale, ZOOM, fit * 1.8) })
    const i = nearest(wx, wy)
    if (i >= 0) onTile(i)
  }
  const onCancel = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) gesture.current = null
  }
  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTile(i)
    }
  }

  return (
    <div ref={box} className="bcx-boardbox bcm-box">
      <svg
        ref={svg}
        className={`bcm-map ${interactive ? 'is-live' : 'is-mini'} ${zoomed ? 'is-zoomed' : ''}`}
        data-scale={r1(scale)}
        viewBox={vb}
        width={size.w}
        height={size.h}
        role="group"
        aria-label={interactive ? '공용 보드: 두 손가락으로 확대·축소' : '공용 보드 미니맵: 눌러서 크게 보기, 두 손가락으로 확대·축소'}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
      >
        <Defs />
        <MapArt map={map} />
        {map.tiles.map((t, ti) => {
          const zone = t.set === 'castle' ? 3 : t.set === 'ruin' ? 2 : 1
          if (final ? zone >= 3 : zone <= view.chapter) return null
          return <polygon key={`l${ti}`} points={pts(hexCorners(...tileCenter(t.q, t.r)))} fill="#0a0709" opacity={shownSet.has(ti) ? 0.5 : 0.75} pointerEvents="none" />
        })}
        {map.cells.map((c, i) => {
          if (!shownSet.has(c.tile)) return null
          const t = view.board[i]
          if (!t) return null
          const monsters = view.monsters.filter((m) => m.pos === i)
          const m = monsters[0]
          const kind = m ? (MONSTERS[m.kind].grade === 'boss' ? 'boss' : 'monster') : t.kind
          const icon = tileIcon(kind)
          const locked = !isOpenView(view, i)
          const pawns = view.players.filter((p) => p.pos === i && !p.out)
          const label = m ? `${MONSTERS[m.kind].name} 체력 ${m.hp}` : kind === 'hidden' ? '뒤집히지 않은 칸' : TILE_NAMES[kind as TileKind]
          const cls = ['bcm-cell', locked ? 'is-locked' : '', reach.has(i) ? 'is-reachable' : '', targets.has(i) ? 'is-target' : ''].join(' ')
          const r = c.ring === 4 ? 19 : kind === 'camp' ? 17 : CELL_R
          const demonHere = pawns.some((p) => p.seat === demonSeat)
          return (
            <g
              key={i}
              className={cls}
              data-cell={i}
              transform={`translate(${c.x} ${c.y})`}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : -1}
              aria-label={label}
              onKeyDown={onKey(i)}
            >
              {/* 판정 원: 누르는 곳은 가장 가까운 칸(Board onUp)이라 실제 영역은 이보다 넓다 */}
              <circle r={22} fill="transparent" />
              {reach.has(i) && <circle r={r + 5} className="bcm-ring bcm-ring--reach" />}
              {targets.has(i) && <circle r={r + 5} className="bcm-ring bcm-ring--target" />}
              <circle r={r} cy={2} fill="#000" opacity={0.5} />
              <circle r={r} fill={`url(#bcm-st${c.ring})`} stroke={kind === 'camp' ? '#ffb44a' : c.ring === 4 ? '#f2d98e' : c.ring === 3 ? '#8a6726' : '#0a0709'} strokeWidth={1.6} />
              {icon && !demonHere && (
                <svg x={c.ring === 4 ? -12 : -9} y={c.ring === 4 ? -12 : -9} width={c.ring === 4 ? 24 : 18} height={c.ring === 4 ? 24 : 18} style={{ color: INK[kind] ?? '#d7cbb4' }} opacity={pawns.length && !m ? 0.55 : 1}>
                  <use href={`#${icon}`} />
                </svg>
              )}
              {m && (
                <g className="bcm-badge" transform={`translate(13 -13) scale(${bk})`}>
                  <circle r={8.5} fill="#2a0f0c" stroke="#ff9a82" strokeWidth={1.6} />
                  <text className="bcm-num bcm-num--hp" textAnchor="middle" dy="3.9">{m.hp}</text>
                </g>
              )}
              {m?.community && m.community.suit && (
                <g className={`bcm-badge bc-suit--${m.community.suit}`} transform={`translate(-15 -13) scale(${bk})`}>
                  <rect x={-8} y={-11} width={16} height={22} rx={2.5} fill="#f4ead2" stroke="#0a0709" strokeWidth={1.4} />
                  <text className="bcm-num bcm-num--card" textAnchor="middle" y={-0.5}>{m.community.rank}</text>
                  <svg x={-5} y={0.5} width={10} height={10} className="bcm-suit">
                    <use href={`#bc-suit-${m.community.suit}`} />
                  </svg>
                </g>
              )}
              {monsters.length > 1 && (
                <text className="bcm-num bcm-num--more" x={-16} y={18}>
                  +{monsters.length - 1}
                </text>
              )}
              {pawns.map((p, k) => {
                if (p.seat === demonSeat)
                  return (
                    <g key={p.seat} className="bcm-pawn bcm-pawn--demon">
                      <circle r={12} fill="#24182f" stroke="#c9a24c" strokeWidth={2} />
                      <svg x={-8} y={-8} width={16} height={16} style={{ color: '#f2d98e' }}><use href="#bc-crown" /></svg>
                    </g>
                  )
                const [px, py] = PAWN_SPOTS[demonHere ? Math.min(4, k + 1) : k] ?? [0, 0]
                return (
                  <g key={p.seat} className={`bcm-pawn ${p.seat === me ? 'is-me' : ''}`} transform={`translate(${px} ${py}) scale(${bk})`}>
                    <circle r={7} style={{ fill: `var(--bc-seat-${p.seat + 1})` }} stroke={p.seat === me ? '#ffb44a' : '#0b080d'} strokeWidth={p.seat === me ? 2.2 : 1.4} />
                    <svg x={-5} y={-5} width={10} height={10} style={{ color: '#1a1410' }}><use href={`#${classIcon(p.cls)}`} /></svg>
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
      {!direct && !zoomed && <span className="bcm-hint">눌러서 크게 · 두 손가락으로 확대</span>}
      <div className="bcm-zoom" role="group" aria-label="보드 확대">
        <button type="button" aria-label="확대" disabled={scale >= maxScale * 0.99} onClick={() => zoomCenter(1.4)}>
          +
        </button>
        <button type="button" aria-label="축소" disabled={!zoomed} onClick={() => zoomCenter(1 / 1.4)}>
          −
        </button>
        {zoomed && (
          <button type="button" className="bcm-all" onClick={() => setCam(null)}>
            전체
          </button>
        )}
      </div>
    </div>
  )
}
