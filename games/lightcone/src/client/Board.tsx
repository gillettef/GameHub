// ③ 메인 보드(성계 지도). 세로로 세우고 보는 사람의 모항성을 아래에 둔다(관전은 A 가 아래).
// 함대 말: 실체(채운 원), 잔상(점선 원). 상대 실체는 게임이 끝났거나 '봇 실체 보기'일 때만 보인다.
import { STAY } from '../engine/engine'
import { ADJ, PLANETS, POS, SYSTEMS, type Pid } from '../engine/map'
import type { View } from '../def'

const NODE = 34
const HOME_R = 42
const RING = 50
const TOK = 16

export interface BoardProps {
  view: View
  /** 아래쪽에 둘 진영 */
  side: Pid
  names: Record<Pid, string>
  /** 계획 단계에 고른 이동(함대 순서) */
  moves: string[] | null
  /** 지금 고른 함대 */
  sel: number | null
  /** 누를 수 있는 성계 */
  targets: string[]
  onTarget(system: string): void
  onSelect(fid: number): void
  /** 봇 실체 보기: 진영별 실체 위치(함대 순서) */
  revealed: Record<Pid, string[]> | null
}

function coord(s: string, flip: boolean): [number, number] {
  const [x, y] = POS[s]!
  const row = flip ? x : 6 - x
  const col = flip ? 4 - y : y
  return [90 + (col - 0.5) * 153, 70 + row * 120]
}

interface Tok {
  key: string
  cls: 'real' | 'echo' | 'oreal' | 'oecho'
  fid: number
  label: string
}

export function Board({ view, side, names, moves, sel, targets, onTarget, onSelect, revealed }: BoardProps) {
  const flip = side === 'B'
  const at = (s: string) => coord(s, flip)
  const opp: Pid = side === 'A' ? 'B' : 'A'
  const mine = view.me === side
  const picking = moves !== null

  const edges: [string, string][] = []
  for (const s of SYSTEMS) for (const t of ADJ[s]!) if (s < t) edges.push([s, t])

  const groups: Record<string, Tok[]> = {}
  const add = (s: string, tok: Tok) => (groups[s] ??= []).push(tok)
  for (const [pid, cls] of [
    [side, ''],
    [opp, 'o'],
  ] as const) {
    view.sides[pid].fleets.forEach((f, i) => {
      const real = f.real ?? revealed?.[pid][i] ?? null
      const whose = pid === side && mine ? '내' : `${names[pid]}`
      if (real) add(real, { key: `${pid}r${f.id}`, cls: `${cls}real` as Tok['cls'], fid: f.id, label: `${whose} 함대 ${f.id} 실체` })
      add(f.echo, { key: `${pid}e${f.id}`, cls: `${cls}echo` as Tok['cls'], fid: f.id, label: `${whose} 함대 ${f.id} 잔상` })
    })
  }
  const placed: (Tok & { x: number; y: number; home: boolean })[] = []
  for (const [s, toks] of Object.entries(groups)) {
    const [cx, cy] = at(s)
    const home = s === 'A' || s === 'B'
    toks.forEach((tk, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / toks.length
      const rad = home ? RING + 10 : RING
      placed.push({ ...tk, x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad, home })
    })
  }
  // 리액트가 같은 말을 같은 요소로 유지해야 미끄러지는 연출이 된다
  placed.sort((a, b) => a.key.localeCompare(b.key))

  const ownerName = (o: Pid) => (o === view.me ? '내 점령' : `${names[o]} 점령`)

  return (
    <svg className="lc-board" viewBox="0 -20 640 900" role="img" aria-label="성계 지도">
      {edges.map(([s, t]) => {
        const [x1, y1] = at(s)
        const [x2, y2] = at(t)
        return <line key={`${s}-${t}`} x1={x1} y1={y1} x2={x2} y2={y2} className="edge" />
      })}
      {moves &&
        view.mine?.fleets.map((f, i) => {
          const m = moves[i]
          if (!m || m === STAY) return null
          const [x1, y1] = at(f.real)
          const [x2, y2] = at(m)
          return <line key={`arrow${f.id}`} x1={x1} y1={y1} x2={x2} y2={y2} className="arrow" />
        })}
      {SYSTEMS.map((s) => {
        const [x, y] = at(s)
        const home = s === 'A' || s === 'B'
        const planet = PLANETS.includes(s)
        const r = home ? HOME_R : NODE
        const target = targets.includes(s)
        const owner = view.holds[s]
        const cls = ['node', planet ? 'planet' : '', home ? (s === side ? 'homeMe' : 'homeOpp') : '', target ? 'target' : '', moves?.includes(s) ? 'chosen' : '']
        return (
          <g
            key={s}
            className={cls.join(' ')}
            {...(target
              ? {
                  role: 'button',
                  'aria-label': `성계 ${s}로 이동`,
                  onClick: () => onTarget(s),
                }
              : {})}
          >
            {target && <circle cx={x} cy={y} r={r + 22} className="hit" />}
            {owner && <circle cx={x} cy={y} r={r + 9} fill={owner === side ? 'rgba(90,169,255,.38)' : 'rgba(255,154,77,.38)'} />}
            <circle cx={x} cy={y} r={r} className="base" />
            <text x={x} y={y - (planet || home ? 5 : 0)} className="id">
              {s}
            </text>
            {planet && (
              <>
                <text x={x} y={y + 19} className="sub">
                  {owner ? ownerName(owner) : '행성'}
                </text>
                <g className={`badge${view.nebula.includes(s) ? ' neb' : ''}`}>
                  <circle cx={x + 29} cy={y - 29} r={14} />
                  <text x={x + 29} y={y - 29}>
                    {view.ripple[s]}
                  </text>
                </g>
              </>
            )}
            {home && (
              <text x={x} y={y + 22} className="sub">
                {s === view.me ? '내 모항성' : `${names[s as Pid]} 모항성`}
              </text>
            )}
          </g>
        )
      })}
      {placed.map((tk) => {
        const pick = picking && tk.cls === 'real' && mine
        return (
          <g
            key={tk.key}
            className={`tok ${tk.cls}${pick ? ' pick' : ''}${pick && tk.fid === sel ? ' sel' : ''}`}
            style={{ transform: `translate(${tk.x}px, ${tk.y}px)` }}
            {...(pick ? { role: 'button', 'aria-label': `함대 ${tk.fid} 고르기`, onClick: () => onSelect(tk.fid) } : {})}
          >
            {pick && <circle r={TOK + 12} fill="transparent" />}
            <circle r={TOK} className="body" />
            <text>{tk.fid}</text>
            <title>{tk.label}</title>
          </g>
        )
      })}
    </svg>
  )
}
