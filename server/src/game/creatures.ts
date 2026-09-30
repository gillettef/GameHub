// 마법생물 카드 30장 (출처: notes/마법학교.xlsx "마법생물" 시트).
// 원본 능력 텍스트는 카드 배틀 용어(전장/전투/생명력/피해)로 쓰여 있어, 현재 게임 규칙에 맞게 아래처럼 변환했습니다.
//   전장에 들어올 때 → 획득 즉시 (acquire)
//   턴 시작 시      → 매 라운드 1주차(준비) (prep)
//   전투에 참여할 때 → 주문 대결 참여 시, 도전자/도전받은 쪽 모두 (duel)
//   공격을 받을 때   → 주문 대결에서 도전받았을 때 (defend)
//   피해를 받을 때   → 주문 대결에서 패배했을 때 (lose)
//   공격력 +N       → 주문 대결 굴림 +N (rollBonus)
//   상대에게 피해 N  → 상대의 주문 대결 굴림 -N (enemyRollPenalty)
//   피해를 받지 않음  → 주문 대결 패배 시 마법 주문서를 잃지 않음 (immune)
//   주문력 N 얻기    → acquire: 주문력 영구 +N / prep: 그 달 마법 주문서 토큰 +N (spellbook)
//   생명력 N 회복/감소 → 체력토큰. prep이면 그 달 즉시 +N, 그 외에는 다음 달 준비 때 +N/-N (stamina / enemyStamina)
import type { CreatureAbility, CreatureCard, CreatureElement } from "./types.js";

type Def = [
  name: string,
  element: CreatureElement,
  kind: "animal" | "plant",
  requiredSpellPower: number,
  ability: CreatureAbility,
  description: string,
];

const A = (trigger: CreatureAbility["trigger"], effect: CreatureAbility["effect"], amount = 1): CreatureAbility => ({
  trigger,
  effect,
  amount,
});

