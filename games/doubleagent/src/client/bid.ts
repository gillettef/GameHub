// 제안 작성 상태(1·2차를 한꺼번에 쓴다). 화면 전용 계산이고, 판정은 엔진의 validateOffer·validateSecond 를 그대로 쓴다.
import { handAfter, validateOffer, validateSecond, type Demand, type Evaluation, type GameState, type InvalidReason, type Offer, type Stage } from '../engine'

/** 협상 1건 작성 중 상태 (demand null = 낼 카드가 없음) */
export interface Slot {
  playerId: number | null
  clubId: number | null
  demand: Demand | null
  pass: boolean
}

export interface Draft {
  /** 라운드·좌석. 바뀌면 새로 쓴다 */
  key: string
  stage: Stage
  slots: [Slot, Slot]
}

export type Check = Evaluation | InvalidReason | 'pass' | null

export const slotOffer = (d: Slot): Offer | null =>
  !d.pass && d.playerId !== null && d.clubId !== null && d.demand !== null ? { playerId: d.playerId, clubId: d.clubId, demand: d.demand } : null

/** 기본 카드: +3억 카드(2)가 있으면 그것, 없으면 가장 낮은 카드 (카드가 없으면 null) */
export const defaultDemand = (hand: readonly Demand[]): Demand | null => (hand.includes(2) ? 2 : hand.length ? (Math.min(...hand) as Demand) : null)

export const draftKey = (g: GameState, seat: number) => `${g.round}:${seat}`

export function newDraft(g: GameState, seat: number): Draft {
  const hand = g.agents[seat]!.hand
  const empty = (): Slot => ({ playerId: null, clubId: null, demand: defaultDemand(hand), pass: !hand.length })
  return normalize(g, seat, { key: draftKey(g, seat), stage: 1, slots: [empty(), empty()] })
}

/** 이 협상에서 낼 수 있는 손패 (2차는 1차 카드를 뺀 손) */
export function slotHand(g: GameState, seat: number, d: Draft, stage: Stage): Demand[] {
  return stage === 1 ? [...g.agents[seat]!.hand] : handAfter(g, seat, slotOffer(d.slots[0]))
}

/** 2차 카드는 1차를 뺀 손에 있어야 한다 */
export function normalize(g: GameState, seat: number, d: Draft): Draft {
  const hand2 = slotHand(g, seat, d, 2)
  const s2 = d.slots[1]
  const demand = s2.demand !== null && hand2.includes(s2.demand) ? s2.demand : defaultDemand(hand2)
  const pass = s2.pass || !hand2.length
  if (demand === s2.demand && pass === s2.pass) return d
  return { ...d, slots: [d.slots[0], { ...s2, demand, pass }] }
}

/** 협상 1건의 판정: null = 미완성, 'pass' = 패스 */
export function slotCheck(g: GameState, seat: number, d: Draft, stage: Stage): Check {
  const sl = d.slots[stage - 1]!
  if (sl.pass) return 'pass'
  const offer = slotOffer(sl)
  if (!offer) return null
  return stage === 1 ? validateOffer(g, seat, offer) : validateSecond(g, seat, slotOffer(d.slots[0]), offer)
}

export const slotReady = (c: Check): boolean => c === 'pass' || (c !== null && typeof c === 'object')

/** 지금 쓰는 협상을 고친다 */
export function editSlot(g: GameState, seat: number, d: Draft, patch: Partial<Slot>): Draft {
  const slots: [Slot, Slot] = [...d.slots]
  slots[d.stage - 1] = { ...slots[d.stage - 1]!, ...patch }
  return normalize(g, seat, { ...d, slots })
}
