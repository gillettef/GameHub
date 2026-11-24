// 탐험카드 (별빛 다락방 탐험, 단독 처리). 지력 또는 체력 수치만큼 주사위를 굴려 합이 목표값 이상이면 성공, 아니면 실패 효과를 받습니다.
// target은 카드에 인쇄하는 목표값 그대로입니다 (59절 L4에서 굴림 상한 +1과 함께 모두 +2. 52-9절: 예전에는 난이도 × 10을 적고 달마다 목표가 올랐다. 지금 값은 그때의 기준 1.6 × 배율 1.15로 고정한 것).
// 판정이 없는 카드는 무조건 성공합니다. 기운은 바로 받거나 잃습니다(0 아래로는 내려가지 않음, 51절에서 "다음 달 기운"·임시 능력치를 없앴다).
// 탐험은 가장 하이리스크 하이리턴인 활동입니다 — 한방 카드(6장)는 성공 보상이 크고 실패 손해도 크며, 뒤처진 플레이어의 역전 수단입니다.
// 카드 구성과 수치는 초안이며 플레이테스트 후 조정합니다. 20장.
import type { CardEffect, ExplorationCard } from "./types.js";

type Def = Omit<ExplorationCard, "id" | "failure"> & { failure?: CardEffect };

const DEFS: Def[] = [
  // ── 한방 카드 (목표값 6~8): 성공하면 크게 벌지만 실패하면 아프다. 뒤처졌을 때의 역전 기회 ──
  { name: "용의 보물창고", description: "잠든 용 곁에 반짝이는 학점 도장이 산더미예요!", check: { stat: "stamina", target: 10 }, success: { credit: 2, stats: { spellPower: 1 } }, failure: { tokens: { mana: -2, stamina: -2 } } },
  { name: "전설의 도서관", description: "닫힌 문 너머에 전설의 책이 잠들어 있어요.", check: { stat: "intelligence", target: 10 }, success: { credit: 1, stats: { intelligence: 2 } }, failure: { tokens: { stamina: -2 } } },
  { name: "거인의 씨름장", description: "거인이 팔씨름을 걸어와요. 이기면 대박!", check: { stat: "stamina", target: 9 }, success: { stats: { stamina: 2, spellPower: 1 } }, failure: { tokens: { stamina: -3 } } },
  { name: "별들의 무도회", description: "별들이 춤추는 무도회에 초대받았어요.", check: { stat: "stamina", target: 9 }, success: { tokens: { stamina: 2 }, stats: { charm: 2 } }, failure: { tokens: { charm: -1 } } },
  { name: "잊혀진 교실", description: "칠판에 풀리지 않은 문제가 남아 있어요.", check: { stat: "intelligence", target: 8 }, success: { credit: 1 }, failure: { tokens: { stamina: -1 } } },
  // ── 도전 카드 (목표값 5~6): 성공하면 영구 성장, 실패하면 살짝 손해 ──
  { name: "먼지 쌓인 서고", description: "오래된 책 더미 사이에서 반짝이는 책 한 권을 찾았어요.", check: { stat: "intelligence", target: 7 }, success: { tokens: { mana: 1 }, stats: { intelligence: 1 } }, failure: { tokens: { stamina: -1 } } },
  { name: "속삭이는 갑옷", description: "빈 갑옷이 팔씨름을 걸어와요!", check: { stat: "stamina", target: 7 }, success: { tokens: { mana: 1 }, stats: { stamina: 1 } }, failure: { tokens: { stamina: -1 } } },
  { name: "거울의 방", description: "거울 속 내가 손을 흔들어요.", check: { stat: "intelligence", target: 7 }, success: { tokens: { mana: 1 }, stats: { charm: 1 } }, failure: { tokens: { stamina: -1 } } },
  { name: "잠자는 마법진", description: "바닥의 마법진이 희미하게 빛나요.", check: { stat: "intelligence", target: 7 }, success: { tokens: { mana: 1 }, stats: { spellPower: 1 } }, failure: { tokens: { stamina: -1 } } },
  { name: "그림자 미로", description: "길이 자꾸 바뀌는 어두운 미로예요.", check: { stat: "stamina", target: 8 }, success: { tokens: { mana: 2 }, stats: { spellPower: 1 } }, failure: { tokens: { stamina: -2 } } },
  { name: "무너진 탑 꼭대기", description: "높은 곳에 마력 덩어리가 놓여 있어요.", check: { stat: "stamina", target: 8 }, success: { stats: { spellPower: 1, stamina: 1 } }, failure: { tokens: { mana: -1 } } },
  { name: "오래된 지도", description: "귀퉁이가 닳은 보물 지도를 발견했어요.", check: { stat: "intelligence", target: 8 }, success: { tokens: { intelligence: 2, mana: 3 } }, failure: {} },
  // ── 가벼운 카드 (목표값 4~5): 성공 보상은 작고 실패해도 괜찮다 ──
  { name: "말하는 그림", description: "초상화가 자기 이야기를 들어 달래요.", check: { stat: "intelligence", target: 6 }, success: { tokens: { charm: 2 } }, failure: {} },
  { name: "요정들의 티 파티", description: "작은 요정들이 자리에 초대해 줬어요.", check: { stat: "stamina", target: 7 }, success: { tokens: { stamina: 1 }, stats: { charm: 1 } }, failure: {} },
  { name: "비밀 계단", description: "벽 뒤로 좁은 계단이 이어져요.", check: { stat: "stamina", target: 6 }, success: { tokens: { mana: 3 } }, failure: {} },
  { name: "꼬마 유령의 부탁", description: "꼬마 유령이 잃어버린 인형을 찾아 달래요.", check: { stat: "stamina", target: 6 }, success: { stats: { intelligence: 1 } }, failure: {} },
  // ── 안전 카드 (판정 없음) ──
];

export function explorationTemplates(): Omit<ExplorationCard, "id">[] {
  return DEFS.map((d) => ({ ...d, failure: d.failure ?? {} }));
}

const STAT_NAME = { intelligence: "지력", stamina: "체력", charm: "매력", spellPower: "주문력" } as const;

export function describeEffect(e: CardEffect): string {
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const parts: string[] = [];
  const TOKEN = { intelligence: "지력기운", stamina: "체력기운", charm: "매력기운", mana: "마나기운" } as const;
  for (const [k, v] of Object.entries(e.tokens ?? {})) parts.push(`${TOKEN[k as keyof typeof TOKEN]} ${sign(v)}`);
  for (const [k, v] of Object.entries(e.stats ?? {})) parts.push(`${STAT_NAME[k as keyof typeof STAT_NAME]} 영구 ${sign(v)}`);
  for (const [k, v] of Object.entries(e.tempStats ?? {})) parts.push(`${STAT_NAME[k as keyof typeof STAT_NAME]} 임시 ${sign(v)}`);
  if (e.credit) parts.push(`학점 ${sign(e.credit)}`);
  if (e.nextMana) parts.push(`다음 달 마나기운 ${sign(e.nextMana)}`);
  if (e.nextStamina) parts.push(`다음 달 체력기운 ${sign(e.nextStamina)}`);
  if (e.peekExploration) parts.push("탐험 카드 덱 맨 위 1장 엿보기");
  return parts.length ? parts.join(", ") : "아무 일도 없었어요";
}
