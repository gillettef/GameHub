// ③ 공용 보드: 원형 순회로 위 6권역, 가운데 포화 게이지(유세 중엔 버스 탑승 현황), 버스. 옛 화면(src/ui/board.ts)과 같은 도안
import { useLayoutEffect, useRef, useState } from 'react'
import { CAP, FULL_HOLES_TO_END, HOLE_COUNT, HOLE_LABELS, HOLE_NAMES, PLAYER_NAMES } from '../engine/constants'
import { countColor, fullCount, holeOwner, isFull, nextStop } from '../engine/rules'
import type { GameState, Player } from '../engine/types'
import { BusGlyph, Mark } from './icons'

/** 권역 i의 보드 안 위치(%) — 맨 위 A부터 시계 방향 */
const RADIUS = 35
function holePos(i: number): [number, number] {
  const a = ((-90 + 60 * i) * Math.PI) / 180
  return [50 + RADIUS * Math.cos(a), 50 + RADIUS * Math.sin(a)]
}

function Ring() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="el-ring">
      <circle cx={50} cy={50} r={RADIUS} className="el-ring-road" />
      <circle cx={50} cy={50} r={RADIUS} className="el-ring-line" />
      {Array.from({ length: HOLE_COUNT }, (_, k) => {
        const t = -60 + 60 * k
        const a = (t * Math.PI) / 180
        return (
          <g key={k} transform={`translate(${50 + RADIUS * Math.cos(a)} ${50 + RADIUS * Math.sin(a)}) rotate(${t + 180})`}>
            <path d="M0,-2.4 L1.9,1.6 L-1.9,1.6Z" className="el-ring-arrow" />
          </g>
        )
      })}
    </svg>
  )
}

/** 포화 게이지: 4칸 원호 */
function Gauge({ full }: { full: number }) {
  const n = FULL_HOLES_TO_END
  const r = 26
  const gap = 6
  return (
    <svg viewBox="0 0 64 64" className="el-gauge" aria-hidden="true">
      {Array.from({ length: n }, (_, k) => {
        const a0 = ((-90 + (360 / n) * k + gap / 2) * Math.PI) / 180
        const a1 = ((-90 + (360 / n) * (k + 1) - gap / 2) * Math.PI) / 180
        const d = `M${32 + r * Math.cos(a0)} ${32 + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${32 + r * Math.cos(a1)} ${32 + r * Math.sin(a1)}`
        return <path key={k} d={d} className={`el-gauge-seg${k < full ? ' on' : ''}`} />
      })}
      <text x={32} y={38.5} textAnchor="middle" className="el-gauge-num">
        {`${Math.min(full, n)}/${n}`}
      </text>
    </svg>
  )
}

function holeAria(s: GameState, i: number, isNext: boolean): string {
  const g = s.holes[i]
  const parts = [`${HOLE_LABELS[i]} ${HOLE_NAMES[i]}`, `선거인단 ${CAP[i]}표`]
  if (!g.length) parts.push('비어 있음')
  else {
    const b = countColor(g, 0)
    parts.push(`파랑 ${b} 빨강 ${g.length - b}`, `깃발 ${PLAYER_NAMES[g[0] as Player]}`)
    const o = holeOwner(s, i)
    if (o !== null) parts.push(`${PLAYER_NAMES[o]} 우세`)
  }
  if (isFull(s, i)) parts.push('포화')
  if (isNext) parts.push('다음 정차')
  return parts.join(', ')
}

export interface BoardProps {
  state: GameState
  /** 지금 누를 수 있는 권역인가 */
  selectable(i: number): boolean
  onHole(i: number): void
  highlight: number
  pulse: number
}

