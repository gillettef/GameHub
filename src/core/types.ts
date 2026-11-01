// Neoterra 게임 상태·정의 타입 (규칙 정본: notes/Rules.md)

export type Doctrine = 'ark' | 'symbiont' | 'synth';
export const DOCTRINES: Doctrine[] = ['ark', 'symbiont', 'synth'];

export type ResKey = 'food' | 'prod' | 'energy' | 'sci' | 'culture';
export const RES_KEYS: ResKey[] = ['food', 'prod', 'energy', 'sci', 'culture'];
export type Res = Record<ResKey, number>;

export type BuildingKind = 'farm' | 'workshop' | 'power' | 'lab' | 'hall';
export const BUILDING_KINDS: BuildingKind[] = ['farm', 'workshop', 'power', 'lab', 'hall'];
export type UnitKind = 'guard' | 'rider' | 'battery' | 'flyer';
export const UNIT_KINDS: UnitKind[] = ['guard', 'rider', 'battery', 'flyer'];

export type Direction = 'agri' | 'industry' | 'power' | 'academic' | 'culture' | 'defense';
export const DIRECTIONS: Direction[] = ['agri', 'industry', 'power', 'academic', 'culture', 'defense'];

export type Era = 1 | 2 | 3 | 4;
export type Ring = 1 | 2 | 3;

export type CharterField = 'prosperity' | 'explore' | 'defense' | 'bond';
export const CHARTER_FIELDS: CharterField[] = ['prosperity', 'explore', 'defense', 'bond'];

/** 영구 수정치. 여러 출처(곁가지·노선·헌장·후원자·유산·주둔지·특수 시설·위성)를 합산한다 */
export interface Mods {
  health: number;
  sporeCap: number;
  might: number;
  command: number;
  defense: number;
  sight: number;
  researchDiscount: number;
  trunkDiscount: number;
  buildingCap: number;
  unitCap: number;
  foodUpkeep: number;
  unitUpgradeDiscount: number;
  raidBonus: number;
  income: Partial<Res>;
  unitPower: Partial<Record<UnitKind, number>>;
}

/** 즉시 효과 */
export interface Instant {
  gain?: Partial<Res>;
  doctrine?: Partial<Record<Doctrine, number>>;
  colonist?: number;
}

// ── 지표·조건 ──
export type Metric =
  | 'might'
  | 'nodes'
  | 'trunks'
  | 'buildingLevels'
  | 'buildings'
  | 'units'
  | 'cultureRate'
  | 'sciRate'
  | 'foodRate'
  | 'prodRate'
  | 'energy'
  | 'satellites'
  | 'colonists'
  | 'halls'
  | 'labs'
  | 'farms'
  | 'workshops'
  | 'powers'
  | 'riders'
  | 'batteries'
  | 'doctrineTotal'
  | 'ark'
  | 'symbiont'
  | 'synth'
  | 'legacies'
  | 'health';

export interface Cond {
  metric: Metric;
  min: number;
}

// ── 테크 웹 ──
export interface TwigDef {
  id: string;
  ring: Ring;
  name: string;
  doctrine: Doctrine;
  points: number;
  instant?: Instant;
  mods?: Partial<Mods>;
  text?: string;
}

export interface WebLayout {
  /** 원 둘레 순서. 0번은 항상 농업 */
  dirOrder: Direction[];
  /** 줄기 노드 id → 곁가지 정의 id 2개 */
  twigs: Record<string, string[]>;
}

export type NodeKind = 'core' | 'trunk' | 'twig';
export interface TechNode {
  id: string;
  kind: NodeKind;
  ring: 0 | Ring;
  direction?: Direction;
  twig?: TwigDef;
  parent?: string;
}

