// 규칙서: notes/Eleven_Rulebook.md (페이지 주석 p.NN 기준)

// ---------- 자원 / 트랙 (p.12) ----------

export type Resource = 'money' | 'fandom' | 'ops' | 'stamina';
export const RESOURCES: readonly Resource[] = ['money', 'fandom', 'ops', 'stamina'];

export type Resources = Record<Resource, number>;

// 능력치 트랙 4종. 마커 위치 1~5 (p.7)
export type Track = Resource;
export type TrackPositions = Record<Track, number>;
export const TRACK_MIN = 1;
export const TRACK_MAX = 5;

// 임원 주사위 색 (p.7): 노랑=돈/스타디움/스폰서, 파랑=선수/전술/체력, 빨강=팬덤/직원/운영
export type DieColor = 'yellow' | 'blue' | 'red';

// ---------- 경기장 구획 (p.8, p.21) ----------

// 5구획 = 9지역. 센터 3구획은 각 1지역(1~3명), 윙 2구획은 각 3지역(지역당 최대 1명) → 구획당 최대 3명 (p.8, p.20, p.21)
export type Sector = 'LW' | 'CB' | 'CM' | 'CF' | 'RW';
export const SECTORS: readonly Sector[] = ['LW', 'CB', 'CM', 'CF', 'RW'];
export const SECTOR_CAPACITY: Record<Sector, number> = { LW: 3, CB: 3, CM: 3, CF: 3, RW: 3 };

export type Role = 'attack' | 'defense';

// ---------- 카드 위 토큰 (p.27~28) ----------

export type PlayerToken =
  | 'injury'
  | 'suspension'
  | 'strengthTemp'
  | 'strengthPerm'
  | 'weaknessTemp'
  | 'weaknessPerm';

export type PlayerTokens = Record<PlayerToken, number>;

// ---------- 효과 DSL ----------
// MVP: 단순 효과만 엔진이 해석한다. 아직 구현되지 않은 복합 효과는 `text`로 두고 UI에만 표시한다.

export type Effect =
  | { type: 'gainResource'; resource: Resource; amount: number } // 음수 = 잃음
  | { type: 'moveTrack'; track: Track; delta: number }
  | { type: 'gainVP'; amount: number }
  | { type: 'trainPlayer'; count: number }
  | { type: 'drawTactic'; count: number }
  | { type: 'recruitProspectFree' }
  | { type: 'placeStamina'; count: number } // 선수 카드 1장에 체력 올려놓기
  | { type: 'addPlayerToken'; token: PlayerToken; count: number }
  | { type: 'removePlayerToken'; token: PlayerToken; count: number }
  | { type: 'scoreGoal'; team: 'self' | 'opponent'; amount: number } // 경기 중/후
  | { type: 'text'; text: string };

export type Cost = Partial<Resources>;

export type MatchTiming = 'beforeMatch' | 'duringMatch' | 'afterMatch';

// ---------- 선수 카드 (p.15~16, p.22) ----------

export type PlayerKind = 'starter' | 'prospect' | 'veteran';

export interface PlayerEffect {
  timing: MatchTiming;
  mandatory: boolean;
  cost: Cost;
  effects: Effect[];
  text: string;
}

export interface PlayerSide {
  cost: number; // 영입 비용 1~4 (p.15)
  role: Role;
  zones: Sector[]; // 배치 가능 구획. 골키퍼는 []
  skill: number; // 역량 0~4
  number?: number; // 유니폼 번호. 유망주 미훈련 면과 골키퍼는 없음
  goalkeeper?: { saves: number }; // 골키퍼 카드 (p.22)
  effect?: PlayerEffect;
  // 유망주 훈련 면 경력 칸 (p.16): 출전/득점 시 승점 토큰 1개씩
  career?: { appearances: number; goals: number };
}

export interface PlayerCard {
  id: string;
  kind: PlayerKind;
  name: string;
  tags: string[];
  untrained: PlayerSide;
  trained: PlayerSide;
  placeholder?: true;
}

// ---------- 직원 카드 (p.17) ----------

export type StaffSet = 'medical' | 'coaching' | 'scouting' | 'operations' | 'commercial';

export interface StaffCard {
  id: string;
  name: string;
  job: string;
  cost: number;
  minPlayers: 2 | 3; // "3+" 표시 카드는 3~4인 게임에서만 (p.4)
  set: StaffSet;
  setPoints: [number, number, number, number]; // 1/2/3/4장 보유 시 승점, 마지막이 상한
  bonus?: Effect[]; // 고용 즉시
  action?: { cost: Cost; effects: Effect[]; text: string };
  trait?: string; // 지속 특성 (MVP: 텍스트만)
  placeholder?: true;
}

// ---------- 스폰서 카드 (p.18) ----------

export type SponsorContract = 'kit' | 'billboard' | 'naming';

