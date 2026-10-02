// 수업카드 덱 (학기마다 1개: 1학기 덱 → 중간고사 뒤 2학기 덱으로 교체). 42절: 수업은 기운을 얻는 단계다.
// 카드 = 과목: 지력·체력·매력·주문력 중 하나의 기운을 무료로 준다 (주문력 과목의 기운은 마나기운). 능력치(실력)는 올려 주지 않는다 (성장은 자율활동으로).
// 기초 과목은 +BALANCE.classGain.basic, 심화 과목은 +BALANCE.classGain.advanced를 주고, 심화는 그 과목 능력치가 BALANCE.advancedMinStat 이상이어야 들을 수 있다
// (선수과목: 기초를 쌓아야 심화를 듣는다 — "숙련"). 한 능력치당 카드 종류 12장: 기초 5종(이름 5종 × 2장), 심화 2종(이름 2종 × 1장).
// 학기 덱은 이 종류를 학기별 비율대로 뽑아 만든다 (BALANCE.classSemesters): 1학기는 지력·체력·매력 위주(주문력 과목은 소수), 2학기는 주문력 과목이 늘어난다.
// 수치·수량은 플레이테스트와 시뮬레이션으로 조정한다.
import { BALANCE } from "./config.js";
import type { ClassCard, StatKey } from "./types.js";

// [이름, 설명]
type Def = [name: string, description: string];

const BASIC: Record<StatKey, Def[]> = {
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

const ADVANCED: Record<StatKey, Def[]> = {
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

const STATS = Object.keys(BASIC) as StatKey[];

// 학기: 1학기(중간고사 라운드까지) = 1, 2학기 = 2
export const classSemesterOf = (round: number): 1 | 2 => (round <= BALANCE.midtermRound ? 1 : 2);

// 카드 종류 한 벌 (id 없음)
function templates(): Omit<ClassCard, "id">[] {
  const list: Omit<ClassCard, "id">[] = [];
  for (const stat of STATS) {
    for (const [name, description] of BASIC[stat]) {
      for (let i = 0; i < 2; i++) list.push({ name, description, stat, level: "basic", gain: BALANCE.classGain.basic });
    }
    for (const [name, description] of ADVANCED[stat]) {
      list.push({ name, description, stat, level: "advanced", gain: BALANCE.classGain.advanced, minStat: BALANCE.advancedMinStat });
    }
  }
  return list;
}

export const CLASS_TEMPLATE_COUNT = templates().length;

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
    const pool = templates().filter((t) => t.stat === stat);
    for (let i = 0; i < counts[stat]; i++) {
      if (i % pool.length === 0) shuffleInPlace(pool);
      deck.push({ ...pool[i % pool.length], id: makeId() });
    }
  }
  return shuffleInPlace(deck);
}
