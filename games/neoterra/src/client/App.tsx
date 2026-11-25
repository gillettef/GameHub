/**
 * 화면 전환과 게임 연결. 진행은 공통 방·진행 코드(@gamehub/net)가 맡는다:
 * 한 기기 대전은 LocalGame(봇, 돌려 하기, 이어 하기, 되돌리기), 온라인은 useRoom(대기실 → 대국, 재접속).
 * 받은 화면(내 좌석으로 가린 상태)과 행동 전송기는 GameView 가 UI 상태(store/app)에 옮겨 두고, 테이블 부품은 그것을 읽는다.
 */
import type { RoomSnapshot, SeatInfo } from '@gamehub/net'
import { LocalGame, invitedCode, useLocalGame, useRoom, type LocalSave } from '@gamehub/net/client'
import { Button, HomeScreen, Screen, WaitingRoom } from '@gamehub/ui'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { def, type Table as TableState, type View } from '../def'
import type { Action } from '../engine/types'
import { Rules } from './components/Rules'
import { Toast } from './components/Toast'
import { TooltipLayer } from './components/Tooltip'
import { HomeHero } from './pages/Home'
import { Table } from './pages/Table'
import { useApp, type TurnMark } from './store/app'
import { storage, type AiSpeed, type SavedLocal } from './store/storage'

type Local = LocalGame<TableState, Action, View, unknown>

const TITLE = '네오테라'
/** AI 한 행동마다 쉬는 시간(메뉴의 AI 속도) — 화면이 따라가며 무슨 일이 있었는지 볼 틈 */
const AI_DELAY: Record<AiSpeed, number> = { normal: 1400, fast: 500, instant: 80 }
const speedOf = (s: AiSpeed) => def.bot!.delayMs / (AI_DELAY[s] ?? AI_DELAY.normal)

interface LocalRun {
  key: number
  game: Local
}

let runKey = 0

/** 한 기기 게임을 만든다(저장한 판이면 이어서). 지금 규칙으로 이어 둘 수 없는 저장이면 null */
function newLocal(save: Pick<LocalSave<Action>, 'seats'> & Partial<LocalSave<Action>>, key = ++runKey): LocalRun | null {
  try {
    const game: Local = new LocalGame(def, {
      seats: save.seats,
      ...(save.seed !== undefined ? { seed: save.seed } : {}),
      ...(save.history ? { history: save.history } : {}),
      onSave: (s) => {
        const g = game.getState().room.view?.game
        if (!g || g.gameOver) storage.clearLocal()
        else storage.saveLocal({ v: 2, save: s, era: g.era, round: g.round })
      },
    })
    return { key, game }
  } catch {
    return null
  }
}

