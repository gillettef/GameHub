// 상세·행동 모달: 지금 보고 있는 화면 가운데에 고정해 띄운다. 행동 버튼은 모달 아래에 붙어 있다
// body 로 포털한다 — 상단 상태 줄처럼 backdrop-filter·transform 이 걸린 조상 안에서 열면 fixed 가 화면이 아니라 그 조상 기준이 된다
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store/app';
import { useScrollLock } from '../useScrollLock';
import styles from './Sheet.module.css';

export interface SheetAction {
  label: string;
  onClick: () => void;
  disabled?: string | null;
  tone?: 'primary' | 'danger' | 'plain';
  /** 누른 뒤에도 시트를 닫지 않는다 — 정착민 늘리기·건설처럼 갱신된 상태로 이어서 반복할 수 있는 행동 */
  keepOpen?: boolean;
}

/** 열린 시트 순서(나중에 연 것이 위). Escape 는 맨 위 시트만 닫는다 */
const stack: symbol[] = [];
/** keepOpen 행동을 보낸 뒤 응답이 안 오면 이만큼 뒤 잠금을 푼다(서버 오류 응답 등) */
const LOCK_MAX = 5000;

export function Sheet({
  title,
  children,
  actions = [],
  onClose,
  backdropClose = true,
}: {
  title: ReactNode;
  children?: ReactNode;
  actions?: SheetAction[];
  onClose: () => void;
  /** false 면 바깥(배경)을 눌러도 닫히지 않는다 — 결과판처럼 실수로 닫으면 안 되는 창 */
  backdropClose?: boolean;
}) {
  useScrollLock();
  const self = useRef(Symbol('sheet'));
  useEffect(() => {
    const me = self.current;
    stack.push(me);
    return () => {
      const i = stack.lastIndexOf(me);
      if (i >= 0) stack.splice(i, 1);
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stack[stack.length - 1] === self.current && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const titleId = useId();
  // keepOpen 행동을 보낸 뒤 상태 버전(ver)이 바뀔 때까지 버튼을 잠근다 — 온라인에서 같은 화면 기준으로 두 번 보내지 않게
  const ver = useApp((s) => s.game?.ver);
  const [lockVer, setLockVer] = useState<number | null>(null);
  useEffect(() => {
    if (lockVer === null) return;
    const t = setTimeout(() => setLockVer(null), LOCK_MAX);
    return () => clearTimeout(t);
  }, [lockVer]);
  const locked = lockVer !== null && ver === lockVer;

  return createPortal(
    <div className={`${styles.backdrop} anim-fade`} onClick={backdropClose ? onClose : undefined}>
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
                  disabled={!!a.disabled || locked}
                  onClick={() => {
                    const app = useApp.getState();
                    const before = app.game?.ver;
                    a.onClick();
                    const after = useApp.getState();
                    // 확인 창이 떴으면(대외 단계 넘김 등) 이 시트는 닫아 겹치지 않게
                    if (!a.keepOpen || after.confirm) {
                      onClose();
                      return;
                    }
                    // 로컬은 바로 반영된다. 온라인은 서버 응답(ver 변경)까지 잠금
                    if (after.mode === 'online' && before !== undefined && after.game?.ver === before) setLockVer(before);
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
