import type { IconName } from "./Icons";

// 엔진 타입을 그대로 쓴다(예전에는 서버 타입을 손으로 옮겨 적었다). 화면이 받는 상태는 좌석마다 가린 PublicGameState
export type {
  ActivityChoice,
  ActivityId,
  ActivityOffer,
  ActivityResult,
  AwardCategory,
  ClassCard,
  CreatureAbility,
  CreatureCard,
  CreatureElement,
  DreamCard,
  DuelPair,
  ExamCard,
  ExamResult,
  FeatKey,
  GameLogEntry,
  GamePhase,
  GraduationAward,
  KeptToken,
  LabCard,
  LabCardKind,
  NewsCard,
  NewsEffect,
  OfferCardView,
  PeekedExploration,
  PendingRoll,
  PlayerGameState,
  PublicRules,
  SpecialAwardId,
  StatKey,
} from "../engine/types";
import type { PublicGameState } from "../engine/types";
import type {
  ActivityId,
  AwardCategory,
  FeatKey,
  ClassCard,
  CreatureAbility,
  CreatureCard,
  CreatureElement,
  ExamCard,
  GraduationAward,
  KeptToken,
  LabCardKind,
  PlayerGameState,
  PublicRules,
  SpecialAwardId,
  StatKey,
} from "../engine/types";
export type GameState = PublicGameState;

// 차례 순서 안내 문구 (56절 B1: 학점이 낮은 친구부터, 같으면 선부터 시계방향 — 같을 때는 화면 위쪽과 규칙 탭에서 설명한다)
export const orderText = (rules: Pick<PublicRules, "turnOrderRule">): string => (rules.turnOrderRule === "creditAsc" ? "학점 낮은 친구부터" : "선부터 시계방향으로");

// 장래희망을 아직 바꿀 수 있는가 (받은 카드가 2장 이상이고 정해진 개월 안)
export const canChangeDream = (game: Pick<GameState, "round" | "phase" | "rules">, player: PlayerGameState | undefined): boolean =>
  !!player?.dreamOptions && player.dreamOptions.length > 1 && game.rules.dreamCredit > 0 && game.round <= game.rules.dreamChooseRounds && game.phase !== "ended";

export const STAT_LABEL: Record<StatKey, string> = {
  intelligence: "지력",
  stamina: "체력",
  charm: "매력",
  spellPower: "주문력",
};

// 시험 카드가 점수를 내는 방식 설명 (예: "매력기운으로 굴린 주사위 + 지력 수치")
export function describeExam(card: Pick<ExamCard, "diceStat" | "bonusStat">): string {
  const fuel = card.diceStat === "spellPower" ? "마나기운" : `${STAT_LABEL[card.diceStat]}기운`;
  return `${fuel}으로 굴린 주사위${card.bonusStat ? ` + ${STAT_LABEL[card.bonusStat]} 수치` : ""}`;
}

export const ACTIVITY_LABEL: Record<ActivityId, string> = {
  tournament: "반짝 마법 경연 참가",
  creature: "마법생물 조련",
  duel: "마법 겨루기",
  exploration: "별빛 다락방 탐험",
  lab: "연구실 실험",
};

// 활동 카드에 함께 보여줄 한 줄 설명
export const ACTIVITY_HINT: Record<ActivityId, string> = {
  tournament: "대회 카드 2장 중 하나를 골라 마나기운을 낸 만큼 주사위를 굴려 합이 목표 이상이면 입상! 주문력 +1·학점 +1과 카드 보상",
  creature: "카드 2장 중 하나, 매력기운 주사위 합이 카드의 기준 이상이면 데려와요! 매력 +1 · 학점 +2 · 속성 능력치 +1",
  duel: "친구를 지목해 마나기운 주사위로 막기(주사위 1개 + 주문력)보다 높으면 승리! 주문력 +1 · 학점 +2 · 친구에게 배워 능력치 +1",
  exploration: "카드 2장 중 하나, 체력기운 주사위 합이 카드의 목표 이상이면 성공! 체력 +1 · 학점 +1과 카드 보상 (실패해도 손해 없음)",
  lab: "연구 카드 2장 중 하나, 지력기운 주사위 합이 카드의 목표 이상이면 성공! 지력 +1 · 학점 +1과 다른 능력치 카드 보상",
};

