/**
 * 게임 카드 (Claude Design 캔버스 「카드 v2」 보드).
 *
 * 우주 테마 보드게임 카드의 문법을 빌렸다: 각진 SF 프레임(모서리 두 곳을 자름), 종류 띠와 우상단 태그,
 * 성운 일러스트 창(cardArtData.ts), 육각 점수 배지. 크기는 셋:
 * - mini: 세로 썸네일 (라운드 시작 알림처럼 여러 장을 나란히 보일 때)
 * - normal: 가로 카드 (카드 시트, 개인 목표 고르기)
 * - large: 확대 보기 (CardZoom)
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { useBack } from './back'
import { CardArt } from './CardArt'
import { cardInfo, type CardKey } from './cardArtData'
import { GlyphText } from './DieFace'
import { Button } from './primitives'

export type CardSize = 'mini' | 'normal' | 'large'

/** 모서리 두 곳(왼위·오른아래)을 자른 SF 프레임 */
const frameClip = (cut: number) => `polygon(${cut}px 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%, 0 ${cut}px)`
const HEX = 'polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0 50%)'

function Hex({ value, label, tone, size }: { value: string; label?: string; tone: string; size: number }) {
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span
        className="flex items-center justify-center font-display font-bold text-void"
        style={{ width: size * 1.12, height: size, clipPath: HEX, background: `linear-gradient(160deg, #fff8, ${tone} 45%)`, fontSize: size * 0.5 }}
      >
        {value}
      </span>
      {label && <span className="text-xs leading-none font-bold text-muted">{label}</span>}
    </span>
  )
}

/** 일러스트 창: 얇은 테두리와 HUD 모서리 눈금 */
function ArtWindow({ card, tone, className = '' }: { card: CardKey; tone: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden ring-1 ring-inset ${className}`} style={{ ['--tw-ring-color' as string]: `${tone}55`, aspectRatio: '3 / 2' }}>
      <CardArt card={card} tone={tone} className="size-full" />
      {(['top-1 left-1 border-t border-l', 'top-1 right-1 border-t border-r', 'bottom-1 left-1 border-b border-l', 'bottom-1 right-1 border-b border-r'] as const).map((pos) => (
        <span key={pos} aria-hidden="true" className={`absolute size-2 ${pos}`} style={{ borderColor: tone }} />
      ))}
    </div>
  )
}

interface CardProps {
  card: CardKey
  size?: CardSize
  /** 카드 아래에 붙는 것 (달성 마커 등) */
  children?: ReactNode
  /** 주면 카드를 눌러 확대해 볼 수 있다 */
  onOpen?: () => void
  /** 종류 이름을 바꿔 보일 때 (예: 「○○의 개인 목표 · 비공개」) */
  kindLabel?: string
  className?: string
}

export function Card({ card, size = 'normal', children, onOpen, kindLabel, className = '' }: CardProps) {
  const info = cardInfo(card)
  const cut = size === 'mini' ? 8 : size === 'large' ? 16 : 12
  const body =
    size === 'mini' ? (
      <div className="flex h-full flex-col gap-1.5 p-1.5">
        <div className="flex items-center justify-between px-0.5 text-xs leading-none font-bold" style={{ color: info.tone }}>
          <span>{info.short}</span>
          {info.points[0] && <Hex value={info.points[0].value} tone={info.tone} size={18} />}
        </div>
        <ArtWindow card={card} tone={info.tone} />
        <span className="line-clamp-2 px-0.5 text-[13px] leading-tight font-bold text-fg">
          <GlyphText text={info.name} />
        </span>
      </div>
    ) : size === 'normal' ? (
      <div className="flex gap-3 p-2.5">
        <ArtWindow card={card} tone={info.tone} className="w-[34%] max-w-[132px] shrink-0 self-start" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center justify-between gap-2 text-xs font-bold tracking-[0.08em]" style={{ color: info.tone }}>
            <span className="truncate">{kindLabel ?? info.kind}</span>
            <span className="shrink-0 font-display tracking-normal opacity-80">{info.tag}</span>
          </span>
          <span className="font-display text-[17px] leading-snug font-bold text-fg">
            <GlyphText text={info.name} />
          </span>
          <span className="text-[13px] leading-relaxed text-muted">
            <GlyphText text={info.text} />
          </span>
          {info.points.length > 0 && (
            <span className="mt-1 flex gap-2">
              {info.points.map((p) => (
                <span key={p.label} className="inline-flex items-center gap-1">
                  <Hex value={p.value} tone={info.tone} size={20} />
                  <span className="text-xs font-bold text-muted">{p.label}</span>
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    ) : (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between text-sm font-bold tracking-[0.1em]" style={{ color: info.tone }}>
          <span>{kindLabel ?? info.kind}</span>
          <span className="font-display tracking-normal">{info.tag}</span>
        </div>
        <ArtWindow card={card} tone={info.tone} />
        <h3 className="font-display text-2xl leading-tight font-bold text-fg">
          <GlyphText text={info.name} />
        </h3>
        <p className="text-[15px] leading-relaxed text-fg/90">
          <GlyphText text={info.text} />
        </p>
        {info.note && <p className="text-xs text-muted">{info.note}</p>}
        {info.points.length > 0 && (
          <div className="flex gap-2">
            {info.points.map((p) => (
              <div key={p.label} className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed py-2" style={{ borderColor: `${info.tone}88` }}>
                <Hex value={p.value} tone={info.tone} size={30} />
                <span className="text-sm font-bold text-muted">{p.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )

  const frame = (
    <div
      className={`relative w-full p-px text-left ${className}`}
      style={{ clipPath: frameClip(cut), background: `linear-gradient(150deg, ${info.tone}, #34304d 40%, #34304d 70%, ${info.tone}99)` }}
    >
      <div className="relative h-full bg-surface" style={{ clipPath: frameClip(cut - 0.5), backgroundImage: `linear-gradient(165deg, ${info.tone}24, transparent 45%)` }}>
        {/* 종류 띠 */}
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ background: info.tone }} />
        <div className={size === 'mini' ? 'pt-1' : 'pt-1.5'}>{body}</div>
        {children && <div className={size === 'mini' ? 'px-1.5 pb-1.5' : size === 'large' ? 'px-4 pb-4' : 'px-2.5 pb-2.5'}>{children}</div>}
      </div>
    </div>
  )

  if (!onOpen) return frame
  return (
    <button type="button" className="block w-full transition-transform duration-150 active:scale-[0.97]" onClick={onOpen} aria-label={`${info.kind} ${info.name} 크게 보기`}>
      {frame}
    </button>
  )
}

/** 카드 확대 보기. 배경·닫기·Esc·뒤로가기로 닫힌다 */
export function CardZoom({ card, onClose, children, kindLabel }: { card: CardKey; onClose: () => void; children?: ReactNode; kindLabel?: string }) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useBack(onClose)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('[data-zoom-close]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      before?.focus?.()
    }
  }, [])
  const info = cardInfo(card)
  return (
    <div
      ref={panel}
      className="fixed inset-0 z-[60] flex animate-fade flex-col items-center justify-center gap-4 overflow-y-auto bg-black/80 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${info.kind} ${info.name}`}
      onClick={() => closeRef.current()}
    >
      <div className="w-full max-w-[340px] animate-pop" onClick={(e) => e.stopPropagation()}>
        <Card card={card} size="large" kindLabel={kindLabel}>
          {children}
        </Card>
      </div>
      <Button data-zoom-close variant="secondary" onClick={() => closeRef.current()}>
        닫기
      </Button>
    </div>
  )
}
