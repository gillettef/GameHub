/**
 * 앱 base 경로. 게임은 서버 루트(`http://host:3201/`)와 허브 접두어 아래(`http://host/rootbound/`) 양쪽에서 돈다.
 * index.html 의 인라인 스크립트가 주소에서 라우터 경로(`room/:id`·`hotseat`·`tutorial`)를 떼어
 * `window.__APP_BASE__`(항상 `/` 로 끝남)에 넣어 두고, 여기서는 그 값을 읽기만 한다.
 * API·소켓·카드 그림·라우터 주소는 모두 이 base 기준으로 만든다.
 */
declare global {
  interface Window {
    __APP_BASE__?: string;
  }
}

/** 예: `/` 또는 `/rootbound/` */
export function appBase(): string {
  const b = typeof window === 'undefined' ? undefined : window.__APP_BASE__;
  return b && b.endsWith('/') ? b : '/';
}

/** 앱 안 경로(`/room/abc`)를 실제 주소 경로(`/rootbound/room/abc`)로 */
export function toUrlPath(appPath: string): string {
  return appBase() + appPath.replace(/^\/+/, '');
}

/** 실제 주소 경로에서 base 를 뗀 앱 안 경로. base 밖이면 그대로 돌려준다 */
export function toAppPath(urlPath: string): string {
  const base = appBase();
  if (base === '/' || !urlPath.startsWith(base)) return urlPath;
  return '/' + urlPath.slice(base.length);
}
