import { useEffect } from 'react';
import type { KeyboardEvent } from 'react';

// 모달 공용: Esc 로 닫는다 (모달마다 따로 달지 않게 한 곳에). enabled=false 면 리스너를 달지 않는다
export function useEscape(onClose: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, enabled]);
}

// 눌러서 쓰는 div 를 키보드로도 쓰게: role=button + tabIndex + Enter/Space. 누를 수 없을 때(handler 없음)는 아무 속성도 붙이지 않는다
export function pressable(handler: (() => void) | undefined): {
  role?: 'button';
  tabIndex?: 0;
  onClick?: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
} {
  if (!handler) return {};
  return {
    role: 'button',
    tabIndex: 0,
    onClick: handler,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    },
  };
}
