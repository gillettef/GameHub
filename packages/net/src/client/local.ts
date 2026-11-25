/** 한 기기 대전(사람·봇 혼합, 돌려 하기, 봇 관전). 온라인과 같은 RoomSnapshot 을 내므로 화면이 하나로 된다. */
import { RuleError, type GameDef, type SeatInfo } from '../core/game'
import { Match, type Move, type Timers } from '../core/match'
import { cleanName } from '../core/names'
import type { RoomSnapshot } from '../core/protocol'

export interface LocalSave<A> {
  seats: SeatInfo[]
  seed: number
  options: unknown
  history: Move<A>[]
}

export interface LocalState<V> {
  room: RoomSnapshot<V>
  error: string | null
  paused: boolean
}

export interface LocalOptions<A, O> {
  seats: SeatInfo[]
  seed?: number
  options?: O
  history?: Move<A>[]
  timers?: Timers
  /** 실시간 게임의 시계(테스트용, 기본 Date.now) */
  now?(): number
  /** 상태가 바뀔 때마다(이어하기 저장용) */
  onSave?(save: LocalSave<A>): void
}

export class LocalGame<S, A, V, O> {
  private readonly match: Match<S, A, V, O>
  private readonly listeners = new Set<() => void>()
  private readonly seats: SeatInfo[]
  private readonly seed: number
  private readonly options: O
  private state: LocalState<V>
  private paused = false
  private speed = 1
  /** 마지막으로 행동한 사람(봇 차례에도 그 사람의 화면을 유지한다) */
  private viewer: number | null

  constructor(
    private readonly def: GameDef<S, A, V, O>,
    private readonly opts: LocalOptions<A, O>,
  ) {
    this.seats = opts.seats.map((s, i) => ({
      kind: s.kind,
      name: s.kind === 'bot' ? s.name || `봇 ${i + 1}` : cleanName(s.name, `${i + 1}번`),
    }))
    this.seed = opts.seed ?? 1 + Math.floor(Math.random() * (2 ** 31 - 2))
    this.options = (opts.options ?? def.parseOptions?.(undefined)) as O
    const first = this.seats.findIndex((s) => s.kind === 'human')
    this.viewer = first < 0 ? null : first
    this.match = new Match(def, {
      seats: this.seats,
      seed: this.seed,
      options: this.options,
      timers: opts.timers,
      ...(opts.now ? { now: opts.now } : {}),
      // 일시정지하면 실시간 게임의 시계도 멈춘다
      clockRunning: () => !this.paused,
      replay: opts.history,
      autoDelay: (i) => {
        if (this.paused || this.seats[i]?.kind !== 'bot') return null
        return (def.bot?.delayMs ?? 0) / this.speed
      },
      onChange: () => {
        this.publish()
        this.opts.onSave?.(this.save())
      },
    })
    this.state = { room: this.snapshot(), error: null, paused: false }
  }

  private snapshot(): RoomSnapshot<V> {
    const actors = this.match.actors()
    // 보고 있던 사람이 아직 둘 차례면 그대로, 아니면 다음에 둘 사람
    if (this.viewer === null || !actors.includes(this.viewer)) {
      const human = actors.find((i) => this.seats[i]?.kind === 'human')
      if (human !== undefined) this.viewer = human
    }
    return {
      code: null,
      status: this.match.over ? 'over' : 'playing',
      seats: this.seats.map((s) => ({ ...s, online: true })),
      you: this.viewer,
      host: 0,
      version: this.match.version,
      actors,
      view: this.def.view(this.match.state, this.viewer),
      log: this.match.log.slice(),
      options: this.options ?? null,
    }
  }

  getState = (): LocalState<V> => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(error: string | null = null): void {
    this.state = { room: this.snapshot(), error, paused: this.paused }
    for (const listener of this.listeners) listener()
  }

  act(action: A): void {
    try {
      const seat = this.state.room.you
      if (seat === null || this.seats[seat]?.kind !== 'human') throw new RuleError('지금은 내 차례가 아닙니다.')
      this.match.act(seat, action)
    } catch (e) {
      if (!(e instanceof RuleError)) throw e
      this.publish(e.message)
    }
  }

  save(): LocalSave<A> {
    return { seats: this.seats, seed: this.seed, options: this.options ?? null, history: this.match.history.slice() }
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    this.publish()
    this.match.schedule()
  }

  /** 봇 속도 배수 */
  setSpeed(speed: number): void {
    this.speed = speed
    this.match.schedule()
  }

  /** 화면에 붙일 때(봇 진행 시작) */
  start(): void {
    this.match.schedule()
  }

  dispose(): void {
    this.match.stop()
  }
}
