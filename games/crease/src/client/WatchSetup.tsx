// 봇 대전 관전 설정: 인원과 좌석별 봇 성향
import { Button, Screen } from '@gamehub/ui'
import { useState } from 'react'
import type { ProfileName } from '../engine/bot'
import { COLORS, NAMES, PROFILES, store } from './seats'
import { Segmented } from './Segmented'

export interface WatchConfig {
  n: number
  profiles: ProfileName[]
}

const COUNTS = [
  [2, '2인'],
  [3, '3인'],
  [4, '4인'],
] as const

export function BackLink({ onClick }: { onClick(): void }) {
  return (
    <button type="button" className="inline-flex min-h-11 min-w-11 items-center text-sm text-muted" onClick={onClick}>
      ‹ 처음으로
    </button>
  )
}

export function WatchSetup({ onStart, onBack }: { onStart(c: WatchConfig): void; onBack(): void }) {
  const [cfg, setCfg] = useState<WatchConfig>(() => store.get('watch', { n: 4, profiles: ['balanced', 'greedy', 'spiteful', 'balanced'] }))
  const setProfile = (i: number, p: ProfileName) => setCfg((c) => ({ ...c, profiles: c.profiles.map((x, k) => (k === i ? p : x)) }))

  return (
    <Screen
      footer={
        <Button
          tone="primary"
          onClick={() => {
            store.set('watch', cfg)
            onStart({ n: cfg.n, profiles: cfg.profiles.slice(0, cfg.n) })
          }}
        >
          관전 시작
        </Button>
      }
    >
      <BackLink onClick={onBack} />
      <h1 className="mt-1 mb-4 text-2xl font-extrabold">봇 대전 관전</h1>
      <p className="mb-1 text-sm text-muted">인원</p>
      <Segmented label="인원" options={COUNTS} value={cfg.n as 2 | 3 | 4} onChange={(n) => setCfg((c) => ({ ...c, n }))} />
      <p className="mt-4 mb-1 text-sm text-muted">봇 성향 (차례 순서)</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {Array.from({ length: cfg.n }, (_, i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl bg-surface p-2 pl-3">
            <span className="size-3.5 shrink-0 rounded-full" style={{ background: COLORS[i] }} />
            <span className="w-10 shrink-0">{NAMES[i]}</span>
            <div className="flex-1">
              <Segmented label={`${NAMES[i]} 성향`} options={PROFILES} value={cfg.profiles[i] ?? 'balanced'} onChange={(p) => setProfile(i, p)} />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        <b className="text-text">균형</b> 자기 길과 견제를 함께 · <b className="text-text">독주</b> 자기 길만 · <b className="text-text">방해</b> 앞선 상대
        가리기에 집중
      </p>
    </Screen>
  )
}
