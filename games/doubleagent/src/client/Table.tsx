// 대국 화면. 배치(docs/refactor-plan.md 5절):
// ① 라운드·할 일, 이번 이벤트 ② 에이전트(공개 수수료·계약 수·남은 카드, 탭하면 계약 현황)
// ③ 제안: 협상 차수 탭 + 이벤트·시장 선수·구단(영역 안 스크롤) / 라운드 결과 / 최종 결과
// ④ 내 목표 카드 2장 + 요구 수수료 카드 ⑤ 예상 매력도·수수료 + 패스·2차 작성·제출 / 다음 라운드
// ≡ 지난 라운드 결과·계약 현황·기록·규칙·나가기
import type { RoomSnapshot } from '@gamehub/net'
import { Button, GameShell, LogList, PlayerStrip, ResultList, Sheet } from '@gamehub/ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Action, View } from '../def'
import {
  DEMANDS,
  GOALS,
  INVALID_TEXT,
  PLAYERS,
  RULES,
  TOTAL_ROUNDS,
  clubNeed,
  currentEvent,
  demandFee,
  demandPenalty,
  EVENTS,
  fitScore,
  goalResults,
  offerValue,
  rankings,
  CLUBS,
  type Demand,
  type GameState,
  type RoundBid,
  type Stage,
} from '../engine'
import { goalArt } from './art'
import { draftKey, editSlot, newDraft, slotCheck, slotHand, slotOffer, slotReady, type Draft } from './bid'
import { Art, ClubFace, Dot, EventLine, FullCard, PlayerFace, Pips, RoundEntries, Rosters } from './cards'
import { AGENT_COLORS, money, offerText, zoomTitle, type Zoom } from './format'
import { RulesText } from './RulesText'
import { recordResult } from './store'

export interface LocalControls {
  again(): void
  /** 사람 둘 이상이 한 기기를 돌려 쓰는 판 */
  hotseat: boolean
}

export interface TableProps {
  room: RoomSnapshot<View>
  error: string | null
  onAct(a: Action): void
  onLeave(): void
  /** 끝났을 때 전적에 남길 좌석(없으면 남기지 않는다) */
  recordSeat: number | null
  local?: LocalControls
}

type Ask = { text: string; yes: string; onYes(): void }

const ZoomIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
)

/** 카드 위의 확대 버튼(선택과 겹치지 않는 별도 버튼). 누르는 영역은 44×44, 그림은 모서리에 작게 */
function ZoomButton({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button
      type="button"
      aria-label={`${label} 카드 크게 보기`}
      className="absolute top-0 right-0 flex size-11 items-start justify-end p-1.5 text-muted"
      onClick={onClick}
    >
      <span className="rounded-md bg-bg/80 p-0.5">
        <ZoomIcon />
      </span>
    </button>
  )
}

