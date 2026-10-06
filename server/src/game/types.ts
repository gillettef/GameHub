export type StatKey = "intelligence" | "stamina" | "charm" | "spellPower";

export type ActivityId =
  | "tournament" // 마법 토너먼트 참가
  | "creature" // 마법생물 조련
  | "duel" // 주문 대결
  | "exploration" // 비밀의 방 탐색
  | "lab"; // 연구실 실험

// 4주차(정리)에서 다음 달로 남기는 기운: 네 종류(지력·체력·매력·마나) 중 1개, 또는 남기지 않기
export type KeptToken = "intelligence" | "stamina" | "charm" | "mana";

export type GamePhase = "setup" | "prep" | "class" | "activity" | "cleanup" | "midterm_exam" | "final_exam" | "ended";

// 수업카드 = 과목 (42절). 가져가면 그 과목의 기운(stat이 주문력이면 마나기운)을 gain만큼 무료로 얻는다 (한도까지). 능력치는 올려 주지 않는다.
// 중급(mid)·심화(advanced)는 그 과목 능력치가 minStat 이상이어야 가져갈 수 있다 (선수과목)
export interface ClassCard {
  id: string;
  name: string;
  description: string;
  stat: StatKey;
  level: "intro" | "basic" | "mid" | "advanced";
  gain: number;
  minStat?: number;
}

// 카드 효과 묶음 (탐험/연구 카드 공용). 영구 능력치, 시험까지 유지되는 임시 능력치, 학점,
// 다음 달 마나기운/체력기운(그 달의 기운은 4주차에 소멸하므로 다음 달 준비 때 반영), 탐험 카드 엿보기
export interface CardEffect {
  stats?: Partial<Record<StatKey, number>>;
  tempStats?: Partial<Record<StatKey, number>>;
  credit?: number;
  nextMana?: number;
  nextStamina?: number;
  peekExploration?: boolean;
}

// 연구 카드 (연구실 실험 = 심화학습). study: 능력치 영구 증가 / exam: 시험까지 유지되는 임시 능력치·학점 /
// insight: 탐험 카드 덱 맨 위 엿보기 / supply: 다음 달 기운
export type LabCardKind = "study" | "exam" | "insight" | "supply";

export interface LabCard {
  id: string;
  name: string;
  description: string;
  // 이 카드를 고르는 데 드는 체력기운
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
  // 마법생물과 같은 방식으로 동작하는 추가 능력 (선택)
  ability?: CreatureAbility;
}

export interface ExplorationCard {
  id: string;
  name: string;
  description: string;
  // 판정: 마나기운을 내고 굴린 주사위 합이 목표값 이상이면 성공 (2026-10-02부터 stat은 표시·분류용이고 주사위 수와 무관하다). target은 난이도 × 10 (10이 표준, 라운드마다 목표값이 기준 능력치에 맞춰 오른다). 없으면 무조건 성공
  check?: { stat: StatKey; target: number };
  // 협력 카드: 두 명이 함께해야 열린다. 각자 마나기운을 내고 주사위를 굴려 둘의 합이 목표값(pairTarget은 난이도 × 18) 이상이면 성공하고 두 명 모두 효과를 받는다.
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
  // 임시 능력치: 얻은 달의 다음 달 4주차(정리)에 소멸한다 (시험이 끝나도 사라진다)
  tempBoosts: Partial<Record<StatKey, number>>;
  // tempBoosts 중 지난달 이전에 얻어 이번 달 4주차(정리)에 소멸할 몫
  tempAged: Partial<Record<StatKey, number>>;
  // equipment 중 지난달 이전에 얻어 이번 달 4주차(정리)에 버려질 카드 id
  equipmentAgedIds: string[];
  // 기운(현재치, 40절): 능력치(실력)가 최대치, 이것이 컨디션이다. 매달 1주차에 능력치만큼 차오르고 능력치 × energyCapMultiplier까지 모아 둘 수 있다.
  // 활동에서 쓰면 줄어들고 안 쓴 만큼은 다음 달로 이어진다 (이름은 예전 "기운"에서 이어진 필드명)
  intelligenceTokens: number;
  staminaTokens: number;
  charmTokens: number;
  manaTokens: number;
  // 마법생물 효과로 다음 달 준비(1주차) 때 체력기운에 더해지는(또는 빼지는) 값
  pendingStaminaTokens: number;
  pendingManaTokens: number;
  tournamentTrack: number;
  // 졸업식에서 받은 부문상 (게임이 끝날 때 정해진다, 41절): 해당 능력치가 가장 높은 플레이어(동점이면 공동)가 받는다
  awards: StatKey[];
  classCards: ClassCard[];
  creatures: CreatureCard[];
  // 임시 능력치 효과가 남아 있는 연구 카드 (시험 대비 카드)
  equipment: LabCard[];
  peekedExploration: PeekedExploration | null;
  grimoires: GrimoireCard[];
  hasActedThisPhase: boolean;
}

