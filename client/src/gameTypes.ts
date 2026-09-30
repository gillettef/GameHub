import type { IconName } from "./Icons";

export type StatKey = "intelligence" | "stamina" | "charm" | "spellPower";

export type ActivityId = "tournament" | "creature" | "duel" | "exploration" | "lab";

export type GamePhase = "prep" | "class" | "activity" | "cleanup" | "midterm_exam" | "final_exam" | "ended";

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
  effect: "spellPower" | "spellbook" | "stamina" | "rollBonus" | "enemyRollPenalty" | "enemyStamina" | "immune" | "charmRate";
  amount: number;
}

export interface CreatureCard {
  id: string;
  cardNo: number;
  name: string;
  element: CreatureElement;
  kind: "animal" | "plant";
  requiredSpellPower: number;
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
  spellbookTokens: number;
  pendingStaminaTokens: number;
  pendingSpellbookTokens: number;
  peekedExploration: PeekedExploration | null;
  tournamentTrack: number;
  classCards: ClassCard[];
  creatures: CreatureCard[];
  equipment: LabCard[];
  grimoires: GrimoireCard[];
  offeredClassCards: ClassCard[];
  hasActedThisPhase: boolean;
}

export interface GameLogEntry {
  round: number;
  message: string;
}

export interface ExamResult {
  round: number;
  scores: { playerId: string; score: number; dice: number[]; rank: number; creditAwarded: number }[];
}

// 주사위를 굴리는 중 (주문 대결·탐험 판정·시험). dice가 null이면 아직 안 굴린 사람
export interface PendingRoll {
  kind: "duel" | "exploration" | "exam";
  title: string;
  lines: string[];
  entries: { playerId: string; label: string; diceCount: number; dice: number[] | null }[];
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
  // 카드를 한 장 열 때 드는 지력토큰 (수업카드·마법생물·비밀의 방·연구 카드·마도서 공통)
  openCardCost: number;
  activityMaxParticipants: number;
  activitySecondParticipantCost: number;
  duelCharmFee: number;
  charmExchangeRate: number;
  charmExchangeRateMin: number;
  // 마법 토너먼트 최종 순위 보상 (1위, 2위 순서, 학점)
  tournamentRewards: number[];
}

