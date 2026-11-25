/**
 * 화면 전환과 게임 연결. 진행은 공통 방·진행 코드(@gamehub/net)가 맡는다:
 * 한 기기 게임은 LocalGame(이어 하기·되돌리기), 온라인은 useRoom(대기실 → 대국, 재접속).
 * 게임이 끝나면 전체 기록(view.record)을 받아 리플레이·통계용으로 보관한다.
 */
import type { RoomSnapshot, SeatInfo } from '@gamehub/net'
import { LocalGame, invitedCode, useLocalGame, useRoom, type LocalSave } from '@gamehub/net/client'
import { WaitingRoom } from '@gamehub/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { def, type Options, type Table, type View } from '../def'
import type { Action, GameState } from '../engine'
import { useBack } from '../ui/back'
import type { BotSpeed } from '../ui/CardsSheet'
import { GameScreen } from '../ui/GameScreen'
import { HistoryScreen } from '../ui/HistoryScreen'
import { HomeScreen, type LawChoice } from '../ui/HomeScreen'
import { ReplayScreen } from '../ui/ReplayScreen'
import { ResultScreen } from '../ui/ResultScreen'
import { archive, loadCurrent, saveCurrent, type SavedLocal, type Seat, type Session } from './session'

type Local = LocalGame<Table, Action, View, Options>
type Screen = { kind: 'home' } | { kind: 'history' } | { kind: 'replay'; session: Session }

/** 봇이 한 수 두기 전 기다리는 시간 (사람이 따라갈 수 있게). 카드 시트에서 바꾼다 */
const BOT_DELAY_MS: Record<BotSpeed, number> = { slow: 1100, normal: 700, fast: 300 }
const BOT_SPEED_KEY = 'tesseract:botSpeed'
const TITLE = '테서랙트'

function loadBotSpeed(): BotSpeed {
  try {
    const v = localStorage.getItem(BOT_SPEED_KEY)
    return v === 'slow' || v === 'fast' ? v : 'normal'
  } catch {
    return 'normal'
  }
}

const speedOf = (speed: BotSpeed) => def.bot!.delayMs / BOT_DELAY_MS[speed]

interface LocalRun {
  key: number
  createdAt: number
  game: Local
}

let runKey = 0

/** 한 기기 게임을 만든다(저장한 판이면 이어서). 저장한 판을 지금 규칙으로 이어 둘 수 없으면 null */
function newLocal(save: Pick<LocalSave<Action>, 'seats' | 'options'> & Partial<LocalSave<Action>>, createdAt: number, key = ++runKey): LocalRun | null {
  try {
    const game: Local = new LocalGame(def, {
      seats: save.seats,
      options: def.parseOptions!(save.options),
      ...(save.seed !== undefined ? { seed: save.seed } : {}),
      ...(save.history ? { history: save.history } : {}),
      onSave: (s) => saveCurrent({ v: 4, createdAt, save: s }),
    })
    return { key, createdAt, game }
  } catch {
    return null
  }
}

export function App() {
  const [online, client] = useRoom<View, Action>({ slug: def.slug })
  const [local, setLocal] = useState<LocalRun | null>(null)
  const [saved, setSaved] = useState<SavedLocal | null>(loadCurrent)
  const [screen, setScreen] = useState<Screen>({ kind: 'home' })
  const [invited, setInvited] = useState(() => invitedCode(location.search))
  const [botSpeed, setBotSpeedRaw] = useState<BotSpeed>(loadBotSpeed)
  const setBotSpeed = useCallback((speed: BotSpeed) => {
    setBotSpeedRaw(speed)
    try {
      localStorage.setItem(BOT_SPEED_KEY, speed)
    } catch {
      // 저장할 수 없으면 이번 실행 동안만
    }
  }, [])

  const home = () => {
    setLocal(null)
    setSaved(loadCurrent())
    setInvited(null)
    history.replaceState(null, '', location.pathname)
    setScreen({ kind: 'home' })
  }
  // Android 뒤로가기: 기록·리플레이에서는 한 단계 위로 (시트·모달이 열려 있으면 그쪽이 먼저 받는다)
  useBack(() => setScreen(screen.kind === 'replay' ? { kind: 'history' } : { kind: 'home' }), screen.kind !== 'home')

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
        onLeave={() => {
          client.leave()
          home()
        }}
      />
    )
  }
  if (room?.view) {
    return (
      <GameView
        key={`online-${room.code}`}
        room={room as RoomSnapshot<View>}
        error={online.error}
        onAct={(a) => client.act(a)}
        localSeats={room.you === null ? [] : [room.you]}
        connection={{ open: online.connection === 'open', presence: room.seats.map((s) => s.online) }}
        exitWarning="한 번 더 누르면 나가요 · 자리는 봇이 이어받아요"
        onExit={() => {
          client.leave()
          home()
        }}
      />
    )
  }
  if (local) {
    return (
      <LocalTable
        key={local.key}
        run={local}
        botSpeed={botSpeed}
        onBotSpeed={setBotSpeed}
        onReplace={setLocal}
        onHome={home}
      />
    )
  }
  if (screen.kind === 'history') return <HistoryScreen onBack={() => setScreen({ kind: 'home' })} onReplay={(s) => setScreen({ kind: 'replay', session: s })} />
  if (screen.kind === 'replay') return <ReplayScreen session={screen.session} onBack={() => setScreen({ kind: 'history' })} />

  const startLocal = (seats: SeatInfo[], law: LawChoice) => setLocal(newLocal({ seats, options: { law } }, Date.now()))
  return (
    <HomeScreen
      invited={invited}
      error={online.error}
      connecting={online.connection !== 'idle'}
      canContinue={saved !== null}
      onContinue={() => {
        const run = saved ? newLocal(saved.save, saved.createdAt) : null
        if (run) setLocal(run)
        else {
          saveCurrent(null)
          setSaved(null)
        }
      }}
      onLocal={startLocal}
      onCreate={(name, seats, bots, law) => client.create(name, seats, bots, { law })}
      onJoin={(code, name) => client.join(code, name)}
      onWatch={(code) => client.watch(code)}
      onHistory={() => setScreen({ kind: 'history' })}
    />
  )
}

