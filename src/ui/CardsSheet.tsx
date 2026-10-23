import {
  GOAL_ACHIEVED_POINTS,
  GOAL_FIRST_POINTS,
  LAWS,
  PERSONAL_GOAL_POINTS,
  PERSONAL_GOALS,
  ROUND_GOALS,
  type GameState,
  type PersonalGoalId,
} from '../engine'
import type { Seat } from '../app/session'
import { seatColor } from './colors'
import { Avatar, Button, GameCard, Segmented, Sheet } from './primitives'

interface CardsSheetProps {
  state: GameState
  seats: Seat[]
  /** 이 기기에서 볼 수 있는 개인 목표 (핫시트에서는 지금 차례인 사람 것만) */
  personalOf: number | null
  onClose: () => void
  /** 규칙 한눈에 열기 */
  onRules?: () => void
  /** 봇 속도 설정 */
  botSpeed?: BotSpeed
  onBotSpeed?: (speed: BotSpeed) => void
}

export type BotSpeed = 'slow' | 'normal' | 'fast'

function Who({ players, seats }: { players: number[]; seats: Seat[] }) {
  if (players.length === 0) return <span className="text-muted/70">—</span>
  return (
    <span className="flex flex-wrap gap-1.5">
      {players.map((p) => (
        <span key={p} className="inline-flex items-center gap-1 rounded-full bg-void/60 py-0.5 pr-2 pl-0.5 text-xs font-bold">
          <Avatar name={seats[p]?.name ?? '?'} color={seatColor(p)} size={18} />
          {seats[p]?.name}
        </span>
      ))}
    </span>
  )
}

/** 우주 법칙, 공개된 라운드 목표와 달성 마커, 내 개인 목표 */
export function CardsSheet({ state, seats, personalOf, onClose, onRules, botSpeed, onBotSpeed }: CardsSheetProps) {
  const law = LAWS[state.law]
  const personal: PersonalGoalId | null = personalOf === null ? null : (state.players[personalOf]?.personalGoal ?? null)
  return (
    <Sheet title="카드" onClose={onClose}>
      <GameCard tone="law" kind="우주 법칙" name={law.name} text={law.text} className="animate-rise" />

      {personal && (
        <GameCard
          tone="personal"
          kind={`${seats[personalOf as number]?.name}의 개인 목표 · 비공개`}
          name={personal ? PERSONAL_GOALS[personal].name : ''}
          text={`${PERSONAL_GOALS[personal].text} · 게임 끝에 달성하면 ${PERSONAL_GOAL_POINTS}점`}
          className="animate-rise [animation-delay:60ms]"
        />
      )}

      {state.roundGoals.length === 0 && <p className="py-2 text-center text-sm text-muted">아직 공개된 라운드 목표가 없습니다.</p>}
      {[...state.roundGoals].reverse().map((g, i) => {
        const def = ROUND_GOALS[g.id]
        return (
          <GameCard tone="goal" key={g.id} kind={`${def.round}라운드 목표`} name={def.name} text={def.text} className="animate-rise" >
            <span className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs" style={{ animationDelay: `${(i + 2) * 60}ms` }}>
              <span className="rounded-md bg-goal/15 px-2 py-1 font-display font-bold text-goal">선착 +{GOAL_FIRST_POINTS}</span>
              <Who players={g.first === null ? [] : [g.first]} seats={seats} />
              <span className="rounded-md bg-white/5 px-2 py-1 font-display font-bold text-muted">달성 +{GOAL_ACHIEVED_POINTS}</span>
              <Who players={g.achieved} seats={seats} />
            </span>
          </GameCard>
        )
      })}

      {onRules && (
        <Button block onClick={onRules}>
          📖 규칙 한눈에 보기
        </Button>
      )}
      {botSpeed && onBotSpeed && seats.some((s) => s.kind === 'bot') && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-muted">봇 속도</span>
          <Segmented
            label="봇 속도"
            value={botSpeed}
            onChange={onBotSpeed}
            options={[
              { value: 'slow', label: '느리게' },
              { value: 'normal', label: '보통' },
              { value: 'fast', label: '빠르게' },
            ]}
          />
        </div>
      )}
    </Sheet>
  )
}
