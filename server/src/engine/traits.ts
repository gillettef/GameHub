import { cards } from './cards';
import { MARKET_BUYABLE_FROM } from './market';
import type { MarketRow } from './market';
import type { PlayerState } from './state';
import { INFRASTRUCTURE_COST } from './types';
import type { Trait } from './types';

// 임원·직원 카드의 지속 특성(trait). 규칙서 p.28: [출장정지]가 올려진 카드는 특성을 쓸 수 없다.
// 엔진(비용·재굴림·유지비 등)과 클라이언트(버튼 활성화·표시)가 같은 계산을 쓴다

type Holder = Pick<PlayerState, 'executives' | 'staff'>;

export function traitsOf(player: Holder): Trait[] {
  const out: Trait[] = [];
  for (const e of player.executives) {
    const t = cards.executive(e.cardId).trait;
    if (t) out.push(t.effect);
  }
  for (const s of player.staff) {
    if (s.suspension > 0) continue;
    const t = cards.staff(s.cardId).trait;
    if (t) out.push(t.effect);
  }
  return out;
}

export function hasTrait(player: Holder, kind: Trait['kind']): boolean {
  return traitsOf(player).some((t) => t.kind === kind);
}

// 같은 종류의 특성이 여러 장이면 합산
export function traitSum(player: Holder, kind: 'infraDiscount' | 'hireDiscount' | 'prospectDiscount' | 'fandomOnSponsor' | 'releaseBonus' | 'upkeepDiscount' | 'standsBonusMoney'): number {
  return traitsOf(player).reduce((n, t) => (t.kind === kind ? n + t.amount : n), 0);
}
export function traitCount(player: Holder, kind: 'freeLineupStamina' | 'extraSaves' | 'keepStamina'): number {
  return traitsOf(player).reduce((n, t) => (t.kind === kind ? n + t.count : n), 0);
}

export function infraCost(player: Holder): number {
  return Math.max(0, INFRASTRUCTURE_COST - traitSum(player, 'infraDiscount'));
}
export function hireCost(player: Holder, cardCost: number): number {
  return Math.max(0, cardCost - traitSum(player, 'hireDiscount'));
}
export function prospectCost(player: Holder, cardCost: number): number {
  return Math.max(0, cardCost - traitSum(player, 'prospectDiscount'));
}
// 출전 선수마다 체력 1 (p.20 3). 카드에 미리 올려놓은 체력이 있는 선수는 그것을 쓰므로 빼고, 나머지에서 특성으로 일부 면제
export function lineupStaminaCost(player: Holder, played: { stamina: number }[]): number {
  return Math.max(0, played.filter((p) => p.stamina <= 0).length - traitCount(player, 'freeLineupStamina'));
}
// 이적 시장에서 고를 수 있는 가장 왼쪽 index: 기본은 오른쪽 3장(p.15), 특성이 있으면 5장 전부
export function marketMinIndex(player: Holder, row: MarketRow): number {
  return traitsOf(player).some((t) => t.kind === 'marketReach' && t.row === row) ? 0 : MARKET_BUYABLE_FROM;
}
