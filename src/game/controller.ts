import { chooseActions } from '../core/ai';
import { HOLE_LABELS, PLAYER_EMOJI } from '../core/constants';
import type { Rng } from '../core/rng';
import { initialState, isLegal, resolveAction } from '../core/rules';
import type { Action, GameEvent, GameState, Player, Step } from '../core/types';

export type Mode = 'ai' | 'online';

/** 연출 타이밍(ms). 프로토타입 값 */
export const DELAYS = {
  /** 사람 턴이 끝난 뒤 AI가 움직이기 시작할 때까지 */
  aiStart: 400,
  /** AI 생각 */
  aiThink: 600,
  /** AI 투입 사이 */
  aiPlace: 900,
  /** 하차(자동 포함) 사이, 마지막 하차 후 턴 종료까지 */
  drop: 800,
};

export interface ControllerOptions {
  mode: Mode;
  /** AI가 맡는 플레이어 (ai 모드) */
  aiPlayer?: Player;
  /** 이 기기가 맡는 자리 (online 모드) */
  seat?: Player;
  /** 내 수를 서버로 보낸다 (online 모드). from = 적용 전 version */
  sendAction?: (action: Action, from: number) => void;
  /** 받은 상대 수가 내 상태와 맞지 않을 때 — 서버 상태를 다시 요청한다 (online 모드) */
  onDesync?: () => void;
  state?: GameState;
  log?: string[];
  rng?: Rng;
  /** 테스트용: 지연을 대체 */
  sleep?: (ms: number) => Promise<void>;
  /** 결정 지점(입력 대기 상태)에 도달할 때마다 호출 — 저장용 */
  onSettled?: (c: GameController) => void;
}

export interface View {
  state: GameState;
  mode: Mode;
  busy: boolean;
  /** 방금 토큰이 놓인 권역(연출용). 없으면 -1 */
  highlight: number;
  /** highlight가 새로 생길 때마다 증가 — 같은 권역에 연달아 놓여도 애니메이션을 다시 재생하기 위함 */
  pulse: number;
  log: string[];
}

const LOG_SIZE = 5;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 사건 → 로그 문장. 로그를 남기지 않을 사건이면 null */
export function describe(e: GameEvent): string | null {
  switch (e.type) {
    case 'setup':
      return `${PLAYER_EMOJI[e.player]} ${HOLE_LABELS[e.hole]} 배치`;
    case 'place':
      return `${PLAYER_EMOJI[e.player]} ${HOLE_LABELS[e.hole]} 조직 투입`;
    case 'pick':
      return `${PLAYER_EMOJI[e.player]} ${HOLE_LABELS[e.hole]}에서 버스 출발 (${e.count}명)`;
    case 'lost':
      return `🚌 놓을 곳이 없어 ${e.tokens.length}명 낙선`;
    case 'gameOver':
      return '🏁 선거일!';
    default:
      return null;
  }
}

/**
 * 턴 진행·연출 타이밍·AI 호출을 맡는다. 상태 변경은 core의 resolveAction으로만 한다.
 */
export class GameController {
  readonly mode: Mode;
  readonly aiPlayer: Player;
  readonly seat: Player;
  private s: GameState;
  /** 아직 재생하지 않은 상대 수 (online 모드) */
  private inbox: { action: Action; from: number }[] = [];
  private busy = false;
  private highlight = -1;
  private pulse = 0;
  private log: string[];
  private listeners = new Set<(v: View) => void>();
  /** new game·dispose 때 증가시켜 진행 중인 비동기 흐름을 끊는다 */
  private generation = 0;
  private readonly rng: Rng;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly onSettled?: (c: GameController) => void;
  private readonly sendAction?: (action: Action, from: number) => void;
  private readonly onDesync?: () => void;

  constructor(opts: ControllerOptions) {
    this.mode = opts.mode;
    this.aiPlayer = opts.aiPlayer ?? 1;
    this.seat = opts.seat ?? 0;
    this.sendAction = opts.sendAction;
    this.onDesync = opts.onDesync;
    this.s = opts.state ?? initialState();
    this.log = (opts.log ?? []).slice(0, LOG_SIZE);
    this.rng = opts.rng ?? Math.random;
    this.sleepFn = opts.sleep ?? defaultSleep;
    this.onSettled = opts.onSettled;
  }

  get state(): GameState {
    return this.s;
  }

  get view(): View {
    return { state: this.s, mode: this.mode, busy: this.busy, highlight: this.highlight, pulse: this.pulse, log: this.log };
  }

  get logLines(): readonly string[] {
    return this.log;
  }

  subscribe(fn: (v: View) => void): () => void {
    this.listeners.add(fn);
    fn(this.view);
    return () => this.listeners.delete(fn);
  }

  /** 지금 차례가 이 기기의 사람에게 있는가 */
  isHumanTurn(): boolean {
    return this.mode === 'online' ? this.s.current === this.seat : this.s.current !== this.aiPlayer;
  }

