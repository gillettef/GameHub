// 화면 전환: 처음 → 한 기기(봇 대전·돌려 하기·봇끼리 관전) / 온라인(대기실 → 대국, 관전) / 자동 시뮬레이션
// 바로 시작 링크: ?play=3|4|5 (나 vs 봇), ?room=ABCD (온라인 방 초대)
// 한 기기 판은 행동 기록을 저장해 두고, 새로고침하면 이어서 둔다.
import type { SeatInfo } from '@gamehub/net'
import { LocalGame, invitedCode, useLocalGame, useRoom, type LocalSave } from '@gamehub/net/client'
import { Button, HomeScreen, Screen, Sheet, WaitingRoom } from '@gamehub/ui'
import { useState } from 'react'
import { def, parseOptions, type Action, type Options, type SeatView, type Table as TableState } from '../def'
import type { BotLevel } from '../engine/types'
import { COLORS } from '../text'
import { RulesText, TileList } from './RulesText'
import { Segmented } from './Segmented'
import { SimScreen } from './SimScreen'
import { store } from './store'
import { Table } from './Table'

type Local = LocalGame<TableState, Action, SeatView, Options>
type Route = { name: 'home' } | { name: 'sim' } | { name: 'local'; key: number; seats: SeatInfo[]; options: Options; game: Local }

interface Settings {
  level: BotLevel
  /** 한 기기 봇 진행 속도 배수(옛 화면: 느리게 1500ms · 보통 900ms · 빠르게 300ms) */
  speed: number
}

const TITLE = 'PROXYMIND'
const SAVE = 'local'
const BOT_NAMES = ['봇 알파', '봇 브라보', '봇 찰리', '봇 델타', '봇 에코']
const LEVELS = [
  ['normal', '보통'],
  ['easy', '쉬움'],
] as const
const SPEEDS = [
  [0.6, '느리게'],
  [1, '보통'],
  [3, '빠르게'],
] as const

const loadSettings = (): Settings => {
  const s = store.get<Partial<Settings>>('settings', {})
  return { level: s.level === 'easy' ? 'easy' : 'normal', speed: SPEEDS.some(([v]) => v === s.speed) ? s.speed! : 1 }
}

/** 봇 자리에 이름을 붙인다(옛 온라인 방의 봇 이름) */
function withBotNames(seats: SeatInfo[]): SeatInfo[] {
  return seats.map((s, i) => (s.kind === 'bot' ? { ...s, name: BOT_NAMES[i] ?? `봇 ${i + 1}` } : s))
}

function myName(): string {
  // 처음 화면(HomeScreen)이 닉네임을 proxymind:name 에 글자 그대로 저장한다
  try {
    return localStorage.getItem('proxymind:name')?.trim() || '나'
  } catch {
    return '나'
  }
}

function botSeats(n: number, watch = false): SeatInfo[] {
  return withBotNames(Array.from({ length: n }, (_, i): SeatInfo => (i === 0 && !watch ? { kind: 'human', name: myName() } : { kind: 'bot', name: '' })))
}

let localKey = 0
function localRoute(seats: SeatInfo[], options: Options, save?: LocalSave<Action>): Extract<Route, { name: 'local' }> {
  const game: Local = new LocalGame(def, {
    seats,
    options,
    ...(save ? { seed: save.seed, history: save.history } : {}),
    onSave: (s) => store.set(SAVE, s),
  })
  game.setSpeed(loadSettings().speed)
  return { name: 'local', key: ++localKey, seats, options, game }
}

/** 저장한 한 기기 판(끝나지 않은 것)을 되살린다. 형식이 틀리거나 지금 규칙으로 둘 수 없으면 버린다 */
function restoreLocal(): Route | null {
  const save = store.get<LocalSave<Action> | null>(SAVE, null)
  if (!save || !Array.isArray(save.seats) || !Array.isArray(save.history) || typeof save.seed !== 'number') return null
  try {
    const route = localRoute(save.seats, parseOptions(save.options), save)
    if (route.game.getState().room.status === 'over') throw new Error('끝난 판')
    return route
  } catch {
    store.set(SAVE, null)
    return null
  }
}

