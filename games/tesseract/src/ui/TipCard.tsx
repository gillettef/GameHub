import { GlyphText } from './DieFace'
import { Button } from './primitives'
import { TIPS, type TipId } from './tips'
import { Icon } from './icons'

/** 상황별 도움말 카드 (TIPS) */
export function TipCard({ id, onDismiss, onOff }: { id: TipId; onDismiss: () => void; onOff: () => void }) {
  const tip = TIPS[id]
  return (
    <aside className="flex animate-rise flex-col gap-2 rounded-2xl bg-goal/10 p-3 ring-1 ring-goal/40 ring-inset" aria-label="도움말">
      <p className="flex items-center gap-1.5 text-sm font-bold text-goal">
        <Icon name="spark" size={16} /> {tip.title}
      </p>
      <p className="text-[13px] leading-relaxed text-fg/90">
        <GlyphText text={tip.text} />
      </p>
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={onOff}>
          도움말 그만 보기
        </Button>
        <Button size="sm" onClick={onDismiss}>
          알겠어요
        </Button>
      </div>
    </aside>
  )
}
