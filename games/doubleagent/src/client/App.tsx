// 화면 전환: 처음 → 한 기기(AI 대전·돌려 하기) / 온라인(대기실 → 대국, 관전)
// 초대 링크: ?room=ABCD. 한 기기 판은 행동 기록을 저장해 두고 처음 화면의 '이어 하기'로 돌아온다(옛 화면과 같다).
import type { SeatInfo } from '@gamehub/net'
import { LocalGame, invitedCode, useLocalGame, useRoom, type LocalSave } from '@gamehub/net/client'
import { Button, HomeScreen, Screen, Sheet, WaitingRoom } from '@gamehub/ui'
import { useMemo, useState } from 'react'
import { def, parseOptions, type Action, type Options, type Table as TableState, type View } from '../def'
import { MAX_AGENTS, TOTAL_ROUNDS } from '../engine'
import { money } from './format'
import { RulesText } from './RulesText'
import { loadStats, store } from './store'
import { Table } from './Table'

type Local = LocalGame<TableState, Action, View, Options>
type Route = { name: 'home' } | { name: 'local'; key: number; seats: SeatInfo[]; options: Options; game: Local }

const TITLE = '더블 에이전트'
const SAVE = 'local'
const AI_NAMES = ['AI 알파', 'AI 브라보', 'AI 찰리']

/** 봇 자리에 AI 이름을 붙인다(옛 화면과 같다) */
function withBotNames(seats: SeatInfo[]): SeatInfo[] {
  let k = 0
  return seats.map((s) => (s.kind === 'bot' ? { ...s, name: AI_NAMES[k++] ?? `AI ${k}` } : s))
}

let localKey = 0
function localRoute(seats: SeatInfo[], options: Options, save?: LocalSave<Action>): Extract<Route, { name: 'local' }> {
  const game: Local = new LocalGame(def, {
    seats,
    options,
    ...(save ? { seed: save.seed, history: save.history } : {}),
    onSave: (s) => store.set(SAVE, s),
  })
  return { name: 'local', key: ++localKey, seats, options, game }
}

/** 저장한 한 기기 판(끝나지 않은 것). 형식이 틀리거나 지금 규칙으로 둘 수 없으면 버린다 */
function savedLocal(): LocalSave<Action> | null {
  const save = store.get<LocalSave<Action> | null>(SAVE, null)
  if (!save || !Array.isArray(save.seats) || !Array.isArray(save.history) || typeof save.seed !== 'number') return null
  return save
}

function restoreLocal(save: LocalSave<Action>): Extract<Route, { name: 'local' }> | null {
  try {
    const route = localRoute(save.seats, parseOptions(save.options), save)
    if (route.game.getState().room.status === 'over') throw new Error('끝난 판')
    return route
  } catch {
    store.set(SAVE, null)
    return null
  }
}

