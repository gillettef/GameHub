// 화면 전환: 처음 → 한 기기(봇 대전·돌려 하기·봇끼리 관전) / 온라인(대기실 → 대국, 관전, 새로고침·끊김 뒤 복귀)
// 진행은 공통 코드(@gamehub/net)가 맡는다: 한 기기 LocalGame(이어 하기 저장), 온라인 useRoom. 초대 링크는 ?room=ABCD.
import type { RoomSnapshot, SeatInfo } from '@gamehub/net'
import { LocalGame, invitedCode, useLocalGame, useRoom, type LocalSave } from '@gamehub/net/client'
import { Button, HomeScreen, Screen, Sheet, WaitingRoom } from '@gamehub/ui'
import { useCallback, useMemo, useState } from 'react'
import { def, type Action, type Table, type View } from '../def'
import { BOT_NAMES } from '../engine/bot'
import { GameScreen } from './GameScreen'
import { Icon } from './Icons'
import { RulesGuide } from './Rules'

type Local = LocalGame<Table, Action, View, unknown>
type Route = { name: 'home' } | { name: 'local'; key: number; seats: SeatInfo[]; game: Local; clock: SpeedClock }

const TITLE = '마법학교'
const SAVE_KEY = 'magicacademy:local'
const SPEED_KEY = 'magicacademy:botSpeed'
/** 봇 속도 배수(한 기기). 진행 단계의 3초 기다림도 같은 배수로 줄어든다 */
const SPEEDS = { normal: 1, fast: 4 } as const
type Speed = keyof typeof SPEEDS

function loadSpeed(): Speed {
  try {
    return localStorage.getItem(SPEED_KEY) === 'fast' ? 'fast' : 'normal'
  } catch {
    return 'normal'
  }
}

/** 한 기기 대전의 시계: 실제 시간에 속도 배수를 곱해 흐른다(공통 Match 의 now) */
class SpeedClock {
  private virt = 0
  private last = Date.now()
  speed: number = SPEEDS[loadSpeed()]
  now = (): number => {
    const t = Date.now()
    this.virt += (t - this.last) * this.speed
    this.last = t
    return this.virt
  }
  /** 지금까지 흐른 시간은 옛 배수로 센 뒤 바꾼다 */
  setSpeed(speed: number): void {
    this.now()
    this.speed = speed
  }
}

function loadSave(): LocalSave<Action> | null {
  try {
    const save = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as LocalSave<Action> | null
    if (!save || !Array.isArray(save.seats) || !Array.isArray(save.history) || typeof save.seed !== 'number') return null
    return save
  } catch {
    return null
  }
}
function writeSave(save: LocalSave<Action> | null): void {
  try {
    if (save) localStorage.setItem(SAVE_KEY, JSON.stringify(save))
    else localStorage.removeItem(SAVE_KEY)
  } catch {
    // 저장할 수 없으면(사생활 보호 모드) 이어 하기만 안 된다
  }
}

/** 봇 자리에 옛 서버의 봇 이름(마루·별이…)을 붙인다 */
function withBotNames(seats: SeatInfo[]): SeatInfo[] {
  let k = 0
  return seats.map((s) => (s.kind === 'bot' ? { ...s, name: `${BOT_NAMES[k++ % BOT_NAMES.length]} 🤖` } : s))
}

let localKey = 0
function localRoute(seats: SeatInfo[], save?: LocalSave<Action>): Extract<Route, { name: 'local' }> {
  const clock = new SpeedClock()
  const game: Local = new LocalGame(def, {
    seats,
    now: clock.now,
    ...(save ? { seed: save.seed, history: save.history } : {}),
    onSave: (s) => writeSave(s),
  })
  game.setSpeed(clock.speed)
  return { name: 'local', key: ++localKey, seats, game, clock }
}

/** 저장한 한 기기 판(끝나지 않은 것). 지금 규칙으로 이어 둘 수 없으면 버린다 */
function restoreLocal(): Extract<Route, { name: 'local' }> | null {
  const save = loadSave()
  if (!save) return null
  try {
    const route = localRoute(save.seats, save)
    if (route.game.getState().room.status === 'over') throw new Error('끝난 판')
    return route
  } catch {
    writeSave(null)
    return null
  }
}

