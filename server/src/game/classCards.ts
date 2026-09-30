// 수업카드 덱 (48장, 덱은 1개). 원본 기획(notes/마법학교.xlsx Sheet1)의 "수업 카드에는 지력, 체력, 주문력, 매력을
// 직접 증가하는 카드가 있다 (ex. 교과서 +1, 수업 +2)"를 바탕으로 구성한 초안입니다.
// 능력치별 12장: +1 카드 10장(이름 5종 × 2장), +2 카드 2장(이름 2종 × 1장). 수치/수량은 플레이테스트 후 조정합니다.
// 카드마다 습득에 필요한 체력토큰(takeCost)이 다릅니다. 카드는 지력토큰을 내고 열어 봐야 비용을 알 수 있고,
// 싼 카드부터 먼저 소진되므로 덱이 줄어들수록 남는 카드가 비싸져 자연스럽게 성장이 느려집니다.
import type { ClassCard, StatKey } from "./types.js";

// [이름, 설명, 습득에 필요한 체력토큰]
type Def = [name: string, description: string, takeCost: number];

const NORMAL: Record<StatKey, Def[]> = {
  intelligence: [
    ["교과서", "차근차근 읽으면 머리에 쏙쏙!", 1],
    ["필기 노트", "색색깔 펜으로 정리한 노트예요.", 1],
    ["도서관 자습", "조용한 도서관에서 집중 또 집중.", 2],
    ["스터디 모임", "친구들과 함께 문제를 풀어요.", 2],
    ["마법 퀴즈", "맞히면 기분이 좋아지는 퀴즈 시간.", 1],
  ],
  stamina: [
    ["아침 달리기", "상쾌한 아침 공기를 마시며 달려요.", 1],
    ["마법 체조", "온몸이 나른나른 풀리는 체조.", 1],
    ["든든한 급식", "따끈한 수프와 빵으로 배를 채워요.", 1],
    ["푹신한 낮잠", "낮잠 한숨에 기운이 솔솔.", 2],
    ["빗자루 정비", "빗자루를 닦다 보니 팔 힘이 붙었어요.", 2],
  ],
  charm: [
    ["거울 앞 연습", "웃는 얼굴을 연습해 봐요.", 1],
    ["발표 수업", "또박또박 말하는 연습을 해요.", 2],
    ["동아리 활동", "새 친구를 잔뜩 사귀었어요.", 2],
    ["리본 꾸미기", "머리에 예쁜 리본을 달았어요.", 1],
    ["티 파티", "달콤한 차와 수다 시간.", 1],
  ],
  spellPower: [
    ["주문 암기", "긴 주문을 또박또박 외웠어요.", 2],
    ["기초 마법진", "분필로 그린 작은 마법진.", 1],
    ["지팡이 다루기", "지팡이가 손에 착 감겨요.", 1],
    ["약초 조제", "보글보글 약초 물약 만들기.", 2],
    ["별빛 명상", "밤하늘 별빛에서 마력을 모아요.", 1],
  ],
};

const RARE: Record<StatKey, Def[]> = {
  intelligence: [
    ["특별 강의", "깐깐한 선생님의 알찬 특강!", 2],
    ["명예 교수의 수업", "전설의 교수님이 직접 가르쳐 주셔요.", 3],
  ],
  stamina: [
    ["비행 수업", "빗자루를 타고 하늘을 누벼요.", 2],
    ["대운동회", "온 학교가 함께하는 신나는 운동회!", 3],
  ],
  charm: [
    ["무대 연극", "주인공이 되어 박수를 받았어요.", 2],
    ["학교 축제", "축제의 스타가 되었어요!", 3],
  ],
  spellPower: [
    ["고급 주문 특강", "어려운 주문을 한 번에 이해했어요.", 2],
    ["마법 실습", "직접 해 보니 마력이 쑥쑥!", 3],
  ],
};

const STATS = Object.keys(NORMAL) as StatKey[];

// 카드 종류 한 벌 (id 없음)
function templates(): Omit<ClassCard, "id">[] {
  const list: Omit<ClassCard, "id">[] = [];
  for (const stat of STATS) {
    for (const [name, description, takeCost] of NORMAL[stat]) {
      for (let i = 0; i < 2; i++) list.push({ name, description, takeCost, statBoost: { stat, amount: 1 } });
    }
    for (const [name, description, takeCost] of RARE[stat]) list.push({ name, description, takeCost, statBoost: { stat, amount: 2 } });
  }
  return list;
}

export const CLASS_DECK_SIZE = templates().length;

export function createClassDeck(makeId: () => string): ClassCard[] {
  const deck = templates().map((t) => ({ ...t, id: makeId() }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
