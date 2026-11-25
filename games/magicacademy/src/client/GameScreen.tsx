/**
 * 대국 화면 (공통 GameShell 배치, docs/refactor-plan.md 5절):
 * ① 할 일(내 차례·누구 차례)과 개월·주차 ② 친구 줄(학점·능력치, 누르면 그 친구의 카드) ③ 이달의 소식·지금 단계 패널·다음 시험·최근 시험 결과
 * ④ 내 능력치·노트·마법생물·장래희망 ⑤ 굴리기·다시 굴리기·결과 확인·넘어가기·취소 / 끝나면 다시 하기·나가기.
 * ≡ 메뉴: 졸업 목표·친구들(비교표)·기록·규칙·나가기. 주차가 바뀔 때의 알림(Announcements)은 그대로 버튼을 눌러 넘긴다.
 */
import type { RoomSnapshot } from '@gamehub/net'
import { GameShell, PlayerStrip, Sheet, type PlayerChip } from '@gamehub/ui'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Action, View } from '../def'
import { AnnouncementLayer } from './Announcements'
import { FinalReveal } from './FinalReveal'
import { ActivityPhasePanel, ClassPhasePanel, CramPanel, EMPTY_PICKS, ExamInfoPanel, NewsPanel, PlayerStatCard, RollPanel, rollState, TournamentPanel, type RollPicks } from './GameBoard'
import { GoalsPanel } from './Goals'
import { Icon, InlineIcon } from './Icons'
import { PlayerTable } from './PlayerTable'
import { RulesGuide } from './Rules'
import { waitingOn } from './Social'
import { ACTIVITY_LABEL, effectiveStat, STAT_LABEL, type GameState, type StatKey } from './gameTypes'

const SEAT_COLORS = ['#a855f7', '#ec4899', '#0ea5e9', '#22c55e', '#f59e0b']
const STATS: StatKey[] = ['spellPower', 'intelligence', 'stamina', 'charm']
const STAT_SHORT: Record<StatKey, string> = { spellPower: '주', intelligence: '지', stamina: '체', charm: '매' }

export interface GameScreenProps {
  room: RoomSnapshot<View>
  error: string | null
  onAct(action: Action): void
  onLeave(): void
  /** 한 기기: 같은 구성으로 다시 하기, 알림이 떠 있는 동안 봇 멈춤 */
  local?: { again(): void; onBusy(busy: boolean): void; speed: 'normal' | 'fast'; onSpeed(speed: 'normal' | 'fast'): void }
  /** 온라인: 접속이 끊겨 다시 잇는 중 */
  reconnecting?: boolean
}

function phaseText(game: GameState): string {
  switch (game.phase) {
    case 'setup':
      return '선 정하기'
    case 'class':
      return '2주차 정규수업'
    case 'activity':
      return game.activityStage === 'choose' ? '3주차 자율활동 · 고르기' : '3주차 자율활동 · 진행'
    case 'cleanup':
      return '4주차 정리'
    case 'cram':
      return '시험 주간 · 벼락치기'
    case 'midterm_exam':
      return '중간고사'
    case 'final_exam':
      return '기말고사'
    case 'ended':
      return '졸업식'
    default:
      return ''
  }
}

/** 지금 해야 할 일(내 차례일 때) */
function todo(game: GameState, myId: string): string {
  const roll = game.pendingRoll
  if (roll) return roll.entries.find((e) => e.playerId === myId)?.dice ? '결과 확인' : '주사위 굴리기'
  if (game.phase === 'class') return '수업 카드 고르기'
  if (game.phase === 'cram') return '벼락치기'
  if (game.pendingPick) return `${ACTIVITY_LABEL[game.pendingPick.activityId]} 카드 고르기`
  if (game.phase === 'activity') return '활동 카드 고르기'
  return ''
}

