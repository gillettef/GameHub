import type { ReactNode } from 'react'

export interface ResultRow {
  id: number
  name: string
  score: ReactNode
  detail?: ReactNode
  winner?: boolean
}

/** 결과 순위. rows 는 순위 순서로 준다 */
export function ResultList({ rows }: { rows: ResultRow[] }) {
  return (
    <ol className="m-0 list-none p-0">
      {rows.map((r, i) => (
        <li key={r.id} className={`mb-1.5 flex min-h-14 items-center gap-3 rounded-xl border-2 bg-raised px-3 ${r.winner ? 'border-primary' : 'border-transparent'}`}>
          <span className="w-6 text-center font-bold text-muted">{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              {r.name}
              {r.winner && <span className="ml-2 text-sm text-primary">승리</span>}
            </span>
            {r.detail != null && <span className="block text-xs text-muted">{r.detail}</span>}
          </span>
          <span className="text-2xl font-bold tabular-nums">{r.score}</span>
        </li>
      ))}
    </ol>
  )
}
