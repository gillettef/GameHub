/**
 * 대국 화면 (docs/refactor-plan.md 5절 배치). 한 기기·온라인·관전이 같은 화면을 쓴다.
 *  ① 상태바: 차례·할 일·남은 시간, ≡ 메뉴(점수·진행·타일·설명 탭, 보기 설정, 효과음, 기권, 나가기)
 *  ② 플레이어: 자리 색·점수·내 칸·쉬는 고양이·이번 라운드 일과(작은 그림)·선·대장 방울(다음 선)
 *  ③ 보드: 소문 카드 축소판 + 육각 보드 (공개 단계는 이번 판 명당 공개 화면)
 *  ④ 내 영역: 일과 고르기 줄 · 펼친 타일(가져오기) · 내 타일 · 놓기 확인 바 · 담 넘기 바 · 명당 부르기 바
 *  ⑤ 행동: 확인 / 일과 고르기 / 주머니에서 뽑기 / 취소·놓기 / 담 넘기(한 번 더·끝내기) / 부르기 / 다시 내가 두기 / 결과
 * 받은 상태(RoomSnapshot<View>)는 store 에 넣고, 기존 부품(보드·카드·탭)은 store 를 읽는다.
 */
import type { RoomSnapshot } from '@gamehub/net'
import { Button, GameShell, PlayerStrip, Sheet, type PlayerChip } from '@gamehub/ui'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { fromEngine, playerId, type Action, type View } from '../def'
import { bossSeat, canCallTake, getChore, MOVE_TIMES } from '../engine'
import { GameModal } from './components/GameModal'
import { HandoffOverlay } from './components/HandoffOverlay'
import { TurnEvents } from './components/TurnEvents'
import { TurnTimer } from './components/TurnTimer'
import { TutorialCoach } from './components/TutorialCoach'
import { asState, awaitingConfirm, buildPlayerSummaries, choicePick, choreOf, roundLabel, roundStageLabel, stageDoing } from './game/derived'
import { choreArtUrl } from './game/cardImages'
import { boardHint } from './game/hint'
import { usePlantable } from './game/usePlantable'
import { useGameCues } from './game/useGameCues'
import { isNotifyOn, isSoundOn, notifySupported, setNotifyOn, setSoundOn } from './lib/cues'
import { ResultOverlay } from './pages/ResultOverlay'
import {
  findMe,
  selectCanCall,
  selectCanMove,
  selectCanPickChore,
  selectCanPlant,
  selectCanTake,
  selectIsMyTurn,
  selectSelectedSpecies,
  selectState,
  selectViewerId,
  TABS,
  useGameStore,
  type TabId,
} from './store/gameStore'
import { BoardArea, HandArea } from './tabs/BoardTab'
import { CardsTab } from './tabs/CardsTab'
import { HelpTab } from './tabs/HelpTab'
import { ProgressTab } from './tabs/ProgressTab'
import { StatusTab } from './tabs/StatusTab'

export interface GameViewProps {
  room: RoomSnapshot<View>
  mode: 'hotseat' | 'online'
  /** 마지막으로 거절된 이유(바뀔 때마다 알린다) */
  error: { message: string } | null
  /** 연결이 끊겨 다시 붙는 중 */
  offline?: boolean
  onAct(action: Action): void
  onLeave(): void
  /** 결과 화면의 '새 게임'(한 기기: 같은 구성으로 다시, 온라인: 처음 화면) */
  onNewGame(): void
}

export function GameView({ room, mode, error, offline = false, onAct, onLeave, onNewGame }: GameViewProps) {
  const view = room.view!
  const applyView = useGameStore((s) => s.applyView)

  useEffect(() => {
    const humans = room.seats.filter((s) => s.kind === 'human').length
    const now = Date.now()
    applyView({
      mode,
      state: view.game,
      viewerId: view.me,
      hotseat: mode === 'hotseat' && humans > 1,
      tutorial: view.tutorial,
      room: {
        connected: room.seats.flatMap((s, i) => (s.kind !== 'human' || s.online ? [playerId(i)] : [])),
        autopilot: view.autopilot.map(playerId),
        turnTimeLimitSec: view.turnTime,
        turnDeadline: view.leftMs === null ? null : now + view.leftMs,
        serverNow: now,
      },
    })
  }, [room, view, mode, applyView])

  // 화면 부품은 엔진 행동(playerId 포함)을 낸다. 보낼 때는 좌석이 정하므로 떼고, 고를 때 본 차례 번호를 붙인다
  useEffect(() => {
    useGameStore.getState().setSender((a) => {
      const state = useGameStore.getState().state
      const action = state ? fromEngine(a, state.turn) : null
      if (action) onAct(action)
    })
    return () => useGameStore.getState().setSender(null)
  }, [onAct])

  useEffect(() => {
    if (error) useGameStore.getState().rejected(error.message)
  }, [error])

  // 대국 화면을 떠나면 선택·탭 상태를 비운다(다음 판에 남지 않게)
  useEffect(() => () => useGameStore.getState().reset(), [])

  return <Table room={room} offline={offline} onAct={onAct} onLeave={onLeave} onNewGame={onNewGame} />
}