/** 알림을 몇 초 보여 주고 지운다(같은 문구가 다시 와도 새로 보인다) */
function useFlash(message: string | null, ms = 4000): string | null {
  const [shown, setShown] = useState<string | null>(null)
  const [last, setLast] = useState<string | null>(null)
  if (message !== last) {
    setLast(message)
    setShown(message)
  }
  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(null), ms)
    return () => clearTimeout(t)
  }, [shown, ms])
  return shown
}

/** ④ 내 영역: 능력치·노트·마법생물·장래희망 한 줄 요약. 누르면 내 카드 전부 */
function MyArea({ game, me, onOpen }: { game: GameState; me: GameState['players'][string]; onOpen(): void }) {
  const notes = me.notes ?? []
  const noteCount = (s: StatKey) => notes.filter((n) => n === s).length
  return (
    <button type="button" className="flex min-h-14 w-full flex-col gap-1 px-3 py-2 text-left" onClick={onOpen} aria-label="내 카드 자세히 보기">
      <span className="flex w-full flex-wrap items-center gap-1.5 text-sm">
        <b className="mr-1 font-display text-purple-700">나</b>
        {STATS.map((s) => (
          <span key={s} className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-800">
            {STAT_LABEL[s]} <b>{effectiveStat(me, s)}</b>
          </span>
        ))}
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
          학점 <b>{me.credit}</b>
        </span>
      </span>
      <span className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-purple-600">
        {game.rules.skillRules && (
          <span>
            <InlineIcon name="note" /> 노트 {notes.length}/{effectiveStat(me, 'intelligence')}
            {notes.length > 0 && ` (${(['intelligence', 'stamina', 'charm', 'spellPower'] as StatKey[]).filter((s) => noteCount(s) > 0).map((s) => `${STAT_SHORT[s]}${noteCount(s)}`).join(' ')})`}
          </span>
        )}
        <span>
          <InlineIcon name="paw" /> 마법생물 {me.creatures.length}
        </span>
        {me.dream && game.rules.dreamCredit > 0 && (
          <span className="truncate">
            <InlineIcon name="compass" /> 꿈: {me.dream.name}
          </span>
        )}
      </span>
    </button>
  )
}

type Tab = 'goals' | 'players' | 'log' | 'rules'
const TABS: { id: Tab; label: string }[] = [
  { id: 'goals', label: '졸업 목표' },
  { id: 'players', label: '친구들' },
  { id: 'log', label: '기록' },
  { id: 'rules', label: '규칙' },
]