export function Board({ state: s, selectable, onHole, highlight, pulse }: BoardProps) {
  const nx = s.phase === 'sow' ? nextStop(s) : -1
  const fc = fullCount(s)
  const left = FULL_HOLES_TO_END - fc
  const sow = s.phase === 'sow'
  const blueOnBus = countColor(s.bus, 0)
  const can = Array.from({ length: HOLE_COUNT }, (_, i) => selectable(i))

  // 버스: 누적 각도로 늘 시계 방향으로 돈다
  const [bus, setBus] = useState({ pos: s.busPos, angle: 60 * s.busPos })
  if (sow && s.busPos !== bus.pos) {
    const cur = ((bus.angle % 360) + 360) % 360
    setBus({ pos: s.busPos, angle: bus.angle + ((60 * s.busPos - cur + 360) % 360) })
  }

  // 마지막으로 놓인 권역 표시: pulse 가 바뀔 때마다 애니메이션을 다시 건다
  const holes = useRef<(HTMLButtonElement | null)[]>([])
  useLayoutEffect(() => {
    for (const el of holes.current) el?.classList.remove('drp')
    const el = highlight >= 0 && s.phase !== 'over' ? holes.current[highlight] : null
    if (!el) return
    void el.offsetWidth
    el.classList.add('drp')
  }, [highlight, pulse, s.phase])

  return (
    <div className={`el-board${can.some(Boolean) ? ' acting' : ''}`} role="group" aria-label="권역 보드">
      <Ring />
      {sow ? (
        <div className="el-board-center" aria-hidden="true">
          <span className="el-center-label">버스 탑승</span>
          <span className="el-center-big el-disp">{s.bus.length}명</span>
          <span className="el-center-mix">
            <Mark p={0} />
            {blueOnBus} <Mark p={1} />
            {s.bus.length - blueOnBus}
          </span>
        </div>
      ) : (
        <div className="el-board-center" aria-hidden="true">
          <Gauge full={fc} />
          <span className="el-center-label">포화 권역</span>
          <span>{s.phase === 'over' ? '개표 완료' : left > 0 ? `선거일까지 ${left}곳` : '이번 차례가 끝나면 선거일'}</span>
        </div>
      )}
      {Array.from({ length: HOLE_COUNT }, (_, i) => {
        const g = s.holes[i]
        const owner = holeOwner(s, i)
        const full = isFull(s, i)
        const [x, y] = holePos(i)
        const cls = ['el-hole', can[i] && 'can', i === nx && 'nx', full && 'is-full', owner !== null && `lead-${owner}`].filter(Boolean).join(' ')
        return (
          <button
            key={i}
            ref={(el) => {
              holes.current[i] = el
            }}
            type="button"
            className={cls}
            style={{ left: `${x}%`, top: `${y}%` }}
            aria-disabled={!can[i]}
            aria-label={holeAria(s, i, i === nx)}
            onClick={() => can[i] && onHole(i)}
          >
            <span className="el-ribbon" aria-hidden="true" />
            <span className="el-next-tag" aria-hidden="true">
              다음 정차
            </span>
            <span className="el-hole-head">
              <span className="el-hole-letter el-disp">{HOLE_LABELS[i]}</span>
              {HOLE_NAMES[i]}
            </span>
            <span className="el-hole-sub">
              선거인단
              <span>
                <b>{CAP[i]}</b>표
              </span>
              {owner !== null && <Mark p={owner} />}
            </span>
            <span className="el-slots" aria-hidden="true">
              {Array.from({ length: CAP[i] }, (_, k) => (
                <span key={k} className={k < g.length ? `el-tok t${g[k]}${k === 0 ? ' flag' : ''}` : 'el-tok'}>
                  {k === 0 && g.length ? '⚑' : ''}
                </span>
              ))}
            </span>
            {full && (
              <span className="el-full-tag el-disp" aria-hidden="true">
                포화
              </span>
            )}
          </button>
        )
      })}
      <div className={`el-bus-orbit${sow ? ' on' : ''}`} aria-hidden="true" style={{ transform: `rotate(${bus.angle}deg)` }}>
        <span className="el-bus-icon" style={{ transform: `rotate(${-bus.angle}deg)` }}>
          <BusGlyph />
          <span className="el-bus-count el-disp">{s.bus.length}</span>
        </span>
      </div>
    </div>
  )
}
