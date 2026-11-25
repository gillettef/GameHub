// 대국 화면. 배치(docs/refactor-plan.md 5절):
// ① 차례·할 일, 라운드·덱·버림 ② 플레이어(차례 순서, 손패·패러독스, 탭하면 상세) ③ 결말 3장(결정 원인)과 시간선
// ④ 내 손패·비밀 목표 ⑤ 교체·패스·놓기 / 추리하기 / 결과 · ≡ 기록·설정·규칙·나가기
import type { RoomSnapshot } from '@gamehub/net'
import { Button, GameShell, PlayerStrip, ResultList, Sheet, inviteLink, shareLink } from '@gamehub/ui'
import { useEffect, useRef, useState } from 'react'
import type { Action, SeatView } from '../def'
import { describe } from '../describe'
import { CARD, FIGURES, illegalReason, legalSlots } from '../engine/engine'
import type { Figure } from '../engine/types'
import { FIG_COLOR, SPEEDS, fact, store } from './cards'
import { Rulebook, RulesText } from './RulesText'
import { CardFace, EndingChip, Timeline } from './Timeline'

/** 플레이어 패널의 차례 순서 색(이 게임에는 좌석 색이 없다) */
const SEAT_COLOR = ['#d9a441', '#e0603a', '#6fbf73', '#5b9bd5', '#b07ad9']
const WHY = { condition: '조건이 거짓인 칸', ending: '결말과 어긋나는 칸', occupied: '찬 칸' } as const

/** 한 기기 대전에서만: 다시 하기, 봇 속도 */
export interface LocalControls {
  again(): void
  speed: number
  setSpeed(ms: number): void
}

export interface TableProps {
  room: RoomSnapshot<SeatView>
  error: string | null
  onAct(a: Action): void
  onLeave(): void
  local?: LocalControls
}

const FigName = ({ f }: { f: Figure }) => (
  <b className="brightness-150" style={{ color: FIG_COLOR[f] }}>
    {f}
  </b>
)

