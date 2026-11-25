// 화면 전환: 처음 → 한 기기(나 vs 봇, 두 사람, 봇끼리 관전) / 온라인(대기실 → 대국, 관전, 새로고침 복귀)
// 이어 하기: 끝나지 않은 한 기기 판은 기기에 저장한다(LocalSave). 바로 시작 링크: ?play (나 vs 봇), ?room=ABCD (온라인 초대)
import type { SeatInfo } from '@gamehub/net'
import { LocalGame, invitedCode, useLocalGame, useRoom, type LocalSave } from '@gamehub/net/client'
import { Button, HomeScreen, Sheet, WaitingRoom } from '@gamehub/ui'
import { useCallback, useState } from 'react'
import { def, type Action, type Table as TableState, type View } from '../def'
import { score } from '../engine/rules'
import { HeroEmblem } from './icons'
import { RulesText } from './RulesText'
import { Table } from './Table'
import { THEME_LABEL, useTheme, type ThemePref } from './theme'

type Local = LocalGame<TableState, Action, View, unknown>

const TITLE = '유세 대작전'
const SAVE_KEY = 'election:current'

interface Saved {
  v: 1
  save: LocalSave<Action>
  /** 처음 화면의 이어 하기 버튼에 보일 한 줄 */
  summary: string
}

function loadSaved(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as Saved | null
    return s && s.v === 1 && Array.isArray(s.save?.history) ? s : null
  } catch {
    return null
  }
}

function writeSaved(s: Saved | null): void {
  try {
    if (s) localStorage.setItem(SAVE_KEY, JSON.stringify(s))
    else localStorage.removeItem(SAVE_KEY)
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 저장 없이 진행
  }
}

interface Run {
  key: number
  game: Local
}

let runKey = 0

/** 한 기기 판을 만든다(저장한 판이면 이어서). 저장한 판을 지금 규칙으로 이어 둘 수 없으면 null */
function newLocal(save: Pick<LocalSave<Action>, 'seats'> & Partial<LocalSave<Action>>): Run | null {
  try {
    const humans = save.seats.some((s) => s.kind === 'human')
    const game: Local = new LocalGame(def, {
      seats: save.seats,
      ...(save.seed !== undefined ? { seed: save.seed } : {}),
      ...(save.history ? { history: save.history } : {}),
      // 사람이 있는 판만 이어 하기로 남긴다. 끝난 판은 지운다
      onSave: (s) => {
        if (!humans) return
        const g = game.getState().room.view?.game
        if (!g || g.phase === 'over') return writeSaved(null)
        const [b, r] = score(g)
        writeSaved({ v: 1, save: s, summary: g.phase === 'setup' ? '사전 배치 중' : `파랑 ${b} : ${r} 빨강` })
      },
    })
    return { key: ++runKey, game }
  } catch {
    return null
  }
}

const vsBot = (): SeatInfo[] => [
  { kind: 'human', name: '나' },
  { kind: 'bot', name: '봇' },
]

const NEXT_THEME: Record<ThemePref, ThemePref> = { auto: 'light', light: 'dark', dark: 'auto' }

export function App() {
  const [online, client] = useRoom<View, Action>({ slug: def.slug })
  const [theme, setTheme] = useTheme()
  const [run, setRun] = useState<Run | null>(() => (new URLSearchParams(location.search).has('play') ? newLocal({ seats: vsBot() }) : null))
  const [saved, setSaved] = useState<Saved | null>(loadSaved)
  const [invited, setInvited] = useState(() => invitedCode(location.search))
  const [rules, setRules] = useState(false)

  const home = () => {
    setRun(null)
    setSaved(loadSaved())
    setInvited(null)
    history.replaceState(null, '', location.pathname)
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
        room={room as typeof room & { view: View }}
        error={online.connection === 'reconnecting' ? '다시 접속하는 중입니다…' : online.error}
        onAct={(a) => client.act(a)}
        onLeave={leaveOnline}
        theme={theme}
        onTheme={setTheme}
      />
    )
  }
  if (run) {
    return (
      <LocalTable
        key={run.key}
        game={run.game}
        again={() => {
          const save = run.game.save()
          writeSaved(null)
          setRun(newLocal({ seats: save.seats }))
        }}
        onLeave={home}
        theme={theme}
        onTheme={setTheme}
      />
    )
  }

  const start = (seats: SeatInfo[]) => {
    writeSaved(null)
    setRun(newLocal({ seats }))
  }
  return (
    <>
      <HomeScreen
        slug={def.slug}
        title={TITLE}
        hero={
          <div className="el-hero">
            <HeroEmblem />
            <span className="el-hero-kicker">대통령 선거 만칼라</span>
            <h1 className="el-hero-title el-disp">{TITLE}</h1>
            <p className="el-hero-intro">유세 버스로 여섯 권역을 돌며 지지자를 내려놓으세요. 포화 권역이 4곳이 되면 선거일입니다.</p>
          </div>
        }
        top={
          saved && (
            <Button
              tone="primary"
              onClick={() => {
                const r = newLocal(saved.save)
                if (r) setRun(r)
                else {
                  writeSaved(null)
                  setSaved(null)
                }
              }}
            >
              이어 하기 · {saved.summary}
            </Button>
          )
        }
        minSeats={def.minSeats}
        maxSeats={def.maxSeats}
        bots
        invited={invited}
        error={online.error}
        connecting={online.connection !== 'idle'}
        onLocal={start}
        onCreate={(name, seats, bots) => client.create(name, seats, bots)}
        onJoin={(code, name) => client.join(code, name)}
        onWatch={(code) => client.watch(code)}
      >
        <Button onClick={() => setRules(true)}>게임 방법</Button>
        <Button onClick={() => setTheme(NEXT_THEME[theme])}>화면 테마: {THEME_LABEL[theme]}</Button>
        <p className="m-0 text-center text-sm text-muted">2인 · 선공·후공은 추첨으로 정해요</p>
      </HomeScreen>
      <Sheet open={rules} title="게임 방법" onClose={() => setRules(false)}>
        <RulesText />
      </Sheet>
    </>
  )
}

function LocalTable({ game, again, onLeave, theme, onTheme }: { game: Local; again(): void; onLeave(): void; theme: ThemePref; onTheme(t: ThemePref): void }) {
  const state = useLocalGame(game)
  // 봇끼리 관전의 일시정지와 연출 중 기다림을 함께 LocalGame 에 알린다
  const [paused, setPausedRaw] = useState(false)
  const [busy, setBusy] = useState(false)
  const setPaused = (p: boolean) => {
    setPausedRaw(p)
    game.setPaused(p || busy)
  }
  const hold = useCallback(
    (b: boolean) => {
      setBusy(b)
      game.setPaused(b || paused)
    },
    [game, paused],
  )
  return (
    <Table
      room={state.room as typeof state.room & { view: View }}
      error={state.error}
      onAct={(a) => game.act(a)}
      onLeave={onLeave}
      theme={theme}
      onTheme={onTheme}
      local={{ paused, setPaused, hold, again }}
    />
  )
}
