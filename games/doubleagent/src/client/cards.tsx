// 카드 그림·확대 카드·라운드 결과 줄. 일러스트는 art/ 의 SVG 문자열(엔진 데이터로 만든 것, 사용자 입력 없음)을 그대로 넣는다.
import type { ReactNode } from 'react'
import {
  CLUBS,
  EVENTS,
  GOALS,
  INVALID_TEXT,
  NEEDS,
  PLAYERS,
  RULES,
  clubNeed,
  clubWeight,
  currentEvent,
  demandFee,
  demandPenalty,
  needsOf,
  offerValue,
  player,
  upcomingEvent,
  type Demand,
  type EventKey,
  type GameState,
  type PlayerCard,
  type RoundEntry,
  type RoundResult,
} from '../engine'
import { AGENT_COLORS, money, offerText, type Zoom } from './format'
import { clubArt, demandArt, eventArt, goalArt, needArt, playerArt } from './art'
import { CLUB_FLAVOR, DEMAND_FLAVOR, EVENT_FLAVOR, GOAL_FLAVOR, PLAYER_FLAVOR, POS_NAME, TRAIT_TEXT } from './art/flavor'


export function Art({ svg, className = '' }: { svg: string; className?: string }) {
  return <span aria-hidden="true" className={`da-art ${className}`} dangerouslySetInnerHTML={{ __html: svg }} />
}

export const Dot = ({ i }: { i: number }) => (
  <span aria-hidden="true" className="mr-1 inline-block size-2.5 shrink-0 rounded-full align-middle" style={{ background: AGENT_COLORS[i] ?? '#999' }} />
)


// ── 기본 카드(목록) ─────────────────────────────────

export function PlayerFace({ id, note }: { id: number; note?: string }) {
  const p = PLAYERS[id]!
  return (
    <>
      <Art svg={playerArt(id)} className="h-14 w-full rounded-lg bg-[var(--da-art)]" />
      <span className="mt-1 flex items-center justify-between text-xs">
        <b className={`pos-${p.pos}`}>{p.pos}</b>
        <span className="text-muted">
          기본 <b className="text-text">{p.base}</b>억
        </span>
      </span>
      <b className="block truncate text-sm">{p.name}</b>
      <small className="block truncate text-xs text-muted">{note || `몸값 ${p.cost}억 · ${p.trait}`}</small>
    </>
  )
}

export function ClubFace({ id, g, chosen, taken }: { id: number; g: GameState; chosen: PlayerCard | null; taken?: boolean }) {
  const c = CLUBS[id]!
  const nd = clubNeed(g.needs, id)
  const bud = offerValue(c, currentEvent(g))
  const posFit = chosen && chosen.pos === nd.pos
  const prefFit = chosen && chosen.trait === nd.pref
  const poor = chosen && bud < chosen.cost
  return (
    <>
      <span className="flex items-center gap-2">
        <Art svg={clubArt(id)} className="size-8 shrink-0" />
        <b className="min-w-0 truncate text-sm">{c.name}</b>
      </span>
      <span className={`block text-xs ${poor ? 'text-danger' : 'text-muted'}`}>
        {taken ? '1차에서 제안함' : `제시액 ${bud}억${poor ? ' · 몸값 미달' : ''}`}
      </span>
      <span className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs">
        <span className={posFit ? 'font-bold text-[var(--da-green)]' : ''}>
          {nd.pos} 필요{posFit ? ' +2' : ''}
        </span>
        <span className={prefFit ? 'font-bold text-[var(--da-green)]' : ''}>
          {nd.pref} 선호{prefFit ? ' +1' : ''}
        </span>
        <span className="text-muted">계약 {clubWeight(g, id)}</span>
      </span>
    </>
  )
}

export function Pips({ count }: { count: number }) {
  if (!RULES.copies) return null
  const total = Math.max(count, RULES.copies)
  return (
    <span aria-hidden="true" className="flex justify-center gap-0.5">
      {Array.from({ length: total }, (_, k) => (
        <i key={k} className={`inline-block size-1.5 rounded-full ${k < count ? 'bg-primary' : 'bg-line'}`} />
      ))}
    </span>
  )
}

