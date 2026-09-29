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

// 카드 효과 묶음 (탐험/연구 카드 공용). 영구 능력치, 시험까지 유지되는 임시 능력치, 학점,
// 다음 달 마법 주문서/체력토큰(그 달의 토큰은 4주차에 소멸하므로 다음 달 준비 때 반영), 탐험 카드 엿보기
export interface CardEffect {
  stats?: Partial<Record<StatKey, number>>;
  tempStats?: Partial<Record<StatKey, number>>;
  credit?: number;
  nextSpellbook?: number;
  nextStamina?: number;
  peekExploration?: boolean;
}

// 연구 카드 (연구실 실험 = 심화학습). study: 능력치 영구 증가 / exam: 시험까지 유지되는 임시 능력치·학점 /
// insight: 탐험 카드 덱 맨 위 엿보기 / supply: 다음 달 토큰
export type LabCardKind = "study" | "exam" | "insight" | "supply";

export interface LabCard {
  id: string;
  name: string;
  description: string;
  kind: LabCardKind;
  effect: CardEffect;
  // 효과를 한 줄로 풀어 쓴 문구 (클라이언트 표시용)
  summary: string;
}

// 엿본 탐험 카드 (엿본 사람에게만 전송)
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
  pendingSpellbookTokens: number;
  tournamentTrack: number;
  classCards: ClassCard[];
  creatures: CreatureCard[];
  // 다음 시험까지 유지되는 연구 카드 (시험 카드)
  equipment: LabCard[];
  peekedExploration: PeekedExploration | null;
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
  // 이번 달 주문 대결에서 강제 지목당한 플레이어
  duelTargetId: string | null;
  // 연구실 실험 중 카드 선택 대기 (후보 카드는 고르는 본인에게만 전송)
  pendingLab: { playerId: string; cards: LabCard[] } | null;
  examResults: ExamResult[];
  // 수업카드/마법생물 카드 덱·버림 더미 (서버 전용, 클라이언트에는 전송하지 않음)
  labPile: Pile<LabCard>;
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
  return Math.max(0, player[stat] + (player.tempBoosts[stat] ?? 0));
}

// 클라이언트에 전송되는 게임 상태 (서버 전용 덱 정보 제외)
export type PublicGameState = Omit<GameState, "labPile" | "explorationPile" | "grimoirePile" | "classDeck" | "classDiscard" | "creatureDeck" | "creatureDiscard">;