const DEFS: Def[] = [
  // 하늘
  ["하늘의 감시자", "sky", "animal", 3, A("acquire", "spellPower", 2), "날개가 달린 귀여운 작은 생물. 하늘을 감시하고 있어요."],
  ["에어 스피릿", "sky", "plant", 4, A("lose", "immune"), "가벼운 공기와 빛으로 이루어진 식물 생명체."],
  ["천상의 레오파드", "sky", "animal", 5, A("duel", "rollBonus", 2), "하늘을 떠다니는 우아한 퓨마. 발톱이 반짝여요."],
  ["하늘의 꽃마녀", "sky", "plant", 2, A("duel", "stamina"), "꽃잎과 빛을 조종하는 작은 마녀."],
  ["황금 날개 새", "sky", "animal", 3, A("acquire", "spellPower", 1), "황금빛 깃털의 아름다운 새."],
  ["하늘의 노래꾼", "sky", "plant", 2, A("prep", "stamina"), "노래로 행복을 전하는 식물 생명체."],
  ["신성한 비상", "sky", "animal", 3, A("duel", "enemyRollPenalty"), "성스러운 깃털의 비둘기."],
  ["은하의 수호자", "sky", "animal", 4, A("defend", "stamina"), "별을 품은 날개를 가진 착한 눈의 동물."],
  ["하늘의 신비", "sky", "plant", 5, A("prep", "spellbook", 2), "신비로운 기운이 빛나는 식물 생명체."],
  ["하늘의 수호용", "sky", "animal", 3, A("duel", "rollBonus"), "하늘을 지키는 크고 웅장한 용."],
  // 육지
  ["대지의 수호자", "land", "animal", 3, A("duel", "stamina", 2), "돌 갑옷과 커다란 뿔을 가진 수호자."],
  ["정령 고릴라", "land", "animal", 2, A("duel", "enemyRollPenalty"), "정령의 기운을 두른 힘센 고릴라."],
  ["돌연변이 식물", "land", "plant", 3, A("duel", "rollBonus"), "독특한 색과 모양의 돌연변이 식물."],
  ["땅굴 잠수꾼", "land", "animal", 2, A("duel", "enemyRollPenalty"), "땅속을 민첩하게 누비는 작은 생물."],
  ["대지의 수호정령", "land", "plant", 4, A("defend", "stamina"), "흙과 나무로 이루어진 수호정령."],
  ["지하뿌리 용매", "land", "animal", 3, A("lose", "stamina"), "뿌리와 날개를 가진 지하의 생물."],
  ["바위망치 코끼리", "land", "animal", 5, A("duel", "rollBonus", 2), "바위처럼 단단한 피부의 코끼리."],
  ["용암 식물", "land", "plant", 2, A("prep", "spellbook"), "뜨거운 용암에서 자라는 식물."],
  ["지하 돌껍질", "land", "animal", 4, A("lose", "immune"), "단단한 돌껍질로 몸을 지키는 생물."],
  ["대지의 수호자 용", "land", "animal", 3, A("duel", "stamina"), "장갑 같은 피부의 대지의 수호용."],
  // 바다
  ["심해의 수호자", "ocean", "animal", 3, A("duel", "enemyRollPenalty"), "어둠 속에서 빛나는 큰 눈의 수호자."],
  ["해양 정령", "ocean", "animal", 4, A("lose", "stamina"), "푸른 물결과 함께 나타나는 투명한 정령."],
  ["바다의 포식자", "ocean", "animal", 3, A("defend", "rollBonus"), "크고 날카로운 이빨의 바다 포식자."],
  ["심해의 마녀", "ocean", "plant", 2, A("duel", "enemyStamina"), "심해에서 독과 불꽃을 다루는 마녀."],
  ["감각 물고기", "ocean", "animal", 2, A("acquire", "spellPower", 1), "눈과 귀가 아주 예민한 물고기."],
  ["푸른 해마", "ocean", "animal", 3, A("defend", "stamina"), "작고 아름다운 푸른 꼬리의 해마."],
  ["심해의 수호요정", "ocean", "plant", 4, A("duel", "stamina", 2), "심해의 꽃을 닮은 치유의 요정."],
  ["바다의 여왕", "ocean", "animal", 5, A("lose", "enemyStamina"), "위엄 있고 아름다운 바다의 여왕."],
  ["바다의 은인", "ocean", "plant", 3, A("prep", "spellbook"), "푸른 빛을 두른 바다의 마법사."],
  ["물결 저격수", "ocean", "animal", 2, A("duel", "enemyRollPenalty"), "빠르고 정확한 바다의 저격수."],
];

export const CREATURE_CARDS: readonly Omit<CreatureCard, "id">[] = DEFS.map(
  ([name, element, kind, requiredSpellPower, ability, description], index) => ({
    cardNo: index + 1,
    name,
    element,
    kind,
    requiredSpellPower,
    ability,
    description,
  }),
);

export function describeAbility(a: CreatureAbility): string {
  const when = { acquire: "획득 즉시", prep: "매달 준비 때", duel: "주문 대결 참여 시", defend: "대결 도전받을 때", lose: "대결 패배 시", always: "항상" }[a.trigger];
  const what = {
    spellPower: `주문력 영구 +${a.amount}`,
    spellbook: `마법 주문서 +${a.amount}`,
    stamina: a.trigger === "prep" ? `체력토큰 +${a.amount}` : `다음 달 체력토큰 +${a.amount}`,
    rollBonus: `내 굴림 +${a.amount}`,
    enemyRollPenalty: `상대 굴림 -${a.amount}`,
    enemyStamina: `상대 다음 달 체력토큰 -${a.amount}`,
    immune: "주문서를 잃지 않음",
    charmRate: `매력토큰 교환 비율 -${a.amount} (매력토큰 ${Math.max(2, 3 - a.amount)}개 = 다른 토큰 1개)`,
  }[a.effect];
  return `${when}: ${what}`;
}
