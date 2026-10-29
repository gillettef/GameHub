/**
 * 아주 작은 경로 라우터 (의존성 없음). 경로:
 *  /            랜딩 (방 만들기 · 참여 · 핫시트)
 *  /hotseat     같은 기기에서 번갈아 두기 (설정 화면 → 게임)
 *  /tutorial    연습 봇과 두는 첫 판 튜토리얼
 *  /room/:id    온라인 방 (로비 → 게임)
 * 서버(CLIENT_DIST)와 Vite dev 모두 모든 경로를 index.html 로 돌려준다.
 */
import { useEffect, useState } from 'react';

export type Route = { name: 'landing' } | { name: 'hotseat' } | { name: 'tutorial' } | { name: 'room'; roomId: string } | { name: 'unknown'; path: string };

export function parseRoute(path: string): Route {
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean === '/') return { name: 'landing' };
  if (clean === '/hotseat') return { name: 'hotseat' };
  if (clean === '/tutorial') return { name: 'tutorial' };
  const m = clean.match(/^\/room\/([A-Za-z0-9_-]+)$/);
  if (m && m[1]) return { name: 'room', roomId: m[1] };
  return { name: 'unknown', path: clean };
}

export function navigate(path: string, replace = false): void {
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return route;
}

export function roomUrl(roomId: string): string {
  return `${window.location.origin}/room/${roomId}`;
}

/** 붙여넣은 초대 링크 또는 방 id 에서 roomId 를 뽑는다 */
export function extractRoomId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/\/room\/([A-Za-z0-9_-]+)/);
  if (m && m[1]) return m[1];
  return /^[A-Za-z0-9_-]{3,32}$/.test(s) ? s : null;
}