export function Table({ room, error, onAct, onLeave, local }: TableProps) {
  const v = room.view!
  const [menu, setMenu] = useState(false)
  const [detail, setDetail] = useState<number | null>(null)
  const [resultOpen, setResultOpen] = useState(false)
  const [autoResult, setAutoResult] = useState(false)
  const [guessOpen, setGuessOpen] = useState(false)
  const [autoGuess, setAutoGuess] = useState(false)
  const [exchangeAsk, setExchangeAsk] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [showMotive, setShowMotive] = useState(false)
  const [showStates, setShowStates] = useState(() => store.get('states', true))
  const [hint, setHint] = useState<string | null>(null)
  const [shared, setShared] = useState<string | null>(null)
  // 고른 카드·칸은 그 상태(version)에서만 유효하다
  const [pick, setPick] = useState<{ version: number; card: string | null; target: number | null }>({ version: -1, card: null, target: null })
  const timeline = useRef<HTMLDivElement>(null)

  const me = v.me
  const humans = room.seats.filter((s) => s.kind === 'human').length
  const hotseat = !!local && humans > 1
  const nameOf = (p: number) => v.names[p] ?? `${p + 1}번`
  const mine = v.phase === 'play' && me !== null && room.you !== null && room.actors.includes(room.you)
  const card = mine && pick.version === room.version && pick.card && v.hand.includes(pick.card) ? pick.card : null
  const target = card && pick.version === room.version ? pick.target : null
  const legal = card ? legalSlots(v.timeline, card, v.endings) : []
  const canPass = v.deckCount === 0 || v.timeline.every(Boolean)
  const needGuess = v.phase === 'guess' && me !== null && !v.guessed[me]
  const guessedCount = v.guessed.filter(Boolean).length
  const inProgress = v.phase !== 'over' && (local ? humans > 0 : room.you !== null)

  // 새 기록이 생기면: 연쇄 정리·종료 라운드 알림(옛 화면의 토스트)
  const [seen, setSeen] = useState({ len: v.history.length, final: v.finalRound })
  if (seen.len !== v.history.length || seen.final !== v.finalRound) {
    setSeen({ len: v.history.length, final: v.finalRound })
    const h = v.history.at(-1)
    if (v.history.length > seen.len && h?.type === 'place' && h.removed?.length) setHint(`연쇄 정리! ${nameOf(h.player)} 패러독스 +${h.removed.length}`)
    else if (!seen.final && v.finalRound) setHint('종료 라운드가 시작되었습니다')
  }
  const last = v.history.at(-1)
  const flash = last?.type === 'place' ? { placed: last.slot ?? null, removed: (last.removed ?? []).map((r) => r.slot) } : { placed: null, removed: [] }

  // 짧은 안내는 잠시 뒤 사라진다
  useEffect(() => {
    if (!hint) return
    const id = setTimeout(() => setHint(null), 3200)
    return () => clearTimeout(id)
  }, [hint])

  // 추리 단계가 되면 추리 창을, 게임이 끝나면 결과를 잠시 뒤 한 번 띄운다
  useEffect(() => {
    if (!needGuess || autoGuess) return
    const id = setTimeout(() => {
      setGuessOpen(true)
      setAutoGuess(true)
    }, 700)
    return () => clearTimeout(id)
  }, [needGuess, autoGuess])
  useEffect(() => {
    if (v.phase !== 'over' || autoResult) return
    const id = setTimeout(() => {
      setGuessOpen(false)
      setResultOpen(true)
      setAutoResult(true)
    }, 700)
    return () => clearTimeout(id)
  }, [v.phase, autoResult])

  // 다른 앱을 보는 동안 내 차례가 오면 탭 제목으로 알린다(옛 화면과 같다)
  useEffect(() => {
    const reset = () => {
      if (!document.hidden) document.title = 'RETROCAUSE · 레트로코즈'
    }
    if ((mine || needGuess) && document.hidden) document.title = '● 내 차례 · RETROCAUSE'
    document.addEventListener('visibilitychange', reset)
    return () => document.removeEventListener('visibilitychange', reset)
  }, [mine, needGuess, room.version])

  const send = (a: Action) => {
    setPick({ version: room.version, card: null, target: null })
    setExchangeAsk(false)
    onAct(a)
  }

  const selectCard = (id: string) => {
    const next = card === id ? null : id
    setPick({ version: room.version, card: next, target: null })
    const first = next ? legalSlots(v.timeline, next, v.endings)[0] : undefined
    if (first !== undefined) requestAnimationFrame(() => document.getElementById(`rc-slot-${first}`)?.scrollIntoView({ block: 'nearest' }))
  }
  const pickSlot = (slot: number) => setPick({ version: room.version, card, target: target === slot ? null : slot })

  // ① 상태바
  const winners = v.result?.winners.map(nameOf).join(', ') ?? ''
  const who = hotseat && me !== null ? `${nameOf(me)} 차례` : '내 차례'
  const status =
    v.phase === 'over'
      ? `게임 종료 · ${winners} 승리`
      : v.phase === 'guess'
        ? needGuess
          ? `추리 단계 · ${hotseat ? `${nameOf(me!)}, ` : ''}비밀 목표를 추리하세요`
          : `추리 단계 · 기다리는 중 (${guessedCount}/${v.names.length})`
        : mine
          ? `${who} · ${!card ? '카드를 고르세요' : target === null ? '칸을 고르세요' : `칸 ${target + 1}에 놓기`}`
          : `${nameOf(v.current)}의 차례`
  const detailLine = `라운드 ${v.round}${v.finalRound ? ' · 종료 라운드' : ''} · 덱 ${v.deckCount} · 버림 ${v.discardCount}${room.code ? ` · 방 ${room.code}` : ''}`

  // ③ 아래 한 줄: 안내
  let info: string
  if (hint) info = hint
  else if (card && !legal.length) {
    const reasons = new Set(v.timeline.flatMap((x, i) => (x ? [] : [illegalReason(v.timeline, card, i, v.endings)])).filter((r) => r !== null))
    info = `놓을 칸이 없습니다 (${[...reasons].map((r) => WHY[r]).join(', ') || '빈 칸 없음'}) · 교체할 수 있습니다`
  } else if (card) info = `초록 칸 ${legal.length}곳에 놓을 수 있습니다`
  else if (mine) info = '손패에서 카드를 눌러 고르세요'
  else if (v.phase === 'play') info = me !== null ? '다른 플레이어 차례에도 카드를 미리 볼 수 있어요' : '관전 중 · 손패와 비밀 목표는 끝나면 공개됩니다'
  else if (v.phase === 'guess') info = '모두 추리를 내면 비밀 목표와 점수가 공개됩니다'
  else info = '시간선을 보고 누가 역사의 범인으로 남았는지 확인해 보세요'

  // ④ 내 손패
  const hand =
    me !== null && v.phase === 'play' ? (
      <div className="px-3 pt-1 pb-2" aria-label="내 손패">
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold">내 손패</span>
          <span className="min-w-0 flex-1" />
          <button type="button" aria-pressed={showMotive} className="min-h-11 rounded-full border border-line bg-raised px-3 text-[13px]" onClick={() => setShowMotive(!showMotive)}>
            {showMotive && v.motive ? (
              <>
                비밀 목표: <FigName f={v.motive} />
              </>
            ) : (
              '비밀 목표 보기'
            )}
          </button>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {v.hand.map((id) => {
            const c = CARD[id]!
            const n = legalSlots(v.timeline, id, v.endings).length
            return (
              <button
                key={id}
                type="button"
                aria-pressed={card === id}
                aria-label={`${c.title} (${c.figure})`}
                className={`rc-card flex min-h-11 flex-col rounded-xl px-2 py-1.5 text-left ${card === id ? 'ring-3 ring-primary' : ''} ${n ? '' : 'opacity-60'}`}
                style={{ ['--fig' as string]: FIG_COLOR[c.figure] }}
                onClick={() => selectCard(id)}
              >
                <span className="flex w-full items-baseline justify-between gap-1">
                  <span className="truncate text-sm leading-5 font-extrabold">{c.title}</span>
                  <span className="rc-fig shrink-0 text-[11px] font-extrabold">{c.figure}</span>
                </span>
                <span className="rc-sub truncate text-xs leading-4">{c.cond ? fact(c.cond) : '조건 없음'}</span>
                <span className="truncate text-xs leading-4 font-bold">→ {fact(c.effect)}</span>
                <span className="rc-sub text-[11px] leading-4">{n ? `놓을 수 있는 칸 ${n}개` : '지금 놓을 칸 없음'}</span>
              </button>
            )
          })}
        </div>
      </div>
    ) : undefined

  // ⑤ 행동
  let actions
  if (v.phase === 'over') {
    actions = (
      <div className="flex gap-2 *:flex-1">
        <Button tone="primary" onClick={() => setResultOpen(true)}>
          결과 보기
        </Button>
        <Button onClick={onLeave}>처음으로</Button>
      </div>
    )
  } else if (needGuess) {
    actions = (
      <Button tone="primary" onClick={() => setGuessOpen(true)}>
        추리하기
      </Button>
    )
  } else if (mine) {
    actions = (
      <div className="flex gap-2">
        <Button className="flex-1" disabled={!card || v.deckCount === 0} onClick={() => setExchangeAsk(true)}>
          교체
        </Button>
        <Button className="flex-1" disabled={!canPass} onClick={() => send({ type: 'pass' })}>
          패스
        </Button>
        <Button tone="primary" className="flex-[2]" disabled={!card || target === null} onClick={() => card && target !== null && send({ type: 'place', cardId: card, slot: target })}>
          {!card ? '카드를 고르세요' : target === null ? '칸을 고르세요' : `칸 ${target + 1}에 놓기`}
        </Button>
      </div>
    )
  } else {
    const cur = room.seats[v.seats[v.current]!]
    const waiting =
      v.phase === 'guess'
        ? `다른 플레이어의 추리를 기다리는 중 (${guessedCount}/${v.names.length})`
        : cur?.kind === 'bot'
          ? `${nameOf(v.current)} 생각 중…`
          : cur?.online === false
            ? `${nameOf(v.current)}님 연결 끊김 · 곧 봇이 대신합니다`
            : room.you === null
              ? `${nameOf(v.current)} 차례`
              : `${nameOf(v.current)}님의 차례를 기다리는 중`
    actions = <p className="m-0 flex min-h-12 items-center justify-center rounded-xl bg-bg px-2 text-center text-muted">{waiting}</p>
  }

  const tags = (p: number) => {
    const s = room.seats[v.seats[p]!]
    return [p === me ? '나' : null, p === 0 ? '시작' : null, v.styles[p] ? `봇·${v.styles[p]}` : s?.kind === 'bot' ? '봇 대리' : null, s && !s.online ? '연결 끊김' : null].filter(Boolean).join(' · ')
  }
  const placedBy = (p: number) => {
    const out: Partial<Record<Figure, number>> = {}
    for (const h of v.history) if (h.player === p && h.type === 'place') out[CARD[h.cardId!]!.figure] = (out[CARD[h.cardId!]!.figure] ?? 0) + 1
    return out
  }
  const result = v.result
  const ranked = result ? [...result.rows].sort((a, b) => b.total - a.total || a.paradox - b.paradox) : []
  const pts = v.points

  return (
    <>
      <GameShell
        status={status}
        detail={detailLine}
        onMenu={() => setMenu(true)}
        notice={error}
        players={
          <PlayerStrip
            onSelect={setDetail}
            players={v.names.map((_, p) => {
              const s = room.seats[v.seats[p]!]
              const row = result?.rows[p]
              return {
                id: p,
                name: nameOf(p),
                color: SEAT_COLOR[p]!,
                ...(row ? { score: row.total } : {}),
                detail: row ? row.figure : `손 ${v.handCounts[p]} · ⚠${v.paradox[p]}${v.phase === 'guess' && v.guessed[p] ? ' · 추리✓' : ''}`,
                active: (v.phase === 'play' && p === v.current) || (v.phase === 'guess' && !v.guessed[p]),
                you: p === me,
                offline: s ? !s.online : false,
              }
            })}
          />
        }
        hand={hand}
        actions={actions}
      >
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 gap-1.5 px-3 pt-2 pb-1" aria-label="결말">
            {v.endings.map((e) => (
              <EndingChip key={e.subject} ending={e} timeline={v.timeline} />
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <Timeline ref={timeline} timeline={v.timeline} endings={v.endings} showStates={showStates} legal={new Set(legal)} target={target} flash={flash} onPick={pickSlot} />
          </div>
          <p className={`m-0 min-h-6 shrink-0 truncate px-4 pb-1 text-sm leading-6 ${hint ? 'text-[var(--rc-ember)]' : 'text-muted'}`} aria-live="polite">
            {info}
          </p>
        </div>
      </GameShell>

      <Sheet open={menu} title="메뉴" onClose={() => setMenu(false)}>
        <h3 className="mt-0 mb-1 text-sm text-muted">기록</h3>
        <ol className="m-0 list-none p-0">
          {[...v.history].reverse().map((h, k) => {
            const d = describe(h, nameOf(h.player))
            return (
              <li key={v.history.length - k} className={`border-b border-line py-2 text-sm ${d.warn ? 'text-[#f0a58c]' : ''}`}>
                <span className="mr-1.5 text-xs text-muted">R{h.round}</span>
                {d.text}
              </li>
            )
          })}
          <li className="py-2 text-sm text-muted">게임 시작 · 시작 플레이어 {nameOf(0)}</li>
        </ol>

        <h3 className="mt-5 mb-1 text-sm text-muted">설정</h3>
        <button
          type="button"
          aria-pressed={showStates}
          className="flex min-h-12 w-full items-center justify-between border-b border-line text-left"
          onClick={() => {
            setShowStates(!showStates)
            store.set('states', !showStates)
          }}
        >
          칸별 상태 칩 보기<span className={showStates ? 'font-bold text-primary' : 'text-muted'}>{showStates ? '켜짐' : '꺼짐'}</span>
        </button>
        {local && (
          <div className="mt-2">
            <span className="mb-1 block text-sm text-muted">봇 속도</span>
            <div className="flex gap-1.5">
              {SPEEDS.map((s) => (
                <button
                  key={s.ms}
                  type="button"
                  aria-pressed={local.speed === s.ms}
                  className={`min-h-11 flex-1 rounded-lg border-2 bg-raised ${local.speed === s.ms ? 'border-primary font-bold' : 'border-transparent'}`}
                  onClick={() => local.setSpeed(s.ms)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {room.code && (
          <div className="mt-3 flex items-center gap-2">
            <span className="flex-1">
              방 코드 <b className="tracking-[0.2em] text-primary">{room.code}</b>
            </span>
            <Button
              onClick={async () => {
                const r = await shareLink(inviteLink(location.href, room.code!), 'RETROCAUSE')
                setShared(r === 'copied' ? '관전 링크를 복사했습니다.' : r === 'manual' ? inviteLink(location.href, room.code!) : null)
              }}
            >
              관전 링크 공유
            </Button>
          </div>
        )}
        {shared && <p className="mt-1 mb-0 text-sm break-all text-muted">{shared}</p>}

        <h3 className="mt-5 mb-2 text-sm text-muted">규칙 한눈에</h3>
        <RulesText />
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-primary">전체 룰북 펼치기</summary>
          <Rulebook />
        </details>
        {leaving ? (
          <div className="mt-4 rounded-xl border border-danger p-3">
            <p className="mt-0">{local ? '이 판을 그만두고 나갈까요?' : '나가면 그 자리는 봇이 이어받고 돌아올 수 없습니다.'}</p>
            <div className="flex gap-2 *:flex-1">
              <Button onClick={() => setLeaving(false)}>계속하기</Button>
              <Button tone="danger" onClick={onLeave}>
                나가기
              </Button>
            </div>
          </div>
        ) : (
          <Button tone="danger" className="mt-4 w-full" onClick={() => (inProgress ? setLeaving(true) : onLeave())}>
            나가기
          </Button>
        )}
      </Sheet>

      <Sheet open={detail !== null} title="플레이어" onClose={() => setDetail(null)}>
        {detail !== null && (
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 [&_dt]:text-muted">
            <dt>이름</dt>
            <dd className="m-0 font-bold">
              {nameOf(detail)} <small className="font-normal text-muted">{tags(detail)}</small>
            </dd>
            <dt>차례 순서</dt>
            <dd className="m-0">{detail + 1}번째</dd>
            <dt>패러독스</dt>
            <dd className="m-0 font-bold text-[var(--rc-ember)]">{v.paradox[detail]}</dd>
            <dt>손패</dt>
            <dd className="m-0">{v.handCounts[detail]}장</dd>
            <dt>교체</dt>
            <dd className="m-0">{v.history.filter((h) => h.player === detail && h.type === 'exchange').length}회</dd>
            <dt>놓은 카드</dt>
            <dd className="m-0 flex flex-wrap gap-1">
              {Object.entries(placedBy(detail)).map(([f, k]) => (
                <span key={f} className="rounded-full px-2 text-xs text-white" style={{ background: FIG_COLOR[f as Figure] }}>
                  {f} {k}
                </span>
              ))}
              {Object.keys(placedBy(detail)).length === 0 && <span className="text-muted">없음</span>}
            </dd>
            {detail === me && v.motive && (
              <>
                <dt>비밀 목표</dt>
                <dd className="m-0">
                  <FigName f={v.motive} />
                </dd>
              </>
            )}
            {result && (
              <>
                <dt>비밀 목표</dt>
                <dd className="m-0">
                  <FigName f={result.motives[detail]!} />
                </dd>
              </>
            )}
          </dl>
        )}
      </Sheet>

      <Sheet open={exchangeAsk && !!card} title="교체" onClose={() => setExchangeAsk(false)}>
        {card && (
          <>
            <CardFace card={CARD[card]!} />
            <p>이 카드를 버리고 덱에서 새 카드를 가져올까요? 버린 카드는 모두에게 공개됩니다.</p>
            <div className="flex gap-2 *:flex-1">
              <Button onClick={() => setExchangeAsk(false)}>취소</Button>
              <Button tone="primary" onClick={() => send({ type: 'exchange', cardId: card })}>
                교체
              </Button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={guessOpen && needGuess} title="추리" onClose={() => setGuessOpen(false)}>
        {needGuess && me !== null && v.motive && <GuessForm key={me} v={v} me={me} motive={v.motive} names={v.names} onSubmit={(guess) => send({ type: 'guess', guess })} />}
      </Sheet>

      <Sheet open={resultOpen && !!result} title={result && me !== null && result.winners.includes(me) ? '승리!' : `${winners} 승리`} onClose={() => setResultOpen(false)}>
        {result && (
          <>
            <ul className="m-0 mb-3 flex list-none flex-col gap-1 p-0 text-sm text-muted">
              {result.decisive.map((d) => (
                <li key={d.ending.subject}>
                  {fact(d.ending)} —{' '}
                  {d.figure ? (
                    <>
                      「{CARD[d.cardId!]!.title}」 <FigName f={d.figure} />
                    </>
                  ) : result.unresolved.some((u) => u.subject === d.ending.subject) ? (
                    <b className="text-text">미해결 결말 (모두 패러독스 +1)</b>
                  ) : (
                    '결정 원인 없음'
                  )}
                </li>
              ))}
            </ul>
            <ResultList
              rows={ranked.map((r) => ({
                id: r.player,
                name: `${nameOf(r.player)}${r.player === me && nameOf(r.player) !== '나' ? ' (나)' : ''} · ${r.figure}`,
                score: r.total,
                detail: `결정 원인 ${r.decisive * pts.decisive} · 카드 ${r.cards * pts.card} · 추리 ${r.correct * pts.deduction} · 패러독스 ${r.paradox * pts.paradox}`,
                winner: result.winners.includes(r.player),
              }))}
            />
            <details className="mt-2">
              <summary className="flex min-h-11 cursor-pointer items-center text-primary">추리 내용 보기</summary>
              <ul className="m-0 list-none p-0 text-sm">
                {result.guesses.map((g, p) => (
                  <li key={p} className="border-b border-line py-1.5">
                    <b>{nameOf(p)}</b>:{' '}
                    {Object.entries(g)
                      .map(([q, f]) => `${nameOf(Number(q))}=${f}${result.motives[Number(q)] === f ? '✓' : ''}`)
                      .join(', ')}
                  </li>
                ))}
              </ul>
            </details>
            <p className="text-sm text-muted">동점이면 패러독스가 적은 플레이어가 이깁니다.</p>
            <div className="mt-3 flex flex-col gap-2">
              {local && (
                <Button tone="primary" onClick={local.again}>
                  다시 하기
                </Button>
              )}
              <Button onClick={() => setResultOpen(false)}>시간선 보기</Button>
              <Button onClick={onLeave}>처음으로</Button>
            </div>
          </>
        )}
      </Sheet>
    </>
  )
}

/** 추리: 다른 플레이어마다 인물 하나(한 인물은 한 번만). 옛 화면처럼 내 인물은 고를 수 없다 */
function GuessForm({ v, me, motive, names, onSubmit }: { v: SeatView; me: number; motive: Figure; names: string[]; onSubmit(guess: Record<string, Figure>): void }) {
  const others = names.map((_, q) => q).filter((q) => q !== me)
  const [sel, setSel] = useState<Record<number, Figure | ''>>({})
  const [err, setErr] = useState<string | null>(null)
  const options = FIGURES.filter((f) => f !== motive)
  const submit = () => {
    if (others.some((q) => !sel[q])) return setErr('모든 플레이어의 인물을 골라 주세요.')
    const picked = others.map((q) => sel[q]!)
    if (new Set(picked).size !== picked.length) return setErr('같은 인물을 두 번 적을 수 없습니다.')
    onSubmit(Object.fromEntries(others.map((q) => [String(q), sel[q] as Figure])))
  }
  return (
    <>
      <p className="mt-0 text-sm text-muted">
        당신의 인물은 <FigName f={motive} />. 한 인물은 한 번만 적을 수 있고, 맞히면 1명당 +{v.points.deduction}점입니다. 기록(≡)의 놓은 카드·교체가 단서입니다.
      </p>
      {others.map((q) => (
        <label key={q} className="flex min-h-14 items-center justify-between gap-3 border-b border-line">
          <span className="min-w-0 truncate">{names[q]}</span>
          <select
            aria-label={`${names[q]}의 인물`}
            className="h-12 w-40 shrink-0 rounded-xl border border-line bg-bg px-2"
            value={sel[q] ?? ''}
            onChange={(e) => {
              setErr(null)
              setSel({ ...sel, [q]: e.target.value as Figure | '' })
            }}
          >
            <option value="">선택…</option>
            {options.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      ))}
      {err && <p className="mb-0 text-sm text-danger">{err}</p>}
      <Button tone="primary" className="mt-3 w-full" onClick={submit}>
        제출
      </Button>
    </>
  )
}
