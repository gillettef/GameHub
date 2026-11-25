// 아레나 보드(SVG). 옛 화면(board.ts)과 같은 내용: 7×7 칸, 가장자리, 기둥, 코어 생성 지점, 코어, 로봇(색 화살표).
// 로봇은 같은 요소를 유지해 이동·회전이 CSS 전환으로 움직인다(움직임 줄이기 설정이면 바로 바뀐다).
// 지금 실행 차례인 로봇(또는 설계 중인 상대 로봇)의 앞줄을 옅게 칠해 조건 판정을 돕는다.
import { useState } from 'react'
import { CORE_SPOTS, PILLARS, SIZE } from '../engine/data'
import { line } from '../engine/engine'
import type { SeatView } from '../def'
import { COLORS } from '../text'

const C = 40
const M = 16 // 좌표 글자 자리
const W = M + C * SIZE

export interface BoardProps {
  view: SeatView
  /** 실행 중인 로봇(밝은 고리) */
  active: number | null
  /** 내가 설계하는 로봇(점선 고리) */
  target: number | null
  /** 앞줄을 칠할 로봇 */
  focus: number | null
}

export function Board({ view: v, active, target, focus }: BoardProps) {
  // 270° → 0° 를 짧은 쪽으로 돌리도록 로봇별 누적 각도를 기억한다(방향이 바뀐 렌더에서 바로 고친다)
  const dirs = v.players.map((p) => p.bot.dir).join()
  const [turn, setTurn] = useState(() => ({ dirs, angles: v.players.map((p) => p.bot.dir * 90) }))
  let rot = turn.angles
  if (turn.dirs !== dirs) {
    rot = v.players.map((p, i) => {
      const want = p.bot.dir * 90
      const was = turn.angles[i]
      if (was === undefined) return want
      let diff = (((want - was) % 360) + 360) % 360
      if (diff > 180) diff -= 360
      return was + diff
    })
    setTurn({ dirs, angles: rot })
  }

  const lineCells = focus !== null && v.phase !== 'done' ? line(v, focus).cells : []
  const cells = []
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const edge = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1
      cells.push(<rect key={`${x},${y}`} x={M + x * C} y={M + y * C} width={C} height={C} className={edge ? 'pm-cell pm-edge' : 'pm-cell'} />)
    }

  return (
    <svg className="pm-board" viewBox={`0 0 ${W} ${W}`} role="img" aria-label="아레나">
      {Array.from({ length: SIZE }, (_, i) => (
        <g key={i} className="pm-label">
          <text x={M + i * C + C / 2} y={11}>
            {String.fromCharCode(65 + i)}
          </text>
          <text x={8} y={M + i * C + C / 2 + 4}>
            {i + 1}
          </text>
        </g>
      ))}
      {cells}
      {lineCells.map((c) => (
        <rect key={`l${c.x},${c.y}`} x={M + c.x * C + 2} y={M + c.y * C + 2} width={C - 4} height={C - 4} rx={4} className="pm-line" style={{ fill: COLORS[focus!] }} />
      ))}
      {CORE_SPOTS.map((s) => (
        <circle key={`s${s.x},${s.y}`} cx={M + s.x * C + C / 2} cy={M + s.y * C + C / 2} r={C * 0.36} className="pm-spot" />
      ))}
      {PILLARS.map((p) => (
        <g key={`p${p.x},${p.y}`}>
          <rect x={M + p.x * C + 3} y={M + p.y * C + 3} width={C - 6} height={C - 6} rx={4} className="pm-pillar" />
          <path d={`M${M + p.x * C + 8} ${M + p.y * C + C - 8} L${M + p.x * C + C - 8} ${M + p.y * C + 8}`} className="pm-pillar-mark" />
        </g>
      ))}
      {v.cores.map((c) => {
        const cx = M + c.x * C + C / 2
        const cy = M + c.y * C + C / 2
        return <path key={`c${c.x},${c.y}`} d={`M${cx} ${cy - 9} L${cx + 9} ${cy} L${cx} ${cy + 9} L${cx - 9} ${cy} Z`} className="pm-core" />
      })}
      {v.players.map((p, i) => (
        <g
          key={i}
          className="pm-bot"
          aria-label={`${i + 1}번 로봇`}
          style={{ transform: `translate(${M + p.bot.x * C + C / 2}px, ${M + p.bot.y * C + C / 2}px) rotate(${rot[i]}deg)` }}
        >
          {active === i && <circle r={C * 0.48} className="pm-ring" style={{ stroke: COLORS[i] }} />}
          {target === i && <circle r={C * 0.48} className="pm-ring pm-ring-target" style={{ stroke: COLORS[i] }} />}
          <path d="M0 -15 L12 13 L0 7 L-12 13 Z" style={{ fill: COLORS[i] }} className="pm-arrow" />
        </g>
      ))}
    </svg>
  )
}