/** 한 기기 게임: 봇 속도, 알림을 확인하는 동안 봇 멈춤, 되돌리기, 같은 설정으로 다시 하기 */
function LocalTable({
  run,
  botSpeed,
  onBotSpeed,
  onReplace,
  onHome,
}: {
  run: LocalRun
  botSpeed: BotSpeed
  onBotSpeed(speed: BotSpeed): void
  onReplace(run: LocalRun | null): void
  onHome(): void
}) {
  const { game } = run
  const state = useLocalGame(game)
  const room = state.room
  const v = room.view!
  const over = v.game.phase.kind === 'ended'

  useEffect(() => game.setSpeed(speedOf(botSpeed)), [game, botSpeed])
  // 확인할 알림이 떠 있는 동안 봇이 기다린다. GameScreen 이 효과 안에서 부르므로 함수가 바뀌지 않게 둔다
  const hold = useCallback((h: boolean) => game.setPaused(h), [game])
  // 끝난 판은 이어 하기에서 뺀다(기록은 GameView 가 보관한다)
  useEffect(() => {
    if (over) saveCurrent(null)
  }, [over])

  const last = v.last
  const undoable = !over && v.undoable && last !== null && room.seats[last.player]?.kind === 'human'
  const undo = () => {
    // 누르는 사이 봇이 두었으면 남의 수를 지우지 않게 지금 기록으로 다시 확인한다
    const save = game.save()
    const move = save.history.at(-1)
    if (!move || move.byBot || room.seats[move.seat]?.kind !== 'human') return
    game.dispose()
    onReplace(newLocal({ ...save, history: save.history.slice(0, -1) }, run.createdAt, run.key))
  }
  const rematch = () => {
    const save = game.save()
    onReplace(newLocal({ seats: save.seats, options: save.options }, Date.now()))
  }

  return (
    <GameView
      room={room}
      error={state.error}
      onAct={(a) => game.act(a)}
      localSeats={room.seats.map((_, i) => i)}
      connection={null}
      onExit={onHome}
      onHold={hold}
      botSpeed={botSpeed}
      onBotSpeed={onBotSpeed}
      onUndo={undoable ? undo : undefined}
      onRematch={rematch}
    />
  )
}

interface GameViewProps {
  room: RoomSnapshot<View>
  error: string | null
  onAct(a: Action): void
  localSeats: number[]
  connection: { open: boolean; presence: boolean[] } | null
  exitWarning?: string
  onExit(): void
  onHold?(hold: boolean): void
  botSpeed?: BotSpeed
  onBotSpeed?(speed: BotSpeed): void
  onUndo?(): void
  onRematch?(): void
}

/** 대국 → (알림을 다 확인하면) 결과 → 리플레이 */
function GameView(p: GameViewProps) {
  const v = p.room.view!
  // 연출용 직전 상태: 행동 수가 바뀔 때만 앞으로 민다(접속 표시만 바뀐 소식으로 연출이 지워지지 않게)
  const [pair, setPair] = useState<{ step: number; cur: GameState; prev: GameState | null }>({ step: v.step, cur: v.game, prev: null })
  if (pair.cur !== v.game) setPair(pair.step === v.step ? { ...pair, cur: v.game } : { step: v.step, cur: v.game, prev: pair.cur })
  const [finished, setFinished] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const [createdAt] = useState(() => Date.now())

  const seats: Seat[] = useMemo(() => p.room.seats.map((s) => ({ name: s.name, kind: s.kind === 'bot' ? 'bot' : 'human' })), [p.room.seats])
  const record = v.record
  const session: Session | null = useMemo(
    () =>
      record && {
        v: 3,
        id: `${p.room.code ?? 'local'}-${record.config.seed}`,
        createdAt,
        config: record.config,
        seats,
        actions: record.actions,
        ...(p.room.code ? { room: p.room.code } : {}),
      },
    [record, seats, createdAt, p.room.code],
  )
  useEffect(() => {
    if (session) archive(session)
  }, [session])
  const finish = useCallback(() => setFinished(true), [])

  if (v.game.phase.kind === 'ended' && finished) {
    if (replaying && session) return <ReplayScreen session={session} onBack={() => setReplaying(false)} />
    return (
      <ResultScreen
        state={v.game}
        seats={seats}
        {...(session ? { onReplay: () => setReplaying(true) } : {})}
        {...(p.onRematch ? { onRematch: p.onRematch } : {})}
        onHome={p.onExit}
      />
    )
  }
  return (
    <GameScreen
      state={v.game}
      prev={pair.prev}
      lastAction={v.last}
      step={v.step}
      seats={seats}
      localSeats={p.localSeats}
      actors={p.room.actors}
      log={p.room.log}
      {...(p.exitWarning ? { exitWarning: p.exitWarning } : {})}
      onAction={p.onAct}
      onExit={p.onExit}
      error={p.error}
      {...(p.onHold ? { onHold: p.onHold } : {})}
      onFinished={finish}
      connection={p.connection}
      {...(p.botSpeed ? { botSpeed: p.botSpeed } : {})}
      {...(p.onBotSpeed ? { onBotSpeed: p.onBotSpeed } : {})}
      {...(p.onUndo ? { onUndo: p.onUndo } : {})}
    />
  )
}
