// 아래에서 올라오는 상세·행동 시트
import { useEffect, useId, type ReactNode } from 'react';
import styles from './Sheet.module.css';

export interface SheetAction {
  label: string;
  onClick: () => void;
  disabled?: string | null;
  tone?: 'primary' | 'danger' | 'plain';
}

export function Sheet({ title, children, actions = [], onClose }: { title: ReactNode; children?: ReactNode; actions?: SheetAction[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const titleId = useId();
  return (
    <div className={`${styles.backdrop} anim-fade`} onClick={onClose}>
      <section className={`${styles.sheet} anim-sheet-up`} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <h3 id={titleId}>{title}</h3>
          <button className={styles.close} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {actions.length > 0 && (
          <div className={styles.actions}>
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
