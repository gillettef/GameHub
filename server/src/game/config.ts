// 플레이테스트 중 조정할 밸런스 수치 모음 (notes/기획_정리.md 8절의 "플레이테스트 후 조정" 항목).
// 값을 바꾸면 엔진 전체에 반영되며, 시뮬레이션 스크립트(server/scripts/simulate.ts)가 이 객체를 직접 바꿔 비교합니다.
// 카드 종류별 수치(수업/장비/탐험/마도서/마법생물)는 각 *Cards.ts / creatures.ts에서 조정합니다.
import type { ActivityId, StatKey } from "./types.js";

export const BALANCE = {
  // 라운드 구조 — 기획 확정값(12라운드, 6라운드 후 중간고사). 바꾸면 클라이언트 표시(12/12)와도 맞춰야 함
  totalRounds: 12,
  midtermRound: 6,
  // 시험 카드 공개 시점: 이 라운드가 끝난 뒤 다음 시험(중간고사·기말고사)의 카드를 모두에게 공개한다
  midtermRevealRound: 3,
  finalRevealRound: 9,
  // 게임 시작 능력치 (2026-09-30 변경: 전원 2, 학점 0)
  initialStats: { intelligence: 2, stamina: 2, charm: 2, spellPower: 2 } as Record<StatKey, number>,
  initialCredit: 0,
  // 마법 토너먼트: 최종 순위 보상 (1위, 2위 순서). 트랙에는 상한이 없다
  tournamentRewards: [2, 1],
  // 마법 토너먼트는 주문력 수치만큼 굴린 주사위 합만큼 전진한다. 이정표: 참가해서 트랙이 milestoneStep칸을 넘을 때마다 학점 milestoneCredit을 바로 받는다 (다른 사람과 경쟁하지 않는 보상)
  tournamentMilestoneStep: 100,
  tournamentMilestoneCredit: 1,
  // 시험 순위별 학점 (1위, 2위, 그 이하는 마지막 값)
  examCredits: [3, 2, 1],
  // 2주차(정규수업): 인원수 + classMarketExtra 장을 공개하고, 지력 높은 순으로 1장씩 가져간다. 수업카드 덱은 인원 × classDeckPerPlayer 장
  classMarketExtra: 1,
  classDeckPerPlayer: 14,
  // 3주차 구역(비밀의 방·마법생물·주문 대결·연구실)에서 처음 들어온 사람이 여는 카드 수 (집중이나 특정 카드로 달라질 수 있다)
  activityOpenCount: 2,
  // 최종 점수 = 주문력 × 학점 + 마법생물 세트(하늘·육지·바다 1장씩) 수 × creatureSetScore (기획 검토 중: 3점 또는 5점)
  creatureSetScore: 5,
  // 판정 목표값 = 주사위 평균(3.5) × 그 달의 기준 능력치 × 난이도. 기준 능력치는 rollBenchmarkStart에서 매달 rollBenchmarkPerRound씩 오른다
  // (성장이 기준보다 앞서면 쉽고 뒤처지면 어렵다). 탐험·협력 탐험 카드는 카드마다 난이도가 정해져 있다
  rollBenchmarkStart: 2,
  rollBenchmarkPerRound: 0.5,
  // 마법생물 조련: 가진 주문서를 모두 내고 낸 개수만큼 주사위를 굴려 (합 + 생물별 능력치 보너스)가 3.5 × 요구 주문서 × creatureDifficulty 이상이면 성공
  creatureDifficulty: 0.8,
  // 연구실 실험: 지력토큰을 모두 내고 낸 개수만큼(최소 1개) 주사위를 굴려 합이 이 값 이상이면 성공 (안정적인 능력치 상향)
  labTarget: 2,
  // 탐험 카드 목표값 배율 (1이면 카드에 적힌 난이도 그대로)
  exploreDifficultyScale: 1.25,
  // 주문력 수업카드가 다른 능력치 카드보다 더 드는 습득 체력토큰
  spellClassExtraCost: 5,
  // 탐험 역전 보너스: 선두와의 성장 점수(능력치 합 + 학점×3) 격차가 이 값 이상이면 판정에 보너스를 더한다
  catchUpGap: 4,
  catchUpBonus: 2,
  // 주문 대결을 건 도전자가 지목당한 플레이어에게 건네는 매력 (결과와 상관없이 지불)
  duelCharmFee: 1,
  // 자율활동 구역 하나에 들어갈 수 있는 최대 인원, 그리고 이미 한 명이 들어와 있는 구역에 두 번째로 들어갈 때 내는 매력토큰 (1주차에 매력 수치만큼 받는다)
  activityMaxParticipants: 2,
  activitySecondParticipantCost: 1,
  // 카드를 한 장 열 때 드는 지력토큰: 수업카드뿐 아니라 자율활동에서 카드를 열 때(마법생물 조련·비밀의 방 탐색·연구실 실험)도 똑같이 낸다.
  // 카드를 습득하는 데 드는 체력토큰은 카드마다 정해져 있다 (수업카드 takeCost, 연구 카드 cost)
  openCardCost: 1,
  // 위 지력토큰이 드는 활동. 2026-09-30: 모든 구역에서 카드를 열 때 지력토큰이 들지 않는다 (빈 배열). 지력토큰의 새 역할은 검토 중
  openCardCostActivities: [] as ActivityId[],
};

export function examCreditForRank(rank: number): number {
  const credits = BALANCE.examCredits;
  return credits[Math.min(rank, credits.length) - 1];
}