function Table({ room, offline, onAct, onLeave, onNewGame }: { room: RoomSnapshot<View>; offline: boolean; onAct(a: Action): void; onLeave(): void; onNewGame(): void }) {
  const state = useGameStore(selectState)
  const viewerId = useGameStore(selectViewerId)
  const mode = useGameStore((s) => s.mode)
  const notice = useGameStore((s) => s.notice)
  const clearNotice = useGameStore((s) => s.clearNotice)
  const resultDismissed = useGameStore((s) => s.resultDismissed)
  const handoffPending = useGameStore((s) => s.handoffPending)
  const [menu, setMenu] = useState(false)

  useGameCues()

  // 안내 문구는 잠시 보였다가 사라진다
  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(clearNotice, 4000)
    return () => window.clearTimeout(t)
  }, [notice, clearNotice])

  // 다른 탭을 보고 있어도 탭 제목으로 내 차례를 알 수 있게
  useEffect(() => {
    if (!state || !viewerId) return
    const isMyTurn = state.phase === 'playing' && state.currentPlayerId === viewerId
    document.title = isMyTurn ? '내 차례 · 냥냥 골목' : awaitingConfirm(state, viewerId) ? '확인 대기 · 냥냥 골목' : '냥냥 골목'
  }, [state, viewerId])
  useEffect(
    () => () => {
      document.title = '냥냥 골목'
    },
    [],
  )

  if (!state) return null
  const showResult = state.phase === 'finished' && !resultDismissed
  const absent = mode === 'online' ? state.players.filter((p, i) => p.kind === 'human' && room.seats[i]?.kind === 'human' && !room.seats[i]?.online) : []
  const banner = offline
    ? '서버와 연결이 끊겼습니다. 다시 연결하는 중입니다.'
    : absent.length > 0 && (state.phase === 'playing' || state.phase === 'reveal')
      ? `접속 끊김: ${absent.map((p) => p.nickname).join(', ')}. 돌아오지 않으면 잠시 뒤 봇이 대신 둡니다.`
      : null

  return (
    <>
      <GameShell
        status={<Status />}
        detail={banner ?? <Detail />}
        onMenu={() => setMenu(true)}
        players={<Players onSelect={() => setMenu(true)} />}
        hand={state.phase === 'playing' && viewerId ? <HandArea /> : undefined}
        actions={<Actions room={room} onAct={onAct} onNewGame={onNewGame} />}
        notice={notice}
      >
        <div className="absolute inset-0 px-2 pt-1 pb-1.5">
          <BoardArea />
        </div>
      </GameShell>
      <TurnEvents />
      <TutorialCoach />
      <GameModal />
      {showResult && <ResultOverlay onNewGame={onNewGame} />}
      {mode === 'hotseat' && handoffPending && state.phase === 'playing' && <HandoffOverlay />}
      <Menu open={menu} onClose={() => setMenu(false)} onAct={onAct} onLeave={onLeave} />
    </>
  )
}

/** 내 차례의 할 일 (① 상태바) */
const MY_TURN_TEXT: Record<string, string> = {
  chore: '내 차례 · 일과 고르기',
  take: '내 차례 · 타일 가져오기',
  plant: '내 차례 · 명당 놓기',
  move: '내 차례 · 담 넘기',
  call: '내 차례 · 명당 부르기',
}

/** ① 지금 누구 차례이고 무엇을 해야 하는지 */
function Status() {
  const state = useGameStore(selectState)
  const viewerId = useGameStore(selectViewerId)
  const isMyTurn = useGameStore(selectIsMyTurn)
  if (!state) return null
  let text: string
  if (state.phase === 'finished') text = '게임 종료'
  else if (state.phase === 'reveal') {
    const active = state.players.filter((p) => p.surrenderedOrder === null)
    text = awaitingConfirm(state, viewerId) ? '이번 판 명당 확인' : `확인 기다리는 중 ${active.filter((p) => p.isReady).length}/${active.length}`
  } else if (isMyTurn) text = MY_TURN_TEXT[state.stage] ?? '내 차례'
  else {
    const current = state.players.find((p) => p.id === state.currentPlayerId)
    text = `${current?.nickname ?? ''}의 차례 · ${stageDoing(state.stage)}`
  }
  return (
    <span className="flex items-center gap-2">
      <span className="min-w-0 truncate">{text}</span>
      <TurnTimer />
    </span>
  )
}

