// 연구 카드 (연구실 실험 = 정규수업의 연장선인 "심화학습"). 지력만큼 펼친 카드 중 1장을 직접 골라 효과를 받습니다.
//   study   심화 수업: 능력치 영구 증가 (고르는 데 체력기운이 든다: 하나만 오르면 0, 둘이 오르면 1 — 45절에서 기운 수입에 맞춰 1씩 낮춤)
//   exam    시험 대비: 그 능력치의 기운 (시험 과목 기운을 모아 둔다) 또는 학점 — 임시 능력치는 51절에서 없앴다
//   supply  보급: 마나기운/체력기운 (바로 받는다, 51절)
// 카드마다 고르는 데 드는 체력기운(cost)이 정해져 있습니다. 펼쳐진 카드를 보고 낼 수 있는 카드만 고를 수 있고, 아무것도 고르지 않고 넘어갈 수도 있습니다.
// 카드 구성과 수치는 초안이며 플레이테스트 후 조정합니다. 30장.
import { describeEffect } from "./explorationCards.js";
import type { CardEffect, LabCard, LabCardKind } from "./types.js";

type Def = { name: string; description: string; cost: number; kind: LabCardKind; effect: CardEffect; copies: number };

const DEFS: Def[] = [
  // 심화 수업 — 능력치 하나 +2 (8장)
  { name: "특별 개인 지도", description: "교수님이 옆에서 하나하나 알려 주세요.", cost: 0, kind: "study", effect: { stats: { intelligence: 1 } }, copies: 2 },
  { name: "산악 훈련 캠프", description: "산 정상까지 씩씩하게 올랐어요.", cost: 0, kind: "study", effect: { stats: { stamina: 1 } }, copies: 2 },
  { name: "사교 무도회 레슨", description: "우아한 인사법을 배웠어요.", cost: 0, kind: "study", effect: { stats: { charm: 1 } }, copies: 2 },
  { name: "고급 마법 세미나", description: "어려운 주문을 깊이 파고들었어요.", cost: 0, kind: "study", effect: { stats: { spellPower: 1 } }, copies: 2 },
  // 심화 수업 — 능력치 둘 +1/+1 (6장)
  { name: "마법약 실험", description: "머리도 쓰고 마력도 쓰는 실험!", cost: 1, kind: "study", effect: { stats: { intelligence: 1, spellPower: 1 } }, copies: 1 },
  { name: "도서관 야간 자습", description: "밤새 공부하면서 체력도 길렀어요.", cost: 1, kind: "study", effect: { stats: { intelligence: 1, stamina: 1 } }, copies: 1 },
  { name: "토론 동아리", description: "논리적으로 말하니 다들 귀 기울여요.", cost: 1, kind: "study", effect: { stats: { intelligence: 1, charm: 1 } }, copies: 1 },
  { name: "빗자루 곡예단", description: "하늘에서 멋지게 묘기를 부려요.", cost: 1, kind: "study", effect: { stats: { stamina: 1, charm: 1 } }, copies: 1 },
  { name: "마력 호흡법", description: "숨을 고르니 마력이 차올라요.", cost: 1, kind: "study", effect: { stats: { stamina: 1, spellPower: 1 } }, copies: 1 },
  { name: "무대 마법 공연", description: "반짝이는 마법으로 관객을 사로잡았어요.", cost: 1, kind: "study", effect: { stats: { charm: 1, spellPower: 1 } }, copies: 1 },
  // 시험 대비 — 능력치의 기운 / 학점 (8장)
  { name: "마법 안경", description: "글씨가 또렷또렷 보여요.", cost: 0, kind: "exam", effect: { tokens: { intelligence: 2 } }, copies: 1 },
  { name: "튼튼 부츠", description: "아무리 걸어도 안 아파요.", cost: 0, kind: "exam", effect: { tokens: { stamina: 2 } }, copies: 1 },
  { name: "반짝 브로치", description: "달고 다니면 눈길이 쏙!", cost: 0, kind: "exam", effect: { tokens: { charm: 2 } }, copies: 1 },
  { name: "수정 지팡이", description: "끝에서 반짝이는 마력이 나와요.", cost: 0, kind: "exam", effect: { tokens: { mana: 2 } }, copies: 1 },
  { name: "고대의 두루마리", description: "잊힌 지식이 술술 읽혀요.", cost: 0, kind: "exam", effect: { tokens: { intelligence: 3 } }, copies: 1 },
  { name: "용의 심장 조각", description: "손에 쥐면 마력이 넘쳐흘러요.", cost: 0, kind: "exam", effect: { tokens: { mana: 3 } }, copies: 1 },
  { name: "우등생 배지", description: "선생님이 달아 주신 반짝 배지.", cost: 1, kind: "exam", effect: { credit: 1 }, copies: 1 },
  { name: "장학금 봉투", description: "열어 보니 학점 도장이 가득!", cost: 1, kind: "exam", effect: { credit: 1 }, copies: 1 },
  // 보급 — 기운 (4장)
  { name: "마나기운 꾸러미", description: "선반에 마나기운이 한가득!", cost: 0, kind: "supply", effect: { tokens: { mana: 3 } }, copies: 2 },
  { name: "든든 도시락", description: "급식실 아주머니가 몰래 챙겨 주셨어요.", cost: 0, kind: "supply", effect: { tokens: { stamina: 2 } }, copies: 2 },
];

export function labTemplates(): Omit<LabCard, "id">[] {
  return DEFS.flatMap(({ copies, ...card }) =>
    Array.from({ length: copies }, () => ({ ...card, summary: describeEffect(card.effect) })),
  );
}
