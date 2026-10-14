import type { IconName } from "./Icons";

export type StatKey = "intelligence" | "stamina" | "charm" | "spellPower";

export type ActivityId = "tournament" | "creature" | "duel" | "exploration" | "lab";

// 4주차(정리)에서 다음 달로 남기는 기운: 지력기운 1개, 체력기운 1개, 또는 남기지 않기
export type KeptToken = "intelligence" | "stamina" | "charm" | "mana";

export type GamePhase = "setup" | "prep" | "class" | "activity" | "cleanup" | "cram" | "midterm_exam" | "final_exam" | "ended";

// 1주차 학교 소식 (서버 types.ts의 NewsEffect·NewsCard와 같은 모양)
export interface NewsEffect {
  classExtra?: number;
  classBonus?: Partial<Record<StatKey, number>>;
  targetMod?: Partial<Record<"creature" | "lab" | "exploration", number>>;
  tournamentBonus?: number;
  gift?: Partial<Record<KeptToken, number>>;
  duelWinCredit?: number;
  examSubjectExtra?: number;
  cramTo?: KeptToken;
}
export interface NewsCard {
  id: string;
  kind: "event" | "notice" | "examWeek";
  name: string;
  description: string;
  effect: NewsEffect;
}

// 수업카드 = 과목: 가져가면 그 과목의 기운(주문력 과목은 마나기운)을 gain만큼 무료로 얻는다. 중급·심화는 그 과목 능력치가 minStat 이상이어야 한다
export interface ClassCard {
  id: string;
  name: string;
  description: string;
  stat: StatKey;
  level: "basic" | "advanced";
  gain: number;
  minStat?: number;
}

export type LabCardKind = "study" | "exam" | "insight" | "supply";

// 연구 카드 (연구실 실험). summary는 효과를 한 줄로 풀어 쓴 문구
export interface LabCard {
  id: string;
  name: string;
  description: string;
  // 이 카드를 고르는 데 드는 체력기운
  cost: number;
  kind: LabCardKind;
  summary: string;
}

// 연구 카드로 엿본 탐험 카드 (엿본 본인에게만 전송)
export interface PeekedExploration {
  id: string;
  name: string;
  description: string;
  checkText?: string;
  successText: string;
  failureText: string;
}

export type CreatureElement = "sky" | "land" | "ocean";

export interface CreatureAbility {
  trigger: "acquire" | "prep" | "duel" | "defend" | "lose" | "always";
  effect: "spellPower" | "mana" | "stamina" | "rollBonus" | "enemyRollPenalty" | "enemyStamina" | "immune" | "charmToken";
  amount: number;
}

export interface CreatureCard {
  id: string;
  cardNo: number;
  name: string;
  element: CreatureElement;
  kind: "animal" | "plant";
  trainTarget: number;
  ability: CreatureAbility;
  description: string;
}

export interface PlayerGameState {
  id: string;
  name: string;
  isBot?: boolean;
  intelligence: number;
  stamina: number;
  charm: number;
  spellPower: number;
  credit: number;
  tempBoosts: Partial<Record<StatKey, number>>;
  intelligenceTokens: number;
  staminaTokens: number;
  charmTokens: number;
  manaTokens: number;
  pendingStaminaTokens: number;
  pendingManaTokens: number;
  peekedExploration: PeekedExploration | null;
  tournamentTrack: number;
  // 졸업식에서 받은 상 (게임이 끝날 때 정해진다): 부문마다 순위에 따른 점수
  awards: GraduationAward[];
  classCards: ClassCard[];
  creatures: CreatureCard[];
  equipment: LabCard[];
  hasActedThisPhase: boolean;
}

export interface GameLogEntry {
  round: number;
  message: string;
}

// 시험 카드: 시험 점수 = 마나기운으로 굴린 주사위 합 + diceStat 수치 + bonusStat 수치 (결과의 bonus는 두 능력치 수치의 합)
export interface ExamCard {
  id: string;
  name: string;
  description: string;
  diceStat: StatKey;
  bonusStat?: StatKey;
}

export interface ExamResult {
  round: number;
  card: ExamCard;
  scores: { playerId: string; score: number; dice: number[]; bonus: number; rank: number; creditAwarded: number }[];
}

