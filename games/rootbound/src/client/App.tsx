// 화면 전환: 처음 → 한 기기(AI 대전·돌려 하기·튜토리얼) / 온라인(대기실 → 대국, 관전)
// 초대 링크: ?room=ABCD. 한 기기 판은 행동 기록을 저장해 두고 처음 화면의 '이어 하기'로 돌아온다(튜토리얼은 저장하지 않는다).
import type { SeatInfo } from '@gamehub/net'
import { LocalGame, invitedCode, useLocalGame, useRoom, type LocalSave } from '@gamehub/net/client'
import { Button, HomeScreen, Sheet, WaitingRoom } from '@gamehub/ui'
import { useCallback, useMemo, useState } from 'react'
import { def, parseOptions, type Action, type Options, type Table, type View } from '../def'
import { DEFAULT_TURN_TIME_SEC, MAX_PLAYERS, MIN_PLAYERS, TURN_TIME_OPTIONS_SEC } from '../engine'
import { GameView } from './GameView'
import { hasSeenTutorial } from './lib/onboarding'
import { turnTimeLabel } from './lib/turnClock'
import { HelpTab } from './tabs/HelpTab'

type Local = LocalGame<Table, Action, View, Options>
type Route = { name: 'home' } | { name: 'local'; key: number; seats: SeatInfo[]; options: Options; game: Local }

const TITLE = '냥냥 골목'
const SAVE_KEY = 'rootbound:local'
const TURN_KEY = 'rootbound:turnTime'
/** 튜토리얼 고정 설정(옛 튜토리얼과 같은 판) */
const TUTORIAL_SEED = 20261007

const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? fallback : (JSON.parse(raw) as T)
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown): void {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* 사생활 보호 모드 */
    }
  },
}

/** 봇 자리에 AI 이름을 붙인다(옛 화면과 같다: AI 1, AI 2 …) */
function withBotNames(seats: SeatInfo[]): SeatInfo[] {
  let k = 0
  return seats.map((s) => (s.kind === 'bot' ? { ...s, name: `AI ${++k}` } : s))
}

let localKey = 0
function localRoute(seats: SeatInfo[], options: Options, save?: LocalSave<Action>, seed?: number): Extract<Route, { name: 'local' }> {
  const game: Local = new LocalGame(def, {
    seats,
    options,
    ...(save ? { seed: save.seed, history: save.history } : seed !== undefined ? { seed } : {}),
    ...(options.tutorial ? {} : { onSave: (s: LocalSave<Action>) => store.set(SAVE_KEY, s) }),
  })
  return { name: 'local', key: ++localKey, seats, options, game }
}

/** 저장한 한 기기 판(끝나지 않은 것). 형식이 틀리거나 지금 규칙으로 둘 수 없으면 버린다 */
function restoreLocal(): Extract<Route, { name: 'local' }> | null {
  const save = store.get<LocalSave<Action> | null>(SAVE_KEY, null)
  if (!save || !Array.isArray(save.seats) || !Array.isArray(save.history) || typeof save.seed !== 'number') return null
  try {
    const route = localRoute(save.seats, { ...parseOptions(save.options), turnTime: null }, save)
    if (route.game.getState().room.status === 'over') throw new Error('끝난 판')
    return route
  } catch {
    store.set(SAVE_KEY, null)
    return null
  }
}

