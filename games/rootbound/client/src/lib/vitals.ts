/**
 * 웹 성능 기록 (2026-10-06): FCP·LCP, 액션 동기화 왕복(F004), 연출 중 FPS 를 모아 페이지를 떠날 때
 * `/api/vitals` 로 한 번 보낸다(sendBeacon). 서버는 stats/vitals.jsonl 에 쌓고 server/scripts/stats.ts 가 집계한다.
 * 개인 정보는 없다(값과 화면 크기뿐). 실패해도 게임에는 영향이 없다.
 */
import { toUrlPath } from './appBase';

const rtts: number[] = [];
const fpsSamples: number[] = [];
let fcp: number | null = null;
let lcp: number | null = null;
let started = false;
let sent = false;

export function recordSyncRtt(ms: number): void {
  if (rtts.length < 50) rtts.push(Math.round(ms));
}

/** durationMs 동안 requestAnimationFrame 으로 프레임 수를 세어 평균 FPS 표본 하나를 남긴다 (연출이 도는 동안 부른다) */
export function sampleFps(durationMs = 1200): void {
  if (typeof requestAnimationFrame !== 'function' || document.hidden || fpsSamples.length >= 30) return;
  let frames = 0;
  const t0 = performance.now();
  const tick = (t: number) => {
    frames++;
    if (t - t0 < durationMs) requestAnimationFrame(tick);
    else fpsSamples.push(Math.round((frames * 1000) / (t - t0)));
  };
  requestAnimationFrame(tick);
}

/** 모은 표본을 보내고 비운다. 탭을 오가며 여러 번 숨겨질 수 있으므로 FCP·LCP 는 처음 한 번만 싣는다 */
function flush(): void {
  const first = !sent;
  const pageVitals = first && (fcp !== null || lcp !== null);
  if (!pageVitals && rtts.length === 0 && fpsSamples.length === 0) return;
  const fps = fpsSamples.length ? fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length : null;
  const body = JSON.stringify({
    fcp: first ? fcp : null,
    lcp: first ? lcp : null,
    syncRtt: rtts.splice(0),
    fps,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  });
  fpsSamples.length = 0;
  if (pageVitals) sent = true;
  try {
    if (navigator.sendBeacon) navigator.sendBeacon(toUrlPath('/api/vitals'), new Blob([body], { type: 'application/json' }));
    else void fetch(toUrlPath('/api/vitals'), { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
  } catch {
    /* 기록 실패는 무시 */
  }
}

/** 앱 시작 시 한 번 부른다 */
export function startVitals(): void {
  if (started || typeof PerformanceObserver === 'undefined') return;
  started = true;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') fcp = Math.round(e.startTime);
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      if (last) lcp = Math.round(last.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* 지원하지 않는 브라우저(Safari 일부): 왕복·FPS 만 보낸다 */
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}
