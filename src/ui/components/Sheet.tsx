// 아래에서 올라오는 상세·행동 시트. 머리(손잡이)를 아래로 끌어 닫을 수 있고, 행동 버튼은 시트 아래에 붙어 있다
import { useEffect, useId, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useScrollLock } from '../useScrollLock';
import styles from './Sheet.module.css';

export interface SheetAction {
  label: string;
  onClick: () => void;
  disabled?: string | null;
  tone?: 'primary' | 'danger' | 'plain';
}

/** 이만큼(px) 넘게 끌어내리거나 빠르게 튕기면 닫는다 */
const DISMISS_PX = 90;
const DISMISS_SPEED = 0.6; // px/ms

export function Sheet({ title, children, actions = [], onClose }: { title: ReactNode; children?: ReactNode; actions?: SheetAction[]; onClose: () => void }) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const titleId = useId();
  const box = useRef<HTMLElement>(null);
  const drag = useRef<{ id: number; y0: number; t0: number; dy: number } | null>(null);

  // 손잡이 끌기: transform 은 등장 애니메이션이 쥐고 있으므로 translate 로 움직인다
  const onDown = (e: ReactPointerEvent) => {
    if ((e.target as Element).closest('button')) return;
    drag.current = { id: e.pointerId, y0: e.clientY, t0: performance.now(), dy: 0 };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (box.current) box.current.style.transition = 'none';
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !box.current) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    box.current.style.translate = `0 ${d.dy}px`;
  };
  const onUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const speed = d.dy / Math.max(1, performance.now() - d.t0);
    if (d.dy > DISMISS_PX || (d.dy > 24 && speed > DISMISS_SPEED)) {
      if (box.current) {
        box.current.style.transition = '';
        box.current.style.translate = '';
      }
      onClose();
      return;
    }
    if (box.current) {
      box.current.style.transition = 'translate 180ms ease-out';
      box.current.style.translate = '';
    }
  };

  return (
    <div className={`${styles.backdrop} anim-fade`} onClick={onClose}>
      <section ref={box} className={`${styles.sheet} anim-sheet-up`} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span className={styles.grabber} aria-hidden />
          <h3 id={titleId}>{title}</h3>
          <button className={styles.close} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {actions.length > 0 && (
          <div className={`${styles.actions} ${actions.length <= 3 ? styles.sticky : ''}`}>
            {actions.map((a, i) => (
              <div key={i} className={styles.actionRow}>
                <button
                  className={`${styles.btn} ${styles[a.tone ?? 'primary']}`}
                  disabled={!!a.disabled}
                  onClick={() => {
                    a.onClick();
                    onClose();
                  }}
                >
                  {a.label}
                </button>
                {a.disabled && <span className={styles.why}>{a.disabled}</span>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
