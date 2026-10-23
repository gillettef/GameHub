import type { Market } from '../engine'
import { colorLabel, faceLabel } from './colors'
import { DieFace } from './DieFace'
import { buzz } from './fx'

interface MarketViewProps {
  market: Market
  /** 지금 가져갈 수 있으면 칸 번호를 넘긴다 */
  onTake?: (slot: number) => void
  /** 흔들리는 시장: 다시 굴릴 주사위를 고르는 중 */
  rerollMode?: boolean
  onReroll?: (slot: number, dieId: number) => void
}

const DIE_SIZE: Record<number, number> = { 1: 40, 2: 36, 3: 32, 4: 30, 5: 28 }

/** 시장 (§5): 칸 하나 = 주사위 묶음 하나. 칸을 통째로 탭해서 가져온다 */
export function MarketView({ market, onTake, rerollMode = false, onReroll }: MarketViewProps) {
  const size = DIE_SIZE[market.length] ?? 28
  const canTake = !!onTake && !rerollMode
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${market.length}, minmax(0, 1fr))` }} aria-label="시장">
      {market.map((slot, i) => {
        const taken = slot === null
        const dice = slot ?? []
        const diceText = dice.map((d) => `${colorLabel(d.color)} ${faceLabel(d.orientation.top)}`).join(', ')
        const label = taken ? `${i + 1}번 칸, 가져감` : `${i + 1}번 칸, ${dice.length === 0 ? '빈 칸' : diceText}`
        const inner = (
          <>
            <span className="absolute top-1.5 left-2 font-display text-[11px] font-bold text-muted">{i + 1}</span>
            <span aria-hidden={!rerollMode} className="flex min-h-[64px] flex-wrap content-center items-center justify-center gap-1 pt-3">
              {dice.map((d, k) =>
                rerollMode && onReroll ? (
                  <button
                    key={d.id}
                    type="button"
                    className="glow-pulse flex min-h-11 min-w-11 items-center justify-center rounded-xl ring-2 ring-event active:scale-90"
                    style={{ ['--glow' as string]: '#ff8a7a' }}
                    aria-label={`${i + 1}번 칸 ${colorLabel(d.color)} ${faceLabel(d.orientation.top)} 다시 굴리기`}
                    onClick={() => {
                      buzz(14)
                      onReroll(i, d.id)
                    }}
                  >
                    <DieFace face={d.orientation.top} color={d.color} size={size} />
                  </button>
                ) : (
                  <span key={d.id} className="animate-tumble" style={{ animationDelay: `${i * 50 + k * 70}ms` }}>
                    <DieFace face={d.orientation.top} color={d.color} size={size} />
                  </span>
                ),
              )}
              {taken && <span className="text-xs font-bold text-muted">가져감</span>}
              {!taken && dice.length === 0 && <span className="text-xs text-muted">빈 칸</span>}
            </span>
          </>
        )
        const base = 'relative flex w-full flex-col rounded-2xl px-1 pb-2 transition-all duration-200'
        if (taken) {
          return (
            <li key={i} className={`${base} border border-dashed border-line/80 opacity-60`}>
              <span className="sr-only">{label}</span>
              {inner}
            </li>
          )
        }
        return (
          <li key={i} className="flex">
            {canTake && dice.length > 0 ? (
              <button
                type="button"
                aria-label={`${label} 가져오기`}
                className={`${base} glow-pulse bg-raised/80 ring-2 ring-accent ring-inset active:scale-95`}
                onClick={() => {
                  buzz(16)
                  onTake(i)
                }}
              >
                {inner}
              </button>
            ) : (
              <div className={`${base} bg-raised/50 ring-1 ring-line ring-inset`}>
                <span className="sr-only">{label}</span>
                {inner}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
