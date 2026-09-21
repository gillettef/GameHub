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

// 경기 조건 (선수 카드·전술 카드의 조건부 효과). 결과가 필요한 조건은 경기 후에 판정한다
export type MatchCondition =
  | { kind: 'outcome'; outcome: 'win' | 'draw' | 'loss' }
  | { kind: 'goalsAtLeast'; goals: number } // 내 득점 N 이상
  | { kind: 'cleanSheet' } // 실점 없음 (= 상대 무득점)
  | { kind: 'inSector'; sector: Sector } // 이 효과를 가진 선수 카드의 토큰이 그 구획에 출전
  | { kind: 'scoredInSector'; sector: Sector } // 내 그 구획에서 득점
  | { kind: 'opponentHigherInLeague' }; // 상대 팀이 리그 성적표에서 나보다 앞

export type Passive = 'extraStand' | 'fandomOnWin'; // 상시 효과: 관중석 +1 / 승리마다 팬덤 +1
export type DayRestriction = 'noBasic' | 'cardActionOnly'; // 이사회 효과의 요일 제한 (점검용 토큰)

// target: 'self' = 이 효과를 가진 선수 카드 자신이 대상 ("이 선수를 훈련합니다", "이 선수에 부상 토큰"). 선수 카드 효과에서만 뜻이 있고,
// 효과의 출처 카드(EffectContext.inst)가 없으면 무시된다
export type SelfTarget = { target?: 'self' };

export type Effect =
  | { type: 'gainResource'; resource: Resource; amount: number } // 음수 = 잃음
  | { type: 'moveTrack'; track: Track; delta: number }
  | { type: 'gainVP'; amount: number }
  // withTokens: 훈련한 그 선수에게 함께 놓는 토큰 ("혹독한 훈련: 훈련 + 영구 역량 1 + 부상 1" 류의 첫 번째 트레이너)
  | ({ type: 'trainPlayer'; count: number; withTokens?: Partial<Record<PlayerToken, number>> } & SelfTarget)
  | { type: 'drawTactic'; count: number }
  | { type: 'recruitProspectFree' }
  | { type: 'placeStamina'; count: number } // 선수 카드 1장에 체력 올려놓기
  // spread: count개를 한 카드에 몰지 않고 1개씩 대상을 골라 나눠 놓거나 제거한다 ("카드에 있는 [약점]을 3개까지 버립니다" 류)
  // only: 'playedAttack' = 이번 경기에 출전 중인 [공격] 선수만 대상
  | ({ type: 'addPlayerToken'; token: PlayerToken; count: number; spread?: true; only?: 'playedAttack' } & SelfTarget)
  | ({ type: 'removePlayerToken'; token: PlayerToken; count: number; spread?: true } & SelfTarget)
  // 주사위(d6)를 굴려 눈이 atMost 이하면 effects, 아니면 otherwise 를 적용한다 (베테랑의 "주사위 굴림으로 강제 훈련·부상" 류). 결과는 기록에 남긴다
  | { type: 'rollDie'; atMost: number; effects: Effect[]; otherwise?: Effect[] }
  | { type: 'scoreGoal'; team: 'self' | 'opponent'; amount: number } // 경기 중/후
  | { type: 'peekOpponent' } // 상대 팀 카드 더미 맨 위 카드의 앞면을 확인 (그 카드로 경기할 때까지 유지)
  // ---- 경기 효과 (경기 준비·진행 중에만 뜻이 있고, 밖에서는 기록만 남긴다) ----
  | { type: 'conditional'; condition: MatchCondition; effects: Effect[] }
  | { type: 'denyGoals'; count: number } // 상대 득점 N개 무효 / 상대 슛 N개 막기 (구획 비교 득점에서 뺌)
  | { type: 'extraSaves'; count: number } // 이번 경기 골키퍼 선방 +N
  | { type: 'sectorSkill'; sector: Sector; delta: number } // 이번 경기 내 그 구획 선수 전원 역량 ±N
  | { type: 'flipUnmatchedToken'; count: number } // 카드 없는 필드 유니폼 토큰 N개를 뒤집는다 (대상 선택, 영구)
  // ---- 그 밖의 대상 선택·상태 효과 ----
  | { type: 'discardMarketCard'; row: MarketRow } // 이적 시장 카드 1장을 골라 버리고 보충
  | { type: 'addStaffSuspension'; count: number } // 직원 카드 1장을 골라 출장정지 N개
  | { type: 'releasePlayer' } // 선수 카드 1장을 골라 방출 행동으로 처리
  | { type: 'restrictDay'; day: 'tue' | 'wed' | 'thu'; week: 'this' | 'next'; mode: DayRestriction }
  | { type: 'breakNamingSponsor'; otherwise: Effect[] } // 유니폼 스폰서가 있으면 버리고 그 카드의 장내 방송 효과, 없으면 otherwise
  | { type: 'passive'; passive: Passive }
  | { type: 'upkeepDiscount'; amount: number } // 다음 주말 유지비 −N
  | { type: 'text'; text: string };

export type Cost = Partial<Resources>;

export type MatchTiming = 'beforeMatch' | 'duringMatch' | 'afterMatch';

