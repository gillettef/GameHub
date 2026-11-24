import type { ClientMessage, ServerMessage } from '@server/protocol';

export interface Session {
  code: string;
  playerId: string;
  token: string;
}

const SESSION_KEY = 'eleven.session';
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 10000;

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* 저장 불가 환경이면 재접속만 못 할 뿐 */
  }
}

type Listener = (msg: ServerMessage) => void;
type StatusListener = (open: boolean) => void;

// 끊기면 자동 재연결하고, 연결될 때마다 onOpen 을 호출해 rejoin 을 보낼 수 있게 한다
export class Connection {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private backoff = RECONNECT_MIN_MS;
  private closed = false;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(private url: string, private onOpen: (c: Connection) => void) {}

  // 휴대폰을 잠갔다 켜거나 네트워크가 돌아오면 백오프(최대 10초)를 기다리지 않고 바로 다시 붙는다
  wakeUp(): void {
    if (this.closed) return;
    this.backoff = RECONNECT_MIN_MS;
    this.connect(); // 이미 열려 있거나 연결 중이면 아무것도 하지 않는다
  }

  connect(): void {
    // 이미 열려 있거나 연결 중이면 새로 만들지 않는다 (소켓이 둘 살아 있으면 rejoin 이 두 번 간다)
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.closed = false;
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.backoff = RECONNECT_MIN_MS;
      for (const l of this.statusListeners) l(true);
      this.onOpen(this);
    };
    socket.onmessage = (ev) => {
      if (this.socket !== socket) return; // 닫힌 옛 소켓의 메시지는 무시
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      for (const l of this.listeners) l(msg);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return; // 이미 새 소켓으로 교체됨 — 옛 소켓의 close 가 재연결을 또 예약하지 않게
      this.socket = null;
      for (const l of this.statusListeners) l(false);
      if (this.closed) return;
      this.retry = setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(RECONNECT_MAX_MS, this.backoff * 2);
    };
  }

  close(): void {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const socket = this.socket;
    this.socket = null; // 먼저 떼어 놓아야 이 소켓의 onclose 가 재연결을 예약하지 않는다
    if (socket) {
      socket.close();
      for (const l of this.statusListeners) l(false);
    }
  }

  send(msg: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  onMessage(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onStatus(l: StatusListener): () => void {
    this.statusListeners.add(l);
    return () => this.statusListeners.delete(l);
  }
}

export function wsUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${location.host}/ws`;
}
