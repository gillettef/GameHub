// 규칙 수치. RULES 는 룰북 v1.2 의 확정 수치로 rules/rulebook.md 3장 표와 일치해야 한다(test/rulebook-sync.test.ts 가 검사).
// DEFAULT_CONFIG 는 초기 가안으로, 밸런스 실험(tools/, npm run sim -- --base default)의 비교 기준이다.

/** 인원수(2~4)별 값 */
export type PerCount<T> = Record<number, T>

export type EndMode = 'round' | 'lastTurn' | 'immediate'
export type TieBreak = 'extraRound' | 'lateSeat'

export interface Config {
  moveSteps: number
  carryLimit: number
  initialShards: PerCount<number>
  /** 라운드가 끝날 때마다 떨어지는 별똥별 수 */
  spawnPerRound: PerCount<number>
  target: PerCount<number>
  /** 인원수별 닻 칸(= 시작 칸) [열, 행]. 좌석 순서대로 */
  anchors: PerCount<[number, number][]>
  /** 별똥별 카드가 가리킬 수 있는 열 */
  spawnCols: number[]
  /** 차례 순서 보정: 좌석별 시작 시 들고 있는 별빛 조각 수 */
  startCarried?: PerCount<number[]>
  /** 좌석별 시작 점수 */
  startScore?: PerCount<number[]>
  /** 차례가 끝날 때마다 떨어지는 별똥별 수 */
  spawnPerTurn?: number
  endMode?: EndMode
  /** 날개 터뜨리기: 가려진 칸에 별똥별이 떨어지면 그 날개를 펼친다 */
  burstOnCovered?: boolean
  /** 카드 더미가 비면 버린 카드를 섞어 다시 쓴다 */
  reshuffle?: boolean
  /** 별빛 조각 공급처의 총수(0 이면 제한 없음) */
  shardSupply?: number
  tieBreak?: TieBreak
  /** 부재로 차례를 시작해 접기로 풀려난 차례의 걸음 감소(실험용) */
  freedStepPenalty?: number
}

export const DEFAULT_CONFIG: Config = {
  moveSteps: 3,
  carryLimit: 2,
  initialShards: { 2: 6, 3: 7, 4: 8 },
  spawnPerRound: { 2: 1, 3: 1, 4: 1 },
  target: { 2: 5, 3: 4, 4: 4 },
  anchors: {
    2: [[0, 0], [8, 4]],
    3: [[0, 0], [8, 2], [0, 4]],
    4: [[0, 0], [8, 4], [8, 0], [0, 4]],
  },
  spawnCols: [1, 2, 3, 4, 5, 6, 7],
  startCarried: { 2: [0, 0], 3: [0, 0, 0], 4: [0, 0, 0, 0] },
  startScore: { 2: [0, 0], 3: [0, 0, 0], 4: [0, 0, 0, 0] },
}

export const RULES: Config = {
  ...DEFAULT_CONFIG,
  moveSteps: 3,
  carryLimit: 2,
  initialShards: { 2: 6, 3: 6, 4: 6 },
  spawnPerRound: { 2: 0, 3: 0, 4: 0 },
  spawnPerTurn: 1,
  endMode: 'round',
  burstOnCovered: true,
  reshuffle: true,
  shardSupply: 40,
  tieBreak: 'extraRound', // 동점 결승 라운드 (최대 3번)
  target: { 2: 10, 3: 9, 4: 7 },
  anchors: {
    2: [[0, 0], [8, 4]],
    3: [[0, 1], [8, 2], [0, 3]],
    4: [[0, 1], [8, 4], [0, 3], [8, 0]],
  },
  startCarried: { 2: [0, 0], 3: [0, 0, 0], 4: [0, 0, 0, 0] },
  startScore: { 2: [0, 0], 3: [0, 0, 0], 4: [0, 0, 0, 0] },
}

/** 실험용 덮어쓰기: 인원수별 표는 그 안의 키만 바꾼다 */
export function mergeConfig(base: Config, over: Partial<Record<keyof Config, unknown>>): Config {
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(base[k as keyof Config] as object), ...v } : v
  }
  return out as unknown as Config
}

/** 인원수별 값. 표에 없는 인원수는 설정 오류다 */
export function per<T>(table: PerCount<T>, n: number): T {
  const v = table[n]
  if (v === undefined) throw new Error(`${n}인 설정이 없습니다`)
  return v
}