export function effectiveStat(player: PlayerGameState, stat: StatKey): number {
  return Math.max(0, player[stat] + (player.tempBoosts[stat] ?? 0));
}

// 기운(현재치)의 종류와, 그 기운의 최대치가 되는 능력치 (주문력의 기운이 마나)
export const ENERGY_STAT: Record<KeptToken, StatKey> = { intelligence: "intelligence", stamina: "stamina", charm: "charm", mana: "spellPower" };
// 모아 둘 수 있는 한도 (능력치 × 배수, 배수가 0이면 한도 없음. 서버 energyCap과 같은 규칙)
export function energyCap(player: PlayerGameState, kind: KeptToken, rules: Pick<PublicRules, "energyCapMultiplier">): number {
  return rules.energyCapMultiplier > 0 ? effectiveStat(player, ENERGY_STAT[kind]) * rules.energyCapMultiplier : Infinity;
}
// 기운 표시: 한도가 있으면 "가진 양/한도", 없으면 가진 양만
export function energyText(player: PlayerGameState, kind: KeptToken, rules: Pick<PublicRules, "energyCapMultiplier">): string {
  const cap = energyCap(player, kind, rules);
  const now = player[ENERGY_FIELD[kind]];
  return Number.isFinite(cap) ? `${now}/${cap}` : `${now}`;
}

// ── 수업카드 (서버 engine.ts와 같은 규칙) ──
// 수업카드가 주는 기운의 종류 (주문력 과목은 마나기운)와, 그 기운을 담는 플레이어 필드
export const classGainKind = (card: Pick<ClassCard, "stat">): KeptToken => (card.stat === "spellPower" ? "mana" : card.stat);
export const ENERGY_FIELD = { intelligence: "intelligenceTokens", stamina: "staminaTokens", charm: "charmTokens", mana: "manaTokens" } as const;
// 심화 과목은 그 과목 능력치가 minStat 이상이어야 들을 수 있다 (선수과목)
export const CLASS_LEVEL_LABEL: Record<ClassCard["level"], string> = { basic: "기초", advanced: "심화" };
export const canTakeClassCard = (player: PlayerGameState, card: Pick<ClassCard, "stat" | "minStat">): boolean =>
  card.minStat === undefined || effectiveStat(player, card.stat) >= card.minStat;
// 이 카드를 가져가면 실제로 늘어나는 기운 (한도까지)
export function classGainApplied(player: PlayerGameState, card: Pick<ClassCard, "stat" | "gain">, rules: Pick<PublicRules, "energyCapMultiplier">): number {
  const kind = classGainKind(card);
  return Math.min(card.gain, Math.max(0, energyCap(player, kind, rules) - player[ENERGY_FIELD[kind]]));
}

// ── 자율활동 구역 선택 규칙 (서버 engine.ts와 같은 규칙. 버튼을 미리 막고 이유를 보여 주기 위해 복제) ──

// 구역에 처음 들어와 카드를 여는 사람이 내는 지력기운 (마법생물·마법 겨루기·별빛 다락방·연구실). 이미 다른 친구가 고른 구역이면(두 번째 참가자) 내지 않는다
export function activityOpenCost(game: GameState, activityId: ActivityId): number {
  if (!game.rules.openCardCostActivities.includes(activityId)) return 0;
  return game.activitySlots[activityId].length > 0 ? 0 : game.rules.openCardCost;
}

// 이미 다른 플레이어가 있는 구역에 들어갈 때 내야 하는 매력기운
export function activityExtraCost(game: GameState, activityId: ActivityId): number {
  return game.activitySlots[activityId].length >= 1 ? game.rules.activitySecondParticipantCost : 0;
}

