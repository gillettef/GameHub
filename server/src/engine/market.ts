import type { Rng } from './rng';
import { GameError } from './state';
import type { GameState, Market } from './state';

export type MarketRow = keyof Market;
const MARKET_ROW = 5;
// 맨 왼쪽 2장은 카드 효과로만 구매 가능 (p.15)
export const MARKET_BUYABLE_FROM = 2;

// 더미가 비면 버린 더미를 섞어 새 더미로 (p.3)
export function drawCard(deck: string[], discard: string[], rng: Rng): string | undefined {
  if (deck.length === 0 && discard.length > 0) {
    deck.push(...rng.shuffle(discard));
    discard.length = 0;
  }
  return deck.shift();
}

function deckFor(state: GameState, row: MarketRow): { deck: string[]; discard: string[] } {
  switch (row) {
    case 'players':
      return { deck: state.decks.starters, discard: state.decks.discards.players };
    case 'staff':
      return { deck: state.decks.staff, discard: state.decks.discards.staff };
    case 'sponsors':
      return { deck: state.decks.sponsors, discard: state.decks.discards.sponsors };
  }
}

// 구매한 자리를 비우고 남은 카드를 오른쪽으로 민 뒤 맨 왼쪽을 새 카드로 채운다 (p.15, p.17, p.18)
export function takeFromMarket(state: GameState, row: MarketRow, index: number, rng: Rng): string {
  const cards = state.market[row];
  if (!Number.isInteger(index) || index < MARKET_BUYABLE_FROM || index >= cards.length) {
    throw new GameError(`market index ${index} not purchasable`);
  }
  const [taken] = cards.splice(index, 1);
  const { deck, discard } = deckFor(state, row);
  const fresh = drawCard(deck, discard, rng);
  if (fresh) cards.unshift(fresh);
  return taken!;
}

// 주말: 맨 오른쪽 카드를 버리고 채운다 (p.25)
export function cycleMarket(state: GameState, row: MarketRow, rng: Rng): void {
  const cards = state.market[row];
  const { deck, discard } = deckFor(state, row);
  const dropped = cards.pop();
  if (dropped) discard.push(dropped);
  const fresh = drawCard(deck, discard, rng);
  if (fresh) cards.unshift(fresh);
  while (cards.length < MARKET_ROW) {
    const more = drawCard(deck, discard, rng);
    if (!more) break;
    cards.push(more);
  }
}