export function App() {
  const [online, client] = useRoom<View, Action>({ slug: def.slug })
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const [invited, setInvited] = useState(() => invitedCode(location.search))
  const [rules, setRules] = useState(false)

  const home = () => {
    setInvited(null)
    history.replaceState(null, '', location.pathname)
    setRoute({ name: 'home' })
  }
  // 처음 화면으로 돌아올 때마다 저장한 판을 다시 읽는다(만들기만 하고 시작하지 않으므로 봇이 움직이지 않는다)
  const resumable = useMemo(() => {
    void route
    return restoreLocal()
  }, [route])
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
      <GameScreen
        key={`online-${room.code}`}
        room={room as RoomSnapshot<View>}
        error={online.error}
        reconnecting={online.connection === 'reconnecting'}
        onAct={(a) => client.act(a)}
        onLeave={leaveOnline}
      />
    )
  }
  if (route.name === 'local') {
    return (
      <LocalTable
        key={route.key}
        game={route.game}
        clock={route.clock}
        again={() => {
          writeSave(null)
          setRoute(localRoute(route.seats))
        }}
        onLeave={home}
        onEnd={() => {
          writeSave(null)
          home()
        }}
      />
    )
  }

  const resume = route.name === 'home' ? resumable : null
  return (
    <>
      <HomeScreen
        slug={def.slug}
        title={TITLE}
        hero={<Hero />}
        top={
          resume ? (
            <Button tone="primary" onClick={() => setRoute(resume)}>
              진행 중인 게임 이어 하기 ({resume.game.getState().room.view?.game.round ?? 1}/12개월)
            </Button>
          ) : undefined
        }
        minSeats={def.minSeats}
        maxSeats={def.maxSeats}
        bots
        invited={invited}
        error={online.error}
        connecting={online.connection !== 'idle'}
        onLocal={(seats) => {
          writeSave(null)
          setRoute(localRoute(withBotNames(seats)))
        }}
        onCreate={(name, seats, bots) => client.create(name, seats, bots)}
        onJoin={(code, name) => client.join(code, name)}
        onWatch={(code) => client.watch(code)}
      >
        <Button onClick={() => setRules(true)}>게임 규칙</Button>
        <p className="m-0 text-center text-sm text-muted">2~5명 · 12개월 · 사람이 둘 이상이면 한 기기를 돌려 가며, 차례가 바뀔 때 가림 화면이 나와요</p>
      </HomeScreen>
      <Sheet open={rules} title="게임 규칙" onClose={() => setRules(false)}>
        <div className="pb-3">
          <RulesGuide />
        </div>
      </Sheet>
    </>
  )
}

function Hero() {
  return (
    <div className="mt-1 mb-1 text-center">
      <h1 className="m-0 font-display text-4xl text-purple-700">
        <Icon name="school" className="mr-1 h-8 w-8" />
        {TITLE}
      </h1>
      <p className="mt-1 mb-0 text-sm text-muted">친구들과 함께 즐기는 마법 학교 보드게임</p>
    </div>
  )
}

/**
 * 한 기기 대국. 사람이 둘 이상이면(돌려 하기) 둘 사람이 바뀔 때 화면을 가린다: 장래희망·엿본 탐험 카드는 사람마다 비밀이므로
 * 넘겨받은 사람이 누르기 전에는 보여 주지 않는다. 가림 화면과 주차 알림이 떠 있는 동안 봇과 진행은 멈춘다.
 */
function LocalTable({ game, clock, again, onLeave, onEnd }: { game: Local; clock: SpeedClock; again(): void; onLeave(): void; onEnd(): void }) {
  const [speed, setSpeedRaw] = useState<Speed>(loadSpeed)
  const setSpeed = (s: Speed) => {
    setSpeedRaw(s)
    clock.setSpeed(SPEEDS[s])
    game.setSpeed(SPEEDS[s])
    try {
      localStorage.setItem(SPEED_KEY, s)
    } catch {
      // 이번 실행 동안만
    }
  }
  const state = useLocalGame(game)
  const room = state.room
  const humans = room.seats.filter((s) => s.kind === 'human').length
  const hotseat = humans > 1
  const [shownSeat, setShownSeat] = useState<number | null>(hotseat ? null : room.you)
  const cover = hotseat && room.status === 'playing' && room.you !== null && shownSeat !== room.you
  const [noticeBusy, setNoticeBusy] = useState(false)
  const paused = cover || noticeBusy
  if (state.paused !== paused) queueMicrotask(() => game.setPaused(paused))
  const onBusy = useCallback((b: boolean) => setNoticeBusy(b), [])

  if (cover) {
    const name = room.seats[room.you!]!.name
    return (
      <Screen
        footer={
          <>
            <Button tone="primary" onClick={() => setShownSeat(room.you)}>
              제가 {name}입니다 · 보기
            </Button>
            <Button tone="ghost" onClick={onLeave}>
              나가기
            </Button>
          </>
        }
      >
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <Icon name="wand" className="h-12 w-12 text-purple-500" />
          <p className="m-0 text-sm text-muted">{room.view?.game.round ?? 1}/12개월</p>
          <p className="m-0 font-display text-3xl text-purple-700">{name} 님 차례</p>
          <p className="m-0 max-w-[30ch] text-sm text-muted">
            기기를 {name} 님에게 넘겨주세요.
            <br />
            장래희망은 비밀이라 다른 사람은 화면을 보지 마세요.
          </p>
        </div>
      </Screen>
    )
  }
  return <GameScreen room={room} error={state.error} onAct={(a) => game.act(a)} onLeave={room.status === 'over' ? onEnd : onLeave} local={{ again, onBusy, speed, onSpeed: setSpeed }} />
}
