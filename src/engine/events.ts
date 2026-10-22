/**
 * 사건 카드 (§11-4).
 *
 * v0.6에서 4라운드 시점이 없어져 사용 방식을 재설계 중이다. 카드 목록만 두고 게임에는 쓰지 않는다.
 */
import type { EventId } from './types'

export interface EventDef {
  id: EventId
  name: string
}

export const EVENTS: Record<EventId, EventDef> = {
  rotation: { id: 'rotation', name: '자전' },
  erosion: { id: 'erosion', name: '침식' },
  proliferation: { id: 'proliferation', name: '대번식' },
  gravityWave: { id: 'gravityWave', name: '중력파' },
  flood: { id: 'flood', name: '대홍수' },
  regression: { id: 'regression', name: '역행' },
  earthquake: { id: 'earthquake', name: '지진' },
  crownCurse: { id: 'crownCurse', name: '왕관의 저주' },
  bigBang: { id: 'bigBang', name: '빅뱅' },
  timeRift: { id: 'timeRift', name: '시간 균열' },
}
