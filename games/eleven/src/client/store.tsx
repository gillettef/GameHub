import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { Action } from '../def';
import type { GameView } from '../engine/view';
import type { RoomView } from '../protocol';

// 게임 화면이 읽는 상태. 방·접속은 공통 코드(@gamehub/net)가 맡고, App.tsx 가 RoomSnapshot 에서 이 모양을 만들어 넣는다
// (옛 ws.ts·StoreProvider 를 대신한다 — 화면 부품은 예전처럼 useStore/useView/useGame 으로 읽는다)
export interface Store {
  connected: boolean;
  /** 내 자리(관전이면 null) */
  session: { playerId: string } | null;
  /** 관전 중인 방 코드 */
  spectating: string | null;
  room: RoomView | null;
  view: GameView | null;
  error: string | null;
  /** 한 기기 대전 */
  local: boolean;
  /** 봇 차례의 경기 보기를 내가 아직 다 보지 않았다(다 보면 watched 를 보낸다) */
  watchWait: boolean;
  /** 차례인 봇이 사람들의 경기 보기를 기다리는 중 */
  botWatching: boolean;
  act: (action: Action) => void;
  /** 게임에서 나가기(처음 화면으로) */
  leave: () => void;
  /** 같은 구성으로 한 판 더(한 기기만) */
  rematch?: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ value, children }: { value: Store; children: ReactNode }) {
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
