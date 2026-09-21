import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { GameAction } from '@server/engine/actions';
import type { GameView } from '@server/engine/view';
import type { ChatMessage, ClientMessage, RoomView } from '@server/protocol';
import { Connection, loadSession, saveSession, wsUrl } from './ws';
import type { Session } from './ws';

interface Store {
  connected: boolean;
  session: Session | null;
  spectating: string | null; // 관전 중인 방 코드
  room: RoomView | null;
  view: GameView | null;
  chat: ChatMessage[]; // 방 채팅 (서버가 최근 것 전체를 보내 준다)
  error: string | null;
  send: (msg: ClientMessage) => void;
  act: (action: GameAction) => void;
  spectate: (code: string) => void;
  sendChat: (text: string) => void;
  leave: () => void;
}

const StoreContext = createContext<Store | null>(null);
const ERROR_MS = 4000;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [spectating, setSpectating] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const spectatingRef = useRef(spectating);
  spectatingRef.current = spectating;
  const connRef = useRef<Connection | null>(null);

  useEffect(() => {
    const conn = new Connection(wsUrl(), (c) => {
      const s = sessionRef.current;
      if (s) c.send({ type: 'rejoin', code: s.code, playerId: s.playerId, token: s.token });
      else if (spectatingRef.current) c.send({ type: 'spectate', code: spectatingRef.current });
    });
    connRef.current = conn;
    const offStatus = conn.onStatus(setConnected);
    const offMsg = conn.onMessage((msg) => {
      switch (msg.type) {
        case 'joined': {
          const next = { code: msg.code, playerId: msg.playerId, token: msg.token };
          saveSession(next);
          setSession(next);
          setSpectating(null);
          break;
        }
        case 'spectating':
          setSpectating(msg.code);
          break;
        case 'room':
          setRoom(msg.room);
          break;
        case 'state':
          setView(msg.view);
          break;
        case 'chat':
          setChat(msg.messages);
          break;
        case 'error':
          if (msg.message === 'room not found' || msg.message === 'invalid rejoin credentials') {
            saveSession(null);
            setSession(null);
            setSpectating(null);
          }
          setError(msg.message);
          break;
      }
    });
    conn.connect();
    return () => {
      offStatus();
      offMsg();
      conn.close();
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), ERROR_MS);
    return () => clearTimeout(t);
  }, [error]);

  const send = useCallback((msg: ClientMessage) => {
    if (!connRef.current?.send(msg)) setError('서버에 연결되어 있지 않습니다');
  }, []);
  const act = useCallback((action: GameAction) => send({ type: 'action', action }), [send]);
  const spectate = useCallback((code: string) => send({ type: 'spectate', code }), [send]);
  const sendChat = useCallback((text: string) => send({ type: 'chat', text }), [send]);
  const leave = useCallback(() => {
    saveSession(null);
    setSession(null);
    setSpectating(null);
    setRoom(null);
    setView(null);
    setChat([]);
    connRef.current?.close();
    connRef.current?.connect();
  }, []);

  const value = useMemo<Store>(
    () => ({ connected, session, spectating, room, view, chat, error, send, act, spectate, sendChat, leave }),
    [connected, session, spectating, room, view, chat, error, send, act, spectate, sendChat, leave],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

// 게임 화면에서만 쓰는 축약형: view 와 내 상태. 관전자는 me 가 없다
export function useGame() {
  const store = useStore();
  const view = store.view;
  if (!view) throw new Error('game view missing');
  const me = view.players[view.me];
  if (!me) throw new Error('not a player');
  return { ...store, view, me };
}

export function useView() {
  const store = useStore();
  const view = store.view;
  if (!view) throw new Error('game view missing');
  return { ...store, view };
}
