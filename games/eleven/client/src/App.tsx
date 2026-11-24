import type { ReactNode } from 'react';
import { CommitProvider, ConfirmBar } from './commit';
import { MobileMain, MobileNav, MobileTurnBar } from './components/Mobile';
import { Header, PendingModal, PlayerStrip } from './components/Shell';
import { TooltipLayer } from './components/Tooltip';
import { NotifyProvider } from './notify';
import { FridayAftermathScreen, FridayMatchScreen, FridayPrepareScreen } from './screens/Friday';
import { GameOverScreen } from './screens/GameOver';
import { Lobby, RoomLobby } from './screens/Lobby';
import { MondayScreen } from './screens/Monday';
import { DraftScreen, ObjectiveScreen } from './screens/Setup';
import { PhaseStatus } from './screens/Spectator';
import { StoreProvider, useGame, useStore, useView } from './store';
import { UiProvider } from './ui';

// 단계 패널: 카드 고르기·이사회·경기 준비/결과. 주중 행동은 '진행' 탭의 행동 목록에 있다
function PhaseScreen() {
  const { view } = useGame();
  switch (view.phase.kind) {
    case 'setup.draft':
      return <DraftScreen />;
    case 'setup.objective':
      return <ObjectiveScreen />;
    case 'monday.board':
      return <MondayScreen />;
    case 'weekday':
      return null;
    case 'friday.prepare':
      return <FridayPrepareScreen />;
    case 'friday.match':
      return <FridayMatchScreen />;
    case 'friday.aftermath':
      return <FridayAftermathScreen />;
    case 'gameOver':
      return <GameOverScreen />;
  }
}

// 레이아웃(모바일 전용): 헤더 + 참가자 띠 / 한 열 본문 / 아래 고정 탭 막대 (components/Mobile.tsx)
function Layout({ phasePanel, subtitle }: { phasePanel: ReactNode; subtitle?: string }) {
  const { view, session, error, connected } = useView();
  const current = 'current' in view.phase ? view.phase.current : null;
  const myPending = session ? (view.players[session.playerId]?.pending.length ?? 0) : 0;
  // 선택(확정 대기)은 단계·차례·요일이 바뀌거나 대상 선택이 생기면 지운다
  const commitScope = [view.week, view.phase.kind, current ?? '', view.phase.kind === 'weekday' ? view.phase.day : '', myPending].join('|');
  return (
    <CommitProvider scope={commitScope}>
      <div className="game mobile">
        <Header subtitle={subtitle} />
        <PlayerStrip />
        <MobileMain phasePanel={phasePanel} />
        <MobileTurnBar />
        <MobileNav />
        <PendingModal />
        <ConfirmBar />
        {error && <div className="toast" role="alert">{error}</div>}
        {/* 모바일 헤더는 '연결됨' 글자를 숨기고 점만 보여 줘서 끊긴 것을 알아채기 어렵다 — 끊기면 띠로 알린다 */}
        {!connected && <div className="conn-banner" role="status">연결이 끊겨 다시 연결하는 중…</div>}
      </div>
    </CommitProvider>
  );
}

export function GameLayout(props: { phasePanel: ReactNode; subtitle?: string }) {
  return (
    <UiProvider>
      <Layout {...props} />
    </UiProvider>
  );
}

function Router() {
  const { room, view, session, spectating } = useStore();
  if (!room || (!session && !spectating)) return <Lobby />;
  if (room.status === 'lobby' || !view) return <RoomLobby />;
  if (spectating && !session) return <GameLayout subtitle="관전" phasePanel={<PhaseStatus />} />;
  return <GameLayout phasePanel={<PhaseScreen />} />;
}

export function App() {
  return (
    <StoreProvider>
      <NotifyProvider>
        <Router />
        <TooltipLayer />
      </NotifyProvider>
    </StoreProvider>
  );
}
