/**
 * 서비스워커 등록 (웹 배포 전용).
 * - 프로덕션 빌드에서만, 보안 컨텍스트(https 또는 localhost)일 때만 등록한다.
 * - 앱(Capacitor/TWA)으로 포장할 때는 호출하지 않거나 이 파일을 교체한다.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (typeof window === 'undefined' || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      /* 등록 실패는 게임 진행과 무관하므로 무시 */
    });
  });
}
