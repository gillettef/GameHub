import { useEffect, useMemo, useState } from 'react'
import {
  applyAction,
  dieColor,
  EVENTS,
  faceColor,
  findTop,
  getLegalActions,
  GOAL_ACHIEVED_POINTS,
  legalPlacements,
  PERSONAL_GOAL_POINTS,
  PERSONAL_GOALS,
  ROUND4_GOAL_POINTS,
  ROUND_GOALS,
  rollTargets,
  sideFaces,
  TURNS_PER_ROUND,
  turnOrder,
  type Action,
  type Board,
  type Cell,
  type Face,
  type GameState,
  type PersonalGoalId,
  type RolledDie,
  type TipDirection,
} from '../engine'
import type { LogEntry } from '@gamehub/net'
import { GameShell, LogList } from '@gamehub/ui'
import type { Seat } from '../app/session'
import { BoardView, type FreshDie } from './BoardView'
import { CardsSheet, type BotSpeed } from './CardsSheet'
import { BASE_INFO, colorLabel, faceLabel, ROUND_INFO, seatColor } from './colors'
import { describeAction } from './describe'
import { Die3D } from './Die3D'
import { DieFace, GlyphText, Hourglass } from './DieFace'
import { buzz, diffEvents, liveScore, scoreParts, type FxEvent } from './fx'
import { FxLayer } from './FxLayer'
import { MarketView } from './MarketView'
import { NoticeModal } from './NoticeModal'
import { buildNotices, type Notice } from './notices'
import { DieNet, PillarSheet } from './PillarSheet'
import { Card } from './Card'
import { Avatar, Button, ConfirmButton, Panel, Screen, Sheet, TopBar } from './primitives'
import { RulesSheet } from './RulesSheet'
import { TipCard } from './TipCard'
import { useTip, type TipId } from './tips'
import { Icon } from './icons'

interface GameScreenProps {
  state: GameState
  /** 직전 행동 전 상태 (연출용) */
  prev: GameState | null
  lastAction: Action | null
  /** 지금까지의 행동 수. 연출 레이어를 행동마다 새로 띄우는 key */
  step: number
  seats: Seat[]
  /** 이 기기가 조작하는 자리 (한 기기: 모든 자리, 온라인: 내 자리) */
  localSeats: number[]
  /** 지금 두어야 하는 자리들 (공통 진행 코드가 정한다. 게임 준비 때는 아직 고르지 않은 모두) */
  actors: number[]
  /** 게임 기록 (메뉴) */
  log: readonly LogEntry[]
  /** 나가기 전에 확인할 말. 없으면 바로 나간다 */
  exitWarning?: string
  onAction: (action: Action) => void
  onExit: () => void
  /** 바로 전 행동이 거절된 이유 */
  error: string | null
  /** 확인할 알림 모달이 떠 있는지 알린다 (떠 있는 동안 봇이 기다린다) */
  onHold?: (hold: boolean) => void
  /** 게임이 끝나고 남은 알림을 모두 확인했을 때 (결과 화면으로) */
  onFinished?: () => void
  /** 온라인 게임이면 서버 연결 상태와 자리별 접속 여부 */
  connection?: { open: boolean; presence: boolean[] } | null
  /** 봇 속도 (카드 시트에서 바꾼다) */
  botSpeed?: BotSpeed
  onBotSpeed?: (speed: BotSpeed) => void
  /** 마지막 행동을 되돌릴 수 있으면 (굴림 결과가 나온 뒤에는 오지 않는다) */
  onUndo?: () => void
}

/** 넘기는 방향 (조사까지 붙여 둔다) */
const DIRECTION_LABEL: Record<TipDirection, string> = { forward: '앞(아래)으로', back: '뒤(위)로', left: '왼쪽으로', right: '오른쪽으로' }
const DIRECTION_ARROW: Record<TipDirection, string> = { forward: '↓', back: '↑', left: '←', right: '→' }

/** 개인 목표를 아직 고르지 않은, 이 기기의 사람 자리. 남의 개인 목표는 가려져 오므로 actors 로 정한다 */
function pendingChooser(state: GameState, seats: Seat[], localSeats: number[], actors: number[]): number | null {
  if (state.phase.kind !== 'setup') return null
  return actors.find((p) => localSeats.includes(p) && seats[p]?.kind === 'human') ?? null
}

/** 차례 안에서만 유지하는 선택 상태. 차례가 바뀌면(key가 달라지면) 처음 값으로 본다 */
interface TurnUi {
  key: string
  selectedDie: number | null
  front: Face | null
  selectedTime: number | null
  rerollMode: boolean
  viewing: number | null
  /** 고른 시장 칸 (내 차례: 한 번 더 누르면 가져오기, 아니면 들여다보기) */
  slot: number | null
  /** 한 번 눌러 확정을 기다리는 칸 (놓기·넘기기) */
  armedCell: Cell | null
  /** 고를 수 없는 칸을 누른 횟수 (안내 줄을 흔들어 알린다) */
  nudge: number
  /** 고를 수 없어 한 번 누른 칸. 한 번 더 누르면 그 기둥을 펼쳐 본다 */
  peek: Cell | null
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
        case 'base':
          return `${name(e.player)}, ${BASE_INFO[e.round].name} 점수 ${e.points}점 확정.`
        case 'endEvents':
          return `끝 사건 발동: ${e.events.map((id) => EVENTS[id].name).join(', ')}.`
      }
    })
    .join(' ')
}

