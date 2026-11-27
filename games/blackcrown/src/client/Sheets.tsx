import { Sheet } from '@gamehub/ui'
import { useMemo, useState } from 'react'
import type { Action } from '../engine/game'
import { CLASSES, ITEMS, MONSTERS, RITUALS, SUIT_NAMES, TILE_NAMES, type ItemId, type RitualId } from '../engine/data'
import { Cat, HAND_NAMES, HAND_POKER, SUITS, type HandResult, type Suit } from '../engine/hands'
import { attackRange, dist, pendingDamage, previewAttack, previewSmite, price, pushChoices, type Card, type View } from '../engine/game'
import { faceOf } from '../engine/board'
import { CardView, HpBar, Ico, Pawn } from './ui'
import { asState, isOpenView } from './helpers'

type Act = (a: Action) => void

// ───────── 족보 추천 ─────────

interface Combo {
  cards: number[]
  hand: HandResult
  damage: number
  blocked: boolean
}

function subsets<T>(arr: readonly T[], max: number): T[][] {
  const out: T[][] = []
  const walk = (start: number, cur: T[]) => {
    if (cur.length) out.push([...cur])
    if (cur.length >= max) return
    for (let i = start; i < arr.length; i++) {
      cur.push(arr[i] as T)
      walk(i + 1, cur)
      cur.pop()
    }
  }
  walk(0, [])
  return out
}

type Mode = { kind: 'attack'; target: number } | { kind: 'assist' } | { kind: 'smite' }

function preview(view: View, me: number, mode: Mode, ids: number[]): Combo | null {
  const s = asState(view)
  if (mode.kind === 'smite') {
    const r = previewSmite(s, me, ids)
    return r ? { cards: ids, hand: r.hand, damage: r.damage, blocked: false } : null
  }
  const r = previewAttack(s, me, mode.kind === 'attack' ? mode.target : (view.attack?.target ?? 0), ids)
  return r ? { cards: ids, hand: r.hand, damage: r.damage, blocked: r.blocked } : null
}

function suggestions(view: View, me: number, mode: Mode): Combo[] {
  const p = view.players[me]
  if (!p?.hand) return []
  const max = mode.kind === 'smite' ? 5 : Math.min(5, p.level)
  const best = new Map<number, Combo>()
  for (const sub of subsets(p.hand, max)) {
    const c = preview(view, me, mode, sub.map((x) => x.id))
    if (!c) continue
    const cur = best.get(c.hand.cat)
    const cheaper = cur && c.damage === cur.damage && c.cards.length < cur.cards.length
    if (!cur || c.damage > cur.damage || cheaper) best.set(c.hand.cat, c)
  }
  return [...best.values()].sort((a, b) => Number(a.blocked) - Number(b.blocked) || b.damage - a.damage || b.hand.cat - a.hand.cat).slice(0, 4)
}

const usesShadow = (p: { hand: Card[] | null }, ids: number[]) => ids.some((id) => p.hand?.find((c) => c.id === id)?.suit === null)

// ───────── 공격 · 협공 · 광역 공격 시트 ─────────

