/** 화면 공통 조각: 스프라이트, 아이콘, 카드, 말, 체력 막대, 행동 토큰 */
import type { CSSProperties, ReactNode } from 'react'
import sprite from '../../design/emblems.svg?raw'
import type { ClassId } from '../engine/data'
import { SUIT_NAMES } from '../engine/data'
import type { Card } from '../engine/game'
import { classIcon, seatVar } from './helpers'

export const Sprite = () => <div hidden dangerouslySetInnerHTML={{ __html: sprite }} />

export function Ico({ id, className = '' }: { id: string; className?: string }) {
  return (
    <svg className={`bc-ico ${className}`} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  )
}


const tierOf = (n: number) => (n <= 5 ? 'apprentice' : n <= 10 ? 'hero' : 'legend')
const TIER_KO = { apprentice: '견습', hero: '용사', legend: '전설' } as const

export function CardView({ card, w, state = '', onClick, label }: { card: Card; w?: number; state?: string; onClick?(): void; label?: string }) {
  const style = w ? ({ '--bc-card-w': `${w}px` } as CSSProperties) : undefined
  const Tag = onClick ? 'button' : 'div'
  if (card.suit === null) {
    return (
      <Tag type={onClick ? 'button' : undefined} className={`bc-card bc-card--shadow bc-suit--shadow ${state}`} style={style} onClick={onClick} aria-label={label ?? '그림자 카드, 아무 문양 아무 숫자'} aria-pressed={onClick ? state.includes('is-selected') : undefined}>
        <span className="bc-card__corner">
          <span className="bc-card__num">?</span>
          <Ico id="bc-shadow" />
        </span>
        <span className="bc-card__art">
          <Ico id="bc-shadow" />
        </span>
        <span className="bc-card__tier">와일드</span>
        <span className="bc-card__corner bc-card__corner--end">
          <span className="bc-card__num">?</span>
          <Ico id="bc-shadow" />
        </span>
      </Tag>
    )
  }
  const tier = tierOf(card.rank)
  return (
    <Tag type={onClick ? 'button' : undefined} className={`bc-card bc-card--${tier} bc-suit--${card.suit} ${state}`} style={style} onClick={onClick} aria-label={label ?? `${SUIT_NAMES[card.suit]} ${card.rank}`} aria-pressed={onClick ? state.includes('is-selected') : undefined}>
      <span className="bc-card__corner">
        <span className="bc-card__num">{card.rank}</span>
        <Ico id={`bc-suit-${card.suit}`} />
      </span>
      <span className="bc-card__art">
        <Ico id={`bc-suit-${card.suit}`} />
      </span>
      <span className="bc-card__tier">{card.forged ? '강화' : TIER_KO[tier]}</span>
      <span className="bc-card__crown">
        <Ico id="bc-crown" />
      </span>
      <span className="bc-card__corner bc-card__corner--end">
        <span className="bc-card__num">{card.rank}</span>
        <Ico id={`bc-suit-${card.suit}`} />
      </span>
    </Tag>
  )
}

export const CardBack = ({ w }: { w?: number }) => (
  <div className="bc-cardback" style={w ? ({ '--bc-card-w': `${w}px` } as CSSProperties) : undefined} role="img" aria-label="카드 뒷면">
    <Ico id="bc-crown" />
  </div>
)

export function Pawn({ seat, cls, extra = '', demon = false }: { seat: number; cls: ClassId | null; extra?: string; demon?: boolean }) {
  if (demon)
    return (
      <span className={`bc-pawn bc-pawn--demon ${extra}`} title="마왕">
        <Ico id="bc-crown" />
      </span>
    )
  return (
    <span className={`bc-pawn ${extra}`} style={seatVar(seat)}>
      <Ico id={classIcon(cls)} />
    </span>
  )
}

export function HpBar({ hp, max, demon = false }: { hp: number; max: number; demon?: boolean }) {
  return (
    <div className={`bc-hpbar ${demon ? 'bc-hpbar--demon' : ''}`} style={{ '--v': `${Math.max(0, Math.min(100, (hp / max) * 100))}%` } as CSSProperties}>
      <i />
    </div>
  )
}

export function Tokens({ lit, total, held = 0 }: { lit: number; total: number; held?: number }) {
  const items: ReactNode[] = []
  for (let i = 0; i < total; i++)
    items.push(
      <svg key={`t${i}`} className={`bc-token ${i < lit ? '' : 'is-spent'}`} viewBox="0 0 24 24" aria-hidden="true">
        <use href={`#${i < lit ? 'bc-ui-token' : 'bc-ui-token-spent'}`} />
      </svg>,
    )
  for (let i = 0; i < held; i++)
    items.push(
      <svg key={`h${i}`} className="bc-token is-held" viewBox="0 0 24 24" aria-hidden="true">
        <use href="#bc-ui-token-held" />
      </svg>,
    )
  return (
    <div className="bc-tokens" role="img" aria-label={`행동 토큰 ${lit}개 남음${held ? `, 대기 ${held}개` : ''}`}>
      {items}
    </div>
  )
}