// 주사위를 굴리는 중 (선 정하기·토너먼트·조련·연구실·주문 대결·탐험 판정·시험). dice가 null이면 아직 안 굴린 사람.
// 모두 굴리면 결과가 보이고, 굴린 사람들이 확인(confirmed)을 눌러야 결과가 적용된다
export interface PendingRoll {
  kind: "first" | "tournament" | "creature" | "lab" | "duel" | "exploration" | "exam";
  title: string;
  lines: string[];
  // diceChoiceMax가 있으면 굴리기 전에 마나기운을 1~max개 내고 낸 개수만큼 굴릴 수 있다 (diceCount는 기본 개수). 없으면(마나기운이 없음) 공짜 주사위 diceCount개.
  // 다시 굴리기는 남은 마나기운 1개당 주사위 1개
  // assistMax가 있으면 굴리기 전에 보조 능력치 기운(assist.kind)을 0~max개 더 낼 수 있다. 낸 개수는 assist에 남는다
  // diceToken은 이 굴림의 주사위 재료 기운 (없으면 마나기운)
  entries: { playerId: string; label: string; diceCount: number; diceToken?: KeptToken; diceChoiceMax?: number; assistMax?: number; assist?: number; dice: number[] | null; confirmed: boolean; rerolls: number; rerollCounts?: number[] }[];
  // 이 굴림에서 보조 능력치로 쓸 수 있는 기운 (토너먼트: 체력기운 "끝까지 달려요", 탐험: 지력기운 "함정 간파")
  assist?: { kind: "stamina" | "intelligence"; name: string; title: string; hint: string };
}

// 3주차 선택 단계에서 각자 고른 활동 (모두에게 공개). 진행 단계에서는 이 순서대로 하나씩 처리한다
export interface ActivityChoice {
  playerId: string;
  activityId: ActivityId;
  // 주문 대결이면 지목한 친구
  targetPlayerId?: string;
}

// 진행이 끝난 활동의 결과
export interface ActivityResult {
  playerId: string;
  activityId: ActivityId;
  lines: string[];
}

// 구역에 공개된 카드를 보여 주기 위한 정보 (카드 종류와 상관없이 같은 모양)
export interface OfferCardView {
  id: string;
  name: string;
  description: string;
  lines: string[];
  // 가져가는 데 드는 비용 (체력기운)
  cost?: { kind: "stamina" | "mana"; amount: number };
  // 카드 이름 아래에 붙는 짧은 분류 (마법생물의 속성 · 종류)
  tags?: string;
}

export interface ActivityOffer {
  cards: OfferCardView[];
}

export interface DuelPair {
  challengerId: string;
  targetId: string;
}

// 서버가 알려 주는 규칙 수치 (비용 안내용)
export interface PublicRules {
  // 3주차 구역에 처음 들어와 카드를 열 때 드는 지력기운, 그리고 그 지력기운이 드는 활동 (지금은 없음)
  openCardCost: number;
  openCardCostActivities: ActivityId[];
  // 활동별 주사위 재료 기운 (조련=매력, 탐험=체력, 연구실=지력, 토너먼트·주문 대결=마나)
  rollFuel: Record<ActivityId, KeptToken>;
  // 기운을 모아 둘 수 있는 한도 = 능력치 × 이 배수 (0이면 한도 없음)
  energyCapMultiplier: number;
  activityMaxParticipants: number;
  activitySecondParticipantCost: number;
  duelCharmFee: number;
  duelManaFee: number;
  midtermRound: number;
  // 시험 공고(시험 카드 공개)가 나오는 라운드 (그 달 1주차 학교 소식)
  midtermNoticeRound: number;
  finalNoticeRound: number;
  // 마법 토너먼트 최종 순위 보상 (1위, 2위 순서, 학점)
  tournamentRewards: number[];
  // 최종 점수 = 졸업식 시상 점수의 합: 부문마다 순위에 따라 rankPoints[순위-1]점
  graduationCategories: AwardCategory[];
  rankPoints: number[];
}

// 졸업식 시상 부문 (서버 types.ts와 같은 모양): 주문력·학점·지력·체력·매력·마법생물
export type AwardCategory = StatKey | "creature";
export interface GraduationAward {
  category: AwardCategory;
  value: number;
  rank: number;
  points: number;
}