/** ① 보조 줄: 내 차례면 할 일, 아니면 라운드·주머니 */
function Detail() {
  const state = useGameStore(selectState)
  const isMyTurn = useGameStore(selectIsMyTurn)
  const store = useGameStore()
  const { plantable } = usePlantable()
  if (!state) return null
  if (state.phase === 'reveal') return <>이번 판에 나오는 명당과 소문 카드를 보고 확인하세요</>
  const info = state.phase === 'playing' ? `${roundStageLabel(state)} · 주머니 ${state.pileCount}개` : '결과는 ≡ 메뉴 → 점수에서 다시 볼 수 있습니다'
  if (state.phase === 'playing' && isMyTurn) {
    return (
      <>
        {roundLabel(state)} · {boardHint(store, plantable)}
      </>
    )
  }
  return <>{info}</>
}

/** ② 자리별 요약. 누르면 메뉴(점수 탭)를 연다 */
function Players({ onSelect }: { onSelect(): void }) {
  const state = useGameStore(selectState)
  const viewerId = useGameStore(selectViewerId)
  const autopilot = useGameStore((s) => s.room?.autopilot)
  const connected = useGameStore((s) => s.room?.connected)
  const setTab = useGameStore((s) => s.setTab)
  const rows = useMemo(() => (state ? buildPlayerSummaries(state) : []), [state])
  if (!state) return null
  const boss = state.phase === 'playing' ? bossSeat(state) : null
  const chips: PlayerChip[] = rows.map((r) => {
    const ready = state.players.find((p) => p.id === r.id)?.isReady ?? false
    const chore = state.phase === 'playing' ? (state.chores[r.seat] ?? null) : null
    const tags = [
      state.phase === 'playing' && r.seat === state.roundStart && !r.surrendered ? '선' : null,
      boss === r.seat ? '다음 선' : null,
      r.kind === 'ai' ? 'AI' : autopilot?.includes(r.id) ? 'AI 대리' : null,
      r.surrendered ? '기권' : state.phase === 'reveal' ? (ready ? '확인함' : '확인 전') : null,
    ].filter(Boolean)
    return {
      id: r.seat,
      name: r.nickname,
      color: `var(--color-seat-${r.seat})`,
      score: `${r.score?.total ?? 0}`,
      // 칩이 좁아 무리 이름은 자리 색 점으로 대신하고(점수 탭·결과에 이름), 쉬는 고양이는 줄여 쓴다
      // 이번 라운드에 고른 일과는 작은 그림으로 맨 앞에(이름은 그림의 대체 글자·점수 탭)
      detail: (
        <>
          {chore && <img className="mr-1 inline-block h-3.5 w-5 rounded-sm align-[-2px]" src={choreArtUrl(chore)} alt={getChore(chore).name} title={getChore(chore).name} />}
          {[`칸 ${r.score?.land ?? 0}`, r.rootsLeft !== null ? `쉬는 ${r.rootsLeft}` : null, ...tags].filter(Boolean).join(' · ')}
        </>
      ),
      active: r.isCurrent,
      you: r.id === viewerId,
      offline: r.kind === 'human' && connected !== undefined && !connected.includes(r.id),
    }
  })
  return (
    <PlayerStrip
      players={chips}
      onSelect={() => {
        setTab('status')
        onSelect()
      }}
    />
  )
}

