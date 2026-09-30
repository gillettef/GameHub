import { useEffect } from 'react';
import { OpponentRecap } from '../components/OpponentRecap';
import { HandoffOverlay } from '../components/HandoffOverlay';
import { PlayerStrip } from '../components/PlayerStrip';
import { TabDock } from '../components/TabDock';
import { selectState, selectTab, selectViewerId, useGameStore, type TabId } from '../store/gameStore';
import { BoardTab } from '../tabs/BoardTab';
import { CardsTab } from '../tabs/CardsTab';
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

  // 내 턴 인지 신호(2026-09-28): 특히 온라인 대전에서 다른 브라우저 탭을 보고 있어도
  // 탭 제목으로 내 차례가 왔음을 알 수 있게 한다. 화면을 떠나면(다른 페이지 이동) 기본 제목으로 되돌린다
  useEffect(() => {
    if (!state || !viewerId) return;
    const isMyTurn = state.phase === 'playing' && state.currentPlayerId === viewerId;
    document.title = isMyTurn ? '내 차례 · AstralTab' : 'AstralTab';
  }, [state, viewerId]);
  useEffect(() => () => {
    document.title = 'AstralTab';
  }, []);

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
        <TabPanel id="cards" active={tab}>
          <CardsTab />
        </TabPanel>
        <TabPanel id="help" active={tab}>
          <HelpTab />
        </TabPanel>
      </main>

      <TabDock />

      <OpponentRecap />

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
