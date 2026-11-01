// 상세·행동 모달: 지금 보고 있는 화면 가운데에 고정해 띄운다. 행동 버튼은 모달 아래에 붙어 있다
// body 로 포털한다 — 상단 상태 줄처럼 backdrop-filter·transform 이 걸린 조상 안에서 열면 fixed 가 화면이 아니라 그 조상 기준이 된다
import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../useScrollLock';
import styles from './Sheet.module.css';

export interface SheetAction {
  label: string;
  onClick: () => void;
  disabled?: string | null;
  tone?: 'primary' | 'danger' | 'plain';
}

export function Sheet({ title, children, actions = [], onClose }: { title: ReactNode; children?: ReactNode; actions?: SheetAction[]; onClose: () => void }) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const titleId = useId();

  return createPortal(
    <div className={`${styles.backdrop} anim-fade`} onClick={onClose}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
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
    </div>,
    document.body,
  );
}
