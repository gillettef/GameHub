import { useEffect, type CSSProperties } from 'react'
import { finalScores, PERSONAL_GOALS, type FinalScore, type GameState } from '../engine'
import type { Seat } from '../app/session'
import { BoardView } from './BoardView'
import { DIE_COLORS, seatColor } from './colors'
import { buzz } from './fx'
import { Avatar, Button, Screen } from './primitives'

interface ResultScreenProps {
  state: GameState
  seats: Seat[]
  onHome: () => void
  onReplay?: () => void
  /** 같은 자리·법칙 설정으로 새 게임 (로컬 게임만) */
  onRematch?: () => void
}

const PARTS: { key: keyof Pick<FinalScore, 'line' | 'plane' | 'tower' | 'goals' | 'personalGoal'>; label: string; color: string }[] = [
  { key: 'line', label: '선', color: '#9b8cff' },
  { key: 'plane', label: '평면', color: '#5ad1e6' },
  { key: 'tower', label: '입체', color: '#34C483' },
  { key: 'goals', label: '목표', color: '#F5C842' },
  { key: 'personalGoal', label: '개인', color: '#f2a65a' },
]

const CONFETTI_COLORS = [DIE_COLORS.red.fill, DIE_COLORS.blue.fill, DIE_COLORS.green.fill, DIE_COLORS.yellow.fill, '#9b8cff', '#ffffff']

/** 꽃가루. 위치는 번호로 정해 매번 같은 모양 (렌더 중 난수를 쓰지 않는다) */
function Confetti() {
  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 56 }, (_, i) => {
        const left = (i * 37) % 100
        const delay = ((i * 53) % 900) + (i % 3) * 120
        const dx = (((i * 29) % 60) - 30) * 2
        const size = 6 + (i % 4) * 2
        const style: CSSProperties = {
          left: `${left}%`,
          width: size,
          height: i % 2 ? size : size * 0.45,
          background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          animationDelay: `${delay}ms`,
          borderRadius: i % 5 === 0 ? 999 : 2,
          ['--dx' as string]: `${dx}px`,
          ['--rot' as string]: `${360 + ((i * 47) % 540)}deg`,
        }
        return <span key={i} className="absolute -top-4 animate-confetti" style={style} />
      })}
    </div>
  )
}

const MEDAL = ['🥇', '🥈', '🥉', '4']

/** 점수가 같은 사람이 있으면 순위를 무엇으로 가렸는지 (§10: 잔해가 적은 순 → 가장 높은 기둥 순) */
function tieNote(s: FinalScore, all: FinalScore[]): string | null {
  const same = all.filter((o) => o.player !== s.player && o.total === s.total)
  if (same.length === 0) return null
  if (same.some((o) => o.rank === s.rank)) return `점수·잔해·가장 높은 기둥까지 같아 공동 ${s.rank}위`
  const byDebris = same.every((o) => o.debris !== s.debris)
  return byDebris
    ? `동점 · 잔해 ${-s.debris}개로 순위를 가렸어요`
    : `동점 · 잔해도 같아 가장 높은 기둥(${s.tallestPillar}층)으로 순위를 가렸어요`
}

