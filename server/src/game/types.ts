export type StatKey = "intelligence" | "stamina" | "charm" | "spellPower";

export type ActivityId =
  | "tournament" // 마법 토너먼트 참가
  | "creature" // 마법생물 조련
  | "duel" // 주문 대결
  | "exploration" // 비밀의 방 탐색
  | "lab"; // 연구실 실험

export type GamePhase = "prep" | "class" | "activity" | "cleanup" | "midterm_exam" | "final_exam" | "ended";

export interface ClassCard {
  id: string;
  name: string;
  statBoost: { stat: StatKey; amount: number };
}

export interface EquipmentCard {
  id: string;
  name: string;
  tempBoost: { stat: StatKey; amount: number };
}

export interface CreatureCard {
  id: string;
  name: string;
  requiredSpellPower: number;
}

export interface GrimoireCard {
  id: string;
  name: string;
  statBoost: { stat: StatKey; amount: number };
}

export interface ExplorationCard {
  id: string;
  name: string;
  rewardStaminaTokens: number;
}

export interface PlayerGameState {
  id: string;
  name: string;
  intelligence: number;
  stamina: number;
  charm: number;
  spellPower: number;
  credit: number;
  tempBoosts: Partial<Record<StatKey, number>>;
  staminaTokens: number;
  spellbookTokens: number;
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

export function effectiveStat(player: PlayerGameState, stat: StatKey): number {
  return player[stat] + (player.tempBoosts[stat] ?? 0);
}
