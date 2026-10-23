import { facesOf, type Cell, type Pillar, type RolledDie } from '../engine'
import { DieFace } from './DieFace'
import { Sheet } from './primitives'

/** 주사위 전개도: 지금 방향 기준으로 위·아래·앞·뒤·왼·오른 면 (§2, 주사위마다 배치가 다름) */
export function DieNet({ die, size = 30 }: { die: RolledDie; size?: number }) {
  const f = facesOf(die.layout, die.orientation)
  const cell = (face: typeof f.top, label: string, area: string, main = false) => (
    <div className="flex flex-col items-center gap-0.5" style={{ gridArea: area }}>
      <DieFace face={face} color={die.color} size={size} showSymbol={main} />
      <span className={`text-[11px] leading-none font-bold ${main ? 'text-fg' : 'text-muted'}`}>{label}</span>
    </div>
  )
  return (
    <div
      className="grid gap-1"
      role="group"
      aria-label="전개도"
      style={{ gridTemplateAreas: '". back ." "left top right" ". front ." ". bottom ."', gridTemplateColumns: `repeat(3, ${size + 6}px)` }}
    >
      {cell(f.back, '뒤', 'back')}
      {cell(f.left, '왼', 'left')}
      {cell(f.top, '위', 'top', true)}
      {cell(f.right, '오른', 'right')}
      {cell(f.front, '앞', 'front')}
      {cell(f.bottom, '아래', 'bottom')}
    </div>
  )
}

interface PillarSheetProps {
  pillar: Pillar
  cell: Cell
  onClose: () => void
}

/** 기둥을 탭해서 펼쳐 보기 (CLAUDE.md 모바일 UI 원칙): 위층부터 아래로, 층마다 전개도 */
export function PillarSheet({ pillar, cell, onClose }: PillarSheetProps) {
  return (
    <Sheet title={`${cell.row + 1}행 ${cell.col + 1}열 · ${pillar.length}층`} onClose={onClose}>
      {pillar.length === 0 ? (
        <p className="py-6 text-center text-muted">비어 있는 칸입니다.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {[...pillar].reverse().map((die, i) => (
            <li
              key={die.id}
              className="flex animate-rise items-center gap-4 rounded-2xl bg-raised/60 p-3 ring-1 ring-line ring-inset"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span className="w-12 text-center">
                <span className="block font-display text-2xl font-bold">{pillar.length - i}</span>
                <span className="text-[11px] text-muted">{i === 0 ? '꼭대기' : '층'}</span>
              </span>
              <DieNet die={die} />
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  )
}
