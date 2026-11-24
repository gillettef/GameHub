/**
 * 아주 작은 경로 라우터 (의존성 없음). 경로:
 *  /            랜딩 (방 만들기 · 참여 · 핫시트)
 *  /hotseat     같은 기기에서 번갈아 두기 (설정 화면 → 게임)
 *  /tutorial    연습 봇과 두는 첫 판 튜토리얼
 *  /room/:id    온라인 방 (로비 → 게임)
 * 서버(CLIENT_DIST)와 Vite dev 모두 모든 경로를 index.html 로 돌려준다.
 * 위 경로는 앱 안 경로다. 실제 주소는 앱 base(허브 아래면 `/rootbound/`) 뒤에 붙는다(lib/appBase.ts).
 */
import { useEffect, useState } from 'react';
import { appBase, toAppPath, toUrlPath } from './appBase';

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
  const url = toUrlPath(path);
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** 지금 주소의 앱 안 경로 (base 를 뗀 것) */
export function currentPath(): string {
  return toAppPath(window.location.pathname);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(currentPath()));
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(currentPath()));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return route;
}

export function roomUrl(roomId: string): string {
  return `${window.location.origin}${appBase()}room/${roomId}`;
}

/** 붙여넣은 초대 링크 또는 방 id 에서 roomId 를 뽑는다 */
export function extractRoomId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/\/room\/([A-Za-z0-9_-]+)/);
  if (m && m[1]) return m[1];
  return /^[A-Za-z0-9_-]{3,32}$/.test(s) ? s : null;
}