// 마법 겨루기에서 지목할 수 있는 플레이어 (아직 자율활동을 고르지 않은 사람)
export function duelTargets(game: GameState, playerId: string): string[] {
  return game.turnOrder.filter(
    (id) => id !== playerId && (game.rules.duelTargetKeepsTurn || !game.players[id].hasActedThisPhase) && !(game.rules.duelTargetOnce && game.duels.some((d) => d.targetId === id)),
  );
}

// 지력기운 int개 + 체력기운 stamina개 + 매력기운 charm개를 낼 수 있는가 (서버 canPay와 같은 규칙. 기운끼리는 바꿀 수 없다)
export function canPay(player: PlayerGameState, int: number, stamina: number, charm = 0): boolean {
  return player.intelligenceTokens >= int && player.staminaTokens >= stamina && player.charmTokens >= charm;
}

// 이 활동을 고를 수 없는 이유 (고를 수 있으면 null)
export function activityBlockReason(game: GameState, playerId: string, activityId: ActivityId): string | null {
  const player = game.players[playerId];
  if (game.rules.disabledActivities.includes(activityId)) return "이번 규칙에는 없는 활동이에요";
  if (game.rules.activityMarket) {
    if (game.activitySlots[activityId].length >= (game.activityOffers[activityId]?.cards.length ?? 0)) return "남은 카드가 없어요";
  } else if (game.activitySlots[activityId].length >= game.rules.activityMaxParticipants) return "이미 두 명이 참여했어요";
  const extra = activityExtraCost(game, activityId);
  if (!canPay(player, 0, 0, extra)) return `매력기운 ${extra}개가 더 필요해요`;
  const open = activityOpenCost(game, activityId);
  if (!canPay(player, open, 0, extra)) return `카드를 열 지력기운 ${open}개가 필요해요`;
  if (activityId === "tournament" && !game.rules.tournamentCards && player.manaTokens < 1) return "마나기운이 1개 이상 필요해요";
  if (activityId === "duel") {
    // 63절(skillRules)에는 기운이 없어 마나기운이 필요 없다 (엔진 activityBlockReason 과 같게)
    const need = game.rules.skillRules ? 0 : (game.rules.baseDice > 0 ? 0 : 1) + game.rules.duelManaFee;
    if (need > 0 && player.manaTokens < need) return `마나기운이 ${need}개 이상 필요해요`;
    if (duelTargets(game, playerId).length === 0)
      return game.rules.duelTargetOnce && game.duels.length > 0 ? "이번 달은 친구들이 모두 이미 지목받았어요 (한 친구는 한 달에 한 번)" : "지목할 수 있는 친구가 없어요";
    if (player.charm < game.rules.duelCharmFee) return `건넬 매력(${game.rules.duelCharmFee})이 없어요`;
  }
  return null;
}

export const ELEMENT_LABEL: Record<CreatureElement, string> = { sky: "하늘", land: "육지", ocean: "바다" };
export const KIND_LABEL: Record<CreatureCard["kind"], string> = { animal: "동물", plant: "식물" };

export const LAB_KIND_ICON: Record<LabCardKind, IconName> = { study: "book", exam: "note", insight: "crystal", supply: "bag" };
export const LAB_KIND_LABEL: Record<LabCardKind, string> = {
  study: "심화 수업",
  exam: "시험 대비",
  insight: "엿보기",
  supply: "보급",
};

export const ELEMENT_ICON: Record<CreatureElement, IconName> = { sky: "cloud", land: "sprout", ocean: "wave" };

export function describeAbility(a: CreatureAbility): string {
  const when = { acquire: "획득 즉시", prep: "매달 준비 때", duel: "마법 겨루기 참여 시", defend: "대결 도전받을 때", lose: "대결 패배 시", always: "항상" }[a.trigger];
  const what = {
    spellPower: `주문력 영구 +${a.amount}`,
    mana: `마나기운 +${a.amount}`,
    stamina: a.trigger === "prep" ? `체력기운 +${a.amount}` : `다음 달 체력기운 +${a.amount}`,
    rollBonus: `내 굴림 +${a.amount}`,
    enemyRollPenalty: `상대 굴림 -${a.amount}`,
    enemyStamina: `상대 다음 달 체력기운 -${a.amount}`,
    immune: "낸 마나기운 1개를 다음 달에 돌려받음",
    charmToken: `매력기운 +${a.amount}`,
  }[a.effect];
  return `${when}: ${what}`;
}

