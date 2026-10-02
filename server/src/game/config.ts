// 플레이테스트 중 조정할 밸런스 수치 모음 (notes/기획_정리.md 8절의 "플레이테스트 후 조정" 항목).
// 값을 바꾸면 엔진 전체에 반영되며, 시뮬레이션 스크립트(server/scripts/simulate.ts)가 이 객체를 직접 바꿔 비교합니다.
// 카드 종류별 수치(수업/장비/탐험/마도서/마법생물)는 각 *Cards.ts / creatures.ts에서 조정합니다.
import type { ActivityId, KeptToken, StatKey } from "./types.js";

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
  // 학기별 수업카드 구성: statWeights = 덱 안 능력치별 비율, spellExtraCost = 주문력 카드에 더해지는 습득 체력기운,
  // nonSpellCostCap = 주문력 외 카드의 습득 체력기운 상한. 1학기는 싸고 지력·체력·매력 위주(주문력은 소수), 2학기는 주문력 위주
  classSemesters: [
    { statWeights: { intelligence: 3, stamina: 3, charm: 3, spellPower: 1 } as Record<StatKey, number>, spellExtraCost: 5, nonSpellCostCap: 2 },
    { statWeights: { intelligence: 3, stamina: 3, charm: 2, spellPower: 2 } as Record<StatKey, number>, spellExtraCost: 9, nonSpellCostCap: 3 },
  ],
  // 3주차 구역(비밀의 방·마법생물·주문 대결·연구실)에서 처음 들어온 사람이 여는 카드 수 (집중이나 특정 카드로 달라질 수 있다)
  activityOpenCount: 2,
  // 최종 점수 = 주문력 × 학점 + 마법생물 세트(하늘·육지·바다 1장씩) 수 × creatureSetScore (기획 검토 중: 3점 또는 5점) + 졸업식 부문상 수 × graduationAwardScore (41절)
  creatureSetScore: 5,
  // 졸업식 부문상: 게임이 끝날 때 지력(수석상)·체력(튼튼상)·매력(인기상)·주문력(마법상)이 가장 높은 플레이어가 하나당 이 점수를 받는다 (동점이면 공동 수상)
  graduationAwardScore: 8,
  // 부문상을 주는 능력치 (시험·실험 등 점수에 이미 직접 들어가는 주문력을 뺄 수 있다)
  graduationAwardStats: ["intelligence", "stamina", "charm", "spellPower"] as StatKey[],
  // 판정 목표값 = 주사위 평균(3.5) × 그 달의 기준 주사위 수 × 난이도. 기준 주사위 수(마나기운 개수)는 rollBenchmarkStart에서 매달 rollBenchmarkPerRound씩 오른다
  // (주문력이 기준보다 앞서면 쉽고 뒤처지면 어렵다). 탐험·협력 탐험 카드는 카드마다 난이도가 정해져 있다
  rollBenchmarkStart: 2,
  rollBenchmarkPerRound: 0.2,
  // 주문 대결 도전자가 지목당한 친구에게 건네는 마나기운 개수 (매력 참가비 duelCharmFee와 별도. 지목당해도 마나기운이 있어야 굴릴 수 있게 하는 장치)
  duelManaFee: 0,
  // 연구실 실험: 마나기운을 몇 개 낼지 골라 낸 개수만큼(마나기운이 없으면 공짜 1개) 주사위를 굴려 합이 이 값 이상이면 성공 (안정적인 능력치 상향)
  labTarget: 4,
  // 마법생물 조련 목표값 배율: 생물마다 정해진 trainTarget(creatures.ts)에 곱한다 (주사위가 마나기운 개수라 능력치 기운 때와 맞추기 위한 보정)
  trainTargetScale: 0.7,
  // 굴림 버튼의 기본 주사위 수 = 목표값 판정(조련·연구실·탐험)에서 성공 확률이 이 값 이상이 되는 가장 적은 마나기운 개수 (남는 마나기운은 다시 굴리기용).
  // 토너먼트·주문 대결·시험은 기본값이 마나기운 전부. 봇도 기본값 그대로 굴린다
  defaultDiceSuccess: 0.7,
  // 능력치 감쇠 (2026-10-02): 지력·체력·매력은 시간이 지나면 줄어든다 (주문력·학점은 그대로). 4주차(정리)가 끝날 때 startRound 라운드부터 매 interval개월마다
  // stats 각각 perMonth만큼 줄고 floor 아래로는 내려가지 않는다. 그 달에 새로 얻은 능력치도 구분하지 않고 똑같이 깎는다 (유예 없음). 임시 능력치는 영향 없음
  statDecay: { perMonth: 1, interval: 2, startRound: 4, floor: 2, stats: ["intelligence", "stamina", "charm"] as StatKey[] },
  // 탐험 카드 목표값 배율 (1이면 카드에 적힌 난이도 그대로)
  exploreDifficultyScale: 1.1,
  // 탐험 역전 보너스: 선두와의 성장 점수(능력치 합 + 학점×3) 격차가 이 값 이상이면 판정에 보너스를 더한다
  catchUpGap: 4,
  catchUpBonus: 2,
  // 주문 대결을 건 도전자가 지목당한 플레이어에게 건네는 매력 (결과와 상관없이 지불)
  duelCharmFee: 1,
  // 자율활동 구역 하나에 들어갈 수 있는 최대 인원, 그리고 이미 한 명이 들어와 있는 구역에 두 번째로 들어갈 때 내는 매력기운 (1주차에 매력 수치만큼 받는다)
  activityMaxParticipants: 2,
  activitySecondParticipantCost: 1,
  // 카드를 한 장 열 때 드는 지력기운 (2026-10-02 38절에서 모든 구역 폐지 — 카드를 여는 건 지적 활동이 아니라서. 장치는 남겨 두고 openCardCostActivities만 비움).
  // 켜면 구역에 처음 들어온 사람이 카드를 열 때 낸다. 카드를 습득하는 데 드는 체력기운은 카드마다 정해져 있다 (수업카드 takeCost, 연구 카드 cost)
  openCardCost: 1,
  openCardCostActivities: [] as ActivityId[],
  // 능력치 × 활동 조화 (39절): 활동마다 주 능력치의 기운이 곧 그 활동의 주사위 재료다 ("내 매력만큼 주사위"). 마나기운(주문력)은 토너먼트·주문 대결과 다시 굴리기에만 쓴다.
  // 시험은 카드의 주 능력치 기운(주문력은 마나기운)으로 굴린다. 재료 기운이 없으면 어느 활동이든 공짜 주사위 1개
  // 기운을 모아 둘 수 있는 한도 = 능력치 × 이 배수 (40절). 매달 1주차에 능력치만큼 차오르고, 쓰고 남은 기운은 한도까지 다음 달로 이어진다
  energyCapMultiplier: 2,
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
