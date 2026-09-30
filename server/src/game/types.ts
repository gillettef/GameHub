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
  // 이 카드를 습득하는 데 드는 체력토큰 (카드마다 다르다. 카드를 열어 봐야 알 수 있다)
  takeCost: number;
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
  // 이 카드를 고르는 데 드는 체력토큰
  cost: number;
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
  // 마법생물과 같은 방식으로 동작하는 추가 능력 (선택)
  ability?: CreatureAbility;
}

export interface ExplorationCard {
  id: string;
  name: string;
  description: string;
  // 판정: 주사위 1개 + 해당 능력치 >= target 이면 성공. 없으면 무조건 성공
  check?: { stat: StatKey; target: number };
  // 협력 카드: 두 명이 함께해야 열린다. 둘의 (주사위 + stat) 합이 pairTarget 이상이면 성공하고 두 명 모두 효과를 받는다.
  // 끝까지 함께할 친구가 없으면 무효가 된다 (check는 쓰지 않는다)
  coop?: { stat: StatKey; pairTarget: number };
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
  // 1주차에 지력만큼 받는 지력토큰: 2주차에 수업카드를 여는 데 쓴다 (정리 때 소멸)
  intelligenceTokens: number;
  staminaTokens: number;
  // 1주차에 매력 수치만큼 받는 만능 토큰: 지력토큰·체력토큰이 모자랄 때 대신 낸다 (정리 때 소멸)
  charmTokens: number;
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

// 시험 카드 (examCards.ts): 시험 점수 = diceStat 수치만큼 굴린 주사위 합 + bonusStat 수치
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

// 주사위 굴리기 단계: 굴려야 하는 사람이 모두 버튼을 눌러 굴릴 때까지 게임이 기다린다
export interface PendingRoll {
  kind: "duel" | "exploration" | "exam";
  title: string;
  lines: string[];
  // dice가 null이면 아직 안 굴린 사람
  entries: { playerId: string; label: string; diceCount: number; dice: number[] | null }[];
}

// 협력 탐험 카드가 함께할 친구를 기다리는 중 (공개 정보)
export interface CoopWaiting {
  playerId: string;
  name: string;
  description: string;
  pairText: string;
  voidText: string;
  successText: string;
  failureText: string;
}

// 주문 대결 한 건: 도전자가 상대를 지목했다
export interface DuelPair {
  challengerId: string;
  targetId: string;
}

// 주사위 결과가 나온 뒤 처리에 필요한 서버 전용 정보 (클라이언트에는 보내지 않음)
export type RollContext =
  | { kind: "duel"; challengerId: string; targetId: string; challengerBoost: number; defenderBoost: number }
  | { kind: "exploration"; card: ExplorationCard; playerIds: string[]; boosts: Record<string, number>; mode: "single" | "pair" }
  | { kind: "exam"; examType: "midterm_exam" | "final_exam"; card: ExamCard };

export interface HiddenState {
  roll: RollContext | null;
  // 이번 게임의 시험 카드 (공개 시점 전에는 서버만 안다)
  examPlan: { midterm: ExamCard; final: ExamCard };
  // 협력 카드를 뽑았지만 아직 함께할 친구가 없는 상태 (boost: 뽑은 사람이 집중으로 쓴 체력토큰 효과)
  coop: { card: ExplorationCard; playerId: string; boost: number } | null;
}

export interface GameState {
  round: number;
  phase: GamePhase;
  turnOrder: string[];
  startingPlayerIndex: number;
  players: Record<string, PlayerGameState>;
  // 구역마다 최대 2명까지 참여할 수 있다 (먼저 들어온 사람이 있으면 체력토큰 1개를 더 낸다)
  activitySlots: Record<ActivityId, string[]>;
  activityOrder: string[];
  activityTurnPointer: number;
  // 이번 달 주문 대결 목록 (도전자 → 지목당한 사람). 지목당한 사람은 구역을 차지하지 않고 추가 비용도 내지 않는다
  duels: DuelPair[];
  // 연구실 실험 중 카드 선택 대기 (후보 카드는 고르는 본인에게만 전송)
  pendingLab: { playerId: string; cards: LabCard[] } | null;
  // 주사위를 굴리는 중 (주문 대결·탐험 판정·시험)
  pendingRoll: PendingRoll | null;
  // 함께할 친구를 기다리는 협력 탐험 카드
  coopWaiting: CoopWaiting | null;
  // 공개된 시험 카드 (3라운드 종료 후 중간고사, 9라운드 종료 후 기말고사 카드가 공개되기 전에는 null)
  exams: { midterm: ExamCard | null; final: ExamCard | null };
  examResults: ExamResult[];
  // 가장 최근 4주차(정리)에서 소멸한 토큰 (화면의 정리 연출용)
  cleanupSummary: { playerId: string; intelligenceTokens: number; staminaTokens: number; charmTokens: number; spellbookTokens: number }[];
  // 카드 덱·버림 더미와 주사위 처리 정보 (서버 전용, 클라이언트에는 전송하지 않음)
  hidden: HiddenState;
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
export type PublicGameState = Omit<GameState, "hidden" | "labPile" | "explorationPile" | "grimoirePile" | "classDeck" | "classDiscard" | "creatureDeck" | "creatureDiscard"> & {
  // 아직 열 수 있는 수업카드 수. 덱 구성은 비공개지만 남은 장수는 알려 준다
  classLeft: number;
  // 화면 표시용 규칙 수치 (config.ts의 BALANCE에서 가져옴)
  rules: PublicRules;
};

export interface PublicRules {
  // 카드를 한 장 열 때 드는 지력토큰 (수업카드·마법생물·비밀의 방·연구 카드 공통)
  openCardCost: number;
  activityMaxParticipants: number;
  activitySecondParticipantCost: number;
  duelCharmFee: number;
  // 시험이 열리는 라운드와, 시험 카드가 공개되는 라운드 (이 라운드가 끝난 뒤 공개)
  midtermRound: number;
  midtermRevealRound: number;
  finalRevealRound: number;
  // 매력토큰 교환: 기본 charmExchangeRate개 = 지력·체력토큰 1개 (카드로 최소 charmExchangeRateMin개까지)
  charmExchangeRate: number;
  charmExchangeRateMin: number;
  // 마법 토너먼트 최종 순위 보상 (1위, 2위 순서, 학점)
  tournamentRewards: number[];
}
