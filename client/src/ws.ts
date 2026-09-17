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

  constructor(private url: string, private onOpen: (c: Connection) => void) {}

  connect(): void {
    this.closed = false;
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.backoff = RECONNECT_MIN_MS;
      for (const l of this.statusListeners) l(true);
      this.onOpen(this);
    };
    socket.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      for (const l of this.listeners) l(msg);
    };
    socket.onclose = () => {
      for (const l of this.statusListeners) l(false);
      if (this.closed) return;
      setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(RECONNECT_MAX_MS, this.backoff * 2);
    };
  }

  close(): void {
    this.closed = true;
    this.socket?.close();
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
