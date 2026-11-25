import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { FIT, clampView, zoomAt, type View } from './zoom'

/** 이만큼 움직이기 전까지는 탭으로 본다 */
const DRAG_START = 8

interface Point {
  x: number
  y: number
}

/** ③ 공용 보드 영역: 두 손가락으로 확대, 확대한 상태에서 끌어 이동. 내용은 영역에 맞춰 그린다 */
export function BoardViewport({ children, maxZoom = 3 }: { children: ReactNode; maxZoom?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const travel = useRef(0)
  const dragged = useRef(false)
  const [view, setView] = useState<View>(FIT)

  const local = (e: PointerEvent): Point => {
    const r = box.current!.getBoundingClientRect()
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }
  }

  const down = (e: PointerEvent) => {
    if (pointers.current.size === 0) {
      travel.current = 0
      dragged.current = false
    }
    pointers.current.set(e.pointerId, local(e))
  }

  const move = (e: PointerEvent) => {
    const before = pointers.current.get(e.pointerId)
    if (!before) return
    const now = local(e)
    const others = [...pointers.current].filter(([id]) => id !== e.pointerId).map(([, p]) => p)
    pointers.current.set(e.pointerId, now)
    travel.current += Math.hypot(now.x - before.x, now.y - before.y)
    const size = box.current!.getBoundingClientRect()
    const other = others[0]
    if (!other && (view.scale === 1 || travel.current < DRAG_START)) return
    if (!dragged.current) {
      dragged.current = true
      box.current!.setPointerCapture(e.pointerId)
    }
    if (other) {
      const was = Math.hypot(before.x - other.x, before.y - other.y) || 1
      const is = Math.hypot(now.x - other.x, now.y - other.y)
      const mid = { x: (before.x + other.x) / 2, y: (before.y + other.y) / 2 }
      const shift = { x: (now.x - before.x) / 2, y: (now.y - before.y) / 2 }
      setView((v) => zoomAt(v, mid, is / was, shift, size, maxZoom))
    } else {
      setView((v) => clampView({ ...v, x: v.x + now.x - before.x, y: v.y + now.y - before.y }, size, maxZoom))
    }
  }

  const up = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId)
  }

  return (
    <div className="relative size-full">
      <div
        ref={box}
        className="size-full touch-none overflow-hidden"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(e) => {
          if (!dragged.current) return
          e.stopPropagation()
          e.preventDefault()
          dragged.current = false
        }}
      >
        <div
          className="flex size-full items-center justify-center p-2"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          {children}
        </div>
      </div>
      {view.scale > 1 && (
        <button
          type="button"
          className="absolute right-2 bottom-2 min-h-11 rounded-full border border-line bg-surface px-4 text-sm"
          onClick={() => setView(FIT)}
        >
          전체 보기
        </button>
      )}
    </div>
  )
}
