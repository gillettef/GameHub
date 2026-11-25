// 화면 공용 표기
import { CLUBS, EVENTS, PLAYERS, club, demandFee, player, type EventKey, type Offer } from '../engine'

/** 에이전트 색 (실물에서는 카드 테두리 색) */
export const AGENT_COLORS = ['#d9bd7f', '#7fb3a1', '#93a9cc', '#d39ea4']
export const money = (x: number) => `${x}억`

export const offerText = (o: Offer) => `${player(o.playerId).name} → ${club(o.clubId).name} · 요구 ${demandFee(o.demand)}억`

/** 확대해 보는 카드 */
export type Zoom = { kind: 'player' | 'club' | 'event' | 'demand' | 'goal'; id: number | EventKey }

export function zoomTitle(z: Zoom): string {
  switch (z.kind) {
    case 'player':
      return PLAYERS[z.id as number]!.name
    case 'club':
      return CLUBS[z.id as number]!.name
    case 'event':
      return EVENTS[z.id as EventKey].name
    case 'demand':
      return '요구 수수료 카드'
    case 'goal':
      return '목표 카드'
  }
}