// ── 후원자·유산·자원 팟(퀘스트 덱에 섞임) ──
export interface PioneerDef {
  type: 'pioneer';
  id: string;
  ring: Ring;
  name: string;
  doctrine: Doctrine;
  mods: Partial<Mods>;
  text?: string;
}
export interface LegacyDef {
  type: 'legacy';
  id: string;
  ring: Ring;
  name: string;
  /** 단계마다 생산 비용 */
  stages: number[];
  mods: Partial<Mods>;
  points: number;
  text?: string;
}
export interface SupplyDef {
  type: 'supply';
  id: string;
  ring: Ring;
  name: string;
  copies: number;
  instant: Instant;
  text?: string;
}
/** 습격 카드(Rules 10.2): 손에 들었다가 대외 단계에 습격으로 낸다 */
export interface RaidDef {
  type: 'raid';
  id: string;
  ring: Ring;
  name: string;
  copies: number;
  /** 성공 시 고를 수 있는 효과 */
  effects: RaidEffect[];
  /** 공격값 보정 */
  atk: number;
  /** 획득량 추가 */
  bonus: number;
  text?: string;
}
/** 분쟁 카드(Rules 10.3): 손에 들었다가 대외 단계에 분쟁으로 선포한다 */
export interface ConflictDef {
  type: 'conflict';
  id: string;
  ring: Ring;
  name: string;
  copies: number;
  loss: ConflictLoss;
  /** 판정 때 공격값 보정 */
  atk: number;
  text?: string;
}
export type CardDef = PioneerDef | LegacyDef | SupplyDef | RaidDef | ConflictDef;
/** 손에 드는 카드 종류 */
export const HAND_TYPES: CardDef['type'][] = ['supply', 'raid', 'conflict'];

// ── 퀘스트 ──
export interface QuestOption {
  doctrine: Doctrine;
  points: number;
  gain?: Partial<Res>;
}
export type ThreatTarget = 'weakest' | 'weakest2' | 'energyMost' | 'all' | Doctrine;
export interface Loss {
  res?: Partial<Res>;
  downgrade?: number;
  colonist?: number;
}
interface QuestBase {
  id: string;
  name: string;
  text?: string;
}
export interface JudgeQuest extends QuestBase {
  kind: 'judge';
  era: Ring;
  cond: Cond[];
  options: QuestOption[];
  failLoss?: Loss;
}
export interface ThreatQuest extends QuestBase {
  kind: 'threat';
  era: Ring;
  power: number;
  target: ThreatTarget;
  reward: Partial<Res>;
  loss: Loss;
}
export interface ContestQuest extends QuestBase {
  kind: 'contest';
  era: Ring;
  cond: Cond[];
  cost: Partial<Res>;
  options: QuestOption[];
  facility?: string;
}
export interface PatronQuest extends QuestBase {
  kind: 'patron';
  era: Ring;
}
export interface FruitionQuest extends QuestBase {
  kind: 'fruition';
  doctrine: Doctrine;
}
export interface FinaleQuest extends QuestBase {
  kind: 'finale';
  metric: Metric;
  divisor: number;
}
export type QuestDef = JudgeQuest | ThreatQuest | ContestQuest | PatronQuest | FruitionQuest | FinaleQuest;

export interface FacilityDef {
  id: string;
  name: string;
  mods: Partial<Mods>;
  text?: string;
}

export interface PatronDef {
  id: string;
  era: Ring;
  name: string;
  /** 주둔지를 받을 사람을 정하는 지표 */
  metric: Metric;
  mods: Partial<Mods>;
  demand: Cond;
  points: number;
  text?: string;
}

export interface SatelliteDef {
  id: string;
  name: string;
  cost: number;
  timer: number;
  mods: Partial<Mods>;
  text?: string;
}

// ── 상태 ──
export type Levels = number[]; // 레벨별 개수 [Lv0, Lv1, Lv2, Lv3]

