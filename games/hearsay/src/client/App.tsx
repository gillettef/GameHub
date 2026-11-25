// 화면 전환: 처음 → 한 기기(봇 대전·돌려 하기, 브라우저 안 진행) / 온라인(대기실 → 대국, 서버 시계, 관전)
// 바로 시작 링크: ?play=4|5|6 (나 vs 봇), ?room=ABCD (온라인 방 초대)
// 한 기기 판은 저장하지 않는다: 지난 행동을 남기면 망각된 진실을 되살릴 수 있어서다(기둥 1). 새로고침하면 처음 화면으로 돌아간다.
import type { SeatInfo } from '@gamehub/net'
import { LocalGame, invitedCode, useLocalGame, useRoom } from '@gamehub/net/client'
import { Button, HomeScreen, Screen, Sheet, WaitingRoom } from '@gamehub/ui'
import { useState } from 'react'
import { def, type Action, type Options, type Table as TableState, type View } from '../def'
import { HOUSES, MAX_PLAYERS, MIN_PLAYERS } from '../engine/rules'
import { RulesText } from './RulesText'
import { Table } from './Table'

type Local = LocalGame<TableState, Action, View, Options>
type Route = { name: 'home' } | { name: 'local'; key: number; seats: SeatInfo[]; game: Local }

const TITLE = 'HEARSAY'

function myName(): string {
  try {
    return localStorage.getItem('hearsay:name')?.trim() || '나'
  } catch {
    return '나'
  }
}

const botSeats = (n: number): SeatInfo[] => Array.from({ length: n }, (_, i): SeatInfo => (i === 0 ? { kind: 'human', name: myName() } : { kind: 'bot', name: '' }))

let localKey = 0
function localRoute(seats: SeatInfo[]): Route {
  const humans = seats.filter((s) => s.kind === 'human').length
  const game: Local = new LocalGame(def, { seats, options: { passPlay: humans > 1 } })
  return { name: 'local', key: ++localKey, seats, game }
}

function initialRoute(): Route {
  const play = Number(new URLSearchParams(location.search).get('play'))
  if (Number.isInteger(play) && play >= MIN_PLAYERS && play <= MAX_PLAYERS) return localRoute(botSeats(play))
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
  if (room?.view) {
    return (
      <Table
        key={`online-${room.code}`}
        room={room}
        error={online.connection === 'reconnecting' ? '다시 접속하는 중입니다… (시간은 서버에서 계속 흐릅니다)' : online.error}
        onAct={(a) => client.act(a)}
        onLeave={leaveOnline}
      />
    )
  }
  if (route.name === 'local') {
    return <LocalTable key={route.key} game={route.game} again={() => setRoute(localRoute(route.seats))} onLeave={home} />
  }

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
        onLocal={(seats) => setRoute(localRoute(seats))}
        onCreate={(name, seats, bots) => client.create(name, seats, bots)}
        onJoin={(code, name) => client.join(code, name)}
        onWatch={(code) => client.watch(code)}
      >
        <div className="grid grid-cols-3 gap-2">
          {[4, 5, 6].map((n) => (
            <Button key={n} onClick={() => setRoute(localRoute(botSeats(n)))}>
              봇과 {n}인
            </Button>
          ))}
        </div>
        <Button onClick={() => setRules(true)}>규칙 요약</Button>
        <p className="text-center text-sm text-muted">
          룰북 v0.5 · 4~6인 · 7계절과 마지막 회의 · 봇은 기억이 흐려지는 이야기꾼(기록형·정치형·조작형·휩쓸림형)입니다
        </p>
      </HomeScreen>
      <Sheet open={rules} title="규칙 요약 (룰북 v0.5)" onClose={() => setRules(false)}>
        <RulesText />
      </Sheet>
    </>
  )
}

function Hero() {
  return (
    <div className="mt-1 mb-1">
      <h1 className="m-0 text-3xl font-extrabold tracking-[0.18em]">
        HEARSAY <small className="text-base font-semibold tracking-normal text-muted">히어세이</small>
      </h1>
      <p className="mt-2 mb-0 leading-relaxed text-muted">
        이 섬마을에는 글자가 없다. 지난 일은 오직 서로의 입으로만 전해진다. 그리고 <b className="text-text">누구도 자기 집안의 일을 스스로 증언할 수 없다.</b>
      </p>
    </div>
  )
}

/**
 * 한 기기 대국. 사람이 둘 이상이면(돌려 하기) 다음 사람에게 넘길 때 화면을 가린다:
 * 고른 구역 카드와 쥔 증언 토큰은 사람마다 비밀이므로, 넘겨받은 사람이 누르기 전에는 보여 주지 않는다.
 */
function LocalTable({ game, again, onLeave }: { game: Local; again(): void; onLeave(): void }) {
  const state = useLocalGame(game)
  const room = state.room
  const humans = room.seats.filter((s) => s.kind === 'human').length
  const [shownFor, setShownFor] = useState<number | null>(() => (humans > 1 ? null : room.you))
  const cover = humans > 1 && room.status !== 'over' && room.you !== null && room.you !== shownFor

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
          <p className="m-0 text-3xl font-extrabold">{room.seats[you]!.name}</p>
          <p className="m-0 text-muted">
            <span className="mr-1.5 inline-block size-3 rounded-full align-middle" style={{ background: `var(--hs-${HOUSES[you]!.id})` }} />
            {HOUSES[you]!.name} 집안 차례
          </p>
          <p className="m-0 max-w-[30ch] text-sm text-muted">다른 사람은 화면을 보지 마세요. 고른 구역 카드와 쥔 증언 토큰은 사람마다 비밀입니다. 시간은 계속 흐릅니다.</p>
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
      local={{ paused: state.paused, setPaused: (p) => game.setPaused(p), again }}
    />
  )
}
