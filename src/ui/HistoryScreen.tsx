import { useMemo, useState } from 'react'
import { aggregate, summarize, type GameSummary, type Rate } from '../app/stats'
import { clearHistory, loadHistory, type Session } from '../app/session'
import { LAWS } from '../engine'
import { Button, Panel, Screen, TopBar } from './primitives'

interface HistoryScreenProps {
  onBack: () => void
  onReplay: (session: Session) => void
}

function RateList({ title, rates }: { title: string; rates: Rate[] }) {
  if (rates.length === 0) return null
  return (
    <Panel title={title} className="animate-rise">
      <dl className="flex flex-col divide-y divide-line/70">
        {rates.map((r) => (
          <div className="flex items-center justify-between gap-3 py-2 text-sm" key={r.label}>
            <dt className="text-muted">{r.label}</dt>
            <dd className="font-display font-bold">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}

/** 끝난 게임 기록, 리플레이, 플레이테스트 통계 (로드맵 9단계) */
export function HistoryScreen({ onBack, onReplay }: HistoryScreenProps) {
  const [history, setHistory] = useState(() => loadHistory())
  const summaries = useMemo(() => {
    const out: { session: Session; summary: GameSummary }[] = []
    for (const session of history) {
      try {
        out.push({ session, summary: summarize(session) })
      } catch {
        // 옛 규칙으로 저장된 기록은 다시 재생할 수 없으므로 건너뛴다
      }
    }
    return out
  }, [history])
  const stats = useMemo(() => aggregate(summaries.map((s) => s.summary)), [summaries])

  function exportJson() {
    const blob = new Blob([JSON.stringify({ games: history, summaries: summaries.map((s) => s.summary) }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tesseract-playtest-${summaries.length}games.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Screen>
      <TopBar
        left={
          <Button variant="ghost" size="sm" onClick={onBack}>
            뒤로
          </Button>
        }
        title="기록 · 통계"
      />

      {summaries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted">
          <span className="text-5xl" aria-hidden="true">
            🪐
          </span>
          끝난 게임이 아직 없어요.
        </div>
      ) : (
        <>
          <Panel title="게임 기록" className="animate-rise">
            <ul className="flex flex-col gap-2">
              {summaries.map(({ session, summary }) => (
                <li className="flex items-center gap-3 rounded-2xl bg-raised/60 p-3" key={summary.id}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">
                      {new Date(summary.createdAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })} · <span className="text-law">{LAWS[summary.law].name}</span>
                    </div>
                    <div className="truncate text-xs text-muted">
                      👑 {summary.winners.join(', ')} — {summary.scores.map((s) => `${s.name} ${s.total}`).join(' · ')}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => onReplay(session)}>
                    ▶
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>

          <RateList title="플레이테스트 지표" rates={stats.overview} />
          <RateList title="라운드 목표 달성률 (1인 기준)" rates={stats.goals} />
          <RateList title="개인 목표 달성률" rates={stats.personal} />
          <RateList title="우주 법칙별 평균 점수" rates={stats.laws} />

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={exportJson}>JSON 내보내기</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm('게임 기록을 모두 지울까요?')) {
                  clearHistory()
                  setHistory([])
                }
              }}
            >
              기록 지우기
            </Button>
          </div>
        </>
      )}
    </Screen>
  )
}
