// 화면 전환: 처음 → 한 기기(봇 대전·돌려 하기·봇 관전) / 온라인(대기실 → 대국, 관전)
// 바로 시작 링크: ?play=3|4|5 (나 vs 봇), ?room=ABCD (온라인 방 초대)
// 한 기기 판은 행동 기록을 저장해 두고, 새로고침하면 이어서 둔다.
import type { SeatInfo } from '@gamehub/net'
import { LocalGame, invitedCode, useLocalGame, useRoom, type LocalSave } from '@gamehub/net/client'
import { Button, HomeScreen, Screen, Sheet, WaitingRoom } from '@gamehub/ui'
import { useEffect, useState } from 'react'
import { def, type Action, type SeatView, type Table as TableState } from '../def'
import { BOT_NAMES, SPEEDS, store } from './cards'
import { Rulebook, RulesText } from './RulesText'
import { Table } from './Table'

type Local = LocalGame<TableState, Action, SeatView, unknown>
type Route = { name: 'home' } | { name: 'local'; key: number; seats: SeatInfo[]; game: Local }

const TITLE = 'RETROCAUSE'
const SAVE = 'local'

/** 봇 자리에 옛 혼자 하기의 봇 이름을 붙인다 */
function withBotNames(seats: SeatInfo[]): SeatInfo[] {
  let k = 0
  return seats.map((s) => (s.kind === 'bot' ? { ...s, name: BOT_NAMES[k++ % BOT_NAMES.length]! } : s))
}

function botSeats(n: number): SeatInfo[] {
  // 처음 화면(HomeScreen)이 닉네임을 retrocause:name 에 글자 그대로 저장한다
  let name = ''
  try {
    name = localStorage.getItem('retrocause:name')?.trim() ?? ''
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

function quickCount(q: URLSearchParams): number {
  const n = Number(q.get('play'))
  return n === 3 || n === 5 ? n : 4
}

function initialRoute(): Route {
  const q = new URLSearchParams(location.search)
  if (q.has('play')) return localRoute(botSeats(quickCount(q)))
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
        <div className="grid grid-cols-3 gap-2">
          {[3, 4, 5].map((n) => (
            <Button key={n} onClick={() => setRoute(localRoute(botSeats(n)))}>
              봇과 {n}인
            </Button>
          ))}
        </div>
        <Button onClick={() => setRules('summary')}>3분 규칙 요약</Button>
        <Button tone="ghost" onClick={() => setRules('full')}>
          전체 룰북
        </Button>
        <p className="text-center text-sm text-muted">룰북 v0.2 기준 · 3~5인 · 시작 플레이어는 무작위 · 봇은 자기 손패와 공개 정보만 보고 판단합니다</p>
      </HomeScreen>
      <Sheet open={rules !== null} title={rules === 'full' ? '룰북' : '3분 규칙 요약'} onClose={() => setRules(null)}>
        {rules === 'full' ? <Rulebook /> : <RulesText />}
      </Sheet>
    </>
  )
}

function Hero() {
  return (
    <div className="mt-1 mb-1">
      <p className="m-0 text-[15px] font-black tracking-[0.28em] text-primary">RETROCAUSE</p>
      <p className="m-0 text-xs text-muted">레트로코즈 · 역인과 추리·블러핑</p>
      <h1 className="mt-4 mb-0 text-3xl font-extrabold tracking-tight text-[var(--rc-ember)]">성은 이미 불탔다.</h1>
      <p className="mt-1 mb-0 text-lg">역사가 누구를 범인으로 기억하게 만들 것인가?</p>
    </div>
  )
}

/**
 * 한 기기 대국. 사람이 둘 이상이면(돌려 하기) 다음 사람에게 넘길 때 화면을 가린다:
 * 손패·비밀 목표·추리가 사람마다 다르므로, 넘겨받은 사람이 누르기 전에는 보드를 보여 주지 않는다.
 */
function LocalTable({ game, again, onLeave }: { game: Local; again(): void; onLeave(): void }) {
  const state = useLocalGame(game)
  const room = state.room
  const humans = room.seats.filter((s) => s.kind === 'human').length
  const [shownFor, setShownFor] = useState<number | null>(() => (humans > 1 ? null : room.you))
  const [speed, setSpeedRaw] = useState(() => {
    const ms = store.get('speed', 700)
    return SPEEDS.some((s) => s.ms === ms) ? ms : 700
  })
  useEffect(() => game.setSpeed(def.bot!.delayMs / speed), [game, speed])
  const setSpeed = (ms: number) => {
    setSpeedRaw(ms)
    store.set('speed', ms)
  }
  const cover = humans > 1 && room.status !== 'over' && room.you !== null && room.you !== shownFor

  if (cover) {
    const name = room.seats[room.you!]!.name
    const guess = room.view?.phase === 'guess'
    return (
      <Screen
        footer={
          <>
            <Button tone="primary" onClick={() => setShownFor(room.you)}>
              {name}입니다 · 보기
            </Button>
            <Button tone="ghost" onClick={onLeave}>
              그만두기
            </Button>
          </>
        }
      >
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <p className="m-0 text-sm font-bold tracking-[0.3em] text-muted">기기를 넘겨 주세요</p>
          <p className="m-0 text-3xl font-extrabold">{name}</p>
          <p className="m-0 text-muted">{guess ? '추리할 차례' : '원인을 끼워 넣을 차례'}</p>
          <p className="m-0 max-w-[30ch] text-sm text-muted">다른 사람은 화면을 보지 마세요. 손패와 비밀 목표는 사람마다 다릅니다.</p>
        </div>
      </Screen>
    )
  }
  return <Table room={room} error={state.error} onAct={(a) => game.act(a)} onLeave={onLeave} local={{ again, speed, setSpeed }} />
}
