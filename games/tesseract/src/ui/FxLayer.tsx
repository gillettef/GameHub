import { useEffect } from 'react'
import type { Seat } from '../app/session'
import { seatColor } from './colors'
import { buzz, type FxEvent } from './fx'
import { Avatar } from './primitives'

interface FxLayerProps {
  events: FxEvent[]
  seats: Seat[]
}

/**
 * 직전 행동으로 생긴 가벼운 사건(차례 넘김, 스스로 버린 잔해)을 한 번 보여 주는 겹침 레이어.
 * 확인이 필요한 사건(라운드 시작, 목표 달성 등)은 NoticeModal이 맡는다.
 * 부모가 행동 수를 key로 주므로 행동마다 새로 마운트되어 CSS 애니메이션이 다시 돈다.
 * 터치를 막지 않는다 (pointer-events: none).
 */
export function FxLayer({ events, seats }: FxLayerProps) {
  const turn = events.find((e) => e.kind === 'turn')
  const pops = events.filter((e) => e.kind === 'debris')
  // 화면을 읽는 사람에게는 GameScreen의 aria-live 요약(fxSummary)으로 같은 내용을 알린다

  const debris = pops.length
  useEffect(() => {
    if (debris > 0) buzz([40])
  }, [debris])

  if (events.length === 0) return null
  const name = (p: number) => seats[p]?.name ?? `${p + 1}번`

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
      {turn?.kind === 'turn' && (
        <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+58px)] flex animate-banner justify-center">
          <div
            className="flex items-center gap-2.5 rounded-full bg-surface/95 py-1.5 pr-5 pl-1.5 shadow-[0_10px_30px_rgb(0_0_0/0.5)] ring-1"
            style={{ ['--tw-ring-color' as string]: seatColor(turn.player) }}
          >
            <Avatar name={name(turn.player)} color={seatColor(turn.player)} size={30} />
            <span className="font-bold">{name(turn.player)} 차례</span>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 top-[38%] flex flex-col items-center gap-2">
        {pops.map((e, i) =>
          e.kind === 'debris' ? (
            <div
              key={i}
              className="flex animate-float items-center gap-3 rounded-2xl bg-void/90 px-4 py-2.5 shadow-[0_12px_40px_rgb(0_0_0/0.55)] ring-2"
              style={{ ['--tw-ring-color' as string]: '#ff6b6b', animationDelay: `${i * 160}ms` }}
            >
              <span className="text-sm font-bold">{name(e.player)} · 잔해</span>
              <span className="font-display text-2xl font-bold text-[#ff6b6b]">−{e.count}</span>
            </div>
          ) : null,
        )}
      </div>
    </div>
  )
}
