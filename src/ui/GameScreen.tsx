import { useEffect, useMemo, useState } from 'react'
import {
  findTop,
  getLegalActions,
  legalPlacements,
  LAWS,
  PERSONAL_GOAL_POINTS,
  PERSONAL_GOALS,
  rollTargets,
  sideFaces,
  TURNS_PER_ROUND,
  turnOrder,
  type Action,
  type Cell,
  type Face,
  type GameState,
  type PersonalGoalId,
  type RolledDie,
  type TipDirection,
} from '../engine'
import type { Seat } from '../app/session'
import { BoardView, type FreshDie } from './BoardView'
import { CardsSheet } from './CardsSheet'
import { colorLabel, faceLabel, ROUND_INFO, seatColor } from './colors'
import { Die3D } from './Die3D'
import { DieFace, GlyphText, Hourglass } from './DieFace'
import { diffEvents, liveScore, type FxEvent } from './fx'
import { FxLayer } from './FxLayer'
import { MarketView } from './MarketView'
import { NoticeModal } from './NoticeModal'
import { buildNotices, type Notice } from './notices'
import { DieNet, PillarSheet } from './PillarSheet'
import { Avatar, Button, ConfirmButton, GameCard, Panel, Screen, TopBar } from './primitives'

interface GameScreenProps {
  state: GameState
  /** 직전 행동 전 상태 (연출용) */
  prev: GameState | null
  lastAction: Action | null
  /** 지금까지의 행동 수. 연출 레이어를 행동마다 새로 띄우는 key */
  step: number
  seats: Seat[]
  /** 이 기기가 조작하는 자리 */
  localSeats: number[]
  onAction: (action: Action) => void
  onExit: () => void
  /** 바로 전 행동이 거절된 이유 */
  error: string | null
  /** 확인할 알림 모달이 떠 있는지 알린다 (떠 있는 동안 봇이 기다린다) */
  onHold?: (hold: boolean) => void
  /** 게임이 끝나고 남은 알림을 모두 확인했을 때 (결과 화면으로) */
  onFinished?: () => void
}

const DIRECTION_LABEL: Record<TipDirection, string> = { forward: '앞(아래)', back: '뒤(위)', left: '왼쪽', right: '오른쪽' }
const DIRECTION_ARROW: Record<TipDirection, string> = { forward: '↓', back: '↑', left: '←', right: '→' }

/** 개인 목표를 아직 고르지 않은, 이 기기의 사람 자리 */
function pendingChooser(state: GameState, seats: Seat[], localSeats: number[]): number | null {
  if (state.phase.kind !== 'setup') return null
  const p = state.players.find((pl) => pl.personalGoal === null && localSeats.includes(pl.id) && seats[pl.id]?.kind === 'human')
  return p ? p.id : null
}

/** 차례 안에서만 유지하는 선택 상태. 차례가 바뀌면(key가 달라지면) 처음 값으로 본다 */
interface TurnUi {
  key: string
  selectedDie: number | null
  front: Face | null
  selectedTime: number | null
  rerollMode: boolean
  viewing: number | null
}

/** 화면 읽기용 한 줄 요약 (연출 레이어는 aria-hidden) */
function fxSummary(events: FxEvent[], seats: Seat[]): string {
  const name = (p: number) => seats[p]?.name ?? `${p + 1}번`
  return events
    .map((e) => {
      switch (e.kind) {
        case 'round':
          return `${e.round}라운드 ${ROUND_INFO[e.round - 1]?.name} 시작.`
        case 'turn':
          return `${name(e.player)} 차례.`
        case 'goal':
          return `${name(e.player)}, ${e.name} ${e.first ? '선착' : '달성'} ${e.points}점.`
        case 'debris':
          return `${name(e.player)}, 잔해 ${e.count}개.`
        case 'plane':
          return `${name(e.player)}, 평면 점수 ${e.points}점 확정.`
      }
    })
    .join(' ')
}

const freshUi = (key: string): TurnUi => ({ key, selectedDie: null, front: null, selectedTime: null, rerollMode: false, viewing: null })

