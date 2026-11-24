// 온라인 방 연결. 끊기면(앱 전환·네트워크 변경) 저장해 둔 방 코드·토큰으로 같은 자리에 자동 재접속한다.
import type { ClientMsg, RoomView, ServerMsg } from './protocol';

const KEY = 'proxymind.online';

interface Saved {
  code: string;
  token: string;
}

const load = (): Saved | null => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && typeof v.code === 'string' && typeof v.token === 'string' ? v : null;
  } catch {
    return null;
  }
};
const save = (v: Saved | null) => {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* 저장소를 못 쓰면 재접속만 안 된다 */
  }
};

export interface NetState {
  status: 'idle' | 'connecting' | 'open' | 'closed';
  room: RoomView | null;
  error: string;
}

// 페이지 디렉터리 기준으로 만든다. 루트(/)·Vite 개발 서버에서는 /ws, 허브 아래(/proxymind/)에서는 /proxymind/ws 가 된다.
const wsUrl = () => {
  const u = new URL('ws', location.href);
  u.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  u.search = '';
  u.hash = '';
  return u.href;
};

export class Net {
  state: NetState = { status: 'idle', room: null, error: '' };
  private ws: WebSocket | null = null;
  private queue: ClientMsg[] = [];
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private active = false;

  constructor(private onChange: () => void) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.active && this.state.status !== 'open') this.open();
    });
  }

  get hasSaved(): boolean {
    return !!load();
  }

  resume(): void {
    if (!load()) return;
    this.active = true;
    this.open();
  }

  send(msg: ClientMsg): void {
    this.state.error = '';
    this.active = true;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else {
      this.queue.push(msg);
      this.open();
    }
  }

  leave(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'leave' } satisfies ClientMsg));
    this.forget();
  }

  private forget(): void {
    save(null);
    this.active = false;
    this.state.room = null;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.state.status = 'idle';
    this.onChange();
  }

  private open(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(this.retryTimer);
    this.state.status = 'connecting';
    this.onChange();
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.state.status = 'open';
      const saved = load();
      const first = this.queue[0];
      if (saved && !(first && (first.t === 'create' || first.t === 'join'))) ws.send(JSON.stringify({ t: 'rejoin', ...saved } satisfies ClientMsg));
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: 'ping' })), 20_000);
      this.onChange();
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      switch (msg.t) {
        case 'joined':
          save({ code: msg.code, token: msg.token });
          break;
        case 'room':
          this.state.room = msg.room;
          break;
        case 'error':
          this.state.error = msg.msg;
          break;
        case 'left':
          return this.forget();
        case 'pong':
          return;
      }
      this.onChange();
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      clearInterval(this.pingTimer);
      this.state.status = 'closed';
      this.onChange();
      if (this.active) this.retryTimer = setTimeout(() => this.open(), Math.min(10_000, 800 * 2 ** this.retry++));
    };
  }
}
