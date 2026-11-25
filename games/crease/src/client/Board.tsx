// 접는 보드(SVG). 열(<g>)과 말은 같은 요소를 유지하고 위치만 바꿔 CSS 전환으로 접히는 움직임을 보여 준다.
import { COLS, ROWS, cellName, isCoveredCol, isFlippedCol, key, physPos, unkey, type Cell, type Fold, type View } from '../engine/engine'
import { COLORS } from './seats'

const CS = 44
const OX = 6
const OY = 6
const W = OX * 2 + CS * COLS
const H = OY * 2 + CS * ROWS

export interface BoardProps {
  view: View
  /** 미리보기 중인 접힘 상태 */
  previewFold?: Fold | null
  legal: Cell[]
  /** 테두리를 굵게 할 좌석(지금 차례) */
  focus: number | null
  onCell(c: number, r: number): void
}

function star(cx: number, cy: number, R: number, r: number): string {
  let d = ''
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 ? r : R
    d += `${i ? 'L' : 'M'}${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`
  }
  return `${d}Z`
}

export function Board({ view, previewFold, legal, focus, onCell }: BoardProps) {
  const fold = previewFold ?? view.fold
  const legalSet = new Set(legal.map(([c, r]) => key(c, r)))
  // 가려진 열은 제자리(투명), 보이는 열은 접힌 뒤의 물리 위치
  const posOf = (c: number) => (isCoveredCol(fold, c) ? c : physPos(fold, c))

  const emptySlots: number[] = []
  for (let p = 0; p < COLS; p++) {
    let used = false
    for (let c = 0; c < COLS; c++) if (physPos(fold, c) === p || (isCoveredCol(fold, c) && c === p)) used = true
    if (!used) emptySlots.push(p)
  }

  const occupied: Record<string, number> = {}
  const spawnCol = view.lastSpawn === null ? -1 : unkey(view.lastSpawn)[0]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`crease-board block h-auto max-h-full w-full ${previewFold ? 'is-preview' : ''}`}
      role="group"
      aria-label="접기 보드"
    >
      <rect x={0} y={0} width={W} height={H} rx={10} className="table" />
      {emptySlots.map((p) => (
        <rect key={p} x={OX + p * CS + 3} y={OY + 3} width={CS - 6} height={ROWS * CS - 6} rx={6} className="empty-slot" />
      ))}
      {Array.from({ length: COLS }, (_, c) => {
        const covered = isCoveredCol(fold, c)
        const back = isFlippedCol(fold, c)
        return (
          <g
            key={c}
            className="col"
            style={{ transform: `translate(${OX + posOf(c) * CS}px, 0px)`, opacity: covered ? 0 : 1, pointerEvents: covered ? 'none' : 'auto' }}
          >
            {Array.from({ length: ROWS }, (_, r) => {
              const isLegal = legalSet.has(key(c, r))
              return (
                <g key={r}>
                  <rect
                    x={0.5}
                    y={OY + r * CS + 0.5}
                    width={CS - 1}
                    height={CS - 1}
                    rx={3}
                    className={`cell ${back ? 'back' : 'front'}${isLegal ? ' legal' : ''}`}
                    data-cell={cellName(c, r)}
                    {...(isLegal ? { role: 'button', 'aria-label': `${cellName(c, r)}로 이동` } : {})}
                    onClick={() => onCell(c, r)}
                  />
                  <text x={4} y={OY + r * CS + 11} className="coord">
                    {cellName(c, r)}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })}
      {fold.L > 0 && <line x1={OX + 2 * fold.L * CS} y1={OY + 2} x2={OX + 2 * fold.L * CS} y2={OY + ROWS * CS - 2} className="seam" />}
      {fold.R > 0 && (
        <line x1={OX + (COLS - 2 * fold.R) * CS} y1={OY + 2} x2={OX + (COLS - 2 * fold.R) * CS} y2={OY + ROWS * CS - 2} className="seam" />
      )}
      {view.players.map((p, i) => {
        const [ac, ar] = unkey(p.anchor)
        if (isCoveredCol(fold, ac)) return null
        return (
          <rect key={i} x={OX + physPos(fold, ac) * CS + 3} y={OY + ar * CS + 3} width={CS - 6} height={CS - 6} rx={7} className="anchor" stroke={COLORS[i]} />
        )
      })}
      {view.lastSpawn !== null && !previewFold && !isCoveredCol(fold, spawnCol) && (
        <circle
          key={view.spawns}
          cx={OX + physPos(fold, spawnCol) * CS + CS / 2}
          cy={OY + unkey(view.lastSpawn)[1] * CS + CS / 2}
          r={18}
          className="spawn-ping"
        />
      )}
      {view.shards.flatMap(([k, cnt]) => {
        const [c, r] = unkey(k)
        const covered = isCoveredCol(fold, c)
        const pos = posOf(c)
        return Array.from({ length: cnt }, (_, i) => {
          const cx = OX + pos * CS + CS - 11 - i * 7
          const cy = OY + r * CS + CS - (covered ? 9 : 12)
          return covered ? (
            <circle key={`${k}-${i}`} cx={cx} cy={cy} r={6} className="shard-absent" />
          ) : (
            <path key={`${k}-${i}`} d={star(cx, cy, 8.5, 3.8)} className="shard" />
          )
        })
      })}
      {view.players.map((p, i) => {
        const covered = isCoveredCol(fold, p.c)
        const pos = posOf(p.c)
        const slotKey = `${pos},${p.r},${covered}`
        const slot = (occupied[slotKey] = (occupied[slotKey] ?? 0) + 1) - 1
        const x = OX + pos * CS
        const y = OY + p.r * CS
        const px = x + 15 + (slot % 2) * 15
        const py = covered ? y + CS - 10 : y + 22 + Math.floor(slot / 2) * 8
        return (
          <g
            key={i}
            className={`piece${covered ? ' absent' : ''}${focus === i && !view.over ? ' focus' : ''}`}
            style={{ transform: `translate(${px}px, ${py}px)${covered ? ' rotate(90deg) scale(.55, 1)' : ''}` }}
          >
            <circle cx={0} cy={0} r={11} fill={COLORS[i]} className="pawn" />
            <text x={0} y={4.2} className="pawn-num">
              {i + 1}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