export function EventLine({ g }: { g: GameState }) {
  const k = currentEvent(g)
  const nk = upcomingEvent(g)
  const e = EVENTS[k]
  return (
    <span className="flex items-center gap-3 text-left">
      <Art svg={eventArt(k, e.name)} className="h-12 w-20 shrink-0 rounded-lg bg-[var(--da-art)]" />
      <span className="min-w-0">
        <b className={`block text-sm ${k === 'deadline' ? 'text-primary' : ''}`}>{e.name}</b>
        <span className="block text-xs">{e.desc}</span>
        {nk && (
          <span className="block truncate text-xs text-muted">
            다음 라운드 · {EVENTS[nk].name}
          </span>
        )}
      </span>
    </span>
  )
}

// ── 확대 카드(시트 안) ───────────────────────────────

const Stats = ({ rows }: { rows: [string, ReactNode][] }) => (
  <dl className="my-3 grid grid-cols-3 gap-2 text-center">
    {rows.map(([k, v]) => (
      <div key={k} className="rounded-lg bg-raised px-1 py-1.5">
        <dt className="text-xs text-muted">{k}</dt>
        <dd className="m-0 font-bold">{v}</dd>
      </div>
    ))}
  </dl>
)
const Flavor = ({ text }: { text?: string }) => (text ? <p className="mt-3 border-l-2 border-line pl-3 text-sm text-muted italic">{text}</p> : null)
const BigArt = ({ svg, wide }: { svg: string; wide?: boolean }) => (
  <Art svg={svg} className={`mx-auto mb-2 rounded-2xl bg-[var(--da-art)] ${wide ? 'aspect-[96/56] w-full' : 'aspect-square w-44 p-3'}`} />
)

/** 이 선수에게 수수료가 붙는 이벤트 */
function playerEvents(p: PlayerCard): EventKey[] {
  const out: EventKey[] = []
  if (p.pos === 'FW') out.push('fw')
  if (p.pos === 'DF' || p.pos === 'GK') out.push('defense')
  if (p.trait === '유망주') out.push('young')
  if (p.cost >= 6) out.push('big')
  return [...out, 'deadline']
}

/**
 * 확대 카드. g 는 지금 보고 있는 사람의(가린) 게임, me 는 그 좌석. 손패 장수·목표 진척은 그 사람 것만 보인다.
 * goalProgress 를 주면 목표 카드에 진척을 함께 보인다(내 카드이거나 끝나서 공개된 카드).
 */
