import { useState } from 'react'
import { GOAL_ACHIEVED_POINTS, GOAL_FIRST_POINTS, type GameState, type PersonalGoalId, type RoundGoalCard } from '../engine'
import type { Seat } from '../app/session'
import { seatColor } from './colors'
import { Card, CardZoom } from './Card'
import type { CardKey } from './cardArtData'
import { Avatar, Button, Segmented, Sheet } from './primitives'
import { Icon } from './icons'

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

/** 라운드 목표 카드 위의 달성 마커 (선착 칸 1개, 달성 칸 여럿) */
function Markers({ card, seats }: { card: RoundGoalCard; seats: Seat[] }) {
  return (
    <span className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 border-t border-line pt-2.5 text-xs">
      <span className="rounded-md bg-goal/15 px-2 py-1 font-display font-bold text-goal">선착 +{GOAL_FIRST_POINTS}</span>
      <Who players={card.first === null ? [] : [card.first]} seats={seats} />
      <span className="rounded-md bg-white/5 px-2 py-1 font-display font-bold text-muted">달성 +{GOAL_ACHIEVED_POINTS}</span>
      <Who players={card.achieved} seats={seats} />
    </span>
  )
}

/** 우주 법칙, 공개된 라운드 목표와 달성 마커, 내 개인 목표 */
export function CardsSheet({ state, seats, personalOf, onClose, onRules, botSpeed, onBotSpeed }: CardsSheetProps) {
  const personal: PersonalGoalId | null = personalOf === null ? null : (state.players[personalOf]?.personalGoal ?? null)
  const personalLabel = personalOf !== null ? `${seats[personalOf]?.name}의 개인 목표` : undefined
  const [zoom, setZoom] = useState<CardKey | null>(null)
  const zoomGoal = zoom?.kind === 'goal' ? state.roundGoals.find((g) => g.id === zoom.id) : undefined
  return (
    <Sheet title="카드" onClose={onClose}>
      <div className="animate-rise">
        <Card card={{ kind: 'law', id: state.law }} onOpen={() => setZoom({ kind: 'law', id: state.law })} />
      </div>

      {personal && (
        <div className="animate-rise [animation-delay:60ms]">
          <Card card={{ kind: 'personal', id: personal }} kindLabel={personalLabel} onOpen={() => setZoom({ kind: 'personal', id: personal })} />
        </div>
      )}

      {state.roundGoals.length === 0 && <p className="py-2 text-center text-sm text-muted">아직 공개된 라운드 목표가 없습니다.</p>}
      {[...state.roundGoals].reverse().map((g, i) => (
        <div key={g.id} className="animate-rise" style={{ animationDelay: `${(i + 2) * 60}ms` }}>
          <Card card={{ kind: 'goal', id: g.id }} onOpen={() => setZoom({ kind: 'goal', id: g.id })}>
            <Markers card={g} seats={seats} />
          </Card>
        </div>
      ))}
      {zoom && (
        <CardZoom card={zoom} kindLabel={zoom.kind === 'personal' ? personalLabel : undefined} onClose={() => setZoom(null)}>
          {zoomGoal && <Markers card={zoomGoal} seats={seats} />}
        </CardZoom>
      )}

      {onRules && (
        <Button block onClick={onRules}>
          <Icon name="codex" size={18} /> 규칙 한눈에 보기
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
