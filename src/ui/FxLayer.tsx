import { useEffect } from 'react'
import { LAWS, ROUND_GOALS, type GameState } from '../engine'
import type { Seat } from '../app/session'
import { ROUND_INFO, seatColor } from './colors'
import { buzz, type FxEvent } from './fx'
import { GlyphText } from './DieFace'
import { Avatar } from './primitives'

interface FxLayerProps {
  events: FxEvent[]
  state: GameState
  seats: Seat[]
}

/**
 * 직전 행동으로 생긴 사건을 한 번 보여 주는 겹침 레이어.
 * 부모가 행동 수를 key로 주므로 행동마다 새로 마운트되어 CSS 애니메이션이 다시 돈다.
 * 터치를 막지 않는다 (pointer-events: none).
 */
export function FxLayer({ events, state, seats }: FxLayerProps) {
  const round = events.find((e) => e.kind === 'round')
  const turn = events.find((e) => e.kind === 'turn')
  const pops = events.filter((e) => e.kind === 'goal' || e.kind === 'debris' || e.kind === 'plane')
  // 화면을 읽는 사람에게는 GameScreen의 aria-live 요약(fxSummary)으로 같은 내용을 알린다

  useEffect(() => {
    if (events.some((e) => e.kind === 'goal')) buzz([20, 60, 30])
    else if (round) buzz([15, 40, 15])
    else if (events.some((e) => e.kind === 'debris')) buzz([40])
  }, [events, round])

  if (events.length === 0) return null
  const name = (p: number) => seats[p]?.name ?? `${p + 1}번`

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
      {round?.kind === 'round' && <RoundSplash round={round.round} state={state} />}

      {turn?.kind === 'turn' && !round && (
        <div className="absolute inset-x-0 top-[max(12px,env(safe-area-inset-top))] flex animate-banner justify-center">
          <div
            className="flex items-center gap-2.5 rounded-full bg-surface/95 py-1.5 pr-5 pl-1.5 shadow-[0_10px_30px_rgb(0_0_0/0.5)] ring-1"
            style={{ ['--tw-ring-color' as string]: seatColor(turn.player) }}
          >
            <Avatar name={name(turn.player)} color={seatColor(turn.player)} size={30} />
            <span className="font-bold">{name(turn.player)} 차례</span>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 top-[38%] flex flex-col items-center gap-2">
        {pops.map((e, i) => {
          const text =
            e.kind === 'goal'
              ? `${name(e.player)} · ${e.name} ${e.first ? '선착' : '달성'}`
              : e.kind === 'debris'
                ? `${name(e.player)} · 잔해`
                : `${name(e.player)} · 평면 점수 확정`
          const points = e.kind === 'goal' ? `+${e.points}` : e.kind === 'debris' ? `−${e.count}` : `${e.points}점`
          const tone = e.kind === 'goal' ? (e.first ? '#5ad1e6' : '#9b8cff') : e.kind === 'debris' ? '#ff6b6b' : '#34c483'
          return (
            <div
              key={i}
              className="flex animate-float items-center gap-3 rounded-2xl bg-void/90 px-4 py-2.5 shadow-[0_12px_40px_rgb(0_0_0/0.55)] ring-2"
              style={{ ['--tw-ring-color' as string]: tone, animationDelay: `${(round ? 1500 : 0) + i * 160}ms` }}
            >
              {e.kind === 'goal' && e.first && <span aria-hidden="true">👑</span>}
              <span className="text-sm font-bold">{text}</span>
              <span className="font-display text-2xl font-bold" style={{ color: tone }}>
                {points}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RoundSplash({ round, state }: { round: 1 | 2 | 3 | 4; state: GameState }) {
  const info = ROUND_INFO[round - 1]
  if (!info) return null
  const goals = state.roundGoals.filter((g) => g.round === round)
  const lawNote = round >= 3 && (state.law === 'flat' || state.law === 'inverted') ? LAWS[state.law] : null
  return (
    <div className="absolute inset-0 flex animate-splash flex-col items-center justify-center gap-3 bg-void/95 px-8 text-center">
      <div className="relative">
        <span className="absolute inset-0 -z-10 rounded-full bg-accent/40 blur-3xl" aria-hidden="true" />
        <span className="block animate-drop font-display text-[120px] leading-none font-bold text-transparent [-webkit-text-stroke:2px_#9b8cff]">{round}</span>
      </div>
      <p className="animate-rise font-display text-sm font-semibold tracking-[0.3em] text-accent [animation-delay:120ms]">
        ROUND {round} · {info.dim}
      </p>
      <h2 className="animate-rise text-4xl font-black [animation-delay:180ms]">{info.name}의 세계</h2>
      <p className="max-w-[300px] animate-rise text-sm text-muted italic [animation-delay:240ms]">“{info.quote}”</p>
      <p className="mt-2 max-w-[300px] animate-rise rounded-xl bg-white/5 px-4 py-2 text-sm [animation-delay:300ms]">
        <GlyphText text={info.hint} />
      </p>
      {lawNote && <p className="max-w-[300px] text-xs text-law">우주 법칙 · {lawNote.name}: {lawNote.text}</p>}
      {goals.length > 0 && (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {goals.map((g) => (
            <span key={g.id} className="rounded-full bg-goal/15 px-3 py-1 text-xs font-bold text-goal ring-1 ring-goal/40">
              목표 · {ROUND_GOALS[g.id].name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
