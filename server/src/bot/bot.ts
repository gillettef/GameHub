import WebSocket from 'ws';
import type { GameAction } from '../engine/actions';
import { createRng } from '../engine/rng';
import type { Rng } from '../engine/rng';
import type { GameView } from '../engine/view';
import type { ClientMessage, RoomView, ServerMessage } from '../protocol';
import { decide } from './policy';

export interface BotOptions {
  url: string;
  name: string;
  seed?: number;
  delayMs?: number; // 판단 후 액션까지 지연 (관전용)
  log?: (line: string) => void;
}

// 실제 WebSocket 클라이언트로 접속해 GameView 만 보고 플레이하는 봇
export class Bot {
  readonly name: string;
  private socket: WebSocket | null = null;
  private rng: Rng;
  private delayMs: number;
  private log: (line: string) => void;
  private view: GameView | null = null;
  private room: RoomView | null = null;
  private inflight: GameAction | null = null;
  private failed = new Set<string>();
  private failedTurnKey = '';
  private timer: NodeJS.Timeout | null = null;
  private resolveDone: (() => void) | null = null;
  private done: Promise<void>;
  playerId = '';
  code = '';

  constructor(private opts: BotOptions) {
    this.name = opts.name;
    this.rng = createRng(opts.seed ?? Math.floor(Math.random() * 1e9));
    this.delayMs = opts.delayMs ?? 0;
    this.log = opts.log ?? (() => {});
    this.done = new Promise((resolve) => (this.resolveDone = resolve));
  }

  // 방을 만들거나(code 없음) 기존 방에 입장한다
  connect(code?: string, seed?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.opts.url);
      this.socket = socket;
      socket.once('error', reject);
      socket.on('open', () => {
        this.send(code ? { type: 'joinRoom', code, name: this.name } : { type: 'createRoom', name: this.name, seed });
      });
      let joined = false;
      socket.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as ServerMessage;
        if (msg.type === 'joined') {
          joined = true;
          this.playerId = msg.playerId;
          this.code = msg.code;
          resolve();
        } else if (msg.type === 'error' && !joined) {
          // 입장 실패(방 없음, 이미 시작됨, 정원 초과 등)는 곧바로 실패로 끝낸다
          socket.close();
          reject(new Error(`${this.name}: ${msg.message}`));
          return;
        }
        this.handle(msg);
      });
      socket.on('close', () => this.finish());
    });
  }

  startGame(): void {
    this.send({ type: 'startGame' });
  }

  waitForGameOver(): Promise<void> {
    return this.done;
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.socket?.close();
  }

  get roomView(): RoomView | null {
    return this.room;
  }

  private send(msg: ClientMessage): void {
    this.socket?.send(JSON.stringify(msg));
  }

  private handle(msg: ServerMessage): void {
    switch (msg.type) {
      case 'room':
        this.room = msg.room;
        break;
      case 'state':
        this.view = msg.view;
        this.inflight = null;
        if (msg.view.phase.kind === 'gameOver') {
          this.log(`[${this.name}] 게임 종료`);
          this.finish();
          return;
        }
        this.schedule();
        break;
      case 'error': {
        this.log(`[${this.name}] 거부: ${msg.message}${this.inflight ? ` (${this.inflight.type})` : ''}`);
        if (this.inflight) this.failed.add(this.inflight.type === 'cardAction' && this.inflight.paid ? 'paidCardAction' : this.inflight.type);
        this.inflight = null;
        this.schedule();
        break;
      }
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.step(), this.delayMs);
  }

  private step(): void {
    this.timer = null;
    if (!this.view || this.inflight) return;
    // 차례/단계가 바뀌면 거부 기록을 비운다
    const turnKey = `${this.view.week}:${this.view.phase.kind}:${this.view.phase.kind === 'weekday' ? `${this.view.phase.day}:${this.view.phase.current}` : ''}`;
    if (turnKey !== this.failedTurnKey) {
      this.failed.clear();
      this.failedTurnKey = turnKey;
    }
    const action = decide(this.view, this.rng, this.failed);
    if (!action) return;
    this.inflight = action;
    this.log(`[${this.name}] ${action.type}`);
    this.send({ type: 'action', action });
  }

  private finish(): void {
    if (this.timer) clearTimeout(this.timer);
    this.resolveDone?.();
    this.resolveDone = null;
  }
}
