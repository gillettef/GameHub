// 밸런스 시뮬레이션: 봇으로 여러 판을 돌려 좌석 승률과 진행 통계를 본다(브라우저에서 조금씩 나눠 계산)
import { Button, Screen } from '@gamehub/ui'
import { useEffect, useRef, useState } from 'react'
import type { ProfileName } from '../engine/bot'
import { cellName } from '../engine/engine'
import { RULES, per } from '../engine/rules'
import { runGame } from '../engine/sim'
import { COLORS, PROFILES, PROFILE_LABEL, store } from './seats'
import { Segmented } from './Segmented'
import { BackLink } from './WatchSetup'

interface SimConfig {
  n: number
  games: number
  profiles: ProfileName[]
}

interface Tally {
  done: number
  wins: number[]
  turns: number
  ties: number
  folds: number
  covers: number
}

const COUNTS = [
  [2, '2인'],
  [3, '3인'],
  [4, '4인'],
] as const
const GAMES = [
  [50, '50'],
  [100, '100'],
  [300, '300'],
  [1000, '1000'],
] as const

export function SimScreen({ onBack }: { onBack(): void }) {
  const [cfg, setCfg] = useState<SimConfig>(() => store.get('sim', { n: 4, games: 100, profiles: ['balanced', 'balanced', 'balanced', 'balanced'] }))
  const [run, setRun] = useState<{ cfg: SimConfig; tally: Tally; running: boolean } | null>(null)
  const token = useRef(0)
  useEffect(() => () => void token.current++, [])

  const start = async () => {
    store.set('sim', cfg)
    const my = ++token.current
    const job = { ...cfg, profiles: cfg.profiles.slice(0, cfg.n) }
    const tally: Tally = { done: 0, wins: new Array<number>(job.n).fill(0), turns: 0, ties: 0, folds: 0, covers: 0 }
    const seed0 = Math.floor(Math.random() * 1e6)
    setRun({ cfg: job, tally: { ...tally }, running: true })
    for (let i = 0; i < job.games; i++) {
      if (my !== token.current) return
      const r = runGame(job.n, seed0 + i, RULES, job.profiles)
      for (const w of r.winners) tally.wins[w]! += 1 / r.winners.length
      if (r.winners.length > 1) tally.ties++
      tally.turns += r.stats.turns
      tally.folds += r.stats.folds + r.stats.unfolds
      tally.covers += r.stats.coverEvents
      tally.done = i + 1
      if (i % 5 === 4 || i === job.games - 1) {
        setRun({ cfg: job, tally: { ...tally, wins: tally.wins.slice() }, running: i < job.games - 1 })
        await new Promise((ok) => setTimeout(ok, 0))
      }
    }
  }

  const setProfile = (i: number, p: ProfileName) => setCfg((c) => ({ ...c, profiles: c.profiles.map((x, k) => (k === i ? p : x)) }))

  return (
    <Screen
      footer={
        <Button tone="primary" disabled={run?.running} onClick={start}>
          {run?.running ? '실행 중…' : run ? '다시 실행' : '실행'}
        </Button>
      }
    >
      <BackLink
        onClick={() => {
          token.current++
          onBack()
        }}
      />
      <h1 className="mt-1 mb-4 text-2xl font-extrabold">밸런스 시뮬레이션</h1>
      <p className="mb-1 text-sm text-muted">인원</p>
      <Segmented label="인원" options={COUNTS} value={cfg.n as 2 | 3 | 4} onChange={(n) => setCfg((c) => ({ ...c, n }))} />
      <p className="mt-3 mb-1 text-sm text-muted">판 수</p>
      <Segmented label="판 수" options={GAMES} value={cfg.games as 50 | 100 | 300 | 1000} onChange={(games) => setCfg((c) => ({ ...c, games }))} />
      <p className="mt-3 mb-1 text-sm text-muted">봇 성향 (차례 순서)</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {Array.from({ length: cfg.n }, (_, i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl bg-surface p-2 pl-3">
            <span className="size-3.5 shrink-0 rounded-full" style={{ background: COLORS[i] }} />
            <span className="w-12 shrink-0">{i + 1}번째</span>
            <div className="flex-1">
              <Segmented label={`${i + 1}번째 성향`} options={PROFILES} value={cfg.profiles[i] ?? 'balanced'} onChange={(p) => setProfile(i, p)} />
            </div>
          </li>
        ))}
      </ul>
      {run && <SimResult {...run} />}
    </Screen>
  )
}

function SimResult({ cfg, tally: t }: { cfg: SimConfig; tally: Tally }) {
  const done = Math.max(1, t.done)
  const stat = (value: string, label: string) => (
    <div className="rounded-xl bg-bg px-3 py-2">
      <b className="block text-xl">{value}</b>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
  return (
    <section className="mt-4 rounded-2xl bg-surface p-4" aria-label="시뮬레이션 결과">
      <div className="flex justify-between">
        <b>결과</b>
        <span className="text-sm text-muted">
          {t.done} / {cfg.games}판
        </span>
      </div>
      <div className="my-2 h-1.5 overflow-hidden rounded bg-bg">
        <i className="block h-full bg-primary" style={{ width: `${(t.done / cfg.games) * 100}%` }} />
      </div>
      {t.wins.map((w, i) => (
        <div key={i} className="mb-2">
          <div className="mb-0.5 text-xs text-muted">
            {i + 1}번째 · {PROFILE_LABEL[cfg.profiles[i] ?? 'balanced']} · 닻 {cellName(...per(RULES.anchors, cfg.n)[i]!)}
          </div>
          <div className="relative h-7 overflow-hidden rounded-lg bg-bg">
            <i className="absolute inset-y-0 left-0 rounded-lg" style={{ width: `${(w / done) * 100}%`, background: COLORS[i] }} />
            <span className="absolute top-0.5 left-2.5 text-sm font-bold text-white [text-shadow:0_1px_2px_#000a]">{((w / done) * 100).toFixed(1)}%</span>
          </div>
        </div>
      ))}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {stat((t.turns / done).toFixed(1), '평균 차례 수')}
        {stat(`약 ${Math.round(((t.turns / done) * 80) / 60)}분`, '예상 시간 (차례당 80초)')}
        {stat((t.folds / Math.max(1, t.turns)).toFixed(2), '차례당 접기·펼치기')}
        {stat(`${((t.ties / done) * 100).toFixed(1)}%`, '공동 승리')}
        {stat((t.covers / done).toFixed(1), '한 판의 가리기 횟수')}
        {stat(`${(100 / cfg.n).toFixed(1)}%`, '완전히 공정한 좌석 승률')}
      </div>
    </section>
  )
}
