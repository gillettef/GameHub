/**
 * 브라우저 쪽 온라인 연결. 끊기면 자동으로 다시 접속한다(모바일 백그라운드 전환·망 변경 대비).
 */
import {
  CLOSE_REPLACED,
  parseServerMsg,
  roomPath,
  type ClientMsg,
  type ErrorCode,
  type ServerMsg,
} from './protocol';

export type ConnStatus =
  /** 첫 접속 시도 중 */
  | 'connecting'
  | 'open'
  /** 끊겨서 다시 접속하는 중 */
  | 'reconnecting'
  /** 더 이상 접속하지 않음(오류·밀려남·닫음) */
  | 'closed';

/** 다시 접속해도 소용없는 종료 사유 */
export type FatalReason = ErrorCode | 'replaced';

export interface ConnectionHandlers {
  onMessage(msg: ServerMsg): void;
  onStatus(status: ConnStatus, reason?: FatalReason): void;
}

export interface ConnectionOptions {
  code: string;
  clientId: string;
  /** 새 방 만들기. 첫 welcome 뒤로는 일반 재접속으로 바뀐다 */
  create: boolean;
  /** API 서버 주소(예: https://api.example.com). 없으면 페이지와 같은 출처 */
  origin?: string;
}

const RETRY_MS = [500, 1000, 2000, 4000, 8000];

/**
 * 방 WebSocket 주소. 게임 허브가 `/<slug>/` 접두어 아래로 프록시해도 붙도록
 * 같은 출처일 때는 현재 페이지의 디렉터리(pathname 마지막 `/`까지)를 기준으로 만든다.
 */
export function socketUrl(o: ConnectionOptions, loc: { protocol: string; host: string; pathname?: string }): string {
  const base = o.origin ? new URL(o.origin) : null;
  const secure = (base?.protocol ?? loc.protocol) === 'https:';
  const host = base?.host ?? loc.host;
  const path = base ? base.pathname : (loc.pathname ?? '/');
  const dir = path.slice(0, path.lastIndexOf('/') + 1) || '/';
  const q = new URLSearchParams({ id: o.clientId });
  if (o.create) q.set('create', '1');
  return `${secure ? 'wss' : 'ws'}://${host}${dir.replace(/\/$/, '')}${roomPath(o.code)}?${q}`;
}

export class OnlineConnection {
  private ws: WebSocket | null = null;
  private status: ConnStatus = 'connecting';
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private create: boolean;
  private readonly wake = () => {
    if (this.status === 'reconnecting' && document.visibilityState !== 'hidden') this.reconnectNow();
  };

  constructor(
    private readonly opts: ConnectionOptions,
    private readonly handlers: ConnectionHandlers,
  ) {
    this.create = opts.create;
  }

  connect(): void {
    document.addEventListener('visibilitychange', this.wake);
    window.addEventListener('online', this.wake);
    this.open();
  }

  /** 보내기. 연결이 없으면 false — 재접속 후 welcome으로 상태를 다시 맞춘다 */
  send(msg: ClientMsg): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  close(): void {
    document.removeEventListener('visibilitychange', this.wake);
    window.removeEventListener('online', this.wake);
    this.clearTimer();
    this.setStatus('closed');
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
  }

  // ---------- 내부 ----------

  private open(): void {
    const url = socketUrl({ ...this.opts, create: this.create }, location);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    let fatal: FatalReason | undefined;
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      const msg = parseServerMsg(e.data);
      if (!msg) return;
      if (msg.t === 'error') fatal = msg.code;
      if (msg.t === 'welcome') {
        this.create = false; // 방이 생겼으니 이후 재접속은 일반 참가로
        this.retry = 0;
        this.setStatus('open');
      }
      this.handlers.onMessage(msg);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (e.code === CLOSE_REPLACED) fatal = 'replaced';
      if (fatal) {
        this.close();
        this.handlers.onStatus('closed', fatal);
        return;
      }
      this.scheduleRetry();
    };
    // onerror 다음엔 항상 onclose가 오므로 따로 처리하지 않는다
  }

  private scheduleRetry(): void {
    if (this.status === 'closed') return;
    this.setStatus('reconnecting');
    const ms = RETRY_MS[Math.min(this.retry, RETRY_MS.length - 1)];
    this.retry++;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.status !== 'closed') this.open();
    }, ms);
  }

  private reconnectNow(): void {
    if (this.ws || this.status === 'closed') return;
    this.clearTimer();
    this.open();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private setStatus(s: ConnStatus): void {
    if (this.status === s) return;
    this.status = s;
    if (s !== 'closed') this.handlers.onStatus(s);
  }
}
