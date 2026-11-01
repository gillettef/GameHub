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
/** 끊김 알림은 한 번만(재시도마다 토스트가 쌓이지 않게) */
let dropped = false;
let hiddenAt = 0;
/** 이만큼 넘게 백그라운드에 있다 돌아오면 소켓이 살아 보여도 새로 붙는다 — iOS 는 잠금·앱 전환 때 소켓을 조용히 끊는다 */
const STALE_AFTER = 15000;

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
    dropped = false;
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
    // 버린 옛 소켓이 늦게 닫혀도 새 소켓의 핑을 끄지 않게, 현재 소켓일 때만 정리한다
    if (ws !== sock || intentionalClose) return;
    if (ping) clearInterval(ping);
    const session = storage.loadSession();
    if (session) {
      if (!dropped) useApp.getState().showToast('연결이 끊겼습니다 — 다시 연결하는 중');
      dropped = true;
      if (retry) clearTimeout(retry);
      // 화면이 꺼져 있으면 돌아올 때(visibilitychange) 붙는다
      if (!document.hidden) retry = setTimeout(() => connect({ t: 'resume', room: session.room, token: session.token }), 1500);
    }
  };
}

/** 저장된 세션으로 새 소켓을 연다(기존 소켓은 버림 — 서버가 같은 자리의 옛 소켓을 정리한다) */
let lastReconnect = 0;
function reconnect(): void {
  const session = storage.loadSession();
  if (!session || intentionalClose) return;
  // 복귀 때 visibilitychange·pageshow·online 이 한꺼번에 와도 소켓은 하나만
  const now = Date.now();
  if (now - lastReconnect < 1000) return;
  lastReconnect = now;
  if (retry) clearTimeout(retry);
  retry = null;
  const old = ws;
  ws = null;
  old?.close();
  connect({ t: 'resume', room: session.room, token: session.token });
}

let lifecycleBound = false;
/** 백그라운드에서 돌아오거나 네트워크가 다시 잡히면 바로 재접속한다 */
function bindLifecycle(): void {
  if (lifecycleBound || typeof document === 'undefined') return;
  lifecycleBound = true;
  const wake = (force: boolean) => {
    if (!storage.loadSession() || intentionalClose) return;
    if (!force && ws?.readyState === WebSocket.CONNECTING) return;
    if (force || !ws || ws.readyState !== WebSocket.OPEN) reconnect();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    wake(hiddenAt > 0 && Date.now() - hiddenAt > STALE_AFTER);
  });
  window.addEventListener('online', () => wake(false));
  // 뒤로 가기 캐시(bfcache)에서 되살아난 페이지는 소켓이 닫혀 있다
  window.addEventListener('pageshow', (e) => e.persisted && wake(true));
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
      // 대기실에서 오래 자리를 비우면 서버가 자리를 비운다 — 방이 사라진 것처럼 읽히지 않게
      app.showToast(msg.message.includes('방을 찾을 수 없') && app.screen === 'lobby' ? '오래 자리를 비워 대기실 자리가 비워졌습니다 — 초대 코드로 다시 참가하세요' : msg.message);
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
  bindLifecycle();
  connect({ t: 'create', name, seats });
}

export function joinRoom(room: string, name: string): void {
  bindLifecycle();
  connect({ t: 'join', room: room.toUpperCase(), name });
}

export function startOnline(): void {
  raw({ t: 'start' });
}

/** 저장된 재접속 토큰이 있으면 이어 붙는다 */
export function resumeOnline(): void {
  bindLifecycle();
  const s = storage.loadSession();
  if (s) connect({ t: 'resume', room: s.room, token: s.token });
}

export function leaveOnline(): void {
  intentionalClose = true;
  dropped = false;
  if (retry) clearTimeout(retry);
  raw({ t: 'leave' });
  ws?.close();
  ws = null;
  storage.clearSession();
  history.replaceState(null, '', location.pathname);
  useApp.getState().set({ screen: 'home', mode: null, game: null, lobby: null, send: null });
}