export function AttackSheet({ view, me, mode, onAct, onClose }: { view: View; me: number; mode: Mode; onAct: Act; onClose(): void }) {
  const p = view.players[me]
  const combos = useMemo(() => suggestions(view, me, mode), [view, me, mode])
  const [picked, setPicked] = useState<number[] | null>(null)
  const sel = picked ?? combos[0]?.cards ?? []
  const pv = sel.length ? preview(view, me, mode, sel) : null
  if (!p?.hand) return null

  const targetId = mode.kind === 'attack' ? mode.target : mode.kind === 'assist' ? (view.attack?.target ?? 0) : -1
  const monster = targetId > 0 ? view.monsters.find((m) => m.id === targetId) : undefined
  const def = monster ? MONSTERS[monster.kind] : null
  const demon = view.demon
  const community: Card[] = mode.kind === 'smite' || targetId === -1 ? view.community : monster?.community ? [monster.community] : []
  const base = mode.kind === 'assist' ? pendingDamage(asState(view)) : 0
  const shownIds = new Set(view.attack?.shown.map((x) => x.card.id) ?? [])
  const toGrave = pv && pv.hand.cat >= Cat.Pair
  const patternIds = new Set(pv?.hand.pattern.map((c) => c.id))
  const shadow = usesShadow(p, sel)
  const title = mode.kind === 'smite' ? '광역 공격' : mode.kind === 'assist' ? '협공' : `${def?.name ?? '마왕'} 공격`

  const toggle = (id: number) => {
    const cur = picked ?? sel
    setPicked(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  }
  const go = () => {
    if (mode.kind === 'attack') onAct({ type: 'attack', target: mode.target, cards: sel })
    else if (mode.kind === 'assist') onAct({ type: 'assist', cards: sel })
    else onAct({ type: 'smite', cards: sel })
    onClose()
  }

  return (
    <Sheet open title={title} onClose={mode.kind === 'assist' ? () => { onAct({ type: 'pass' }); onClose() } : onClose}>
      {def && monster ? (
        <div className="bcx-foe">
          <div className={`bc-tile bc-tile--${def.grade === 'boss' ? 'boss' : 'monster'} bcx-foe__art`}>
            <Ico id={def.grade === 'boss' ? 'bc-tile-boss' : 'bc-tile-monster'} />
          </div>
          <div>
            <h3 className="bcx-foe__name">{def.name}</h3>
            <div className="bcx-chips">
              <span className="bcx-chip">{def.grade === 'boss' ? '장 보스' : def.grade === 'elite' ? '강적' : '일반'}</span>
              <span className="bcx-chip">반격 {def.atk}</span>
              {def.text && <span className="bcx-chip bcx-chip--warn">{def.text}</span>}
            </div>
            <div className="bcx-foe__hp">
              <HpBar hp={monster.hp} max={def.hp} />
              <b className="bc-num">
                {monster.hp} / {def.hp}
              </b>
            </div>
          </div>
        </div>
      ) : demon && mode.kind !== 'smite' ? (
        <div className="bcx-foe">
          <Pawn seat={demon.seat} cls={null} demon extra="bc-pawn--lg" />
          <div>
            <h3 className="bcx-foe__name">마왕</h3>
            <div className="bcx-foe__hp">
              <HpBar hp={demon.hp ?? demon.maxHp} max={demon.maxHp} demon />
              <b className="bc-num">{demon.hp ?? '??'}</b>
            </div>
          </div>
        </div>
      ) : null}

      {mode.kind === 'assist' && view.attack && (
        <p className="bcx-note">
          {view.players[view.attack.attacker] && <Pawn seat={view.attack.attacker} cls={view.players[view.attack.attacker]!.cls} />} 지금 피해 {base}. 카드를 보태면 하나의 족보로 합쳐집니다. 대기 토큰 1개를 씁니다.
        </p>
      )}

      {(community.length > 0 || shownIds.size > 0) && (
        <div className="bcx-play">
          <div className="bcx-label">{mode.kind === 'assist' ? '이미 낸 카드 · 공용 카드' : '공용 카드'}</div>
          <div className="bc-hand bcx-row">
            {view.attack && mode.kind === 'assist' && view.attack.shown.map((x) => <CardView key={x.card.id} card={x.card} w={48} state="is-community" />)}
            {community.map((c) => (
              <CardView key={c.id} card={c} w={48} state={`is-community ${patternIds.has(c.id) ? 'is-selected' : ''}`} />
            ))}
          </div>
        </div>
      )}

      <div className="bcx-play">
        <div className="bcx-label">내 손패 · {sel.length}장 고름 (최대 {mode.kind === 'smite' ? 5 : p.level}장)</div>
        <div className="bc-hand bcx-row">
          {p.hand.map((c) => {
            const on = sel.includes(c.id)
            const state = [on ? 'is-selected' : '', on && toGrave && c.suit !== null ? 'is-to-grave' : '', view.demon?.seat === me ? 'is-cursed' : ''].join(' ')
            return <CardView key={c.id} card={c} w={54} state={state} onClick={() => toggle(c.id)} />
          })}
        </div>
      </div>

      {combos.length > 0 && (
        <div className="bcx-combos" role="radiogroup" aria-label="족보 추천">
          {combos.map((c) => {
            const chosen = c.cards.length === sel.length && c.cards.every((id) => sel.includes(id))
            const sh = usesShadow(p, c.cards)
            return (
              <button key={c.hand.cat} type="button" role="radio" aria-checked={chosen} className={`bc-combo ${sh ? 'bc-combo--umbra' : ''} ${chosen ? 'is-chosen' : ''}`} onClick={() => setPicked(c.cards)}>
                <span className="bc-combo__name">
                  {HAND_NAMES[c.hand.cat]}
                  {sh ? (
                    <span className="bc-combo__grave">
                      <Ico id="bc-shadow" />
                      그림자 +1
                    </span>
                  ) : c.hand.cat >= Cat.Pair ? (
                    <span className="bc-combo__grave">
                      <Ico id="bc-ui-grave" />
                      묘지로
                    </span>
                  ) : null}
                </span>
                <span className="bc-combo__rule">
                  {HAND_POKER[c.hand.cat]} · {c.cards.length}장{c.blocked ? ' · 통하지 않음' : ''}
                </span>
                <span className="bc-combo__power">{c.blocked ? 0 : c.damage}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="bcx-math" aria-live="polite">
        {pv ? (
          <>
            <div className="bcx-math__row">
              <span>
                {HAND_NAMES[pv.hand.cat]}({HAND_POKER[pv.hand.cat]})
              </span>
              <b className={monster && pv.damage >= monster.hp ? 'bcx-kill' : ''}>
                {pv.blocked ? '통하지 않음' : `피해 ${mode.kind === 'assist' ? `${base} → ${pv.damage}` : pv.damage}`}
                {monster && !pv.blocked && pv.damage >= monster.hp ? ' · 처치' : ''}
                {mode.kind === 'smite' && previewSmite(asState(view), me, sel) ? ` × ${previewSmite(asState(view), me, sel)!.targets.length}명` : ''}
              </b>
            </div>
            {def && monster && mode.kind === 'attack' && pv.damage < monster.hp && (
              <div className="bcx-math__row">
                <span>반격</span>
                <b>{pv.hand.cat === Cat.Trips || pv.hand.cat === Cat.Full ? '없음' : `최대 ${Math.max(0, def.atk - pv.hand.pattern.filter((c) => c.suit === 'ward').length)}`}</b>
              </div>
            )}
            {toGrave && (
              <div className="bcx-grave">
                <Ico id="bc-ui-grave" />낸 카드는 마왕의 묘지에 쌓입니다
              </div>
            )}
          </>
        ) : (
          <div className="bcx-math__row bcx-muted">{sel.length ? '족보를 이루지 않는 카드가 섞여 있습니다' : '카드를 고르세요'}</div>
        )}
      </div>

      <div className="bcx-sheet-actions">
        {mode.kind === 'assist' ? (
          <button type="button" className="bc-btn" onClick={() => { onAct({ type: 'pass' }); onClose() }}>
            패스
          </button>
        ) : (
          <button type="button" className="bc-btn" onClick={onClose}>
            취소
          </button>
        )}
        <button type="button" className={`bc-btn ${shadow || view.demon?.seat === me ? 'bc-btn--umbra' : 'bc-btn--primary'}`} disabled={!pv} onClick={go}>
          {pv ? `${HAND_NAMES[pv.hand.cat]}으로 ${mode.kind === 'assist' ? '협공' : '공격'}` : '공격'}
        </button>
      </div>
    </Sheet>
  )
}

// ───────── 이 칸에서 할 수 있는 것 ─────────

export function HereSheet({ view, me, canAct, onAct, onAttack, onClose }: { view: View; me: number; canAct: boolean; onAct: Act; onAttack(target: number): void; onClose(): void }) {
  const p = view.players[me]
  const [forgeCard, setForgeCard] = useState<number | null>(null)
  const [tradeCard, setTradeCard] = useState<number | null>(null)
  if (!p) return null
  const t = view.board[p.pos]
  const kind = t?.kind ?? 'empty'
  const tokens = canAct ? view.tokens : 0
  const final = view.phase === 'final'
  const isDemon = view.demon?.seat === me
  const range = attackRange(asState(view).players[me]!)
  const targets = view.monsters.filter((m) => dist(view, m.pos, p.pos) <= range)
  const allies = view.players.filter((q) => q.seat !== me && q.pos === p.pos && !q.out && q.seat !== view.demon?.seat)
  const act = (a: Action) => {
    onAct(a)
  }
  const pushable = isDemon ? view.players.filter((q) => q.seat !== me && !q.out && dist(view, q.pos, p.pos) === 1) : []

  return (
    <Sheet open title={final ? '최종전' : (TILE_NAMES[kind as keyof typeof TILE_NAMES] ?? '이 칸')} onClose={onClose}>
      {!canAct && <p className="bcx-note">지금은 내 차례가 아닙니다.</p>}

      {targets.length > 0 && (
        <section className="bcx-section">
          <h4>공격할 수 있는 몬스터</h4>
          {targets.map((m) => (
            <button key={m.id} type="button" className="bcx-rowbtn" disabled={tokens < 1} onClick={() => onAttack(m.id)}>
              <Ico id={MONSTERS[m.kind].grade === 'boss' ? 'bc-tile-boss' : 'bc-tile-monster'} />
              <span>
                <b>{MONSTERS[m.kind].name}</b> · 체력 {m.hp} · 반격 {MONSTERS[m.kind].atk}
                {MONSTERS[m.kind].text ? ` · ${MONSTERS[m.kind].text}` : ''}
              </span>
            </button>
          ))}
        </section>
      )}

      {!final && kind === 'shop' && (
        <section className="bcx-section">
          <h4>상점 · 골드 {p.gold}</h4>
          <div className="bcx-shop">
            {[...view.shop.equip, ...view.shop.cons].map((it) => (
              <ShopRow key={it} item={it} cost={price(asState(view), asState(view).players[me]!, it)} disabled={tokens < 1 || p.gold < price(asState(view), asState(view).players[me]!, it)} onBuy={() => act({ type: 'buy', item: it })} />
            ))}
          </div>
          <button type="button" className="bc-btn bc-btn--ghost" disabled={!canAct || p.gold < 1} onClick={() => act({ type: 'reroll' })}>
            진열 바꾸기 (1골드)
          </button>
        </section>
      )}

      {!final && kind === 'altar' && (
        <section className="bcx-section">
          <h4>제단</h4>
          <p className="bcx-note">축복 6장과 그림자 카드 {view.shadowFreeCount}장 중 하나를 몰래 받습니다. 기도 횟수는 모두에게 보입니다.</p>
          <button type="button" className="bc-btn bc-btn--umbra" disabled={tokens < 1} onClick={() => act({ type: 'pray' })}>
            기도하기 <Cost n={1} />
          </button>
        </section>
      )}

      {!final && (kind === 'spring' || kind === 'camp') && (
        <section className="bcx-section">
          <h4>{kind === 'spring' ? '샘' : '야영지'}</h4>
          <p className="bcx-note">{kind === 'spring' ? '손패를 한도까지 채웁니다.' : '체력 3을 회복합니다.'}</p>
          <button type="button" className="bc-btn bc-btn--primary" disabled={tokens < 1} onClick={() => act({ type: 'rest' })}>
            쉬기 <Cost n={1} />
          </button>
        </section>
      )}

      {!final && kind === 'treasure' && (
        <section className="bcx-section">
          <h4>보물상자</h4>
          <button type="button" className="bc-btn bc-btn--primary" disabled={tokens < 1} onClick={() => act({ type: 'open' })}>
            열기 <Cost n={1} />
          </button>
        </section>
      )}

      {!final && kind === 'forge' && p.hand && (
        <section className="bcx-section">
          <h4>대장간 · 골드 {p.gold}</h4>
          <div className="bc-hand bcx-row">
            {p.hand.filter((c) => c.suit !== null).map((c) => (
              <CardView key={c.id} card={c} w={48} state={forgeCard === c.id ? 'is-selected' : ''} onClick={() => setForgeCard(c.id)} />
            ))}
          </div>
          <div className="bcx-btnrow">
            <button type="button" className="bc-btn bc-btn--primary" disabled={tokens < 1 || forgeCard === null || p.gold < 3} onClick={() => forgeCard !== null && act({ type: 'forge', card: forgeCard, mode: 'rank' })}>
              숫자 +2 (3골드)
            </button>
            {SUITS.map((su: Suit) => (
              <button key={su} type="button" className={`bc-btn bcx-suitbtn bc-suit--${su}`} disabled={tokens < 1 || forgeCard === null || p.gold < 2} onClick={() => forgeCard !== null && act({ type: 'forge', card: forgeCard, mode: 'suit', suit: su })} aria-label={`${SUIT_NAMES[su]}으로 (2골드)`}>
                <Ico id={`bc-suit-${su}`} />
              </button>
            ))}
          </div>
        </section>
      )}

      {allies.length > 0 && p.hand && p.hand.length > 0 && !isDemon && (
        <section className="bcx-section">
          <h4>카드 교환</h4>
          <div className="bc-hand bcx-row">
            {p.hand.map((c) => (
              <CardView key={c.id} card={c} w={44} state={tradeCard === c.id ? 'is-selected' : ''} onClick={() => setTradeCard(c.id)} />
            ))}
          </div>
          <div className="bcx-btnrow">
            {allies.map((q) => (
              <button key={q.seat} type="button" className="bc-btn" disabled={tokens < 1 || tradeCard === null} onClick={() => tradeCard !== null && act({ type: 'trade', to: q.seat, card: tradeCard })}>
                {q.seat + 1}번과 교환 <Cost n={1} />
              </button>
            ))}
          </div>
        </section>
      )}

      {isDemon && pushable.length > 0 && (
        <section className="bcx-section">
          <h4>밀쳐내기</h4>
          <div className="bcx-btnrow">
            {pushable.flatMap((q) => {
              const off = tokens < 1 || !!view.demon?.chained
              const choices = pushChoices(view, p.pos, q.pos)
              // 갈 칸이 여럿이면 마왕이 고른다(docs/design.md 13-1)
              if (choices.length <= 1)
                return [
                  <button key={q.seat} type="button" className="bc-btn bc-btn--umbra" disabled={off} onClick={() => act({ type: 'push', target: q.seat })}>
                    {q.seat + 1}번 밀치기 <Cost n={1} />
                  </button>,
                ]
              return choices.map((to) => (
                <button key={`${q.seat}-${to}`} type="button" className="bc-btn bc-btn--umbra" disabled={off} onClick={() => act({ type: 'push', target: q.seat, to })}>
                  {q.seat + 1}번 → {cellName(view, to)} <Cost n={1} />
                </button>
              ))
            })}
          </div>
        </section>
      )}

      {isDemon && p.cls === 'mage' && view.community.length === 5 && !view.demon?.riverTwisted && (
        <section className="bcx-section">
          <button type="button" className="bc-btn bc-btn--umbra" disabled={!canAct} onClick={() => act({ type: 'twist' })}>
            리버 다시 뽑기
          </button>
        </section>
      )}

      {final && !isDemon && (
        <section className="bcx-section">
          <h4>봉인 의식 · 연합 금고 {view.treasury}</h4>
          <Rites view={view} canAct={canAct} onAct={act} />
        </section>
      )}
    </Sheet>
  )
}

const Cost = ({ n }: { n: number }) => (
  <span className="bc-btn__cost">
    <Ico id="bc-ui-token" />
    {n}
  </span>
)

function ShopRow({ item, cost, disabled, onBuy }: { item: ItemId; cost: number; disabled: boolean; onBuy(): void }) {
  const d = ITEMS[item]
  return (
    <div className="bcx-shoprow">
      <div>
        <b>{d.name}</b> <span className="bcx-muted">{d.slot === 'consumable' ? '소모품' : d.slot === 'weapon' ? '무기' : d.slot === 'armor' ? '방어구' : '장신구'}</span>
        <div className="bcx-light">{d.light}</div>
        {d.dark && (
          <div className="bcx-dark">
            <Ico id="bc-crown" />
            {d.dark}
          </div>
        )}
      </div>
      <button type="button" className="bc-btn bc-btn--primary" disabled={disabled} onClick={onBuy}>
        <Ico id="bc-ui-gold" /> {cost}
      </button>
    </div>
  )
}

export function Rites({ view, canAct, onAct }: { view: View; canAct: boolean; onAct: Act }) {
  const king = view.demon ? view.players[view.demon.seat] : null
  const extra = king?.trinket === 'merchantPouch' ? 2 : 0
  return (
    <div className="bcx-rites">
      {(Object.keys(RITUALS) as RitualId[]).map((r) => {
        const used = view.ritualsUsed.includes(r)
        const cost = RITUALS[r].price + extra
        return (
          <button key={r} type="button" className={`bc-rite ${used ? 'is-used' : ''}`} disabled={!canAct || used || view.treasury < cost} title={RITUALS[r].text} onClick={() => onAct({ type: 'ritual', ritual: r })}>
            {RITUALS[r].name}
            <b>{cost}</b>
          </button>
        )
      })}
    </div>
  )
}

// ───────── 선택(강화·제단·보물·짐승·교환) ─────────

export function PendingSheet({ view, me, onAct }: { view: View; me: number; onAct: Act }) {
  const pd = view.pending[0]
  const p = view.players[me]
  const [give, setGive] = useState<number | null>(null)
  if (!pd || pd.seat !== me || !p) return null
  const noop = () => {}
  if (pd.kind === 'upgrade' && 'tier' in pd && p.cls) {
    const opts = CLASSES[p.cls].upgrades[pd.tier]
    return (
      <Sheet open title={`레벨 ${pd.tier === 0 ? 3 : 5} 강화`} onClose={noop}>
        <p className="bcx-note">{CLASSES[p.cls].name}의 강화를 하나 고르세요.</p>
        <div className="bcx-choices">
          {opts.map((o, i) => (
            <button key={i} type="button" className="bc-combo" onClick={() => onAct({ type: 'choose', option: i })}>
              <span className="bc-combo__name">{i === 0 ? 'A' : 'B'}</span>
              <span className="bc-combo__rule">{o}</span>
            </button>
          ))}
        </div>
      </Sheet>
    )
  }
  if (pd.kind === 'altar' && 'options' in pd) {
    return (
      <Sheet open title="제단 · 하나를 고르세요" onClose={noop}>
        <div className="bcx-choices">
          {pd.options.map((o, i) =>
            'shadowId' in o ? (
              <button key={i} type="button" className="bc-combo bc-combo--umbra" onClick={() => onAct({ type: 'choose', option: i })}>
                <span className="bc-combo__name">
                  그림자 카드
                  <span className="bc-combo__grave">
                    <Ico id="bc-shadow" />
                    그림자
                  </span>
                </span>
                <span className="bc-combo__rule">아무 문양·숫자로 쓰는 와일드. 쓰거나 들고 있으면 그림자 +1</span>
              </button>
            ) : (
              <button key={i} type="button" className="bc-combo" onClick={() => onAct({ type: 'choose', option: i })}>
                <span className="bc-combo__name">축복</span>
                <span className="bc-combo__rule">{BLESSING_KO[o.blessing]}</span>
              </button>
            ),
          )}
        </div>
      </Sheet>
    )
  }
  if (pd.kind === 'treasure' && 'item' in pd) {
    const d = ITEMS[pd.item]
    const old = p[d.slot as 'weapon' | 'armor' | 'trinket']
    return (
      <Sheet open title="보물" onClose={noop}>
        <p className="bcx-note">
          <b>{d.name}</b>: {d.light}
          <br />
          <span className="bcx-dark">어둠 면: {d.dark}</span>
        </p>
        <p className="bcx-note">지금 장비: {old ? ITEMS[old].name : '없음'}</p>
        <div className="bcx-sheet-actions">
          <button type="button" className="bc-btn" onClick={() => onAct({ type: 'choose', option: 0 })}>
            그대로
          </button>
          <button type="button" className="bc-btn bc-btn--primary" onClick={() => onAct({ type: 'choose', option: 1 })}>
            바꿔 끼기
          </button>
        </div>
      </Sheet>
    )
  }
  if (pd.kind === 'beast') {
    return (
      <Sheet open title="그림자 짐승의 유산" onClose={noop}>
        <p className="bcx-note">그림자 카드를 받을까요? 와일드로 쓸 수 있지만 그림자가 쌓입니다.</p>
        <div className="bcx-sheet-actions">
          <button type="button" className="bc-btn" onClick={() => onAct({ type: 'choose', option: 0 })}>
            거절
          </button>
          <button type="button" className="bc-btn bc-btn--umbra" onClick={() => onAct({ type: 'choose', option: 1 })}>
            받는다
          </button>
        </div>
      </Sheet>
    )
  }
  if (pd.kind === 'trade' && 'card' in pd && p.hand) {
    return (
      <Sheet open title={`${pd.from + 1}번이 카드 교환을 원합니다`} onClose={noop}>
        <div className="bcx-play">
          <div className="bcx-label">받을 카드</div>
          <CardView card={pd.card} w={54} />
        </div>
        <div className="bcx-play">
          <div className="bcx-label">줄 카드를 고르세요</div>
          <div className="bc-hand bcx-row">
            {p.hand.map((c) => (
              <CardView key={c.id} card={c} w={48} state={give === c.id ? 'is-selected' : ''} onClick={() => setGive(c.id)} />
            ))}
          </div>
        </div>
        <div className="bcx-sheet-actions">
          <button type="button" className="bc-btn" onClick={() => onAct({ type: 'tradeReply', card: null })}>
            거절
          </button>
          <button type="button" className="bc-btn bc-btn--primary" disabled={give === null} onClick={() => onAct({ type: 'tradeReply', card: give })}>
            교환
          </button>
        </div>
      </Sheet>
    )
  }
  return null
}

const BLESSING_KO: Record<string, string> = { heal: '체력 5 회복', xp: '경험치 2', gold: '골드 3', fill: '손패를 한도까지', fame: '명성 1', token: '행동 토큰 1' }

// ───────── 자리 상세 ─────────

export function PlayerSheet({ view, seat, name, onClose }: { view: View; seat: number; name: string; onClose(): void }) {
  const p = view.players[seat]
  if (!p) return null
  const demon = view.demon?.seat === seat
  const gear = [p.weapon, p.armor, p.trinket]
  return (
    <Sheet open title={name} onClose={onClose}>
      <div className="bcx-detail">
        <Pawn seat={seat} cls={p.cls} demon={demon} extra="bc-pawn--lg" />
        <div>
          <b>{demon ? '마왕' : p.cls ? CLASSES[p.cls].name : '직업 고르는 중'}</b> · 레벨 {p.level}
          <div className="bcx-muted">
            체력 {p.hp} · 명성 {p.fame} · 골드 {p.gold} · 손패 {p.handCount}장 · 제단 {p.altarVisits}회
          </div>
          {p.cls && <div className="bcx-note">{CLASSES[p.cls].passive}</div>}
        </div>
      </div>
      <h4>장비</h4>
      <div className="bcx-gearlist">
        {gear.map((g, i) =>
          g ? (
            <div key={i} className={`bc-gear ${demon ? 'is-dark' : ''}`}>
              <span className="bc-gear__light">
                <b>{ITEMS[g].name}</b> · {ITEMS[g].light}
              </span>
              <span className="bc-gear__dark">{ITEMS[g].dark}</span>
            </div>
          ) : (
            <div key={i} className="bc-gear bc-gear--empty">
              {['무기', '방어구', '장신구'][i]} 없음
            </div>
          ),
        )}
      </div>
      {p.curses.length > 0 && (
        <p className="bcx-dark">
          저주 유물: {p.curses.map((c) => (c.id ? ITEMS[c.id].name : '숨겨진 유물')).join(', ')}
        </p>
      )}
    </Sheet>
  )
}

export { HAND_NAMES }

/** 칸 이름: 판 이름 + 칸 타일(밀쳐낼 칸 고르기용) */
function cellName(view: View, i: number): string {
  const c = view.map.cells[i]
  const t = view.board[i]
  const tile = c ? view.map.tiles[c.tile] : undefined
  const kind = !t ? '' : t.kind === 'hidden' ? '뒤집히지 않은 칸' : (TILE_NAMES[t.kind as keyof typeof TILE_NAMES] ?? '')
  return tile ? `${faceOf(tile).name}의 ${kind}` : kind
}

const TILE_DESC: Record<string, string> = {
  camp: '시작 칸. 토큰 1로 체력 3을 회복합니다.',
  monster: '들어가면 몬스터가 나타나고 공용 카드 1장이 펼쳐집니다.',
  boss: '장 보스가 있는 칸. 장이 시작될 때 공개됩니다.',
  wander: '방랑 몬스터. 라운드 끝에 가장 가까운 말 쪽으로 1칸 움직입니다.',
  treasure: '토큰 1로 보물을 엽니다(장비 80%, 저주 유물 20%).',
  shop: '토큰 1로 장비·소모품을 삽니다. 장마다 새로 진열됩니다.',
  forge: '토큰 1로 손패 1장을 강화합니다(숫자 +2 3골드, 문양 바꾸기 2골드).',
  spring: '토큰 1로 손패를 한도까지 채웁니다.',
  altar: '토큰 1로 몰래 기도합니다(축복 또는 그림자 카드). 기도 횟수는 모두에게 보입니다.',
  forest: '숲. 들어갈 때 토큰이 1개 더 듭니다.',
  ruin: '폐허. 효과가 없습니다.',
  empty: '빈 땅. 효과가 없습니다.',
  throne: '마왕성의 옥좌.',
}
const GRADE_NAMES = { normal: '일반', elite: '정예', boss: '보스' } as const

/** 남의 칸을 눌렀을 때: 그 칸에 무엇이 있는지 보여 준다(행동은 없음) */
export function CellSheet({ view, cell, me, names, onPlayer, onClose }: { view: View; cell: number; me: number | null; names: string[]; onPlayer(seat: number): void; onClose(): void }) {
  const t = view.board[cell]
  if (!t) return null
  const monsters = view.monsters.filter((m) => m.pos === cell)
  const pawns = view.players.filter((q) => q.pos === cell && !q.out)
  const kind = t.kind
  const title = monsters[0] ? MONSTERS[monsters[0].kind].name : kind === 'hidden' ? '뒤집히지 않은 칸' : (TILE_NAMES[kind as keyof typeof TILE_NAMES] ?? '칸')
  const mine = me === null ? undefined : view.players[me]
  const far = mine && !mine.out ? dist(view, mine.pos, cell) : null
  const locked = !isOpenView(view, cell)
  return (
    <Sheet open title={title} onClose={onClose}>
      <p className="bcx-note">
        {cellName(view, cell)}
        {far !== null && far > 0 && far < 99 ? ` · 내 말에서 ${far}칸` : ''}
        {locked ? ' · 아직 열리지 않은 고리' : ''}
      </p>
      {monsters.map((m) => {
        const def = MONSTERS[m.kind]
        return (
          <section key={m.id} className="bcx-section">
            <h4>
              {def.name} · {GRADE_NAMES[def.grade]}
            </h4>
            <div className="bcx-detail">
              {m.community && <CardView card={m.community} w={48} state="is-community" />}
              <div>
                <div>
                  체력 <b className="bc-num">{m.hp}</b>/{def.hp} · 반격 <b className="bc-num">{def.atk}</b>
                </div>
                {def.text && <div className="bcx-note">{def.text}</div>}
                {m.community && <div className="bcx-muted">카드는 이 몬스터의 공용 카드입니다. 공격할 때 내 손패와 함께 족보에 쓸 수 있습니다.</div>}
              </div>
            </div>
          </section>
        )
      })}
      {!monsters.length && kind !== 'hidden' && <p>{TILE_DESC[kind] ?? ''}</p>}
      {kind === 'hidden' && <p className="bcx-muted">처음 밟을 때 뒤집힙니다.</p>}
      {pawns.length > 0 && (
        <section className="bcx-section">
          <h4>이 칸의 말</h4>
          {pawns.map((q) => (
            <button key={q.seat} type="button" className="bcx-rowbtn" onClick={() => onPlayer(q.seat)}>
              <Pawn seat={q.seat} cls={q.cls} demon={view.demon?.seat === q.seat} />
              <span>
                <b>{names[q.seat]}</b> · 레벨 {q.level} · 체력 {q.hp}
              </span>
            </button>
          ))}
        </section>
      )}
    </Sheet>
  )
}
