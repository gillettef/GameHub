import { isTime, type Color, type Face } from '../engine'
import { colorLabel, faceLabel, tint } from './colors'

/** ⧗ 모래시계 선 아이콘 (텍스트 문자 대신, CLAUDE.md) */
export function Hourglass({ size, color, className }: { size: number; color: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9"
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 문구 속 ⧗ 문자를 모래시계 아이콘으로 바꿔 보여 준다 */
export function GlyphText({ text, color = 'currentColor' }: { text: string; color?: string }) {
  const parts = text.split('⧗')
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <Hourglass size={14} color={color} className="mx-px inline-block -translate-y-px align-middle" />}
          {p}
        </span>
      ))}
    </>
  )
}

interface DieFaceProps {
  face: Face
  /** 이 면의 색. ⧗ 면은 무색(undefined) */
  color: Color | undefined
  size?: number
  /** 기호(색 구분용)를 보일지 */
  showSymbol?: boolean
  dim?: boolean
  /** 반투명 미리보기 (놓을 칸, 넘길 칸) */
  ghost?: boolean
  /** 정육면체의 한 면으로 쓸 때: 그림자 없이 모서리를 덜 둥글게 */
  bare?: boolean
  className?: string
}

/** 주사위 한 면. 색 + 모양 기호 + 숫자/⧗ 아이콘을 함께 쓴다 (색맹 대응) */
export function DieFace({ face, color, size = 40, showSymbol = true, dim = false, ghost = false, bare = false, className = '' }: DieFaceProps) {
  const c = tint(color)
  const radius = Math.round(size * (bare ? 0.12 : 0.22))
  return (
    <span
      role="img"
      aria-label={`${colorLabel(color)} ${faceLabel(face)}`}
      className={`relative inline-flex shrink-0 items-center justify-center font-display font-bold leading-none ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        color: c.ink,
        fontSize: size * 0.52,
        opacity: ghost ? 0.42 : dim ? 0.45 : 1,
        background: `radial-gradient(120% 90% at 30% 20%, ${c.light} 0%, ${c.fill} 48%, ${c.dark} 100%)`,
        boxShadow: ghost
          ? `inset 0 0 0 1.5px ${c.light}`
          : bare
            ? `inset 0 0 0 1px rgb(0 0 0 / 0.25)${c.stroke ? `, inset 0 0 0 1.5px ${c.stroke}` : ''}`
          : `inset 0 ${Math.max(1, size * 0.05)}px 0 rgb(255 255 255 / 0.28), inset 0 -${Math.max(2, size * 0.08)}px 0 rgb(0 0 0 / 0.28), 0 ${Math.max(2, size * 0.08)}px ${size * 0.22}px rgb(0 0 0 / 0.45)${c.stroke ? `, inset 0 0 0 1.5px ${c.stroke}` : ''}`,
        filter: ghost ? 'saturate(0.8)' : undefined,
      }}
    >
      {isTime(face) ? (
        <Hourglass size={size * 0.58} color={c.ink} />
      ) : (
        <span style={{ textShadow: c.ink === '#ffffff' ? '0 1px 2px rgb(0 0 0 / 0.35)' : undefined }}>{face}</span>
      )}
      {showSymbol && size >= 24 && c.symbol && (
        <span
          aria-hidden="true"
          className="absolute leading-none opacity-80"
          style={{ top: size * 0.07, left: size * 0.1, fontSize: Math.max(9, size * 0.22) }}
        >
          {c.symbol}
        </span>
      )}
    </span>
  )
}