export function App() {
  const [online, client] = useRoom<View, Action>({ slug: def.slug })
  const [local, setLocal] = useState<LocalRun | null>(null)
  const [saved, setSaved] = useState<SavedLocal | null>(() => storage.loadLocal())
  const [invited, setInvited] = useState(() => invitedCode(location.search))
  const [rules, setRules] = useState(false)

  const home = () => {
    setLocal(null)
    setSaved(storage.loadLocal())
    setInvited(null)
    history.replaceState(null, '', location.pathname)
  }

  let body
  const room = online.room
  if (room?.status === 'lobby') {
    body = (
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
  } else if (room?.view) {
    body = (
      <GameView
        key={`online-${room.code}`}
        mode="online"
        room={room as RoomSnapshot<View>}
        error={online.error}
        connected={online.connection === 'open'}
        onAct={(a) => client.act(a)}
        onExit={() => {
          client.leave()
          home()
        }}
      />
    )
  } else if (local) {
    body = <LocalTable key={local.key} run={local} onReplace={setLocal} onHome={home} />
  } else {
    body = (
      <HomeScreen
        slug={def.slug}
        title={TITLE}
        hero={<HomeHero />}
        top={
          saved && (
            <Button
              tone="primary"
              className="anim-shine"
              onClick={() => {
                const run = newLocal(saved.save)
                if (run) setLocal(run)
                else {
                  storage.clearLocal()
                  setSaved(null)
                }
              }}
            >
              이어 하기 · {saved.era <= 3 ? `${saved.era}시대` : '종료 시대'} {saved.round}라운드
            </Button>
          )
        }
        minSeats={def.minSeats}
        maxSeats={def.maxSeats}
        bots
        invited={invited}
        error={online.error}
        connecting={online.connection !== 'idle'}
        onLocal={(seats: SeatInfo[]) => setLocal(newLocal({ seats }))}
        onCreate={(name, seats, bots) => client.create(name, seats, bots)}
        onJoin={(code, name) => client.join(code, name)}
        onWatch={(code) => client.watch(code)}
      >
        <Button tone="ghost" onClick={() => setRules(true)}>
          게임 설명 보기
        </Button>
      </HomeScreen>
    )
  }
  return (
    <>
      <div className="sky" />
      {body}
      {rules && <Rules onClose={() => setRules(false)} />}
      <Toast />
      <TooltipLayer />
    </>
  )
}

/** 한 기기 게임: AI 속도, 되돌리기, 같은 설정으로 다시 하기, 사람이 여럿이면 돌려 하기 가림막 */
function LocalTable({ run, onReplace, onHome }: { run: LocalRun; onReplace(run: LocalRun | null): void; onHome(): void }) {
  const { game } = run
  const state = useLocalGame(game)
  const room = state.room
  const v = room.view!
  const over = v.game.gameOver
  const aiSpeed = useApp((s) => s.settings.aiSpeed)
  useEffect(() => game.setSpeed(speedOf(aiSpeed)), [game, aiSpeed])

  // 되돌리기: 지금 보는 사람의 마지막 행동이 숨은 정보를 드러내지 않았으면(view.undo) 기록에서 빼고 다시 만든다
  const undo = () => {
    // 누르는 사이 봇이 두었으면 남의 수를 지우지 않게 지금 기록으로 다시 확인한다
    const save = game.save()
    const move = save.history.at(-1)
    if (!move || move.byBot || move.seat !== game.getState().room.you) return
    game.dispose()
    onReplace(newLocal({ ...save, history: save.history.slice(0, -1) }, run.key))
    useApp.getState().showToast('되돌렸습니다')
  }
  const rematch = () => {
    game.dispose()
    onReplace(newLocal({ seats: game.save().seats }))
  }

  // 돌려 하기(사람 여럿): 다른 사람에게 기기를 넘길 때 가림막(손패·시야 밖 퀘스트 칸은 사람마다 다르다)
  const humans = room.seats.filter((s) => s.kind === 'human').length
  const [shownFor, setShownFor] = useState<number | null>(null)
  const viewer = room.you
  const curtain = humans > 1 && !over && viewer !== null && shownFor !== viewer

  return (
    <>
      <div inert={curtain} className="contents">
        <GameView
          mode="local"
          room={room}
          error={state.error}
          connected
          onAct={(a) => game.act(a)}
          onUndo={!over && v.undo > 0 ? undo : undefined}
          onRematch={rematch}
          onExit={onHome}
        />
      </div>
      {curtain && (
        <div className="fixed inset-0 z-[80] bg-bg">
          <Screen
            footer={
              <Button tone="primary" onClick={() => setShownFor(viewer)}>
                {room.seats[viewer]?.name} 화면 보기
              </Button>
            }
          >
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="m-0 text-muted">돌려 하기</p>
              <p className="m-0 text-2xl font-bold">{room.seats[viewer]?.name}에게 기기를 넘겨 주세요</p>
              <p className="m-0 text-sm text-muted">손패와 위성으로 본 퀘스트 칸은 사람마다 다르게 보입니다.</p>
            </div>
          </Screen>
        </div>
      )}
    </>
  )
}

interface GameViewProps {
  mode: 'local' | 'online'
  room: RoomSnapshot<View>
  error: string | null
  connected: boolean
  onAct(a: Action): void
  onUndo?(): void
  onRematch?(): void
  onExit(): void
}

/** 받은 화면을 테이블 UI 상태에 옮기고 테이블을 그린다. 돌려 하기에서 보는 사람이 바뀌면 그 사람의 "지난 차례 이후" 기준을 꺼낸다 */
function GameView({ mode, room, error, connected, onAct, onUndo, onRematch, onExit }: GameViewProps) {
  const v = room.view!
  const me = room.you ?? 0
  const marks = useRef(new Map<number, TurnMark | null>())
  const shownMe = useRef<number | null>(null)

  // 새 판: 지난 판의 요약 대기열·배너·확인 창·차례 표시를 비운다
  useLayoutEffect(() => {
    useApp.getState().set({ notices: [], eraBanner: null, confirm: null, mark: null })
    return () => useApp.getState().set({ game: null, mode: null, send: null, undo: null, canUndo: false, conn: null, watching: false, confirm: null })
  }, [])

  useLayoutEffect(() => {
    const app = useApp.getState()
    let mark = app.mark
    if (shownMe.current !== null && shownMe.current !== me) {
      marks.current.set(shownMe.current, app.mark)
      mark = marks.current.get(me) ?? null
    }
    shownMe.current = me
    app.set({
      mode,
      game: v.game,
      me,
      watching: room.you === null,
      send: onAct,
      conn: mode === 'online' ? (connected ? 'open' : 'closed') : null,
      undo: onUndo ?? null,
      canUndo: !!onUndo,
      mark,
    })
  })

  // 거절된 행동의 이유는 토스트로
  useEffect(() => {
    if (error) useApp.getState().showToast(error)
  }, [error, room.version])

  return <Table key={me} roomCode={room.code} presence={mode === 'online' ? room.seats.map((s) => s.online || s.kind === 'bot') : null} onExit={onExit} {...(onRematch ? { onRematch } : {})} />
}
