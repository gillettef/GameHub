/**
 * 게임 하나가 공통 방·진행 코드에 알려 주는 것. 서버(온라인)와 브라우저(한 기기 대전)가 같은 정의를 쓴다.
 * 규칙은 게임의 src/engine 에 있고, 여기는 그 엔진을 감싸는 얇은 층이다.
 */
export interface SeatInfo {
  kind: 'human' | 'bot'
  name: string
}

export interface SetupContext<O> {
  seats: readonly SeatInfo[]
  seed: number
  options: O
}

export interface ApplyContext {
  /** 좌석 이름 */
  name(seat: number): string
  /** 게임 기록에 한 줄 남긴다. 모두에게 보이므로 숨겨야 할 정보는 넣지 않는다 */
  log(text: string, kind?: string): void
  /** 봇(또는 자리를 비운 사람의 대리)이 둔 행동 */
  byBot: boolean
}

/** 규칙에 맞지 않는 행동. 메시지는 그대로 사용자에게 보인다 */
export class RuleError extends Error {}

export interface GameDef<S, A, V = S, O = unknown> {
  slug: string
  minSeats: number
  maxSeats: number
  /** 신뢰할 수 없는 입력 → 옵션. 없으면 옵션이 없는 게임 */
  parseOptions?(raw: unknown): O
  setup(ctx: SetupContext<O>): S
  /** 신뢰할 수 없는 입력 → 행동. 형식이 틀리면 null (합법 여부는 apply 가 본다) */
  parseAction(raw: unknown): A | null
  /** 지금 행동해야 하는 좌석들. 게임이 끝났으면 빈 배열 */
  actors(state: S): number[]
  /** 바뀐 상태를 돌려준다. 규칙 위반이면 상태를 건드리지 않고 RuleError 를 던진다 */
  apply(state: S, seat: number, action: A, ctx: ApplyContext): S
  /** 그 좌석에 보여도 되는 상태(JSON 으로 보낼 수 있어야 한다). seat 이 null 이면 관전 */
  view(state: S, seat: number | null): V
  isOver(state: S): boolean
  bot?: {
    /** 다음 한 수. memory 는 그 좌석에 계속 유지되는 보관함(차례 계획 등) */
    next(state: S, seat: number, memory: Record<string, unknown>): A | null
    /** next 가 낸 행동이 거절됐을 때 대신 둘 행동 */
    fallback?(state: S, seat: number): A | null
    /** 한 수 사이의 생각 시간 */
    delayMs: number
  }
}
