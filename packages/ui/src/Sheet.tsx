import { useEffect, useId, useRef, type ReactNode } from 'react'

/** 아래에서 올라오는 시트(로그·규칙·도움말·상세). 내용은 시트 안에서 스크롤한다 */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose(): void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/55" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[85dvh] w-full max-w-[440px] flex-col rounded-t-2xl border-t border-line bg-surface outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line py-1 pr-1 pl-4">
          <h2 id={titleId} className="m-0 text-base font-bold">
            {title}
          </h2>
          <button type="button" aria-label="닫기" className="size-12 text-xl text-muted" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="gh-bottom min-h-0 overflow-y-auto overscroll-contain px-4 pt-3">{children}</div>
      </div>
    </div>
  )
}
