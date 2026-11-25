// ③ 공용 보드: 결말 3장(결정 원인 표시)과 시간선. 위가 과거, 아래가 결말(옛 화면과 같다). 칸이 많으면 영역 안에서 스크롤한다.
import { forwardRef } from 'react'
import { CARD, INITIAL, SUBJECTS, decisiveCause, stateAt } from '../engine/engine'
import type { Card, Fact } from '../engine/types'
import { FIG_COLOR, ICON, fact } from './cards'

/** 카드 앞면(시간선·손패·확인 창 공용) */
export function CardFace({ card, badge, compact }: { card: Card; badge?: string; compact?: boolean }) {
  return (
    <div className={`rc-card relative rounded-xl ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'}`} style={{ ['--fig' as string]: FIG_COLOR[card.figure] }}>
      {badge && <span className="absolute -top-2 right-2 rounded-full bg-[var(--rc-ember)] px-2 text-[11px] font-extrabold text-white">{badge}</span>}
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[15px] leading-5 font-extrabold">{card.title}</span>
        <span className="rc-fig shrink-0 text-xs font-extrabold">{card.figure}</span>
      </div>
      <div className="rc-sub text-[13px] leading-5">
        {card.cond ? fact(card.cond) : <span className="opacity-70">조건 없음</span>}
        <span className="mx-1 opacity-60">→</span>
        <b>{fact(card.effect)}</b>
      </div>
    </div>
  )
}

/** 결말 한 장과 지금의 결정 원인 */
export function EndingChip({ ending, timeline }: { ending: Fact; timeline: readonly (string | null)[] }) {
  const d = decisiveCause(timeline, ending)
  const fig = d ? CARD[d.cardId]!.figure : null
  return (
    <div className="rc-ending min-w-0 flex-1 rounded-lg px-2 py-1 text-[13px] leading-[1.25]">
      <div className="truncate">
        {ICON[ending.subject]} {ending.subject} <b>{ending.state}</b>
      </div>
      <div className="truncate text-[11px] text-muted">
        {fig ? (
          <>
            <b style={{ color: FIG_COLOR[fig] }} className="font-bold brightness-150">
              {fig}
            </b>{' '}
            · 칸 {d!.slot + 1}
          </>
        ) : (
          '결정 원인 없음'
        )}
      </div>
    </div>
  )
}

export interface TimelineProps {
  timeline: readonly (string | null)[]
  endings: readonly Fact[]
  showStates: boolean
  /** 고른 카드를 놓을 수 있는 칸 */
  legal: ReadonlySet<number>
  target: number | null
  flash: { placed: number | null; removed: readonly number[] }
  onPick(slot: number): void
}

export const Timeline = forwardRef<HTMLDivElement, TimelineProps>(function Timeline({ timeline, endings, showStates, legal, target, flash, onPick }, ref) {
  const endSubjects = new Set(endings.map((e) => e.subject))
  const decisive = new Set(endings.flatMap((e) => decisiveCause(timeline, e)?.slot ?? []))
  return (
    <div ref={ref} className="rc-smooth h-full overflow-y-auto overscroll-contain scroll-smooth px-3 pt-1 pb-3" aria-label="시간선">
      <p className="m-0 mb-1 ml-9 text-xs text-muted">위가 과거, 아래가 결말{showStates ? ' · 칩은 그 칸 직전까지 바뀐 상태' : ''}</p>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        <li className="flex gap-2">
          <span className="w-7 shrink-0 pt-2 text-right text-xs font-bold text-muted">시작</span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-0.5 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-[13px] text-muted">
            {SUBJECTS.map((s) => (
              <span key={s.id}>
                {ICON[s.id]} {s.id} {INITIAL[s.id]}
              </span>
            ))}
          </div>
        </li>
        {timeline.map((id, i) => {
          const c = id ? CARD[id] : undefined
          const changed = showStates ? SUBJECTS.map((s) => ({ s: s.id, st: stateAt(timeline, i, s.id) })).filter((x) => x.st !== INITIAL[x.s]) : []
          const fx = flash.placed === i ? 'rc-flash' : flash.removed.includes(i) ? 'rc-burn' : ''
          const isLegal = !c && legal.has(i)
          const isTarget = target === i
          return (
            <li key={i} id={`rc-slot-${i}`} className="flex scroll-my-2 gap-2">
              <span className={`w-7 shrink-0 pt-2.5 text-right text-xs font-bold ${isTarget ? 'text-primary' : 'text-muted'}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                {showStates && changed.length > 0 && (
                  <div className="mb-0.5 flex flex-wrap gap-1">
                    {changed.map((x) => (
                      <span key={x.s} className={`rounded-full bg-primary/15 px-1.5 text-[11px] whitespace-nowrap ${endSubjects.has(x.s) ? 'outline outline-[var(--rc-ember)]/60' : ''}`}>
                        {ICON[x.s]} {x.st}
                      </span>
                    ))}
                  </div>
                )}
                {c ? (
                  <div className={`rounded-xl ${fx}`}>
                    <CardFace card={c} compact badge={decisive.has(i) ? '결정 원인' : undefined} />
                  </div>
                ) : isLegal ? (
                  <button
                    type="button"
                    aria-pressed={isTarget}
                    aria-label={`칸 ${i + 1}${isTarget ? ' 선택됨' : '에 놓을 수 있음'}`}
                    className={`flex min-h-11 w-full items-center rounded-xl border-2 px-3 text-left text-sm font-bold ${fx} ${isTarget ? 'border-primary bg-primary/15 text-primary' : 'border-[var(--rc-ok)] bg-[var(--rc-ok)]/10 text-[var(--rc-ok)]'}`}
                    onClick={() => onPick(i)}
                  >
                    {isTarget ? `칸 ${i + 1}에 놓기 — 아래 버튼으로 확정` : '여기에 놓을 수 있음'}
                  </button>
                ) : (
                  <div className={`flex min-h-9 items-center rounded-xl border border-dashed border-line px-3 text-[13px] text-[#6f6257] ${fx}`}>빈 칸</div>
                )}
              </div>
            </li>
          )
        })}
        <li className="flex gap-2">
          <span className="w-7 shrink-0 pt-2 text-right text-xs font-bold text-muted">결말</span>
          <div className="rc-ending flex min-w-0 flex-1 flex-col rounded-xl px-2.5 py-1.5 text-[13px]">
            {endings.map((e) => (
              <span key={e.subject}>
                {ICON[e.subject]} <b>{e.subject} = {e.state}</b>
              </span>
            ))}
          </div>
        </li>
      </ol>
    </div>
  )
})