export interface PlayerState {
  id: number;
  name: string;
  isAI: boolean;
  res: Res;
  researched: string[];
  buildings: Record<BuildingKind, Levels>;
  units: Record<UnitKind, Levels>;
  idle: number;
  pool: number;
  doctrine: Record<Doctrine, number>;
  pioneer: string | null;
  pioneerEras: number[];
  legacyWip: { id: string; done: number } | null;
  legacies: string[];
  hand: { id: string; fresh: boolean }[];
  orbit: { id: string; timer: number }[];
  charters: Record<CharterField, number>;
  patrons: string[];
  facilities: string[];
  commandUsed: number;
  defenseUsed: number;
  /** 방위 태세: 다음 내 차례 시작까지 방위력 보너스 */
  guard: number;
  /** 공존: 다음 내 생산 단계까지 건강 감소(공존 토큰 수) */
  coexist: number;
  conflict: { target: number; loss: ConflictLoss; atk: number; card: string } | null;
  harmedRound: number;
}

export type ConflictLoss = 'culture' | 'building' | 'doctrine';
export type RaidEffect = 'lootProd' | 'lootFood' | 'stealSci' | 'stealEnergy' | 'abduct';

export type Pending =
  | { kind: 'questReward'; player: number; questId: string }
  | { kind: 'redirect'; player: number; questId: string; targets: number[] }
  | { kind: 'coexist'; player: number; questId: string }
  | { kind: 'patron'; player: number; patronId: string; queue: number[] };

/** 대기 결정이 끝난 뒤 이어서 처리할 엔진 단계(처리 순서 보장용) */
export type Step =
  | { k: 'threat'; questId: string; pid: number; redirect: boolean; exclude: number[] }
  | { k: 'afterQuest' }
  | { k: 'next' }
  | { k: 'start' };

export interface LogEntry {
  round: number;
  player: number | null;
  /** 본인(player)에게 보이는 글 */
  text: string;
  /** 다른 사람에게 보이는 글(있으면 text 는 본인만 본다 — 뒷면에서 손패로 가져간 카드 등) */
  pub?: string;
}

export type Phase = 'quest' | 'external' | 'actions';

export interface GameState {
  version: 3;
  seed: number;
  rngState: [number, number, number, number];
  /** 상태 버전: 행동이 적용될 때마다 1 증가(온라인에서 오래된 화면 기준 행동 거절) */
  ver: number;
  players: PlayerState[];
  era: Era;
  round: number;
  startPlayer: number;
  current: number;
  phase: Phase;
  layout: WebLayout;
  /** 시대별 퀘스트 덱(사건 카드 + 후원자·유산·자원 팟). 종료 시대에는 4번 자리가 종료 묶음 덱 */
  questDecks: Record<Ring | 4, string[]>;
  /** 퀘스트 트랙(앞 칸부터, 최대 QUEST_ROW_SIZE). 칸 1은 늘 앞면 */
  questRow: string[];
  /** 칸별 앞면 여부(칸 1 외에는 뒷면 종료 묶음을 골라 뒤집은 경우만 true) */
  questOpen: boolean[];
  endBundle: string[];
  patronDecks: Record<Ring, string[]>;
  satDeck: string[];
  satMarket: (string | null)[];
  stage4Order: Record<Doctrine, number[]>;
  pending: Pending[];
  steps: Step[];
  eraStartRound: number;
  endTriggered: boolean;
  gameOver: boolean;
  log: LogEntry[];
}

export type Action =
  | { type: 'pickQuest'; slot: number }
  | { type: 'research'; node: string }
  | { type: 'useSupply'; index: number }
  | { type: 'build'; kind: BuildingKind; level: number }
  | { type: 'upgrade'; kind: BuildingKind; from: number; to: number }
  | { type: 'buildUnit'; kind: UnitKind; level: number }
  | { type: 'upgradeUnit'; kind: UnitKind; from: number; to: number }
  | { type: 'disband'; group: 'building' | 'unit'; kind: BuildingKind | UnitKind; level: number }
  | { type: 'addColonist' }
  | { type: 'legacyStage' }
  | { type: 'launch'; slot: number; replace?: number }
  | { type: 'charter'; field: CharterField }
  | { type: 'raid'; card: number; target: number; effect: RaidEffect; swarm?: boolean }
  | { type: 'declareConflict'; card: number; target: number }
  | { type: 'endTurn' }
  | { type: 'respond'; choice: number };

export interface ActionResult {
  state: GameState;
  error?: string;
}
