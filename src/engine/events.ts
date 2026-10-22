/**
 * 사건 카드 (§11-4). 데이터 + 효과 함수.
 *
 * 4단계에서는 훅만 마련한다. 시간 세기에 바로 반영되는 역행·시간 균열(§11-4 주석)만 효과가 있고,
 * 나머지 사건의 resolve는 5단계(카드)에서 채운다. resolve가 없으면 무효과.
 */
import type { EventId, GameState } from './types'

export interface EventDef {
  id: EventId
  name: string
  /** 이 카드가 현재 시점일 때 시간 세기에 더하는 값 (§9 ②, §11-4 주석) */
  timeModifier?: number
  /** ⑤ 사건 해결. 바뀐 기둥의 인과 역류는 호출하는 쪽에서 판정한다 */
  resolve?: (state: GameState) => GameState
}

export const EVENTS: Record<EventId, EventDef> = {
  rotation: { id: 'rotation', name: '자전' },
  erosion: { id: 'erosion', name: '침식' },
  proliferation: { id: 'proliferation', name: '대번식' },
  gravityWave: { id: 'gravityWave', name: '중력파' },
  flood: { id: 'flood', name: '대홍수' },
  regression: { id: 'regression', name: '역행', timeModifier: 1 },
  earthquake: { id: 'earthquake', name: '지진' },
  crownCurse: { id: 'crownCurse', name: '왕관의 저주' },
  bigBang: { id: 'bigBang', name: '빅뱅' },
  timeRift: { id: 'timeRift', name: '시간 균열', timeModifier: -1 },
}

/** 사건 카드 10장 (§4) */
export const EVENT_DECK: readonly EventId[] = Object.keys(EVENTS) as EventId[]

/** 4라운드 시간축 길이 (t1~t3, §9) */
export const TIMELINE_LENGTH = 3
