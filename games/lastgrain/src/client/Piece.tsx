// 모래병: 원판 + 모래시계(남은 모래 비율) + 종류 + 남은 초. 눕힌 모래시계(흐르지 않음)는 옆으로 돌려 그린다
import { useId } from 'react'
import { KINDS, type Kind, type Unit } from '../engine/rules'
import { SAND, fmtSec } from './format'


export function Hourglass({ frac, kind, className = '' }: { frac: number; kind: Kind; className?: string }) {
  const id = useId()
  const f = Math.max(0, Math.min(1, frac))
  const yTop = 32 - 27 * f
  const yBot = 60 - 27 * (1 - f)
  const top = 'M7,5 C7,22 18,28 20,32 C22,28 33,22 33,5 Z'
  const bot = 'M7,59 C7,42 18,36 20,32 C22,36 33,42 33,59 Z'
  return (
    <svg viewBox="0 0 40 64" aria-hidden="true" className={className}>
      <defs>
        <clipPath id={`t${id}`}>
          <path d={top} />
        </clipPath>
        <clipPath id={`b${id}`}>
          <path d={bot} />
        </clipPath>
      </defs>
      <path d={top} fill="#f7fafc" />
      <path d={bot} fill="#f7fafc" />
      <rect x={0} y={yTop} width={40} height={32 - yTop} fill={SAND[kind]} clipPath={`url(#t${id})`} />
      <rect x={0} y={yBot} width={40} height={60 - yBot} fill={SAND[kind]} clipPath={`url(#b${id})`} />
      {f > 0 && f < 1 && <line x1={20} y1={32} x2={20} y2={yBot} stroke={SAND[kind]} strokeWidth={1.2} strokeDasharray="2 2" />}
      <path d={top} fill="none" stroke="#9fb2bf" strokeWidth={1.3} />
      <path d={bot} fill="none" stroke="#9fb2bf" strokeWidth={1.3} />
      <rect x={2} y={0} width={36} height={5} rx={1.5} fill="#7a5634" />
      <rect x={2} y={59} width={36} height={5} rx={1.5} fill="#7a5634" />
      <rect x={3} y={5} width={2.5} height={54} fill="#5a3d22" />
      <rect x={34.5} y={5} width={2.5} height={54} fill="#5a3d22" />
    </svg>
  )
}

export function Piece({
  unit,
  lying,
  showSec,
  acted = false,
  selected = false,
  size = '86%',
}: {
  unit: Unit
  lying: boolean
  showSec: boolean
  acted?: boolean
  selected?: boolean
  size?: string
}) {
  const k = KINDS[unit.kind]
  return (
    <span className={`lg-piece p${unit.owner}${lying ? ' lying' : ''}${acted ? ' acted' : ''}${selected ? ' selected' : ''}`} style={{ height: size }}>
      <span className="disc" />
      <Hourglass frac={unit.rem / unit.cap} kind={unit.kind} />
      <span className="kind">{k.short}</span>
      {showSec && <span className={`sec${unit.rem < 10_000 ? ' low' : ''}`}>{fmtSec(unit.rem)}</span>}
    </span>
  )
}
