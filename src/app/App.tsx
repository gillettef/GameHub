import { useCallback, useEffect, useMemo, useState } from 'react'
import { applyAction, IllegalActionError, type Action, type GameState } from '../engine'
import { chooseBotAction } from '../bot/bot'
import { GameScreen } from '../ui/GameScreen'
import { HistoryScreen } from '../ui/HistoryScreen'
import { HomeScreen, type NewGameOptions } from '../ui/HomeScreen'
import { OnlineScreen } from '../ui/OnlineScreen'
import { ReplayScreen } from '../ui/ReplayScreen'
import { ResultScreen } from '../ui/ResultScreen'
import { useOnline } from './online'
import { archive, loadCurrent, newSession, replay, saveCurrent, type Session } from './session'

type Screen =
  | { kind: 'home' }
  | { kind: 'game' }
  | { kind: 'history' }
  | { kind: 'replay'; session: Session }
  | { kind: 'online' }

/** 봇이 한 수 두기 전 기다리는 시간 (사람이 따라갈 수 있게) */
const BOT_DELAY_MS = 700

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** 지금 봇이 둘 차례면 그 봇의 자리 */
function botToMove(state: GameState, session: Session): number | null {
  const mine = session.localSeats ?? session.seats.map((_, i) => i)
  const isLocalBot = (p: number) => session.seats[p]?.kind === 'bot' && mine.includes(p)
  if (state.phase.kind === 'setup') {
    const p = state.players.find((pl) => pl.personalGoal === null && isLocalBot(pl.id))
    return p ? p.id : null
  }
  if (state.phase.kind === 'round' && isLocalBot(state.currentPlayer)) return state.currentPlayer
  return null
}

/**
 * 행동 기록 → 상태. 행동이 하나씩 늘 때는 직전 상태에 이어서 적용한다.
 * 연출용으로 마지막 행동 직전 상태(prev)도 함께 둔다.
 */
let cache: { id: string; count: number; state: GameState; prev: GameState | null } | null = null

function stateOf(session: Session): { state: GameState; prev: GameState | null } {
  const n = session.actions.length
  if (cache && cache.id === session.id && cache.count === n) return cache
  let state: GameState
  let prev: GameState | null = null
  if (cache && cache.id === session.id && cache.count < n) {
    state = cache.state
    for (const a of session.actions.slice(cache.count)) {
      prev = state
      state = applyAction(state, a)
    }
  } else {
    prev = n > 0 ? replay(session, n - 1) : null
    const last = session.actions[n - 1]
    state = prev && last ? applyAction(prev, last) : replay(session)
  }
  cache = { id: session.id, count: n, state, prev }
  return cache
}

export function App() {
  const [session, setSession] = useState<Session | null>(() => loadCurrent())
  const [screen, setScreen] = useState<Screen>({ kind: 'home' })
  const [error, setError] = useState<string | null>(null)
  /** 확인할 알림 모달이 떠 있으면 봇이 기다린다 */
  const [hold, setHold] = useState(false)
  /** 마지막 알림까지 확인해 결과 화면을 보여도 되는 게임 id */
  const [finishedId, setFinishedId] = useState<string | null>(null)
  const finish = useCallback(() => setFinishedId(session?.id ?? null), [session?.id])

  const derived = useMemo(() => (session ? stateOf(session) : null), [session])
  const state = derived?.state ?? null

  const online = useOnline(session, setSession)

  const dispatch = useCallback(
    (action: Action) => {
      if (!session || !state) return
      try {
        applyAction(state, action)
      } catch (e) {
        setError(e instanceof IllegalActionError ? e.message : '할 수 없는 행동입니다.')
        return
      }
      setError(null)
      const next = { ...session, actions: [...session.actions, action] }
      setSession(next)
      if (next.room) online.send(action, session.actions.length)
    },
    [session, state, online],
  )

  // 저장: 진행 중이면 이어 하기용으로, 끝나면 기록으로
  useEffect(() => {
    if (!session || !state) return
    if (state.phase.kind === 'ended') {
      archive(session)
      if (!session.room) saveCurrent(null)
    } else if (!session.room) {
      saveCurrent(session)
    }
  }, [session, state])

  // 봇 차례
  useEffect(() => {
    if (!session || !state || screen.kind !== 'game' || hold) return
    const bot = botToMove(state, session)
    if (bot === null) return
    const timer = setTimeout(() => {
      const action = chooseBotAction(state, bot)
      if (action) dispatch(action)
    }, BOT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [session, state, screen.kind, hold, dispatch])

  function start({ seats, law }: NewGameOptions) {
    const config = {
      playerCount: seats.length,
      seed: randomSeed(),
      ...(law === 'random' ? {} : { law }),
    }
    const s = newSession(config, seats, randomId(), Date.now())
    setSession(s)
    setError(null)
    setScreen({ kind: 'game' })
  }

  if (screen.kind === 'history') {
    return <HistoryScreen onBack={() => setScreen({ kind: 'home' })} onReplay={(s) => setScreen({ kind: 'replay', session: s })} />
  }
  if (screen.kind === 'replay') {
    return <ReplayScreen session={screen.session} onBack={() => setScreen({ kind: 'history' })} />
  }
  if (screen.kind === 'online') {
    return (
      <OnlineScreen
        online={online}
        onBack={() => setScreen({ kind: 'home' })}
        onJoined={(s) => {
          setSession(s)
          setScreen({ kind: 'game' })
        }}
      />
    )
  }

  if (screen.kind === 'game' && session && state) {
    if (state.phase.kind === 'ended' && finishedId === session.id) {
      return (
        <ResultScreen
          state={state}
          seats={session.seats}
          onReplay={() => setScreen({ kind: 'replay', session })}
          onHome={() => {
            setSession(null)
            online.leave()
            setScreen({ kind: 'home' })
          }}
        />
      )
    }
    return (
      <GameScreen
        state={state}
        prev={derived?.prev ?? null}
        lastAction={session.actions.at(-1) ?? null}
        step={session.actions.length}
        seats={session.seats}
        localSeats={session.localSeats ?? session.seats.map((_, i) => i)}
        onAction={dispatch}
        onExit={() => setScreen({ kind: 'home' })}
        error={error}
        onHold={setHold}
        onFinished={finish}
      />
    )
  }

  const canContinue = !!session && !!state && state.phase.kind !== 'ended'
  return (
    <HomeScreen
      canContinue={canContinue}
      onContinue={() => setScreen({ kind: 'game' })}
      onStart={start}
      onHistory={() => setScreen({ kind: 'history' })}
      onOnline={() => setScreen({ kind: 'online' })}
    />
  )
}

