// 기록 한 줄(옛 화면의 기록과 같은 말). 서버의 방 기록(def.ts)과 화면의 기록이 함께 쓴다
import { CARD } from './engine/engine.ts'
import type { HistoryEntry } from './engine/types.ts'

const card = (id: string) => `「${CARD[id]!.title}」(${CARD[id]!.figure})`

/** 연쇄 정리가 있으면 warn */
export function describe(h: HistoryEntry, name: string): { text: string; warn: boolean } {
  if (h.type === 'place') {
    let s = `${name} 칸 ${h.slot! + 1}에 ${card(h.cardId!)}`
    if (h.removed?.length) s += ` → 연쇄 정리 ${h.removed.map((r) => `칸 ${r.slot + 1} 「${CARD[r.cardId]!.title}」`).join(', ')} 버림, 패러독스 +${h.removed.length}`
    return { text: s, warn: (h.removed?.length ?? 0) > 0 }
  }
  if (h.type === 'exchange') return { text: `${name} 교체 — ${card(h.cardId!)} 버림`, warn: false }
  return { text: `${name} 패스`, warn: false }
}
