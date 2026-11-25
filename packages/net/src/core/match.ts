/** 한 판의 진행: 행동 적용, 기록, 봇(자동 진행) 예약. 방(서버)과 한 기기 대전(브라우저)이 함께 쓴다. */
import { RuleError, type GameDef, type SeatInfo } from './game'

export interface Timers {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

export const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export interface LogEntry {
  id: number
  text: string
  kind?: string
}

export interface Move<A> {
  seat: number
  action: A
  byBot: boolean
}

export interface MatchOptions<A, O> {
  seats: readonly SeatInfo[]
  seed: number
  options: O
  timers?: Timers
  /** 그 좌석을 지금 자동으로 둬야 하면 기다릴 시간(ms), 아니면 null */
  autoDelay(seat: number): number | null
  /** 상태가 바뀔 때마다 */
  onChange(): void
  /** 저장해 둔 판을 이어갈 때의 지난 행동 */
  replay?: readonly Move<A>[]
}

const LOG_LIMIT = 80

export class Match<S, A, V, O> {
  state: S
  version = 0
  readonly log: LogEntry[] = []
  readonly history: Move<A>[] = []
  private readonly timers: Timers
  private timer: unknown = null
  private logId = 0
  private readonly memory: Record<string, unknown>[]

  constructor(
    readonly def: GameDef<S, A, V, O>,
    private readonly opts: MatchOptions<A, O>,
  ) {
    this.timers = opts.timers ?? realTimers
    this.memory = opts.seats.map(() => ({}))
    this.state = def.setup({ seats: opts.seats, seed: opts.seed, options: opts.options })
    for (const move of opts.replay ?? []) this.step(move.seat, move.action, move.byBot)
  }

  get over(): boolean {
    return this.def.isOver(this.state)
  }

  actors(): number[] {
    return this.over ? [] : this.def.actors(this.state)
  }

  /** 행동 하나를 적용하고 다음 자동 진행을 예약한다. 규칙 위반이면 RuleError */
  act(seat: number, action: A, byBot = false): void {
    if (this.over) throw new RuleError('이미 끝난 게임입니다.')
    if (!this.def.actors(this.state).includes(seat)) throw new RuleError('지금은 내 차례가 아닙니다.')
    this.step(seat, action, byBot)
    this.opts.onChange()
    this.schedule()
  }

  private step(seat: number, action: A, byBot: boolean): void {
    const added: Omit<LogEntry, 'id'>[] = []
    this.state = this.def.apply(this.state, seat, action, {
      name: (i) => this.opts.seats[i]?.name ?? `${i + 1}번`,
      log: (text, kind) => added.push(kind === undefined ? { text } : { text, kind }),
      byBot,
    })
    for (const entry of added) this.log.push({ id: ++this.logId, ...entry })
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT)
    this.history.push({ seat, action, byBot })
    this.version++
  }

  /** 자동으로 둘 좌석이 있으면 예약한다. 접속 상태처럼 autoDelay 의 답이 달라질 때도 부른다 */
  schedule(): void {
    this.stop()
    if (!this.def.bot) return
    let next: { seat: number; ms: number } | null = null
    for (const seat of this.actors()) {
      const ms = this.opts.autoDelay(seat)
      if (ms !== null && (next === null || ms < next.ms)) next = { seat, ms }
    }
    if (!next) return
    const { seat, ms } = next
    this.timer = this.timers.set(() => this.runBot(seat), ms)
  }

  private runBot(seat: number): void {
    this.timer = null
    const bot = this.def.bot
    if (!bot || !this.actors().includes(seat) || this.opts.autoDelay(seat) === null) return
    const memory = this.memory[seat] ?? {}
    // 봇의 오류가 서버를 멈추지 않게: 거절되면 대체 행동, 그것도 안 되면 그 판의 자동 진행을 멈춘다
    for (const choose of [() => bot.next(this.state, seat, memory), () => bot.fallback?.(this.state, seat) ?? null]) {
      try {
        const action = choose()
        if (action === null) continue
        this.act(seat, action, true)
        return
      } catch (e) {
        console.error(`[${this.def.slug}] 봇 행동 실패`, e)
      }
    }
  }

  stop(): void {
    if (this.timer !== null) this.timers.clear(this.timer)
    this.timer = null
  }
}
