// 수업카드 덱 (48장). 원본 기획(notes/마법학교.xlsx Sheet1)의 "수업 카드에는 지력, 체력, 주문력, 매력을
// 직접 증가하는 카드가 있다 (ex. 교과서 +1, 수업 +2)"를 바탕으로 구성한 초안입니다.
// 능력치별 12장: +1 카드 10장(이름 5종 × 2장), +2 카드 2장(이름 2종 × 1장). 수치/수량은 플레이테스트 후 조정합니다.
import type { ClassCard, ClassTier, StatKey } from "./types.js";

type Def = [name: string, description: string];

const NORMAL: Record<StatKey, Def[]> = {
  intelligence: [
    ["교과서", "차근차근 읽으면 머리에 쏙쏙!"],
    ["필기 노트", "색색깔 펜으로 정리한 노트예요."],
    ["도서관 자습", "조용한 도서관에서 집중 또 집중."],
    ["스터디 모임", "친구들과 함께 문제를 풀어요."],
    ["마법 퀴즈", "맞히면 기분이 좋아지는 퀴즈 시간."],
  ],
  stamina: [
    ["아침 달리기", "상쾌한 아침 공기를 마시며 달려요."],
    ["마법 체조", "온몸이 나른나른 풀리는 체조."],
    ["든든한 급식", "따끈한 수프와 빵으로 배를 채워요."],
    ["푹신한 낮잠", "낮잠 한숨에 기운이 솔솔."],
    ["빗자루 정비", "빗자루를 닦다 보니 팔 힘이 붙었어요."],
  ],
  charm: [
    ["거울 앞 연습", "웃는 얼굴을 연습해 봐요."],
    ["발표 수업", "또박또박 말하는 연습을 해요."],
    ["동아리 활동", "새 친구를 잔뜩 사귀었어요."],
    ["리본 꾸미기", "머리에 예쁜 리본을 달았어요."],
    ["티 파티", "달콤한 차와 수다 시간."],
  ],
  spellPower: [
    ["주문 암기", "긴 주문을 또박또박 외웠어요."],
    ["기초 마법진", "분필로 그린 작은 마법진."],
    ["지팡이 다루기", "지팡이가 손에 착 감겨요."],
    ["약초 조제", "보글보글 약초 물약 만들기."],
    ["별빛 명상", "밤하늘 별빛에서 마력을 모아요."],
  ],
};

const RARE: Record<StatKey, Def[]> = {
  intelligence: [
    ["특별 강의", "깐깐한 선생님의 알찬 특강!"],
    ["명예 교수의 수업", "전설의 교수님이 직접 가르쳐 주셔요."],
  ],
  stamina: [
    ["비행 수업", "빗자루를 타고 하늘을 누벼요."],
    ["대운동회", "온 학교가 함께하는 신나는 운동회!"],
  ],
  charm: [
    ["무대 연극", "주인공이 되어 박수를 받았어요."],
    ["학교 축제", "축제의 스타가 되었어요!"],
  ],
  spellPower: [
    ["고급 주문 특강", "어려운 주문을 한 번에 이해했어요."],
    ["마법 실습", "직접 해 보니 마력이 쑥쑥!"],
  ],
};

const STATS = Object.keys(NORMAL) as StatKey[];

// 카드 종류 한 벌 (id 없음)
function templates(): Omit<ClassCard, "id">[] {
  const list: Omit<ClassCard, "id">[] = [];
  for (const stat of STATS) {
    for (const [name, description] of NORMAL[stat]) {
      for (let i = 0; i < 2; i++) list.push({ name, description, tier: "normal", statBoost: { stat, amount: 1 } });
    }
    for (const [name, description] of RARE[stat]) list.push({ name, description, tier: "rare", statBoost: { stat, amount: 2 } });
  }
  return list;
}

export const CLASS_DECK_SIZE = templates().length;

function shuffled<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 등급별로 나뉜 덱: 플레이어는 어느 등급의 카드를 열지 미리 고를 수 있다
export function createClassDecks(makeId: () => string): Record<ClassTier, ClassCard[]> {
  const cards = templates().map((t) => ({ ...t, id: makeId() }));
  return {
    normal: shuffled(cards.filter((c) => c.tier === "normal")),
    rare: shuffled(cards.filter((c) => c.tier === "rare")),
  };
}
