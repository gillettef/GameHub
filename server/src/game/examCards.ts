// 시험 카드: 게임마다 중간고사·기말고사에 서로 다른 카드를 뽑는다. 3라운드 종료 후 중간고사 카드, 9라운드 종료 후 기말고사 카드를 공개한다.
// 시험 점수 = (diceStat 능력치의 기운을 내고 굴린 주사위 합) + (bonusStat 능력치 수치, 있으면). 2026-10-02 39절부터 시험도 활동처럼 카드의 주 능력치 기운이
// 주사위 재료다 (지력→지력기운, 체력→체력기운, 매력→매력기운, 주문력→마나기운). 4가지 능력치가 2장씩 8장. 수치·구성은 초안이며 플레이테스트 후 조정합니다.
import { BALANCE } from "./config.js";
import type { ExamCard, StatKey } from "./types.js";

type Def = { name: string; description: string; diceStat: StatKey; bonusStat?: StatKey };

const DEFS: Def[] = [
  { name: "필기 시험", description: "조용한 교실에서 연필 소리만 사각사각.", diceStat: "intelligence" },
  { name: "마법 이론 논술", description: "배운 이론을 주문으로 풀어 써 봐요.", diceStat: "intelligence", bonusStat: "spellPower" },
  { name: "비행 실기", description: "빗자루를 타고 학교 한 바퀴!", diceStat: "stamina", bonusStat: "spellPower" },
  { name: "마법 마라톤", description: "끝까지 뛰며 문제도 풀어야 해요.", diceStat: "stamina", bonusStat: "intelligence" },
  { name: "마법 발표회", description: "친구들 앞에서 또박또박 발표해요.", diceStat: "charm", bonusStat: "intelligence" },
  { name: "무대 오디션", description: "반짝반짝 무대 위에서 마법 쇼!", diceStat: "charm", bonusStat: "stamina" },
  { name: "주문 실기", description: "선생님 앞에서 주문을 직접 보여 줘요.", diceStat: "spellPower", bonusStat: "charm" },
  { name: "고급 마법진", description: "복잡한 마법진을 정확하게 그려요.", diceStat: "spellPower", bonusStat: "intelligence" },
];

export function examTemplates(): Omit<ExamCard, "id">[] {
  return DEFS.map((d) => ({ ...d }));
}

const FUEL_NAME: Record<StatKey, string> = { intelligence: "지력기운", stamina: "체력기운", charm: "매력기운", spellPower: "마나기운" };

export function describeExam(card: Pick<ExamCard, "diceStat" | "bonusStat">, statName: Record<StatKey, string>): string {
  return `${FUEL_NAME[card.diceStat]}으로 굴린 주사위${card.bonusStat ? ` + ${statName[card.bonusStat]} 수치` : ""}`;
}

// 이번 게임의 중간고사·기말고사 카드: 서로 다른 능력치를 겨냥하는 카드를 뽑는다
export function pickExamCards(): { midterm: ExamCard; final: ExamCard } {
  const cards = examTemplates().map((t, i) => ({ ...t, id: `exam-${i}` }));
  // 61절: 시험 과목을 보드에 인쇄된 고정 과목으로 정한다 (시험 카드 덱이 없다)
  const fixed = BALANCE.fixedExams;
  if (fixed) {
    const byName = (name: string) => cards.find((c) => c.name === name)!;
    return { midterm: byName(fixed.midterm), final: byName(fixed.final) };
  }
  const midterm = cards[Math.floor(Math.random() * cards.length)];
  const rest = cards.filter((c) => c.diceStat !== midterm.diceStat);
  const final = rest[Math.floor(Math.random() * rest.length)];
  return { midterm, final };
}
