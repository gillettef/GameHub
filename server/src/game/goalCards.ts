// 공모전 4.5점 개선 실험 카드 (notes/기획_정리.md 56절). 설정(config.ts)으로 켰을 때만 쓴다.
//   장래희망 카드(B2): 학생마다 꿈이 하나. 졸업할 때 카드의 두 능력치가 모두 기준 이상이면 학점을 더 받는다
//   올해의 특별상(B3): 판마다 공개되는 추가 졸업식 부문
//   대회 카드(C1): 반짝 마법 경연을 다른 구역처럼 "기운으로 굴려 목표를 넘으면 성공"으로 바꾼다
// 이름과 수치는 초안이다. 대회 목표값은 56-4절에서 2씩 낮춘 값(성공률 약 78%)을 그대로 인쇄한다.
import type { AwardCategory, DreamCard, SpecialAwardId, TournamentCard } from "./types.js";

export const DREAM_CARDS: Omit<DreamCard, "id">[] = [
  { name: "마법 기사", description: "튼튼한 몸과 강한 주문으로 모두를 지키고 싶어요.", stats: ["stamina", "spellPower"] },
  { name: "대마법사", description: "세상의 모든 주문을 알고 싶어요.", stats: ["intelligence", "spellPower"] },
  { name: "유적 탐험가", description: "지도에 없는 곳까지 걸어서 가 볼 거예요.", stats: ["intelligence", "stamina"] },
  { name: "마법생물 박사", description: "모든 마법생물의 이야기를 책으로 쓰고 싶어요.", stats: ["intelligence", "charm"] },
  { name: "드래곤 라이더", description: "용과 친구가 되어 하늘을 달리고 싶어요.", stats: ["stamina", "charm"] },
  { name: "마법 아이돌", description: "반짝이는 마법 무대로 모두를 웃게 하고 싶어요.", stats: ["charm", "spellPower"] },
];

export const SPECIAL_AWARDS: SpecialAwardId[] = ["charm", "allround", "explorer", "researcher", "duelist", "scholar", "champion"];

export const SPECIAL_AWARD_NAME: Record<SpecialAwardId, string> = {
  charm: "인기상",
  allround: "만능상",
  explorer: "탐험왕",
  researcher: "연구왕",
  duelist: "겨루기왕",
  scholar: "시험왕",
  champion: "대회왕",
};
export const SPECIAL_AWARD_SUBJECT: Record<SpecialAwardId, string> = {
  charm: "매력",
  allround: "가장 낮은 능력치",
  explorer: "탐험 성공",
  researcher: "연구 성공",
  duelist: "마법 겨루기 승리",
  scholar: "시험 점수 합",
  champion: "마법 경연",
};

export const isSpecialAward = (c: AwardCategory): c is SpecialAwardId => (SPECIAL_AWARDS as string[]).includes(c);

const T = (name: string, description: string, target: number, reward: TournamentCard["reward"]): Omit<TournamentCard, "id"> => ({ name, description, target, reward });

export const TOURNAMENT_CARDS: Omit<TournamentCard, "id">[] = [
  // 작은 대회 (목표 2): 성공하면 성장, 보상은 기운 조금
  T("새내기 주문 퀴즈", "선생님이 내는 주문 퀴즈를 맞혀요.", 2, { tokens: { intelligence: 1 } }),
  T("빗자루 이어달리기", "반 친구들과 빗자루로 이어 달려요.", 2, { tokens: { stamina: 1 } }),
  T("꽃 피우기 마법 대회", "누가 가장 예쁜 꽃을 피울까요?", 2, { tokens: { charm: 1 } }),
  // 도전 대회 (목표 3~4): 학점이나 마나기운
  T("주문 낭독 대회", "긴 주문을 한 번도 틀리지 않고 외워요.", 3, { tokens: { mana: 2 } }),
  T("마법 요리 경연", "반짝반짝 빛나는 케이크를 구워요.", 3, { tokens: { mana: 1, stamina: 1 } }),
  T("마법 체스 대회", "말들이 스스로 움직이는 체스예요.", 3, { tokens: { mana: 1, intelligence: 1 } }),
  T("불꽃놀이 마법 쇼", "밤하늘에 가장 멋진 불꽃을 그려요.", 4, { credit: 1 }),
  T("구름 미로 레이스", "구름 사이 미로를 가장 먼저 빠져나와요.", 4, { credit: 1 }),
  // 큰 대회 (목표 5~6): 학점을 크게
  T("전교 마법 대항전", "학년 대표로 무대에 섰어요!", 5, { credit: 2 }),
  T("별빛 마법 경연", "별빛으로 그림을 그리는 경연이에요.", 5, { credit: 1, tokens: { mana: 2 } }),
  T("왕국 청소년 마법 대회", "왕국의 모든 학교가 모였어요!", 6, { credit: 3 }),
  T("달빛 결승전", "보름달 아래에서 열리는 결승전이에요.", 6, { credit: 2, tokens: { mana: 2 } }),
];
