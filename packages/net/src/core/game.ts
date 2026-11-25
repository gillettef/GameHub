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

/** 시계가 상태를 바꿀 때 쓰는 것(행동이 아니라 시간 때문에 생긴 일) */
export interface ClockContext {
  log(text: string, kind?: string): void
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
  /**
   * 실시간 게임만: 실제 시간이 흐르면 바뀌는 상태(모래시계 등). 행동 직전과 syncMs 마다 흘린다.
   * 시간이 흘러도 version 은 그대로라 고르던 행동이 거절되지 않는다. 화면은 받은 뒤 흐른 시간만큼 표시를 줄여 보이면 된다
   */
  clock?: {
    /** ms 만큼 흐른 뒤의 상태. 바뀐 것이 없으면 같은 객체를 돌려준다 */
    advance(state: S, ms: number, ctx: ClockContext): S
    /** 상태를 다시 보내는 간격(기본 1000) */
    syncMs?: number
  }
  bot?: {
    /** 다음 한 수. memory 는 그 좌석에 계속 유지되는 보관함(차례 계획 등) */
    next(state: S, seat: number, memory: Record<string, unknown>): A | null
    /** next 가 낸 행동이 거절됐을 때 대신 둘 행동 */
    fallback?(state: S, seat: number): A | null
    /** 한 수 사이의 생각 시간 */
    delayMs: number
  }
}
