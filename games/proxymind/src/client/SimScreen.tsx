// 자동 시뮬레이션(옛 화면과 같은 지표): 봇끼리 여러 판을 돌려 설계자 점수 비중, 자리별 승률, 점수 출처, 개입 비율, 타일 발동률을 본다.
// 브라우저에서 10판씩 나눠 계산하고(화면이 멈추지 않게), 조각 결과를 판 수로 가중 평균한다.
import { Button, Screen } from '@gamehub/ui'
import { useEffect, useRef, useState } from 'react'
import { runSims, type SimResult } from '../engine/sim'
import type { BotLevel } from '../engine/types'
import { COLORS } from '../text'
import { Segmented } from './Segmented'
import { store } from './store'

interface SimConfig {
  n: 3 | 4 | 5
  games: 50 | 200 | 500
  level: BotLevel
}

const COUNTS = [
  [3, '3인'],
  [4, '4인'],
  [5, '5인'],
] as const
const GAMES = [
  [50, '50'],
  [200, '200'],
  [500, '500'],
] as const
const LEVELS = [
  ['normal', '보통'],
  ['easy', '쉬움'],
] as const
const IV_NAME: Record<string, string> = { none: '개입 안 함', turn: '회전', block: '차단', thrust: '추진' }
const CHUNK = 10

/** 조각별 결과를 판 수 가중 평균으로 합친다(옛 화면의 merge 와 같다) */
function merge(rs: SimResult[]): SimResult {
  const games = rs.reduce((a, r) => a + r.games, 0)
  const w = (f: (r: SimResult) => number) => rs.reduce((a, r) => a + f(r) * r.games, 0) / games
  const scoreSum = w((r) => r.avgScore)
  return {
    games,
    n: rs[0]!.n,
    seatWin: rs[0]!.seatWin.map((_, i) => w((r) => r.seatWin[i]!)),
    avgScore: scoreSum,
    avgCores: w((r) => r.avgCores),
    avgDp: w((r) => r.avgDp),
    dpShare: scoreSum ? w((r) => r.avgDp) / scoreSum : 0,
    dpFromBump: w((r) => r.dpFromBump),
    dpFromSpent: w((r) => r.dpFromSpent),
    coreByRule: w((r) => r.coreByRule),
    coreByThrust: w((r) => r.coreByThrust),
    ivs: Object.fromEntries(Object.keys(rs[0]!.ivs).map((k) => [k, w((r) => r.ivs[k]!)])),
    tileFire: rs[0]!.tileFire.map((t, i) => {
      const placed = rs.reduce((a, r) => a + r.tileFire[i]!.placed, 0)
      const fired = rs.reduce((a, r) => a + r.tileFire[i]!.placed * r.tileFire[i]!.fireRate, 0)
      return { ...t, placed, fireRate: placed ? fired / placed : 0 }
    }),
  }
}

export function SimScreen({ onBack }: { onBack(): void }) {
  const [cfg, setCfg] = useState<SimConfig>(() => store.get('sim', { n: 4, games: 200, level: 'normal' }))
  const [run, setRun] = useState<{ cfg: SimConfig; done: number; result: SimResult | null; running: boolean } | null>(null)
  const token = useRef(0)
  useEffect(() => () => void token.current++, [])

  const start = async () => {
    store.set('sim', cfg)
    const my = ++token.current
    const job = { ...cfg }
    const seed = Math.floor(Math.random() * 2 ** 31)
    const parts: SimResult[] = []
    setRun({ cfg: job, done: 0, result: null, running: true })
    for (let done = 0; done < job.games; ) {
      await new Promise((ok) => setTimeout(ok, 0))
      if (my !== token.current) return
      const k = Math.min(CHUNK, job.games - done)
      parts.push(runSims(job.n, k, seed + done * 13, job.level))
      done += k
      setRun({ cfg: job, done, result: merge(parts), running: done < job.games })
    }
  }

  return (
    <Screen
      footer={
        <Button tone="primary" disabled={run?.running} onClick={start}>
          {run?.running ? `실행 중… ${run.done}/${run.cfg.games}` : run ? '다시 실행' : '실행'}
        </Button>
      }
    >
      <button
        type="button"
        className="inline-flex min-h-11 min-w-11 items-center text-sm text-muted"
        onClick={() => {
          token.current++
          onBack()
        }}
      >
        ‹ 처음으로
      </button>
      <h1 className="mt-1 mb-2 text-2xl font-extrabold">자동 시뮬레이션</h1>
      <p className="mt-0 text-sm text-muted">봇끼리 끝까지 돌려 룰북 v0.3.1의 밸런스 지표를 모읍니다. 목표: 설계자 점수 비중 30~40%, 어느 자리도 승률 50% 미만.</p>
      <p className="mb-1 text-sm text-muted">인원</p>
      <Segmented label="인원" options={COUNTS} value={cfg.n} onChange={(n) => setCfg((c) => ({ ...c, n }))} />
      <p className="mt-3 mb-1 text-sm text-muted">판 수</p>
      <Segmented label="판 수" options={GAMES} value={cfg.games} onChange={(games) => setCfg((c) => ({ ...c, games }))} />
      <p className="mt-3 mb-1 text-sm text-muted">봇 실력</p>
      <Segmented label="봇 실력" options={LEVELS} value={cfg.level} onChange={(level) => setCfg((c) => ({ ...c, level }))} />
      {run && <SimReport {...run} />}
    </Screen>
  )
}

