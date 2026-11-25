// 정원 보드(SVG). 내 좌석(정찰 중이면 정찰한 좌석)이 화면 아래에 오도록 돌려 그린다.
// 그리는 내용은 옛 화면(web/app.js 의 boardSvg)과 같다: 칸·접선 지점·정자·생울타리, 시선(점선), 손님 말(가면 면·문양 점·초대장), 좌석 띠.
import type { KeyboardEvent } from 'react'
import { DIRS, DV, HEDGES, PAVILION, RENDEZVOUS, cellName, type Seat } from '../engine/board'
import { isCovered, type LegalMove } from '../engine/rules'
import type { SeatView } from '../def'
import { colorOf, crestName, seatLabel } from './seats'

const C = 60 // 칸 크기 (SVG 단위)
const B = C * 7
/** 이 좌석이 화면 아래에 오도록 돌리는 각도 */
const ROT: Record<Seat, number> = { S: 0, E: 90, N: 180, W: 270 }

export interface BoardProps {
  view: SeatView
  /** 화면 아래에 둘 좌석 */
  bottom: Seat
  /** 정원 좌석 → 이름 */
  names: Partial<Record<Seat, string>>
  /** 지목할 수 있는 말(빨간 점선) */
  highlight: ReadonlySet<number>
  /** 고른 말이 갈 수 있는 칸 */
  dests: readonly LegalMove[]
  selected: number | null
  /** 정찰 중인 좌석(띠에 금색 점선) */
  scoutSeat: Seat | null
  onPiece(id: number): void
  onDest(m: LegalMove): void
}

const screenSide = (seat: Seat, rot: number): Seat => DIRS[(DIRS.indexOf(seat) + rot / 90) % 4]!

const press = (fn: () => void) => ({
  role: 'button' as const,
  tabIndex: 0,
  onClick: fn,
  onKeyDown: (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fn()
    }
  },
})