export interface SponsorCard {
  id: string;
  name: string;
  description: string;
  kit: Effect[];
  billboard: Effect[];
  naming: Effect[];
  // 명명권: 항상 추가로 받음. 광고판: 이 보너스 또는 광고판 효과 중 택1 (p.18)
  extraBonus: Effect[];
  placeholder?: true;
}

// ---------- 이사회 카드 (p.13) ----------

export interface BoardCard {
  id: string;
  name: string;
  description: string;
  decisions: Record<DieColor, { text: string; effects: Effect[] }>;
  placeholder?: true;
}

// ---------- 임원 카드 (p.7) ----------

export interface ExecutiveCard {
  id: string;
  name: string;
  description: string;
  votes: [DieColor, DieColor, DieColor, DieColor, DieColor, DieColor]; // 주사위 눈 1~6
  trackAdjust: Partial<Record<Track, number>>; // 공개 시 능력치 마커 이동
  bonus?: Effect[]; // 즉시 보너스
  action?: { cost: Cost; effects: Effect[]; text: string };
  trait?: string;
  placeholder?: true;
}

// ---------- 전술 카드 (p.20, p.28) ----------

// 포메이션은 백-미드-포워드 인원. 배치 가능한 유니폼 토큰은 10개 (골키퍼 제외)
export interface Formation {
  defenders: number;
  midfielders: number;
  forwards: number;
}

export interface TacticCard {
  id: string;
  name: string;
  formations: Formation[]; // 기본 전술 카드는 2개, 나머지는 1개
  effect?: { text: string; effects: Effect[] }; // MVP 2단계
  basic: boolean;
  placeholder?: true;
}

// ---------- 목표 카드 (p.27) ----------

export interface ObjectiveCard {
  id: string;
  name: string;
  description: string;
  goal: string;
  perfect: string;
  placeholder?: true;
}

// ---------- 상대 팀 카드 (p.21, p.28) ----------

export type DivisionTier = '3' | '3/2' | '2/1' | '1';
export type Division = 3 | 2 | 1;

// 부별 사용 덱 (p.28): 쉬운 덱 3장이 위, 어려운 덱 3장이 아래 (p.8)
export const DIVISION_TIERS: Record<Division, { easy: DivisionTier; hard: DivisionTier }> = {
  3: { easy: '3', hard: '3/2' },
  2: { easy: '3/2', hard: '2/1' },
  1: { easy: '2/1', hard: '1' },
};

export interface OpponentSlot {
  role: Role;
  skill: number;
}

export interface OpponentTeamCard {
  id: string;
  teamId: string; // 16개 팀 중 하나, 팀당 4장
  teamName: string;
  tier: DivisionTier;
  scoutReport: string; // 예: "이 팀은 4-3-3으로 경기를 합니다."
  formation: Formation;
  goalkeeper: { skill: number; saves: number };
  // 상대 팀 기준 구획. 비교 시 내 LW↔상대 RW, 내 CF↔상대 CB 등으로 뒤집어 짝지음 (p.21)
  sectors: Record<Sector, OpponentSlot[]>;
  placeholder?: true;
}

// ---------- 스타디움 기반 시설 (p.19) ----------

export type InfrastructureType =
  | 'lights'
  | 'shop'
  | 'execOffice'
  | 'trainingGround'
  | 'stand3'
  | 'stand4'
  | 'billboard3';

export interface InfrastructureDef {
  type: InfrastructureType;
  name: string;
  vp: number;
  bonus: Effect[];
  unique: boolean; // 관중석/광고판은 1개만
  placeholder?: true;
}

export const INFRASTRUCTURE_COST = 3;
export const INFRASTRUCTURE_MAX = 7;

// ---------- 보드 인쇄 수치 ----------

// 사무실 트랙 (p.19): 칸별 [건설 비용, 게임 종료 승점]. 인덱스 0 = 시작 위치(승점 0)
export interface OfficeStep {
  cost: number;
  vp: number;
}

// 조달 트랙: procurement[track][position-1] = 월요일에 얻는 자원 수
export type ProcurementTable = Record<Track, [number, number, number, number, number]>;

// 유지비 트랙 3종 (p.7, p.9): 보유 수 → 주말 지불 돈. 인덱스 = 보유 수 (스타디움은 인쇄 4 + 건설)
export interface UpkeepTables {
  players: number[];
  stadium: number[];
  staff: number[];
}

// 능력치 트랙 1 미만/5 초과 시 잃고 얻는 자원 (구단 보드 인쇄, p.7)
export type TrackOverflow = Record<Track, { below: Resource; above: Resource }>;

export interface BoardData {
  office: OfficeStep[];
  procurement: ProcurementTable;
  upkeep: UpkeepTables;
  trackOverflow: TrackOverflow;
  infrastructure: InfrastructureDef[];
}
