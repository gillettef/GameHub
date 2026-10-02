import type { IconName } from "./Icons";

export type StatKey = "intelligence" | "stamina" | "charm" | "spellPower";

export type ActivityId = "tournament" | "creature" | "duel" | "exploration" | "lab";

// 4주차(정리)에서 다음 달로 남기는 토큰: 지력토큰 1개, 체력토큰 1개, 또는 남기지 않기
export type KeptToken = "intelligence" | "stamina" | "charm" | "mana";
export type KeepChoice = KeptToken | "none";

export type GamePhase = "setup" | "prep" | "class" | "activity" | "cleanup" | "midterm_exam" | "final_exam" | "ended";

export interface ClassCard {
  id: string;
  name: string;
  description: string;
  // 이 카드를 습득하는 데 드는 체력토큰
  takeCost: number;
  statBoost: { stat: StatKey; amount: number };
}

export type LabCardKind = "study" | "exam" | "insight" | "supply";

// 연구 카드 (연구실 실험). summary는 효과를 한 줄로 풀어 쓴 문구
export interface LabCard {
  id: string;
  name: string;
  description: string;
  // 이 카드를 고르는 데 드는 체력토큰
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

export interface GrimoireCard {
  id: string;
  name: string;
  description: string;
  statBoost: { stat: StatKey; amount: number };
  ability?: CreatureAbility;
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
  classCards: ClassCard[];
  creatures: CreatureCard[];
  equipment: LabCard[];
  grimoires: GrimoireCard[];
  hasActedThisPhase: boolean;
}

export interface GameLogEntry {
  round: number;
  message: string;
}

// 시험 카드: 시험 점수 = 마나토큰으로 굴린 주사위 합 + diceStat 수치 + bonusStat 수치 (결과의 bonus는 두 능력치 수치의 합)
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
  // diceChoiceMax가 있으면 굴리기 전에 마나토큰을 1~max개 내고 낸 개수만큼 굴릴 수 있다 (diceCount는 기본 개수). 없으면(마나토큰이 없음) 공짜 주사위 diceCount개.
  // 다시 굴리기는 남은 마나토큰 1개당 주사위 1개
  entries: { playerId: string; label: string; diceCount: number; diceChoiceMax?: number; dice: number[] | null; confirmed: boolean; rerolls: number; rerollCounts?: number[] }[];
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
  // 가져가는 데 드는 비용 (체력토큰)
  cost?: { kind: "stamina" | "mana"; amount: number };
  // 카드 이름 아래에 붙는 짧은 분류 (마법생물의 속성 · 종류)
  tags?: string;
}

export interface ActivityOffer {
  cards: OfferCardView[];
}

// 함께할 친구를 기다리는 협력 탐험 카드
export interface CoopWaiting {
  playerId: string;
  name: string;
  description: string;
  pairText: string;
  voidText: string;
  successText: string;
  failureText: string;
}

export interface DuelPair {
  challengerId: string;
  targetId: string;
}