export interface GameState {
  round: number;
  phase: GamePhase;
  turnOrder: string[];
  startingPlayerIndex: number;
  players: Record<string, PlayerGameState>;
  activitySlots: Record<ActivityId, string[]>;
  activityOrder: string[];
  activityTurnPointer: number;
  duels: DuelPair[];
  pendingLab: { playerId: string; cards: LabCard[] } | null;
  pendingRoll: PendingRoll | null;
  coopWaiting: CoopWaiting | null;
  examResults: ExamResult[];
  cleanupSummary: { playerId: string; intelligenceTokens: number; staminaTokens: number; charmTokens: number; spellbookTokens: number }[];
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

export const ACTIVITY_LABEL: Record<ActivityId, string> = {
  tournament: "마법 토너먼트 참가",
  creature: "마법생물 조련",
  duel: "주문 대결",
  exploration: "비밀의 방 탐색",
  lab: "연구실 실험",
};

// 활동 카드에 함께 보여줄 한 줄 설명 (집중하면 +1)
export const ACTIVITY_HINT: Record<ActivityId, string> = {
  tournament: "주문력만큼 트랙 전진 (집중: +1칸)",
  creature: "주문서로 마법생물 획득, 속성을 모으면 학점 (집중: 주문서 -1)",
  duel: "아직 안 고른 한 명을 지목해 강제 대결, 이기면 마도서 (집중: +1)",
  exploration: "한방 노리기! 크게 벌거나 크게 잃는 판정 (집중: +1)",
  lab: "심화학습: 지력만큼 연구 카드를 펼쳐 1장 고르기, 카드마다 체력토큰이 들어요 (집중: +1장)",
};

export function effectiveStat(player: PlayerGameState, stat: StatKey): number {
  return Math.max(0, player[stat] + (player.tempBoosts[stat] ?? 0));
}

// ── 자율활동 구역 선택 규칙 (서버 engine.ts와 같은 규칙. 버튼을 미리 막고 이유를 보여 주기 위해 복제) ──

// 카드를 여는 활동에서 내야 하는 지력토큰 (연구실은 펼치는 카드 한 장마다). 이미 열린 협력 탐험 카드에 합류할 때는 없다
export function activityOpenCost(game: GameState, activityId: ActivityId): number {
  if (activityId === "creature" || activityId === "lab" || activityId === "duel") return game.rules.openCardCost;
  if (activityId === "exploration") return game.coopWaiting ? 0 : game.rules.openCardCost;
  return 0;
}

// 이미 다른 플레이어가 있는 구역에 들어갈 때 내야 하는 체력토큰
export function activityExtraCost(game: GameState, activityId: ActivityId): number {
  return game.activitySlots[activityId].length >= 1 ? game.rules.activitySecondParticipantCost : 0;
}

// 주문 대결에서 지목할 수 있는 플레이어 (아직 자율활동을 고르지 않은 사람)
export function duelTargets(game: GameState, playerId: string): string[] {
  return game.turnOrder.filter((id) => id !== playerId && !game.players[id].hasActedThisPhase);
}

// 매력토큰 몇 개가 지력토큰·체력토큰 1개가 되는가 (서버 charmRate와 같은 규칙)
export function charmRate(game: GameState, player: PlayerGameState): number {
  const abilities = [...player.creatures.map((c) => c.ability), ...player.grimoires.flatMap((g) => (g.ability ? [g.ability] : []))];
  const cut = abilities.filter((a) => a.trigger === "always" && a.effect === "charmRate").reduce((sum, a) => sum + a.amount, 0);
  return Math.max(game.rules.charmExchangeRateMin, game.rules.charmExchangeRate - cut);
}

// 지력토큰 int개 + 체력토큰 stamina개 + (매력토큰 1개로도 낼 수 있는) 참가비 fee개를 낼 수 있는가 (서버 planPayment와 같은 규칙)
export function canPay(game: GameState, player: PlayerGameState, int: number, stamina: number, fee = 0): boolean {
  const rate = charmRate(game, player);
  for (let k = Math.min(fee, player.charmTokens); k >= 0; k--) {
    const lack = Math.max(0, int - player.intelligenceTokens) + Math.max(0, stamina + fee - k - player.staminaTokens);
    if (lack * rate <= player.charmTokens - k) return true;
  }
  return false;
}

// 이 활동을 고를 수 없는 이유 (고를 수 있으면 null)
export function activityBlockReason(game: GameState, playerId: string, activityId: ActivityId): string | null {
  const player = game.players[playerId];
  if (game.activitySlots[activityId].length >= game.rules.activityMaxParticipants) return "이미 두 명이 참여했어요";
  const extra = activityExtraCost(game, activityId);
  if (!canPay(game, player, 0, 0, extra)) return `체력토큰 ${extra}개가 더 필요해요 (매력토큰 ${extra}개로도 낼 수 있어요)`;
  const open = activityOpenCost(game, activityId);
  if (!canPay(game, player, open, 0, extra)) return `카드를 열 지력토큰 ${open}개가 필요해요 (매력토큰 ${charmRate(game, player)}개 = 지력토큰 1개)`;
  if (activityId === "duel") {
    if (duelTargets(game, playerId).length === 0) return "지목할 수 있는 친구가 없어요";
    if (player.charm < game.rules.duelCharmFee) return `건넬 매력(${game.rules.duelCharmFee})이 없어요`;
  }
  return null;
}

export const ELEMENT_LABEL: Record<CreatureElement, string> = { sky: "하늘", land: "육지", ocean: "바다" };

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
    spellbook: `마법 주문서 +${a.amount}`,
    stamina: a.trigger === "prep" ? `체력토큰 +${a.amount}` : `다음 달 체력토큰 +${a.amount}`,
    rollBonus: `내 굴림 +${a.amount}`,
    enemyRollPenalty: `상대 굴림 -${a.amount}`,
    enemyStamina: `상대 다음 달 체력토큰 -${a.amount}`,
    immune: "주문서를 잃지 않음",
    charmRate: `매력토큰 교환 비율 -${a.amount} (매력토큰 2개 = 다른 토큰 1개)`,
  }[a.effect];
  return `${when}: ${what}`;
}
