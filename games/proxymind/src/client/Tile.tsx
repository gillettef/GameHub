// 규칙 타일 한 장: 코드, 조건, 행동. inst 가 null 이면 빈 슬롯, 음수면 뒷면(공개 전)
import { TILES } from '../engine/data'
import type { SeatView } from '../def'

export type TileMark = 'fired' | 'would' | 'blocked' | 'used' | null

function tileParts(v: SeatView, inst: number) {
  const t = TILES[v.tiles[inst]!]!
  const [cond, act] = t.text.split(' → ')
  return { code: t.code, cond: cond!, act: act! }
}

export function TileFace({ view, inst, mark = null, label }: { view: SeatView; inst: number | null; mark?: TileMark; label?: string }) {
  const head = label && <span className="pm-tile-slot">{label}</span>
  if (inst === null)
    return (
      <span className="pm-tile pm-tile-empty">
        {head}
        <span className="m-auto text-muted">—</span>
      </span>
    )
  if (inst < 0)
    return (
      <span className="pm-tile pm-tile-back">
        {head}
        <span className="m-auto text-xl font-bold text-muted">?</span>
      </span>
    )
  const t = tileParts(view, inst)
  return (
    <span className={`pm-tile${mark ? ` pm-tile-${mark}` : ''}`}>
      <span className="flex items-baseline justify-between gap-1">
        {head}
        <small className="text-[11px] text-muted">{t.code}</small>
      </span>
      <span className="text-[12px] leading-[15px]">{t.cond}</span>
      <span className="text-[13px] leading-4 font-bold text-primary">→ {t.act}</span>
      {mark === 'blocked' && <span className="pm-tile-tag">차단</span>}
      {mark === 'fired' && <span className="pm-tile-tag">발동</span>}
      {mark === 'would' && <span className="pm-tile-tag">발동 예정</span>}
    </span>
  )
}
