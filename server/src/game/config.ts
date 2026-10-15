// 플레이테스트 중 조정할 밸런스 수치 모음 (notes/기획_정리.md 8절의 "플레이테스트 후 조정" 항목).
// 값을 바꾸면 엔진 전체에 반영되며, 시뮬레이션 스크립트(server/scripts/simulate.ts)가 이 객체를 직접 바꿔 비교합니다.
// 카드 종류별 수치(수업/장비/탐험/마도서/마법생물)는 각 *Cards.ts / creatures.ts에서 조정합니다.
import type { ActivityId, AwardCategory, CardEffect, KeptToken, StatKey } from "./types.js";

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
  // 반짝 마법 경연: 최종 순위 보상 (1위, 2위 순서). 트랙에는 상한이 없다
  tournamentRewards: [2, 1], // 55절: 참가하면 성장(54절)이 생겨 [3, 1] → [2, 1] (49절에서 [4, 2] → [3, 1])
  // 반짝 마법 경연 이정표: 트랙이 milestoneStep칸을 넘을 때마다 학점 milestoneCredit (49절 단순화로 폐지: 0이면 없음. 마법 경연 보상은 최종 순위 학점만)
  tournamentMilestoneStep: 0,
  tournamentMilestoneCredit: 1,
  // 다음 달 선 결정 규칙 (4주차에 판정, 2026-10-01 기본값을 charmTokens로 변경): "charm" 매력 수치가 가장 높은 친구(현재 선이 최고면 유지) / "charmTokens" 남은 매력기운이 가장 많은 친구 /
  // "charmPlusTokens" 매력 + 남은 매력기운 / "rotate" 단순 시계방향 (비교용). 동점이면 현재 선에서 시계방향으로 가까운 친구
  // 49절 단순화: 매달 시계방향으로 한 칸씩 넘긴다 ("rotate"). 첫 달의 선은 주사위로 정한다
  starterRule: "rotate" as "charm" | "charmTokens" | "charmPlusTokens" | "rotate",
  // 정규수업의 수업카드를 선이 마지막에 고르는가 (false면 정규수업도 선부터 시계방향, 49절)
  classPickStarterLast: false,
  // 자율활동 선택 순서 (51절 실험): "same" = 수업과 같이 선부터 시계방향 / "reverse" = 수업의 반대(선의 오른쪽부터 반시계방향, 선이 마지막)
  activityOrder: "same" as "same" | "reverse",
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
  // 수업카드 2단계 (49절 단순화): 기초 +2 · 심화 +4. 심화는 그 과목 능력치가 minStat 이상이어야 들을 수 있다 (선수과목).
  classTiers: {
    basic: { gain: 2 },
    advanced: { gain: 4, minStat: 3 },
  } as Record<"basic" | "advanced", { gain: number; minStat?: number }>,
  // 성장 (42절): 자율활동에서 성과를 내면 그 활동의 주 능력치가 growthAmount만큼 오른다 (조련·탐험·연구실은 성공, 마법 겨루기는 승리, 마법 경연은 참가만 해도 — 54절)
  growthAmount: 1,
  // 성장할 때 함께 받는 학점 (52-11절: 활동에서 성과를 내면 학점도 오른다. 학점 트랙이 1년 내내 움직여 판세가 보인다)
  growthCredit: 1,
  growthActivities: { tournament: true, creature: true, duel: true, exploration: true, lab: true } as Record<ActivityId, boolean>, // 54절: 마법 경연도 참가하면 성장 (예전 false)
  // 3주차 구역(별빛 다락방·마법생물·마법 겨루기·연구실)에서 처음 들어온 사람이 여는 카드 수 (집중이나 특정 카드로 달라질 수 있다)
  activityOpenCount: 2,
  // 이번 달 활동 카드 미리 공개 (50절): 시험 달이 아닌 달의 1주차에 마법생물·연구실·별빛 다락방·마법 겨루기 구역의 카드를 모두 공개한다.
  // 수업 선택이 이번 달 활동 계획이 되고, 활동 선택이 공개된 카드의 선점 경쟁이 된다 (false면 예전처럼 처음 들어온 사람이 연다)
  revealOffersAtMonthStart: true,
  // 마법 겨루기 승자의 보상 (51절에서 마도서를 없앴다. 주문력 성장 +1은 따로 받는다)
  duelWinReward: { credit: 2 } as CardEffect, // 56절: 1 → 2 (대회 카드로 마나기운을 쓸 곳이 늘어 줄던 겨루기를 되살림)
  // 최종 점수 = 학점 (52절: 학점은 능력치가 아니라 승점이다. 시험·마법 경연·마법 겨루기·카드로 모으고, 졸업식 시상 학점이 더해진다).
  // 졸업식은 부문마다 값이 큰 순서로 순위를 매겨 학점 rankPoints[순위-1]을 준다 (동점은 같은 순위·같은 학점, 값이 0이면 없음, 순위가 표 밖이면 0).
  // 마법생물 부문의 값 = 마리 수 + 완성한 세트(하늘·육지·바다 1장씩) 수. 예전 우등상(학점 부문)은 학점이 승점이 되면서 없앴다
  graduationCategories: ["spellPower", "intelligence", "stamina", "creature"] as AwardCategory[], // 55절: 인기상 폐지 (매력 = 마법생물과 교감하는 힘 → 생물사랑상)
  rankPoints: [4, 2, 1], // 52-11절: 6/3/1 → 4/2/1 (1년 동안 모은 학점과 졸업식 학점이 반반이 되도록)
  // 마법 겨루기 도전자가 지목당한 친구에게 건네는 마나기운 개수 (매력 참가비 duelCharmFee와 별도. 지목당해도 마나기운이 있어야 굴릴 수 있게 하는 장치)
  duelManaFee: 1,
  // 마법 겨루기 굴림 순서: true면 지목당한 친구가 먼저 굴리고 도전자가 그 결과를 보고 굴린다 (49절, 뒤에 굴리는 쪽이 유리해서 도전자에게 준다)
  duelTargetRollsFirst: true,
  // 연구실 실험: 마나기운을 몇 개 낼지 골라 낸 개수만큼(마나기운이 없으면 공짜 1개) 주사위를 굴려 합이 이 값 이상이면 성공 (안정적인 능력치 상향)
  labTarget: 6, // 59절 L4: 굴림 상한 +1과 함께 5 → 6 // 52-4절: 함께하면 든든을 없앤 뒤에도 5 유지 (성공률 약 63%, 4면 79%로 지력이 쏠린다)
  // 마법생물 조련 목표값 배율: 생물마다 정해진 trainTarget(creatures.ts)에 곱한다 (주사위가 마나기운 개수라 능력치 기운 때와 맞추기 위한 보정)
  trainTargetScale: 0.46, // 59절 L4: 굴림 상한 +1과 함께 0.42 → 0.46 // 52-7절: 함께하면 든든·실패 카드 되돌리기를 없애고 성공률 약 61%로 되돌림 (52-4절 0.44, 예전 0.5)
  // 굴림 버튼의 기본 주사위 수 = 목표값 판정(조련·연구실·탐험)에서 성공 확률이 이 값 이상이 되는 가장 적은 마나기운 개수 (남는 마나기운은 다시 굴리기용).
  // 마법 경연·마법 겨루기·시험은 기본값이 마나기운 전부. 봇도 기본값 그대로 굴린다
  defaultDiceSuccess: 0.7,
  // 탐험 역전 보너스: 선두와의 종합 점수(능력치 합 + 학점×3) 격차가 이 값 이상이면 판정에 보너스를 더한다
  catchUpGap: 4,
  catchUpBonus: 0, // 49절 단순화로 폐지 (0이면 없음)
  // 마법 겨루기를 건 도전자가 지목당한 플레이어에게 건네는 매력 (49절 단순화로 폐지: 대결 비용은 마나기운 duelManaFee 하나)
  duelCharmFee: 0,
  // 자율활동 구역 하나에 들어갈 수 있는 최대 인원, 그리고 이미 한 명이 들어와 있는 구역에 두 번째로 들어갈 때 내는 매력기운 (먼저 들어온 친구에게 건넨다, 43-6절)
  activityMaxParticipants: 2,
  activitySecondParticipantCost: 0, // 49절 단순화로 폐지: 함께 들어가도 추가 비용이 없다 (52-4절에서 함께하면 든든도 없앴다)
  // 카드를 한 장 열 때 드는 지력기운 (2026-10-02 38절에서 모든 구역 폐지 — 카드를 여는 건 지적 활동이 아니라서. 장치는 남겨 두고 openCardCostActivities만 비움).
  // 켜면 구역에 처음 들어온 사람이 카드를 열 때 낸다. 카드를 습득하는 데 드는 체력기운은 카드마다 정해져 있다 (수업카드 takeCost, 연구 카드 cost)
  openCardCost: 1,
  openCardCostActivities: [] as ActivityId[],
  // 능력치 × 활동 조화 (39절): 활동마다 주 능력치의 기운이 곧 그 활동의 주사위 재료다 ("내 매력만큼 주사위"). 마나기운(주문력)은 마법 경연·마법 겨루기와 다시 굴리기에만 쓴다.
  // 시험은 카드의 주 능력치 기운(주문력은 마나기운)으로 굴린다. 재료 기운이 없으면 어느 활동이든 공짜 주사위 1개
  // 기운을 모아 둘 수 있는 한도 = 능력치 × 이 배수 (40절). 0이면 한도가 없다 (43-5절, 2026-10-06 폐지: 대신 한 번에 낼 수 있는 기운이 능력치로 제한된다)
  energyCapMultiplier: 0,
  // 실력만큼만 힘을 낸다 (43-5절): 한 번 굴릴 때 낼 수 있는 재료 기운은 그 기운의 능력치 개수까지 (주문력 → 마나기운). 기운은 얼마든지 모아 둘 수 있다
  rollLimitByStat: true,
  // 주사위의 여섯 면 (46절). 기본은 1~6, "1이 세 면·2가 두 면·3이 한 면"([1,1,1,2,2,3])처럼 바꿔 운의 폭을 줄일 수 있다.
  // 판정 목표값(탐험·조련)은 주사위 평균에 맞춰 자동으로 바뀐다. 연구실 목표·마법 경연 이정표처럼 고정값인 수치는 따로 맞춘다
  dieFaces: [1, 2, 3, 4, 5, 6],
  // 기본 주사위 (47절 1안): 굴릴 때마다 기운과 상관없이 이만큼의 주사위를 공짜로 더 굴린다. 0보다 크면 재료 기운을 0개 내는 것도 된다
  baseDice: 0,
  // 실패 보상 (47절 2안): 마법생물·연구·탐험 카드에 실패했을 때, 마법 겨루기에서 졌을 때 그 활동의 재료 기운을 돌려받는다 (어려운 카드일수록 많이)
  failRewards: false,
  // 결과에 따라 배운다 (47절 4안): 성공/실패 대신 주사위 합으로 세 단계. 목표 이상 = 해냈어요(카드 + 성장), 목표 × nearMissRatio 이상 = 아깝다!(그 능력치 경험치 +1, 탐험 손해 없음),
  // 그 아래 = 서툴렀어요(재료 기운 1개를 돌려받음). 경험치가 expPerGrowth만큼 쌓이면 성장한다. 마법 겨루기는 nearMissDuelGap점 차 이내로 지면 아깝다!
  gradedResults: false,
  // 방향형 결과 (48절 4안): 마법생물·연구·탐험 카드는 주사위 1개를 굴려 눈(1~6)에 따라 카드에 적힌 방향의 효과를 받는다 (실패가 없다).
  // 굴린 뒤 그 활동의 재료 기운으로 다시 굴리거나(dirRerollCost개) 눈을 ±1 조정(dirAdjustCost개, 0이면 조정 없음)할 수 있다. 한 번에 쓸 수 있는 기운은 능력치까지
  directionalResults: false,
  dirRerollCost: 1,
  dirAdjustCost: 0,
  nearMissRatio: 2 / 3,
  expPerGrowth: 2,
  nearMissDuelGap: 2,
  // 굴림 상한 = 능력치 + 이 값 (능력치 1인 초반에도 주사위 2개는 굴릴 수 있게 하는 여유)
  rollLimitBonus: 1, // 59절 L4: "실력 + 1만큼 힘을 낸다" — 시작부터 주사위 2개, 초반 눈덩이를 줄인다
  rollFuel: { tournament: "mana", creature: "charm", duel: "mana", exploration: "stamina", lab: "intelligence" } as Record<ActivityId, KeptToken>,
  // 보조 능력치 (38-6절): 굴리기 전에 그 능력의 기운을 내서 주 판정을 돕는다.
  // 반짝 마법 경연 — 체력(지구력): 체력기운 1개당 고정 칸 전진 (주사위가 아니라 고정값)
  tournamentStaminaBoost: 0, // 49절 단순화로 폐지 (0이면 체력기운 보조 없음)

  // ── 공모전 4.5점 개선 (56절, 2026-10-14 P5 채택). 끄면 55절 규칙으로 돌아간다 ──
  // A1 마법생물 보강: 어려운 생물(조련 기준 16 이상)을 조련하면 학점을 더 받는다 / 세트(하늘·육지·바다 1장씩)를 완성하는 순간 학점
  creatureRareCredit: 1,
  creatureSetCredit: 0, // 57절: 교감(creatureBond)을 켜면서 2 → 0 (세트는 생물사랑상 값에만 들어간다)
  // A2 마법 겨루기 보강: 도전자의 굴림에 더하는 값 (도전한 용기)
  duelChallengerBonus: 1,
  // B1 순서 규칙: "seat" = 선부터 시계방향 / "creditAsc" = 학점이 낮은 사람부터 (같으면 선부터 시계방향). 정규수업·자율활동·시험·벼락치기 순서에 모두 쓴다
  turnOrderRule: "creditAsc" as "seat" | "creditAsc",
  // B2 장래희망 카드: 게임을 시작할 때 dreamDeal장을 받아 1장을 고른다(비공개). 졸업할 때 카드의 두 능력치가 모두 dreamThreshold 이상이면 학점 dreamCredit
  dreams: true,
  dreamDeal: 2,
  dreamThreshold: 4, // 57절: 교감으로 능력치가 넓게 올라 3 → 4 (달성률 약 32% 유지)
  dreamCredit: 3,
  dreamChooseRounds: 1, // 이 개월까지는 받은 카드 중에서 바꿀 수 있다 (그 뒤로는 고정)
  // B3 올해의 특별상: 게임을 시작할 때 특별상 카드를 이 장수만큼 공개한다. 졸업식에서 다른 부문과 똑같이 순위 학점(rankPoints)을 준다
  specialAwards: 1,
  // C1 대회 카드: 반짝 마법 경연을 다른 구역처럼 카드 판정으로 바꾼다 (트랙·최종 순위 보상 없음, 성공하면 성장)
  tournamentCards: true,
  // 57절 마법생물과의 교감: 데려오면 속성 능력치 +1(하늘 주문력·육지 체력·바다 지력, 성장이 아니라 학점은 없다). 매달 기운·대결 굴림 같은 생물 능력은 없다
  creatureBond: true,
  creatureBondStats: { sky: "spellPower", land: "stamina", ocean: "intelligence" } as Record<"sky" | "land" | "ocean", StatKey>,
  // 탐험 카드 목표값 보정 (실험용, 카드에 인쇄된 목표에 더한다)
  exploreTargetMod: 0,
  // 대회 카드 목표값 보정 (실험용, 카드에 인쇄된 목표에 더한다)
  tournamentTargetMod: 0,
};

export function examCreditForRank(rank: number): number {
  const credits = BALANCE.examCredits;
  return credits[Math.min(rank, credits.length) - 1];
}