export function App() {
  const [online, client] = useRoom<View, Action>({ slug: def.slug })
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const [invited, setInvited] = useState(() => invitedCode(location.search))
  const [rules, setRules] = useState(false)
  const [level, setLevelRaw] = useState<Options['level']>(() => (store.get<string>('level', 'normal') === 'easy' ? 'easy' : 'normal'))
  const setLevel = (l: Options['level']) => {
    setLevelRaw(l)
    store.set('level', l)
  }

  const home = () => {
    setInvited(null)
    history.replaceState(null, '', location.pathname)
    setRoute({ name: 'home' })
  }
  // 처음 화면으로 돌아올 때마다 저장한 판을 다시 읽는다(만들기만 하고 시작하지 않으므로 봇이 움직이지 않는다)
  const resumable = useMemo(() => {
    void route
    const save = savedLocal()
    return save ? restoreLocal(save) : null
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
      <Table
        key={`online-${room.code}`}
        room={room}
        error={online.connection === 'reconnecting' ? '다시 접속하는 중입니다…' : online.error}
        recordSeat={room.you}
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
        again={() => setRoute(localRoute(route.seats, route.options))}
        onLeave={home}
        onEnd={() => {
          store.set(SAVE, null)
          home()
        }}
      />
    )
  }

  const resume = route.name === 'home' ? resumable : null
  const stats = loadStats()
  const rate = stats.games ? Math.round((stats.wins / stats.games) * 100) : 0

  return (
    <>
      <HomeScreen
        slug={def.slug}
        title={TITLE}
        hero={<Hero />}
        top={
          resume ? (
            <Button tone="primary" onClick={() => setRoute(resume)}>
              진행 중인 게임 이어 하기 (라운드 {resume.game.getState().room.view?.game.round ?? 1}/{TOTAL_ROUNDS})
            </Button>
          ) : undefined
        }
        setup={
          <div>
            <span className="mb-1 block text-sm text-muted">봇(AI) 난이도</span>
            <div className="flex gap-1.5">
              {(['easy', 'normal'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={level === l}
                  className={`min-h-11 flex-1 rounded-lg border-2 bg-surface ${level === l ? 'border-primary font-bold' : 'border-transparent'}`}
                  onClick={() => setLevel(l)}
                >
                  {l === 'easy' ? '쉬움' : '보통'}
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
          store.set(SAVE, null)
          setRoute(localRoute(withBotNames(seats), { level }))
        }}
        onCreate={(name, seats, bots) => client.create(name, seats, bots, { level })}
        onJoin={(code, name) => client.join(code, name)}
        onWatch={(code) => client.watch(code)}
      >
        <Button onClick={() => setRules(true)}>게임 규칙</Button>
        <section className="rounded-xl bg-surface p-3" aria-label="내 전적">
          <h3 className="mt-0 mb-2 text-sm text-muted">내 전적</h3>
          <div className="grid grid-cols-4 gap-1 text-center">
            {[
              ['플레이', String(stats.games)],
              ['승리', String(stats.wins)],
              ['승률', `${rate}%`],
              ['누적', money(stats.total)],
            ].map(([k, val]) => (
              <div key={k}>
                <small className="block text-xs text-muted">{k}</small>
                <b className="text-lg tabular-nums">{val}</b>
              </div>
            ))}
          </div>
          {stats.history.length > 0 && (
            <ul className="mt-2 mb-0 list-none p-0 text-sm">
              {stats.history.map((h, k) => (
                <li key={k} className="flex justify-between gap-2 border-t border-line py-1.5">
                  <span>
                    {h.rank === 1 ? '🏆 1위' : `${h.rank}위`} · {h.agents}인전
                  </span>
                  <span className="text-muted">{new Date(h.at).toLocaleDateString('ko-KR')}</span>
                  <b>{money(h.score)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="text-center text-sm text-muted">
          3~{MAX_AGENTS}명 · {TOTAL_ROUNDS}라운드 · 사람이 둘 이상이면 한 기기를 돌려 가며, 차례마다 가림 화면이 나옵니다
        </p>
      </HomeScreen>
      <Sheet open={rules} title="게임 규칙" onClose={() => setRules(false)}>
        <RulesText />
      </Sheet>
    </>
  )
}

function Hero() {
  return (
    <div className="mt-1 mb-1 rounded-2xl border border-line bg-surface px-4 py-4">
      <span className="da-stamp">CLASSIFIED</span>
      <h1 className="mt-2 mb-1 text-3xl font-black">
        에이전트의 <em className="text-primary not-italic">전쟁</em>
      </h1>
      <p className="m-0 text-sm text-muted">
        <b className="text-text">더블 에이전트</b> · 선수 계약을 중개해 수수료를 벌면서, 남몰래 받은 목표 카드의 주문을 채우세요. 눈치채이면 가로채입니다.
      </p>
    </div>
  )
}

/**
 * 한 기기 대국. 사람이 둘 이상이면(돌려 하기) 제안을 쓸 사람이 바뀔 때 화면을 가린다:
 * 목표 카드와 쓰던 제안은 사람마다 비밀이므로, 넘겨받은 사람이 누르기 전에는 보여 주지 않는다.
 * 결과 화면의 '다음'은 한 번만 누르면 된다(옛 한 기기 화면과 같다): 사람 자리마다 차례로 준비를 낸다.
 */
function LocalTable({ game, again, onLeave, onEnd }: { game: Local; again(): void; onLeave(): void; onEnd(): void }) {
  const state = useLocalGame(game)
  const room = state.room
  const v = room.view!
  const humans = room.seats.filter((s) => s.kind === 'human').length
  const hotseat = humans > 1
  const [shown, setShown] = useState<string | null>(null)
  const coverKey = `${v.game.round}:${room.you}`
  const cover = hotseat && room.status === 'playing' && v.game.phase === 'bid' && room.you !== null && room.actors.includes(room.you) && shown !== coverKey

  const act = (a: Action) => {
    if (a.type !== 'ready') return game.act(a)
    for (let k = 0; k < 6; k++) {
      const r = game.getState().room
      if (r.status !== 'playing' || r.view?.game.phase !== 'result' || r.you === null || !r.actors.includes(r.you)) break
      game.act({ type: 'ready', round: r.view.game.round })
    }
  }

  if (cover) {
    const name = room.seats[room.you!]!.name
    return (
      <Screen
        footer={
          <>
            <Button tone="primary" onClick={() => setShown(coverKey)}>
              제가 {name}입니다 · 시작
            </Button>
            <Button tone="ghost" onClick={onLeave}>
              나가기
            </Button>
          </>
        }
      >
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <span className="da-stamp">EYES ONLY</span>
          <p className="m-0 text-sm text-muted">라운드 {v.game.round} · 1·2차 협상</p>
          <p className="m-0 text-3xl font-extrabold">{name} 님 차례</p>
          <p className="m-0 max-w-[30ch] text-sm text-muted">
            기기를 {name} 님에게 넘겨주세요.
            <br />
            다른 사람은 화면을 보지 마세요.
          </p>
        </div>
      </Screen>
    )
  }
  return (
    <Table
      room={room}
      error={state.error}
      recordSeat={room.seats[0]?.kind === 'human' ? 0 : null}
      onAct={act}
      onLeave={room.status === 'over' ? onEnd : onLeave}
      local={{ again, hotseat }}
    />
  )
}
