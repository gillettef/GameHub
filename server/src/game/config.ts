// 플레이테스트 중 조정할 밸런스 수치 모음 (notes/기획_정리.md 8절의 "플레이테스트 후 조정" 항목).
// 값을 바꾸면 엔진 전체에 반영되며, 시뮬레이션 스크립트(server/scripts/simulate.ts)가 이 객체를 직접 바꿔 비교합니다.
// 카드 종류별 수치(수업/장비/탐험/마도서/마법생물)는 각 *Cards.ts / creatures.ts에서 조정합니다.
import type { StatKey } from "./types.js";

export const BALANCE = {
  // 라운드 구조 — 기획 확정값(12라운드, 6라운드 후 중간고사). 바꾸면 클라이언트 표시(12/12)와도 맞춰야 함
  totalRounds: 12,
  midtermRound: 6,
  // 게임 시작 능력치 (11-2의 임시안: 전원 1, 학점 0)
  initialStats: { intelligence: 1, stamina: 1, charm: 1, spellPower: 1 } as Record<StatKey, number>,
  initialCredit: 0,
  // 마법 토너먼트: 트랙 길이와 최종 순위 보상 (1위, 2위 순서)
  tournamentMaxTrack: 10,
  tournamentRewards: [2, 1],
  // 시험 순위별 학점 (1위, 2위, 그 이하는 마지막 값)
  examCredits: [3, 2, 1],
  // 연구실 실험에서 지력만큼 펼치는 연구 카드의 최대 장수
  labMaxCandidates: 3,
  // 마법생물 유형 모으기 학점 (세븐원더스 과학 카드 방식): 점수 = Σ(속성별 장수²) + 세트보너스 × 가장 적은 속성 장수,
  // 학점 = floor(점수 / 나누는 수). 새 카드를 얻을 때 늘어난 학점을 즉시 받는다
  creatureSetBonus: 5,
  creatureScoreDivisor: 5,
  // 탐험 역전 보너스: 선두와의 성장 점수(능력치 합 + 학점×3) 격차가 이 값 이상이면 판정에 보너스를 더한다
  catchUpGap: 4,
  catchUpBonus: 2,
  // 주문 대결에서 패자가 잃는 마법 주문서 수
  duelLoserTokenLoss: 1,
  // 주문 대결을 건 도전자가 지목당한 플레이어에게 건네는 매력 (결과와 상관없이 지불)
  duelCharmFee: 1,
  // 자율활동 구역 하나에 들어갈 수 있는 최대 인원, 그리고 이미 한 명이 들어와 있는 구역에 두 번째로 들어갈 때 내는 체력토큰
  activityMaxParticipants: 2,
  activitySecondParticipantCost: 1,
  // 수업카드 등급별 비용: 카드를 열 때 지력토큰(open), 습득할 때 체력토큰(take)을 낸다
  classCardCosts: {
    normal: { open: 1, take: 1 },
    rare: { open: 2, take: 2 },
  } as Record<"normal" | "rare", { open: number; take: number }>,
};

export function examCreditForRank(rank: number): number {
  const credits = BALANCE.examCredits;
  return credits[Math.min(rank, credits.length) - 1];
}