export function GameScreen({ state, prev, lastAction, step, seats, localSeats, onAction, onExit, error, onHold, onFinished }: GameScreenProps) {
  const humanLocal = localSeats.filter((s) => seats[s]?.kind === 'human')
  const chooser = pendingChooser(state, seats, localSeats)
  /** 지금 이 기기에서 조작하는 사람 */
  const actor =
    state.phase.kind === 'setup'
      ? chooser
      : state.phase.kind === 'round' && humanLocal.includes(state.currentPlayer)
        ? state.currentPlayer
        : null

  // 핫시트: 다른 사람에게 기기를 넘길 때 가림막을 보인다 (개인 목표 비공개)
  const [revealedFor, setRevealedFor] = useState<number | null>(null)
  const needsPass = actor !== null && humanLocal.length > 1 && revealedFor !== actor

  const turnKey = `${state.phase.kind}-${state.currentPlayer}-${state.turn.circuit}-${state.turn.picks}`
  const [uiState, setUiState] = useState<TurnUi>(() => freshUi(turnKey))
  const ui = uiState.key === turnKey ? uiState : freshUi(turnKey)
  const patch = (p: Partial<TurnUi>) => setUiState({ ...ui, ...p })

  const [sheet, setSheet] = useState<{ kind: 'cards' } | { kind: 'pillar'; player: number; cell: Cell } | null>(null)
  const events = useMemo(() => diffEvents(prev, state), [prev, state])

  // 확인할 알림: 마지막으로 본 상태와 비교해 묶음으로 쌓고, 「확인」을 누를 때마다 한 묶음씩 넘긴다.
  // 행동 여러 개가 한꺼번에 들어와도(온라인) 놓치지 않게 직전 행동이 아니라 마지막으로 본 상태와 비교한다
  const [seen, setSeen] = useState(state)
  const [batches, setBatches] = useState<Notice[][]>([])
  /**
   * 잔해는 이 기기 사람이 남의 손으로(강제로) 얻었을 때만 모달로 묻는다.
   * 스스로 버리기를 두 번 눌러 만든 잔해와 봇·원격 플레이어의 잔해는 짧은 팝업으로만 보인다
   */
  const quietDebris = (player: number) =>
    !humanLocal.includes(player) || (!!lastAction && (lastAction.type === 'discard' || lastAction.type === 'scrap') && lastAction.player === player)
  if (seen !== state) {
    setSeen(state)
    const batch = seen.config.seed === state.config.seed ? buildNotices(diffEvents(seen, state), state, quietDebris) : []
    setBatches(seen.config.seed === state.config.seed ? (batch.length > 0 ? [...batches, batch] : batches) : [])
  }
  const batch = batches[0]
  const holding = batches.length > 0
  useEffect(() => {
    onHold?.(holding)
  }, [onHold, holding])
  useEffect(() => () => onHold?.(false), [onHold])
  // 게임이 끝나면 마지막 알림까지 확인한 뒤 결과 화면으로 넘어간다
  const ended = state.phase.kind === 'ended'
  useEffect(() => {
    if (ended && !holding) onFinished?.()
  }, [ended, holding, onFinished])
  // 모달로 알린 사건은 빼고, 차례 배너와 모달로 묻지 않은 잔해만 짧게 띄운다
  const fxEvents = events.filter((e) => e.kind === 'turn' || (e.kind === 'debris' && quietDebris(e.player)))
  const scores = useMemo(() => state.players.map((p) => liveScore(state, p.id)), [state])
  // 버튼을 보일지는 엔진의 합법 행동 목록으로 정한다
  const legal = useMemo(() => (actor !== null && state.phase.kind === 'round' ? getLegalActions(state) : []), [actor, state])

  const round = state.phase.kind === 'round' ? state.phase.round : null
  const shownPlayer = ui.viewing ?? actor ?? (state.phase.kind === 'round' ? state.currentPlayer : 0)
  const shown = state.players[shownPlayer]
  const isMine = actor !== null && shownPlayer === actor

  const hand = useMemo(() => (actor !== null && round !== null && round < 4 ? state.turn.hand : []), [actor, round, state.turn.hand])
  const handDie: RolledDie | undefined = hand.find((d) => d.id === ui.selectedDie)
  const handFront = handDie ? (ui.front ?? handDie.orientation.front) : null
  /** 손에 든 주사위를 수평으로 돌린다. +1 = 왼쪽으로 한 칸 돌아 오른면이 앞으로 */
  function turnHand(step: number) {
    if (!handDie) return
    const order = turnOrder(handDie.layout, handDie.orientation)
    const k = order.indexOf(handFront ?? handDie.orientation.front)
    const next = order[(((k + step) % 4) + 4) % 4]
    if (next !== undefined) patch({ front: next })
  }
  const placeTargets = useMemo(() => (isMine && handDie ? legalPlacements(state, handDie.id) : []), [isMine, handDie, state])
  /** 손에 든 주사위 중 놓을 칸이 하나도 없는 것 (고르기 전에 미리 알린다) */
  const stuckDice = useMemo(() => new Set(hand.filter((d) => legalPlacements(state, d.id).length === 0).map((d) => d.id)), [hand, state])
  const openSlots = state.market.filter((s) => s !== null && s.length > 0).length

  const pending = useMemo(() => (round === 4 && actor !== null ? (state.time?.pending[actor] ?? []) : []), [round, actor, state.time])
  const timeCells = useMemo(() => {
    if (!isMine || !shown) return []
    return pending.flatMap((id) => {
      const c = findTop(shown.board, id)
      return c ? [c] : []
    })
  }, [isMine, shown, pending])
  /** 굴릴 ⧗ 주사위가 하나뿐이면 미리 골라 둔다 (선택지가 하나뿐인 탭 줄이기) */
  const selectedTime = ui.selectedTime ?? (pending.length === 1 ? (pending[0] ?? null) : null)
  const timeFrom = isMine && selectedTime !== null && shown ? findTop(shown.board, selectedTime) : null
  const targets = timeFrom && shown ? rollTargets(shown.board, timeFrom, state.law) : []
  const timeDie = timeFrom && shown ? shown.board.cells[timeFrom.row]?.[timeFrom.col]?.at(-1) : undefined

  const fresh: FreshDie | null =
    lastAction && lastAction.player === shownPlayer
      ? lastAction.type === 'place'
        ? { dieId: lastAction.dieId, anim: 'drop' }
        : lastAction.type === 'roll'
          ? { dieId: lastAction.dieId, anim: lastAction.direction }
          : null
      : null

  function onCell(cell: Cell) {
    if (!shown) return
    if (isMine && handDie && placeTargets.some((c) => c.row === cell.row && c.col === cell.col)) {
      onAction({
        type: 'place',
        player: actor as number,
        dieId: handDie.id,
        row: cell.row,
        col: cell.col,
        ...(ui.front !== null ? { front: ui.front } : {}),
      })
      patch({ selectedDie: null, front: null })
      return
    }
    if (isMine && round === 4) {
      const target = targets.find((t) => t.to.row === cell.row && t.to.col === cell.col)
      if (target && selectedTime !== null) {
        onAction({ type: 'roll', player: actor as number, dieId: selectedTime, direction: target.direction })
        patch({ selectedTime: null })
        return
      }
      const top = shown.board.cells[cell.row]?.[cell.col]?.at(-1)
      if (top && pending.includes(top.id)) {
        patch({ selectedTime: top.id === selectedTime && pending.length > 1 ? null : top.id })
        return
      }
    }
    setSheet({ kind: 'pillar', player: shownPlayer, cell })
  }

  const fx = <FxLayer key={step} events={fxEvents} seats={seats} />
  const noticeModal = batch && (
    <NoticeModal notices={batch} remaining={batches.length} law={state.law} seats={seats} onConfirm={() => setBatches(batches.slice(1))} />
  )
  const errorToast = error && (
    <p
      key={`${step}-${error}`}
      role="alert"
      className="pointer-events-none fixed inset-x-4 bottom-[max(20px,env(safe-area-inset-bottom))] z-50 mx-auto max-w-[440px] animate-shake rounded-2xl bg-[#3a1d27] px-4 py-3 text-center text-sm font-bold text-[#ffb3b3] shadow-[0_12px_30px_rgb(0_0_0/0.5)] ring-1 ring-danger/50"
    >
      {error}
    </p>
  )

  if (needsPass && actor !== null) {
    return (
      <>
        <PassScreen name={seats[actor]?.name ?? ''} seat={actor} setup={state.phase.kind === 'setup'} round={round} onReady={() => setRevealedFor(actor)} />
        {noticeModal}
      </>
    )
  }

  // 게임 준비: 개인 목표 고르기 (§5-3)
  if (state.phase.kind === 'setup') {
    const me = chooser !== null ? state.players[chooser] : undefined
    return (
      <Screen>
        <TopBar
          left={
            <Button variant="ghost" size="sm" onClick={onExit}>
              나가기
            </Button>
          }
          title="게임 준비"
        />
        <GameCard tone="law" kind="이번 게임의 우주 법칙" name={LAWS[state.law].name} text={LAWS[state.law].text} className="animate-rise" />
        {me ? (
          <PersonalPick
            key={me.id}
            name={seats[me.id]?.name ?? ''}
            seat={me.id}
            offer={me.personalOffer}
            onPick={(goal) => {
              onAction({ type: 'choosePersonalGoal', player: me.id, goal })
              setRevealedFor(null)
            }}
          />
        ) : (
          <Waiting text="다른 플레이어가 개인 목표를 고르는 중" />
        )}
        {errorToast}
        {noticeModal}
      </Screen>
    )
  }

  const current = state.currentPlayer
  const currentSeat = seats[current]
  const turnsInRound = round !== null && round !== 4 ? TURNS_PER_ROUND[round] : null

  const instruction =
    actor === null
      ? null
      : round === 4
        ? timeDie
          ? targets.length > 1
            ? '빛나는 칸을 눌러 굴리세요'
            : targets.length === 1
              ? '이 주사위는 한 방향으로만 굴릴 수 있어요 · 빛나는 칸을 누르세요'
              : '어느 방향으로도 굴릴 수 없어요 · 잔해로 만드세요'
          : '주황 점이 찍힌 ⧗ 주사위를 고르세요'
        : !state.turn.taken
          ? openSlots === 1
            ? '남은 묶음이 하나뿐이에요 · 눌러서 가져오세요'
            : '시장에서 묶음 하나를 가져오세요'
          : handDie
            ? placeTargets.length > 0
              ? '빛나는 칸에 놓으세요'
              : '놓을 칸이 없어요 · 아래에서 잔해로 버리세요'
            : hand.length > 0 && stuckDice.size === hand.length
              ? '놓을 칸이 없어요 · 주사위를 골라 잔해로 버리세요'
              : '놓을 주사위를 고르세요'

  return (
    <Screen className="gap-3">
      {fx}
      <TopBar
        left={
          <Button variant="ghost" size="sm" onClick={onExit} aria-label="나가기 (진행 상황은 저장됨)">
            ✕
          </Button>
        }
        title={<RoundProgress round={round} />}
        right={
          <Button variant="ghost" size="sm" onClick={() => setSheet({ kind: 'cards' })}>
            <span className="relative">
              카드
              {state.roundGoals.length > 0 && (
                <span className="absolute -top-1.5 -right-3 rounded-full bg-goal px-1 font-display text-[11px] leading-4 text-void">{state.roundGoals.length}</span>
              )}
            </span>
          </Button>
        }
      />

      {/* 플레이어: 탭하면 그 사람 보드를 본다 */}
      <nav className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${state.players.length}, minmax(0, 1fr))` }} aria-label="플레이어 보드">
        {state.players.map((p) => {
          const active = p.id === shownPlayer
          const turn = p.id === current
          const color = seatColor(p.id)
          return (
            <button
              type="button"
              key={p.id}
              aria-pressed={active}
              aria-label={`${seats[p.id]?.name} 보드 보기${turn ? ', 지금 차례' : ''}`}
              onClick={() => patch({ viewing: p.id })}
              className={`relative flex min-h-12 items-center gap-1.5 overflow-hidden rounded-2xl px-2 py-1.5 text-left transition-all duration-200 active:scale-95 ${active ? 'bg-raised ring-2' : 'bg-surface/70 ring-1 ring-line'} ring-inset`}
              style={active ? { ['--tw-ring-color' as string]: color } : undefined}
            >
              {turn && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse" style={{ background: color }} />}
              <Avatar name={seats[p.id]?.name ?? '?'} color={color} size={26} glow={turn} />
              {turn && (
                <span aria-hidden="true" className="absolute top-1 right-1.5 rounded-full px-1.5 text-[11px] leading-4 font-bold text-void" style={{ background: color }}>
                  차례
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold">{seats[p.id]?.name}</span>
                <span className="flex items-baseline gap-1 font-display text-[13px] leading-none font-bold" style={{ color }}>
                  {scores[p.id]}
                  {p.debris.length > 0 && <span className="text-[11px] text-danger">잔해{p.debris.length}</span>}
                </span>
              </span>
            </button>
          )
        })}
      </nav>

      {/* 지금 할 일 */}
      <p className="sr-only" aria-live="polite">
        {fxSummary(events, seats)} {instruction ?? `${currentSeat?.name} 차례`}
      </p>
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-2xl bg-surface/60 px-3 py-2 ring-1 ring-line ring-inset">
        {instruction ? (
          <p key={instruction} className="animate-fade text-[15px] font-bold">
            <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-accent align-middle" aria-hidden="true" />
            <GlyphText text={instruction} />
          </p>
        ) : (
          <Waiting inline text={`${currentSeat?.name} 차례${currentSeat?.kind === 'bot' ? ' · 봇이 생각 중' : ''}`} />
        )}
        <span className="shrink-0 font-display text-xs font-bold text-muted">
          {turnsInRound !== null ? `바퀴 ${Math.min(state.turn.circuit + 1, turnsInRound)}/${turnsInRound}` : round === 4 && actor !== null ? (
            <span className="inline-flex items-center gap-1">
              <Hourglass size={12} color="#f2a65a" /> {pending.length}
            </span>
          ) : null}
        </span>
      </div>

      {shown && (
        <div className="relative">
          {!isMine && (
            <p className="mb-1 text-center text-xs text-muted">
              <span className="font-bold" style={{ color: seatColor(shownPlayer) }}>
                {seats[shownPlayer]?.name}
              </span>
              의 우주 보는 중{actor !== null && ' · '}
              {actor !== null && (
                <button type="button" className="min-h-11 px-2 font-bold text-accent underline underline-offset-4" onClick={() => patch({ viewing: actor })}>
                  내 보드로
                </button>
              )}
            </p>
          )}
          <BoardView
            board={shown.board}
            targets={handDie ? placeTargets : targets.map((t) => t.to)}
            ghost={handDie ? { face: handDie.orientation.top, color: handDie.color } : null}
            rollGhosts={targets.map((t) => ({ to: t.to, face: t.orientation.top, direction: t.direction }))}
            rollColor={timeDie?.color}
            selected={timeFrom}
            marked={timeCells}
            fresh={fresh}
            onCell={onCell}
          />
        </div>
      )}

      {/* 1~3라운드: 손에 든 주사위 */}
      {isMine && hand.length > 0 && (
        <Panel title="가져온 주사위" highlight className="animate-rise" action={<span className="text-xs text-muted">{hand.length}개 남음</span>}>
          <div className="flex justify-center gap-3">
            {hand.map((d) => {
              const on = d.id === ui.selectedDie
              const stuck = stuckDice.has(d.id)
              return (
                <button
                  type="button"
                  key={d.id}
                  aria-pressed={on}
                  aria-label={`손에 든 주사위 ${colorLabel(d.color)} ${faceLabel(d.orientation.top)}${stuck ? ', 놓을 칸 없음' : ''}${on ? ', 선택됨' : ''}`}
                  onClick={() => patch({ selectedDie: on ? null : d.id, front: null })}
                  className={`relative animate-pop rounded-2xl p-1.5 transition-transform duration-200 ${on ? '-translate-y-2 scale-110 bg-accent/20 ring-2 ring-accent' : 'active:scale-95'}`}
                >
                  <span className={`block ${on ? 'animate-hover' : ''} ${stuck && !on ? 'opacity-45 grayscale-[0.6]' : ''}`}>
                    <Die3D layout={d.layout} color={d.color} base={d.orientation} front={on ? (handFront ?? undefined) : undefined} size={36} />
                  </span>
                  {stuck && (
                    <span aria-hidden="true" className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-[#3a1d27] px-1.5 text-[10px] leading-4 font-bold whitespace-nowrap text-[#ffb3b3] ring-1 ring-danger/50">
                      놓을 칸 없음
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {handDie && (
            <div className="mt-3 flex animate-fade flex-col gap-3 border-t border-line pt-3">
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  aria-label="오른쪽으로 돌리기 (왼면이 앞으로)"
                  onClick={() => turnHand(-1)}
                  className="flex size-11 items-center justify-center rounded-full bg-raised font-display text-xl text-accent ring-1 ring-line ring-inset active:scale-90"
                >
                  ⟳
                </button>
                <Die3D layout={handDie.layout} color={handDie.color} base={handDie.orientation} front={handFront ?? undefined} size={64} onTurn={turnHand} />
                <button
                  type="button"
                  aria-label="왼쪽으로 돌리기 (오른면이 앞으로)"
                  onClick={() => turnHand(1)}
                  className="flex size-11 items-center justify-center rounded-full bg-raised font-display text-xl text-accent ring-1 ring-line ring-inset active:scale-90"
                >
                  ⟲
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">
                  주사위를 끌어 돌려 보세요
                  <br />
                  <span className="text-[11px]">정면 숫자선·굴리기에 쓰여요</span>
                </span>
                <div className="flex gap-1">
                  {sideFaces(handDie.layout, handDie.orientation.top).map((f) => {
                    const active = handFront === f
                    return (
                      <button
                        type="button"
                        key={String(f)}
                        aria-pressed={active}
                        aria-label={`앞면 ${faceLabel(f)}`}
                        onClick={() => patch({ front: f })}
                        className={`flex size-11 items-center justify-center rounded-xl transition-all duration-150 ${active ? 'bg-accent/25 ring-2 ring-accent' : 'bg-void/50 active:scale-90'}`}
                      >
                        <DieFace face={f} color={handDie.color} size={28} showSymbol={false} />
                      </button>
                    )
                  })}
                </div>
              </div>
              {legal.some((a) => a.type === 'discard' && a.dieId === handDie.id) && (
                <ConfirmButton key={handDie.id} confirmText="한 번 더 누르면 버려요 · −1점" onConfirm={() => onAction({ type: 'discard', player: actor as number, dieId: handDie.id })}>
                  잔해로 버리기 · −1점
                </ConfirmButton>
              )}
            </div>
          )}
        </Panel>
      )}

      {/* 4라운드: 굴리기 */}
      {isMine && round === 4 && timeDie && (
        <Panel title="굴리기" highlight className="animate-rise">
          <div className="flex items-center gap-4">
            <DieNet die={timeDie} size={24} />
            <div className="flex flex-1 flex-wrap gap-2">
              {legal.some((a) => a.type === 'scrap' && a.dieId === timeDie.id) ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-[#ffb3b3]">네 방향 모두 막혀 있어요.</p>
                  <ConfirmButton key={timeDie.id} confirmText="한 번 더 누르면 잔해로 · −1점" onConfirm={() => onAction({ type: 'scrap', player: actor as number, dieId: timeDie.id })}>
                    잔해로 · −1점
                  </ConfirmButton>
                </div>
              ) : (
                targets.map((t) => (
                  <button
                    type="button"
                    key={t.direction}
                    aria-label={`${DIRECTION_LABEL[t.direction]}으로 굴리기, 새 윗면 ${faceLabel(t.orientation.top)}`}
                    onClick={() => onAction({ type: 'roll', player: actor as number, dieId: timeDie.id, direction: t.direction })}
                    className="flex min-h-12 items-center gap-1.5 rounded-xl bg-raised px-3 ring-1 ring-line ring-inset active:scale-95"
                  >
                    <span aria-hidden="true" className="font-display text-xl font-bold text-accent">
                      {DIRECTION_ARROW[t.direction]}
                    </span>
                    <DieFace face={t.orientation.top} color={timeDie.color} size={28} showSymbol={false} />
                  </button>
                ))
              )}
            </div>
          </div>
        </Panel>
      )}

      {/* 시장 */}
      {round !== null && round < 4 && (
        <Panel
          title="시장"
          highlight={actor !== null && !state.turn.taken}
          action={
            legal.some((a) => a.type === 'reroll') && (
              <Button variant={ui.rerollMode ? 'secondary' : 'ghost'} size="sm" aria-pressed={ui.rerollMode} onClick={() => patch({ rerollMode: !ui.rerollMode })}>
                {ui.rerollMode ? '취소' : '🎲 1개 다시 굴리기'}
              </Button>
            )
          }
        >
          <MarketView
            market={state.market}
            onTake={actor !== null && !state.turn.taken ? (slot) => onAction({ type: 'takeSlot', player: actor, slot }) : undefined}
            rerollMode={ui.rerollMode}
            onReroll={(slot, dieId) => {
              onAction({ type: 'reroll', player: actor as number, slot, dieId })
              patch({ rerollMode: false })
            }}
          />
        </Panel>
      )}

      {errorToast}
      {noticeModal}

      {sheet?.kind === 'cards' && <CardsSheet state={state} seats={seats} personalOf={actor} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'pillar' && (
        <PillarSheet
          pillar={state.players[sheet.player]?.board.cells[sheet.cell.row]?.[sheet.cell.col] ?? []}
          cell={sheet.cell}
          onClose={() => setSheet(null)}
        />
      )}
    </Screen>
  )
}

/** 상단 라운드 진행: 선 → 평면 → 입체 → 시간 */
function RoundProgress({ round }: { round: number | null }) {
  return (
    <span className="flex items-center justify-center gap-1" aria-label={round ? `${round}라운드 ${ROUND_INFO[round - 1]?.name}` : '게임'}>
      {ROUND_INFO.map((r) => {
        const on = r.round === round
        const done = round !== null && r.round < round
        return (
          <span
            key={r.round}
            aria-hidden="true"
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition-all duration-300 ${on ? 'bg-accent text-void shadow-[0_0_14px_rgb(155_140_255/0.7)]' : done ? 'text-accent/80' : 'text-muted'}`}
          >
            {on ? `${r.round} ${r.name}` : r.name}
          </span>
        )
      })}
    </span>
  )
}

