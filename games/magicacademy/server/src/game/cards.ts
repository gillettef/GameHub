// 카드 덱 생성 모음. 카드 실제 데이터는 종류별 파일에 있습니다.
// (수량/수치는 모두 초안이며 플레이테스트 후 조정 — notes/기획_정리.md 12~16절 참고)
import { randomUUID } from "node:crypto";
import { CREATURE_CARDS } from "./creatures.js";
import { labTemplates } from "./labCards.js";
import { explorationTemplates } from "./explorationCards.js";
import type { CreatureCard, Pile } from "./types.js";

export { createClassDeck } from "./classCards.js";

function shuffled<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createCreatureDeck(): CreatureCard[] {
  return shuffled(CREATURE_CARDS.map((card) => ({ ...card, id: randomUUID() })));
}

function createPile<T>(templates: Omit<T, "id">[]): Pile<T> {
  return { draw: shuffled(templates.map((t) => ({ ...t, id: randomUUID() }) as T)), discard: [] };
}

export const createLabPile = () => createPile(labTemplates());
export const createExplorationPile = () => createPile(explorationTemplates());

// 더미에서 1장 뽑는다. 뽑을 더미가 비면 버림 더미를 섞어 다시 쓰고, 둘 다 비면 undefined
// 더미 맨 위 카드를 뽑지 않고 확인한다 (뽑을 더미가 비면 버림 더미를 섞어 준비)
export function peekPile<T>(pile: Pile<T>): T | undefined {
  if (pile.draw.length === 0) {
    pile.draw = shuffled(pile.discard);
    pile.discard = [];
  }
  return pile.draw[pile.draw.length - 1];
}

export function drawFromPile<T>(pile: Pile<T>): T | undefined {
  if (pile.draw.length === 0) {
    pile.draw = shuffled(pile.discard);
    pile.discard = [];
  }
  return pile.draw.pop();
}
