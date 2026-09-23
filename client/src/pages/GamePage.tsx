import { useEffect } from 'react';
import { HandoffOverlay } from '../components/HandoffOverlay';
import { PlayerStrip } from '../components/PlayerStrip';
import { TabDock } from '../components/TabDock';
import { selectState, selectTab, selectViewerId, useGameStore, type TabId } from '../store/gameStore';
import { BoardTab } from '../tabs/BoardTab';
import { HelpTab } from '../tabs/HelpTab';
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
  const showResult = state.phase === 'finished' && !resultDismissed;
  const offline = mode === 'online' && connection !== 'connected';
  const absent = mode === 'online' && room ? state.players.filter((p) => p.kind === 'human' && !room.connected.includes(p.id)) : [];

  return (
    <div className={styles.root} data-world="game">
      <PlayerStrip onQuit={onQuit} />

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
        <TabPanel id="help" active={tab}>
          <HelpTab />
        </TabPanel>
      </main>

      <TabDock />

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
