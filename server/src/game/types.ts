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
  description: string;
  statBoost: { stat: StatKey; amount: number };
}

// 카드 효과 묶음 (탐험/장비 공용). 영구 능력치, 시험까지 유지되는 임시 능력치, 학점, 마법 주문서, 다음 달 체력토큰
export interface CardEffect {
  stats?: Partial<Record<StatKey, number>>;
  tempStats?: Partial<Record<StatKey, number>>;
  credit?: number;
  spellbookTokens?: number;
  nextStamina?: number;
}

export interface EquipmentCard {
  id: string;
  name: string;
  description: string;
  // 다음 시험까지 유지되는 임시 능력치 증가 (시험 후 카드는 버림 더미로)
  tempBoosts: Partial<Record<StatKey, number>>;
  // 장비를 얻는 즉시 받는 학점 (소량 학점 경로)
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
  // 마법생물과 같은 방식으로 동작하는 추가 능력 (선택)
  ability?: CreatureAbility;
}

export interface ExplorationCard {
  id: string;
  name: string;
  description: string;
  // 판정: 주사위 1개 + 해당 능력치 >= target 이면 성공. 없으면 무조건 성공
  check?: { stat: StatKey; target: number };
  success: CardEffect;
  failure: CardEffect;
}

// 뽑을 더미 + 버림 더미 (서버 전용)
export interface Pile<T> {
  draw: T[];
  discard: T[];
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
  // 마법생물 효과로 다음 달 준비(1주차) 때 체력토큰에 더해지는(또는 빼지는) 값
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
  // 수업카드/마법생물 카드 덱·버림 더미 (서버 전용, 클라이언트에는 전송하지 않음)
  equipmentPile: Pile<EquipmentCard>;
  explorationPile: Pile<ExplorationCard>;
  grimoirePile: Pile<GrimoireCard>;
  classDeck: ClassCard[];
  classDiscard: ClassCard[];
  creatureDeck: CreatureCard[];
  creatureDiscard: CreatureCard[];
  log: GameLogEntry[];
  winnerIds?: string[];
}

export function effectiveStat(player: PlayerGameState, stat: StatKey): number {
  return player[stat] + (player.tempBoosts[stat] ?? 0);
}

// 클라이언트에 전송되는 게임 상태 (서버 전용 덱 정보 제외)
export type PublicGameState = Omit<GameState, "equipmentPile" | "explorationPile" | "grimoirePile" | "classDeck" | "classDiscard" | "creatureDeck" | "creatureDiscard">;