function SimReport({ cfg, done, result: r }: { cfg: SimConfig; done: number; result: SimResult | null }) {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`
  const stat = (value: string, label: string) => (
    <div className="rounded-xl bg-bg px-3 py-2">
      <b className="block text-xl">{value}</b>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
  const row = (label: string, value: string) => (
    <tr key={label} className="border-b border-line">
      <td className="py-1.5">{label}</td>
      <td className="py-1.5 text-right tabular-nums">{value}</td>
    </tr>
  )
  return (
    <section className="mt-4 rounded-2xl bg-surface p-4" aria-label="시뮬레이션 결과">
      <div className="flex justify-between">
        <b>
          {cfg.n}인 · {cfg.level === 'easy' ? '쉬움' : '보통'}
        </b>
        <span className="text-sm text-muted">
          {done} / {cfg.games}판
        </span>
      </div>
      <div className="my-2 h-1.5 overflow-hidden rounded bg-bg">
        <i className="block h-full bg-primary" style={{ width: `${(done / cfg.games) * 100}%` }} />
      </div>
      {r && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {stat(pct(r.dpShare), '설계자 점수 비중')}
            {stat(r.avgScore.toFixed(1), '1인 평균 점수')}
            {stat(r.avgCores.toFixed(2), '1인 평균 코어')}
            {stat(r.avgDp.toFixed(2), '1인 평균 설계자 점수')}
          </div>
          <h3 className="mt-4 mb-2 text-sm text-muted">자리별 승률 (선 플레이어 기준 시작 자리)</h3>
          {r.seatWin.map((w, i) => (
            <div key={i} className="mb-2">
              <div className="mb-0.5 text-xs text-muted">{i + 1}번 자리</div>
              <div className="relative h-7 overflow-hidden rounded-lg bg-bg">
                <i className="absolute inset-y-0 left-0 rounded-lg" style={{ width: `${w * 100}%`, background: COLORS[i] }} />
                <span className="absolute top-0.5 left-2.5 text-sm font-bold text-white [text-shadow:0_1px_2px_#000a]">{pct(w)}</span>
              </div>
            </div>
          ))}
          <h3 className="mt-4 mb-1 text-sm text-muted">점수의 출처 (1인 평균)</h3>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {row('충돌로 얻은 설계자 점수', r.dpFromBump.toFixed(2))}
              {row('쓴 에너지로 얻은 설계자 점수', r.dpFromSpent.toFixed(2))}
              {row('규칙 타일로 얻은 코어', r.coreByRule.toFixed(2))}
              {row('추진으로 얻은 코어', r.coreByThrust.toFixed(2))}
            </tbody>
          </table>
          <h3 className="mt-4 mb-1 text-sm text-muted">개입 비율</h3>
          <table className="w-full border-collapse text-sm">
            <tbody>{Object.entries(r.ivs).map(([k, x]) => row(IV_NAME[k] ?? k, pct(x)))}</tbody>
          </table>
          <h3 className="mt-4 mb-1 text-sm text-muted">규칙 타일 (꽂힌 횟수 · 꽂혔을 때 발동률)</h3>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {r.tileFire.map((t) => (
                <tr key={t.code} className="border-b border-line">
                  <td className="py-1.5 pr-2 text-muted">{t.code}</td>
                  <td className="py-1.5">{t.text}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">{t.placed}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">{pct(t.fireRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
