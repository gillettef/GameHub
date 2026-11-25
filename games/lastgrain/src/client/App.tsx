// 화면 전환: 처음(봇 대전·온라인 설정) → 봇 대전(브라우저 안 진행) / 온라인(대기실 → 대국, 서버 시계)
import type { SeatInfo } from '@gamehub/net'
import { LocalGame, invitedCode, useLocalGame, useRoom } from '@gamehub/net/client'
import { HomeScreen, WaitingRoom } from '@gamehub/ui'
import { useEffect, useState } from 'react'
import { def, type Act, type Options, type Table as TableState, type View } from '../def'
import { LEVELS, type Level } from '../engine/bot'
import { Table } from './Table'

type Local = LocalGame<TableState, Act, View, Options>

export interface Settings {
  greatMin: Options['greatMin']
  target: Options['target']
  handleMs: Options['handleMs']
  level: Level
  /** 봇이 행동 하나에 쓰는 시간 */
  botDelay: 800 | 1500 | 2500
  showSec: boolean
}

const KEY = 'lastgrain:settings'
const DEFAULT_SETTINGS: Settings = { greatMin: 20, target: 25, handleMs: 1000, level: 'normal', botDelay: 1500, showSec: true }

function loadSettings(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Settings> | null
    const o = def.parseOptions!(v)
    const botDelay = [800, 1500, 2500].includes(v?.botDelay as number) ? (v!.botDelay as Settings['botDelay']) : 1500
    return { greatMin: o.greatMin, target: o.target, handleMs: o.handleMs, level: o.level, botDelay, showSec: v?.showSec !== false }
  } catch {
    return DEFAULT_SETTINGS
  }
}

const options = (s: Settings, countdown: Options['countdown']): Options => ({ greatMin: s.greatMin, target: s.target, handleMs: s.handleMs, level: s.level, countdown })

function Select<T extends string | number>({ label, value, options: opts, onChange }: { label: string; value: T; options: [T, string][]; onChange(v: T): void }) {
  return (
    <label className="flex items-center justify-between gap-3 border-b border-line py-1">
      <span className="text-sm text-muted">{label}</span>
      <select
        className="min-h-11 rounded-lg border border-line bg-surface px-2"
        value={String(value)}
        onChange={(e) => onChange(opts.find(([v]) => String(v) === e.target.value)![0])}
      >
        {opts.map(([v, text]) => (
          <option key={String(v)} value={String(v)}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )
}

function SettingsPanel({ value, onChange }: { value: Settings; onChange(s: Settings): void }) {
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => onChange({ ...value, [k]: v })
  return (
    <div className="flex flex-col">
      <Select label="대모래시계" value={value.greatMin} options={[[20, '20분 (정식)'], [10, '10분'], [5, '5분']]} onChange={set('greatMin')} />
      <Select label="목표 점수" value={value.target} options={[[25, '25점 (정식)'], [15, '15점'], [10, '10점']]} onChange={set('target')} />
      <Select label="조작 시간" value={value.handleMs} options={[[1000, '모래시계당 1초 (정식)'], [0, '끔']]} onChange={set('handleMs')} />
      <Select label="봇 난이도" value={value.level} options={(Object.keys(LEVELS) as Level[]).map((l) => [l, LEVELS[l].name])} onChange={set('level')} />
      <Select label="봇 생각 시간" value={value.botDelay} options={[[2500, '느림 · 2.5초'], [1500, '보통 · 1.5초'], [800, '빠름 · 0.8초']]} onChange={set('botDelay')} />
      <div className="flex items-center justify-between gap-3 py-1">
        <span className="text-sm text-muted">남은 모래를 초로 표시</span>
        <button
          type="button"
          role="switch"
          aria-checked={value.showSec}
          aria-label="남은 모래를 초로 표시"
          className={`min-h-11 min-w-20 rounded-lg px-3 text-sm font-bold ${value.showSec ? 'bg-primary text-on-primary' : 'bg-raised text-muted'}`}
          onClick={() => set('showSec')(!value.showSec)}
        >
          {value.showSec ? '켜짐' : '꺼짐'}
        </button>
      </div>
    </div>
  )
}

let runKey = 0

export function App() {
  const [online, client] = useRoom<View, Act>({ slug: def.slug })
  const [settings, setSettingsRaw] = useState<Settings>(loadSettings)
  const [local, setLocal] = useState<{ key: number; seats: SeatInfo[]; game: Local } | null>(null)
  const [invited, setInvited] = useState(() => invitedCode(location.search))
  const setSettings = (s: Settings) => {
    setSettingsRaw(s)
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      // 저장할 수 없으면 이번 실행 동안만
    }
  }
  const home = () => {
    setLocal(null)
    setInvited(null)
    history.replaceState(null, '', location.pathname)
  }
  const startLocal = (seats: SeatInfo[]) => setLocal({ key: ++runKey, seats, game: new LocalGame(def, { seats, options: options(settings, 0) }) })

  const room = online.room
  if (room?.status === 'lobby') {
    return (
      <WaitingRoom
        title="LASTGRAIN"
        room={room}
        bots
        error={online.error}
        onSeat={(i, kind) => client.setSeat(i, kind)}
        onStart={() => client.start()}
        onLeave={() => {
          client.leave()
          home()
        }}
      />
    )
  }
  if (room) {
    return (
      <Table
        room={room}
        error={online.connection === 'reconnecting' ? '다시 접속하는 중입니다… (모래는 서버에서 계속 흐른다)' : online.error}
        onAct={(a) => client.act(a)}
        onLeave={() => {
          client.leave()
          home()
        }}
        showSec={settings.showSec}
      />
    )
  }
  if (local) {
    return <LocalTable key={local.key} game={local.game} botDelay={settings.botDelay} showSec={settings.showSec} again={() => startLocal(local.seats)} onLeave={home} />
  }
  return (
    <HomeScreen
      slug={def.slug}
      title="LASTGRAIN"
      tagline="모래가 다 떨어지기 전에 유적을 차지하라. 고민하는 동안에도 내 모래가 흐른다."
      minSeats={def.minSeats}
      maxSeats={def.maxSeats}
      bots
      invited={invited}
      error={online.error}
      connecting={online.connection !== 'idle'}
      setup={<SettingsPanel value={settings} onChange={setSettings} />}
      onLocal={startLocal}
      onCreate={(name, seats, bots) => client.create(name, seats, bots, options(settings, 3000))}
      onJoin={(code, name) => client.join(code, name)}
      onWatch={(code) => client.watch(code)}
    >
      <p className="text-center text-sm text-muted">
        1번 자리가 선(파랑), 2번 자리가 후(빨강, +2점)다.{' '}
        <a className="inline-flex min-h-11 items-center text-primary" href="rules.html" target="_blank" rel="noopener">
          규칙서 보기 ›
        </a>
      </p>
    </HomeScreen>
  )
}

function LocalTable({ game, botDelay, showSec, again, onLeave }: { game: Local; botDelay: number; showSec: boolean; again(): void; onLeave(): void }) {
  const state = useLocalGame(game)
  useEffect(() => game.setSpeed(def.bot!.delayMs / botDelay), [game, botDelay])
  return (
    <Table
      room={state.room}
      error={state.error}
      onAct={(a) => game.act(a)}
      onLeave={onLeave}
      showSec={showSec}
      local={{ paused: state.paused, setPaused: (p) => game.setPaused(p), again }}
    />
  )
}
