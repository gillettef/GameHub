// 탐험카드 (비밀의 방 탐색, 단독 처리). 지력 또는 체력 수치만큼 주사위를 굴려 합이 목표값 이상이면 성공, 아니면 실패 효과를 받습니다.
// target은 난이도 × 10 (10이 표준 난이도)이고 실제 목표값은 engine의 rollTarget이 라운드에 맞춰 계산합니다.
// 판정이 없는 카드는 무조건 성공합니다. 토큰은 그 달 안에 쓸 데가 없어 "다음 달 체력토큰/마법 주문서"로 지급/차감합니다.
// 탐험은 가장 하이리스크 하이리턴인 활동입니다 — 한방 카드(6장)는 성공 보상이 크고 실패 손해도 크며, 뒤처진 플레이어의 역전 수단입니다.
// 협력 카드(5장)는 두 명이 함께해야 열리고 보상/손해가 두 명 모두에게 적용됩니다. 끝까지 함께할 친구가 없으면 무효입니다.
// 카드 구성과 수치는 초안이며 플레이테스트 후 조정합니다. 25장.
import type { CardEffect, ExplorationCard } from "./types.js";

type Def = Omit<ExplorationCard, "id" | "failure"> & { failure?: CardEffect };

const DEFS: Def[] = [
  // ── 한방 카드 (목표값 10~12): 성공하면 크게 벌지만 실패하면 아프다. 뒤처졌을 때의 역전 기회 ──
  { name: "용의 보물창고", description: "잠든 용 곁에 반짝이는 학점 도장이 산더미예요!", check: { stat: "stamina", target: 12 }, success: { credit: 2, stats: { spellPower: 1 } }, failure: { nextStamina: -2, nextSpellbook: -2 } },
  { name: "전설의 도서관", description: "닫힌 문 너머에 전설의 책이 잠들어 있어요.", check: { stat: "intelligence", target: 12 }, success: { credit: 1, stats: { intelligence: 2 } }, failure: { nextStamina: -2 } },
  { name: "거인의 씨름장", description: "거인이 팔씨름을 걸어와요. 이기면 대박!", check: { stat: "stamina", target: 11 }, success: { stats: { stamina: 2, spellPower: 1 } }, failure: { tempStats: { stamina: -1 }, nextStamina: -2 } },
  { name: "별들의 무도회", description: "별들이 춤추는 무도회에 초대받았어요.", check: { stat: "stamina", target: 11 }, success: { stats: { charm: 2 }, nextStamina: 2 }, failure: { tempStats: { charm: -1 } } },
  { name: "잊혀진 교실", description: "칠판에 풀리지 않은 문제가 남아 있어요.", check: { stat: "intelligence", target: 10 }, success: { credit: 1 }, failure: { nextStamina: -1 } },
  { name: "황금 열쇠 구멍", description: "주문이 맞아야만 열리는 커다란 문이에요.", check: { stat: "intelligence", target: 10 }, success: { credit: 1 }, failure: { tempStats: { spellPower: -1 } } },
  // ── 도전 카드 (목표값 8~9): 성공하면 영구 성장, 실패하면 살짝 손해 ──
  { name: "먼지 쌓인 서고", description: "오래된 책 더미 사이에서 반짝이는 책 한 권을 찾았어요.", check: { stat: "intelligence", target: 8 }, success: { stats: { intelligence: 1 }, nextSpellbook: 1 }, failure: { nextStamina: -1 } },
  { name: "속삭이는 갑옷", description: "빈 갑옷이 팔씨름을 걸어와요!", check: { stat: "stamina", target: 8 }, success: { stats: { stamina: 1 }, nextSpellbook: 1 }, failure: { nextStamina: -1 } },
  { name: "거울의 방", description: "거울 속 내가 손을 흔들어요.", check: { stat: "intelligence", target: 8 }, success: { stats: { charm: 1 }, nextSpellbook: 1 }, failure: { nextStamina: -1 } },
  { name: "잠자는 마법진", description: "바닥의 마법진이 희미하게 빛나요.", check: { stat: "intelligence", target: 8 }, success: { stats: { spellPower: 1 }, nextSpellbook: 1 }, failure: { nextStamina: -1 } },
  { name: "그림자 미로", description: "길이 자꾸 바뀌는 어두운 미로예요.", check: { stat: "stamina", target: 9 }, success: { stats: { spellPower: 1 }, nextSpellbook: 2 }, failure: { nextStamina: -2 } },
  { name: "무너진 탑 꼭대기", description: "높은 곳에 마력 덩어리가 놓여 있어요.", check: { stat: "stamina", target: 9 }, success: { stats: { spellPower: 1, stamina: 1 } }, failure: { nextSpellbook: -1 } },
  { name: "수상한 물약 병", description: "보글보글 무지갯빛 물약, 마셔 볼까요?", check: { stat: "intelligence", target: 8 }, success: { tempStats: { spellPower: 3 } }, failure: { nextStamina: -1 } },
  { name: "오래된 지도", description: "귀퉁이가 닳은 보물 지도를 발견했어요.", check: { stat: "intelligence", target: 9 }, success: { nextSpellbook: 3, tempStats: { intelligence: 2 } }, failure: {} },
  // ── 가벼운 카드 (목표값 6~7): 성공 보상은 작고 실패해도 괜찮다 ──
  { name: "말하는 그림", description: "초상화가 자기 이야기를 들어 달래요.", check: { stat: "intelligence", target: 6 }, success: { tempStats: { charm: 2 } }, failure: {} },
  { name: "요정들의 티 파티", description: "작은 요정들이 자리에 초대해 줬어요.", check: { stat: "stamina", target: 7 }, success: { stats: { charm: 1 }, nextStamina: 1 }, failure: {} },
  { name: "비밀 계단", description: "벽 뒤로 좁은 계단이 이어져요.", check: { stat: "stamina", target: 6 }, success: { nextSpellbook: 3 }, failure: {} },
  { name: "꼬마 유령의 부탁", description: "꼬마 유령이 잃어버린 인형을 찾아 달래요.", check: { stat: "stamina", target: 6 }, success: { stats: { intelligence: 1 } }, failure: {} },
  // ── 협력 카드 (5장): 두 명이 함께해야 열린다. 둘의 (주사위 + 능력치) 합이 목표값 이상이면 둘 다 보상을 받는다.
  //    함께할 친구가 없으면 무효가 된다 ──
  { name: "쌍둥이 열쇠 구멍", description: "열쇠 구멍이 두 개! 동시에 돌려야 열려요.", coop: { stat: "intelligence", pairTarget: 13 }, success: { stats: { intelligence: 1 }, nextSpellbook: 2 } },
  { name: "무거운 돌문", description: "혼자서는 꿈쩍도 안 해요. 함께 밀어 봐요!", coop: { stat: "stamina", pairTarget: 13 }, success: { stats: { stamina: 1 }, nextSpellbook: 2 }, failure: { nextStamina: -1 } },
  { name: "이중창 합주", description: "두 사람의 목소리가 어우러져야 문이 열려요.", coop: { stat: "stamina", pairTarget: 12 }, success: { stats: { charm: 1 }, nextStamina: 2 } },
  { name: "쌍둥이 마법진", description: "마주 보는 두 마법진에 동시에 마력을 불어넣어요.", coop: { stat: "intelligence", pairTarget: 14 }, success: { stats: { spellPower: 1 }, nextSpellbook: 1 }, failure: { nextStamina: -1 } },
  { name: "용의 알 부화", description: "커다란 알이 흔들려요. 둘이 힘을 합쳐 따뜻하게 품어 줘요!", coop: { stat: "stamina", pairTarget: 17 }, success: { credit: 1, stats: { spellPower: 1 } }, failure: { nextStamina: -2 } },
  // ── 안전 카드 (판정 없음) ──
  { name: "몰래 열린 간식 창고", description: "쿠키 향이 솔솔 나요. 살금살금 하나 집어 먹었어요.", success: { nextStamina: 2 } },
  { name: "반짝이는 버섯 숲", description: "발광 버섯이 가득한 포근한 숲이에요.", success: { tempStats: { stamina: 1 }, nextStamina: 1 } },
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
  if (e.nextSpellbook) parts.push(`다음 달 마법 주문서 ${sign(e.nextSpellbook)}`);
  if (e.nextStamina) parts.push(`다음 달 체력토큰 ${sign(e.nextStamina)}`);
  if (e.peekExploration) parts.push("탐험 카드 덱 맨 위 1장 엿보기");
  return parts.length ? parts.join(", ") : "아무 일도 없었어요";
}
