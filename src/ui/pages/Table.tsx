// 게임 테이블: BGA 처럼 한 화면 테이블 — 상단 플레이어 패널, 공용 영역(퀘스트 트랙·카드 줄), 보드, 테크 웹, 하단 행동 바
import { useState } from 'react';
import { useApp } from '../../store/app';
import { quitLocal } from '../../store/localGame';
import { leaveOnline } from '../../online/client';
import { useGame } from '../useGame';
import { PlayerStrip } from '../components/PlayerStrip';
import { QuestTrack } from '../components/QuestTrack';
import { CardRow } from '../components/CardRow';
import { ColonyBoard } from '../components/ColonyBoard';
import { TechWeb } from '../components/TechWeb';
import { ActionBar } from '../components/ActionBar';
import { PendingPrompt } from '../components/PendingPrompt';
import { EraOverlay, LogDrawer, ScoreBoard } from '../components/Overlays';
import { Rules } from '../components/Rules';
import { Sheet } from '../components/Sheet';
import styles from './Table.module.css';

export function Table() {
  const game = useApp((s) => s.game);
  if (!game) return null;
  return <TableInner />;
}

function TableInner() {
  const { game, me } = useGame();
  const viewing = useApp((s) => s.viewing);
  const mode = useApp((s) => s.mode);
  const [overlay, setOverlay] = useState<'menu' | 'log' | 'rules' | 'score' | null>(game.gameOver ? 'score' : null);
  const player = game.players[viewing] ?? game.players[me];
  const leave = () => (mode === 'online' ? leaveOnline() : quitLocal());

  return (
    <div className={styles.table}>
      <PlayerStrip onMenu={() => setOverlay('menu')} onLog={() => setOverlay('log')} />
      <main className={styles.main}>
        <QuestTrack />
        <CardRow />
        {viewing !== me && (
          <button className={styles.back} onClick={() => useApp.getState().set({ viewing: me })}>
            ← 내 보드로
          </button>
        )}
        <ColonyBoard player={player} />
        <TechWeb player={player} />
        <RecentLog />
      </main>
      <ActionBar onResults={() => setOverlay('score')} />
      <PendingPrompt />
      <EraOverlay />
      {overlay === 'log' && <LogDrawer onClose={() => setOverlay(null)} />}
      {overlay === 'rules' && <Rules onClose={() => setOverlay(null)} />}
      {overlay === 'score' && <ScoreBoard onClose={() => setOverlay(null)} onHome={leave} />}
      {overlay === 'menu' && (
        <Sheet
          title="메뉴"
          onClose={() => setOverlay(null)}
          actions={[
            { label: '게임 설명', onClick: () => setTimeout(() => setOverlay('rules')), tone: 'plain' },
            { label: '기록 보기', onClick: () => setTimeout(() => setOverlay('log')), tone: 'plain' },
            { label: mode === 'online' ? '방 나가기(AI가 이어받음)' : '처음 화면으로(자동 저장됨)', onClick: leave, tone: 'danger' },
          ]}
        >
          {mode === 'online' && <p>방 코드: {useApp.getState().lobby?.room}</p>}
        </Sheet>
      )}
    </div>
  );
}

/** 최근 기록 3줄(BGA 의 로그 패널 축약) */
function RecentLog() {
  const { game } = useGame();
  const last = game.log.slice(-4).reverse();
  return (
    <ul className={styles.recent} aria-label="최근 기록">
      {last.map((e, i) => (
        <li key={game.log.length - i}>
          {e.player !== null && <strong>{game.players[e.player].name} </strong>}
          {e.text}
        </li>
      ))}
    </ul>
  );
}
