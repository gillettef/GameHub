import { useEffect } from 'react';
import { getMap, nameOf } from '@astraltab/shared';
import { HandoffOverlay } from '../components/HandoffOverlay';
import { cx } from '../lib/cx';
import { TABS, selectState, selectTab, selectViewerId, useGameStore, type TabId } from '../store/gameStore';
import { BoardTab } from '../tabs/BoardTab';
import { ProgressTab } from '../tabs/ProgressTab';
import { StatusTab } from '../tabs/StatusTab';
import { ResultOverlay } from './ResultOverlay';
import styles from './GamePage.module.css';

interface GamePageProps {
  /** '나가기' 처리. 핫시트는 설정 화면으로, 온라인은 랜딩으로 (게임은 서버에 남는다) */
  onQuit: () => void;
}

/**
 * 게임 대시보드 (F014, F015). 세 탭을 모두 마운트해 두고 `hidden` 으로 숨긴다 — 전환 시 렌더 비용이 없다.
 * 게임 세계(data-world="game")는 이 루트 안에서만 쓴다.
 */
export function GamePage({ onQuit }: GamePageProps) {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const mode = useGameStore((s) => s.mode);
  const room = useGameStore((s) => s.room);
  const connection = useGameStore((s) => s.connection);
  const tab = useGameStore(selectTab);
  const setTab = useGameStore((s) => s.setTab);
  const notice = useGameStore((s) => s.notice);
  const clearNotice = useGameStore((s) => s.clearNotice);
  const resultDismissed = useGameStore((s) => s.resultDismissed);
  const handoffPending = useGameStore((s) => s.handoffPending);

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
  const offline = mode === 'online' && connection !== 'connected';
  const absent = mode === 'online' && room ? state.players.filter((p) => p.kind === 'human' && !room.connected.includes(p.id)) : [];

  return (
    <div className={styles.root} data-world="game">
      <header className={styles.header}>
        <div className={styles.brand}>
          <h1 className={styles.logo}>AstralTab</h1>
          <span className={styles.map}>
            {map.name} · {map.size}×{map.size}
            {mode === 'online' && room ? ` · 방 ${room.roomId}` : ' · 핫시트'}
          </span>
        </div>
        <div className={styles.turnInfo}>
          <span className={styles.round}>
            라운드 {state.round}
            <span className={styles.limit}> / {state.roundLimit}</span>
          </span>
          <span className={styles.turn}>{state.turn}턴</span>
          <span className={styles.who}>
            {state.phase === 'finished' ? '게임 종료' : state.currentPlayerId === viewerId ? '내 차례' : `${current}의 차례`}
          </span>
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
              id={`tab-${t.id}`}
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
          <button type="button" className={styles.quit} onClick={onQuit}>
            나가기
          </button>
        </nav>
      </header>

      {offline && (
        <div className={styles.banner} role="alert">
          서버와 연결이 끊겼습니다. 다시 연결하는 중입니다. 게임은 서버에 그대로 남아 있습니다.
        </div>
      )}
      {!offline && absent.length > 0 && state.phase === 'playing' && (
        <div className={styles.bannerSoft} role="status">
          접속 끊김: {absent.map((p) => p.nickname).join(', ')}. 돌아오면 이어서 진행됩니다.
        </div>
      )}

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
      {showResult && <ResultOverlay onNewGame={onQuit} />}
      {mode === 'hotseat' && handoffPending && state.phase === 'playing' && <HandoffOverlay />}
    </div>
  );
}

function TabPanel({ id, active, children }: { id: TabId; active: TabId; children: React.ReactNode }) {
  return (
    <section id={`panel-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} className={styles.panel} hidden={active !== id}>
      {children}
    </section>
  );
}