export interface GameLogEntry {
  round: number;
  message: string;
}

// 시험 카드 (examCards.ts): 시험 점수 = 마나기운으로 굴린 주사위 합 + diceStat 수치 + bonusStat 수치 (결과의 bonus는 두 능력치 수치의 합)
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
// 모두 굴리면 결과를 보여 주고, 굴린 사람들은 (마나기운으로 일부 주사위를 다시 굴린 뒤) "확인"을 눌러야 결과가 적용된다
// 선 정하기를 뺀 모든 굴림은 마나기운을 1~보유 개수 사이에서 골라 내고 낸 개수만큼 굴린다 (마나기운이 없으면 공짜 주사위 1개, 다시 굴리기는 마나기운 1개당 주사위 1개)
export interface PendingRoll {
  kind: "first" | "tournament" | "creature" | "lab" | "duel" | "exploration" | "exam";
  title: string;
  lines: string[];
  // dice가 null이면 아직 안 굴린 사람, confirmed는 결과를 확인하고 다음으로 넘기기를 누른 사람
  // diceChoiceMax가 있으면 굴리기 전에 마나기운을 1~max개 내고 낸 개수만큼 굴릴 수 있다 (diceCount는 굴림 버튼의 기본 개수)
  // diceToken은 이 굴림의 주사위 재료 기운이다 (없으면 마나기운, 39절). assistMax가 있으면 굴리기 전에 보조 능력치 기운(assist.kind)을 0~max개 더 낼 수 있다. 낸 개수는 assist에 남는다 (38-6절)
  entries: { playerId: string; label: string; diceCount: number; diceToken?: KeptToken; diceChoiceMax?: number; assistMax?: number; assist?: number; dice: number[] | null; confirmed: boolean; rerolls: number; rerollCounts?: number[] }[];
  // 이 굴림에서 보조 능력치로 쓸 수 있는 기운 (토너먼트: 체력기운 "끝까지 달려요", 탐험: 지력기운 "함정 간파"). 없으면 해당 없음
  assist?: { kind: "stamina" | "intelligence"; name: string; title: string; hint: string };
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

// 3주차 선택 단계에서 각자 고른 활동 (모두에게 공개). 진행 단계에서는 이 순서대로 하나씩 처리한다
export interface ActivityChoice {
  playerId: string;
  activityId: ActivityId;
  // 주문 대결이면 지목한 친구
  targetPlayerId?: string;
}

// 진행이 끝난 활동의 결과 (진행 단계에서 화면에 보여 줌)
export interface ActivityResult {
  playerId: string;
  activityId: ActivityId;
  lines: string[];
}

// 주문 대결 한 건: 도전자가 상대를 지목했다
export interface DuelPair {
  challengerId: string;
  targetId: string;
}

// 주사위 결과가 나온 뒤 처리에 필요한 서버 전용 정보 (클라이언트에는 보내지 않음)
export type RollContext =
  | { kind: "first"; contenders: string[] }
  | { kind: "tournament"; playerId: string }
  | { kind: "creature"; playerId: string; card: CreatureCard; target: number }
  | { kind: "lab"; playerId: string; card: LabCard; target: number }
  | { kind: "duel"; challengerId: string; targetId: string }
  | { kind: "exploration"; card: ExplorationCard; playerIds: string[]; mode: "single" | "pair"; target: number }
  | { kind: "exam"; examType: "midterm_exam" | "final_exam"; card: ExamCard };

// 구역에 공개된 카드를 화면에 보여 주기 위한 정보 (카드 종류와 상관없이 같은 모양)
export interface OfferCardView {
  id: string;
  name: string;
  description: string;
  lines: string[];
  // 이 카드를 가져가는 데 드는 비용 (체력기운)
  cost?: { kind: "stamina"; amount: number };
  // 카드 이름 아래에 붙는 짧은 분류 (마법생물의 속성 · 종류)
  tags?: string;
}

export interface ActivityOffer {
  cards: OfferCardView[];
}

export type OfferedCard = CreatureCard | LabCard | ExplorationCard | GrimoireCard;

export interface HiddenState {
  roll: RollContext | null;
  // 구역에 공개된 실제 카드 (activityOffers와 같은 순서·같은 장수)
  offers: Partial<Record<ActivityId, OfferedCard[]>>;
  // 이번 게임의 시험 카드 (공개 시점 전에는 서버만 안다)
  examPlan: { midterm: ExamCard; final: ExamCard };
  // 협력 카드를 뽑았지만 아직 함께할 친구가 없는 상태
  coop: { card: ExplorationCard; playerId: string } | null;
  // 진행 단계에서 지금 처리 중인 활동이 시작될 때의 로그 길이 (활동 결과 문구를 모으는 용도)
  resolveLogStart?: number;
}

export interface GameState {
  round: number;
  phase: GamePhase;
  turnOrder: string[];
  // 이번 달 선 플레이어(turnOrder의 인덱스). 정규수업·자율활동 모두 선부터 시계방향(turnOrder 순서)으로 진행한다
  startingPlayerIndex: number;
  players: Record<string, PlayerGameState>;
  // 구역마다 최대 2명까지 참여할 수 있다 (먼저 들어온 사람이 있으면 매력기운 1개를 더 낸다)
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
  // 이번 달 주문 대결 목록 (도전자 → 지목당한 사람). 지목당한 사람은 구역을 차지하지 않고 추가 비용도 내지 않는다
  duels: DuelPair[];
  // 2주차(정규수업): 이번 달에 공개된 수업카드(인원수+1장, 모두 볼 수 있다)와 선택 순서(선 다음 사람부터 시계방향, 선이 마지막). 순서대로 1장씩 가져간다
  classMarket: ClassCard[];
  classPickOrder: string[];
  classPickPointer: number;
  // 3주차(자율활동): 구역에 처음 들어온 사람이 열어 둔 카드(모두 볼 수 있다). 먼저 온 사람이 원하는 카드를 가져가고 남는 카드는 두 번째 참가자가 가져간다
  activityOffers: Partial<Record<ActivityId, ActivityOffer>>;
  // 공개된 카드 중 하나를 고르는 중 (take: 구역에서 카드 가져가기, reward: 주문 대결 승자의 마도서 선택)
  pendingPick: { playerId: string; activityId: ActivityId; mode: "take" | "reward" } | null;
  // 주사위를 굴리는 중 (주문 대결·탐험 판정·시험)
  pendingRoll: PendingRoll | null;
  // 함께할 친구를 기다리는 협력 탐험 카드
  coopWaiting: CoopWaiting | null;
  // 공개된 시험 카드 (3라운드 종료 후 중간고사, 9라운드 종료 후 기말고사 카드가 공개되기 전에는 null)
  exams: { midterm: ExamCard | null; final: ExamCard | null };
  examResults: ExamResult[];
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
  // 카드를 한 장 열 때 드는 지력기운 (구역에 처음 들어온 사람이 낸다. 정규수업 시장은 해당 없음)
  openCardCost: number;
  // 위 지력기운이 드는 활동 (지금은 없음)
  openCardCostActivities: ActivityId[];
  // 활동별 주사위 재료 기운 (조련=매력, 탐험=체력, 연구실=지력, 토너먼트·주문 대결=마나)
  rollFuel: Record<ActivityId, KeptToken>;
  // 기운을 모아 둘 수 있는 한도 = 능력치 × 이 배수 (매달 능력치만큼 차오른다)
  energyCapMultiplier: number;
  activityMaxParticipants: number;
  activitySecondParticipantCost: number;
  duelCharmFee: number;
  duelManaFee: number;
  // 시험이 열리는 라운드와, 시험 카드가 공개되는 라운드 (이 라운드가 끝난 뒤 공개)
  midtermRound: number;
  midtermRevealRound: number;
  finalRevealRound: number;
  // 마법 토너먼트 최종 순위 보상 (1위, 2위 순서, 학점)
  tournamentRewards: number[];
  // 최종 점수 = 주문력 × 학점 + 마법생물 세트(하늘·육지·바다 1장씩) 수 × creatureSetScore + 졸업식 부문상 수 × graduationAwardScore
  creatureSetScore: number;
  // 졸업식 부문상 하나당 점수 (지력 수석상·체력 튼튼상·매력 인기상·주문력 마법상)
  graduationAwardScore: number;
  // 부문상을 주는 능력치
  graduationAwardStats: StatKey[];
}
