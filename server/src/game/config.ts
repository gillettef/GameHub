// 플레이테스트 중 조정할 밸런스 수치 모음 (notes/기획_정리.md 8절의 "플레이테스트 후 조정" 항목).
// 값을 바꾸면 엔진 전체에 반영되며, 시뮬레이션 스크립트(server/scripts/simulate.ts)가 이 객체를 직접 바꿔 비교합니다.
// 카드 종류별 수치(수업/장비/탐험/마도서/마법생물)는 각 *Cards.ts / creatures.ts에서 조정합니다.
import type { ActivityId, AwardCategory, KeptToken, StatKey } from "./types.js";

export const BALANCE = {
  // 라운드 구조 — 기획 확정값(12라운드, 6라운드 후 중간고사). 바꾸면 클라이언트 표시(12/12)와도 맞춰야 함
  totalRounds: 12,
  midtermRound: 6,
  // 시험 공고(44절): 이 라운드의 1주차 학교 소식으로 다음 시험(중간고사·기말고사)의 카드를 모두에게 공개한다 (예전 "3·9라운드가 끝난 뒤"와 같은 시점)
  midtermNoticeRound: 4,
  finalNoticeRound: 10,
  // 1주차 학교 소식의 행사 카드(44절). false면 행사 대신 효과 없는 "평범한 한 달"이 나온다 (시험 공고·시험 주간은 그대로. 비교·검증용)
  schoolNewsEvents: true,
  // 게임 시작 능력치 (2026-10-06 변경: 전원 1, 학점 0 — 수치 전반을 낮춤, 43절)
  initialStats: { intelligence: 1, stamina: 1, charm: 1, spellPower: 1 } as Record<StatKey, number>,
  initialCredit: 0,
  // 마법 토너먼트: 최종 순위 보상 (1위, 2위 순서). 트랙에는 상한이 없다
  tournamentRewards: [4, 2],
  // 마법 토너먼트는 주문력 수치만큼 굴린 주사위 합만큼 전진한다. 이정표: 참가해서 트랙이 milestoneStep칸을 넘을 때마다 학점 milestoneCredit을 바로 받는다 (다른 사람과 경쟁하지 않는 보상)
  tournamentMilestoneStep: 70,
  tournamentMilestoneCredit: 1,
  // 다음 달 선 결정 규칙 (4주차에 판정, 2026-10-01 기본값을 charmTokens로 변경): "charm" 매력 수치가 가장 높은 친구(현재 선이 최고면 유지) / "charmTokens" 남은 매력기운이 가장 많은 친구 /
  // "charmPlusTokens" 매력 + 남은 매력기운 / "rotate" 단순 시계방향 (비교용). 동점이면 현재 선에서 시계방향으로 가까운 친구
  starterRule: "charmTokens" as "charm" | "charmTokens" | "charmPlusTokens" | "rotate",
  // 시험 순위별 학점 (1위, 2위, 그 이하는 마지막 값)
  examCredits: [3, 2, 1],
  // 2주차(정규수업): 인원수 + classMarketExtra 장을 공개하고, 선부터 시계방향으로 1장씩 가져간다.
  // 수업카드 덱은 학기마다 하나씩(1학기 덱 → 중간고사 뒤 2학기 덱으로 교체, 남은 카드는 버림) 인원과 무관하게 classDeckSize 장
  classMarketExtra: 1,
  classDeckSize: 36,
  // 학기별 수업카드 구성: statWeights = 덱 안 과목(능력치)별 비율. 1학기는 지력·체력·매력 위주(주문력 과목은 소수), 2학기는 주문력 과목이 늘어난다
  classSemesters: [
    { statWeights: { intelligence: 3, stamina: 3, charm: 3, spellPower: 1 } as Record<StatKey, number> },
    { statWeights: { intelligence: 3, stamina: 3, charm: 2, spellPower: 2 } as Record<StatKey, number> },
  ],
  // 수업카드 4단계 (43-4절): 입문 +1 · 기초 +2 · 중급 +3 · 심화 +5. 중급·심화는 그 과목 능력치가 minStat 이상이어야 들을 수 있다 (선수과목).
  classTiers: {
    intro: { gain: 1 },
    basic: { gain: 2 },
    mid: { gain: 3, minStat: 2 },
    advanced: { gain: 5, minStat: 3 },
  } as Record<"intro" | "basic" | "mid" | "advanced", { gain: number; minStat?: number }>,
  // 성장 (42절): 자율활동에서 성과를 내면 그 활동의 주 능력치가 growthAmount만큼 오른다 (조련·탐험·연구실은 성공, 주문 대결은 승리, 토너먼트는 성장 없음)
  growthAmount: 1,
  growthActivities: { tournament: false, creature: true, duel: true, exploration: true, lab: true } as Record<ActivityId, boolean>,
  // 3주차 구역(비밀의 방·마법생물·주문 대결·연구실)에서 처음 들어온 사람이 여는 카드 수 (집중이나 특정 카드로 달라질 수 있다)
  activityOpenCount: 2,
  // 최종 점수 = 졸업식 시상 점수의 합 (46절, 예전 "주문력 × 학점 + 마법생물 세트 + 부문상"을 대신한다).
  // 부문마다 값이 큰 순서로 순위를 매겨 rankPoints[순위-1]점을 준다 (동점은 같은 순위·같은 점수, 값이 0이면 점수 없음, 순위가 표 밖이면 0점).
  // 마법생물 부문의 값 = 마리 수 + 완성한 세트(하늘·육지·바다 1장씩) 수
  graduationCategories: ["spellPower", "credit", "intelligence", "stamina", "charm", "creature"] as AwardCategory[],
  rankPoints: [6, 3, 1],
  // 판정 목표값 = 주사위 평균(3.5) × 그 달의 기준 주사위 수 × 난이도. 기준 주사위 수(마나기운 개수)는 rollBenchmarkStart에서 매달 rollBenchmarkPerRound씩 오른다
  // (주문력이 기준보다 앞서면 쉽고 뒤처지면 어렵다). 탐험·협력 탐험 카드는 카드마다 난이도가 정해져 있다
  rollBenchmarkStart: 1.3,
  rollBenchmarkPerRound: 0.12,
  // 주문 대결 도전자가 지목당한 친구에게 건네는 마나기운 개수 (매력 참가비 duelCharmFee와 별도. 지목당해도 마나기운이 있어야 굴릴 수 있게 하는 장치)
  duelManaFee: 1,
  // 연구실 실험: 마나기운을 몇 개 낼지 골라 낸 개수만큼(마나기운이 없으면 공짜 1개) 주사위를 굴려 합이 이 값 이상이면 성공 (안정적인 능력치 상향)
  labTarget: 4,
  // 마법생물 조련 목표값 배율: 생물마다 정해진 trainTarget(creatures.ts)에 곱한다 (주사위가 마나기운 개수라 능력치 기운 때와 맞추기 위한 보정)
  trainTargetScale: 0.45,
  // 굴림 버튼의 기본 주사위 수 = 목표값 판정(조련·연구실·탐험)에서 성공 확률이 이 값 이상이 되는 가장 적은 마나기운 개수 (남는 마나기운은 다시 굴리기용).
  // 토너먼트·주문 대결·시험은 기본값이 마나기운 전부. 봇도 기본값 그대로 굴린다
  defaultDiceSuccess: 0.7,
  // 탐험 카드 목표값 배율 (1이면 카드에 적힌 난이도 그대로)
  exploreDifficultyScale: 1.1,
  // 탐험 역전 보너스: 선두와의 종합 점수(능력치 합 + 학점×3) 격차가 이 값 이상이면 판정에 보너스를 더한다
  catchUpGap: 4,
  catchUpBonus: 2,
  // 주문 대결을 건 도전자가 지목당한 플레이어에게 건네는 매력 (결과와 상관없이 지불)
  duelCharmFee: 1,
  // 자율활동 구역 하나에 들어갈 수 있는 최대 인원, 그리고 이미 한 명이 들어와 있는 구역에 두 번째로 들어갈 때 내는 매력기운 (먼저 들어온 친구에게 건넨다, 43-6절)
  activityMaxParticipants: 2,
  activitySecondParticipantCost: 1,
  // 카드를 한 장 열 때 드는 지력기운 (2026-10-02 38절에서 모든 구역 폐지 — 카드를 여는 건 지적 활동이 아니라서. 장치는 남겨 두고 openCardCostActivities만 비움).
  // 켜면 구역에 처음 들어온 사람이 카드를 열 때 낸다. 카드를 습득하는 데 드는 체력기운은 카드마다 정해져 있다 (수업카드 takeCost, 연구 카드 cost)
  openCardCost: 1,
  openCardCostActivities: [] as ActivityId[],
  // 능력치 × 활동 조화 (39절): 활동마다 주 능력치의 기운이 곧 그 활동의 주사위 재료다 ("내 매력만큼 주사위"). 마나기운(주문력)은 토너먼트·주문 대결과 다시 굴리기에만 쓴다.
  // 시험은 카드의 주 능력치 기운(주문력은 마나기운)으로 굴린다. 재료 기운이 없으면 어느 활동이든 공짜 주사위 1개
  // 기운을 모아 둘 수 있는 한도 = 능력치 × 이 배수 (40절). 0이면 한도가 없다 (43-5절, 2026-10-06 폐지: 대신 한 번에 낼 수 있는 기운이 능력치로 제한된다)
  energyCapMultiplier: 0,
  // 실력만큼만 힘을 낸다 (43-5절): 한 번 굴릴 때 낼 수 있는 재료 기운은 그 기운의 능력치 개수까지 (주문력 → 마나기운). 기운은 얼마든지 모아 둘 수 있다
  rollLimitByStat: true,
  // 주사위의 여섯 면 (46절). 기본은 1~6, "1이 세 면·2가 두 면·3이 한 면"([1,1,1,2,2,3])처럼 바꿔 운의 폭을 줄일 수 있다.
  // 판정 목표값(탐험·조련)은 주사위 평균에 맞춰 자동으로 바뀐다. 연구실 목표·토너먼트 이정표처럼 고정값인 수치는 따로 맞춘다
  dieFaces: [1, 2, 3, 4, 5, 6],
  // 기본 주사위 (47절 1안): 굴릴 때마다 기운과 상관없이 이만큼의 주사위를 공짜로 더 굴린다. 0보다 크면 재료 기운을 0개 내는 것도 된다
  baseDice: 0,
  // 실패 보상 (47절 2안): 마법생물·연구·탐험 카드에 실패했을 때, 주문 대결에서 졌을 때 그 활동의 재료 기운을 돌려받는다 (어려운 카드일수록 많이)
  failRewards: false,
  // 굴림 상한 = 능력치 + 이 값 (능력치 1인 초반에도 주사위 2개는 굴릴 수 있게 하는 여유)
  rollLimitBonus: 0,
  // 함께하면 든든 (43-6절): 마법생물·연구실 구역에 두 명이 함께 들어가면 둘 다 판정 목표값이 이만큼 낮아진다
  studyBuddyBonus: 1,
  rollFuel: { tournament: "mana", creature: "charm", duel: "mana", exploration: "stamina", lab: "intelligence" } as Record<ActivityId, KeptToken>,
  // 보조 능력치 (38-6절): 굴리기 전에 그 능력의 기운을 내서 주 판정을 돕는다.
  // 마법 토너먼트 — 체력(지구력): 체력기운 1개당 고정 칸 전진 (주사위가 아니라 고정값)
  tournamentStaminaBoost: 3,
  // 비밀의 방 탐험 — 지력(함정 간파): 지력기운 이 개수를 내면 실패해도 손해(실패 효과)를 받지 않는다 (성공하면 기운만 사라짐)
  explorationShieldCost: 1,
};

export function examCreditForRank(rank: number): number {
  const credits = BALANCE.examCredits;
  return credits[Math.min(rank, credits.length) - 1];
}
