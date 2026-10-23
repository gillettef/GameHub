import { useMemo, useState } from 'react'
import { replay, type Session } from '../app/session'
import { BoardView } from './BoardView'
import { seatColor } from './colors'
import { Avatar, Button, Screen, TopBar } from './primitives'

interface ReplayScreenProps {
  session: Session
  onBack: () => void
}

function describe(session: Session, index: number): string {
  const a = session.actions[index]
  if (!a) return '게임 시작'
  const name = session.seats[a.player]?.name ?? `${a.player + 1}번`
  switch (a.type) {
    case 'choosePersonalGoal':
      return `${name}: 개인 목표 선택`
    case 'reroll':
      return `${name}: ${a.slot + 1}번 칸 주사위 다시 굴림`
    case 'takeSlot':
      return `${name}: 시장 ${a.slot + 1}번 칸 가져옴`
    case 'place':
      return `${name}: ${a.row + 1}행 ${a.col + 1}열에 놓음`
    case 'discard':
      return `${name}: 잔해로 버림`
    case 'roll':
      return `${name}: ⧗ 주사위 굴림 (${{ forward: '앞', back: '뒤', left: '왼쪽', right: '오른쪽' }[a.direction]})`
    case 'scrap':
      return `${name}: 굴릴 수 없는 ⧗ 주사위를 잔해로`
  }
}

/** 리플레이 (로드맵 9단계): 행동 기록을 한 단계씩 다시 재생 */
export function ReplayScreen({ session, onBack }: ReplayScreenProps) {
  const total = session.actions.length
  const [step, setStep] = useState(total)
  const state = useMemo(() => replay(session, step), [session, step])
  const last = session.actions[step - 1]
  return (
    <Screen>
      <TopBar
        left={
          <Button variant="ghost" size="sm" onClick={onBack}>
            뒤로
          </Button>
        }
        title={
          <span className="font-display">
            리플레이 <span className="text-accent">{step}</span>/{total}
          </span>
        }
      />
      <p key={step} className="animate-fade rounded-2xl bg-surface/70 px-4 py-3 text-center text-sm font-bold ring-1 ring-line ring-inset">
        {describe(session, step - 1)}
      </p>
      <input
        className="h-11 w-full accent-[#9b8cff]"
        type="range"
        min={0}
        max={total}
        value={step}
        aria-label="재생 위치"
        onChange={(e) => setStep(Number(e.target.value))}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
          ◀ 이전
        </Button>
        <Button disabled={step === total} onClick={() => setStep(step + 1)}>
          다음 ▶
        </Button>
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {state.players.map((p) => {
          const active = last?.player === p.id
          return (
            <li key={p.id} className={`flex flex-col gap-2 rounded-2xl bg-surface/70 p-2.5 ring-inset ${active ? 'ring-2' : 'ring-1 ring-line'}`} style={active ? { ['--tw-ring-color' as string]: seatColor(p.id) } : undefined}>
              <span className="flex items-center gap-1.5 text-xs font-bold">
                <Avatar name={session.seats[p.id]?.name ?? '?'} color={seatColor(p.id)} size={20} />
                <span className="truncate">{session.seats[p.id]?.name}</span>
                {p.debris.length > 0 && <span className="ml-auto text-danger">잔해 {p.debris.length}</span>}
              </span>
              <BoardView
                board={p.board}
                compact
                fresh={active && last && (last.type === 'place' || last.type === 'roll') ? { dieId: last.dieId, anim: last.type === 'place' ? 'drop' : last.direction } : null}
              />
            </li>
          )
        })}
      </ul>
    </Screen>
  )
}