export function App() {
  const [online, client] = useRoom<View, Action>({ slug: def.slug })
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const [invited, setInvited] = useState(() => invitedCode(location.search))
  const [rules, setRules] = useState(false)
  const [turnTime, setTurnTimeRaw] = useState<number | null>(() => {
    const t = store.get<number | null>(TURN_KEY, DEFAULT_TURN_TIME_SEC)
    return TURN_TIME_OPTIONS_SEC.includes(t) ? t : DEFAULT_TURN_TIME_SEC
  })
  const setTurnTime = (t: number | null) => {
    setTurnTimeRaw(t)
    store.set(TURN_KEY, t)
  }

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
  const onlineAct = useCallback((a: Action) => client.act(a), [client])
  // 같은 문장이 다시 와도 알리도록 거절이 올 때마다 새 객체로 넘긴다
  const onlineError = useMemo(() => (online.error ? { message: online.error } : null), [online])

  const room = online.room
  if (room?.status === 'lobby') {
    return (
      <WaitingRoom title={TITLE} room={room} bots error={online.error} onSeat={(i, kind) => client.setSeat(i, kind)} onStart={() => client.start()} onLeave={leaveOnline} />
    )
  }
  if (room?.view) {
    return (
      <GameView
        key={`online-${room.code}`}
        room={room}
        mode="online"
        error={onlineError}
        offline={online.connection === 'reconnecting'}
        onAct={onlineAct}
        onLeave={leaveOnline}
        onNewGame={leaveOnline}
      />
    )
  }
  if (route.name === 'local') {
    return (
      <LocalTable
        key={route.key}
        game={route.game}
        again={() => setRoute(localRoute(route.seats, route.options, undefined, route.options.tutorial ? TUTORIAL_SEED : undefined))}
        onLeave={home}
        onEnd={() => {
          if (!route.options.tutorial) store.set(SAVE_KEY, null)
          home()
        }}
      />
    )
  }

  const startTutorial = () => {
    const name = (localStorage.getItem(`${def.slug}:name`) ?? '').trim() || '나'
    setRoute(localRoute([{ kind: 'human', name }, { kind: 'bot', name: '연습 봇' }], { turnTime: null, tutorial: true }, undefined, TUTORIAL_SEED))
  }
  const resume = route.name === 'home' ? resumable : null
  const seen = hasSeenTutorial()
  const tutorialButton = (
    <Button tone={seen || resume ? 'secondary' : 'primary'} onClick={startTutorial}>
      튜토리얼 (연습 봇과 한 판)
    </Button>
  )

  return (
    <>
      <HomeScreen
        slug={def.slug}
        title={TITLE}
        hero={<Hero />}
        top={
          resume ? (
            <Button tone="primary" onClick={() => setRoute(resume)}>
              진행 중인 게임 이어 하기 ({resume.game.getState().room.view?.game.round || 1}라운드)
            </Button>
          ) : seen ? undefined : (
            tutorialButton
          )
        }
        setup={
          <div>
            <span className="mb-1 block text-sm text-muted">온라인 차례 제한 시간 (방을 만들 때)</span>
            <div className="flex gap-1.5">
              {TURN_TIME_OPTIONS_SEC.map((t) => (
                <button
                  key={String(t)}
                  type="button"
                  aria-pressed={turnTime === t}
                  className={`min-h-11 flex-1 rounded-lg border-2 bg-surface ${turnTime === t ? 'border-primary font-bold' : 'border-transparent'}`}
                  onClick={() => setTurnTime(t)}
                >
                  {turnTimeLabel(t)}
                </button>
              ))}
            </div>
          </div>
        }
        minSeats={def.minSeats}
        maxSeats={def.maxSeats}
        bots
        invited={invited}
        error={online.error}
        connecting={online.connection !== 'idle'}
        onLocal={(seats) => {
          store.set(SAVE_KEY, null)
          setRoute(localRoute(withBotNames(seats), { turnTime: null, tutorial: false }))
        }}
        onCreate={(name, seats, bots) => client.create(name, seats, bots, { turnTime })}
        onJoin={(code, name) => client.join(code, name)}
        onWatch={(code) => client.watch(code)}
      >
        {(resume || seen) && tutorialButton}
        <Button onClick={() => setRules(true)}>게임 규칙</Button>
        <p className="text-center text-sm text-muted">
          {MIN_PLAYERS}~{MAX_PLAYERS}명 · 사람이 둘 이상이면 한 기기를 돌려 가며, 차례마다 가림 화면이 나옵니다
        </p>
      </HomeScreen>
      <Sheet open={rules} title="게임 규칙" onClose={() => setRules(false)}>
        <HelpTab />
      </Sheet>
    </>
  )
}

function Hero() {
  return (
    <div className="mt-1 mb-1 rounded-2xl bg-surface px-4 py-4 text-center">
      <h1 className="m-0">
        {/* 로고 그림(페이지 기준 상대경로). 그림을 못 읽으면 alt 글자가 제목이 된다 */}
        <img src="./art/logo.svg" alt={TITLE} width={900} height={300} className="mx-auto block h-auto w-full max-w-[320px]" />
      </h1>
      <p className="mt-1 mb-1 text-base font-bold">골목 고양이 영역 다툼</p>
      <p className="m-0 text-sm text-muted">평상·종이 상자 같은 명당을 놓고 고양이를 불러 모아 골목을 차지하세요. 남의 고양이는 한 마리씩 쫓아내고, 끝났을 때 내 고양이가 앉은 칸과 소문 카드로 겨룹니다.</p>
    </div>
  )
}

/**
 * 한 기기 대국. 공개 단계의 '확인하고 시작'은 한 번만 누르면 된다(옛 한 기기 화면과 같다): 사람 자리마다 차례로 확인을 낸다.
 * 돌려 하기의 가림 화면은 GameView(HandoffOverlay)가 맡는다.
 */
function LocalTable({ game, again, onLeave, onEnd }: { game: Local; again(): void; onLeave(): void; onEnd(): void }) {
  const state = useLocalGame(game)
  const room = state.room
  const act = useCallback(
    (a: Action) => {
      if (a.type !== 'CONFIRM') return game.act(a)
      for (let k = 0; k < MAX_PLAYERS; k++) {
        const r = game.getState().room
        if (r.status !== 'playing' || r.view?.game.phase !== 'reveal' || r.you === null || !r.actors.includes(r.you)) break
        game.act({ type: 'CONFIRM' })
      }
    },
    [game],
  )
  const error = useMemo(() => (state.error ? { message: state.error } : null), [state])
  return <GameView room={room} mode="hotseat" error={error} onAct={act} onLeave={room.status === 'over' ? onEnd : onLeave} onNewGame={again} />
}