// 마법생물이 주는 것 (57절 교감이면 "데려오면 체력 +1", 아니면 생물 능력)
export function creatureGiftText(c: CreatureCard, rules: Pick<PublicRules, "creatureBondStats">): string {
  return rules.creatureBondStats ? `교감: 데려오면 ${STAT_LABEL[rules.creatureBondStats[c.element]]} +1` : describeAbility(c.ability);
}

// 마법생물 세트 수: 하늘·육지·바다를 1장씩 묶은 세트 (가장 적은 속성의 장수)
export function creatureSets(creatures: CreatureCard[]): number {
  return Math.min(...(["sky", "land", "ocean"] as CreatureElement[]).map((el) => creatures.filter((c) => c.element === el).length));
}

// ── 졸업식 시상 (서버 engine.ts와 같은 규칙): 부문마다 값이 큰 순서로 순위를 매겨 학점 rankPoints (동점은 같은 순위, 값 0이면 없음). 학점이 곧 승점이다 ──
export const AWARD_NAME: Record<AwardCategory, string> = {
  spellPower: "마법상",
  intelligence: "수석상",
  stamina: "튼튼상",
  creature: "마법생물상",
  charm: "생물사랑상",
  allround: "만능상",
  explorer: "탐험왕",
  researcher: "연구왕",
  duelist: "겨루기왕",
  scholar: "시험왕",
  champion: "대회왕",
};
export const AWARD_SUBJECT: Record<AwardCategory, string> = {
  spellPower: STAT_LABEL.spellPower,
  intelligence: STAT_LABEL.intelligence,
  stamina: STAT_LABEL.stamina,
  creature: "마법생물",
  charm: STAT_LABEL.charm,
  allround: "가장 낮은 능력치",
  explorer: "탐험 성공",
  researcher: "연구 성공",
  duelist: "마법 겨루기 승리",
  scholar: "시험 점수 합",
  champion: "대회 입상",
};
// 특별상 카드에 적는 한 줄 설명
export const SPECIAL_AWARD_HINT: Record<SpecialAwardId, string> = {
  charm: "매력이 가장 높은 친구",
  allround: "네 능력치 중 가장 낮은 능력치가 가장 높은 친구 (골고루 키운 친구)",
  explorer: "별빛 다락방 탐험에 가장 많이 성공한 친구",
  researcher: "연구실 실험에 가장 많이 성공한 친구",
  duelist: "마법 겨루기에서 가장 많이 이긴 친구",
  scholar: "중간·기말고사 점수 합이 가장 높은 친구",
  champion: "반짝 마법 경연 대회에 가장 많이 입상한 친구",
};
export const isSpecialAward = (c: AwardCategory): c is SpecialAwardId => !["spellPower", "intelligence", "stamina", "creature"].includes(c);

// 부문의 값: 능력치는 그 수치, 마법생물은 마리 수 + 완성한 세트 수, 특별상은 성과 횟수 등 (서버 awardValue와 같은 규칙)
export function awardValue(player: PlayerGameState, category: AwardCategory, rules?: Pick<PublicRules, "tournamentCards">): number {
  if (category === "creature") return player.creatures.length + creatureSets(player.creatures);
  const feat = (k: FeatKey) => player.feats?.[k] ?? 0;
  switch (category) {
    case "allround":
      return Math.min(...(["intelligence", "stamina", "charm", "spellPower"] as StatKey[]).map((s) => effectiveStat(player, s)));
    case "explorer":
      return feat("exploration");
    case "researcher":
      return feat("lab");
    case "duelist":
      return feat("duel");
    case "scholar":
      return feat("exam");
    case "champion":
      return rules?.tournamentCards === false ? player.tournamentTrack : feat("tournament");
    default:
      return effectiveStat(player, category);
  }
}