export function GameScreen({ room, error, onAct, onLeave, local, reconnecting }: GameScreenProps) {
  const v = room.view!
  const game = v.game
  // 관전은 아무 좌석도 아니다(행동 버튼 없이 공개 정보만)
  const myId = v.me ?? ''
  const me = v.me ? game.players[v.me] : undefined
  const ended = game.phase === 'ended'
  const [menu, setMenu] = useState<Tab | null>(null)
  const [player, setPlayer] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [picks, setPicksRaw] = useState<RollPicks>(EMPTY_PICKS)
  const [duelPicking, setDuelPicking] = useState(false)
  // 굴림·차례가 바뀌면 고르던 것을 비운다
  const rollKey = `${game.pendingRoll?.title ?? ''}:${game.pendingRoll?.entries.find((e) => !e.confirmed)?.playerId ?? ''}:${room.version}`
  const [pickKey, setPickKey] = useState(rollKey)
  if (pickKey !== rollKey) {
    setPickKey(rollKey)
    if (picks.selected.length > 0) setPicksRaw({ ...picks, selected: [] })
  }
  const actorKey = waitingOn(game).join()
  const [lastActor, setLastActor] = useState(actorKey)
  if (lastActor !== actorKey) {
    setLastActor(actorKey)
    setPicksRaw(EMPTY_PICKS)
    setDuelPicking(false)
  }
  const flash = useFlash(error)
  const onBusy = local?.onBusy
  const busy = useCallback((b: boolean) => onBusy?.(b), [onBusy])

  const seatOfId = (id: string) => game.turnOrder.indexOf(id)
  const waiting = waitingOn(game)
  const actorId = waiting[0]
  const myTurn = !!v.me && actorId === v.me
  const actorName = actorId ? (game.players[actorId]?.name ?? '') : ''
  const offlineIds = room.seats.flatMap((s, i) => (s.kind === 'human' && !s.online ? [`p${i}`] : []))

  const status = ended
    ? '게임 끝! 졸업식'
    : myTurn
      ? `내 차례 · ${todo(game, myId)}`
      : actorId
        ? `${actorName} 차례 · ${todo(game, actorId)}`
        : game.phase === 'activity'
          ? '활동을 차례대로 진행하는 중'
          : phaseText(game)
  const detail = `${game.round}/12개월 · ${phaseText(game)}${game.news && !ended && game.phase !== 'setup' ? ` · ${game.news.name}` : ''}`

  const chips: PlayerChip[] = game.turnOrder.map((id, i) => {
    const p = game.players[id]!
    return {
      id: i,
      name: p.name,
      color: SEAT_COLORS[i % SEAT_COLORS.length]!,
      score: p.credit,
      detail: STATS.map((s) => `${STAT_SHORT[s]}${effectiveStat(p, s)}`).join(' '),
      active: waiting.includes(id),
      you: id === v.me,
      offline: offlineIds.includes(id),
    }
  })

  // ⑤ 행동 줄
  const rs = me ? rollState(game, myId, picks) : null
  const pick = game.pendingPick
  const canSkipPick = !!pick && pick.playerId === v.me && (pick.activityId === 'creature' || pick.activityId === 'lab')
  let actions: ReactNode
  if (ended) {
    actions = local ? (
      <>
        <button type="button" className="min-h-12 rounded-2xl bg-purple-500 font-semibold text-white active:scale-95" onClick={local.again}>
          <Icon name="sparkle" className="mr-1 h-5 w-5" />한 판 더
        </button>
        <button type="button" className="min-h-12 rounded-2xl bg-pink-100 text-pink-700 active:scale-95" onClick={onLeave}>
          처음으로
        </button>
      </>
    ) : (
      <button type="button" className="min-h-12 rounded-2xl bg-purple-500 font-semibold text-white active:scale-95" onClick={onLeave}>
        처음 화면으로
      </button>
    )
  } else if (rs?.canRoll) {
    actions = (
      <button
        type="button"
        className="min-h-12 rounded-2xl bg-pink-500 text-lg font-semibold text-white active:scale-95"
        onClick={() => onAct({ type: 'roll', ...(rs.choiceMax !== undefined ? { count: rs.chosenCount } : {}), ...(picks.assist > 0 ? { assist: picks.assist } : {}) })}
      >
        <Icon name="dice" className="mr-1 h-6 w-6" />
        {rs.rollDice > 1 ? `주사위 ${rs.rollDice}개 굴리기` : '주사위 굴리기'}
      </button>
    )
  } else if (rs?.canConfirm) {
    actions = (
      <>
        {rs.canReroll && (
          <button
            type="button"
            disabled={!rs.rerollOk}
            className="min-h-12 rounded-2xl bg-sky-500 font-semibold text-white active:scale-95 disabled:bg-gray-200 disabled:text-gray-600"
            onClick={() => {
              onAct({ type: 'reroll', dice: rs.selected })
              setPicksRaw({ ...picks, selected: [] })
            }}
          >
            {rs.selected.length === 0 ? '주사위를 골라 다시 굴리기' : `${rs.selected.length}개 다시 굴리기`}
          </button>
        )}
        <button type="button" className="min-h-12 rounded-2xl bg-purple-500 font-semibold text-white active:scale-95" onClick={() => onAct({ type: 'confirm' })}>
          <Icon name="check" className="mr-1 h-5 w-5" />
          결과 확인
        </button>
      </>
    )
  } else if (myTurn && game.phase === 'class' && !game.pendingRoll) {
    actions = (
      <button type="button" className="min-h-12 rounded-2xl border-2 border-purple-200 bg-white text-purple-700 active:scale-95" onClick={() => onAct({ type: 'class', cardId: null, mode: 'learn' })}>
        가져가지 않고 넘어가기
      </button>
    )
  } else if (myTurn && game.phase === 'activity' && game.activityStage === 'choose' && duelPicking) {
    actions = (
      <button type="button" className="min-h-12 rounded-2xl border-2 border-purple-200 bg-white text-purple-700 active:scale-95" onClick={() => setDuelPicking(false)}>
        지목 취소
      </button>
    )
  } else if (canSkipPick) {
    actions = (
      <button type="button" className="min-h-12 rounded-2xl border-2 border-purple-200 bg-white text-purple-700 active:scale-95" onClick={() => onAct({ type: 'pick', cardId: null })}>
        가져가지 않고 넘어가기
      </button>
    )
  } else {
    actions = (
      <p className="m-0 flex min-h-12 items-center justify-center text-center text-sm text-muted">
        {myTurn ? '위에서 골라 주세요' : actorId ? `${actorName}님을 기다리는 중…` : ended ? '' : '잠시 기다려 주세요…'}
      </p>
    )
  }

  const actorOffline = !!actorId && offlineIds.includes(actorId) && actorId !== v.me
  const notice = flash ?? (reconnecting ? '연결이 끊겨 다시 연결하는 중이에요…' : actorOffline ? `${actorName}님의 연결이 끊겼어요. 돌아올 때까지 기다려요` : null)
  const latestExam = game.examResults[game.examResults.length - 1]
  const lastLog = game.log[game.log.length - 1]

  return (
    <>
      <GameShell
        status={status}
        detail={detail}
        onMenu={() => setMenu('goals')}
        players={<PlayerStrip players={chips} onSelect={(i) => setPlayer(game.turnOrder[i] ?? null)} />}
        hand={me && !ended ? <MyArea game={game} me={me} onOpen={() => setPlayer(myId)} /> : undefined}
        actions={actions}
        notice={notice}
      >
        <div className="absolute inset-0 flex flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3" data-testid="board">
          {ended && <FinalReveal game={game} />}
          {game.news && game.phase !== 'setup' && !ended && <NewsPanel game={game} />}
          {game.phase === 'cram' && me && <CramPanel game={game} myId={myId} onCram={(from) => onAct({ type: 'cram', from })} />}
          {game.pendingRoll && <RollPanel game={game} myId={myId} picks={picks} onPicks={setPicksRaw} onNote={(stat) => onAct({ type: 'note', stat })} />}
          {game.phase === 'class' && !game.pendingRoll && me && <ClassPhasePanel game={game} myId={myId} onTake={(cardId, mode) => onAct({ type: 'class', cardId, mode })} />}
          {game.phase === 'activity' && (me || game.activityStage === 'resolve') && (
            <ActivityPhasePanel
              game={game}
              myId={myId}
              onSelect={(activityId, target, cardId) => {
                setDuelPicking(false)
                onAct({ type: 'select', activityId, ...(target !== undefined ? { target } : {}), ...(cardId !== undefined ? { cardId } : {}) })
              }}
              onPick={(cardId) => onAct({ type: 'pick', cardId })}
              duelPicking={duelPicking}
              onDuelPicking={setDuelPicking}
            />
          )}
          {!ended && <ExamInfoPanel game={game} />}
          {latestExam && (
            <div className="rounded-3xl border-2 border-sky-200 bg-sky-50 p-3 text-sm">
              <p className="mb-1 font-display text-base text-sky-700">
                <InlineIcon name="note" /> {latestExam.round === game.rules.midtermRound ? '중간고사' : '기말고사'} 결과 · {latestExam.card.name}
              </p>
              {latestExam.scores.map((s) => (
                <p key={s.playerId} className="text-sky-800">
                  {s.rank}위 {game.players[s.playerId]?.name} — 점수 {s.score}, 학점 +{s.creditAwarded}
                </p>
              ))}
            </div>
          )}
          {lastLog && (
            <button type="button" className="min-h-11 rounded-3xl border-2 border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-900 active:scale-95" onClick={() => setMenu('log')}>
              <span className="font-display text-amber-700">
                <InlineIcon name="scroll" /> 방금 일어난 일
              </span>
              <span className="block truncate">{lastLog.message}</span>
            </button>
          )}
        </div>
      </GameShell>

      <Sheet open={menu !== null} title="메뉴" onClose={() => setMenu(null)}>
        <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-raised p-1" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={menu === t.id} className={`min-h-11 rounded-lg text-sm ${menu === t.id ? 'bg-surface font-bold' : 'text-muted'}`} onClick={() => setMenu(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {menu === 'goals' && (me ? <GoalsPanel game={game} myId={myId} onChooseDream={() => {}}>{!game.rules.tournamentCards && <TournamentPanel game={game} myId={myId} />}</GoalsPanel> : <p className="text-sm text-muted">관전 중에는 장래희망이 보이지 않아요.</p>)}
        {menu === 'players' && (
          <div className="flex flex-col gap-2">
            <PlayerTable game={game} myId={myId} offline={offlineIds} onOpenPlayer={(id) => setPlayer(id)} />
          </div>
        )}
        {menu === 'log' && (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 pb-3 text-sm text-purple-900">
            {game.log.length === 0 && <li className="text-muted">아직 소식이 없어요</li>}
            {game.log
              .slice(-60)
              .reverse()
              .map((entry, i) => (
                <li key={game.log.length - i} className="border-b border-line pb-1.5">
                  <span className="mr-1 text-xs text-muted">{entry.round}개월</span>
                  {entry.message}
                </li>
              ))}
          </ul>
        )}
        {menu === 'rules' && <RulesGuide />}
        {local && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-muted">봇 속도</span>
            {(['normal', 'fast'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={local.speed === s} className={`min-h-11 flex-1 rounded-lg border-2 bg-surface ${local.speed === s ? 'border-primary font-bold' : 'border-transparent'}`} onClick={() => local.onSpeed(s)}>
                {s === 'normal' ? '보통' : '빠르게'}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 mb-2">
          {leaving ? (
            <div className="flex flex-col gap-2 rounded-2xl bg-pink-50 p-3 text-sm text-pink-800">
              <p className="m-0">{local ? '이 판은 저장돼요. 처음 화면의 이어 하기로 돌아올 수 있어요.' : room.you === null ? '관전을 그만둘까요?' : ended ? '처음 화면으로 갈까요?' : '나가면 내 자리는 봇이 이어받고 다시 돌아올 수 없어요.'}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="min-h-12 rounded-xl bg-pink-500 font-semibold text-white" onClick={onLeave}>
                  나가기
                </button>
                <button type="button" className="min-h-12 rounded-xl border-2 border-pink-200 bg-white" onClick={() => setLeaving(false)}>
                  계속하기
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="min-h-12 w-full rounded-xl border-2 border-pink-200 bg-white text-pink-700" onClick={() => setLeaving(true)}>
              <Icon name="door" className="mr-1 h-5 w-5" />
              {local ? '처음 화면으로' : '방 나가기'}
            </button>
          )}
        </div>
      </Sheet>

      <Sheet open={player !== null} title={player ? `${game.players[player]?.name ?? ''}${player === v.me ? ' (나)' : ''}` : ''} onClose={() => setPlayer(null)}>
        {player && game.players[player] && (
          <div className="pb-3">
            <PlayerStatCard key={player} player={game.players[player]!} isMe={player === v.me} rules={game.rules} defaultOpen />
            {seatOfId(player) >= 0 && room.seats[seatOfId(player)]?.kind === 'bot' && <p className="mt-2 text-xs text-muted">봇이 두는 자리예요</p>}
          </div>
        )}
      </Sheet>

      {me && <AnnouncementLayer key={myId} game={game} myId={myId} onBusy={busy} />}
    </>
  )
}
