// 장비카드 (연구실 실험). 효과는 "다음 시험(중간/기말고사)까지 유지되는 임시 능력치 증가"이며,
// 시험이 끝나면 카드는 버림 더미로 돌아갑니다. 학점 소량 지급 카드 2종 포함 (기획 6-4).
// 카드 구성과 수치는 초안이며 플레이테스트 후 조정합니다. 16종×2장 + 학점 카드 2종×1장 = 34장.
import type { EquipmentCard } from "./types.js";

type Def = { name: string; description: string; tempBoosts: EquipmentCard["tempBoosts"]; credit?: number; copies: number };

const DEFS: Def[] = [
  // 능력치 하나 +2
  { name: "마법 안경", description: "글씨가 또렷또렷 보여요.", tempBoosts: { intelligence: 2 }, copies: 2 },
  { name: "지혜의 깃펜", description: "쓰기만 해도 답이 떠올라요.", tempBoosts: { intelligence: 2 }, copies: 2 },
  { name: "튼튼 부츠", description: "아무리 걸어도 안 아파요.", tempBoosts: { stamina: 2 }, copies: 2 },
  { name: "마법 물병", description: "한 모금에 힘이 솟아요.", tempBoosts: { stamina: 2 }, copies: 2 },
  { name: "반짝 브로치", description: "달고 다니면 눈길이 쏙!", tempBoosts: { charm: 2 }, copies: 2 },
  { name: "별무늬 망토", description: "휘날리는 망토가 멋져요.", tempBoosts: { charm: 2 }, copies: 2 },
  { name: "수정 지팡이", description: "끝에서 반짝이는 마력이 나와요.", tempBoosts: { spellPower: 2 }, copies: 2 },
  { name: "마법 반지", description: "손가락에서 따뜻한 마력이 흘러요.", tempBoosts: { spellPower: 2 }, copies: 2 },
  // 능력치 둘 +1/+1
  { name: "마법사 모자", description: "뾰족모자를 쓰면 똑똑해지고 멋져져요.", tempBoosts: { intelligence: 1, charm: 1 }, copies: 2 },
  { name: "견습 로브", description: "포근하고 마력이 스며드는 로브.", tempBoosts: { stamina: 1, spellPower: 1 }, copies: 2 },
  { name: "가죽 가방", description: "책도 간식도 가득 넣을 수 있어요.", tempBoosts: { intelligence: 1, stamina: 1 }, copies: 2 },
  { name: "요정 리본", description: "요정이 달아 준 반짝이 리본.", tempBoosts: { charm: 1, spellPower: 1 }, copies: 2 },
  { name: "별빛 목걸이", description: "목에 걸면 머리가 맑아져요.", tempBoosts: { intelligence: 1, spellPower: 1 }, copies: 2 },
  { name: "꽃 화관", description: "향긋해서 기운도 나고 예뻐요.", tempBoosts: { stamina: 1, charm: 1 }, copies: 2 },
  // 능력치 하나 +3 (귀한 장비)
  { name: "고대의 두루마리", description: "잊힌 지식이 술술 읽혀요.", tempBoosts: { intelligence: 3 }, copies: 2 },
  { name: "용의 심장 조각", description: "손에 쥐면 마력이 넘쳐흘러요.", tempBoosts: { spellPower: 3 }, copies: 2 },
  // 학점 +1 (소량 학점 경로)
  { name: "우등생 배지", description: "선생님이 달아 주신 반짝 배지.", tempBoosts: {}, credit: 1, copies: 1 },
  { name: "장학금 봉투", description: "열어 보니 학점 도장이 가득!", tempBoosts: {}, credit: 1, copies: 1 },
];

export function equipmentTemplates(): Omit<EquipmentCard, "id">[] {
  return DEFS.flatMap(({ copies, ...card }) => Array.from({ length: copies }, () => ({ ...card })));
}