export interface GameState {
  round: number;
  phase: GamePhase;
  turnOrder: string[];
  startingPlayerIndex: number;
  players: Record<string, PlayerGameState>;
  activitySlots: Record<ActivityId, string[]>;
  // 3주차: 먼저 각자 활동을 고르고("choose", 선부터 시계방향), 모두 고르면 그 순서대로 하나씩 진행한다("resolve")
  activityStage: "choose" | "resolve";
  activityOrder: string[];
  activityTurnPointer: number;
  activityChoices: ActivityChoice[];
  // 진행 단계: 지금 처리 중인(또는 곧 처리할) 활동의 activityChoices 인덱스, 이미 시작했는지, 끝난 활동의 결과
  activityResolvePointer: number;
  activityResolveStarted: boolean;
  activityResults: ActivityResult[];
  duels: DuelPair[];
  // 2주차(정규수업): 공개된 수업카드(인원수+1장)와 선택 순서(선부터 시계방향)
  classMarket: ClassCard[];
  classPickOrder: string[];
  classPickPointer: number;
  // 3주차 구역에 공개된 카드 (처음 들어온 사람이 열고, 먼저 온 사람이 고르고 남은 카드는 두 번째 참가자가 가져간다)
  activityOffers: Partial<Record<ActivityId, ActivityOffer>>;
  // 공개된 카드 중 하나를 고르는 중 (take: 구역에서 가져가기, reward: 주문 대결 승자의 마도서 선택)
  pendingPick: { playerId: string; activityId: ActivityId } | null;
  pendingRoll: PendingRoll | null;
  // 이번 달 1주차 학교 소식, 시험 달 벼락치기 순서(선부터)와 지금 차례
  news: NewsCard | null;
  cramOrder: string[];
  cramPointer: number;
  // 공개된 시험 카드 (공개 전에는 null)
  exams: { midterm: ExamCard | null; final: ExamCard | null };
  examResults: ExamResult[];
  classLeft: number;
  rules: PublicRules;
  log: GameLogEntry[];
  winnerIds?: string[];
}

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
  tournament: "마법 토너먼트 참가",
  creature: "마법생물 조련",
  duel: "주문 대결",
  exploration: "비밀의 방 탐색",
  lab: "연구실 실험",
};

