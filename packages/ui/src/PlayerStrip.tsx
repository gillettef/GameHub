import type { ReactNode } from 'react'

export interface PlayerChip {
  id: number
  name: string
  /** 좌석 색 */
  color: string
  /** 가장 중요한 수치(점수 등) */
  score?: ReactNode
  /** 그 밖의 요약(손패 수, 자원 등) */
  detail?: ReactNode
  active?: boolean
  you?: boolean
  offline?: boolean
}

/** ② 플레이어 패널: 가로 한 줄. 누르면 상세 시트를 연다 */
export function PlayerStrip({ players, onSelect }: { players: PlayerChip[]; onSelect?(id: number): void }) {
  return (
    <ul className="m-0 flex shrink-0 list-none gap-1.5 overflow-x-auto overscroll-contain px-2 py-1.5">
      {players.map((p) => (
        <li key={p.id} className="min-w-[88px] flex-1">
          <button
            type="button"
            aria-current={p.active || undefined}
            className={`flex min-h-12 w-full flex-col items-start justify-center rounded-lg border-2 bg-surface px-2 py-1 text-left ${p.active ? 'border-primary' : 'border-transparent'} ${p.offline ? 'opacity-55' : ''}`}
            onClick={() => onSelect?.(p.id)}
          >
            <span className="flex w-full items-center gap-1.5 text-[13px]">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className={`truncate ${p.you ? 'font-bold' : ''}`}>{p.name}</span>
              {p.offline && <span className="shrink-0 text-xs text-danger">끊김</span>}
            </span>
            <span className="flex w-full items-baseline gap-1.5">
              {p.score != null && <span className="text-lg leading-6 font-bold tabular-nums">{p.score}</span>}
              {p.detail != null && <span className="truncate text-xs text-muted">{p.detail}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
