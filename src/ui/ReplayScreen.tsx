import { useEffect, useMemo, useState } from 'react'
import { replay, type Session } from '../app/session'
import { BoardView } from './BoardView'
import { describeAction } from './describe'
import { seatColor } from './colors'
import { GlyphText } from './DieFace'
import { Avatar, Button, Screen, TopBar } from './primitives'
import { Icon } from './icons'

interface ReplayScreenProps {
  session: Session
  onBack: () => void
}

/** 자동 재생 때 한 단계마다 기다리는 시간 */
const AUTOPLAY_MS = 800

/** 리플레이 (로드맵 9단계): 행동 기록을 한 단계씩 다시 재생 */
export function ReplayScreen({ session, onBack }: ReplayScreenProps) {
  const total = session.actions.length
  const [step, setStep] = useState(total)
  const [autoplay, setAutoplay] = useState(false)
  // 끝에 닿으면 저절로 멈춘 것으로 본다
  const playing = autoplay && step < total
  const state = useMemo(() => replay(session, step), [session, step])
  const before = useMemo(() => (step > 0 ? replay(session, step - 1) : null), [session, step])
  const last = session.actions[step - 1]

  // 자동 재생: 한 단계씩 넘긴다
  useEffect(() => {
    if (!playing) return
    const timer = setTimeout(() => setStep(step + 1), AUTOPLAY_MS)
    return () => clearTimeout(timer)
  }, [playing, step])
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
        <GlyphText text={last ? describeAction(last, before, session.seats) : '게임 시작'} />
      </p>
      <input
        className="h-11 w-full accent-[#9b8cff]"
        type="range"
        min={0}
        max={total}
        value={step}
        aria-label="재생 위치"
        onChange={(e) => {
          setAutoplay(false)
          setStep(Number(e.target.value))
        }}
      />
      <div className="grid grid-cols-3 gap-2">
        <Button
          disabled={step === 0}
          onClick={() => {
            setAutoplay(false)
            setStep(step - 1)
          }}
        >
          <Icon name="prev" size={14} /> 이전
        </Button>
        <Button
          variant="primary"
          aria-pressed={playing}
          onClick={() => {
            // 끝에서 누르면 처음부터 다시 재생
            if (!playing && step >= total) setStep(0)
            setAutoplay(!playing)
          }}
        >
          {playing ? (
            <>
              <Icon name="pause" size={16} /> 멈춤
            </>
          ) : (
            <>
              <Icon name="play" size={16} /> 재생
            </>
          )}
        </Button>
        <Button
          disabled={step === total}
          onClick={() => {
            setAutoplay(false)
            setStep(step + 1)
          }}
        >
          다음 <Icon name="next" size={14} />
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
