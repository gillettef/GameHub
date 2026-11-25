// 마법 겨루기 카드 (2026-10-17 실험 activityMarket, 기획 62절): 활동 카드를 한 덱으로 섞을 때 겨루기도 카드로 들어간다.
// 효과는 모두 같다 — 친구 한 명을 지목해 마나기운 주사위로 겨룬다. 이름과 그림만 다르다
import { nextId as randomUUID, random } from "./rng";
import { BALANCE } from "./config";
import type { DuelCard, Pile } from "./types";

const DEFS: Omit<DuelCard, "id">[] = [
  { name: "복도의 도전장", description: "쉬는 시간, 복도 끝에서 친구에게 살짝 도전장을 내밀어요." },
  { name: "운동장 마법 대결", description: "점심시간 운동장에 반짝이는 결투 원이 그려졌어요." },
  { name: "도서관 주문 시합", description: "조용히, 하지만 진지하게! 속삭이는 주문 대결." },
  { name: "기숙사 베개 마법전", description: "불 끄기 전 마지막 한 판, 깃털이 둥실둥실." },
];

export function createDuelPile(): Pile<DuelCard> {
  const draw = Array.from({ length: BALANCE.duelCardCount }, (_, i) => ({ ...DEFS[i % DEFS.length], id: randomUUID() }));
  for (let i = draw.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [draw[i], draw[j]] = [draw[j], draw[i]];
  }
  return { draw, discard: [] };
}