export function Table({ room, error, onAct, onLeave, recordSeat, local }: TableProps) {
  const v = room.view!
  const g = v.game
  const me = v.me
  const [menu, setMenu] = useState(false)
  const [detail, setDetail] = useState<number | null>(null)
  const [zoom, setZoom] = useState<Zoom | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [draftState, setDraft] = useState<Draft | null>(null)

  const names = g.agents.map((a, i) => room.seats[i]?.name ?? a.name)
  const isBot = (i: number) => room.seats[i]?.kind === 'bot'
  const over = g.phase === 'done'
  const canAct = room.status === 'playing' && me !== null && room.actors.includes(me) && g.agents[me]?.kind === 'human'
  const bidding = g.phase === 'bid' && canAct
  // 한 기기 돌려 하기: 결과 화면은 모두가 보므로 지금 화면 주인의 비밀(목표 카드)을 감춘다
  const hideMine = !!local?.hotseat && g.phase !== 'bid' && !over
  const secretSeat = hideMine ? null : me
  const humanSeats = g.agents.flatMap((a, i) => (a.kind === 'human' ? [i] : []))
  const inProgress = !over && (local ? true : me !== null)

  // 화면이 바뀌면(라운드·차례·단계) 확대 카드를 닫는다 → 돌려 하기에서 다음 사람에게 보이지 않게
  const screenKey = `${g.round}:${g.phase}:${me}`
  const lastKey = useRef(screenKey)
  useEffect(() => {
    if (lastKey.current === screenKey) return
    lastKey.current = screenKey
    setZoom(null)
    setDetail(null)
    setAsk(null)
  }, [screenKey])

  // 끝나는 순간을 이 화면에서 봤으면 전적에 남긴다
  const lastStatus = useRef(room.status)
  useEffect(() => {
    const before = lastStatus.current
    lastStatus.current = room.status
    if (before === 'playing' && room.status === 'over' && recordSeat !== null) recordResult(g, recordSeat)
  }, [room.status, recordSeat, g])

  const draft = bidding && me !== null ? (draftState?.key === draftKey(g, me) ? draftState : newDraft(g, me)) : null

  // ── ① 상태바 ──
  const roundText = `라운드 ${Math.min(g.round, TOTAL_ROUNDS)}/${TOTAL_ROUNDS}`
  const doneCount = v.done.filter((i) => humanSeats.includes(i)).length
  let status: ReactNode
  if (over) status = '이적시장 마감 · 최종 결과'
  else if (g.phase === 'bid') {
    if (bidding) status = local?.hotseat ? `${names[me!]} 차례 · 1·2차 협상 작성` : '내 차례 · 1·2차 협상 작성'
    else if (me !== null && v.done.includes(me)) status = `제출 완료 · 기다리는 중 (${doneCount}/${humanSeats.length})`
    else status = me === null ? `관전 중 · 제안 작성 중 (${doneCount}/${humanSeats.length})` : '제안 작성 중'
  } else {
    if (canAct) status = `라운드 ${g.round} 결과`
    else status = me === null ? `관전 중 · 라운드 ${g.round} 결과` : `다음 준비 · 기다리는 중 (${doneCount}/${humanSeats.length})`
  }
  const ev = EVENTS[currentEvent(g)]
  const detailLine = over ? `우승: ${rankings(g).filter((r) => r.rank === 1).map((r) => names[r.agent]).join(', ')}` : `${roundText} · ${ev.name}`

  // ── ② 에이전트 ──
  const players = (
    <PlayerStrip
      onSelect={setDetail}
      players={g.agents.map((a, i) => ({
        id: i,
        name: `${names[i]}${isBot(i) && a.kind === 'human' ? ' (봇 대리)' : ''}`,
        color: AGENT_COLORS[i] ?? '#999',
        score: money(a.final?.total ?? a.score),
        detail: `${a.deals}건 · 카드 ${a.hand.length}`,
        active: !over && room.actors.includes(i) && a.kind === 'human',
        you: i === me,
        offline: room.seats[i] ? !room.seats[i]!.online : false,
      }))}
    />
  )

  const goalZoom = (id: number) => setZoom({ kind: 'goal', id })
  const goalProgressOf = (id: number): number | undefined => {
    const owner = g.agents.findIndex((a) => a.goals.includes(id))
    if (owner < 0 || (owner !== secretSeat && !over)) return undefined
    return goalResults(g, owner).find((r) => r.goal === id)?.progress
  }

  // ── ④ 내 목표 카드 ──
  const goalsRow =
    secretSeat !== null && !over ? (
      <div className="flex gap-1.5" aria-label="나의 목표 카드">
        {goalResults(g, secretSeat).map((r) => {
          const gc = GOALS[r.goal]!
          return (
            <button
              key={r.goal}
              type="button"
              aria-label={`나의 목표 카드 ${gc.name} 크게 보기`}
              className={`flex min-h-12 min-w-0 flex-1 items-center gap-1.5 rounded-lg border bg-raised px-1.5 py-1 text-left ${r.done ? 'border-[var(--da-green)]' : 'border-line'}`}
              onClick={() => goalZoom(r.goal)}
            >
              <Art svg={goalArt(r.goal)} className="size-8 shrink-0" />
              <span className="min-w-0">
                <b className="block truncate text-[13px]">{gc.name}</b>
                <small className="block truncate text-xs text-muted">
                  {Math.min(r.progress, gc.n)}/{gc.n} · +{money(RULES.goalBonus)}
                </small>
              </span>
            </button>
          )
        })}
      </div>
    ) : null

  // ── 제안 작성 ──
  let board: ReactNode
  let hand: ReactNode = goalsRow ? <div className="px-2 py-1.5">{goalsRow}</div> : undefined
  let actions: ReactNode

  if (bidding && draft && me !== null) {
    const set = (patch: Parameters<typeof editSlot>[3]) => setDraft(editSlot(g, me, draft, patch))
    const st = draft.stage
    const sl = draft.slots[st - 1]!
    const first = st === 2 ? slotOffer(draft.slots[0]) : null
    const chosen = sl.playerId !== null ? PLAYERS[sl.playerId]! : null
    const handNow = slotHand(g, me, draft, st)
    const check = slotCheck(g, me, draft, st)
    const ready1 = slotReady(slotCheck(g, me, draft, 1))
    const ready2 = slotReady(slotCheck(g, me, draft, 2))
    const submit = (bid: RoundBid) => onAct({ type: 'bid', round: g.round, first: bid.first, second: bid.second })

    const summary = (k: Stage) => {
      const c = slotCheck(g, me, draft, k)
      const s = draft.slots[k - 1]!
      if (c === 'pass') return '패스'
      if (c === null) return s.playerId === null && s.clubId === null ? '작성 전' : '작성 중'
      if (typeof c !== 'object') return `⚠ ${INVALID_TEXT[c]}`
      return `${PLAYERS[s.playerId!]!.name} → ${CLUBS[s.clubId!]!.name} +${money(c.fee)}`
    }

    board = (
      <div className="flex h-full flex-col">
        <div role="tablist" aria-label="협상 차수" className="grid shrink-0 grid-cols-2 gap-1.5 px-2 pt-1.5">
          {([1, 2] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={st === k}
              className={`min-h-12 min-w-0 rounded-lg border-2 px-2 text-left ${st === k ? 'border-primary bg-raised' : 'border-transparent bg-surface'}`}
              onClick={() => setDraft({ ...draft, stage: k })}
            >
              <b className={`block text-sm ${slotReady(slotCheck(g, me, draft, k)) ? 'text-[var(--da-green)]' : ''}`}>
                {slotReady(slotCheck(g, me, draft, k)) ? '✓ ' : ''}
                {k}차 협상
              </b>
              <small className="block truncate text-xs text-muted">{summary(k)}</small>
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
          <button type="button" aria-label={`이벤트 ${ev.name} 카드 크게 보기`} className="mt-2 block min-h-12 w-full rounded-xl bg-surface p-1.5" onClick={() => setZoom({ kind: 'event', id: currentEvent(g) })}>
            <EventLine g={g} />
          </button>
          <h3 className="mt-3 mb-1.5 text-sm font-bold">
            1. 선수 <small className="font-normal text-muted">· {st}차 협상</small>
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            {g.market.map((id) => {
              const q = PLAYERS[id]!
              const taken = first?.playerId === id
              const sel = sl.playerId === id && !sl.pass
              return (
                <div key={id} className="relative">
                  <button
                    type="button"
                    aria-pressed={sel}
                    aria-label={`선수 ${q.name} ${q.pos} 몸값 ${q.cost}억`}
                    disabled={taken}
                    className="da-pick block w-full rounded-xl border-2 border-line bg-surface p-1.5 text-left"
                    onClick={() => set({ playerId: id, pass: false })}
                  >
                    <PlayerFace id={id} {...(taken ? { note: '1차에서 제안함' } : {})} />
                  </button>
                  <ZoomButton label={q.name} onClick={() => setZoom({ kind: 'player', id })} />
                </div>
              )
            })}
          </div>
          <h3 className="mt-3 mb-1.5 text-sm font-bold">
            2. 구단 <small className="font-normal text-muted">· 요구 카드에 맞을수록 매력도↑</small>
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {g.clubs.map((id) => {
              const c = CLUBS[id]!
              const taken = first?.clubId === id
              const poor = chosen && offerValue(c, currentEvent(g)) < chosen.cost
              const sel = sl.clubId === id && !sl.pass
              return (
                <div key={id} className="relative">
                  <button
                    type="button"
                    aria-pressed={sel}
                    aria-label={`구단 ${c.name}`}
                    disabled={taken}
                    className={`da-pick block w-full rounded-xl border-2 border-line bg-surface p-2 pr-9 text-left ${poor ? 'opacity-60' : ''}`}
                    onClick={() => set({ clubId: id, pass: false })}
                  >
                    <ClubFace id={id} g={g} chosen={chosen} taken={taken} />
                  </button>
                  <ZoomButton label={c.name} onClick={() => setZoom({ kind: 'club', id })} />
                </div>
              )
            })}
          </div>
          <p className="mt-3 mb-0 text-xs text-muted">
            1차를 모두 정산한 뒤 2차를 정산합니다. 2차는 1차와 다른 선수·구단만 고를 수 있고, 2차에 고른 선수가 1차에서 계약되면 협상이 무산됩니다(카드는 소모).
          </p>
        </div>
      </div>
    )

    const count = (d: Demand) => handNow.filter((x) => x === d).length
    hand = (
      <div className="flex flex-col gap-1.5 px-2 py-1.5">
        {goalsRow}
        <div className="flex items-stretch gap-1.5" aria-label="요구 수수료 카드">
          {DEMANDS.map((d) => {
            const n = count(d)
            const sel = sl.demand === d && !sl.pass
            return (
              <button
                key={d}
                type="button"
                aria-pressed={sel}
                aria-label={`요구 수수료 +${demandFee(d)}억, 매력도 −${demandPenalty(d)}, ${n ? `${n}장 남음` : '없음'}`}
                disabled={!n}
                className="da-pick flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-lg border-2 border-line bg-raised py-1"
                onClick={() => set({ demand: d, pass: false })}
              >
                <b className="text-sm leading-4">+{demandFee(d)}억</b>
                <small className="text-[11px] leading-4 text-muted">매력 −{demandPenalty(d)}</small>
                <Pips count={n} />
              </button>
            )
          })}
          <button
            type="button"
            aria-label="요구 수수료 카드 설명"
            className="min-h-12 w-11 shrink-0 rounded-lg text-lg text-muted"
            onClick={() => setZoom({ kind: 'demand', id: sl.demand ?? 2 })}
          >
            ⓘ
          </button>
        </div>
      </div>
    )

    const fit = chosen && sl.clubId !== null ? fitScore(chosen, clubNeed(g.needs, sl.clubId)) : null
    const est =
      check === 'pass' ? (
        <span className="text-muted">{st}차 협상 패스 · 카드 소모 없음</span>
      ) : !handNow.length ? (
        <span className="text-danger">남은 요구 수수료 카드가 없습니다 · 패스만 가능</span>
      ) : !chosen ? (
        <span className="text-muted">선수를 선택하세요</span>
      ) : sl.clubId === null ? (
        <span className="text-muted">구단을 선택하세요</span>
      ) : check && typeof check === 'object' ? (
        <>
          <span>
            매력도 <b>{check.attract}</b>{' '}
            <small className="text-muted">
              (적합 {fit} − {demandPenalty(sl.demand!)})
            </small>
          </span>
          <b className="text-primary">+{money(check.fee)}</b>
        </>
      ) : (
        <span className="text-danger">{check ? INVALID_TEXT[check] : '카드를 고르세요'}</span>
      )

    const pass = () => {
      const passed = editSlot(g, me, draft, { pass: true })
      if (st === 1) return setDraft({ ...passed, stage: 2 })
      if (!ready1) return setDraft({ ...passed, stage: 1 })
      const both = draft.slots[0].pass
      setAsk({
        text: both ? '1차·2차 모두 패스할까요? 요구 수수료 카드는 소모되지 않습니다.' : '2차는 패스하고 제출할까요?',
        yes: both ? '모두 패스' : '2차 패스하고 제출',
        onYes: () => submit({ first: slotOffer(draft.slots[0]), second: null }),
      })
    }
    const send = () => {
      if (!ready1 || !ready2) return
      const bid = { first: slotOffer(draft.slots[0]), second: slotOffer(draft.slots[1]) }
      if (!bid.first && !bid.second) return setAsk({ text: '1차·2차 모두 패스할까요? 요구 수수료 카드는 소모되지 않습니다.', yes: '모두 패스', onYes: () => submit(bid) })
      submit(bid)
    }

    actions = (
      <div className="flex flex-col gap-1.5">
        <div className="flex min-h-5 items-center justify-between gap-2 px-1 text-sm" aria-live="polite">
          {est}
        </div>
        {st === 1 ? (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={pass}>
              1차 패스
            </Button>
            <Button tone="primary" className="flex-[2]" disabled={!slotReady(check)} onClick={() => setDraft({ ...draft, stage: 2 })}>
              2차 협상 작성 →
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button className="flex-1 px-2" onClick={() => setDraft({ ...draft, stage: 1 })}>
              ← 1차
            </Button>
            <Button className="flex-1 px-2" onClick={pass}>
              2차 패스
            </Button>
            <Button tone="primary" className="flex-[1.4] px-2" disabled={!ready1 || !ready2} onClick={send}>
              제출
            </Button>
          </div>
        )}
      </div>
    )
  } else if (g.phase === 'bid') {
    // 제출을 마쳤거나 관전 중: 내 제안과 진행 상황, 시장(읽기만)
    const last = g.results.at(-1)
    board = (
      <div className="h-full overflow-y-auto overscroll-contain px-3 py-2">
        {v.myBid && (
          <section className="mb-3 rounded-xl border border-line bg-surface p-3">
            <h3 className="mt-0 mb-1 text-sm text-muted">이번 라운드 내 제안 (비공개)</h3>
            {(['first', 'second'] as const).map((k, idx) => (
              <p key={k} className="my-0.5 text-sm">
                <b>{idx + 1}차</b> · {v.myBid![k] ? offerText(v.myBid![k]!) : '패스'}
              </p>
            ))}
          </section>
        )}
        <section className="mb-3 rounded-xl bg-surface p-3">
          <h3 className="mt-0 mb-1 text-sm text-muted">제출 현황</h3>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0 text-sm">
            {humanSeats.map((i) => (
              <li key={i} className={v.done.includes(i) ? '' : 'text-muted'}>
                <Dot i={i} />
                {names[i]} {v.done.includes(i) ? '✓' : '…'}
              </li>
            ))}
          </ul>
        </section>
        <button type="button" aria-label={`이벤트 ${ev.name} 카드 크게 보기`} className="mb-3 block min-h-12 w-full rounded-xl bg-surface p-1.5" onClick={() => setZoom({ kind: 'event', id: currentEvent(g) })}>
          <EventLine g={g} />
        </button>
        <h3 className="mt-0 mb-1.5 text-sm font-bold">시장</h3>
        <div className="grid grid-cols-3 gap-1.5">
          {g.market.map((id) => (
            <button key={id} type="button" aria-label={`${PLAYERS[id]!.name} 카드 크게 보기`} className="rounded-xl border-2 border-line bg-surface p-1.5 text-left" onClick={() => setZoom({ kind: 'player', id })}>
              <PlayerFace id={id} />
            </button>
          ))}
        </div>
        <h3 className="mt-3 mb-1.5 text-sm font-bold">구단</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {g.clubs.map((id) => (
            <button key={id} type="button" aria-label={`${CLUBS[id]!.name} 카드 크게 보기`} className="rounded-xl border-2 border-line bg-surface p-2 text-left" onClick={() => setZoom({ kind: 'club', id })}>
              <ClubFace id={id} g={g} chosen={null} />
            </button>
          ))}
        </div>
        {last && (
          <section className="mt-3 rounded-xl bg-surface p-3">
            <h3 className="mt-0 mb-1 text-sm text-muted">지난 라운드 결과</h3>
            <RoundEntries g={g} r={last} names={names} />
          </section>
        )}
      </div>
    )
    actions = <Waiting room={room} names={names} humanSeats={humanSeats} v={v} />
  } else if (g.phase === 'result') {
    const r = g.results.at(-1)!
    const lastRound = g.round >= TOTAL_ROUNDS
    const rotating = RULES.needRotate && !lastRound ? g.clubs.filter((id) => g.signings.some((x) => x.round === r.round && x.clubId === id)) : []
    board = (
      <div className="da-in h-full overflow-y-auto overscroll-contain px-3 py-2">
        <h2 className="mt-0 mb-2 text-lg font-extrabold">라운드 {r.round} 결과</h2>
        <section className="mb-3 rounded-xl bg-surface p-3">
          <RoundEntries g={g} r={r} names={names} />
        </section>
        {rotating.length > 0 && (
          <p className="text-sm text-muted">
            🔄 다음 라운드에 요구 카드 교체:{' '}
            {rotating.map((id, k) => (
              <span key={id}>
                {k > 0 && ', '}
                <b className="text-text">{CLUBS[id]!.name}</b> <small>({clubNeed(g.needs, id).pos}·{clubNeed(g.needs, id).pref} →)</small>
              </span>
            ))}
          </p>
        )}
        <section className="rounded-xl bg-surface p-3">
          <h3 className="mt-0 mb-1 text-sm text-muted">계약 현황 · 누가 어떤 선수를 모았나</h3>
          <Rosters g={g} names={names} />
        </section>
        <p className="text-xs text-muted">순위는 위 줄의 공개 수수료만 반영합니다(목표 보너스는 종료 때).</p>
      </div>
    )
    actions = canAct ? (
      <Button tone="primary" onClick={() => onAct({ type: 'ready', round: g.round })}>
        {lastRound ? '최종 결과 →' : '다음 라운드 →'}
      </Button>
    ) : (
      <Waiting room={room} names={names} humanSeats={humanSeats} v={v} />
    )
  } else {
    board = <Final g={g} names={names} onGoal={goalZoom} />
    actions = (
      <div className="flex gap-2 *:flex-1">
        {local && (
          <Button tone="primary" onClick={local.again}>
            다시 하기
          </Button>
        )}
        <Button tone={local ? 'secondary' : 'primary'} onClick={onLeave}>
          처음으로
        </Button>
      </div>
    )
  }

  const detailAgent = detail !== null ? g.agents[detail] : undefined

  return (
    <>
      <GameShell status={status} detail={detailLine} onMenu={() => setMenu(true)} notice={error} players={players} hand={hand} actions={actions}>
        {board}
      </GameShell>

      <Sheet open={menu} title="메뉴" onClose={() => setMenu(false)}>
        <h3 className="mt-0 mb-1 text-sm text-muted">계약 현황</h3>
        <Rosters g={g} names={names} />
        <h3 className="mt-4 mb-1 text-sm text-muted">라운드별 결과</h3>
        {g.results.length ? (
          [...g.results].reverse().map((r) => (
            <details key={r.round} className="mb-1" open={r.round === g.results.length}>
              <summary className="flex min-h-11 cursor-pointer items-center font-bold">라운드 {r.round}</summary>
              <RoundEntries g={g} r={r} names={names} />
            </details>
          ))
        ) : (
          <p className="text-sm text-muted">아직 결과가 없습니다.</p>
        )}
        <h3 className="mt-4 mb-1 text-sm text-muted">기록</h3>
        <LogList entries={room.log} />
        <h3 className="mt-4 mb-1 text-sm text-muted">게임 규칙</h3>
        <RulesText />
        <Button
          tone="danger"
          className="mt-4 mb-2 w-full"
          onClick={() =>
            inProgress
              ? setAsk({
                  text: local ? '게임을 나갈까요? 처음 화면에서 이어 할 수 있습니다.' : '온라인 게임에서 나갈까요? 내 자리는 봇이 이어받고 다시 돌아올 수 없습니다.',
                  yes: '나가기',
                  onYes: () => {
                    setMenu(false)
                    onLeave()
                  },
                })
              : onLeave()
          }
        >
          나가기
        </Button>
      </Sheet>

      <Sheet open={detailAgent !== undefined} title="에이전트" onClose={() => setDetail(null)}>
        {detailAgent && detail !== null && (
          <>
            <p className="mt-0 text-lg font-bold">
              <Dot i={detail} />
              {names[detail]}
              {detail === me ? ' (나)' : ''}
              {isBot(detail) && <span className="ml-2 text-sm text-muted">봇</span>}
            </p>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm [&_dt]:text-muted">
              <dt>공개 수수료</dt>
              <dd className="m-0 font-bold">{money(detailAgent.score)}</dd>
              {detailAgent.final && (
                <>
                  <dt>최종 점수</dt>
                  <dd className="m-0 font-bold">{money(detailAgent.final.total)}</dd>
                </>
              )}
              <dt>계약</dt>
              <dd className="m-0">{detailAgent.deals}건</dd>
              <dt>남은 카드</dt>
              <dd className="m-0">{detailAgent.hand.length ? detailAgent.hand.map((d) => `+${demandFee(d)}`).join(' ') : '없음'}</dd>
              <dt>목표 카드</dt>
              <dd className="m-0">{detail === secretSeat || over ? detailAgent.goals.map((id) => GOALS[id]?.name ?? '?').join(', ') : `${detailAgent.goals.length}장 (비공개)`}</dd>
            </dl>
            <h3 className="mt-3 mb-1 text-sm text-muted">계약한 선수</h3>
            <Rosters g={g} names={names} only={detail} />
          </>
        )}
      </Sheet>

      <Sheet open={zoom !== null} title={zoom ? zoomTitle(zoom) : ''} onClose={() => setZoom(null)}>
        {zoom && (
          <div className="pb-2">
            <FullCard z={zoom} g={g} me={secretSeat} {...(zoom.kind === 'goal' && goalProgressOf(zoom.id as number) !== undefined ? { goalProgress: goalProgressOf(zoom.id as number)! } : {})} />
          </div>
        )}
      </Sheet>

      <Sheet open={ask !== null} title="확인" onClose={() => setAsk(null)}>
        {ask && (
          <>
            <p className="mt-0">{ask.text}</p>
            <div className="mb-2 flex gap-2 *:flex-1">
              <Button onClick={() => setAsk(null)}>취소</Button>
              <Button
                tone="primary"
                onClick={() => {
                  setAsk(null)
                  ask.onYes()
                }}
              >
                {ask.yes}
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </>
  )
}

/** ⑤ 기다리는 중: 남은 사람과, 끊긴 사람은 곧 봇이 대신한다는 안내 */
function Waiting({ room, names, humanSeats, v }: { room: RoomSnapshot<View>; names: string[]; humanSeats: number[]; v: View }) {
  const left = humanSeats.filter((i) => !v.done.includes(i))
  const away = left.filter((i) => room.seats[i] && !room.seats[i]!.online && room.seats[i]!.kind === 'human')
  const text = !left.length
    ? '정산하는 중…'
    : away.length
      ? `${away.map((i) => names[i]).join(', ')}님 연결 끊김 · 곧 봇이 대신합니다`
      : `${left.map((i) => names[i]).join(', ')} 기다리는 중`
  return <p className="m-0 flex min-h-12 items-center justify-center rounded-xl bg-bg px-2 text-center text-sm text-muted">{text}</p>
}

/** 최종 결과: 순위, 목표 카드 공개, 계약 현황 */
function Final({ g, names, onGoal }: { g: GameState; names: string[]; onGoal(id: number): void }) {
  const rk = rankings(g)
  return (
    <div className="da-in h-full overflow-y-auto overscroll-contain px-3 py-2">
      <div className="text-center">
        <span className="da-stamp">TRANSFER WINDOW CLOSED</span>
        <h2 className="mt-2 mb-0 text-xl font-extrabold">이적시장 마감</h2>
        <p className="mt-0 text-sm text-muted">최종 점수 = 계약 수수료 + 목표 카드 보너스</p>
      </div>
      <ResultList
        rows={rk.map((r) => {
          const a = g.agents[r.agent]!
          return {
            id: r.agent,
            name: names[r.agent] ?? a.name,
            score: money(a.final?.total ?? a.score),
            detail: `${r.rank}위 · 수수료 ${money(a.score)} · 목표 ${money(a.final?.goalPoints ?? 0)}`,
            winner: r.rank === 1,
          }
        })}
      />
      <section className="mt-3 rounded-xl bg-surface p-3">
        <h3 className="mt-0 mb-1 text-sm text-muted">목표 카드 공개</h3>
        {g.agents.map((a, i) => (
          <div key={i} className="mb-2">
            <b className="text-sm">
              <Dot i={i} />
              {names[i]}
            </b>
            {(a.final?.goals ?? []).map((x) => {
              const gc = GOALS[x.goal]!
              return (
                <button
                  key={x.goal}
                  type="button"
                  aria-label={`${gc.name} 목표 카드 크게 보기`}
                  className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-lg bg-raised px-2 text-left text-sm"
                  onClick={() => onGoal(x.goal)}
                >
                  <span className="min-w-0 flex-1">
                    <b>{gc.name}</b> <small className="text-muted">{gc.desc}</small>
                  </span>
                  <span className={`shrink-0 text-xs font-extrabold ${x.done ? 'text-[var(--da-green)]' : 'text-danger'}`}>
                    {x.done ? `CLEAR +${money(x.points)}` : `MISS ${x.progress}/${gc.n}`}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </section>
      <section className="mt-3 rounded-xl bg-surface p-3">
        <h3 className="mt-0 mb-1 text-sm text-muted">계약 현황</h3>
        <Rosters g={g} names={names} />
      </section>
    </div>
  )
}
