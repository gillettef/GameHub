import { useId } from 'react'
import { ART_H, ART_W, cardArt, cardStars, type ArtShape, type CardKey } from './cardArtData'
import { DIE_COLORS } from './colors'

/** ⧗ 모래시계 선 (DieFace의 Hourglass와 같은 모양, 24 좌표계) */
const HOURGLASS = 'M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9'

function Shape({ s, tone }: { s: ArtShape; tone: string }) {
  switch (s.t) {
    case 'die': {
      const c = DIE_COLORS[s.c]
      const r = s.s * 0.22
      return (
        <g opacity={s.dim ? 0.38 : 1}>
          {s.hi && <rect x={s.x - 2} y={s.y - 2} width={s.s + 4} height={s.s + 4} rx={r + 2} fill="none" stroke={tone} strokeWidth={1.2} opacity={0.9} />}
          <rect x={s.x} y={s.y} width={s.s} height={s.s} rx={r} fill={c.fill} stroke={c.stroke ?? c.dark} strokeWidth={0.8} />
          <rect x={s.x + s.s * 0.12} y={s.y + s.s * 0.08} width={s.s * 0.76} height={s.s * 0.18} rx={s.s * 0.09} fill="#fff" opacity={0.18} />
          {s.f === 't' ? (
            <path
              d={HOURGLASS}
              transform={`translate(${s.x + s.s * 0.2} ${s.y + s.s * 0.2}) scale(${(s.s * 0.6) / 24})`}
              fill="none"
              stroke={c.ink}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : s.f !== undefined ? (
            <text x={s.x + s.s / 2} y={s.y + s.s * 0.7} textAnchor="middle" fontSize={s.s * 0.56} fontWeight={700} fontFamily="'Space Grotesk', sans-serif" fill={c.ink}>
              {s.f}
            </text>
          ) : null}
        </g>
      )
    }
    case 'slot':
      return <rect x={s.x + 0.5} y={s.y + 0.5} width={s.s - 1} height={s.s - 1} rx={s.s * 0.22} fill="none" stroke="#6d6890" strokeWidth={0.8} strokeDasharray="2 2" />
    case 'line':
      return <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.tone ? tone : '#a49fc4'} strokeWidth={1} strokeDasharray={s.dash ? '3 3' : undefined} opacity={0.8} />
    case 'circle':
      return <circle cx={s.cx} cy={s.cy} r={s.r} fill={s.fill ?? 'none'} stroke={s.tone ? tone : s.stroke} strokeWidth={s.sw ?? 0} />
    case 'path':
      return <path d={s.d} fill={s.fill ?? 'none'} stroke={s.tone ? tone : s.stroke} strokeWidth={s.sw ?? 1} strokeLinecap="round" strokeLinejoin="round" />
    case 'label':
      return (
        <text x={s.x} y={s.y} textAnchor="middle" fontSize={s.size} fontWeight={700} fontFamily="'Space Grotesk', 'Noto Sans KR', sans-serif" fill={s.tone ? tone : '#ece9ff'}>
          {s.text}
        </text>
      )
  }
}

/**
 * 카드 일러스트: 카드 색으로 물든 성운 + 별 + 카드 조건을 보여 주는 주사위 도해 (cardArt.ts).
 * 장식이라 화면 읽기에서는 숨긴다 (카드 이름·문구가 같은 정보를 준다).
 */
export function CardArt({ card, tone, className = '' }: { card: CardKey; tone: string; className?: string }) {
  const id = useId().replace(/:/g, '')
  const seed = `${card.kind}:${card.id}`
  return (
    <svg viewBox={`0 0 ${ART_W} ${ART_H}`} className={`block ${className}`} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id={`n1${id}`} cx="28%" cy="22%" r="75%">
          <stop offset="0%" stopColor={tone} stopOpacity={0.55} />
          <stop offset="60%" stopColor={tone} stopOpacity={0.08} />
          <stop offset="100%" stopColor={tone} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`n2${id}`} cx="85%" cy="95%" r="60%">
          <stop offset="0%" stopColor="#5ad1e6" stopOpacity={0.22} />
          <stop offset="100%" stopColor="#5ad1e6" stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width={ART_W} height={ART_H} fill="#0b0a14" />
      <rect width={ART_W} height={ART_H} fill={`url(#n1${id})`} />
      <rect width={ART_W} height={ART_H} fill={`url(#n2${id})`} />
      {cardStars(seed).map((st, i) => (
        <circle key={`star-${i}`} cx={st.x} cy={st.y} r={st.r} fill="#fff" opacity={st.o} />
      ))}
      {cardArt(card).map((s, i) => (
        <Shape key={`shape-${i}`} s={s} tone={tone} />
      ))}
    </svg>
  )
}
