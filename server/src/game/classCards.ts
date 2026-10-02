// 수업카드 덱 (학기마다 1개: 1학기 덱 → 중간고사 뒤 2학기 덱으로 교체). 원본 기획(notes/마법학교.xlsx Sheet1)의 "수업 카드에는 지력, 체력, 주문력, 매력을
// 직접 증가하는 카드가 있다 (ex. 교과서 +1, 수업 +2)"를 바탕으로 구성한 초안입니다.
// 능력치별 카드 종류 12장: +1 카드 10장(이름 5종 × 2장), +2 카드 2장(이름 2종 × 1장). 학기 덱은 이 종류를 학기별 비율대로 뽑아 만듭니다.
// 1학기 덱은 지력·체력·매력 위주에 습득 체력기운이 낮고(주문력 카드는 소수), 2학기 덱은 주문력 위주에 비용이 높습니다 (BALANCE.classSemesters).
// 수치/수량은 플레이테스트 후 조정합니다.
// 카드마다 습득에 필요한 체력기운(takeCost)이 다릅니다. 카드는 지력기운을 내고 열어 봐야 비용을 알 수 있고,
// 싼 카드부터 먼저 소진되므로 덱이 줄어들수록 남는 카드가 비싸져 자연스럽게 성장이 느려집니다.
import { BALANCE } from "./config.js";
import type { ClassCard, StatKey } from "./types.js";

// [이름, 설명, 습득에 필요한 체력기운]
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

// 학기: 1학기(중간고사 라운드까지) = 1, 2학기 = 2
export const classSemesterOf = (round: number): 1 | 2 => (round <= BALANCE.midtermRound ? 1 : 2);

// 카드 종류 한 벌 (id 없음). 주문력 카드는 습득 체력기운이 학기별 spellExtraCost만큼 더 들고,
// 그 외 카드는 nonSpellCostCap을 넘지 않는다: 초반엔 체력을 키워야 비싼 카드를 살 수 있어서 "초반 지력·체력 → 후반 주문력·학점" 흐름이 된다
function templates(semester: 1 | 2): Omit<ClassCard, "id">[] {
  const { spellExtraCost, nonSpellCostCap } = BALANCE.classSemesters[semester - 1];
  const list: Omit<ClassCard, "id">[] = [];
  for (const stat of STATS) {
    const cost = (base: number) => (stat === "spellPower" ? base + spellExtraCost : Math.min(base, nonSpellCostCap));
    for (const [name, description, baseCost] of NORMAL[stat]) {
      for (let i = 0; i < 2; i++) list.push({ name, description, takeCost: cost(baseCost), statBoost: { stat, amount: 1 } });
    }
    for (const [name, description, baseCost] of RARE[stat]) list.push({ name, description, takeCost: cost(baseCost), statBoost: { stat, amount: 2 } });
  }
  return list;
}

export const CLASS_TEMPLATE_COUNT = templates(1).length;

function shuffleInPlace<T>(a: T[]): T[] {
  for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; }
  return a;
}

// 능력치별 장수: 학기 비율(weights)대로 나누고 남는 장수는 소수점이 큰 능력치부터 하나씩 준다 (최대잔여법)
function statCounts(total: number, weights: Record<StatKey, number>): Record<StatKey, number> {
  const sum = STATS.reduce((a, s) => a + weights[s], 0);
  const counts = {} as Record<StatKey, number>;
  let used = 0;
  for (const s of STATS) { counts[s] = Math.floor((total * weights[s]) / sum); used += counts[s]; }
  const byRemainder = [...STATS].sort((a, b) => ((total * weights[b]) / sum) % 1 - ((total * weights[a]) / sum) % 1);
  for (let i = 0; used < total; i++, used++) counts[byRemainder[i % STATS.length]]++;
  return counts;
}

// 그 학기의 덱: 인원과 무관하게 classDeckSize장을 학기 비율대로 능력치별로 나눠, 같은 능력치 안에서는 종류 한 벌씩 섞어 이어 붙인다
export function createClassDeck(makeId: () => string, semester: 1 | 2 = 1, size = BALANCE.classDeckSize): ClassCard[] {
  const counts = statCounts(size, BALANCE.classSemesters[semester - 1].statWeights);
  const deck: ClassCard[] = [];
  for (const stat of STATS) {
    const pool = templates(semester).filter((t) => t.statBoost.stat === stat);
    for (let i = 0; i < counts[stat]; i++) {
      if (i % pool.length === 0) shuffleInPlace(pool);
      deck.push({ ...pool[i % pool.length], id: makeId() });
    }
  }
  return shuffleInPlace(deck);
}
