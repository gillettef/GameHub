import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { CENTER, MONSTERS, SIZE, TILE_NAMES } from '../engine/data'
import { colOf, idx, ringOf, rowOf, type View } from '../engine/game'
import { isOpenView, reachable, tileClass, tileIcon } from './helpers'
import { Ico, Pawn } from './ui'

const RING_CLASS = ['', '', 'bc-tile--middle', 'bc-tile--inner', 'bc-tile--throne']

export function Board({ view, me, canAct, targets, onTile }: { view: View; me: number | null; canAct: boolean; targets: Set<number>; onTile(i: number): void }) {
  const box = useRef<HTMLDivElement>(null)
  const final = view.phase === 'final' || (view.phase === 'over' && view.demon !== null)
  const span = final ? 3 : SIZE
  const offset = final ? CENTER - 1 : 0
  const [tile, setTile] = useState(44)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => {
      const r = el.getBoundingClientRect()
      const gap = 3 * (span - 1)
      const t = Math.floor(Math.min((r.width - 12 - gap) / span, (r.height - 12 - gap) / span))
      setTile(Math.max(34, Math.min(final ? 92 : 58, t)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [span, final])

  const reach = me === null ? new Set<number>() : reachable(view, me, canAct)
  const demonSeat = view.demon?.seat ?? -1
  const cells: number[] = []
  for (let r = offset; r < offset + span; r++) for (let c = offset; c < offset + span; c++) cells.push(idx(r, c))

  return (
    <div ref={box} className="bcx-boardbox">
      <div className="bc-board" role="grid" aria-label="공용 보드" style={{ '--bc-tile': `${tile}px`, gridTemplateColumns: `repeat(${span}, var(--bc-tile))` } as CSSProperties}>
        {cells.map((i) => {
          const t = view.board[i]
          if (!t) return null
          const monsters = view.monsters.filter((m) => m.pos === i)
          const m = monsters[0]
          const pawns = view.players.filter((p) => p.pos === i && !p.out)
          const kind = m ? (MONSTERS[m.kind].grade === 'boss' ? 'boss' : 'monster') : t.kind
          const icon = tileIcon(kind)
          const locked = !isOpenView(view, i)
          const isDemonTile = pawns.some((p) => p.seat === demonSeat)
          const cls = [
            'bc-tile',
            RING_CLASS[ringOf(i)],
            `bc-tile--${tileClass(kind)}`,
            locked ? 'is-locked' : '',
            reach.has(i) ? 'is-reachable' : '',
            targets.has(i) ? 'is-target' : '',
            isDemonTile ? 'bc-tile--seat-demon' : '',
          ].join(' ')
          const label = m ? `${MONSTERS[m.kind].name} 체력 ${m.hp}` : kind === 'hidden' ? '뒤집히지 않은 타일' : TILE_NAMES[kind]
          return (
            <button key={i} type="button" role="gridcell" className={cls} aria-label={`${rowOf(i) + 1}행 ${colOf(i) + 1}열 ${label}`} onClick={() => onTile(i)}>
              {icon && <Ico id={icon} />}
              {m && <span className="bc-tile__hp">{m.hp}</span>}
              {m?.community && m.community.suit && <span className={`bc-tile__comm bc-suit--${m.community.suit}`}>{m.community.rank}</span>}
              {monsters.length > 1 && <span className="bcx-tile__more">+{monsters.length - 1}</span>}
              {pawns.length > 0 && (
                <span className="bc-tile__pawns">
                  {pawns.map((p) => (
                    <Pawn key={p.seat} seat={p.seat} cls={p.cls} demon={p.seat === demonSeat} extra={p.seat === me ? 'is-me' : ''} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