/** ⑤ 지금 할 수 있는 행동 */
function Actions({ room, onAct, onNewGame }: { room: RoomSnapshot<View>; onAct(a: Action): void; onNewGame(): void }) {
  const state = useGameStore(selectState)
  const viewerId = useGameStore(selectViewerId)
  const mode = useGameStore((s) => s.mode)
  const sending = useGameStore((s) => s.sending)
  const autopilot = useGameStore((s) => s.room?.autopilot)
  const canTake = useGameStore(selectCanTake)
  const canPlant = useGameStore(selectCanPlant)
  const canPickChore = useGameStore(selectCanPickChore)
  const canMove = useGameStore(selectCanMove)
  const canCall = useGameStore(selectCanCall)
  const species = useGameStore(selectSelectedSpecies)
  const pendingPos = useGameStore((s) => s.pendingPos)
  const pendingChore = useGameStore((s) => s.pendingChore)
  const confirmChore = useGameStore((s) => s.confirmChore)
  const moveSteps = useGameStore((s) => s.moveSteps)
  const moveFrom = useGameStore((s) => s.moveFrom)
  const moveTo = useGameStore((s) => s.moveTo)
  const moveAgain = useGameStore((s) => s.moveAgain)
  const confirmMove = useGameStore((s) => s.confirmMove)
  const cancelMove = useGameStore((s) => s.cancelMove)
  const callPos = useGameStore((s) => s.callPos)
  const callTake = useGameStore((s) => s.callTake)
  const confirmCall = useGameStore((s) => s.confirmCall)
  const cancelCall = useGameStore((s) => s.cancelCall)
  const seedPicking = useGameStore((s) => s.seedPicking)
  const resultDismissed = useGameStore((s) => s.resultDismissed)
  const confirmReveal = useGameStore((s) => s.confirmReveal)
  const confirmPlant = useGameStore((s) => s.confirmPlant)
  const cancelPlant = useGameStore((s) => s.cancelPlant)
  const openCardModal = useGameStore((s) => s.openCardModal)
  const showResult = () => useGameStore.setState({ resultDismissed: false })
  if (!state) return null
  const wait = (text: ReactNode) => <p className="m-0 flex items-center justify-center text-center text-sm text-muted">{text}</p>
  const me = findMe(state, viewerId)

  if (state.phase === 'finished') {
    return (
      <>
        {resultDismissed && <Button onClick={showResult}>결과 보기</Button>}
        <Button tone="primary" onClick={onNewGame}>
          새 게임
        </Button>
      </>
    )
  }
  if (!viewerId || !me) return wait(room.you === null ? '관전 중입니다' : '')
  if (me.surrenderedOrder !== null) return wait('기권했습니다. 판이 끝날 때까지 지켜볼 수 있습니다')
  if (autopilot?.includes(viewerId)) {
    return (
      <Button tone="primary" onClick={() => onAct({ type: 'RESUME' })}>
        다시 내가 두기
      </Button>
    )
  }
  if (state.phase === 'reveal') {
    if (!awaitingConfirm(state, viewerId)) return wait('다른 사람을 기다리는 중')
    return (
      <Button tone="primary" disabled={sending} onClick={confirmReveal}>
        {mode === 'hotseat' ? '확인하고 시작' : '확인'}
      </Button>
    )
  }
  if (canPickChore) {
    return (
      <Button tone="primary" disabled={sending || !pendingChore} onClick={confirmChore}>
        {pendingChore ? `「${getChore(pendingChore).name}」 고르기` : '일과를 누르세요'}
      </Button>
    )
  }
  if (canMove) {
    const current = moveFrom && moveTo ? 1 : 0
    const total = moveSteps.length + current
    if (total === 0 && !moveFrom) return wait('고양이를 옮길 내 칸(빛나는 칸)을 누르세요')
    return (
      <>
        <Button onClick={cancelMove}>취소</Button>
        {current > 0 && moveSteps.length + 1 < MOVE_TIMES && <Button onClick={moveAgain}>한 번 더 옮기기</Button>}
        <Button tone="primary" disabled={sending || total === 0} onClick={confirmMove}>
          이대로 끝내기
        </Button>
      </>
    )
  }
  if (canCall) {
    if (!callPos) return wait('부를 명당(빛나는 칸)을 누르세요')
    const mustTake = canCallTake(asState(state), viewerId)
    return (
      <>
        <Button onClick={cancelCall}>취소</Button>
        <Button tone="primary" disabled={sending || (mustTake && callTake === null)} onClick={confirmCall}>
          부르기
        </Button>
      </>
    )
  }
  if (canTake) {
    // 생선 냄새 차례에는 주머니 대신 펼친 타일 3개 중에서 가져온다
    if (choreOf(state, viewerId) === 'peek') return wait(state.peek ? '펼친 타일 3개 중 1개를 누르세요' : '펼친 타일에서 고르세요')
    return state.pileCount > 0 ? (
      <Button onClick={() => openCardModal({ kind: 'pile' })}>주머니에서 1개</Button>
    ) : (
      wait('펼친 타일에서 고르세요')
    )
  }
  if (canPlant && species && pendingPos) {
    return (
      <>
        <Button onClick={cancelPlant}>취소</Button>
        <Button tone="primary" disabled={sending || seedPicking} onClick={confirmPlant}>
          놓기
        </Button>
      </>
    )
  }
  if (canPlant) return wait('내 타일을 눌러 고르세요')
  if (state.stage === 'chore') return wait(`일과 고르는 중 · ${choicePick(state)}번째 선택`)
  return wait(<>상대가 두는 중 · 기다려 주세요</>)
}

