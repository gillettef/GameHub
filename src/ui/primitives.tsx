/** 공통 UI 부품: 버튼, 바텀 시트, 카드, 상단 바, 분할 선택 */
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useBack } from './back'
import { GlyphText } from './DieFace'
import { buzz } from './fx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT: Record<Variant, string> = {
  primary:
    'relative overflow-hidden text-white bg-gradient-to-b from-[#ab9eff] to-accent-deep shadow-[0_8px_24px_-6px_rgb(155_140_255/0.7),inset_0_1px_0_rgb(255_255_255/0.35)] active:shadow-[0_2px_10px_-4px_rgb(155_140_255/0.7)]',
  secondary: 'bg-raised text-fg ring-1 ring-line ring-inset active:bg-line',
  ghost: 'text-muted active:bg-white/5',
  danger: 'bg-danger/12 text-[#ff9b9b] ring-1 ring-danger/40 ring-inset active:bg-danger/20',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'md' | 'lg' | 'sm'
  block?: boolean
  /** 누를 때 진동 */
  haptic?: boolean
}

export function Button({ variant = 'secondary', size = 'md', block = false, haptic = true, className = '', onClick, children, ...rest }: ButtonProps) {
  const sizing = size === 'lg' ? 'min-h-14 px-6 text-[17px] rounded-2xl' : size === 'sm' ? 'min-h-11 min-w-11 px-3.5 text-sm rounded-xl' : 'min-h-12 px-5 text-[15px] rounded-xl'
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 font-bold tracking-tight transition-[transform,background-color,box-shadow,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${sizing} ${VARIANT[variant]} ${block ? 'w-full' : ''} ${className}`}
      onClick={(e) => {
        if (haptic) buzz(8)
        onClick?.(e)
      }}
      {...rest}
    >
      {variant === 'primary' && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-gradient-to-r motion-reduce:hidden from-transparent via-white/25 to-transparent" />
      )}
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </button>
  )
}

/** 화면 위쪽 바: 왼쪽 버튼, 가운데 제목, 오른쪽 버튼 */
export function TopBar({ left, title, right }: { left?: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 -mx-4 -mt-[env(safe-area-inset-top)] grid grid-cols-[minmax(44px,auto)_1fr_minmax(44px,auto)] items-center gap-2 bg-void/95 px-2 pt-[calc(env(safe-area-inset-top)+4px)] pb-1">
      <div className="flex justify-start">{left}</div>
      <div className="truncate text-center font-display text-[15px] font-semibold tracking-wide">{title}</div>
      <div className="flex justify-end">{right}</div>
    </header>
  )
}

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-4 px-4 pb-8 ${className}`}>{children}</main>
}

export function Panel({
  children,
  className = '',
  title,
  action,
  highlight = false,
}: {
  children: ReactNode
  className?: string
  title?: ReactNode
  action?: ReactNode
  /** 지금 조작할 곳이면 테두리를 포인트 색으로 */
  highlight?: boolean
}) {
  return (
    <section className={`rounded-3xl bg-surface/90 p-4 ring-1 ring-inset transition-shadow duration-300 ${highlight ? 'ring-accent/60 shadow-[0_0_28px_-8px_rgb(155_140_255/0.55)]' : 'ring-line'} ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** 바텀 시트. 배경을 누르거나 닫기·Esc·뒤로가기로 닫힌다. 열리면 닫기 버튼에 포커스, 닫히면 원래 자리로 */
export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useBack(onClose)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('[data-sheet-close]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key !== 'Tab' || !panel.current) return
      // 포커스를 시트 안에 가둔다
      const items = panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, summary, [tabindex]:not([tabindex="-1"])')
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      before?.focus?.()
    }
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex animate-fade items-end justify-center bg-black/60" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={() => closeRef.current()}>
      <div
        ref={panel}
        className="flex max-h-[88dvh] w-full max-w-[480px] animate-sheet flex-col rounded-t-[28px] bg-surface shadow-[0_-12px_40px_rgb(0_0_0/0.5)] ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line" aria-hidden="true" />
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-2">
          <h2 id={titleId} className="font-display text-lg font-bold">
            {title}
          </h2>
          <Button variant="ghost" size="sm" data-sheet-close onClick={() => closeRef.current()}>
            닫기
          </Button>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto overscroll-contain px-5 pt-2 pb-[max(20px,env(safe-area-inset-bottom))] [&>*]:shrink-0">{children}</div>
      </div>
    </div>
  )
}

/** 되돌릴 수 없는 감점 행동용: 한 번 누르면 확인 상태, 한 번 더 누르면 실행 */
export function ConfirmButton({ children, confirmText, onConfirm, className = '' }: { children: ReactNode; confirmText: ReactNode; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false)
  return (
    <Button
      variant="danger"
      size="sm"
      block
      className={`${armed ? 'animate-shake bg-danger/30 ring-2 ring-danger' : ''} ${className}`}
      aria-live="polite"
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (armed) onConfirm()
        else setArmed(true)
      }}
    >
      {armed ? confirmText : children}
    </Button>
  )
}

export type CardTone = 'law' | 'goal' | 'personal' | 'event'

const TONE: Record<CardTone, string> = {
  law: '#9b8cff',
  goal: '#5ad1e6',
  personal: '#f2a65a',
  event: '#ff8a7a',
}

/** 카드: 머리띠 색으로 종류를 구분 (CLAUDE.md 카드 머리띠) */
export function GameCard({
  tone,
  kind,
  name,
  text,
  children,
  className = '',
}: {
  tone: CardTone
  kind: ReactNode
  name: ReactNode
  text?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const color = TONE[tone]
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-raised/70 p-4 pt-5 text-left ring-1 ring-inset ${className}`}
      style={{ ['--tw-ring-color' as string]: `${color}55`, backgroundImage: `linear-gradient(160deg, ${color}1f, transparent 55%)` }}
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5" style={{ background: color }} />
      <span className="text-[11px] font-bold tracking-[0.12em]" style={{ color }}>
        {kind}
      </span>
      <span className="mt-0.5 block font-display text-lg leading-snug font-bold text-fg">{typeof name === 'string' ? <GlyphText text={name} /> : name}</span>
      {text && <span className="mt-1 block text-[13.5px] leading-relaxed text-muted">{typeof text === 'string' ? <GlyphText text={text} /> : text}</span>}
      {children}
    </div>
  )
}

/** 분할 선택 (라디오 그룹) */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="flex rounded-xl bg-void/60 p-1 ring-1 ring-line ring-inset" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            type="button"
            role="radio"
            aria-checked={on}
            key={String(o.value)}
            onClick={() => {
              buzz(6)
              onChange(o.value)
            }}
            className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-bold transition-all duration-200 ${on ? 'bg-accent text-void shadow-[0_4px_14px_-4px_rgb(155_140_255/0.8)]' : 'text-muted active:bg-white/5'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** 자리 색 동그라미 + 이름 첫 글자 */
export function Avatar({ name, color, size = 32, glow = false }: { name: string; color: string; size?: number; glow?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-void"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.44,
        background: `radial-gradient(circle at 30% 25%, #ffffffaa, ${color} 55%)`,
        boxShadow: glow ? `0 0 0 2px #14121f, 0 0 0 4px ${color}, 0 0 18px ${color}` : undefined,
      }}
    >
      {[...name.trim()][0] ?? '?'}
    </span>
  )
}
