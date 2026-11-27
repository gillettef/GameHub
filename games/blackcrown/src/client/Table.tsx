import type { RoomSnapshot } from '@gamehub/net'
import { GameShell, LogList, ResultList, Sheet } from '@gamehub/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CLASSES, CLASS_IDS, ITEMS, MONSTERS, type ClassId } from '../engine/data'
import { attackRange, handLimit, reserveCap, shadowTotal, skillLimit, type Action, type View } from '../engine/game'
import { Board } from './Board'
import { asState, attackTargets, classIcon, reachable, seatVar } from './helpers'
import { Coronation } from './Coronation'
import { AttackSheet, CellSheet, HereSheet, PendingSheet, PlayerSheet, Rites } from './Sheets'
import { CardBack, CardView, HpBar, Ico, Pawn, Sprite, Tokens } from './ui'

const CHAPTER = ['', '1장 · 숲', '2장 · 폐허', '3장 · 마왕성', '최종전']

type Overlay = { kind: 'attack'; target: number } | { kind: 'smite' } | { kind: 'here' } | { kind: 'player'; seat: number } | { kind: 'cell'; cell: number } | { kind: 'menu' } | null

export function Table({ room, error, onAct, onLeave }: { room: RoomSnapshot<View>; error: string | null; onAct(a: Action): void; onLeave(): void }) {
  const view = room.view!
  const me = room.you
  const names = room.seats.map((s, i) => s.name || `${i + 1}번`)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const playing = room.status === 'playing' && view.phase !== 'over'
  const mine = playing && me !== null && room.actors.includes(me)
  const myTurn = mine && !view.attack && view.pending.length === 0 && view.turn === me && view.phase !== 'draft'
  const myPending = mine && view.pending[0]?.seat === me
  const myAssist = mine && !!view.attack && view.attack.waiting.includes(me ?? -1)
  const p = me === null ? undefined : view.players[me]
  const isDemon = me !== null && view.demon?.seat === me

  // 대관식은 이 화면에서 처음 일어날 때 한 번 보여 준다
  const sawCoronation = useRef(view.coronation !== null)
  const [crowning, setCrowning] = useState(false)
  useEffect(() => {
    if (view.coronation && !sawCoronation.current) {
      sawCoronation.current = true
      setCrowning(true)
      setOverlay(null)
    }
  }, [view.coronation])
  const endCrown = useCallback(() => setCrowning(false), [])

  const act = (a: Action) => onAct(a)
  const range = p && me !== null ? attackRange(asState(view).players[me]!) : 0
  const targets = myTurn && view.tokens > 0 && !isDemon ? attackTargets(view, me, range) : new Set<number>()

  const onTile = (i: number) => {
    if (me !== null && p) {
      if (myTurn && reachable(view, me, true).has(i)) return act({ type: 'move', to: i })
      if (myTurn && targets.has(i)) {
        if (view.phase === 'final') return setOverlay({ kind: 'attack', target: -1 })
        const ms = view.monsters.filter((m) => m.pos === i)
        if (ms.length === 1) return setOverlay({ kind: 'attack', target: ms[0]!.id })
      }
      if (i === p.pos || (isDemon && myTurn)) return setOverlay({ kind: 'here' })
    }
    // 그 밖의 칸: 이미 보이는 것(펼친 칸·몬스터·말)이 있으면 설명을 보여 준다
    const seen = view.board[i]?.kind !== 'hidden' || view.monsters.some((m) => m.pos === i) || view.players.some((q) => q.pos === i && !q.out)
    if (seen) setOverlay({ kind: 'cell', cell: i })
  }

  // ① 상태바
  const turnName = names[view.turn] ?? ''
  let status: string
  if (view.phase === 'over') status = view.winner === 'demon' ? `마왕 ${names[view.demon?.seat ?? 0]}의 승리` : '연합의 승리!'
  else if (view.phase === 'draft') status = mine ? '직업을 고르세요' : `${turnName} 직업을 고르는 중`
  else if (myPending) status = '선택하세요'
  else if (myAssist) status = '협공할까요?'
  else if (view.attack) status = '협공을 기다리는 중…'
  else if (myTurn) status = isDemon ? '마왕의 차례 · 연합을 쓸어버리세요' : view.phase === 'final' ? '내 차례 · 마왕을 공격하세요' : '내 차례 · 이동하거나 행동하세요'
  else status = `${turnName} 차례`
  const here = p ? view.monsters.filter((m) => m.pos === p.pos) : []
  const commLabel = view.community.length === 3 ? '플롭' : view.community.length === 4 ? '턴' : view.community.length === 5 ? '리버' : ''
  const detail =
    view.phase === 'draft'
      ? '직업 고르기'
      : `${Math.min(view.round, 12)} / 12라운드 · ${CHAPTER[view.chapter] ?? ''}${view.phase === 'final' && commLabel ? ` · ${commLabel}` : ''}${here[0] ? ` · ${MONSTERS[here[0].kind].name}와 같은 칸` : ''}`

  // ② 자리
  const players = (
    <div className="bcx-seats" role="list">
      {view.players.map((q) => {
        const demon = view.demon?.seat === q.seat
        const cls = ['bc-seat', demon ? 'bc-seat--demon' : '', room.actors.includes(q.seat) && playing ? 'is-turn' : '', q.out ? 'is-out' : ''].join(' ')
        return (
          <button key={q.seat} type="button" role="listitem" className={cls} style={seatVar(q.seat)} onClick={() => setOverlay({ kind: 'player', seat: q.seat })}>
            <span className="bc-seat__pawn">
              <Pawn seat={q.seat} cls={q.cls} demon={demon} />
              <span className="bc-seat__lv" aria-label="레벨">
                {q.level}
              </span>
            </span>
            <span className="bc-seat__name">
              {names[q.seat]}
              {q.seat === me && names[q.seat] !== '나' ? ' (나)' : ''}
              {room.seats[q.seat]?.kind === 'bot' ? ' · 봇' : ''}
            </span>
            <span className="bc-seat__stats">
              {demon && view.demon ? (
                <span className="bc-stat--hp">
                  <Ico id="bc-crown" />
                  {view.demon.hp ?? '??'}
                </span>
              ) : (
                <span className="bc-stat--hp">
                  <Ico id="bc-ui-hp" />
                  {q.hp}
                </span>
              )}
              <span className="bc-stat--fame">
                <Ico id="bc-ui-fame" />
                {q.fame}
              </span>
              {q.altarVisits > 0 && (
                <span className="bc-stat--prayer">
                  <Ico id="bc-ui-prayer" />
                  {q.altarVisits}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )

  // ③ 보드
  let main
  if (view.phase === 'over') main = <Result view={view} names={names} />
  else if (view.phase === 'draft') main = <Draft view={view} me={me} mine={mine} names={names} onPick={(cls) => act({ type: 'pickClass', cls })} />
  else
    main = (
      <div className="bcx-main">
        {view.phase === 'final' && view.demon ? (
          <FinalTop view={view} names={names} />
        ) : (
          <div className="bcx-piles">
            <span className="bcx-pile">
              <Ico id="bc-ui-cards" />
              뽑을 더미 <span className="bc-num">{view.deckCount}</span>
            </span>
            <span className="bcx-pile">
              버림 <span className="bc-num">{view.discard.length}</span>
            </span>
            <span className="bcx-pile bcx-pile--grave">
              <Ico id="bc-ui-grave" />
              마왕의 묘지 <span className="bc-num">{view.graveyard.length}</span>
            </span>
          </div>
        )}
        <Board view={view} me={me} canAct={myTurn} targets={targets} onTile={onTile} />
      </div>
    )

  // ④ 내 영역
  const hand =
    p && p.hand && view.phase !== 'draft' && view.phase !== 'over' ? (
      <div className="bcx-hand">
        {view.phase === 'final' && !isDemon && (
          <div className="bcx-rites-row">
            <span className="bcx-pool">
              <b className="bc-num">{view.treasury}</b>연합 금고
            </span>
            <Rites view={view} canAct={myTurn} onAct={act} />
          </div>
        )}
        <div className="bcx-mystats">
          <span className="bcx-hpwrap">
            <Ico id="bc-ui-hp" />
            <span className="bc-num">
              {p.hp}/{maxHpOf(p)}
            </span>
          </span>
          <span>
            <Ico id="bc-suit-coin" />
            <span className="bc-num">{p.gold}</span>
          </span>
          <span>
            <Ico id="bc-ui-fame" />
            <span className="bc-num">{p.fame}</span>
          </span>
          <span className="bcx-xp">
            Lv{p.level}
            {p.level < 7 && view.phase === 'play' ? ` · 경험 ${p.xp}` : ''}
          </span>
          <span className="bcx-mine" title="나만 보이는 그림자">
            <Ico id="bc-shadow" />
            <span className="bc-num">{p.shadow !== null ? shadowTotal(asState(view).players[me!]!) : 0}</span>
            <small>나만</small>
          </span>
        </div>
        <div className="bc-hand bcx-handrow" aria-label={`손패 ${p.hand.length} / ${handLimit(asState(view), asState(view).players[me!]!)}`}>
          {p.hand.length === 0 && <span className="bcx-muted">손패가 없습니다</span>}
          {p.hand.map((c) => (
            <CardView key={c.id} card={c} w={52} state={isDemon ? 'is-cursed' : ''} />
          ))}
        </div>
        <MyTools view={view} me={me!} canAct={myTurn} onAct={act} />
      </div>
    ) : undefined

  // ⑤ 행동
  const held = p?.reserve ?? 0
  const actions =
    view.phase === 'over' ? (
      <button type="button" className="bc-btn bc-btn--primary" onClick={onLeave}>
        처음으로
      </button>
    ) : view.phase === 'draft' ? (
      <span className="bcx-muted bcx-center">직업을 고르면 1장이 시작됩니다</span>
    ) : (
      <>
        <span className="bcx-tokenslot">
          <Tokens lit={myTurn ? view.tokens : 0} total={Math.max(3, myTurn ? view.tokens : 3)} held={held} />
        </span>
        <button type="button" className="bc-btn" disabled={!myTurn || view.tokens < 1 || !p?.hand || p.hand.length >= handLimit(asState(view), asState(view).players[me!]!)} onClick={() => act({ type: 'draw' })}>
          드로우
        </button>
        {isDemon ? (
          <button type="button" className="bc-btn bc-btn--umbra" disabled={!myTurn || view.tokens < 1} onClick={() => setOverlay({ kind: 'smite' })}>
            광역 공격
          </button>
        ) : (
          <button type="button" className="bc-btn bc-btn--primary" disabled={!myTurn} onClick={() => setOverlay({ kind: 'here' })}>
            행동
          </button>
        )}
        <button type="button" className="bc-btn bc-btn--ghost" disabled={!myTurn} onClick={() => act({ type: 'end' })}>
          끝내기
        </button>
      </>
    )

  return (
    <>
      <Sprite />
      <GameShell status={status} detail={detail} onMenu={() => setOverlay({ kind: 'menu' })} notice={error} players={players} hand={hand} actions={actions}>
        {main}
      </GameShell>

      {myPending && me !== null && <PendingSheet view={view} me={me} onAct={act} />}
      {myAssist && me !== null && <AttackSheet key={`assist-${view.attack?.shown.length}`} view={view} me={me} mode={{ kind: 'assist' }} onAct={act} onClose={() => {}} />}
      {!myPending && !myAssist && overlay?.kind === 'attack' && me !== null && <AttackSheet view={view} me={me} mode={{ kind: 'attack', target: overlay.target }} onAct={act} onClose={() => setOverlay(null)} />}
      {!myPending && !myAssist && overlay?.kind === 'smite' && me !== null && <AttackSheet view={view} me={me} mode={{ kind: 'smite' }} onAct={act} onClose={() => setOverlay(null)} />}
      {!myPending && !myAssist && overlay?.kind === 'here' && me !== null && (
        <HereSheet view={view} me={me} canAct={myTurn} onAct={act} onAttack={(t) => setOverlay({ kind: 'attack', target: t })} onClose={() => setOverlay(null)} />
      )}
      {overlay?.kind === 'cell' && <CellSheet view={view} cell={overlay.cell} me={me} names={names} onPlayer={(seat) => setOverlay({ kind: 'player', seat })} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'player' && <PlayerSheet view={view} seat={overlay.seat} name={names[overlay.seat] ?? ''} onClose={() => setOverlay(null)} />}
      <Sheet open={overlay?.kind === 'menu'} title="메뉴" onClose={() => setOverlay(null)}>
        <Rules />
        <h3 className="bcx-h">기록</h3>
        <LogList entries={room.log} />
        <button type="button" className="bc-btn bcx-leave" onClick={onLeave}>
          나가기
        </button>
      </Sheet>
      {crowning && <Coronation view={view} names={names} onDone={endCrown} />}
    </>
  )
}

function maxHpOf(p: View['players'][number]): number {
  return 12 + (p.level - 1) * 2 + (p.cls === 'knight' && p.upgrades[1] === 1 ? 6 : 0)
}

function MyTools({ view, me, canAct, onAct }: { view: View; me: number; canAct: boolean; onAct(a: Action): void }) {
  const p = view.players[me]
  if (!p) return null
  const sp = asState(view).players[me]!
  const demon = view.demon?.seat === me
  const gear = [p.weapon, p.armor, p.trinket].filter((g) => g !== null)
  return (
    <div className="bcx-tools">
      {!demon && p.cls && (
        <button type="button" className="bcx-tool" disabled={!canAct || p.skillUses >= skillLimit(sp)} onClick={() => onAct(p.cls === 'mage' && view.phase === 'final' ? { type: 'skill', target: view.community.length - 1 } : p.cls === 'hunter' ? { type: 'skill', target: p.pos } : { type: 'skill' })} title={CLASSES[p.cls].active}>
          <Ico id={classIcon(p.cls)} />
          {CLASSES[p.cls].active.split(':')[0]}
          <small>
            {skillLimit(sp) - p.skillUses}/{skillLimit(sp)}
          </small>
        </button>
      )}
      {p.cls === 'knight' && !demon && (
        <button type="button" className={`bcx-tool ${p.guard ? 'is-on' : ''}`} disabled={!canAct} onClick={() => onAct({ type: 'guard', on: !p.guard })}>
          수호 {p.guard ? '켬' : '끔'}
        </button>
      )}
      {p.cls === 'priest' && p.upgrades[1] === 0 && (
        <button type="button" className="bcx-tool bcx-tool--umbra" disabled={!canAct || p.purifyUsed} onClick={() => onAct({ type: 'purify' })}>
          정화
        </button>
      )}
      {p.consumables.map((it, i) => (
        <button key={`${it}${i}`} type="button" className="bcx-tool" disabled={!canAct || p.usedItem} onClick={() => onAct({ type: 'use', item: it })} title={ITEMS[it].light}>
          {ITEMS[it].name}
        </button>
      ))}
      {gear.map((g) => (
        <span key={g} className={`bcx-gearchip ${demon ? 'is-dark' : ''}`} title={`${ITEMS[g].light} / 어둠 면: ${ITEMS[g].dark}`}>
          {ITEMS[g].name}
        </span>
      ))}
      {p.curses.map((c, i) => (
        <span key={i} className="bcx-gearchip is-dark" title={c.id ? ITEMS[c.id].light : ''}>
          {c.id ? ITEMS[c.id].name : '저주 유물'}
        </span>
      ))}
      <span className="bcx-muted bcx-reserve">대기 최대 {reserveCap(sp)}</span>
    </div>
  )
}

function FinalTop({ view, names }: { view: View; names: string[] }) {
  const d = view.demon!
  const king = view.players[d.seat]
  const slots = [0, 1, 2, 3, 4]
  return (
    <div className="bcx-finaltop">
      <div className="bc-demonbar">
        <Pawn seat={d.seat} cls={king?.cls ?? null} demon />
        <span className="bc-demonbar__name">마왕 {names[d.seat]}</span>
        <span className="bc-demonbar__hp bc-num">
          {d.hp ?? '??'} <span className="bcx-muted">/ {d.maxHp}</span>
        </span>
        <HpBar hp={d.hp ?? d.maxHp} max={d.maxHp} demon />
        <div className="bc-demonbar__meta">
          <span>
            <Ico id="bc-ui-cards" /> 손패 {king?.handCount ?? 0}
          </span>
          <span>
            <Ico id="bc-ui-grave" /> 마왕의 덱 {d.deckCount}
          </span>
          {d.holyWater > 0 && <span>성수 −{d.holyWater}</span>}
          {d.chained && <span>봉인 사슬</span>}
        </div>
      </div>
      <div className="bc-community bcx-community" aria-label="쇼다운 공용 카드">
        {slots.map((i) => {
          const c = view.community[i]
          const label = i < 3 ? '플롭' : i === 3 ? '턴' : '리버'
          return (
            <div key={i} className="bcx-commslot">
              {c ? <CardView card={c} w={42} state="is-community" /> : <CardBack w={42} />}
              {(i === 0 || i === 3 || i === 4) && <span className={`bcx-commlabel ${c ? '' : 'is-next'}`}>{c ? label : `${label} · ${i < 3 ? 10 : i === 3 ? 11 : 12}R`}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Draft({ view, me, mine, names, onPick }: { view: View; me: number | null; mine: boolean; names: string[]; onPick(c: ClassId): void }) {
  const taken = new Map(view.players.filter((q) => q.cls).map((q) => [q.cls, q.seat]))
  return (
    <div className="bcx-draft">
      <p className="bcx-prophecy">“가장 빛나는 자가 검은 왕관을 쓰리라”</p>
      <div className="bcx-classes">
        {CLASS_IDS.map((c) => {
          const by = taken.get(c)
          const def = CLASSES[c]
          return (
            <button key={c} type="button" className={`bcx-class ${by !== undefined ? 'is-taken' : ''}`} disabled={!mine || by !== undefined} onClick={() => onPick(c)} style={by !== undefined ? seatVar(by) : undefined}>
              <span className="bcx-class__head">
                <Ico id={classIcon(c)} />
                <b>{def.name}</b>
                {def.suit && <Ico id={`bc-suit-${def.suit}`} className={`bc-suit--${def.suit} bcx-class__suit`} />}
                {by !== undefined && <span className="bcx-muted">{by === me ? '나' : names[by]}</span>}
              </span>
              <span className="bcx-class__text">{def.passive}</span>
              <span className="bcx-class__text">{def.active}</span>
              <span className="bcx-class__dark">어둠: {def.dark}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Result({ view, names }: { view: View; names: string[] }) {
  const king = view.demon?.seat ?? -1
  const rows = (view.ranking ?? []).map((r, i) => ({
    id: r.seat,
    name: `${names[r.seat]}${r.seat === king ? ' (검은 왕)' : ''}${r.seat === view.lastHitter ? ' · 막타' : ''}`,
    score: r.seat === king ? (view.winner === 'demon' ? '승리' : '패배') : `${r.score}점`,
    winner: i === 0,
  }))
  return (
    <div className="bcx-result">
      <div className={`bcx-banner ${view.winner === 'demon' ? 'is-dark' : ''}`}>
        <Ico id="bc-crown" />
        <b>{view.winner === 'demon' ? `마왕 ${names[king]}의 승리` : '연합의 승리'}</b>
        {view.coronation && <span className="bcx-muted">대관식 판정 {view.coronation.scores.find((x) => x.seat === king)?.total}점</span>}
      </div>
      <ResultList rows={rows} />
      {view.coronation && (
        <div className="bcx-scores">
          <h4>대관식 점수 (레벨 + 명성 + 그림자 × 2)</h4>
          {view.coronation.scores.map((x) => (
            <div key={x.seat} className="bcx-scorerow" style={seatVar(x.seat)}>
              <span>{names[x.seat]}</span>
              <span className="bc-num">
                {x.level} + {x.fame} + {x.shadow}×2 = <b>{x.total}</b>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Rules() {
  return (
    <details className="bcx-rules">
      <summary>규칙 요약</summary>
      <ul>
        <li>차례마다 행동 토큰 3개: 이동, 공격, 드로우, 칸 이용(상점·제단·샘·보물·대장간). 남긴 토큰은 대기 토큰이 되어 남의 공격에 협공할 수 있습니다.</li>
        <li>레벨 = 손패 수. 손패와 몬스터의 공용 카드로 족보를 만들어 공격합니다. 쌍격 이상에 쓴 카드는 마왕의 묘지로 갑니다.</li>
        <li>문양: 칼날 피해 +1, 방패 반격 −1, 등불 회복 1, 금화 골드 1. 공명(플러시)은 3배.</li>
        <li>9라운드가 끝나면 대관식: 레벨 + 명성 + 그림자 × 2 가 가장 높은 사람이 검은 왕관을 쓰고 마왕이 됩니다. 장비는 어둠 면으로, 묘지는 마왕의 덱이 됩니다.</li>
        <li>최종전 3라운드: 플롭·턴·리버가 열리고, 연합은 마왕을 쓰러뜨려야 합니다. 막타는 큰 점수.</li>
      </ul>
    </details>
  )
}

