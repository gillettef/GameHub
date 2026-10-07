import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { hasSeenHelpTab, markHelpTabSeen } from '../lib/onboarding';
import { TABS, selectIsMyTurn, selectState, selectTab, useGameStore, type TabId } from '../store/gameStore';
import styles from './TabDock.module.css';

const ICONS: Record<TabId, ReactNode> = {
  board: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3 20.5 8v8L12 21 3.5 16V8Z" strokeLinejoin="round" />
      <path d="M3.5 8 12 13l8.5-5M12 13v8" strokeLinejoin="round" />
    </svg>
  ),
  status: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9h8M8 13h8M8 17h5" strokeLinecap="round" />
    </svg>
  ),
  progress: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 20V10M11 20V4M18 20v-7" strokeLinecap="round" />
    </svg>
  ),
  cards: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="7" width="13" height="14" rx="2" transform="rotate(-8 9.5 14)" />
      <rect x="8" y="3" width="13" height="14" rx="2" />
    </svg>
  ),
  help: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.3a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.2 1-1.2 1.9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
};

/**
 * 하단 탭 독 (2026-09-23 사용자 지시: 보드/상태/진행 탭을 상단 헤더에서 하단으로 옮긴다).
 * 화면 최하단에 고정. 탭 전환 100ms 예산(F014) 때문에 motion-fast 이하로만 움직인다.
 * 2026-10-01 사용자 지시로 글자 라벨을 없애고 아이콘만 둔다(접근성은 aria-label/title). 내 차례인데 다른 탭을
 * 보고 있으면 보드 아이콘이 맥동하고, 진행 탭에는 안 읽은 사건 수가 뜬다.
 */
/** 안 읽은 사건으로 세는 로그 종류(수입·드로우 같은 정산은 뺀다) */
const NEWS_KINDS = new Set(['plant', 'flip', 'discard', 'surrender']);

export const TabDock = memo(function TabDock() {
  const tab = useGameStore(selectTab);
  const setTab = useGameStore((s) => s.setTab);
  const state = useGameStore(selectState);
  const isMyTurn = useGameStore(selectIsMyTurn);

  // 처음 온 사람이 설명 탭이 있다는 걸 알아채게 점 배지를 띄운다. 한 번 열어 보면 다시는 안 뜬다
  const [helpSeen, setHelpSeen] = useState(hasSeenHelpTab);
  useEffect(() => {
    if (tab === 'help' && !helpSeen) {
      markHelpTabSeen();
      setHelpSeen(true);
    }
  }, [tab, helpSeen]);

  // 진행 탭 배지: 마지막으로 진행 탭을 본 뒤 쌓인 사건 수. 처음 마운트 시점까지의 기록은 읽은 것으로 본다
  const logLength = state?.log.length ?? 0;
  const seenLength = useRef(logLength);
  const [, bump] = useState(0);
  useEffect(() => {
    if (tab === 'progress') {
      seenLength.current = logLength;
      bump((n) => n + 1);
    }
  }, [tab, logLength]);
  const unread = useMemo(() => {
    if (!state || tab === 'progress') return 0;
    return state.log.slice(seenLength.current).filter((e) => NEWS_KINDS.has(e.kind)).length;
  }, [state, tab]);

  // 보드 탭 배지: 내 차례인데 다른 탭을 보고 있으면 알린다
  const myTurnElsewhere = isMyTurn && tab !== 'board';

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
          aria-label={t.label}
          title={t.label}
          className={cx(styles.item, tab === t.id && styles.active, t.id === 'board' && myTurnElsewhere && styles.alert)}
          onClick={() => setTab(t.id)}
        >
          {ICONS[t.id]}
          {t.id === 'help' && !helpSeen && <span className={styles.badge} aria-label="새 안내" />}
          {t.id === 'board' && myTurnElsewhere && <span className={styles.badge} aria-label="내 차례" />}
          {t.id === 'progress' && unread > 0 && (
            <span className={styles.countBadge} aria-label={`새 사건 ${unread}건`}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
});
