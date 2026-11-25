// 화면 전환: 처음 → 한 기기 / 온라인(대기실 → 대국) / 봇 대전 관전 / 밸런스 시뮬레이션
// 바로 시작 링크: ?play=3 (나 vs 봇 3인), ?watch=4 (봇 4인 관전), ?room=ABCD (온라인 방 초대)
import type { SeatInfo } from '@gamehub/net'
import { LocalGame, invitedCode, useLocalGame, useRoom } from '@gamehub/net/client'
import { Button, HomeScreen, Sheet, WaitingRoom } from '@gamehub/ui'
import { useState } from 'react'
import { def, type Action, type Options, type Table as TableState } from '../def'
import type { View } from '../engine/engine'
import { RulesText } from './RulesText'
import { NAMES, PROFILE_LABEL } from './seats'
import { SimScreen } from './SimScreen'
import { Table } from './Table'
import { WatchSetup, type WatchConfig } from './WatchSetup'

type Local = LocalGame<TableState, Action, View, Options>
type LocalSetup = { seats: SeatInfo[]; options: Options }
type Route = { name: 'home' } | { name: 'watch' } | { name: 'sim' } | { name: 'local'; key: number; setup: LocalSetup; game: Local }

const TITLE = 'CREASE'
const clampCount = (v: string | null) => Math.min(4, Math.max(2, Number(v) || 2))

function playSetup(n: number): LocalSetup {
  return {
    seats: Array.from({ length: n }, (_, i): SeatInfo => (i === 0 ? { kind: 'human', name: '나' } : { kind: 'bot', name: `${NAMES[i]} 봇` })),
    options: { profiles: [] },
  }
}

function watchSetup({ n, profiles }: WatchConfig): LocalSetup {
  return {
    seats: Array.from({ length: n }, (_, i): SeatInfo => ({ kind: 'bot', name: `${NAMES[i]}·${PROFILE_LABEL[profiles[i] ?? 'balanced']}` })),
    options: { profiles },
  }
}

let localKey = 0
const localRoute = (setup: LocalSetup): Route => ({ name: 'local', key: ++localKey, setup, game: new LocalGame(def, setup) })

function initialRoute(): Route {
  const q = new URLSearchParams(location.search)
  if (q.has('play')) return localRoute(playSetup(clampCount(q.get('play'))))
  if (q.has('watch')) {
    const n = clampCount(q.get('watch'))
    return localRoute(watchSetup({ n, profiles: Array.from({ length: n }, () => 'balanced') }))
  }
  return { name: 'home' }
}

export function App() {
  const [online, client] = useRoom<View, Action>({ slug: def.slug })
  const [route, setRoute] = useState<Route>(initialRoute)
  const [invited, setInvited] = useState(() => invitedCode(location.search))
  const [rules, setRules] = useState(false)

  const home = () => {
    setInvited(null)
    history.replaceState(null, '', location.pathname)
    setRoute({ name: 'home' })
  }
  const leaveOnline = () => {
    client.leave()
    home()
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
  if (room) {
    return (
      <Table
        room={room}
        error={online.connection === 'reconnecting' ? '다시 접속하는 중입니다…' : online.error}
        onAct={(a) => client.act(a)}
        onLeave={leaveOnline}
      />
    )
  }
  if (route.name === 'local') {
    return <LocalTable key={route.key} game={route.game} again={() => setRoute(localRoute(route.setup))} onLeave={home} />
  }
  if (route.name === 'watch') return <WatchSetup onBack={home} onStart={(c) => setRoute(localRoute(watchSetup(c)))} />
  if (route.name === 'sim') return <SimScreen onBack={home} />

  return (
    <>
      <HomeScreen
        slug={def.slug}
        title={TITLE}
        tagline="지도를 접어 먼 칸을 잇는 길잡이들의 경주"
        minSeats={def.minSeats}
        maxSeats={def.maxSeats}
        bots
        invited={invited}
        error={online.error}
        connecting={online.connection !== 'idle'}
        onLocal={(seats) => setRoute(localRoute({ seats, options: { profiles: [] } }))}
        onCreate={(name, seats, bots) => client.create(name, seats, bots)}
        onJoin={(code, name) => client.join(code, name)}
        onWatch={(code) => client.watch(code)}
      >
        <Button onClick={() => setRoute({ name: 'watch' })}>봇 대전 관전</Button>
        <Button onClick={() => setRoute({ name: 'sim' })}>밸런스 시뮬레이션</Button>
        <Button onClick={() => setRules(true)}>규칙 한눈에</Button>
        <p className="text-center text-sm text-muted">룰북 v1.3 기준 · 2~4인</p>
      </HomeScreen>
      <Sheet open={rules} title="규칙 한눈에" onClose={() => setRules(false)}>
        <RulesText />
      </Sheet>
    </>
  )
}

function LocalTable({ game, again, onLeave }: { game: Local; again(): void; onLeave(): void }) {
  const state = useLocalGame(game)
  const [speed, setSpeed] = useState(1)
  return (
    <Table
      room={state.room}
      error={state.error}
      onAct={(a) => game.act(a)}
      onLeave={onLeave}
      local={{
        paused: state.paused,
        speed,
        setPaused: (p) => game.setPaused(p),
        setSpeed: (s) => {
          setSpeed(s)
          game.setSpeed(s)
        },
        again,
      }}
    />
  )
}