/** 최종 점수 (§10) */
export function ResultScreen({ state, seats, onHome, onReplay, onRematch }: ResultScreenProps) {
  const scores = finalScores(state)
  const winners = scores.filter((s) => s.rank === 1)
  const max = Math.max(1, ...scores.map((s) => PARTS.reduce((a, p) => a + Math.max(0, s[p.key]), 0)))
  const winnerColor = seatColor(winners[0]?.player ?? 0)

  useEffect(() => buzz([30, 60, 30, 60, 80]), [])

  return (
    <Screen className="pt-8">
      <Confetti />
      <div className="relative flex flex-col items-center gap-2 text-center">
        <span aria-hidden="true" className="absolute top-6 size-56 rounded-full opacity-40 blur-3xl" style={{ background: winnerColor }} />
        <span className="relative animate-drop text-6xl" aria-hidden="true">
          👑
        </span>
        <p className="relative animate-rise font-display text-xs font-semibold tracking-[0.35em] text-accent [animation-delay:100ms]">
          {winners.length > 1 ? 'SHARED VICTORY · 공동 승리' : 'VICTORY · 승리'}
        </p>
        <h1 className="relative animate-rise text-4xl font-black [animation-delay:160ms]">{winners.map((w) => seats[w.player]?.name).join(' · ')}</h1>
      </div>

      <ol className="relative z-10 flex flex-col gap-3">
        {scores.map((s, i) => {
          const player = state.players[s.player]
          const color = seatColor(s.player)
          const goal = player?.personalGoal ? PERSONAL_GOALS[player.personalGoal] : null
          const first = s.rank === 1
          return (
            <li
              key={s.player}
              className={`animate-rise rounded-3xl bg-surface/90 p-4 ring-inset ${first ? 'ring-2' : 'ring-1 ring-line'}`}
              style={{ animationDelay: `${300 + i * 120}ms`, ...(first ? { ['--tw-ring-color' as string]: color, ['--tw-shadow' as string]: `0 16px 40px -16px ${color}` } : {}) }}
            >
              <div className="flex items-center gap-3">
                <span className="w-8 text-center font-display text-2xl font-bold">
                  <span className="sr-only">{s.rank}위</span>
                  <span aria-hidden="true">{MEDAL[s.rank - 1] ?? s.rank}</span>
                </span>
                <Avatar name={seats[s.player]?.name ?? '?'} color={color} size={40} glow={first} />
                <span className="min-w-0 flex-1 truncate text-lg font-bold">{seats[s.player]?.name}</span>
                <span className="font-display text-4xl font-bold" style={{ color }}>
                  <span className="sr-only">{s.total}점</span>
                  <span aria-hidden="true" className="count-up" style={{ ['--to' as string]: s.total, animationDelay: `${450 + i * 120}ms` }} />
                </span>
              </div>

              {/* 항목별 점수 막대 */}
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-void/70" aria-hidden="true">
                {PARTS.map((p) => (
                  <span
                    key={p.key}
                    className="h-full origin-left animate-grow"
                    style={{ width: `${(Math.max(0, s[p.key]) / max) * 100}%`, background: p.color, animationDelay: `${500 + i * 120}ms` }}
                  />
                ))}
              </div>
              <dl className="mt-2 grid grid-cols-6 gap-1 text-center">
                {PARTS.map((p) => (
                  <div key={p.key} className="rounded-lg bg-void/40 py-1">
                    <dt className="text-xs font-bold" style={{ color: p.color }}>
                      {p.label}
                    </dt>
                    <dd className="font-display text-sm font-bold">{s[p.key]}</dd>
                  </div>
                ))}
                <div className="rounded-lg bg-danger/10 py-1">
                  <dt className="text-xs font-bold text-danger">잔해</dt>
                  <dd className="font-display text-sm font-bold">{s.debris}</dd>
                </div>
              </dl>

              {tieNote(s, scores) && <p className="mt-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-fg/90">⚖ {tieNote(s, scores)}</p>}
              {goal && (
                <p className="mt-2 text-xs text-muted">
                  개인 목표 <b className="text-personal">{goal.name}</b> {s.personalGoal > 0 ? '✓ 달성' : '— 미달성'}
                </p>
              )}
              {player && (
                <details className="group mt-2">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-xs font-bold text-accent">
                    <span className="transition-transform group-open:rotate-90">▸</span> 완성된 우주 보기
                  </summary>
                  <div className="mx-auto mt-1 w-[220px]">
                    <BoardView board={player.board} compact />
                  </div>
                </details>
              )}
            </li>
          )
        })}
      </ol>

      <div className="relative z-10 grid grid-cols-2 gap-2">
        {onRematch && (
          <Button variant="primary" size="lg" className="col-span-2" onClick={onRematch}>
            같은 멤버로 한 판 더
          </Button>
        )}
        {onReplay && <Button onClick={onReplay}>리플레이 보기</Button>}
        <Button variant={onRematch ? 'secondary' : 'primary'} className={onReplay ? '' : 'col-span-2'} onClick={onHome}>
          처음으로
        </Button>
      </div>
    </Screen>
  )
}