export function FullCard({ z, g, me, goalProgress }: { z: Zoom; g: GameState | null; me: number | null; goalProgress?: number }) {
  switch (z.kind) {
    case 'player': {
      const id = z.id as number
      const p = PLAYERS[id]!
      return (
        <article>
          <BigArt svg={playerArt(id)} />
          <h3 className="m-0 text-lg">
            <span className={`pos-${p.pos} mr-2`}>{p.pos}</span>
            {p.name} <span className="text-sm text-muted">{p.trait}</span>
          </h3>
          <Stats rows={[['기본 수수료', money(p.base)], ['몸값', money(p.cost)], ['포지션', POS_NAME[p.pos]]]} />
          <p className="text-sm">
            {TRAIT_TEXT[p.trait]} 구단이 <b>{p.trait}</b>을(를) 선호하면 매력도 +1, 필요 포지션이 <b>{p.pos}</b>이면 +2.
          </p>
          <h4 className="mb-1 text-sm text-muted">수수료가 오르는 이벤트</h4>
          <ul className="m-0 pl-5 text-sm">
            {playerEvents(p).map((k) => (
              <li key={k}>
                <b>{EVENTS[k].name}</b> — {EVENTS[k].desc}
              </li>
            ))}
          </ul>
          <Flavor text={PLAYER_FLAVOR[id]} />
        </article>
      )
    }
    case 'club': {
      const id = z.id as number
      const c = CLUBS[id]!
      const inGame = g?.clubs.includes(id) ? g : null
      const nd = inGame ? clubNeed(inGame.needs, id) : NEEDS[needsOf(id)[0]!]!
      const bud = inGame ? offerValue(c, currentEvent(inGame)) : c.budget
      return (
        <article>
          <BigArt svg={clubArt(id)} />
          <h3 className="m-0 text-lg">{c.name}</h3>
          <Stats
            rows={[
              ['제시액', bud !== c.budget ? `${bud}억 (기본 ${c.budget})` : money(c.budget)],
              ['계약', inGame ? `${clubWeight(inGame, id)}명` : '-'],
              ['요구', `${nd.pos}·${nd.pref}`],
            ]}
          />
          <h4 className="mb-1 text-sm text-muted">공개된 요구 카드</h4>
          <p className="m-0 text-sm">
            <b>{nd.pos} 필요</b> (포지션 일치 +2) · <b>{nd.pref} 선호</b> (특성 일치 +1)
          </p>
          <h4 className="mt-3 mb-1 text-sm text-muted">요구 카드 3장 · 계약되면 다음 라운드에 다음 카드 공개 (순서는 비공개)</h4>
          <div className="flex gap-2">
            {needsOf(id).map((n) => (
              <span key={n} className={`flex flex-1 items-center gap-1 rounded-lg border p-1 text-xs ${n === nd.id ? 'border-primary' : 'border-line'}`}>
                <Art svg={needArt(n)} className="h-10 w-8 shrink-0" />
                <span>
                  <b>{NEEDS[n]!.pos}</b> 필요
                  <br />
                  <b>{NEEDS[n]!.pref}</b>
                </span>
              </span>
            ))}
          </div>
          <Flavor text={CLUB_FLAVOR[id]} />
        </article>
      )
    }
    case 'event': {
      const k = z.id as EventKey
      const e = EVENTS[k]
      const when = g ? (currentEvent(g) === k ? '이번 라운드' : upcomingEvent(g) === k ? '다음 라운드' : '') : ''
      return (
        <article>
          <BigArt svg={eventArt(k, e.name)} wide />
          <h3 className="m-0 text-lg">
            {e.name} {when && <span className="text-sm text-primary">{when}</span>}
          </h3>
          <p className="text-sm">
            <b>효과</b> — {e.desc}
          </p>
          <p className="text-sm text-muted">{k === 'deadline' ? '마지막 라운드는 항상 데드라인 데이입니다.' : '이벤트는 라운드마다 1장 공개되고 다음 라운드 이벤트도 미리 보입니다.'}</p>
          <Flavor text={EVENT_FLAVOR[k]} />
        </article>
      )
    }
    case 'demand': {
      const d = z.id as Demand
      const count = g && me !== null ? g.agents[me]!.hand.filter((x) => x === d).length : undefined
      return (
        <article>
          <BigArt svg={demandArt(d)} />
          <h3 className="m-0 text-lg">요구 수수료 +{demandFee(d)}억</h3>
          <Stats rows={[['수수료', `+${money(demandFee(d))}`], ['매력도', `−${demandPenalty(d)}`], ['남은 장수', count !== undefined && RULES.copies ? `${count} / ${RULES.copies}장` : '-']]} />
          <p className="text-sm">
            계약하면 선수 기본 수수료에 <b>+{demandFee(d)}억</b>을 더 받습니다. 대신 매력도가 {demandPenalty(d)} 깎입니다. 같은 매력도로 겨루면 더 낮은 카드가 이깁니다.
          </p>
          <p className="text-sm text-muted">{RULES.copies ? '낸 카드는 계약 성공·실패와 관계없이 버립니다. 패스하면 그대로 남습니다.' : '카드는 소모되지 않습니다.'}</p>
          <Flavor text={DEMAND_FLAVOR[d]} />
        </article>
      )
    }
    case 'goal': {
      const id = z.id as number
      const gc = GOALS[id]!
      const prog = goalProgress === undefined ? null : `${Math.min(goalProgress, gc.n)}/${gc.n}`
      return (
        <article>
          <BigArt svg={goalArt(id)} />
          <h3 className="m-0 text-lg">
            {gc.name} {goalProgress !== undefined && goalProgress >= gc.n && <span className="text-sm text-[var(--da-green)]">달성</span>}
          </h3>
          <Stats rows={[['조건', gc.desc], ['보너스', `+${money(RULES.goalBonus)}`], ['지금', prog ?? '-']]} />
          <p className="text-sm">
            게임이 끝날 때 <b>내가 직접</b> 계약시킨 선수로 조건을 채우면 <b>+{money(RULES.goalBonus)}</b>. 못 채우면 0입니다. 스폰서 데이에 계약한 선수는 '○명 이상' 조건에서
            2명으로 셉니다.
          </p>
          <p className="text-sm text-muted">목표 카드는 게임이 끝날 때까지 나만 봅니다. 계약한 선수는 모두에게 공개되니, 너무 티 나게 모으면 상대가 가로챌 수 있습니다.</p>
          <Flavor text={GOAL_FLAVOR} />
        </article>
      )
    }
  }
}

