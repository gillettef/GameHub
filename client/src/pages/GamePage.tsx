import { useEffect } from 'react';
import { getMap, nameOf } from '@astraltab/shared';
import { cx } from '../lib/cx';
import { TABS, selectState, selectTab, selectViewerId, useGameStore, type TabId } from '../store/gameStore';
import { BoardTab } from '../tabs/BoardTab';
import { ProgressTab } from '../tabs/ProgressTab';
import { StatusTab } from '../tabs/StatusTab';
import { ResultOverlay } from './ResultOverlay';
import styles from './GamePage.module.css';

/**
 * 게임 대시보드 (F014, F015). 세 탭을 모두 마운트해 두고 `hidden` 으로 숨긴다 — 전환 시 렌더 비용이 없다.
 * 게임 세계(data-world="game")는 이 루트 안에서만 쓴다.
 */
export function GamePage() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const tab = useGameStore(selectTab);
  const setTab = useGameStore((s) => s.setTab);
  const notice = useGameStore((s) => s.notice);
  const clearNotice = useGameStore((s) => s.clearNotice);
  const resultDismissed = useGameStore((s) => s.resultDismissed);
  const backToSetup = useGameStore((s) => s.backToSetup);

  // 안내 문구는 잠시 보였다가 사라진다
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(clearNotice, 4000);
    return () => window.clearTimeout(t);
  }, [notice, clearNotice]);

  if (!state || !viewerId) return null;
  const map = getMap(state.mapId);
  const me = state.players.find((p) => p.id === viewerId);
  const current = state.currentPlayerId ? nameOf(state, state.currentPlayerId) : null;
  const showResult = state.phase === 'finished' && !resultDismissed;

  return (
    <div className={styles.root} data-world="game">
      <header className={styles.header}>
        <div className={styles.brand}>
          <h1 className={styles.logo}>AstralTab</h1>
          <span className={styles.map}>
            {map.name} · {map.size}×{map.size}
          </span>
        </div>
        <div className={styles.turnInfo}>
          <span className={styles.round}>
            라운드 {state.round}
            <span className={styles.limit}> / {state.roundLimit}</span>
          </span>
          <span className={styles.turn}>{state.turn}턴</span>
          <span className={styles.who}>{state.phase === 'finished' ? '게임 종료' : `${current}의 차례`}</span>
          {me && (
            <span className={styles.energy} title="내 에너지">
              에너지 {me.energy}
            </span>
          )}
        </div>
        <nav className={styles.tabs} role="tablist" aria-label="게임 탭">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              className={cx(styles.tab, tab === t.id && styles.tabActive)}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
          <button type="button" className={styles.quit} onClick={backToSetup}>
            나가기
          </button>
        </nav>
      </header>

      <main className={styles.main}>
        <TabPanel id="board" active={tab}>
          <BoardTab />
        </TabPanel>
        <TabPanel id="status" active={tab}>
          <StatusTab />
        </TabPanel>
        <TabPanel id="progress" active={tab}>
          <ProgressTab />
        </TabPanel>
      </main>

      {notice && (
        <div className={styles.notice} role="status">
          {notice}
        </div>
      )}
      {showResult && <ResultOverlay />}
    </div>
  );
}

function TabPanel({ id, active, children }: { id: TabId; active: TabId; children: React.ReactNode }) {
  return (
    <section id={`panel-${id}`} role="tabpanel" className={styles.panel} hidden={active !== id}>
      {children}
    </section>
  );
}