// 서버가 알려 주는 규칙 수치 (비용 안내용)
export interface PublicRules {
  // 3주차 구역에 처음 들어와 카드를 열 때 드는 지력토큰, 그리고 그 지력토큰이 드는 활동 (지금은 없음)
  openCardCost: number;
  openCardCostActivities: ActivityId[];
  // 체력토큰이 모자랄 때 체력토큰 1개를 대신하는 지력토큰 개수 (수업카드·연구 카드 습득)
  intelligencePerStamina: number;
  // 능력치 감쇠: startRound 이후 interval개월마다 stats가 perMonth씩 줄고 floor 아래로는 내려가지 않는다 (4주차 정리 때)
  statDecay: { perMonth: number; interval: number; startRound: number; floor: number; stats: StatKey[] };
  activityMaxParticipants: number;
  activitySecondParticipantCost: number;
  duelCharmFee: number;
  duelManaFee: number;
  midtermRound: number;
  midtermRevealRound: number;
  finalRevealRound: number;
  // 마법 토너먼트 최종 순위 보상 (1위, 2위 순서, 학점)
  tournamentRewards: number[];
  // 최종 점수 = 주문력 × 학점 + 마법생물 세트(하늘·육지·바다 1장씩) 수 × creatureSetScore
  creatureSetScore: number;
  // 마법생물을 가져오는 데 드는 최소 마나토큰 (이보다 적으면 마법생물 조련을 고를 수 없다)
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
  pendingPick: { playerId: string; activityId: ActivityId; mode: "take" | "reward" } | null;
  pendingRoll: PendingRoll | null;
  coopWaiting: CoopWaiting | null;
  // 공개된 시험 카드 (공개 전에는 null)
  exams: { midterm: ExamCard | null; final: ExamCard | null };
  examResults: ExamResult[];
  // (kept: 이 사람이 다음 달로 남긴 토큰 1개. 소멸 수량은 남긴 것을 뺀 값)
  // (decay: 이번 정리에서 시간이 지나 줄어든 지력·체력·매력, 줄지 않았으면 빈 객체)
  cleanupSummary: { playerId: string; intelligenceTokens: number; staminaTokens: number; charmTokens: number; manaTokens: number; kept: KeptToken | null; decay: Partial<Record<StatKey, number>> }[];
  // 4주차(정리)에서 다음 달로 남길 토큰을 고르는 중: 남길 토큰이 있는 사람만 들어 있고, null이면 아직 고르지 않았다
  cleanupKeep: Record<string, KeepChoice | null>;
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

// 시험 카드가 점수를 내는 방식 설명 (예: "매력 수치만큼 주사위 + 지력 수치")
export function describeExam(card: Pick<ExamCard, "diceStat" | "bonusStat">): string {
  return `마나토큰으로 굴린 주사위 + ${STAT_LABEL[card.diceStat]} 수치${card.bonusStat ? ` + ${STAT_LABEL[card.bonusStat]} 수치` : ""}`;
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
  tournament: "마나토큰을 골라 낸 만큼 주사위를 굴려 합친 칸만큼 트랙 전진 → 학점",
  creature: "카드 2장 공개, 마나토큰 주사위 합 + 매력이 기준 이상이면 조련 (매력이 높을수록 유리), 하늘·육지·바다를 1장씩 모으면 세트 점수",
  duel: "아직 안 고른 한 명을 지목해 강제 대결, 마나토큰을 골라 낸 만큼 주사위를 굴려 이기면 마도서 1장",
  exploration: "카드 2장 중 하나를 골라 마나토큰 주사위 합 + 체력으로 판정! 크게 벌거나 크게 잃어요 (체력이 높을수록 유리)",
  lab: "심화학습: 연구 카드 2장 중 1장, 마나토큰 주사위 합 + 지력으로 실험 판정, 안정적으로 성장 (지력이 높을수록 유리)",
};

export function effectiveStat(player: PlayerGameState, stat: StatKey): number {
  return Math.max(0, player[stat] + (player.tempBoosts[stat] ?? 0));
}

// ── 자율활동 구역 선택 규칙 (서버 engine.ts와 같은 규칙. 버튼을 미리 막고 이유를 보여 주기 위해 복제) ──

// 구역에 처음 들어와 카드를 여는 사람이 내는 지력토큰 (마법생물·주문 대결·비밀의 방·연구실). 이미 다른 친구가 고른 구역이면(두 번째 참가자) 내지 않는다
export function activityOpenCost(game: GameState, activityId: ActivityId): number {
  if (!game.rules.openCardCostActivities.includes(activityId)) return 0;
  return game.activitySlots[activityId].length > 0 ? 0 : game.rules.openCardCost;
}

// 이미 다른 플레이어가 있는 구역에 들어갈 때 내야 하는 매력토큰
export function activityExtraCost(game: GameState, activityId: ActivityId): number {
  return game.activitySlots[activityId].length >= 1 ? game.rules.activitySecondParticipantCost : 0;
}

// 주문 대결에서 지목할 수 있는 플레이어 (아직 자율활동을 고르지 않은 사람)
export function duelTargets(game: GameState, playerId: string): string[] {
  return game.turnOrder.filter((id) => id !== playerId && !game.players[id].hasActedThisPhase);
}

// 지력토큰 int개 + 체력토큰 stamina개 + 매력토큰 charm개를 낼 수 있는가 (서버 canPay와 같은 규칙).
// 체력토큰이 모자라면 남은 지력토큰 perStamina개가 체력토큰 1개를 대신한다 (생략하면 대신하지 않는다). 그 밖의 토큰끼리는 바꿀 수 없다
export function canPay(player: PlayerGameState, int: number, stamina: number, charm = 0, perStamina = Infinity): boolean {
  return (
    player.intelligenceTokens >= int &&
    player.charmTokens >= charm &&
    player.staminaTokens + Math.floor((player.intelligenceTokens - int) / perStamina) >= stamina
  );
}

// 이 활동을 고를 수 없는 이유 (고를 수 있으면 null)
export function activityBlockReason(game: GameState, playerId: string, activityId: ActivityId): string | null {
  const player = game.players[playerId];
  if (game.activitySlots[activityId].length >= game.rules.activityMaxParticipants) return "이미 두 명이 참여했어요";
  const extra = activityExtraCost(game, activityId);
  if (!canPay(player, 0, 0, extra)) return `매력토큰 ${extra}개가 더 필요해요`;
  const open = activityOpenCost(game, activityId);
  if (!canPay(player, open, 0, extra)) return `카드를 열 지력토큰 ${open}개가 필요해요`;
  if (activityId === "tournament" && player.manaTokens < 1) return "마나토큰이 1개 이상 필요해요";
  if (activityId === "duel") {
    const need = 1 + game.rules.duelManaFee;
    if (player.manaTokens < need) return `마나토큰이 ${need}개 이상 필요해요`;
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
    mana: `마나토큰 +${a.amount}`,
    stamina: a.trigger === "prep" ? `체력토큰 +${a.amount}` : `다음 달 체력토큰 +${a.amount}`,
    rollBonus: `내 굴림 +${a.amount}`,
    enemyRollPenalty: `상대 굴림 -${a.amount}`,
    enemyStamina: `상대 다음 달 체력토큰 -${a.amount}`,
    immune: "낸 마나토큰 1개를 다음 달에 돌려받음",
    charmToken: `매력토큰 +${a.amount}`,
  }[a.effect];
  return `${when}: ${what}`;
}

// 마법생물 세트 수: 하늘·육지·바다를 1장씩 묶은 세트 (가장 적은 속성의 장수)
export function creatureSets(creatures: CreatureCard[]): number {
  return Math.min(...(["sky", "land", "ocean"] as CreatureElement[]).map((el) => creatures.filter((c) => c.element === el).length));
}

// 최종 점수: 마법 성취도(주문력 × 학점) + 마법생물 세트 점수
export function finalScore(game: Pick<GameState, "rules">, player: PlayerGameState): number {
  return effectiveStat(player, "spellPower") * player.credit + creatureSets(player.creatures) * game.rules.creatureSetScore;
}
