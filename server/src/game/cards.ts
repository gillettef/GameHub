// NOTE: 카드 실제 텍스트/수량은 아직 미확정입니다 (notes/기획_정리.md 8절 참고).
// (마법생물 카드는 creatures.ts에 30장 실제 데이터로 구현됨) 아래 카드 풀은 게임 로직(라운드 진행/자원 흐름)을 동작시키기 위한 임시 콘텐츠이며,
// 카드 콘텐츠 제작 작업에서 실제 카드로 교체될 예정입니다.
import { randomUUID } from "node:crypto";
import { CREATURE_CARDS } from "./creatures.js";
import type { ClassCard, CreatureCard, EquipmentCard, ExplorationCard, GrimoireCard, StatKey } from "./types.js";

const STATS: StatKey[] = ["intelligence", "stamina", "charm", "spellPower"];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const STAT_LABEL: Record<StatKey, string> = {
  intelligence: "지력",
  stamina: "체력",
  charm: "매력",
  spellPower: "주문력",
};

export function drawClassCard(): ClassCard {
  const stat = pickRandom(STATS);
  const amount = 1;
  return { id: randomUUID(), name: `${STAT_LABEL[stat]} 수업`, statBoost: { stat, amount } };
}

export function drawEquipmentCard(): EquipmentCard {
  const stat = pickRandom(STATS);
  const amount = Math.random() < 0.5 ? 1 : 2;
  return { id: randomUUID(), name: `${STAT_LABEL[stat]} 강화 장비`, tempBoost: { stat, amount } };
}

export function createCreatureDeck(): CreatureCard[] {
  const deck = CREATURE_CARDS.map((card) => ({ ...card, id: randomUUID() }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function drawGrimoireCard(): GrimoireCard {
  const stat = pickRandom(STATS);
  return { id: randomUUID(), name: `${STAT_LABEL[stat]}의 마도서`, statBoost: { stat, amount: 1 } };
}

export function drawExplorationCard(): ExplorationCard {
  const rewardStaminaTokens = 1 + Math.floor(Math.random() * 2); // 1~2
  return { id: randomUUID(), name: "비밀의 방 이벤트", rewardStaminaTokens };
}
