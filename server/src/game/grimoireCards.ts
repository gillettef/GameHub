// 마도서 카드 (주문 대결 승자 보상). 획득 즉시 능력치가 영구 증가하고, 일부는 마법생물과 같은 추가 능력을 가집니다.
// "마법 주문서"(1주차에 받는 토큰)와 이름이 겹치지 않도록 보상 카드는 "마도서"로 부릅니다.
// 카드 구성과 수치는 초안이며 플레이테스트 후 조정합니다. 17장.
import type { CreatureAbility, GrimoireCard, StatKey } from "./types.js";

type Def = { name: string; description: string; stat: StatKey; amount?: number; ability?: CreatureAbility };

const DEFS: Def[] = [
  // 능력치만 오르는 마도서
  { name: "속삭이는 지혜서", description: "펼치면 귓가에 답이 속삭여요.", stat: "intelligence" },
  { name: "반짝 연습장", description: "풀수록 별이 늘어나는 연습장.", stat: "intelligence" },
  { name: "튼튼 마법 체조책", description: "따라 하면 몸이 가벼워져요.", stat: "stamina" },
  { name: "매혹의 화술서", description: "말솜씨가 살랑살랑 좋아져요.", stat: "charm" },
  { name: "반짝 스타일북", description: "오늘의 머리 모양 백 가지.", stat: "charm" },
  { name: "초급 주문집", description: "누구나 쓸 수 있는 쉬운 주문 모음.", stat: "spellPower" },
  { name: "별빛 주문집", description: "밤하늘의 마력을 담은 주문집.", stat: "spellPower" },
  // 능력치 + 추가 능력
  { name: "방어 마법서", description: "지고 나서도 든든해요.", stat: "stamina", ability: { trigger: "lose", effect: "immune", amount: 1 } },
  { name: "응원 시집", description: "도전받아도 마음이 든든해요.", stat: "charm", ability: { trigger: "defend", effect: "stamina", amount: 1 } },
  { name: "결투자의 수첩", description: "대결 전략이 빼곡히 적혀 있어요.", stat: "spellPower", ability: { trigger: "duel", effect: "rollBonus", amount: 1 } },
  { name: "저주 대백과", description: "상대를 살짝 방해하는 주문 모음.", stat: "intelligence", ability: { trigger: "duel", effect: "enemyRollPenalty", amount: 1 } },
  { name: "마력 저장서", description: "쓰고 남은 마력을 모아 둬요.", stat: "spellPower", ability: { trigger: "prep", effect: "spellbook", amount: 1 } },
  { name: "도시락 레시피", description: "맛있는 도시락으로 기운 충전!", stat: "stamina", ability: { trigger: "prep", effect: "stamina", amount: 1 } },
  { name: "반격 교본", description: "도전받으면 더 힘이 나요.", stat: "spellPower", ability: { trigger: "defend", effect: "rollBonus", amount: 1 } },
  { name: "위로의 동화책", description: "져도 마음이 포근해져요.", stat: "charm", ability: { trigger: "lose", effect: "stamina", amount: 1 } },
  // 귀한 마도서 (+2)
  { name: "대마법사의 비전서", description: "전설의 대마법사가 남긴 비밀 노트.", stat: "spellPower", amount: 2 },
  { name: "만능 학습서", description: "한 권으로 모든 과목이 끝나요.", stat: "intelligence", amount: 2 },
];

export function grimoireTemplates(): Omit<GrimoireCard, "id">[] {
  return DEFS.map(({ stat, amount = 1, ability, ...rest }) => ({ ...rest, statBoost: { stat, amount }, ability }));
}
