// ④ 내 영역: 함대(광선 컨베이어)와 단계별 선택, 파문 컨베이어
import type { View } from '../def'
import { STAY } from '../engine/engine'
import { STRENGTH, type Pid } from '../engine/map'
import { cardLabel } from './log'
import type { Order, Picks } from './picks'

interface HandProps {
  view: View
  side: Pid
  names: Record<Pid, string>
  picks: Picks
  /** 지금 고를 수 있는지(내 차례, 아직 안 냄) */
  choosing: boolean
  hint: string | null
  update(change: Partial<Picks>): void
}

const chip = (on: boolean, tone: 'pick' | 'danger' = 'pick') =>
  `flex min-h-11 flex-col items-start justify-center rounded-xl border-2 px-2 py-1 text-left disabled:opacity-100 ${
    on ? (tone === 'danger' ? 'border-[var(--lc-opp)] bg-[rgba(255,154,77,.16)]' : 'border-primary bg-[rgba(87,163,255,.16)]') : 'border-transparent bg-raised'
  }`

export function Hand({ view, side, names, picks, choosing, hint, update }: HandProps) {
  const m = view.mine
  const phase = view.phase
  const opp: Pid = side === 'A' ? 'B' : 'A'

  const toggle = (list: number[], x: number) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x])

  let body = null
  if (m && choosing && phase === 'occupy') {
    body = (
      <div className="flex flex-col gap-1.5" role="group" aria-label="점령·위장">
        {m.fleets.map((f) => {
          const elig = m.eligible.includes(f.id)
          const opts: [Order, string, string, boolean][] = [
            ['none', '안 함', '', true],
            ['occupy', f.canOccupy ? '점령' : '점령 불가', f.canOccupy ? `${view.ripple[f.real]}칸` : '', f.canOccupy],
          ]
          if (m.decoys > 0) for (const k of [3, 4, 5] as const) opts.push([`decoy${k}`, `위장${k}`, '', true])
          return (
            <div key={f.id} className="flex items-center gap-1.5">
              <div className="w-14 shrink-0 text-sm leading-tight font-bold">
                함대 {f.id}
                <small className="block text-xs font-normal text-muted">{!elig ? (f.recalled ? '귀환함' : '공격함') : `@${f.real}`}</small>
              </div>
              <div className="flex flex-1 gap-1">
                {opts.map(([val, label, sub, ok]) => {
                  const on = picks.orders[f.id] === val
                  return (
                    <button
                      key={val}
                      type="button"
                      aria-pressed={on}
                      aria-label={`함대 ${f.id} ${label}`}
                      disabled={!elig || !ok}
                      className={`min-h-11 min-w-11 flex-1 rounded-lg px-0.5 text-[13px] leading-tight disabled:opacity-35 ${on ? 'bg-primary font-bold text-on-primary' : 'bg-raised'}`}
                      onClick={() => update({ orders: { ...picks.orders, [f.id]: val } })}
                    >
                      {label}
                      {sub && <small className="block text-[11px]">{sub}</small>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  } else if (m) {
    const attack = choosing && phase === 'attack'
    const plan = choosing && phase === 'plan'
    body = (
      <>
        {choosing && phase === 'blockade' && m.blockades.length > 0 && (
          <div className="mb-1.5 flex gap-1.5" role="group" aria-label="봉쇄">
            {m.blockades.map((o) => {
              const on = picks.blocks.includes(o.idx)
              return (
                <button key={o.idx} type="button" aria-pressed={on} className={`${chip(on)} flex-1`} onClick={() => update({ blocks: toggle(picks.blocks, o.idx) })}>
                  <b className="text-sm">행성 {o.planet}</b>
                  <span className="text-xs text-muted">
                    {on ? '봉쇄' : '통과'} · 함대 {o.fleets.join(',')}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="내 함대">
          {m.fleets.map((f, i) => {
            const mv = picks.moves[i] ?? STAY
            const on = plan ? picks.sel === f.id : attack ? picks.attacks.includes(f.id) : false
            const main = plan ? `${f.real} → ${mv === STAY ? '■' : mv}` : `@${f.real}`
            const tag = plan ? '' : attack ? (on ? '공격!' : '공격 안 함') : f.recalled ? '귀환함' : f.attacked ? '공격함' : ''
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={plan || attack ? on : undefined}
                aria-label={`함대 ${f.id}`}
                disabled={!plan && !attack}
                className={chip(on, attack ? 'danger' : 'pick')}
                onClick={() => (plan ? update({ sel: f.id }) : update({ attacks: toggle(picks.attacks, f.id) }))}
              >
                <span className="flex w-full items-baseline justify-between text-[13px]">
                  <b>함대 {f.id}</b>
                  <span className="text-xs text-muted">전력 {STRENGTH[f.id]}</span>
                </span>
                <span className="text-base leading-6 font-bold tabular-nums">{main}</span>
                <span className="flex w-full justify-between text-[11px] text-muted">
                  <span>
                    앞 {cardLabel(f.front)} · 뒤 {cardLabel(f.back)}
                  </span>
                  {tag && <span className={attack && on ? 'lc-opp font-bold' : ''}>{tag}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </>
    )
  }

  const rippleRow = (pid: Pid) => {
    const isMine = m && pid === view.me
    return (
      <div className="flex items-center gap-1">
        <span className={`w-12 shrink-0 truncate text-xs font-bold ${pid === side ? 'lc-me' : 'lc-opp'}`}>{pid === view.me ? '나' : names[pid]}</span>
        {[5, 4, 3, 2, 1].map((k) => (
          <span key={k} className="flex min-h-6 flex-1 items-center gap-0.5 rounded-md bg-bg px-1 text-[11px]">
            <span className="text-muted">{k}</span>
            {isMine
              ? m.slots[k]!.map((c, j) => (
                  <span key={j} className={`rounded px-1 font-bold ${c.kind === 'planet' ? 'bg-[rgba(69,209,154,.25)] text-[var(--lc-planet)]' : 'bg-raised text-muted'}`}>
                    {c.kind === 'planet' ? c.planet : '위장'}
                  </span>
                ))
              : Array.from({ length: view.sides[pid].slotCounts[k] ?? 0 }, (_, j) => (
                  <span key={j} className={pid === side ? 'lc-me' : 'lc-opp'}>
                    ■
                  </span>
                ))}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      {hint && <p className="m-0 text-xs leading-snug text-muted">{hint}</p>}
      {body}
      <div className="flex flex-col gap-1" aria-label="파문 컨베이어">
        <div className="flex justify-between text-[11px] text-muted">
          <span>파문 컨베이어 · 1번 칸에서 나가면 도달</span>
          <span>
            위장 {view.sides[side].decoys} · {view.sides[opp].decoys}
          </span>
        </div>
        {rippleRow(side)}
        {rippleRow(opp)}
      </div>
    </div>
  )
}
