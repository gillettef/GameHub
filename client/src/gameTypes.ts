export type StatKey = "intelligence" | "stamina" | "charm" | "spellPower";

export type ActivityId = "tournament" | "creature" | "duel" | "exploration" | "lab";

export type GamePhase = "prep" | "class" | "activity" | "cleanup" | "midterm_exam" | "final_exam" | "ended";

export interface ClassCard {
  id: string;
  name: string;
  description: string;
  statBoost: { stat: StatKey; amount: number };
}

export interface EquipmentCard {
  id: string;
  name: string;
  description: string;
  tempBoosts: Partial<Record<StatKey, number>>;
  credit?: number;
}

export type CreatureElement = "sky" | "land" | "ocean";

export interface CreatureAbility {
  trigger: "acquire" | "prep" | "duel" | "defend" | "lose";
  effect: "spellPower" | "spellbook" | "stamina" | "rollBonus" | "enemyRollPenalty" | "enemyStamina" | "immune";
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
  staminaTokens: number;
  spellbookTokens: number;
  pendingStaminaTokens: number;
  tournamentTrack: number;
  classCards: ClassCard[];
  creatures: CreatureCard[];
  equipment: EquipmentCard[];
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
  scores: { playerId: string; score: number; rank: number; creditAwarded: number }[];
}

export interface GameState {
  round: number;
  phase: GamePhase;
  turnOrder: string[];
  startingPlayerIndex: number;
  players: Record<string, PlayerGameState>;
  activitySlots: Record<ActivityId, string | null>;
  activityOrder: string[];
  activityTurnPointer: number;
  examResults: ExamResult[];
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
  creature: "주문서로 마법생물 데려오기 (집중: 주문서 -1)",
  duel: "주사위 + 주문력으로 승부 (집중: +1)",
  exploration: "주사위 + 능력치로 판정 (집중: +1)",
  lab: "지력만큼 재료를 펼쳐 최고의 장비 획득 (집중: +1장)",
};

export function effectiveStat(player: PlayerGameState, stat: StatKey): number {
  return player[stat] + (player.tempBoosts[stat] ?? 0);
}

export const ELEMENT_ICON: Record<CreatureElement, string> = { sky: "☁️", land: "🌱", ocean: "🌊" };

export function describeAbility(a: CreatureAbility): string {
  const when = { acquire: "획득 즉시", prep: "매달 준비 때", duel: "주문 대결 참여 시", defend: "대결 도전받을 때", lose: "대결 패배 시" }[a.trigger];
  const what = {
    spellPower: `주문력 영구 +${a.amount}`,
    spellbook: `마법 주문서 +${a.amount}`,
    stamina: a.trigger === "prep" ? `체력토큰 +${a.amount}` : `다음 달 체력토큰 +${a.amount}`,
    rollBonus: `내 굴림 +${a.amount}`,
    enemyRollPenalty: `상대 굴림 -${a.amount}`,
    enemyStamina: `상대 다음 달 체력토큰 -${a.amount}`,
    immune: "주문서를 잃지 않음",
  }[a.effect];
  return `${when}: ${what}`;
}
