// 온라인 대전 클라이언트: WebSocket 연결, 재접속(토큰), 서버 상태 반영
import type { Action } from '../core/types';
import type { ClientMsg, ServerMsg } from './protocol';
import { useApp } from '../store/app';
import { storage } from '../store/storage';

let ws: WebSocket | null = null;
let pendingOpen: ClientMsg | null = null;
let intentionalClose = false;
let retry: ReturnType<typeof setTimeout> | null = null;
let ping: ReturnType<typeof setInterval> | null = null;

function url(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

function raw(msg: ClientMsg): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function connect(first: ClientMsg): void {
  intentionalClose = false;
  pendingOpen = first;
  if (ws && ws.readyState === WebSocket.OPEN) {
    raw(first);
    pendingOpen = null;
    return;
  }
  ws?.close();
  const sock = new WebSocket(url());
  ws = sock;
  sock.onopen = () => {
    if (pendingOpen) raw(pendingOpen);
    pendingOpen = null;
    if (ping) clearInterval(ping);
    ping = setInterval(() => raw({ t: 'ping' }), 25000);
  };
  sock.onmessage = (ev) => {
    let msg: ServerMsg;
    try {
      msg = JSON.parse(String(ev.data)) as ServerMsg;
    } catch {
      return;
    }
    onMessage(msg);
  };
  sock.onclose = () => {
    if (ping) clearInterval(ping);
    if (ws !== sock || intentionalClose) return;
    const session = storage.loadSession();
    if (session) {
      useApp.getState().showToast('연결이 끊겼습니다 — 다시 연결하는 중');
      retry = setTimeout(() => connect({ t: 'resume', room: session.room, token: session.token }), 1500);
    }
  };
}

const send = (action: Action) => raw({ t: 'action', ver: useApp.getState().game?.ver ?? 0, action });

function onMessage(msg: ServerMsg): void {
  const app = useApp.getState();
  switch (msg.t) {
    case 'joined':
      storage.saveSession(msg.room, msg.token);
      app.set({ me: msg.seat, viewing: msg.seat, mode: 'online', send });
      if (app.screen === 'home') app.set({ screen: 'lobby' });
      history.replaceState(null, '', `?room=${msg.room}`);
      break;
    case 'lobby':
      app.set({ lobby: msg.lobby });
      if (!msg.lobby.started && app.screen !== 'lobby') app.set({ screen: 'lobby' });
      break;
    case 'state': {
      const first = app.screen !== 'game';
      app.set({ game: msg.state, me: msg.seat, mode: 'online', send, screen: 'game', ...(first ? { viewing: msg.seat } : {}) });
      break;
    }
    case 'error':
      app.showToast(msg.message);
      if (msg.message.includes('방을 찾을 수 없')) {
        intentionalClose = true;
        storage.clearSession();
        app.set({ screen: 'home', mode: null, game: null, lobby: null, send: null });
      }
      break;
    case 'pong':
      break;
  }
}

export function createRoom(name: string, seats: number): void {
  connect({ t: 'create', name, seats });
}

export function joinRoom(room: string, name: string): void {
  connect({ t: 'join', room: room.toUpperCase(), name });
}

export function startOnline(): void {
  raw({ t: 'start' });
}

/** 저장된 재접속 토큰이 있으면 이어 붙는다 */
export function resumeOnline(): void {
  const s = storage.loadSession();
  if (s) connect({ t: 'resume', room: s.room, token: s.token });
}

export function leaveOnline(): void {
  intentionalClose = true;
  if (retry) clearTimeout(retry);
  raw({ t: 'leave' });
  ws?.close();
  ws = null;
  storage.clearSession();
  history.replaceState(null, '', location.pathname);
  useApp.getState().set({ screen: 'home', mode: null, game: null, lobby: null, send: null });
}
