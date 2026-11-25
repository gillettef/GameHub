// 화면 전환: 처음 → 한 기기(봇 대전·돌려 하기) / 온라인(대기실 → 대국, 관전)
// 바로 시작 링크: ?play=4 (나 vs 봇 3), ?play=3 (나 vs 봇 2), ?room=ABCD (온라인 방 초대)
// 한 기기 판은 행동 기록을 저장해 두고, 새로고침하면 이어서 둔다(옛 봇 대전이 서버 방이라 새로고침해도 돌아오던 것과 같게).
import type { SeatInfo } from '@gamehub/net'
import { LocalGame, invitedCode, useLocalGame, useRoom, type LocalSave } from '@gamehub/net/client'
import { Button, HomeScreen, Screen, Sheet, WaitingRoom } from '@gamehub/ui'
import { useState } from 'react'
import { SEAT_ORDER, def, type Action, type SeatView, type Table as TableState } from '../def'
import { Rulebook, RulesText } from './RulesText'
import { BOT_NAME, colorOf, crestName, seatLabel, store } from './seats'
import { Table } from './Table'

type Local = LocalGame<TableState, Action, SeatView, unknown>
type Route = { name: 'home' } | { name: 'local'; key: number; seats: SeatInfo[]; game: Local }

const TITLE = 'SIGHTLINE'
const SAVE = 'local'

/** 봇 자리에 좌석 문양 이름을 붙인다(1번 자리 = 남쪽, 시계 방향) */
function withBotNames(seats: SeatInfo[]): SeatInfo[] {
  const order = SEAT_ORDER[seats.length as 3 | 4]
  return seats.map((s, i) => (s.kind === 'bot' && order ? { ...s, name: BOT_NAME[order[i]!] } : s))
}

function botSeats(n: number): SeatInfo[] {
  // 처음 화면(HomeScreen)이 닉네임을 sightline:name 에 글자 그대로 저장한다
  let name = ''
  try {
    name = localStorage.getItem('sightline:name')?.trim() ?? ''
  } catch {
    /* 사생활 보호 모드 */
  }
  name ||= '나'
  return withBotNames(Array.from({ length: n }, (_, i): SeatInfo => (i === 0 ? { kind: 'human', name } : { kind: 'bot', name: '' })))
}

let localKey = 0
function localRoute(seats: SeatInfo[], save?: LocalSave<Action>): Route {
  const game: Local = new LocalGame(def, {
    seats,
    ...(save ? { seed: save.seed, history: save.history } : {}),
    onSave: (s) => store.set(SAVE, s),
  })
  return { name: 'local', key: ++localKey, seats, game }
}

/** 저장한 한 기기 판(끝나지 않은 것)을 되살린다. 형식이 틀리거나 지금 규칙으로 둘 수 없으면 버린다 */
function restoreLocal(): Route | null {
  const save = store.get<LocalSave<Action> | null>(SAVE, null)
  if (!save || !Array.isArray(save.seats) || !Array.isArray(save.history) || typeof save.seed !== 'number') return null
  try {
    const route = localRoute(save.seats, save) as Extract<Route, { name: 'local' }>
    if (route.game.getState().room.status === 'over') throw new Error('끝난 판')
    return route
  } catch {
    store.set(SAVE, null)
    return null
  }
}

function initialRoute(): Route {
  const q = new URLSearchParams(location.search)
  if (q.has('play')) return localRoute(botSeats(q.get('play') === '3' ? 3 : 4))
  if (!q.has('room')) return restoreLocal() ?? { name: 'home' }
  return { name: 'home' }
}

