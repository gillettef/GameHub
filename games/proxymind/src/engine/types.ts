// PROXYMIND 규칙 엔진 타입. 기준은 rules/rulebook.md (v0.3.1).
// 좌표: x 0~6 = A~G 열, y 0~6 = 1~7 행. 방향: 0 위(1행 쪽) · 1 오른쪽(G열 쪽) · 2 아래 · 3 왼쪽.

export type Dir = 0 | 1 | 2 | 3;
export interface Pos {
  x: number;
  y: number;
}

export type CondId =
  | 'frontEmpty'
  | 'frontBlocked'
  | 'lineCore'
  | 'lineNoCore'
  | 'lineBot'
  | 'botAdj'
  | 'coreAdj'
  | 'onEdge'
  | 'noBotWithin2'
  | 'pilotCores2'
  | 'always';

export type Act =
  | { k: 'fwd'; n: number }
  | { k: 'back'; n: number }
  | { k: 'advStop' }
  | { k: 'left' }
  | { k: 'right' }
  | { k: 'about' }
  | { k: 'wait' };

export interface TileDef {
  /** T01 ~ T20 */
  code: string;
  cond: CondId;
  acts: Act[];
  /** 카드에 인쇄되는 문구 */
  text: string;
  count: number;
}

export type Intervention =
  | { k: 'none' }
  | { k: 'turn'; dir: 'L' | 'R' }
  | { k: 'block'; slot: number }
  | { k: 'thrust' };

export type PlayerKind = 'human' | 'bot';
export type BotLevel = 'easy' | 'normal';

export interface PlayerState {
  name: string;
  kind: PlayerKind;
  level: BotLevel;
  /** 이 플레이어(조종사)의 로봇 */
  bot: Pos & { dir: Dir };
  energy: number;
  cores: number;
  /** 설계자 점수 토큰 */
  dp: number;
  /** 이 로봇 두뇌 보드 위의 쓴 에너지 (7.3) */
  spent: number;
  /** 이 로봇 두뇌의 슬롯 1~3 (타일 인스턴스 번호, 앞면으로 뒤집힌 뒤에만 채워짐) */
  brain: (number | null)[];
  /** 차단 토큰이 놓인 슬롯 (0~2) */
  blocked: number | null;
  /** 설계자로서 이번 라운드에 뽑은 규칙 타일 */
  hand: number[];
  /** 설계자로서 놓은 3개 (공개 전). 아직 안 놓았으면 null */
  pending: number[] | null;
}

export type GameEvent =
  | { t: 'round'; round: number; first: number }
  | { t: 'reveal' }
  | { t: 'turnStart'; p: number }
  | { t: 'intervene'; p: number; iv: Intervention }
  | { t: 'spentToDp'; p: number; designer: number }
  | { t: 'trigger'; p: number; slot: number; tile: number }
  | { t: 'default'; p: number }
  | { t: 'move'; p: number; to: Pos }
  | { t: 'face'; p: number; dir: Dir }
  | { t: 'bump'; p: number; byRule: boolean }
  | { t: 'core'; p: number; at: Pos }
  | { t: 'dp'; p: number; designer: number }
  | { t: 'refill'; at: Pos[] }
  | { t: 'end' };

export interface GameStats {
  /** 타일 코드별 꽂힌 횟수·발동 횟수 */
  placed: Record<string, number>;
  triggered: Record<string, number>;
  ivs: Record<Intervention['k'], number>;
  dpBump: number;
  dpSpent: number;
  coreByRule: number;
  coreByThrust: number;
}

export interface GameState {
  n: number;
  round: number;
  rounds: number;
  phase: 'design' | 'exec' | 'done';
  first: number;
  /** 실행 단계에서 몇 번째 로봇 차례인지 (0 ~ n-1, 선 플레이어 기준) */
  turn: number;
  players: PlayerState[];
  /** 아레나 위 코어 */
  cores: Pos[];
  coreSupply: number;
  /** 타일 인스턴스 번호 → 타일 종류(TILES 인덱스) */
  tiles: number[];
  bag: number[];
  rng: number;
  /** 지금 라운드의 사건 기록 (UI 애니메이션·로그용) */
  log: GameEvent[];
  stats: GameStats;
}
