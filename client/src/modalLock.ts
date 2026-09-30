import { useEffect, useSyncExternalStore } from "react";

// 모달/팝업이 떠 있는 동안 뒤에서 돌아가는 연출(토큰 애니메이션, 자동 넘김 타이머 등)을 멈추기 위한 전역 카운터.
// 팝업이 마운트되어 있는 동안 useModalLock()을 부르면 잠금이 걸리고, <body data-modal-open>으로 CSS 애니메이션도 멈춘다.
let count = 0;
const listeners = new Set<() => void>();

function change(delta: number) {
  count += delta;
  if (typeof document !== "undefined") {
    if (count > 0) document.body.setAttribute("data-modal-open", "");
    else document.body.removeAttribute("data-modal-open");
  }
  listeners.forEach((l) => l());
}

export function useModalLock(): void {
  useEffect(() => {
    change(1);
    return () => change(-1);
  }, []);
}

// 다른 팝업이 떠 있는지 (자기 자신은 useModalLock을 부르지 않으면 포함되지 않는다)
export function useModalOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => count > 0,
  );
}