export function Board({ view: v, bottom, names, highlight, dests, selected, scoutSeat, onPiece, onDest }: BoardProps) {
  const rot = ROT[bottom]
  const mySeat = v.me != null ? v.players[v.me]!.seat : null
  const present = v.pieces.filter((p) => p.present)
  const [px, py] = PAVILION

  const cells = []
  for (let x = 1; x <= 7; x++) {
    for (let y = 1; y <= 7; y++) {
      const rv = RENDEZVOUS.some(([a, b]) => a === x && b === y)
      cells.push(
        <g key={`${x},${y}`}>
          <rect x={(x - 1) * C} y={(y - 1) * C} width={C} height={C} fill={rv ? '#f3e3b0' : '#dfe9d3'} stroke="#b9c8aa" />
          {rv && <circle cx={(x - 0.5) * C} cy={(y - 0.5) * C} r={C * 0.42} fill="none" stroke="#b8902a" strokeWidth={1.5} strokeDasharray="4 4" />}
        </g>,
      )
    }
  }

  const hedges = [...HEDGES].flatMap((k) => {
    const [xs, ys, d] = k.split(',')
    const x = Number(xs),
      y = Number(ys)
    if (d === 'S') return [<rect key={k} x={(x - 1) * C} y={y * C - 5} width={C} height={10} rx={2} fill="#3f6b35" stroke="#2b4a24" />]
    if (d === 'E') return [<rect key={k} x={x * C - 5} y={(y - 1) * C} width={10} height={C} rx={2} fill="#3f6b35" stroke="#2b4a24" />]
    return []
  })

  const destEls = dests.map((m) => {
    const cx = (m.x - 0.5) * C,
      cy = (m.y - 0.5) * C
    const [dx, dy] = DV[m.dir]
    return (
      <g key={`${m.pieceId}${m.dir}${m.steps}`} className="sl-dest" aria-label={`${cellName(m.x, m.y)}로 이동`} {...press(() => onDest(m))}>
        <rect x={(m.x - 1) * C + 3} y={(m.y - 1) * C + 3} width={C - 6} height={C - 6} rx={8} fill="rgba(232,198,106,.35)" stroke="#b8902a" strokeWidth={2} />
        <path d={`M${cx + dx * 14} ${cy + dy * 14} L${cx - dy * 9 - dx * 4} ${cy + dx * 9 - dy * 4} L${cx + dy * 9 - dx * 4} ${cy - dx * 9 - dy * 4}Z`} fill="#8a6a1c" />
      </g>
    )
  })

  // 시선: 가려지지 않은 가면에서 그 좌석까지
  const sights = present.flatMap((p) => {
    if (isCovered(present, p)) return []
    const cx = (p.x - 0.5) * C,
      cy = (p.y - 0.5) * C
    const [dx, dy] = DV[p.facing]
    const ex = p.facing === 'E' ? B + 8 : p.facing === 'W' ? -8 : cx
    const ey = p.facing === 'S' ? B + 8 : p.facing === 'N' ? -8 : cy
    const col = v.emptySeats.includes(p.facing) ? '#888' : colorOf(p.facing)
    return [<line key={p.id} x1={cx + dx * 22} y1={cy + dy * 22} x2={ex} y2={ey} stroke={col} strokeWidth={3} strokeDasharray="7 6" opacity={0.55} />]
  })

  const pieces = present.map((p) => {
    const cx = (p.x - 0.5) * C,
      cy = (p.y - 0.5) * C
    const [dx, dy] = DV[p.facing]
    const cov = isCovered(present, p)
    const sel = selected === p.id
    const hl = highlight.has(p.id)
    const maskCol = cov ? '#333' : v.emptySeats.includes(p.facing) ? '#888' : colorOf(p.facing)
    const h = 21
    const tip = [cx + dx * 15, cy + dy * 15]
    const b1 = [cx + dx * 5 - dy * 7, cy + dy * 5 + dx * 7]
    const b2 = [cx + dx * 5 + dy * 7, cy + dy * 5 - dx * 7]
    const mx = cx - dx * 13 + (dy ? 13 : 0),
      my = cy - dy * 13 + (dx ? -13 : 0)
    const hollow = p.known === 'memory'
    const tx = cx - dx * 4,
      ty = cy - dy * 4
    const label = `${p.id}번 손님${p.crest ? ` ${crestName(p.crest)}` : ''}${hl ? ' 지목 가능' : ''}`
    return (
      <g key={p.id} className="sl-piece" aria-label={label} aria-pressed={sel} {...press(() => onPiece(p.id))}>
        <rect x={(p.x - 1) * C} y={(p.y - 1) * C} width={C} height={C} fill="transparent" />
        {hl && <rect x={cx - 28} y={cy - 28} width={56} height={56} rx={10} fill="none" stroke="#e2735f" strokeWidth={3} strokeDasharray="5 3" />}
        <rect x={cx - 20} y={cy - 20} width={40} height={40} rx={6} fill={sel ? '#fff4cf' : '#f7f3ea'} stroke={sel ? '#b8902a' : '#5a5246'} strokeWidth={sel ? 3 : 1.6} />
        {p.facing === 'N' || p.facing === 'S' ? (
          <line x1={cx - 16} y1={cy + dy * h} x2={cx + 16} y2={cy + dy * h} stroke={maskCol} strokeWidth={6} strokeLinecap="round" />
        ) : (
          <line x1={cx + dx * h} y1={cy - 16} x2={cx + dx * h} y2={cy + 16} stroke={maskCol} strokeWidth={6} strokeLinecap="round" />
        )}
        <path d={`M${tip[0]} ${tip[1]} L${b1[0]} ${b1[1]} L${b2[0]} ${b2[1]}Z`} fill="#5a5246" />
        {p.crest && (
          <circle cx={mx} cy={my} r={7} fill={hollow ? '#f7f3ea' : colorOf(p.crest)} stroke={colorOf(p.crest)} strokeWidth={hollow ? 3 : 1.5} />
        )}
        <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={800} fill="#2d2a26" transform={`rotate(${-rot} ${tx} ${ty})`}>
          {p.id}
        </text>
        {p.token != null && <circle cx={cx - 22} cy={cy + 22} r={8} fill={colorOf(v.players[p.token]!.seat)} stroke="#f5d76e" strokeWidth={3} />}
      </g>
    )
  })

  // 좌석 띠 (화면 좌표)
  const bars = DIRS.map((seat) => {
    const side = screenSide(seat, rot)
    const empty = v.emptySeats.includes(seat)
    const pl = v.players.find((q) => q.seat === seat)
    const turn = !empty && v.players[v.turn]?.seat === seat && v.phase !== 'over'
    const txt = empty ? '빈 발코니' : `${seatLabel(seat)} · ${crestName(seat)} · ${names[seat] ?? ''}${seat === mySeat && names[seat] !== '나' ? ' (나)' : ''}`
    const w = 34
    let r: [number, number, number, number] = [0, B + 18, B, w]
    let tx = B / 2,
      ty = B + 35,
      ta = 0
    if (side === 'N') [r, tx, ty] = [[0, -52, B, w], B / 2, -35]
    if (side === 'W') [r, tx, ty, ta] = [[-52, 0, w, B], -35, B / 2, -90]
    if (side === 'E') [r, tx, ty, ta] = [[B + 18, 0, w, B], B + 35, B / 2, 90]
    return (
      <g key={seat}>
        <rect
          x={r[0]}
          y={r[1]}
          width={r[2]}
          height={r[3]}
          rx={6}
          fill={empty ? '#3a4a40' : colorOf(seat)}
          opacity={empty ? 0.6 : 0.92}
          {...(turn ? { stroke: '#f5d76e', strokeWidth: 4 } : {})}
        />
        <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight={700} fill="#fff" transform={`rotate(${ta} ${tx} ${ty})`}>
          {turn ? '▶ ' : ''}
          {txt}
          {pl && !pl.card ? ' · 카드 없음' : ''}
        </text>
        {scoutSeat === seat && (
          <rect x={r[0] - 4} y={r[1] - 4} width={r[2] + 8} height={r[3] + 8} rx={8} fill="none" stroke="#e8c66a" strokeWidth={3} strokeDasharray="6 4" />
        )}
      </g>
    )
  })

  return (
    <svg className="sl-board" viewBox={`-60 -60 ${B + 120} ${B + 120}`} role="group" aria-label="정원 보드">
      <g transform={`rotate(${rot} ${B / 2} ${B / 2})`}>
        <rect x={-6} y={-6} width={B + 12} height={B + 12} rx={8} fill="#cfdcc0" />
        {cells}
        <rect x={(px - 1) * C + 4} y={(py - 1) * C + 4} width={C - 8} height={C - 8} rx={6} fill="#e9e2d0" stroke="#6b5b3e" strokeWidth={4} />
        <path
          d={`M${(px - 0.5) * C} ${(py - 1) * C + 14} L${px * C - 14} ${(py - 0.5) * C} L${(px - 0.5) * C} ${py * C - 14} L${(px - 1) * C + 14} ${(py - 0.5) * C}Z`}
          fill="#c9b68a"
          stroke="#6b5b3e"
        />
        {hedges}
        {destEls}
        {sights}
        {pieces}
      </g>
      {bars}
    </svg>
  )
}
