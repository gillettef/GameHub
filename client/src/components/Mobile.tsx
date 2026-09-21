import type { ReactNode } from 'react';
import { useCommit } from '../commit';
import { myTask } from '../notify';
import { useView } from '../store';
import { useUi } from '../ui';
import type { MobileTab } from '../ui';
import { ActionSidebar } from './ActionSidebar';
import { PlayerBoard } from './Boards';
import { unreadCount } from './Chat';
import { ActionLog, LeagueBody, MarketBody } from './Shell';

// 모바일용 화면 (device.tsx 에서 '모바일용'을 고른 경우): 한 열 + 아래 고정 탭 막대. 한 번에 한 영역만 보인다.
//   진행 = 주사위 · 주중 행동 목록 · 단계 패널(드래프트/이사회/경기 준비…) / 구단 = 고른 참가자의 개인 보드 /
//   시장 = 이적 시장 / 리그 = 리그 성적표 / 기록 = 행동 기록
// '진행' 영역은 다른 탭을 볼 때도 마운트된 채 숨겨 둔다 — 경기 준비 화면의 라인업(로컬 상태)과 주사위 애니메이션이
// 탭을 오가도 사라지지 않게. 사이드바 버튼의 showMarket/showBoard 는 ui.tsx 가 mobileTab 도 함께 옮긴다.

const NAV_ICONS: Record<MobileTab, ReactNode> = {
  play: <path d="M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8zM6.6 5.4 11 8l-4.4 2.6z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />,
  board: <path d="M8 1.5 2.5 3.5v4.3c0 3.3 2.3 5.6 5.5 6.7 3.2-1.1 5.5-3.4 5.5-6.7V3.5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  market: <path d="M2.5 6.5 3.6 2.5h8.8l1.1 4M2.5 6.5v7h11v-7M2.5 6.5h11M6.5 13.5v-4h3v4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />,
  league: <path d="M2.5 13.5v-4h3v4M6.5 13.5v-9h3v9M10.5 13.5v-6h3v6M1.5 13.5h13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />,
  log: <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.5M2.5 8h.5M2.5 12h.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
};

const NAV: { key: MobileTab; label: string }[] = [
  { key: 'play', label: '진행' },
  { key: 'board', label: '구단' },
  { key: 'market', label: '시장' },
  { key: 'league', label: '리그' },
  { key: 'log', label: '기록·채팅' },
];

// 아래 고정 탭 막대. 내가 할 일이 있는데 '진행' 탭을 보고 있지 않으면 금색 점으로 알린다
export function MobileNav() {
  const { view, session, chat } = useView();
  const { mobileTab, setMobileTab, sideTab, setSideTab, chatSeen } = useUi();
  // 안 읽은 채팅: 채팅을 보고 있지 않을 때만 센다. 누르면 바로 채팅 탭으로
  const unread = mobileTab === 'log' && sideTab === 'chat' ? 0 : unreadCount(chat, chatSeen, session?.playerId);
  const todo = !!session && myTask(view) !== null;
  return (
    <nav className="mobile-nav" aria-label="화면 전환">
      {NAV.map((t) => (
        <button key={t.key} className={mobileTab === t.key ? 'active' : ''} aria-current={mobileTab === t.key ? 'page' : undefined} onClick={() => { if (t.key === 'log' && unread > 0) setSideTab('chat'); setMobileTab(t.key); }}>
          <svg viewBox="0 0 16 16" width={20} height={20} aria-hidden="true">{NAV_ICONS[t.key]}</svg>
          <span>{t.label}</span>
          {t.key === 'play' && todo && mobileTab !== 'play' && <span className="nav-dot" aria-label="내 차례" />}
          {t.key === 'log' && unread > 0 && <span className="badge-count nav-badge" aria-label={`안 읽은 채팅 ${unread}개`}>{unread}</span>}
        </button>
      ))}
    </nav>
  );
}

// 주중 내 차례에 기본 행동을 마쳤는데 다른 탭(시장·구단 등)을 보고 있으면, 탭 막대 위에 차례 끝내기 막대를 띄운다.
// 시장에서 카드를 산 뒤 '진행' 탭으로 돌아가지 않아도 차례를 끝낼 수 있게. 확정 막대가 떠 있는 동안은 숨긴다(같은 자리)
export function MobileTurnBar() {
  const { view, session, act } = useView();
  const { mobileTab, setMobileTab } = useUi();
  const { selection } = useCommit();
  if (!session || view.phase.kind !== 'weekday' || view.phase.current !== session.playerId) return null;
  if (!view.phase.basicDone || mobileTab === 'play' || selection) return null;
  if ((view.players[session.playerId]?.pending.length ?? 0) > 0) return null;
  return (
    <div className="mobile-turnbar" role="status">
      <span>기본 행동 완료</span>
      <span className="confirm-actions">
        <button className="ghost light" onClick={() => setMobileTab('play')}>행동 목록</button>
        <button className="primary" onClick={() => act({ type: 'endTurn' })}>차례 끝내기</button>
      </span>
    </div>
  );
}

export function MobileMain({ phasePanel }: { phasePanel: ReactNode }) {
  const { view, session } = useView();
  const { selected, mobileTab } = useUi();
  const p = view.players[selected] ?? view.players[view.seats[0]!]!;
  const isMe = session?.playerId === p.id;
  return (
    <main className="mobile-main">
      <div className="mobile-play" hidden={mobileTab !== 'play'}>
        <ActionSidebar />
        {view.phase.kind !== 'weekday' && <div className="main-top">{phasePanel}</div>}
      </div>
      {mobileTab === 'board' && (
        <section className="panel main-panel">
          <div className="panel-head"><h2>{p.name}</h2></div>
          <PlayerBoard p={p} privateInfo={isMe ? view.self : undefined} />
        </section>
      )}
      {mobileTab === 'market' && (
        <section className="panel main-panel">
          <div className="panel-head"><h2>이적 시장</h2></div>
          <MarketBody />
        </section>
      )}
      {mobileTab === 'league' && (
        <section className="panel main-panel">
          <div className="panel-head"><h2>리그 성적표</h2></div>
          <LeagueBody />
        </section>
      )}
      {mobileTab === 'log' && <ActionLog />}
    </main>
  );
}
