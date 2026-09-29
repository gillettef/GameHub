// 탐험카드 (비밀의 방 탐색, 단독 처리). 주사위 1개 + 능력치가 target 이상이면 성공, 아니면 실패 효과를 받습니다.
// 판정이 없는 카드는 무조건 성공합니다. 체력토큰은 수업 이후 쓸 데가 없어 "다음 달 체력토큰"으로 지급/차감합니다.
// 카드 구성과 수치는 초안이며 플레이테스트 후 조정합니다. 20장.
import type { CardEffect, ExplorationCard } from "./types.js";

type Def = Omit<ExplorationCard, "id" | "failure"> & { failure?: CardEffect };

const DEFS: Def[] = [
  { name: "먼지 쌓인 서고", description: "오래된 책 더미 사이에서 반짝이는 책 한 권을 찾았어요.", check: { stat: "intelligence", target: 8 }, success: { stats: { intelligence: 1 } }, failure: { nextStamina: -1 } },
  { name: "속삭이는 갑옷", description: "빈 갑옷이 팔씨름을 걸어와요!", check: { stat: "stamina", target: 8 }, success: { stats: { stamina: 1 } } },
  { name: "거울의 방", description: "거울 속 내가 손을 흔들어요.", check: { stat: "charm", target: 8 }, success: { stats: { charm: 1 } } },
  { name: "잠자는 마법진", description: "바닥의 마법진이 희미하게 빛나요.", check: { stat: "spellPower", target: 8 }, success: { stats: { spellPower: 1 } }, failure: { nextStamina: -1 } },
  { name: "몰래 열린 간식 창고", description: "쿠키 향이 솔솔 나요. 살금살금 하나 집어 먹었어요.", success: { nextStamina: 2 } },
  { name: "사라진 별 조각", description: "구석에서 별 조각을 주워 마법 주문서를 만들었어요.", success: { spellbookTokens: 2 } },
  { name: "비밀 계단", description: "벽 뒤로 좁은 계단이 이어져요.", check: { stat: "stamina", target: 6 }, success: { spellbookTokens: 3 } },
  { name: "말하는 그림", description: "초상화가 자기 이야기를 들어 달래요.", check: { stat: "charm", target: 6 }, success: { tempStats: { charm: 2 } } },
  { name: "수상한 물약 병", description: "보글보글 무지갯빛 물약, 마셔 볼까요?", check: { stat: "intelligence", target: 6 }, success: { tempStats: { spellPower: 2 } }, failure: { nextStamina: -1 } },
  { name: "잊혀진 교실", description: "칠판에 풀리지 않은 문제가 남아 있어요.", check: { stat: "intelligence", target: 10 }, success: { credit: 1 } },
  { name: "황금 열쇠 구멍", description: "주문이 맞아야만 열리는 커다란 문이에요.", check: { stat: "spellPower", target: 10 }, success: { credit: 1 } },
  { name: "요정들의 티 파티", description: "작은 요정들이 자리에 초대해 줬어요.", check: { stat: "charm", target: 7 }, success: { stats: { charm: 1 }, nextStamina: 1 } },
  { name: "오래된 지도", description: "귀퉁이가 닳은 보물 지도를 발견했어요.", check: { stat: "intelligence", target: 7 }, success: { spellbookTokens: 2, tempStats: { intelligence: 1 } } },
  { name: "그림자 미로", description: "길이 자꾸 바뀌는 어두운 미로예요.", check: { stat: "stamina", target: 9 }, success: { stats: { spellPower: 1 } }, failure: { nextStamina: -1 } },
  { name: "반짝이는 버섯 숲", description: "발광 버섯이 가득한 포근한 숲이에요.", success: { tempStats: { stamina: 1 }, nextStamina: 1 } },
  { name: "꼬마 유령의 부탁", description: "꼬마 유령이 잃어버린 인형을 찾아 달래요.", check: { stat: "charm", target: 6 }, success: { stats: { intelligence: 1 } } },
  { name: "무너진 탑 꼭대기", description: "높은 곳에 마력 덩어리가 놓여 있어요.", check: { stat: "stamina", target: 8 }, success: { stats: { spellPower: 1 }, spellbookTokens: 1 } },
  { name: "비밀 온실", description: "신기한 식물들이 마력을 뿜어 줘요.", success: { tempStats: { spellPower: 1, intelligence: 1 } } },
  { name: "금간 수정구", description: "수정구 안에서 무언가 깜빡여요.", check: { stat: "spellPower", target: 6 }, success: { nextStamina: 2 } },
  { name: "보물 상자", description: "열쇠도 없이 열리는 신기한 상자!", success: { spellbookTokens: 3 } },
];

export function explorationTemplates(): Omit<ExplorationCard, "id">[] {
  return DEFS.map((d) => ({ ...d, failure: d.failure ?? {} }));
}

const STAT_NAME = { intelligence: "지력", stamina: "체력", charm: "매력", spellPower: "주문력" } as const;

export function describeEffect(e: CardEffect): string {
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(e.stats ?? {})) parts.push(`${STAT_NAME[k as keyof typeof STAT_NAME]} 영구 ${sign(v)}`);
  for (const [k, v] of Object.entries(e.tempStats ?? {})) parts.push(`${STAT_NAME[k as keyof typeof STAT_NAME]} 임시 ${sign(v)}`);
  if (e.credit) parts.push(`학점 ${sign(e.credit)}`);
  if (e.spellbookTokens) parts.push(`마법 주문서 ${sign(e.spellbookTokens)}`);
  if (e.nextStamina) parts.push(`다음 달 체력토큰 ${sign(e.nextStamina)}`);
  return parts.length ? parts.join(", ") : "아무 일도 없었어요";
}
