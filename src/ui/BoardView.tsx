import type { CSSProperties } from 'react'
import { isTime, topOf, type Board, type Cell, type Color, type Face, type TipDirection } from '../engine'
import { colorLabel, DIE_COLORS, faceLabel } from './colors'
import { DieFace } from './DieFace'

/** 방금 움직인 주사위 (놓기 = 떨어짐, 굴리기 = 그 방향에서 굴러 옴) */
export interface FreshDie {
  dieId: number
  anim: 'drop' | TipDirection
}

export interface RollGhost {
  to: Cell
  face: Face
  direction: TipDirection
}

interface BoardViewProps {
  board: Board
  /** 지금 고를 수 있는 칸 (놓기·굴리기 도착) */
  targets?: Cell[]
  /** 놓기 미리보기: 고른 주사위의 윗면 */
  ghost?: { face: Face; color: Color } | null
  /** 굴리기 미리보기 */
  rollGhosts?: RollGhost[]
  rollColor?: Color
  /** 선택된 칸 (굴릴 ⧗ 주사위 등) */
  selected?: Cell | null
  /** 한 번 눌러 확정을 기다리는 칸 (한 번 더 누르면 놓기·굴리기) */
  armed?: Cell | null
  /** ⧗ 주사위처럼 강조할 칸 */
  marked?: Cell[]
  /** 고를 수 있는 칸마다 그 수를 두면 늘어나는 점수 (미리보기) */
  gains?: { cell: Cell; delta: number }[]
  fresh?: FreshDie | null
  onCell?: (cell: Cell) => void
  /** 작은 미리보기 (결과·리플레이) */
  compact?: boolean
}

const has = (cells: Cell[] | undefined, c: Cell) => !!cells?.some((x) => x.row === c.row && x.col === c.col)

const ARROW: Record<TipDirection, string> = { forward: '↓', back: '↑', left: '←', right: '→' }
const ROLL_ANIM: Record<TipDirection, string> = {
  forward: 'animate-roll-forward',
  back: 'animate-roll-back',
  left: 'animate-roll-left',
  right: 'animate-roll-right',
}

/**
 * 놓기·굴리기 미리보기. 빈 칸이면 칸 가운데에 반투명으로,
 * 기둥 위로 올라가면 꼭대기를 가리지 않게 오른쪽 아래 모서리에 작게.
 */
function Ghost({ face, color, size, stacked, arrow, armed = false }: { face: Face; color: Color; size: number; stacked: boolean; arrow?: string; armed?: boolean }) {
  return (
    <span className={`pointer-events-none absolute flex animate-pop items-center justify-center ${stacked ? `-right-1 -bottom-1 z-10 rounded-[30%] bg-void p-0.5 ${armed ? 'shadow-[0_0_0_2px_#ece9ff]' : 'shadow-[0_0_0_1.5px_#9b8cff]'}` : 'inset-0'}`}>
      <DieFace face={face} color={color} size={stacked ? size * (armed ? 0.62 : 0.5) : size} showSymbol={false} ghost={!stacked && !armed} />
      {arrow && !stacked && (
        <span aria-hidden="true" className="absolute bottom-0 left-1 font-display text-sm font-bold text-accent">
          {arrow}
        </span>
      )}
    </span>
  )
}

/** 기둥 한 층마다 아래로 보이는 두께 */
const SLAB = 3

/**
 * 개인 차원 보드 5×3 (§4). 맨 아래 줄이 선(1행, 플레이어 쪽 '앞')이다.
 * 칸에는 꼭대기 주사위와 기둥 층(색 판)을 보여 주고, 탭하면 onCell을 부른다.
 */