  canAct(): boolean {
    return !this.busy && this.s.phase !== 'over' && this.isHumanTurn();
  }

  canDo(a: Action): boolean {
    return this.canAct() && isLegal(this.s, a);
  }

  /** 사람의 입력. 받아들였으면 true */
  act(a: Action): boolean {
    if (!this.canDo(a)) return false;
    const gen = this.generation;
    this.busy = true;
    // 낙관적 적용: 서버가 거부하면 state 메시지로 되돌려진다
    this.sendAction?.(a, this.s.version);
    void this.play(a, gen).then(() => this.settle(gen));
    return true;
  }

  /** 저장된 상태로 시작했을 때 등, AI 차례면 진행을 시작한다 */
  start(): void {
    this.settle(this.generation);
  }

  newGame(): void {
    this.generation++;
    this.s = initialState();
    this.log = [];
    this.highlight = -1;
    this.busy = false;
    this.settle(this.generation);
  }

  /** 서버가 전달한 상대 수 (online 모드). 진행 중인 연출이 끝나면 차례대로 재생한다 */
  remoteAction(action: Action, from: number): void {
    this.inbox.push({ action, from });
    if (!this.busy) this.settle(this.generation);
  }

  /** 서버 상태로 교체 (접속·재접속·거부·새 판). 이미 같은 상태면 진행 중인 연출을 끊지 않는다 */
  resync(state: GameState): void {
    if (!this.inbox.length && JSON.stringify(state) === JSON.stringify(this.s)) return;
    this.generation++;
    this.inbox = [];
    if (state.version < this.s.version || state.version === 0) this.log = [];
    this.s = state;
    this.highlight = -1;
    this.busy = false;
    this.settle(this.generation);
  }

  dispose(): void {
    this.generation++;
    this.listeners.clear();
  }

  // ---------- 내부 ----------

  private emit(): void {
    const v = this.view;
    for (const fn of this.listeners) fn(v);
  }

  private show(step: Step): void {
    this.s = step.state;
    for (const e of step.events) {
      const line = describe(e);
      if (line) this.log = [line, ...this.log].slice(0, LOG_SIZE);
      if (e.type === 'setup' || e.type === 'place' || e.type === 'drop') {
        this.highlight = e.hole;
        this.pulse++;
      } else if (e.type === 'pick' || e.type === 'gameOver') {
        this.highlight = -1;
      }
    }
    this.emit();
  }

  /** 액션 하나를 연출 박자대로 보여준다. 중단되면 false */
  private async play(a: Action, gen: number): Promise<boolean> {
    const steps = resolveAction(this.s, a);
    this.show(steps[0]);
    for (let k = 1; k < steps.length; k++) {
      await this.sleepFn(DELAYS.drop);
      if (gen !== this.generation) return false;
      this.show(steps[k]);
    }
    return true;
  }

  /** 입력 대기 상태로 전환. AI 차례면 AI를 돌린다 */
  private settle(gen: number): void {
    if (gen !== this.generation) return;
    const next = this.inbox.shift();
    if (next) {
      if (next.from !== this.s.version || this.isHumanTurn() || !isLegal(this.s, next.action)) {
        // 어긋남: 재생하지 않고 서버 상태를 기다린다
        this.inbox = [];
        this.busy = false;
        this.emit();
        this.onDesync?.();
        return;
      }
      this.busy = true;
      void this.play(next.action, gen).then(() => this.settle(gen));
      return;
    }
    if (this.mode === 'online') {
      this.busy = false;
      this.emit();
      return;
    }
    if (this.s.phase !== 'over' && !this.isHumanTurn()) {
      this.busy = true;
      this.emit();
      void this.runAi(gen);
      return;
    }
    this.busy = false;
    this.emit();
    this.onSettled?.(this);
  }

  private async runAi(gen: number): Promise<void> {
    await this.sleepFn(DELAYS.aiStart + DELAYS.aiThink);
    if (gen !== this.generation) return;
    const before = this.s.version;
    const actions = chooseActions(this.s, this.rng);
    for (const a of actions) {
      if (a.type === 'drop') {
        await this.sleepFn(DELAYS.drop);
        if (gen !== this.generation) return;
      }
      if (!isLegal(this.s, a)) break; // 방어: 계획이 상태와 어긋나면 중단
      if (!(await this.play(a, gen))) return;
      if (a.type === 'place') {
        await this.sleepFn(DELAYS.aiPlace);
        if (gen !== this.generation) return;
      }
    }
    if (this.s.version === before) {
      // 방어: 둘 수가 없으면 무한 반복하지 않고 멈춘다(정상 진행에서는 도달 불가)
      this.busy = false;
      this.emit();
      return;
    }
    // 셋업은 1수씩 번갈아 두므로, 아직 AI 차례면 settle이 다시 AI를 부른다
    this.settle(gen);
  }
}
