// 개입 미리보기: 지금 보이는 상태에서 그 개입을 하면 내 로봇이 어떻게 되는지 엔진으로 계산한다.
// 실행은 결정적이고 두뇌는 공개되어 있으므로 결과가 실제와 같다(룰북 디자인 기둥 3).
import { cellName } from '../engine/data'
import { clone, currentBot, playTurn, tileOf } from '../engine/engine'
import type { Intervention } from '../engine/types'
import type { SeatView } from '../def'
import { dirName } from '../text'

export interface Preview {
  /** 발동할 슬롯(0~2), 기본 행동이면 -1 */
  slot: number
  text: string
}

export function preview(v: SeatView, iv: Intervention): Preview | null {
  if (v.phase !== 'exec') return null
  const p = currentBot(v)
  const g = clone(v)
  let events
  try {
    events = playTurn(g, iv)
  } catch {
    return null
  }
  let slot = -1
  let fired = '기본 행동 1칸 전진'
  let cores = 0
  let bump = false
  let dp = 0
  for (const e of events) {
    if (e.t === 'trigger' && e.p === p) {
      slot = e.slot
      fired = `슬롯 ${e.slot + 1} 발동(${tileOf(v, e.tile).text})`
    } else if (e.t === 'core' && e.p === p) cores++
    else if (e.t === 'bump' && e.p === p) bump = true
    else if ((e.t === 'dp' || e.t === 'spentToDp') && e.p === p) dp++
  }
  const b = g.players[p]!.bot
  const parts = [fired, `→ ${cellName(b)} ${dirName(b.dir)} 방향`]
  if (cores) parts.push(`코어 +${cores}`)
  if (bump) parts.push('충돌')
  if (dp) parts.push(`설계자 점수 +${dp}`)
  return { slot, text: parts.join(' · ') }
}
