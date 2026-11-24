// 게임 화면에 있는 동안 화면이 저절로 꺼지지 않게 한다(Screen Wake Lock, iOS Safari 16.4+).
// 상대·AI 차례를 기다리는 동안 휴대폰이 잠기면 온라인 소켓이 끊기고 흐름을 놓친다.
// 앱을 떠나면 브라우저가 풀어 버리므로 돌아올 때 다시 요청한다. 지원하지 않으면 조용히 넘어간다
import { useEffect } from 'react';

type Sentinel = { release: () => Promise<void> };
type WakeLockApi = { request: (type: 'screen') => Promise<Sentinel> };

export function useWakeLock(active: boolean) {
  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!active || !api) return;
    let lock: Sentinel | null = null;
    let alive = true;
    const request = async () => {
      if (document.hidden || lock) return;
      try {
        const l = await api.request('screen');
        if (!alive) {
          void l.release();
          return;
        }
        lock = l;
        // 브라우저가 풀면(앱 전환 등) 다음 복귀 때 다시 잡는다
        (l as unknown as EventTarget).addEventListener?.('release', () => {
          if (lock === l) lock = null;
        });
      } catch {
        // 저전력 모드·권한 거부 등 — 무시
      }
    };
    const onVisible = () => !document.hidden && void request();
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}