function initialRoute(): Route {
  const q = new URLSearchParams(location.search)
  if (q.has('play')) {
    const n = Number(q.get('play'))
    return localRoute(botSeats(n === 3 || n === 5 ? n : 4), { level: loadSettings().level })
  }
  if (!q.has('room')) return restoreLocal() ?? { name: 'home' }
  return { name: 'home' }
}

export function App() {
  const [online, client] = useRoom<SeatView, Action>({ slug: def.slug })
  const [route, setRoute] = useState<Route>(initialRoute)
  const [invited, setInvited] = useState(() => invitedCode(location.search))
  const [rules, setRules] = useState(false)
  const [settings, setSettingsRaw] = useState(loadSettings)
  const setSettings = (s: Settings) => {
    store.set('settings', s)
    setSettingsRaw(s)
  }

  const home = () => {
    store.set(SAVE, null)
    setInvited(null)
    history.replaceState(null, '', location.pathname)
    setRoute({ name: 'home' })
  }
  const leaveOnline = () => {
    client.leave()
    home()
  }
  const startLocal = (seats: SeatInfo[]) => setRoute(localRoute(withBotNames(seats), { level: settings.level }))
  const goOnline = (fn: () => void) => {
    store.set(SAVE, null)
    fn()
  }

  const room = online.room
  if (room?.status === 'lobby') {
    return (
      <WaitingRoom
        title={TITLE}
        room={room}
        bots
        error={online.error}
        onSeat={(i, kind) => client.setSeat(i, kind)}
        onStart={() => client.start()}
        onLeave={leaveOnline}
      />
    )
  }
  if (room?.view) {
    return (
      <Table
        key={`online-${room.code}`}
        room={room}
        error={online.connection === 'reconnecting' ? '다시 접속하는 중입니다…' : online.error}
        onAct={(a) => client.act(a)}
        onLeave={leaveOnline}
      />
    )
  }
  if (route.name === 'local') {
    return <LocalTable key={route.key} game={route.game} again={() => setRoute(localRoute(route.seats, route.options))} onLeave={home} />
  }
  if (route.name === 'sim') return <SimScreen onBack={() => setRoute({ name: 'home' })} />

  return (
    <>
      <HomeScreen
        slug={def.slug}
        title={TITLE}
        hero={<Hero />}
        minSeats={def.minSeats}
        maxSeats={def.maxSeats}
        bots
        invited={invited}
        error={online.error}
        connecting={online.connection !== 'idle'}
        setup={<SettingsPanel value={settings} onChange={setSettings} />}
        onLocal={startLocal}
        onCreate={(name, seats, bots) => goOnline(() => client.create(name, seats, bots, { level: settings.level }))}
        onJoin={(code, name) => goOnline(() => client.join(code, name))}
        onWatch={(code) => client.watch(code)}
      >
        <div className="grid grid-cols-3 gap-2">
          {[3, 4, 5].map((n) => (
            <Button key={n} onClick={() => setRoute(localRoute(botSeats(n), { level: settings.level }))}>
              봇과 {n}인
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setRoute(localRoute(botSeats(4, true), { level: settings.level }))}>봇끼리 관전</Button>
          <Button onClick={() => setRoute({ name: 'sim' })}>자동 시뮬레이션</Button>
        </div>
        <Button tone="ghost" onClick={() => setRules(true)}>
          규칙 요약
        </Button>
        <p className="text-center text-sm text-muted">룰북 초안 v0.3.1 · 3~5인 · 8라운드 · 판정은 규칙 엔진이 자동으로 합니다</p>
      </HomeScreen>
      <Sheet open={rules} title="규칙 요약" onClose={() => setRules(false)}>
        <RulesText />
        <h3 className="mt-5 mb-2 text-sm text-muted">규칙 타일 20종 (45개)</h3>
        <TileList />
      </Sheet>
    </>
  )
}

function SettingsPanel({ value, onChange }: { value: Settings; onChange(s: Settings): void }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="mb-1 block text-sm text-muted">봇 실력</span>
        <Segmented label="봇 실력" options={LEVELS} value={value.level} onChange={(level) => onChange({ ...value, level })} />
      </div>
      <div>
        <span className="mb-1 block text-sm text-muted">봇 진행 속도 (한 기기)</span>
        <Segmented label="봇 진행 속도" options={SPEEDS} value={value.speed} onChange={(speed) => onChange({ ...value, speed })} />
      </div>
      <p className="m-0 text-xs text-muted">자리 순서가 곧 시계 방향입니다. 각자 다음 자리 플레이어가 내 로봇의 설계자입니다.</p>
    </div>
  )
}

function Hero() {
  return (
    <div className="mt-1 mb-1">
      <p className="m-0 text-xs font-bold tracking-[0.18em] text-primary">로봇 아레나 · 3~5인</p>
      <h1 className="m-0 text-4xl leading-tight font-black tracking-tight">
        PROXY<span className="text-primary">MIND</span>
      </h1>
      <p className="mt-1 mb-1 text-base">네 로봇의 두뇌는 내가 짰다. 행운을 빈다.</p>
      <p className="m-0 text-sm text-muted">
        내 로봇은 <b className="text-text">왼쪽 플레이어가 꽂아 준 규칙</b>대로만 움직입니다. 나는 오른쪽 플레이어의 로봇에 함정을 꽂습니다.
      </p>
    </div>
  )
}

/**
 * 한 기기 대국. 사람이 둘 이상이면(돌려 하기) 설계 단계에서 다음 사람에게 넘길 때 화면을 가린다:
 * 뽑은 타일과 놓은 배치는 사람마다 비밀이므로, 넘겨받은 사람이 누르기 전에는 보여 주지 않는다.
 * 실행 단계는 모두 공개 정보라 가리지 않고, 그때 기기를 든 사람을 기억해 둔다.
 */
function LocalTable({ game, again, onLeave }: { game: Local; again(): void; onLeave(): void }) {
  const state = useLocalGame(game)
  const room = state.room
  const humans = room.seats.filter((s) => s.kind === 'human').length
  const [shownFor, setShownFor] = useState<number | null>(() => (humans > 1 && room.view?.phase === 'design' ? null : room.you))
  const v = room.view!
  if (humans > 1 && v.phase !== 'design' && room.you !== null && room.you !== shownFor) setShownFor(room.you)
  const cover = humans > 1 && room.status !== 'over' && v.phase === 'design' && room.you !== null && room.you !== shownFor

  if (cover) {
    const you = room.you!
    return (
      <Screen
        footer={
          <>
            <Button tone="primary" onClick={() => setShownFor(you)}>
              {room.seats[you]!.name}입니다 · 보기
            </Button>
            <Button tone="ghost" onClick={onLeave}>
              그만두기
            </Button>
          </>
        }
      >
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <p className="m-0 text-sm font-bold tracking-[0.3em] text-muted">기기를 넘겨 주세요</p>
          <p className="m-0 text-3xl font-extrabold">
            <span className="mr-2 inline-block size-4 rounded-full align-middle" style={{ background: COLORS[you] }} />
            {room.seats[you]!.name}
          </p>
          <p className="m-0 text-muted">{v.round}라운드 설계 차례</p>
          <p className="m-0 max-w-[30ch] text-sm text-muted">다른 사람은 화면을 보지 마세요. 뽑은 타일과 놓은 배치는 공개 전까지 비밀입니다.</p>
        </div>
      </Screen>
    )
  }
  return <Table room={room} error={state.error} onAct={(a) => game.act(a)} onLeave={onLeave} local={{ again }} />
}