/** ≡ 메뉴: 점수·진행·타일·설명 탭, 보기 설정, 효과음·알림, 기권·나가기 */
function Menu({ open, onClose, onAct, onLeave }: { open: boolean; onClose(): void; onAct(a: Action): void; onLeave(): void }) {
  const state = useGameStore(selectState)
  const viewerId = useGameStore(selectViewerId)
  const mode = useGameStore((s) => s.mode)
  const tab = useGameStore((s) => s.tab)
  const setTab = useGameStore((s) => s.setTab)
  const showRootCounts = useGameStore((s) => s.showRootCounts)
  const toggleRootCounts = useGameStore((s) => s.toggleRootCounts)
  const showLabels = useGameStore((s) => s.showLabels)
  const toggleLabels = useGameStore((s) => s.toggleLabels)
  const setNotice = useGameStore((s) => s.setNotice)
  const [confirm, setConfirm] = useState<'quit' | 'surrender' | null>(null)
  const [sound, setSound] = useState(isSoundOn)
  const [notify, setNotify] = useState(isNotifyOn)
  const current: TabId = tab === 'board' ? 'status' : tab
  const me = findMe(state, viewerId)
  // 기권은 내 차례(공개 단계는 확인 전)에만 보낼 수 있다(공통 진행: 행동할 좌석만 행동한다)
  const canSurrender =
    !!me &&
    me.surrenderedOrder === null &&
    ((state?.phase === 'playing' && state.currentPlayerId === viewerId) || (state?.phase === 'reveal' && awaitingConfirm(state, viewerId)))
  const close = () => {
    setConfirm(null)
    onClose()
  }

  return (
    <Sheet open={open} title="메뉴" onClose={close}>
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-bg p-1" role="tablist" aria-label="보기">
        {TABS.filter((t) => t.id !== 'board').map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={current === t.id}
            className={`min-h-11 rounded-lg ${current === t.id ? 'bg-raised font-bold' : 'text-muted'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mb-4">
        {current === 'status' && <StatusTab />}
        {current === 'progress' && <ProgressTab />}
        {current === 'cards' && <CardsTab />}
        {current === 'help' && <HelpTab />}
      </div>

      <h3 className="mt-0 mb-2 text-sm text-muted">설정</h3>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Toggle on={showRootCounts} onClick={toggleRootCounts}>
          칸마다 고양이 수
        </Toggle>
        <Toggle on={showLabels} onClick={toggleLabels}>
          칸 이름(C4)
        </Toggle>
        <Toggle
          on={sound}
          onClick={() => {
            setSoundOn(!sound)
            setSound(!sound)
          }}
        >
          효과음
        </Toggle>
        {mode === 'online' && notifySupported() && (
          <Toggle
            on={notify}
            onClick={() => {
              void setNotifyOn(!notify).then((on) => {
                setNotify(on)
                if (!notify && !on) setNotice('브라우저 설정에서 이 사이트의 알림을 허용하세요')
              })
            }}
          >
            차례 알림
          </Toggle>
        )}
      </div>

      {confirm === null ? (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Button onClick={() => setConfirm('quit')}>나가기</Button>
          <Button tone="danger" disabled={!canSurrender} onClick={() => setConfirm('surrender')}>
            기권
          </Button>
        </div>
      ) : (
        <div className="mb-3 rounded-xl bg-raised p-3">
          <p className="mt-0 mb-2 text-sm">
            {confirm === 'quit'
              ? mode === 'hotseat'
                ? '나가도 처음 화면의 "이어 하기"로 돌아올 수 있습니다.'
                : '게임 중에 나가면 내 자리는 봇이 이어서 두고, 다시 들어올 수 없습니다.'
              : '기권하면 순위 맨 아래로 확정됩니다. 놓아 둔 명당은 보드에 남습니다.'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setConfirm(null)}>취소</Button>
            <Button
              tone={confirm === 'surrender' ? 'danger' : 'primary'}
              onClick={() => {
                const c = confirm
                close()
                if (c === 'quit') onLeave()
                else onAct({ type: 'SURRENDER' })
              }}
            >
              {confirm === 'quit' ? '나가기' : '기권하기'}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

function Toggle({ on, onClick, children }: { on: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`min-h-11 rounded-xl border-2 px-3 text-sm ${on ? 'border-primary bg-raised font-bold' : 'border-transparent bg-raised text-muted'}`}
      onClick={onClick}
    >
      {children} {on ? '켜짐' : '꺼짐'}
    </button>
  )
}