// ---------- 이적 시장 행 ----------
// 규칙서(p.4)는 선수 행이 주전 5장 하나뿐이지만, 이 구현은 베테랑도 별도 행(5장, 오른쪽 3장 구매 가능)으로 노출한다
// (사용자 결정, 2026-09). 유망주는 행이 없고 더미 맨 위 카드(미훈련 면 공개)를 영입한다
export type MarketRow = 'players' | 'veterans' | 'staff' | 'sponsors';
export type PlayerMarketRow = 'players' | 'veterans';

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
  name: string; // 유망주도 본명 (미훈련 면에도 표시 — 사용자 요청, 2026-09)
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
  trait?: CardTrait; // 지속 특성
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
  // 유니폼(naming): 항상 추가로 받음. 광고판: 이 보너스 또는 광고판 효과 중 택1 (p.18)
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

// 임원·직원 카드의 지속 특성. 계산은 engine/traits.ts 가 맡는다 (출장정지 카드의 특성은 무효, p.28)
export type Trait =
  | { kind: 'infraDiscount'; amount: number } // 기반 시설 건설 비용 −N
  | { kind: 'hireDiscount'; amount: number } // 직원 고용 비용 −N
  | { kind: 'prospectDiscount'; amount: number } // 유망주 영입 비용 −N
  | { kind: 'freeLineupStamina'; count: number } // 경기마다 출전 선수 N명의 체력 비용 면제
  | { kind: 'freeBoardReroll' } // 이사회 주사위 재굴림에 팬덤을 내지 않음
  | { kind: 'freeMatchReroll' } // 경기 영향 주사위 재굴림에 팬덤을 내지 않음
  | { kind: 'fandomOnSponsor'; amount: number } // 스폰서 계약 시 팬덤 +N
  | { kind: 'keepStamina'; count: number } // 주말에 체력을 N개까지 남김
  | { kind: 'extraSaves'; count: number } // 골키퍼 선방 +N (항상)
  | { kind: 'marketReach'; row: 'players' | 'sponsors' } // 그 행은 맨 왼쪽 2장도 고를 수 있음 ('players' 는 주전·베테랑 행 둘 다)
  | { kind: 'releaseBonus'; amount: number } // 방출 시 돈 +N
  | { kind: 'redrawTactic' } // 경기 준비 중 전술 카드 1장을 버리고 새로 뽑기 (경기일마다 1회)
  | { kind: 'upkeepDiscount'; amount: number } // 주말 유지비 −N (보유하는 동안)
  | { kind: 'upkeepSuspension'; count: number } // 유지비 미납 1돈당 출장정지 N개 (기본 2)
  | { kind: 'standsBonusMoney'; amount: number }; // 관중석 팬덤을 돈으로 바꿀 때 +N
export interface CardTrait {
  text: string;
  effect: Trait;
}

export interface ExecutiveCard {
  id: string;
  name: string;
  description: string;
  votes: [DieColor, DieColor, DieColor, DieColor, DieColor, DieColor]; // 주사위 눈 1~6
  trackAdjust: Partial<Record<Track, number>>; // 공개 시 능력치 마커 이동
  bonus?: Effect[]; // 즉시 보너스
  action?: { cost: Cost; effects: Effect[]; text: string };
  trait?: CardTrait;
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

// 목표 판정 조건 (p.27). 판정은 engine/objectives.ts. 새 목표를 만들 때 필요한 종류가 없으면 여기에 추가한다
export type ObjectiveCheck =
  | { kind: 'weekWin'; week: number; margin?: number; cleanSheet?: boolean } // N주차 경기 승리 (+ 골 차 / 무실점)
  | { kind: 'winStreak'; count: number } // N주 연속 승리
  | { kind: 'leagueFirst'; lead?: number } // 종료 시 리그 1위 (+ 다른 모든 팀과 lead칸 이상 차이)
  | { kind: 'staffSet'; count: number } // 같은 세트 직원 N장
  | { kind: 'infrastructure'; count: number } // 건설한 기반 시설 토큰 N개
  | { kind: 'trainedPlayers'; count: number }
  | { kind: 'trainedProspects'; count: number }
  | { kind: 'prospectGoalVP' } // 훈련된 유망주의 경력 칸에 득점 승점 토큰
  | { kind: 'money'; amount: number }
  | { kind: 'noInjuryTokens' } // 종료 시 선수 카드에 부상 토큰 없음
  | { kind: 'noMatchDieInjury' } // 게임 동안 경기 영향 주사위로 부상 토큰을 받은 적 없음
  | { kind: 'office'; index: number } // 사무실 트랙 index 이상
  | { kind: 'sponsors'; count: number } // 스폰서 계약 N건 (장내 방송은 맺은 횟수, 광고판·유니폼은 보유)
  | { kind: 'sponsorTypes' }; // 장내 방송·광고판·유니폼 각 1건 이상

export interface ObjectiveCard {
  id: string;
  name: string;
  description: string;
  goal: string;
  perfect: string;
  goalCheck: ObjectiveCheck;
  perfectCheck: ObjectiveCheck; // goalCheck 를 달성한 위에 추가로 만족해야 하는 조건
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
  requires?: InfrastructureType; // 먼저 지어야 하는 시설 (4번 관중석 ← 3번 관중석, 번호 순서)
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
