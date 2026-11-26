/** 대관식 연출(design/mockups/05-coronation.html 의 순서). 건너뛰기를 늘 둔다 */
import { useEffect, useState, type CSSProperties } from 'react'
import type { View } from '../engine/game'
import { CardView, Ico, Pawn } from './ui'

export function Coronation({ view, names, onDone }: { view: View; names: string[]; onDone(): void }) {
  const c = view.coronation
  const scores = c?.scores ?? []
  const n = scores.length
  // 0 모임 · 1..n 그림자 공개 · n+1 점수 · n+2 왕관 맴돌기 · n+3 빛 · n+4 내려앉음 · n+5 마왕의 덱
  const [step, setStep] = useState(0)
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const dur = (s: number) => (reduce ? 700 : s === 0 ? 1400 : s <= n ? 1100 : s === n + 1 ? 1200 : s === n + 2 ? 2400 : s === n + 3 ? 300 : s === n + 4 ? 1800 : 2600)
    if (step > n + 5) {
      onDone()
      return
    }
    const t = setTimeout(() => setStep((x) => x + 1), dur(step))
    return () => clearTimeout(t)
  }, [step, n, onDone])
  if (!c) return null

  const kingIndex = scores.findIndex((x) => x.seat === c.king)
  const crowned = step >= n + 4
  const lit = step === n + 3
  const showScores = step >= n + 1
  const maxTotal = Math.max(1, ...scores.map((x) => x.total))
  const unit = Math.min(10, 220 / maxTotal)
  const king = view.players[c.king]

  if (step >= n + 5) {
    return (
      <div className="bc-coronation bcx-overlay" role="dialog" aria-label="마왕의 덱">
        <h2 className="bc-coronation__title" style={{ color: 'var(--bc-umbra-hi)' }}>
          검은 왕 {names[c.king]}
        </h2>
        <p className="bc-coronation__prophecy">너희가 쓴 힘이 돌아온다</p>
        <div className="bcx-stream">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ transform: `rotate(${-14 + i * 8}deg)`, opacity: 1 - i * 0.15 }}>
              <CardView card={{ id: -1 - i, suit: (['blade', 'ward', 'coin', 'lantern', 'blade'] as const)[i] ?? 'blade', rank: [9, 12, 7, 10, 13][i] ?? 9 }} w={48 - i * 3} state="is-cursed" />
            </div>
          ))}
          <Pawn seat={c.king} cls={king?.cls ?? null} demon extra="bc-pawn--lg" />
        </div>
        <div className="bcx-deckcount">
          <b className="bc-num">{view.demon?.deckCount ?? 0}</b>장이 마왕의 덱이 되었다 · 마왕 체력 {view.demon?.hp ?? '??'}
        </div>
        <button type="button" className="bcx-skip" onClick={onDone}>
          최종전으로
        </button>
      </div>
    )
  }

  return (
    <div className={`bc-coronation bcx-overlay ${lit ? 'is-lit' : ''}`} role="dialog" aria-label="대관식">
      {!crowned && <div className="bc-gate" />}
      <h2 className="bc-coronation__title">대관식</h2>
      <p className="bc-coronation__prophecy">가장 빛나는 자가 검은 왕관을 쓰리라</p>
      <div className="bc-stage">
        {scores.map((x, i) => {
          const known = i < step
          const p = view.players[x.seat]
          const isKing = crowned && x.seat === c.king
          return (
            <div key={x.seat} className={`bc-contender ${step === i + 1 ? 'is-revealing' : ''} ${isKing ? 'is-crowned' : ''}`}>
              <span className="bc-contender__score bc-num">{showScores ? x.total : ' '}</span>
              <div className="bc-scorecol" style={{ '--u': `${unit}px` } as CSSProperties}>
                <i className="bc-seg bc-seg--lv" style={{ '--n': x.level } as CSSProperties} />
                <i className="bc-seg bc-seg--fame" style={{ '--n': x.fame } as CSSProperties} />
                {known ? <i className="bc-seg bc-seg--shadow" style={{ '--n': x.shadow * 2 } as CSSProperties} /> : <i className="bc-seg bc-seg--unknown" />}
              </div>
              {isKing ? <Pawn seat={x.seat} cls={p?.cls ?? null} demon /> : <Pawn seat={x.seat} cls={p?.cls ?? null} extra="bc-pawn--lg" />}
              <span className="bc-contender__name">{names[x.seat]}</span>
            </div>
          )
        })}
      </div>
      {step >= 1 && step <= n && scores[step - 1] && (
        <div className="bcx-caption">
          {names[scores[step - 1]!.seat]}의 그림자 {scores[step - 1]!.shadow}. 점수 +{scores[step - 1]!.shadow * 2}
        </div>
      )}
      {step === n + 1 && <div className="bcx-caption">판정 점수 = 레벨 + 명성 + 그림자 × 2</div>}
      {(step === n + 2 || step === n + 3) && (
        <svg className="bc-crown-float" style={{ left: `${((kingIndex + 0.5) / n) * 100}%`, top: '30%' }} viewBox="0 0 32 32" aria-hidden="true">
          <use href="#bc-crown" />
        </svg>
      )}
      {step === n + 2 && <div className="bcx-caption">왕관이 주인을 찾는다…</div>}
      {crowned && <div className="bc-flood" style={{ '--x': `${((kingIndex + 0.5) / n) * 100}%`, '--y': '62%' } as CSSProperties} />}
      {crowned && (
        <div className="bcx-caption bcx-caption--dark">
          <Ico id="bc-crown" /> 검은 왕관이 {names[c.king]}에게 내려앉았다
        </div>
      )}
      <button type="button" className="bcx-skip" onClick={onDone}>
        건너뛰기
      </button>
    </div>
  )
}