// 활동 카드에 함께 보여줄 한 줄 설명
export const ACTIVITY_HINT: Record<ActivityId, string> = {
  tournament: "마나기운을 골라 낸 만큼 주사위를 굴려 합친 칸만큼 트랙 전진 → 기말고사 뒤 순위로 학점",
  creature: "카드 2장 공개, 매력기운을 골라 낸 만큼 주사위를 굴려 합이 기준 이상이면 조련, 마리 수 + 하늘·육지·바다 세트 수로 생물사랑상을 겨뤄요",
  duel: "아직 안 고른 한 명을 지목해 강제 대결, 마나기운을 골라 낸 만큼 주사위를 굴려 이기면 주문력 +1·학점 +1",
  exploration: "카드 2장 중 하나를 골라 체력기운을 낸 만큼 주사위 판정! 크게 벌거나 크게 잃어요 (지력기운으로 함정을 피할 수 있어요)",
  lab: "심화학습: 연구 카드 2장 중 1장, 지력기운을 골라 낸 만큼 주사위를 굴려 실험 판정, 안정적으로 성장",
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

// 구역에 처음 들어와 카드를 여는 사람이 내는 지력기운 (마법생물·주문 대결·비밀의 방·연구실). 이미 다른 친구가 고른 구역이면(두 번째 참가자) 내지 않는다
export function activityOpenCost(game: GameState, activityId: ActivityId): number {
  if (!game.rules.openCardCostActivities.includes(activityId)) return 0;
  return game.activitySlots[activityId].length > 0 ? 0 : game.rules.openCardCost;
}

// 이미 다른 플레이어가 있는 구역에 들어갈 때 내야 하는 매력기운
export function activityExtraCost(game: GameState, activityId: ActivityId): number {
  return game.activitySlots[activityId].length >= 1 ? game.rules.activitySecondParticipantCost : 0;
}

// 주문 대결에서 지목할 수 있는 플레이어 (아직 자율활동을 고르지 않은 사람)
export function duelTargets(game: GameState, playerId: string): string[] {
  return game.turnOrder.filter((id) => id !== playerId && !game.players[id].hasActedThisPhase);
}

// 지력기운 int개 + 체력기운 stamina개 + 매력기운 charm개를 낼 수 있는가 (서버 canPay와 같은 규칙. 기운끼리는 바꿀 수 없다)
export function canPay(player: PlayerGameState, int: number, stamina: number, charm = 0): boolean {
  return player.intelligenceTokens >= int && player.staminaTokens >= stamina && player.charmTokens >= charm;
}

// 이 활동을 고를 수 없는 이유 (고를 수 있으면 null)
export function activityBlockReason(game: GameState, playerId: string, activityId: ActivityId): string | null {
  const player = game.players[playerId];
  if (game.activitySlots[activityId].length >= game.rules.activityMaxParticipants) return "이미 두 명이 참여했어요";
  const extra = activityExtraCost(game, activityId);
  if (!canPay(player, 0, 0, extra)) return `매력기운 ${extra}개가 더 필요해요`;
  const open = activityOpenCost(game, activityId);
  if (!canPay(player, open, 0, extra)) return `카드를 열 지력기운 ${open}개가 필요해요`;
  if (activityId === "tournament" && player.manaTokens < 1) return "마나기운이 1개 이상 필요해요";
  if (activityId === "duel") {
    const need = 1 + game.rules.duelManaFee;
    if (player.manaTokens < need) return `마나기운이 ${need}개 이상 필요해요`;
    if (duelTargets(game, playerId).length === 0) return "지목할 수 있는 친구가 없어요";
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
  const when = { acquire: "획득 즉시", prep: "매달 준비 때", duel: "주문 대결 참여 시", defend: "대결 도전받을 때", lose: "대결 패배 시", always: "항상" }[a.trigger];
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

// 마법생물 세트 수: 하늘·육지·바다를 1장씩 묶은 세트 (가장 적은 속성의 장수)
export function creatureSets(creatures: CreatureCard[]): number {
  return Math.min(...(["sky", "land", "ocean"] as CreatureElement[]).map((el) => creatures.filter((c) => c.element === el).length));
}

// ── 졸업식 시상 (서버 engine.ts와 같은 규칙): 부문마다 값이 큰 순서로 순위를 매겨 학점 rankPoints (동점은 같은 순위, 값 0이면 없음). 학점이 곧 승점이다 ──
export const AWARD_NAME: Record<AwardCategory, string> = { spellPower: "마법상", intelligence: "수석상", stamina: "튼튼상", charm: "인기상", creature: "생물사랑상" };
export const AWARD_SUBJECT: Record<AwardCategory, string> = { ...STAT_LABEL, creature: "마법생물" };

// 부문의 값: 능력치는 그 수치, 마법생물은 마리 수 + 완성한 세트 수
export function awardValue(player: PlayerGameState, category: AwardCategory): number {
  if (category === "creature") return player.creatures.length + creatureSets(player.creatures);
  return effectiveStat(player, category);
}

export function graduationAwards(game: Pick<GameState, "rules" | "players" | "turnOrder">): Map<string, GraduationAward[]> {
  const players = game.turnOrder.map((id) => game.players[id]).filter(Boolean);
  const out = new Map(players.map((p) => [p.id, [] as GraduationAward[]]));
  for (const category of game.rules.graduationCategories) {
    for (const p of players) {
      const value = awardValue(p, category);
      if (value <= 0) continue;
      const rank = 1 + players.filter((o) => awardValue(o, category) > value).length;
      const points = game.rules.rankPoints[rank - 1] ?? 0;
      if (points > 0) out.get(p.id)!.push({ category, value, rank, points });
    }
  }
  return out;
}

const awardPoints = (awards: GraduationAward[]) => awards.reduce((a, w) => a + w.points, 0);

// 게임 중 예상 점수: 지금 학점 + 지금 상태로 졸업하면 받을 학점 (졸업식이 끝났으면 받은 상이 이미 학점에 들어 있다)
export function projectedScore(game: Pick<GameState, "rules" | "players" | "turnOrder">, player: PlayerGameState): number {
  return player.credit - awardPoints(player.awards ?? []) + awardPoints(graduationAwards(game).get(player.id) ?? []);
}

// 졸업식 전까지 모은 학점 (시험·토너먼트·주문 대결·카드)
export function creditBeforeGraduation(player: PlayerGameState): number {
  return player.credit - awardPoints(player.awards ?? []);
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
