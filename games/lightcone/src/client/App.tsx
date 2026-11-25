// 화면 전환: 처음 → 한 기기(나 vs 봇, 두 사람이 번갈아, 봇끼리 관전) / 온라인(대기실 → 대국, 관전)
// 바로 시작 링크: ?play=bot (나 vs 봇), ?room=ABCD (온라인 방 초대)
import type { SeatInfo } from '@gamehub/net'
import { LocalGame, invitedCode, useLocalGame, useRoom, type LocalSave } from '@gamehub/net/client'
import { Button, HomeScreen, Screen, Sheet, WaitingRoom } from '@gamehub/ui'
import { useMemo, useState } from 'react'
import { def, pidOf, type Action, type Table as TableState, type View } from '../def'
import { realPos } from '../engine/engine'
import type { Pid } from '../engine/map'
import { Table } from './Table'
import { RulesText } from './text'

type Local = LocalGame<TableState, Action, View, unknown>
type Route = { name: 'home' } | { name: 'local'; key: number; seats: SeatInfo[]; game: Local }

const TITLE = 'LIGHTCONE'

let localKey = 0
const localRoute = (seats: SeatInfo[]): Route => ({ name: 'local', key: ++localKey, seats, game: new LocalGame(def, { seats }) })

function initialRoute(): Route {
  const q = new URLSearchParams(location.search)
  if (q.get('play') === 'bot')
    return localRoute([
      { kind: 'human', name: '나' },
      { kind: 'bot', name: '봇' },
    ])
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
    return <LocalTable key={route.key} game={route.game} seats={route.seats} again={() => setRoute(localRoute(route.seats))} onLeave={home} />
  }

  return (
    <>
      <HomeScreen
        slug={def.slug}
        title={TITLE}
        hero={
          <div className="mt-1 mb-2 flex items-center gap-3">
            <img src="./icon.svg" alt="" className="size-14 rounded-2xl" />
            <div>
              <h1 className="m-0 text-3xl font-extrabold tracking-[0.12em]">{TITLE}</h1>
              <p className="m-0 text-sm text-muted">상대는 언제나 당신의 과거를 본다</p>
            </div>
          </div>
        }
        minSeats={def.minSeats}
        maxSeats={def.maxSeats}
        bots
        invited={invited}
        error={online.error}
        connecting={online.connection !== 'idle'}
        onLocal={(seats) => setRoute(localRoute(seats))}
        onCreate={(name, seats, bots) => client.create(name, seats, bots)}
        onJoin={(code, name) => client.join(code, name)}
        onWatch={(code) => client.watch(code)}
      >
        <Button onClick={() => setRules(true)}>규칙 한눈에</Button>
        <p className="text-center text-sm text-muted">룰북 v0.7 단순판 · 2인 · 한 기기에서 둘 다 사람이면 번갈아 기기를 넘깁니다</p>
      </HomeScreen>
      <Sheet open={rules} title="규칙 한눈에" onClose={() => setRules(false)}>
        <RulesText />
      </Sheet>
    </>
  )
}

/** 저장한 행동 기록을 다시 두어 전체 상태를 얻는다(한 기기 대전의 '봇 실체 보기'용. 상태가 이미 이 브라우저에 있다) */
function replay(save: LocalSave<Action>): TableState {
  let t = def.setup({ seats: save.seats, seed: save.seed, options: undefined })
  for (const mv of save.history) t = def.apply(t, mv.seat, mv.action, { name: () => '', log: () => {}, byBot: mv.byBot })
  return t
}

function LocalTable({ game, seats, again, onLeave }: { game: Local; seats: SeatInfo[]; again(): void; onLeave(): void }) {
  const state = useLocalGame(game)
  const [speed, setSpeed] = useState(1)
  const [peek, setPeek] = useState(false)
  const room = state.room
  const hasBot = seats.some((s) => s.kind === 'bot')
  const hotSeat = seats.every((s) => s.kind === 'human')
  // 두 사람이 한 기기로 두면 차례가 바뀔 때마다 화면을 가리고 기기를 넘기게 한다
  const [shownTo, setShownTo] = useState<number | null>(null)

  const revealed = useMemo(() => {
    if (!peek || !hasBot) return null
    const t = replay(game.save())
    const reals = (pid: Pid) => t.game.players[pid].fleets.map(realPos)
    return { A: reals('A'), B: reals('B') }
    // room.version 이 바뀔 때마다 다시 계산한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peek, hasBot, game, room.version])

  if (hotSeat && room.status === 'playing' && room.you !== null && room.you !== shownTo) {
    const name = room.seats[room.you]?.name ?? ''
    return (
      <Screen
        footer={
          <>
            <Button tone="primary" onClick={() => setShownTo(room.you)}>
              {name} 화면 보기
            </Button>
            <Button tone="ghost" onClick={onLeave}>
              그만두기
            </Button>
          </>
        }
      >
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <img src="./icon.svg" alt="" className="size-16 rounded-2xl" />
          <h1 className="m-0 text-2xl font-extrabold">{name} 차례</h1>
          <p className="m-0 text-muted">
            기기를 {name}님에게 넘겨 주세요.
            <br />
            상대의 함대 위치와 고른 수는 가려져 있습니다.
          </p>
          <p className="m-0 text-sm text-muted">진영 {pidOf(room.you)}</p>
        </div>
      </Screen>
    )
  }

  return (
    <Table
      room={room}
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
        peek: hasBot ? peek : null,
        setPeek,
        revealed,
      }}
    />
  )
}