export function App() {
  const [online, client] = useRoom<SeatView, Action>({ slug: def.slug })
  const [route, setRoute] = useState<Route>(initialRoute)
  const [invited, setInvited] = useState(() => invitedCode(location.search))
  const [rules, setRules] = useState<'summary' | 'full' | null>(null)

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
  const startLocal = (seats: SeatInfo[]) => setRoute(localRoute(withBotNames(seats)))
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
        onLocal={startLocal}
        onCreate={(name, seats, bots) => goOnline(() => client.create(name, seats, bots))}
        onJoin={(code, name) => goOnline(() => client.join(code, name))}
        onWatch={(code) => client.watch(code)}
      >
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setRoute(localRoute(botSeats(4)))}>봇과 바로 4인</Button>
          <Button onClick={() => setRoute(localRoute(botSeats(3)))}>봇과 바로 3인</Button>
        </div>
        <Button onClick={() => setRules('summary')}>규칙 한눈에</Button>
        <Button tone="ghost" onClick={() => setRules('full')}>
          전체 룰북
        </Button>
        <p className="text-center text-sm text-muted">룰북 v2.3 기준 · 3~4인 · 8라운드 · 봇도 자기 좌석에서 보이는 것만 보고 판단합니다</p>
      </HomeScreen>
      <Sheet open={rules !== null} title={rules === 'full' ? '룰북' : '규칙 한눈에'} onClose={() => setRules(null)}>
        {rules === 'full' ? <Rulebook /> : <RulesText />}
      </Sheet>
    </>
  )
}

function Hero() {
  return (
    <div className="mt-1 mb-1">
      <h1 className="m-0 text-3xl font-extrabold tracking-[0.08em]">
        <span className="text-primary">◉</span> SIGHTLINE <small className="text-base font-semibold text-muted">사이트라인</small>
      </h1>
      <p className="mt-1 mb-0 text-muted">
        앉은 자리가 곧 <b className="text-primary">시야</b>다. 가면은 한쪽 면에만 있어서, 가면이 향한 좌석에 앉은 사람만 그 정체를 본다. 누구나 아무
        손님이나 움직이지만, <b className="text-text">내 손으로는 가면을 나에게 드러낼 수 없다.</b>
      </p>
    </div>
  )
}

/**
 * 한 기기 대국. 사람이 둘 이상이면(돌려 하기) 다음 사람에게 넘길 때 화면을 가린다:
 * 명단과 기억이 사람마다 다르므로, 넘겨받은 사람이 누르기 전에는 보드를 보여 주지 않는다.
 */
function LocalTable({ game, again, onLeave }: { game: Local; again(): void; onLeave(): void }) {
  const state = useLocalGame(game)
  const room = state.room
  const humans = room.seats.filter((s) => s.kind === 'human').length
  const [shownFor, setShownFor] = useState<number | null>(() => (humans > 1 ? null : room.you))
  const v = room.view!
  const cover = humans > 1 && room.status !== 'over' && room.you !== null && room.you !== shownFor

  if (cover) {
    const seat = v.seats[room.you!]!
    return (
      <Screen
        footer={
          <>
            <Button tone="primary" onClick={() => setShownFor(room.you)}>
              {room.seats[room.you!]!.name}입니다 · 보기
            </Button>
            <Button tone="ghost" onClick={onLeave}>
              그만두기
            </Button>
          </>
        }
      >
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <p className="m-0 text-sm font-bold tracking-[0.3em] text-muted">기기를 넘겨 주세요</p>
          <p className="m-0 text-3xl font-extrabold">{room.seats[room.you!]!.name}</p>
          <p className="m-0 text-muted">
            <span className="mr-1.5 inline-block size-3 rounded-full align-middle" style={{ background: colorOf(seat) }} />
            {seatLabel(seat)} · {crestName(seat)} 후원자 차례
          </p>
          <p className="m-0 max-w-[30ch] text-sm text-muted">다른 사람은 화면을 보지 마세요. 명단과 본 문양은 사람마다 다릅니다.</p>
        </div>
      </Screen>
    )
  }
  return <Table room={room} error={state.error} onAct={(a) => game.act(a)} onLeave={onLeave} local={{ again }} />
}
