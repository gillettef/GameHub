// 온라인 방 연결. 끊기면(앱 전환·네트워크 변경) 저장해 둔 방 코드·토큰으로 같은 자리에 자동 재접속한다.
import { loadOnline, saveOnline } from '../store/storage';
import type { ClientMsg, RoomView, ServerMsg } from './protocol';

export interface NetState {
  status: 'idle' | 'connecting' | 'open' | 'closed';
  room: RoomView | null;
  error: string;
  /** 방에서 나가게 된 이유 등 한 번 보여 줄 안내 */
  notice: string;
}

/** 현재 페이지 디렉터리 기준 ws 주소. 게임 허브가 /doubleagent/ 아래로 프록시하면 /doubleagent/ws 가 된다 */
const wsUrl = (): string => {
  const url = new URL('ws', location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  url.search = '';
  url.hash = '';
  return url.toString();
};

export class Net {
  state: NetState = { status: 'idle', room: null, error: '', notice: '' };
  private ws: WebSocket | null = null;
  private queue: ClientMsg[] = [];
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private onChange: () => void) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.wantsConnection() && this.state.status !== 'open') this.open();
    });
    window.addEventListener('online', () => {
      if (this.wantsConnection() && this.state.status !== 'open') this.open();
    });
  }

  /** 저장된 방이 있으면 다시 들어간다 */
  get saved(): boolean {
    return !!loadOnline();
  }

  resume(): void {
    if (this.saved) this.open();
  }

  send(msg: ClientMsg): void {
    this.state.error = '';
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else {
      this.queue.push(msg);
      this.open();
    }
  }

  /** 방에서 나가기 (서버에 알리고 재접속 정보를 지운다) */
  leave(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'leave' } satisfies ClientMsg));
    this.forget();
  }

  clearNotice(): void {
    this.state.notice = '';
    this.state.error = '';
  }

  private wantsConnection(): boolean {
    return this.saved || this.queue.length > 0;
  }

  private open(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(this.retryTimer);
    this.set({ status: 'connecting' });
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.retry = 0;
      this.set({ status: 'open' });
      const saved = loadOnline();
      // 재접속 요청을 먼저 보내고, 끊긴 동안 쌓인 요청을 이어서 보낸다
      if (saved && !this.queue.some((m) => m.t === 'create' || m.t === 'join')) ws.send(JSON.stringify({ t: 'rejoin', code: saved.code, token: saved.token } satisfies ClientMsg));
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: 'ping' } satisfies ClientMsg)), 25_000);
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data)) as ServerMsg;
      } catch {
        return;
      }
      this.receive(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      clearInterval(this.pingTimer);
      this.set({ status: 'closed' });
      if (this.wantsConnection()) {
        // 1·2·4·8초 … 최대 10초 간격으로 다시 연결
        this.retryTimer = setTimeout(() => this.open(), Math.min(10_000, 1000 * 2 ** this.retry++));
      }
    };
  }

  private receive(msg: ServerMsg): void {
    switch (msg.t) {
      case 'joined':
        saveOnline({ code: msg.code, token: msg.token });
        return;
      case 'room':
        return this.set({ room: msg.room });
      case 'rejoin-failed':
        this.forget();
        return this.set({ notice: '방이 사라졌습니다. 서버가 다시 시작되었거나 오래 접속하지 않았을 수 있습니다.' });
      case 'left':
        return;
      case 'kicked':
        this.forget();
        return this.set({ notice: '방장이 나를 방에서 내보냈습니다.' });
      case 'error':
        return this.set({ error: msg.msg });
      case 'pong':
        return;
    }
  }

  private forget(): void {
    saveOnline(null);
    this.queue = [];
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.set({ room: null, status: 'idle' });
  }

  private set(patch: Partial<NetState>): void {
    this.state = { ...this.state, ...patch };
    this.onChange();
  }
}
