import { memo, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { TABS, selectTab, useGameStore, type TabId } from '../store/gameStore';
import styles from './TabDock.module.css';

const ICONS: Record<TabId, ReactNode> = {
  board: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3 20.5 8v8L12 21 3.5 16V8Z" strokeLinejoin="round" />
      <path d="M3.5 8 12 13l8.5-5M12 13v8" strokeLinejoin="round" />
    </svg>
  ),
  status: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9h8M8 13h8M8 17h5" strokeLinecap="round" />
    </svg>
  ),
  progress: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 20V10M11 20V4M18 20v-7" strokeLinecap="round" />
    </svg>
  ),
};

/**
 * 하단 탭 독 (2026-09-23 사용자 지시: 보드/상태/진행 탭을 상단 헤더에서 하단으로 옮긴다).
 * 화면 최하단에 고정. 탭 전환 100ms 예산(F014) 때문에 motion-fast 이하로만 움직인다.
 */
export const TabDock = memo(function TabDock() {
  const tab = useGameStore(selectTab);
  const setTab = useGameStore((s) => s.setTab);

  return (
    <nav className={styles.root} role="tablist" aria-label="게임 탭">
      {TABS.map((t) => (
        <button
          key={t.id}
          id={`tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          aria-controls={`panel-${t.id}`}
          className={cx(styles.item, tab === t.id && styles.active)}
          onClick={() => setTab(t.id)}
        >
          {ICONS[t.id]}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
});