function Waiting({ text, inline = false }: { text: string; inline?: boolean }) {
  return (
    <p className={`flex items-center gap-2 text-muted ${inline ? 'text-sm' : 'justify-center py-10'}`}>
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${i * 140}ms` }} />
        ))}
      </span>
      {text}
    </p>
  )
}

/** 핫시트 가림막: 다음 사람에게 기기를 넘긴다 */
function PassScreen({ name, seat, setup, round, onReady }: { name: string; seat: number; setup: boolean; round: number | null; onReady: () => void }) {
  const color = seatColor(seat)
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-6 overflow-hidden px-6 text-center">
      <span aria-hidden="true" className="absolute top-1/3 left-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-3xl" style={{ background: color }} />
      <p className="relative animate-fade text-sm font-bold tracking-[0.3em] text-muted">기기를 넘겨 주세요</p>
      <div className="relative animate-drop">
        <Avatar name={name} color={color} size={112} glow />
      </div>
      <h1 className="relative animate-rise font-display text-5xl font-bold [animation-delay:100ms]">{name}</h1>
      <p className="relative animate-rise text-muted [animation-delay:160ms]">
        {setup ? '개인 목표를 고를 차례예요. 다른 사람은 보지 마세요!' : `${round ? `${round}라운드 ${ROUND_INFO[round - 1]?.name}` : ''} — 내 차례예요`}
      </p>
      <Button variant="primary" size="lg" className="relative mt-4 min-w-56 animate-rise [animation-delay:220ms]" onClick={onReady}>
        내 차례 시작
      </Button>
    </main>
  )
}

/** 개인 목표 2장 중 1장 고르기 (§5-3). 실수로 누르지 않게 고른 뒤 확정 */
function PersonalPick({ name, seat, offer, onPick }: { name: string; seat: number; offer: PersonalGoalId[]; onPick: (goal: PersonalGoalId) => void }) {
  const [picked, setPicked] = useState<PersonalGoalId | null>(null)
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={name} color={seatColor(seat)} size={40} glow />
        <div>
          <h2 className="text-lg font-bold">{name}, 개인 목표를 고르세요</h2>
          <p className="text-xs text-muted">비공개 · 게임 끝에 달성하면 {PERSONAL_GOAL_POINTS}점</p>
        </div>
      </div>
      <div className="grid gap-3">
        {offer.map((id, i) => {
          const on = picked === id
          return (
            <button
              type="button"
              key={id}
              aria-pressed={on}
              onClick={() => setPicked(id)}
              className={`animate-rise rounded-2xl text-left transition-all duration-200 active:scale-[0.98] ${on ? 'scale-[1.02] ring-2 ring-personal shadow-[0_10px_30px_-8px_rgb(242_166_90/0.6)]' : picked ? 'opacity-55' : ''}`}
              style={{ animationDelay: `${120 + i * 90}ms` }}
            >
              <GameCard tone="personal" kind={on ? '✓ 선택함' : `개인 목표 ${i + 1}`} name={PERSONAL_GOALS[id].name} text={PERSONAL_GOALS[id].text} />
            </button>
          )
        })}
      </div>
      <Button variant="primary" size="lg" block disabled={!picked} onClick={() => picked && onPick(picked)}>
        {picked ? `「${PERSONAL_GOALS[picked].name}」로 확정` : '카드를 골라 주세요'}
      </Button>
    </section>
  )
}