const freshUi = (key: string): TurnUi => ({ key, selectedDie: null, front: null, selectedTime: null, rerollMode: false, viewing: null, slot: null, armedCell: null, nudge: 0, peek: null })

const sameCell = (a: Cell | null | undefined, b: Cell) => !!a && a.row === b.row && a.col === b.col

export function GameScreen({
  state,
  prev,
  lastAction,
  step,
  seats,
  localSeats,
  actors,
  log,
  exitWarning,
  onAction,
  onExit,
  error,
  onHold,
  onFinished,
  connection = null,
  botSpeed,
  onBotSpeed,
  onUndo,
}: GameScreenProps) {
  const humanLocal = localSeats.filter((s) => seats[s]?.kind === 'human')
  const chooser = pendingChooser(state, seats, localSeats, actors)
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

  const [sheet, setSheet] = useState<{ kind: 'menu' } | { kind: 'cards' } | { kind: 'rules' } | { kind: 'pillar'; player: number; cell: Cell } | null>(null)
  const events = useMemo(() => diffEvents(prev, state), [prev, state])

  // 확인할 알림: 마지막으로 본 상태와 비교해 묶음으로 쌓고, 「확인」을 누를 때마다 한 묶음씩 넘긴다.
  // 행동 여러 개가 한꺼번에 들어와도(온라인) 놓치지 않게 직전 행동이 아니라 마지막으로 본 상태와 비교한다
  const [seen, setSeen] = useState(state)
  const [batches, setBatches] = useState<Notice[][]>([])
  /**
   * 잔해는 이 기기 사람이 남의 손으로(강제로) 얻었을 때만 모달로 묻는다.
   * 스스로 버리기·다시 굴리기를 두 번 눌러 만든 잔해와 봇·원격 플레이어의 잔해는 짧은 팝업으로만 보인다
   */
  const quietDebris = (player: number) =>
    !humanLocal.includes(player) || (!!lastAction && (lastAction.type === 'discard' || lastAction.type === 'scrap' || lastAction.type === 'rerollHand') && lastAction.player === player)
  if (seen !== state) {
    setSeen(state)
    // 게임이 바뀌면 App 이 이 화면을 새로 그린다(key). 시드는 가려져 오므로 비교하지 않는다
    const batch = buildNotices(diffEvents(seen, state), state, quietDebris)
    if (batch.length > 0) setBatches([...batches, batch])
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
  // 차례 배너는 사람 차례로 넘어갈 때만 (봇 차례마다 상단을 가리지 않게)
  const fxEvents = events.filter((e) => (e.kind === 'turn' && seats[e.player]?.kind === 'human') || (e.kind === 'debris' && quietDebris(e.player)))
  const scores = useMemo(() => state.players.map((p) => liveScore(state, p.id)), [state])
  // 버튼을 보일지는 엔진의 합법 행동 목록으로 정한다
  const legal = useMemo(() => (actor !== null && state.phase.kind === 'round' ? getLegalActions(state) : []), [actor, state])

  const round = state.phase.kind === 'round' ? state.phase.round : null
  const shownPlayer = ui.viewing ?? actor ?? (state.phase.kind === 'round' ? state.currentPlayer : 0)
  const shown = state.players[shownPlayer]
  const isMine = actor !== null && shownPlayer === actor

  const hand = useMemo(() => (actor !== null && round !== null && round < 4 ? state.turn.hand : []), [actor, round, state.turn.hand])
  // 손에 하나만 남았으면 미리 골라 둔다 (선택지가 하나뿐인 탭 줄이기)
  const selectedDie = ui.selectedDie !== null && hand.some((d) => d.id === ui.selectedDie) ? ui.selectedDie : hand.length === 1 ? (hand[0]?.id ?? null) : null
  const handDie: RolledDie | undefined = hand.find((d) => d.id === selectedDie)
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
  const canTake = actor !== null && round !== null && round < 4 && !state.turn.taken
  // 남은 묶음이 하나뿐이면 미리 골라 둔다. 고른 칸이 그새 비었으면 고르지 않은 것으로 본다
  const onlySlot = canTake && openSlots === 1 ? state.market.findIndex((s) => s !== null && s.length > 0) : null
  const slot = ui.slot !== null && (state.market[ui.slot]?.length ?? 0) > 0 ? ui.slot : onlySlot
  const slotDice = slot !== null ? (state.market[slot] ?? []) : []
  const armedCell = ui.armedCell

  const pending = useMemo(() => (round === 4 && actor !== null ? (state.time?.pending[actor] ?? []) : []), [round, actor, state.time])
  /** 남은 자유 넘기기 (§9: 영원의 우주·역행) */
  const free = round === 4 && actor !== null ? (state.time?.free[actor] ?? 0) : 0
  const timeEvents = state.time?.events ?? []
  /** 자유 넘기기로 고를 수 있는 꼭대기 (엔진의 합법 행동에서) */
  const freeIds = useMemo(
    () => new Set(legal.flatMap((a) => (a.type === 'roll' && !pending.includes(a.dieId) ? [a.dieId] : []))),
    [legal, pending],
  )
  const canPass = legal.some((a) => a.type === 'pass')
  const timeCells = useMemo(() => {
    if (!isMine || !shown) return []
    return pending.flatMap((id) => {
      const c = findTop(shown.board, id)
      return c ? [c] : []
    })
  }, [isMine, shown, pending])
  /** 넘길 ⧗ 주사위가 하나뿐이고 자유 넘기기가 없으면 미리 골라 둔다 (선택지가 하나뿐인 탭 줄이기) */
  const selectedTime = ui.selectedTime ?? (pending.length === 1 && free === 0 ? (pending[0] ?? null) : null)
  const freeTip = selectedTime !== null && !pending.includes(selectedTime)
  const timeFrom = isMine && selectedTime !== null && shown ? findTop(shown.board, selectedTime) : null
  const targets = timeFrom && shown ? rollTargets(shown.board, timeFrom, state.law, timeEvents) : []
  const timeDie = timeFrom && shown ? shown.board.cells[timeFrom.row]?.[timeFrom.col]?.at(-1) : undefined

  /** 고를 수 있는 칸마다 그 수를 두면 늘어나는 점수. 엔진으로 한 수 앞을 실제로 적용해 본다 (공개 점수 기준) */
  const handDieId = isMine ? (handDie?.id ?? null) : null
  const rollDieId = isMine && round === 4 ? selectedTime : null
  const gains = useMemo(() => {
    if (actor === null) return []
    const base = liveScore(state, actor)
    const delta = (a: Action) => {
      try {
        return liveScore(applyAction(state, a), actor) - base
      } catch {
        return null
      }
    }
    const out: { cell: Cell; delta: number }[] = []
    if (handDieId !== null) {
      for (const cell of legalPlacements(state, handDieId)) {
        const d = delta({ type: 'place', player: actor, dieId: handDieId, row: cell.row, col: cell.col, ...(ui.front !== null ? { front: ui.front } : {}) })
        if (d !== null) out.push({ cell, delta: d })
      }
    } else if (rollDieId !== null) {
      const board = state.players[actor]?.board
      const from = board ? findTop(board, rollDieId) : null
      for (const t of board && from ? rollTargets(board, from, state.law, state.time?.events ?? []) : []) {
        const d = delta({ type: 'roll', player: actor, dieId: rollDieId, direction: t.direction })
        if (d !== null) out.push({ cell: t.to, delta: d })
      }
    }
    return out
  }, [state, actor, handDieId, rollDieId, ui.front])

  /** 이 기기에서 개인 목표를 볼 수 있는 사람 (핫시트에서는 지금 차례인 사람만) */
  const viewer = actor ?? (humanLocal.length === 1 ? (humanLocal[0] ?? null) : null)

  // 처음 하는 사람을 위한 상황별 도움말 (라운드 안내가 먼저)
  const roundTip: TipId | null = actor !== null && round === 2 ? 'round2' : actor !== null && round === 3 ? 'round3' : actor !== null && round === 4 ? 'round4' : null
  const { tip, dismiss: dismissTip, turnOff: tipsOff } = useTip([
    roundTip,
    canTake ? 'take' : null,
    isMine && handDie && placeTargets.length > 0 ? 'place' : null,
  ])

  const fresh: FreshDie | null =
    lastAction && lastAction.player === shownPlayer
      ? lastAction.type === 'place'
        ? { dieId: lastAction.dieId, anim: 'drop' }
        : lastAction.type === 'roll'
          ? { dieId: lastAction.dieId, anim: lastAction.direction }
          : null
      : null

  function place(cell: Cell) {
    if (!handDie || actor === null) return
    onAction({
      type: 'place',
      player: actor,
      dieId: handDie.id,
      row: cell.row,
      col: cell.col,
      ...(ui.front !== null ? { front: ui.front } : {}),
    })
    patch({ selectedDie: null, front: null, armedCell: null })
  }

  const armedRoll = round === 4 && armedCell ? targets.find((t) => sameCell(armedCell, t.to)) : undefined
  function roll(direction: TipDirection) {
    if (selectedTime === null || actor === null) return
    onAction({ type: 'roll', player: actor, dieId: selectedTime, direction })
    patch({ selectedTime: null, armedCell: null })
  }

  /** 시장 칸: 내 차례면 한 번 눌러 고르고 한 번 더 눌러 가져온다. 아니면 들여다보기만 */
  function onSlot(i: number) {
    if (canTake && slot === i && actor !== null) {
      onAction({ type: 'takeSlot', player: actor, slot: i })
      patch({ slot: null })
      return
    }
    patch({ slot: !canTake && slot === i ? null : i })
  }

  /** 보드 칸: 놓기·넘기기는 한 번 눌러 미리 보고 한 번 더 눌러 확정 (잘못 누른 손가락 막기) */
  function onCell(cell: Cell) {
    if (!shown) return
    if (isMine && handDie && placeTargets.some((c) => sameCell(c, cell))) {
      if (sameCell(armedCell, cell)) place(cell)
      else patch({ armedCell: cell, peek: null })
      return
    }
    if (isMine && round === 4) {
      const target = targets.find((t) => sameCell(t.to, cell))
      if (target && selectedTime !== null) {
        if (sameCell(armedCell, cell)) roll(target.direction)
        else patch({ armedCell: cell, peek: null })
        return
      }
      const top = shown.board.cells[cell.row]?.[cell.col]?.at(-1)
      if (top && (pending.includes(top.id) || freeIds.has(top.id))) {
        const only = pending.length === 1 && free === 0
        patch({ selectedTime: top.id === selectedTime && !only ? null : top.id, armedCell: null })
        return
      }
    }
    const empty = (shown.board.cells[cell.row]?.[cell.col]?.length ?? 0) === 0
    // 주사위를 고른 채 놓을 수 없는 칸을 누르면 시트로 흐름을 끊지 않고 안내 줄만 흔든다.
    // 같은 칸을 한 번 더 누르면 그때 기둥을 펼쳐 본다
    const choosing = isMine && (!!handDie || (round === 4 && selectedTime !== null))
    if (choosing && !(sameCell(ui.peek, cell) && !empty)) {
      buzz(30)
      patch({ nudge: ui.nudge + 1, peek: cell, armedCell: null })
      return
    }
    if (empty) return
    patch({ peek: null })
    setSheet({ kind: 'pillar', player: shownPlayer, cell })
  }

  const confirm: { text: string; label: string; run: () => void } | null =
    canTake && slot !== null
      ? { text: `${slot + 1}번 칸 · 주사위 ${slotDice.length}개`, label: '가져오기', run: () => onSlot(slot) }
      : isMine && handDie && armedCell && placeTargets.some((c) => sameCell(c, armedCell))
        ? { text: `${armedCell.row + 1}행 ${armedCell.col + 1}열`, label: '여기에 놓기', run: () => place(armedCell) }
        : isMine && armedRoll
          ? { text: DIRECTION_LABEL[armedRoll.direction], label: freeTip ? '자유 넘기기' : '넘기기', run: () => roll(armedRoll.direction) }
          : null
  const cancelConfirm = () => patch(canTake && slot !== null ? { slot: null } : { armedCell: null })

  const fx = <FxLayer key={`fx-${step}`} events={fxEvents} seats={seats} />
  const noticeModal = batch && (
    <NoticeModal notices={batch} remaining={batches.length} law={state.law} seats={seats} onConfirm={() => setBatches(batches.slice(1))} />
  )
  const errorToast = error && (
    <p
      key={`${step}-${error}`}
      role="alert"
      className="pointer-events-none fixed inset-x-4 top-[calc(env(safe-area-inset-top)+56px)] z-50 mx-auto max-w-[440px] animate-toast rounded-2xl bg-[#3a1d27] px-4 py-3 text-center text-sm font-bold text-[#ffb3b3] shadow-[0_12px_30px_rgb(0_0_0/0.5)] ring-1 ring-danger/50"
    >
      {error}
    </p>
  )

  const recentBoard = lastAction ? state.players[lastAction.player]?.board : undefined
  if (needsPass && actor !== null) {
    return (
      <>
        <PassScreen
          name={seats[actor]?.name ?? ''}
          seat={actor}
          setup={state.phase.kind === 'setup'}
          round={round}
          onReady={() => setRevealedFor(actor)}
          onUndo={onUndo}
          recent={
            // 방금 둔 사람(이 기기의 다른 사람)이 마지막 수의 결과를 보고 넘길 수 있게
            lastAction && recentBoard && lastAction.player !== actor && humanLocal.includes(lastAction.player)
              ? {
                  name: seats[lastAction.player]?.name ?? '',
                  seat: lastAction.player,
                  board: recentBoard,
                  score: liveScore(state, lastAction.player),
                  fresh: lastAction.type === 'place' ? { dieId: lastAction.dieId, anim: 'drop' } : lastAction.type === 'roll' ? { dieId: lastAction.dieId, anim: lastAction.direction } : null,
                }
              : null
          }
        />
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
        <div className="animate-rise">
          <Card card={{ kind: 'law', id: state.law }} kindLabel="이번 게임의 우주 법칙" />
        </div>
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

  const peekCell = isMine && (handDie || (round === 4 && selectedTime !== null)) ? ui.peek : null
  const peekEmpty = peekCell ? (shown?.board.cells[peekCell.row]?.[peekCell.col]?.length ?? 0) === 0 : true
  const instruction =
    actor === null
      ? null
      : peekCell
        ? peekEmpty
          ? '여기에는 놓을 수 없어요 · 빛나는 칸을 누르세요'
          : '여기에는 놓을 수 없어요 · 한 번 더 누르면 기둥을 펼쳐 봐요'
      : round === 4
        ? timeDie
          ? armedRoll
            ? '한 번 더 누르면 넘겨요'
            : targets.length > 1
            ? '빛나는 칸을 눌러 넘기세요'
            : targets.length === 1
              ? '이 주사위는 한 방향으로만 넘길 수 있어요 · 빛나는 칸을 누르세요'
              : '어느 방향으로도 넘길 수 없어요 · 잔해로 만드세요'
          : pending.length > 0
            ? free > 0
              ? '주황 점이 찍힌 ⧗ 주사위를 고르세요 · 자유 넘기기로 다른 꼭대기도 넘길 수 있어요'
              : '주황 점이 찍힌 ⧗ 주사위를 고르세요'
            : `자유 넘기기 ${free}회 · 넘길 꼭대기를 고르거나 아래에서 포기하세요`
        : !state.turn.taken
          ? slot !== null
            ? openSlots === 1
              ? '남은 묶음이 하나뿐이에요 · 한 번 더 눌러 가져오세요'
              : '한 번 더 누르면 가져와요'
            : '시장에서 묶음 하나를 골라 보세요'
          : handDie
            ? placeTargets.length > 0
              ? armedCell
                ? '한 번 더 누르면 놓여요'
                : '빛나는 칸에 놓으세요'
              : '놓을 칸이 없어요 · 아래에서 잔해로 버리세요'
            : hand.length > 0 && stuckDice.size === hand.length
              ? '놓을 칸이 없어요 · 주사위를 골라 잔해로 버리세요'
              : '놓을 주사위를 고르세요'

  const status =
    actor !== null
      ? humanLocal.length > 1
        ? `${seats[actor]?.name} 차례`
        : '내 차례'
      : `${currentSeat?.name ?? ''} 차례${currentSeat?.kind === 'bot' ? ' · 봇이 생각 중' : ''}`
  const players = (
    <nav className="grid shrink-0 gap-1.5 px-2 py-1.5" style={{ gridTemplateColumns: `repeat(${state.players.length}, minmax(0, 1fr))` }} aria-label="플레이어 보드">
      {state.players.map((p) => {
        const active = p.id === shownPlayer
        const turn = p.id === current
        const color = seatColor(p.id)
        const away = !!connection && connection.presence[p.id] === false
        return (
          <button
            type="button"
            key={p.id}
            aria-pressed={active}
            aria-label={`${seats[p.id]?.name} 보드 보기${turn ? ', 지금 차례' : ''}${away ? ', 연결 끊김' : ''}`}
            onClick={() => patch({ viewing: p.id })}
            className={`relative flex min-h-12 items-center gap-1.5 overflow-hidden rounded-2xl px-2 py-1.5 text-left transition-all duration-200 active:scale-95 ${active ? 'bg-raised ring-2' : 'bg-surface/70 ring-1 ring-line'} ring-inset`}
            style={active ? { ['--tw-ring-color' as string]: color } : undefined}
          >
            {turn && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse" style={{ background: color }} />}
            <span className="relative shrink-0">
              <Avatar name={seats[p.id]?.name ?? '?'} color={color} size={26} glow={turn} />
              {away && <span aria-hidden="true" className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-muted ring-2 ring-void" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold">{seats[p.id]?.name}</span>
              <span className="flex min-w-0 items-baseline gap-1 font-display text-[13px] leading-none font-bold" style={{ color }}>
                {scores[p.id]}
                {p.debris.length > 0 && <span className="truncate text-xs text-danger">−{p.debris.length}</span>}
                {/* 4인이면 칸이 좁아 글자 대신 테두리·아바타 빛·아래 막대로만 차례를 알린다 */}
                {turn && state.players.length <= 3 && (
                  <span aria-hidden="true" className="ml-auto shrink-0 rounded-full px-1.5 font-sans text-xs leading-4 text-void" style={{ background: color }}>
                    차례
                  </span>
                )}
              </span>
            </span>
          </button>
        )
      })}
    </nav>
  )
  // ⑤ 행동: 한 번 눌러 고른 행동의 확정·취소. 없으면 되돌리기 (주사위를 굴려 나온 결과가 끼면 App 이 주지 않는다)
  const actions = confirm ? (
    <>
      <Button onClick={cancelConfirm} className="max-w-24 shrink-0 whitespace-nowrap">
        취소
      </Button>
      <Button variant="primary" className="min-w-0 grow-[3]" onClick={confirm.run} aria-label={`${confirm.text}, ${confirm.label}`}>
        <span className="truncate font-normal opacity-80">{confirm.text}</span>
        <span className="whitespace-nowrap">· {confirm.label}</span>
      </Button>
    </>
  ) : onUndo ? (
    <Button onClick={onUndo}>↶ 방금 수 되돌리기</Button>
  ) : null

  return (
    <>
      {fx}
      <GameShell
        status={status}
        detail={
          <span className="inline-flex items-center gap-2">
            <RoundProgress round={round} />
            {turnsInRound !== null && (
              <span className="font-display text-xs font-bold">
                바퀴 {Math.min(state.turn.circuit + 1, turnsInRound)}/{turnsInRound}
              </span>
            )}
          </span>
        }
        onMenu={() => setSheet({ kind: 'menu' })}
        players={players}
        actions={actions}
        notice={connection && !connection.open ? '연결이 끊겼어요 · 다시 연결하는 중…' : null}
      >
        <div className="flex h-full flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3 *:shrink-0">
      {/* 지금 할 일 */}
      <p className="sr-only" aria-live="polite">
        {fxSummary(events, seats)} {instruction ?? `${currentSeat?.name} 차례`}
      </p>
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-2xl bg-surface/60 px-3 py-2 ring-1 ring-line ring-inset">
        {instruction ? (
          <p key={`${instruction}-${peekCell ? ui.nudge : 0}`} className={`text-[15px] font-bold ${peekCell ? 'animate-shake text-[#ffd2a8]' : 'animate-fade'}`}>
            <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-accent align-middle" aria-hidden="true" />
            <GlyphText text={instruction} />
          </p>
        ) : (
          <Waiting
            inline
            text={`${currentSeat?.name} 차례${currentSeat?.kind === 'bot' ? ' · 봇이 생각 중' : connection?.presence[current] === false ? ' · 연결이 끊겨 기다리는 중' : ''}`}
          />
        )}
        <span className="shrink-0 font-display text-xs font-bold text-muted">
          {round === 4 && actor !== null ? (
            <span className="inline-flex items-center gap-1">
              <Hourglass size={12} color="#f2a65a" /> {pending.length}
              {free > 0 && <span className="text-accent">· 자유 {free}</span>}
            </span>
          ) : null}
        </span>
      </div>

      {/* 다른 사람이 방금 한 일 (봇·원격 플레이어의 수를 놓치지 않게) */}
      {lastAction && lastAction.player !== actor && lastAction.type !== 'choosePersonalGoal' && (
        <p key={`recent-${step}`} className="-mt-1 animate-fade truncate px-1 text-xs text-muted" aria-hidden="true">
          <span className="font-bold" style={{ color: seatColor(lastAction.player) }}>
            최근
          </span>{' '}
          <GlyphText text={describeAction(lastAction, prev, seats)} />
        </p>
      )}

      {/* 남이 가져와 아직 놓지 않은 주사위 */}
      {actor === null && round !== null && round < 4 && state.turn.hand.length > 0 && (
        <div className="-mt-1 flex items-center gap-2 px-1" role="group" aria-label={`${currentSeat?.name} 손의 주사위`}>
          <span className="text-xs text-muted">{currentSeat?.name} 손에</span>
          {state.turn.hand.map((d) => (
            <DieFace key={d.id} face={d.orientation.top} color={dieColor(d)} size={26} />
          ))}
        </div>
      )}

      {tip && <TipCard id={tip} onDismiss={dismissTip} onOff={tipsOff} />}

      <GoalStrip state={state} player={shownPlayer} viewer={viewer} onOpen={() => setSheet({ kind: 'cards' })} />

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
            ghost={handDie ? { face: handDie.orientation.top, color: dieColor(handDie) } : null}
            rollGhosts={targets.map((t) => ({ to: t.to, face: t.orientation.top, direction: t.direction }))}
            rollColors={timeDie?.colors}
            selected={timeFrom}
            armed={armedCell}
            marked={timeCells}
            gains={gains}
            fresh={fresh}
            onCell={onCell}
          />
          <ScoreBreakdown state={state} player={shownPlayer} />
        </div>
      )}

      {/* 1~3라운드: 손에 든 주사위 */}
      {isMine && hand.length > 0 && (
        <Panel title="가져온 주사위" highlight className="animate-rise" action={<span className="text-xs text-muted">{hand.length}개 남음</span>}>
          <div className="flex justify-center gap-3">
            {hand.map((d) => {
              const on = d.id === selectedDie
              const stuck = stuckDice.has(d.id)
              return (
                <button
                  type="button"
                  key={d.id}
                  aria-pressed={on}
                  aria-label={`손에 든 주사위 ${colorLabel(dieColor(d))} ${faceLabel(d.orientation.top)}${stuck ? ', 놓을 칸 없음' : ''}${on ? ', 선택됨' : ''}`}
                  onClick={() => patch({ selectedDie: on && hand.length > 1 ? null : d.id, front: null, armedCell: null })}
                  className={`relative animate-pop rounded-2xl p-1.5 transition-transform duration-200 ${on ? '-translate-y-2 scale-110 bg-accent/20 ring-2 ring-accent' : 'active:scale-95'}`}
                >
                  <span className={`block ${on ? 'animate-hover' : ''} ${stuck && !on ? 'opacity-45 grayscale-[0.6]' : ''}`}>
                    <Die3D layout={d.layout} colors={d.colors} base={d.orientation} front={on ? (handFront ?? undefined) : undefined} size={36} />
                  </span>
                  {stuck && (
                    <span aria-hidden="true" className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-[#3a1d27] px-1.5 text-xs leading-4 font-bold whitespace-nowrap text-[#ffb3b3] ring-1 ring-danger/50">
                      놓을 칸 없음
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {handDie && (
            <div className="mt-3 flex animate-fade flex-col gap-2 border-t border-line pt-3">
              {/* 앞면 고르기: 주사위를 좌우로 끌거나 옆면 버튼을 누른다 (같은 일을 하는 조작은 둘만) */}
              <div className="flex items-center gap-2">
                <Die3D layout={handDie.layout} colors={handDie.colors} base={handDie.orientation} front={handFront ?? undefined} size={48} onTurn={turnHand} />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted">
                    앞면 고르기 <span className="font-normal">· 주사위를 좌우로 끌어도 돼요</span>
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
                        <DieFace face={f} color={faceColor(handDie.colors, f)} size={28} showSymbol={false} />
                      </button>
                    )
                  })}
                  </div>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted">
                주사위의 색은 <b className="text-fg">윗면의 색</b>이에요. 앞면은 4라운드에 넘길 때 올라올 면을 정해요.
              </p>
              {legal.some((a) => a.type === 'rerollHand' && a.dieId === handDie.id) && (
                <ConfirmButton
                  key={`reroll-${handDie.id}`}
                  confirmText="한 번 더 누르면 다시 굴려요 · 주머니에서 잔해 1개"
                  onConfirm={() => onAction({ type: 'rerollHand', player: actor as number, dieId: handDie.id })}
                >
                  이 주사위 다시 굴리기 · 잔해 1개 −1점
                </ConfirmButton>
              )}
              {legal.some((a) => a.type === 'discard' && a.dieId === handDie.id) && (
                <ConfirmButton key={handDie.id} confirmText="한 번 더 누르면 버려요 · −1점" onConfirm={() => onAction({ type: 'discard', player: actor as number, dieId: handDie.id })}>
                  잔해로 버리기 · −1점
                </ConfirmButton>
              )}
            </div>
          )}
        </Panel>
      )}

      {/* 4라운드: 자유 넘기기 포기 (⧗ 주사위를 다 넘긴 뒤, §9) */}
      {isMine && round === 4 && canPass && !timeDie && (
        <ConfirmButton key={`pass-${free}`} confirmText="한 번 더 누르면 남은 자유 넘기기를 버리고 끝내요" onConfirm={() => onAction({ type: 'pass', player: actor as number })}>
          자유 넘기기 {free}회 포기하고 끝내기
        </ConfirmButton>
      )}

      {/* 4라운드: 넘기기 */}
      {isMine && round === 4 && timeDie && (
        <Panel title={freeTip ? '자유 넘기기' : '넘기기'} highlight className="animate-rise">
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
                    aria-pressed={sameCell(armedCell, t.to)}
                    aria-label={`${DIRECTION_LABEL[t.direction]} 넘기기, 새 윗면 ${faceLabel(t.orientation.top)}${sameCell(armedCell, t.to) ? ', 한 번 더 누르면 확정' : ''}`}
                    onClick={() => onCell(t.to)}
                    className={`flex min-h-12 items-center gap-1.5 rounded-xl px-3 ring-inset active:scale-95 ${sameCell(armedCell, t.to) ? 'bg-accent/20 ring-[3px] ring-fg' : 'bg-raised ring-1 ring-line'}`}
                  >
                    <span aria-hidden="true" className="font-display text-xl font-bold text-accent">
                      {DIRECTION_ARROW[t.direction]}
                    </span>
                    <DieFace face={t.orientation.top} color={faceColor(timeDie.colors, t.orientation.top)} size={28} showSymbol={false} />
                  </button>
                ))
              )}
            </div>
          </div>
        </Panel>
      )}

      {/* 시장. 내가 이미 가져갔으면 자리만 차지하므로 숨긴다 (보드와 손이 한 화면에 들어오게) */}
      {round !== null && round < 4 && !(actor !== null && state.turn.taken) && (
        <Panel
          title="시장"
          highlight={actor !== null && !state.turn.taken}
          action={
            legal.some((a) => a.type === 'reroll') && (
              <Button variant={ui.rerollMode ? 'secondary' : 'ghost'} size="sm" aria-pressed={ui.rerollMode} onClick={() => patch({ rerollMode: !ui.rerollMode })}>
                {ui.rerollMode ? (
                  '취소'
                ) : (
                  <>
                    <Icon name="reroll" size={18} /> 1개 다시 굴리기
                  </>
                )}
              </Button>
            )
          }
        >
          <MarketView
            market={state.market}
            onSelect={onSlot}
            takeable={canTake}
            selected={slot}
            rerollMode={ui.rerollMode}
            onReroll={(slot, dieId) => {
              onAction({ type: 'reroll', player: actor as number, slot, dieId })
              patch({ rerollMode: false })
            }}
          />
          {/* 고른 칸의 주사위 면 배치 (주사위마다 다름, v0.6) */}
          {slot !== null && slotDice.length > 0 && !ui.rerollMode && (
            <div className="mt-3 flex animate-fade flex-col gap-2 border-t border-line pt-3">
              <p className="text-xs font-bold text-muted">{slot + 1}번 칸 주사위 · 지금 방향의 전개도</p>
              <div className="flex flex-wrap justify-center gap-4">
                {slotDice.map((d) => (
                  <DieNet key={d.id} die={d} size={20} />
                ))}
              </div>
            </div>
          )}
        </Panel>
      )}

        </div>
      </GameShell>
      {errorToast}
      {noticeModal}
      {sheet?.kind === 'menu' && (
        <Sheet title="메뉴" onClose={() => setSheet(null)}>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setSheet({ kind: 'cards' })}>카드 · 목표</Button>
            <Button onClick={() => setSheet({ kind: 'rules' })}>규칙 보기</Button>
          </div>
          <h3 className="m-0 text-sm text-muted">기록</h3>
          <LogList entries={log} />
          {exitWarning ? (
            <ConfirmButton confirmText={exitWarning} onConfirm={onExit}>
              나가기
            </ConfirmButton>
          ) : (
            <Button onClick={onExit}>나가기 · 진행 상황은 저장돼요</Button>
          )}
        </Sheet>
      )}

      {sheet?.kind === 'cards' && (
        <CardsSheet
          state={state}
          seats={seats}
          personalOf={viewer}
          onClose={() => setSheet(null)}
          onRules={() => setSheet({ kind: 'rules' })}
          botSpeed={botSpeed}
          onBotSpeed={onBotSpeed}
        />
      )}
      {sheet?.kind === 'rules' && <RulesSheet onClose={() => setSheet(null)} />}
      {sheet?.kind === 'pillar' && (
        <PillarSheet
          pillar={state.players[sheet.player]?.board.cells[sheet.cell.row]?.[sheet.cell.col] ?? []}
          cell={sheet.cell}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}

/** 보고 있는 보드의 공개 점수 항목 (개인 목표는 비공개라 뺀다) */
function ScoreBreakdown({ state, player }: { state: GameState; player: number }) {
  const s = scoreParts(state, player)
  const parts: [string, number, string][] = [
    ['선', s.line, '#9b8cff'],
    ['평면', s.plane, '#5ad1e6'],
    ['입체', s.tower, '#34C483'],
    ['시간', s.time, '#f2a65a'],
    ['목표', s.goals, '#F5C842'],
    ['잔해', s.debris, '#ff6b6b'],
  ]
  return (
    <dl className="mt-2 flex justify-center gap-1" aria-label="지금 점수 항목">
      {parts.map(([label, value, color]) => (
        <div key={label} className="flex min-w-0 flex-1 items-baseline justify-center gap-1 rounded-lg bg-surface/60 px-1 py-1 ring-1 ring-line ring-inset">
          <dt className="text-xs font-bold" style={{ color }}>
            {label}
          </dt>
          <dd className="font-display text-sm font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** 지금 라운드 목표(공개)와 내 개인 목표(이 기기 사람에게만)의 진행 상태. 누르면 카드 시트 */
function GoalStrip({ state, player, viewer, onOpen }: { state: GameState; player: number; viewer: number | null; onOpen: () => void }) {
  const round = state.phase.kind === 'round' ? state.phase.round : null
  const board = state.players[player]?.board
  const goals = state.roundGoals.filter((g) => g.round === round)
  const me = viewer !== null ? state.players[viewer] : undefined
  const personal = me?.personalGoal ? PERSONAL_GOALS[me.personalGoal] : null
  const events = round === 4 ? (state.time?.events ?? []) : []
  if (!board || (goals.length === 0 && !personal && events.length === 0)) return null
  return (
    <button type="button" onClick={onOpen} className="flex min-h-11 flex-wrap items-center gap-1.5 text-left active:opacity-70" aria-label="목표 카드 자세히 보기">
      {goals.map((g) => {
        const def = ROUND_GOALS[g.id]
        const status =
          g.first === player
            ? '선착 +4'
            : g.achieved.includes(player)
              ? `달성 +${g.round === 4 ? ROUND4_GOAL_POINTS : GOAL_ACHIEVED_POINTS}`
              : def.check(board, state.law)
                ? def.when === 'roundDone'
                  ? g.round === 4
                    ? '충족 · 4라운드 끝 판정'
                    : '충족 · 라운드 끝 판정'
                  : '충족'
                : null
        return (
          <span
            key={g.id}
            className={`flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${status ? 'bg-goal/20 text-goal ring-goal/60' : 'bg-surface/60 text-muted ring-line'}`}
          >
            {status ? <span aria-hidden="true">✓</span> : <Icon name="target" size={13} />}
            <GlyphText text={def.name} />
            {status && <span className="font-display">{status}</span>}
            {!status && g.first !== null && <span className="font-normal">· 선착 끝남</span>}
          </span>
        )
      })}
      {events.map((id) => (
        <span key={id} className="flex min-h-8 items-center gap-1.5 rounded-full bg-event/15 px-3 py-1 text-xs font-bold text-event ring-1 ring-event/50 ring-inset">
          <Icon name="spark" size={13} />
          {EVENTS[id].name}
          <span className="font-normal">· {EVENTS[id].when === 'start' ? '지금 적용' : '끝에 발동'}</span>
        </span>
      ))}
      {personal && me && (
        <span
          className={`flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${personal.check(me) ? 'bg-personal/20 text-personal ring-personal/60' : 'bg-surface/60 text-muted ring-line'}`}
        >
          <Icon name="lock" size={13} />
          <GlyphText text={personal.name} />
          <span className="font-normal">{personal.check(me) ? '· 지금 충족' : '· 아직'}</span>
        </span>
      )}
    </button>
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
            className={`rounded-full px-2 py-0.5 text-xs font-bold transition-all duration-300 ${on ? 'bg-accent text-void shadow-[0_0_14px_rgb(155_140_255/0.7)]' : done ? 'text-accent/80' : 'text-muted'}`}
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
function PassScreen({
  name,
  seat,
  setup,
  round,
  onReady,
  onUndo,
  recent,
}: {
  name: string
  seat: number
  setup: boolean
  round: number | null
  onReady: () => void
  /** 넘기기 전에 바로 전 사람이 방금 수를 되돌릴 수 있으면 */
  onUndo?: () => void
  /** 바로 전 사람의 마지막 수 결과 (보드는 공개 정보) */
  recent: { name: string; seat: number; board: Board; score: number; fresh: FreshDie | null } | null
}) {
  const color = seatColor(seat)
  return (
    <main className="gh-app relative items-center justify-center gap-5 overflow-hidden px-6 py-8 text-center">
      <span aria-hidden="true" className="absolute top-1/3 left-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-3xl" style={{ background: color }} />
      {recent && (
        <section className="relative flex w-full max-w-[260px] animate-rise flex-col items-center gap-1.5 rounded-2xl bg-surface/80 p-3 ring-1 ring-line ring-inset">
          <p className="text-xs text-muted">
            방금 <b style={{ color: seatColor(recent.seat) }}>{recent.name}</b>의 우주 · <span className="font-display font-bold text-fg">{recent.score}점</span>
          </p>
          <div className="w-[200px]">
            <BoardView board={recent.board} compact fresh={recent.fresh} />
          </div>
          {onUndo && (
            <Button variant="ghost" size="sm" onClick={onUndo}>
              ↶ {recent.name}의 방금 수 되돌리기
            </Button>
          )}
        </section>
      )}
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
              className={`animate-rise text-left transition-all duration-200 active:scale-[0.98] ${on ? 'scale-[1.02] drop-shadow-[0_10px_24px_rgb(242_166_90/0.55)]' : picked ? 'opacity-55' : ''}`}
              style={{ animationDelay: `${120 + i * 90}ms` }}
            >
              <Card card={{ kind: 'personal', id }} kindLabel={on ? '✓ 선택함' : `개인 목표 ${i + 1}`} />
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
