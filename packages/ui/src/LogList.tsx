import type { LogEntry } from '@gamehub/net'

/** 게임 기록. 최신이 위 */
export function LogList({ entries }: { entries: readonly LogEntry[] }) {
  if (entries.length === 0) return <p className="text-muted">아직 기록이 없습니다.</p>
  return (
    <ol className="m-0 list-none p-0">
      {[...entries].reverse().map((e) => (
        <li key={e.id} className="border-b border-line py-2 text-sm last:border-0">
          {e.text}
        </li>
      ))}
    </ol>
  )
}
