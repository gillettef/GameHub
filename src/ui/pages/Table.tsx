// 게임 테이블: BGA 의 TTA 테이블처럼 상하 스크롤 한 화면 —
// 상단 고정 상태 줄(행동 버튼) → 플레이어 상태창 → 퀘스트 트랙(쓰루의 카드 줄 자리) → 플레이어별 보드(나 먼저) → 공용 영역
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useApp } from '../../store/app';
import { quitLocal } from '../../store/localGame';
import { leaveOnline } from '../../online/client';
import { useGame } from '../useGame';
import { StatusBar } from '../components/StatusBar';
import { PlayerStrip } from '../components/PlayerStrip';
import { QuestTrack } from '../components/QuestTrack';
import { ColonyBoard } from '../components/ColonyBoard';
import { TechWeb } from '../components/TechWeb';
import { CommonArea } from '../components/CommonArea';
import { PendingPrompt } from '../components/PendingPrompt';
import { EraOverlay, LogDrawer, ScoreBoard } from '../components/Overlays';
import { Rules } from '../components/Rules';
import { Sheet } from '../components/Sheet';
import { useWakeLock } from '../useWakeLock';
import styles from './Table.module.css';

export function Table() {
  const game = useApp((s) => s.game);
  if (!game) return null;
  return <TableInner />;
}

function TableInner() {
  const { game, me } = useGame();
  const mode = useApp((s) => s.mode);
  const [overlay, setOverlay] = useState<'menu' | 'log' | 'rules' | 'score' | null>(game.gameOver ? 'score' : null);
  const leave = () => (mode === 'online' ? leaveOnline() : quitLocal());
  // 한 판이 길고 상대 차례를 기다리는 시간이 많다 — 게임 중에는 화면이 꺼지지 않게
  useWakeLock(!game.gameOver);
  // 보드 순서: 나 → 나머지 플레이어를 자리 순서대로
  const order = [game.players[me], ...game.players.filter((p) => p.id !== me)];

  return (
    <div className={styles.table}>
      <StatusBar onMenu={() => setOverlay('menu')} onLog={() => setOverlay('log')} onResults={() => setOverlay('score')} />
      <main className={styles.main}>
        <PlayerStrip />
        <QuestTrack />
        {order.map((p) => (
          <div key={p.id} id={`board-${p.id}`} className={styles.board} style={{ '--seat': `var(--seat-${p.id})` } as CSSProperties}>
            <HitFlash harmed={p.harmedRound} round={game.round} />
            <h2 className={styles.banner}>
              {p.name}
              {p.id === me ? <span className={styles.tag}>내 보드</span> : <span className={styles.tag}>{p.id + 1}번 자리</span>}
            </h2>
            <ColonyBoard player={p} />
            <TechWeb player={p} />
          </div>
        ))}
        <CommonArea />
        <RecentLog />
      </main>
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

/** 최근 기록 4줄(BGA 의 로그 패널 축약) */
function RecentLog() {
  const { game } = useGame();
  const last = game.log.slice(-4).reverse();
  return (
    <ul className={styles.recent} aria-label="최근 기록">
      {last.map((e, i) => (
        <li key={game.log.length - i} className="anim-slide-in" style={{ '--delay': `${(last.length - 1 - i) * 60}ms` } as CSSProperties}>
          {e.player !== null && <strong>{game.players[e.player].name} </strong>}
          {e.text}
        </li>
      ))}
    </ul>
  );
}

/** 이 보드가 습격·분쟁·위협으로 피해를 입은 순간 붉게 번쩍인다(harmedRound 가 이번 라운드로 바뀔 때) */
function HitFlash({ harmed, round }: { harmed: number; round: number }) {
  const last = useRef(harmed);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (harmed !== last.current) {
      last.current = harmed;
      if (harmed === round) setN((x) => x + 1);
    }
  }, [harmed, round]);
  useEffect(() => {
    if (!n) return;
    const t = setTimeout(() => setN(0), 900);
    return () => clearTimeout(t);
  }, [n]);
  return n ? <div key={n} className="anim-flash" aria-hidden /> : null;
}