// 졸업식에서 겨루는 모든 부문 (기본 4부문 + 올해의 특별상)
export const awardCategoriesOf = (game: Pick<GameState, "rules" | "specialAwards">): AwardCategory[] => [...game.rules.graduationCategories, ...(game.specialAwards ?? [])];

export function graduationAwards(game: Pick<GameState, "rules" | "players" | "turnOrder" | "specialAwards">): Map<string, GraduationAward[]> {
  const players = game.turnOrder.map((id) => game.players[id]).filter(Boolean);
  const out = new Map(players.map((p) => [p.id, [] as GraduationAward[]]));
  const value = (p: PlayerGameState, c: AwardCategory) => awardValue(p, c, game.rules);
  for (const category of awardCategoriesOf(game)) {
    for (const p of players) {
      const v = value(p, category);
      if (v <= 0) continue;
      const rank = 1 + players.filter((o) => value(o, category) > v).length;
      const points = game.rules.rankPoints[rank - 1] ?? 0;
      if (points > 0) out.get(p.id)!.push({ category, value: v, rank, points });
    }
  }
  return out;
}

const awardPoints = (awards: GraduationAward[]) => awards.reduce((a, w) => a + w.points, 0);

// 장래희망을 이뤘는가: 두 능력치가 모두 기준 이상 (서버 dreamFulfilled와 같은 규칙. 다른 사람의 꿈은 게임이 끝나기 전까지 보이지 않는다)
export function dreamReached(player: PlayerGameState, rules: Pick<PublicRules, "dreamThreshold">): boolean {
  return !!player.dream && rules.dreamThreshold > 0 && player.dream.stats.every((s) => effectiveStat(player, s) >= rules.dreamThreshold);
}
// 졸업식에서 받은 장래희망 학점 (졸업식 전이면 0)
const dreamPointsGot = (player: PlayerGameState, rules: Pick<PublicRules, "dreamCredit">) => (player.dreamFulfilled ? rules.dreamCredit : 0);

// 게임 중 예상 점수: 지금 학점 + 지금 상태로 졸업하면 받을 학점 (졸업식이 끝났으면 받은 상·장래희망 학점이 이미 학점에 들어 있다).
// 다른 사람의 장래희망은 보이지 않아서 내 화면의 예상 점수에는 내 꿈만 들어간다
export function projectedScore(game: Pick<GameState, "rules" | "players" | "turnOrder" | "specialAwards">, player: PlayerGameState): number {
  const dream = dreamReached(player, game.rules) ? game.rules.dreamCredit : 0;
  return creditBeforeGraduation(player, game.rules) + awardPoints(graduationAwards(game).get(player.id) ?? []) + dream;
}

// 졸업식 전까지 모은 학점 (시험·마법 경연·마법 겨루기·카드)
export function creditBeforeGraduation(player: PlayerGameState, rules: Pick<PublicRules, "dreamCredit">): number {
  return player.credit - awardPoints(player.awards ?? []) - dreamPointsGot(player, rules);
}

// 주사위를 굴릴(또는 결과를 확인할) 차례인 사람: 아직 확인하지 않은 첫 참여자 (한 명씩 차례대로, 서버 currentRoller와 같은 규칙)
export function currentRoller(game: Pick<GameState, "pendingRoll">): string | undefined {
  return game.pendingRoll?.entries.find((e) => !e.confirmed)?.playerId;
}

// 벼락치기로 바꿀 수 있는 기운 (시험 과목 기운이 아닌, 1개 이상 가진 기운. 서버 cramSources와 같은 규칙)
export function cramSources(game: Pick<GameState, "news">, player: PlayerGameState): KeptToken[] {
  const to = game.news?.effect.cramTo;
  if (!to) return [];
  return (["intelligence", "stamina", "charm", "mana"] as KeptToken[]).filter((k) => k !== to && player[ENERGY_FIELD[k]] > 0);
}

// 최종 점수 = 학점 (졸업식 시상 학점이 더해진 값)
export function finalScore(_game: Pick<GameState, "rules">, player: PlayerGameState): number {
  return player.credit;
}