// ── 라운드 결과 ─────────────────────────────────────


export function EntryRow({ g, e, names }: { g: GameState; e: RoundEntry; names: string[] }) {
  const name = (i: number) => names[i] ?? g.agents[i]?.name ?? `${i + 1}번`
  let badge: ReactNode = null
  let body = ''
  switch (e.status) {
    case 'won':
      badge = <span className="text-[var(--da-green)]">계약 성공 +{money(e.fee!)}</span>
      body = `${offerText(e.offer!)} · 매력도 ${e.attract}`
      break
    case 'lost':
      badge = <span className="text-danger">{e.tied ? '동률 상쇄' : e.attract === e.winnerAttract ? '동률 · 카드 높음' : '영입전 패배'}</span>
      body = e.tied
        ? `${offerText(e.offer!)} · 매력도 ${e.attract} (같은 매력도끼리 상쇄${e.winner !== undefined ? ` → ${name(e.winner)} 계약` : ''})`
        : `${offerText(e.offer!)} · 매력도 ${e.attract} (승자 ${name(e.winner!)} ${e.winnerAttract}${e.attract === e.winnerAttract ? ', 더 낮은 카드' : ''})`
      break
    case 'invalid':
      badge = <span className="text-danger">무효 · {INVALID_TEXT[e.reason!]}</span>
      body = offerText(e.offer!)
      break
    case 'pass':
      badge = <span className="text-muted">패스</span>
      break
  }
  return (
    <li className="border-b border-line py-1.5 text-sm last:border-0">
      <span className="flex items-center justify-between gap-2">
        <b className="min-w-0 truncate">
          <Dot i={e.agent} />
          {name(e.agent)}
        </b>
        <span className="shrink-0 text-xs font-bold">{badge}</span>
      </span>
      {body && <span className="block text-xs text-muted">{body}</span>}
    </li>
  )
}

/** 라운드 결과: 1차 → 2차 */
export function RoundEntries({ g, r, names }: { g: GameState; r: RoundResult; names: string[] }) {
  return (
    <>
      {([1, 2] as const).map((st) => (
        <div key={st} className="mb-2">
          <h4 className="m-0 text-xs font-bold text-muted">{st}차 협상</h4>
          <ul className="m-0 list-none p-0">
            {r.entries
              .filter((e) => (e.stage ?? 1) === st)
              .map((e, k) => (
                <EntryRow key={k} g={g} e={e} names={names} />
              ))}
          </ul>
        </div>
      ))}
    </>
  )
}

/** 공개 계약 현황: 에이전트마다 직접 계약시킨 선수 (목표 카드를 읽는 단서) */
export function Rosters({ g, names, only }: { g: GameState; names: string[]; only?: number }) {
  return (
    <ul className="m-0 list-none p-0">
      {g.agents.map((_, i) => {
        if (only !== undefined && i !== only) return null
        const own = g.signings.filter((s) => s.agent === i)
        return (
          <li key={i} className="border-b border-line py-1.5 text-sm last:border-0">
            <b>
              <Dot i={i} />
              {names[i]}
            </b>
            <span className="mt-0.5 flex flex-wrap gap-1">
              {own.length ? (
                own.map((s, k) => {
                  const p = player(s.playerId)
                  return (
                    <span key={k} className="rounded-md bg-raised px-1.5 text-xs">
                      {p.name}{' '}
                      <small className="text-muted">
                        <span className={`pos-${p.pos}`}>{p.pos}</span>·{p.trait}
                        {s.weight > 1 ? ` ×${s.weight}` : ''}
                      </small>
                    </span>
                  )
                })
              ) : (
                <small className="text-muted">아직 없음</small>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
