/*
 * 스마일 파크 서비스워커 (의존성 없음).
 * - 앱 셸(index.html·매니페스트·아이콘)을 설치 시 캐시해 오프라인에서도 열리게 한다.
 * - index.html(내비게이션)은 network-first: 새 배포를 바로 받고, 오프라인이면 캐시를 쓴다.
 * - 해시가 붙은 빌드 산출물(assets/*)은 내용이 바뀌면 파일명이 바뀌므로 cache-first.
 * - 이미지(images/*)·아이콘 등 나머지 같은 출처 GET 은 stale-while-revalidate.
 * 등록은 src/platform/serviceWorker.ts (프로덕션 + 보안 컨텍스트에서만).
 * 캐시 구조를 바꾸면 VERSION 을 올릴 것 (이전 캐시는 activate 때 지워진다).
 */
const VERSION = 'v1';
const SHELL_CACHE = `smilepark-shell-${VERSION}`;
const ASSET_CACHE = `smilepark-assets-${VERSION}`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('smilepark-') && k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put('./index.html', res.clone());
    return res;
  } catch {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  const net = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit || Response.error());
  return hit || net;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  const path = url.pathname.slice(scope.pathname.length);

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
  } else if (path.startsWith('assets/')) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(staleWhileRevalidate(req));
  }
});
