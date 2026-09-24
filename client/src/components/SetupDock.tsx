import { memo } from 'react';
import { cx } from '../lib/cx';
import styles from './SetupDock.module.css';

export interface SetupDockTab {
  id: string;
  label: string;
  /** 아직 쓸 수 없는 탭(예: 방을 만들기 전). 눌러서 안내는 볼 수 있지만 흐리게 표시한다 */
  disabled?: boolean;
}

interface SetupDockProps {
  tabs: SetupDockTab[];
  active: string;
  onChange: (id: string) => void;
  label: string;
  /** DockShell 의 패널 id와 같은 접두사. aria-controls로 연결한다 */
  idPrefix: string;
}

/**
 * 입장·대기실(비게임 세계) 전용 하단 탭 독. 게임 대시보드의 TabDock(어두운 무대, Moonlight Cream
 * 강조)과는 다른 화면이라 별도 컴포넌트로 둔다 — Corca 팔레트(흰 서피스, 네이비 헤딩,
 * `#777cdc` 필 강조)를 쓴다(2026-09-24 사용자 지시로 입장+대기실 화면을 하단 독 탭으로 재구성).
 */
export const SetupDock = memo(function SetupDock({ tabs, active, onChange, label, idPrefix }: SetupDockProps) {
  return (
    <nav className={styles.root} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`${idPrefix}-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          aria-controls={`${idPrefix}-panel-${t.id}`}
          className={cx(styles.item, active === t.id && styles.active, t.disabled && styles.locked)}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
});