export function BoardView({ board, targets, ghost, rollGhosts, rollColor, selected, armed, marked, gains, fresh, onCell, compact = false }: BoardViewProps) {
  // 화면에서는 앞(선)이 아래로 오도록 행을 뒤집어 그린다
  const rows = board.cells.map((row, r) => ({ row, r })).reverse()
  const die = compact ? 20 : 42
  const slab = compact ? 1.5 : SLAB

  return (
    <div className={compact ? '' : 'perspective-board'}>
      <div
        role="group"
        aria-label="차원 보드"
        className={`grid ${compact ? 'gap-[3px] rounded-xl p-1.5' : 'gap-1.5 rounded-[22px] p-2 shadow-[inset_0_2px_18px_rgb(0_0_0/0.45),0_18px_40px_-18px_rgb(155_140_255/0.35)]'} bg-void/70 ring-1 ring-line ring-inset`}
      >
        {rows.map(({ row, r }) => (
          <div
            key={r}
            className={`grid grid-cols-5 ${compact ? 'gap-[3px]' : 'gap-1.5'} ${r === 0 ? `${compact ? 'rounded-md' : 'mt-1 rounded-xl'} bg-accent/[0.12] shadow-[0_0_0_3px_rgb(155_140_255/0.12)]` : ''}`}
          >
            {row.map((pillar, c) => {
              const cell = { row: r, col: c }
              const top = topOf(pillar)
              const isTarget = has(targets, cell)
              const isSelected = selected?.row === r && selected.col === c
              const isMarked = has(marked, cell)
              const isArmed = armed?.row === r && armed.col === c
              const gain = isTarget ? gains?.find((g) => g.cell.row === r && g.cell.col === c)?.delta : undefined
              const rg = rollGhosts?.find((g) => g.to.row === r && g.to.col === c)
              const label = top
                ? `${r + 1}행 ${c + 1}열, ${pillar.length}층, 꼭대기 ${colorLabel(top.color)} 윗면 ${faceLabel(top.orientation.top)} 앞면 ${faceLabel(top.orientation.front)}${isTarget ? (isArmed ? ', 한 번 더 누르면 확정' : ', 놓을 수 있음') : ''}${isMarked ? ', 굴릴 ⧗ 주사위' : ''}`
                : `${r + 1}행 ${c + 1}열, 비어 있음${isTarget ? (isArmed ? ', 한 번 더 누르면 확정' : ', 놓을 수 있음') : ''}`
              const fullLabel = gain !== undefined ? `${label}, 예상 점수 ${gain >= 0 ? '+' : ''}${gain}` : label
              const lift = Math.max(0, pillar.length - 1) * slab
              const anim = top && fresh?.dieId === top.id ? (fresh.anim === 'drop' ? 'animate-drop' : ROLL_ANIM[fresh.anim]) : ''

              const glow: CSSProperties | undefined = isTarget
                ? { ['--glow' as string]: '#9b8cff' }
                : isMarked && !isSelected
                  ? { ['--glow' as string]: '#f2a65a' }
                  : undefined

              const glowing = (isTarget && !isArmed) || (isMarked && !isSelected)
              // 배경은 한 가지만 고른다 (같은 속성 유틸을 겹치면 CSS 순서로 덮인다)
              const bg = isSelected ? 'bg-personal/25' : isTarget ? 'bg-accent/15' : top ? 'bg-surface/60' : 'bg-surface/30'
              // 테두리: 움직임을 꺼도 남는 정적 표시
              const ring = isSelected || isArmed
                ? 'ring-[3px] ring-fg'
                : isTarget
                  ? 'ring-2 ring-accent'
                  : isMarked
                    ? 'ring-2 ring-personal'
                    : top
                      ? ''
                      : 'border border-dashed border-line/90'
              const cls = [
                'relative flex aspect-square items-center justify-center transition-[transform,scale,background-color] duration-200',
                compact ? 'rounded-md' : 'rounded-xl',
                bg,
                ring,
                glowing ? 'glow-pulse' : '',
                isSelected ? 'z-10 scale-[1.06] shadow-[0_0_24px_rgb(242_166_90/0.7)]' : '',
                isArmed ? 'z-10 scale-[1.04] shadow-[0_0_24px_rgb(236_233_255/0.45)]' : '',
                onCell && !compact ? 'active:scale-95' : '',
              ]
                .filter(Boolean)
                .join(' ')

              const content = (
                <>
                  {!top && !isTarget && !rg && <span aria-hidden="true" className={`rounded-full bg-line ${compact ? 'size-1' : 'size-1.5'}`} />}
                  {top && (
                    <span className="relative" style={{ width: die, height: die + lift, marginTop: -lift }}>
                      {/* 아래층 주사위들의 색 판 */}
                      {pillar.slice(0, -1).map((d, k) => (
                        <span
                          key={d.id}
                          aria-hidden="true"
                          className="absolute inset-x-0"
                          style={{
                            height: die,
                            bottom: k * slab,
                            borderRadius: Math.round(die * 0.22),
                            background: DIE_COLORS[d.color].dark,
                            boxShadow: `0 1px 0 ${DIE_COLORS[d.color].fill}`,
                          }}
                        />
                      ))}
                      <span key={top.id} className={`absolute inset-x-0 top-0 block ${anim} ${isSelected ? 'animate-hover' : ''}`}>
                        <DieFace face={top.orientation.top} color={top.color} size={die} showSymbol={!compact} />
                      </span>
                      {anim === 'animate-drop' && !compact && (
                        <span aria-hidden="true" className="pointer-events-none absolute -inset-2 animate-ripple rounded-2xl ring-2 ring-accent" />
                      )}
                    </span>
                  )}
                  {/* 놓기 미리보기: 빈 칸이면 그 자리에, 쌓기면 꼭대기 위에 겹쳐 */}
                  {isTarget && ghost && !rg && <Ghost face={ghost.face} color={ghost.color} size={die} stacked={!!top} armed={isArmed} />}
                  {rg && rollColor && <Ghost face={rg.face} color={rollColor} size={die} stacked={!!top} arrow={ARROW[rg.direction]} armed={isArmed} />}
                  {gain !== undefined && (
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute -top-1.5 left-1/2 z-20 -translate-x-1/2 rounded-full px-1.5 font-display text-xs leading-4 font-bold ring-1 ${
                        gain > 0 ? 'bg-good text-void ring-good' : gain < 0 ? 'bg-[#3a1d27] text-[#ffb3b3] ring-danger/60' : 'bg-void text-muted ring-line'
                      }`}
                    >
                      {gain > 0 ? `+${gain}` : gain}
                    </span>
                  )}
                  {/* 꼭대기 앞면: 정면 숫자선(§8)과 굴리기에 쓰이므로 보드에서 바로 보이게 */}
                  {!compact && top && (
                    <span aria-hidden="true" className="pointer-events-none absolute bottom-0.5 left-0.5 flex items-center gap-px rounded-md bg-void/85 py-px pr-0.5 pl-1 ring-1 ring-line">
                      <span className="text-[9px] leading-none font-bold text-muted">앞</span>
                      <DieFace face={top.orientation.front} color={top.color} size={14} showSymbol={false} bare />
                    </span>
                  )}
                  {pillar.length > 1 && (
                    <span
                      aria-hidden="true"
                      className={`absolute font-display font-bold leading-none ${compact ? 'top-0 right-0 text-[8px] text-fg' : 'top-1 right-1 rounded-full bg-void/85 px-1.5 py-0.5 text-[11px] text-fg ring-1 ring-line'}`}
                    >
                      {compact ? pillar.length : `${pillar.length}층`}
                    </span>
                  )}
                  {!compact && top && isTime(top.orientation.top) && isMarked && (
                    <span aria-hidden="true" className="absolute -top-1 -left-1 size-3 rounded-full bg-personal shadow-[0_0_10px_#f2a65a]" />
                  )}
                </>
              )
              return compact || !onCell ? (
                <div className={cls} style={glow} role="img" aria-label={fullLabel} key={c}>
                  {content}
                </div>
              ) : (
                <button type="button" className={cls} style={glow} aria-label={fullLabel} key={c} onClick={() => onCell(cell)}>
                  {content}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {!compact && (
        <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-[0.2em] text-accent/80" aria-hidden="true">
          <span>▼</span> 앞 · 선 <span>▼</span>
        </div>
      )}
    </div>
  )
}
