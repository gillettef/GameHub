// 시트·결정 창이 떠 있는 동안 뒤 테이블 스크롤을 잠근다(iOS 에서 시트 밖을 쓸면 테이블이 따라 움직이는 문제).
// 여러 창이 겹쳐도 마지막 창이 닫힐 때만 푼다
import { useEffect } from 'react';

let locks = 0;

export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    locks += 1;
    document.documentElement.classList.add('nt-lock');
    return () => {
      locks -= 1;
      if (locks === 0) document.documentElement.classList.remove('nt-lock');
    };
  }, [active]);
}
