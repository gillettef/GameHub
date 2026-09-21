import type { ReactNode } from 'react';
import { CommitProvider, ConfirmBar } from './commit';
import { ActionSidebar } from './components/ActionSidebar';
import { PlayerBoard } from './components/Boards';
import { MobileMain, MobileNav, MobileTurnBar } from './components/Mobile';
import { ActionLog, Header, LeagueBody, MarketBody, PendingModal, PlayerStrip } from './components/Shell';
import { Tabs } from './components/Tabs';
import { TooltipLayer } from './components/Tooltip';
import { DeviceChooser, DeviceProvider, useDevice } from './device';
import { NotifyProvider } from './notify';
import { FridayAftermathScreen, FridayMatchScreen, FridayPrepareScreen } from './screens/Friday';
import { GameOverScreen } from './screens/GameOver';
import { Lobby, RoomLobby } from './screens/Lobby';
import { MondayScreen } from './screens/Monday';
import { DraftScreen, ObjectiveScreen } from './screens/Setup';
import { PhaseStatus } from './screens/Spectator';
import { StoreProvider, useGame, useStore, useView } from './store';
import { UiProvider, useUi } from './ui';
import type { MainTab, SharedTab } from './ui';

// 단계 패널: 카드 고르기·이사회·경기 준비/결과처럼 넓은 화면이 필요한 단계만 메인 위에 둔다. 주중 행동은 사이드바에 있다
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

// 메인 탭: 개인 보드(구단/스타디움/경기/손패) / 공용 보드(이적 시장/리그 성적표)
function MainTabs() {
  const { view, session } = useView();
  const { selected, mainTab, setMainTab, sharedTab, setSharedTab } = useUi();
  const p = view.players[selected] ?? view.players[view.seats[0]!]!;
  const isMe = session?.playerId === p.id;
  return (
    <section className="panel main-panel">
      <Tabs<MainTab>
        className="primary"
        tabs={[
          { key: 'personal', label: '개인 보드', badge: p.name },
          { key: 'shared', label: '공용 보드' },
        ]}
        value={mainTab}
        onChange={setMainTab}
      />
      {mainTab === 'personal' ? (
        <PlayerBoard p={p} privateInfo={isMe ? view.self : undefined} />
      ) : (
        <>
          <Tabs<SharedTab>
            tabs={[
              { key: 'market', label: '이적 시장' },
              { key: 'league', label: '리그 성적표' },
            ]}
            value={sharedTab}
            onChange={setSharedTab}
          />
          {sharedTab === 'market' ? <MarketBody /> : <LeagueBody />}
        </>
      )}
    </section>
  );
}

// 레이아웃: 헤더 + 참가자 띠 / 왼쪽 행동 사이드바 / 가운데 (단계 패널 +) 메인 탭 / 오른쪽 기록.
// 모바일용 화면(device.tsx)은 한 열 + 아래 탭 막대 (components/Mobile.tsx)
function Layout({ phasePanel, subtitle }: { phasePanel: ReactNode; subtitle?: string }) {
  const { view, session, error } = useView();
  const { mobile } = useDevice();
  const current = 'current' in view.phase ? view.phase.current : null;
  const myPending = session ? (view.players[session.playerId]?.pending.length ?? 0) : 0;
  // 선택(확정 대기)은 단계·차례·요일이 바뀌거나 대상 선택이 생기면 지운다
  const commitScope = [view.week, view.phase.kind, current ?? '', view.phase.kind === 'weekday' ? view.phase.day : '', myPending].join('|');
  return (
    <CommitProvider scope={commitScope}>
      <div className={`game${mobile ? ' mobile' : ''}`}>
        <Header subtitle={subtitle} />
        <PlayerStrip />
        {mobile ? (
          <>
            <MobileMain phasePanel={phasePanel} />
            <MobileTurnBar />
            <MobileNav />
          </>
        ) : (
          <div className="columns">
            <ActionSidebar />
            <main className="main">
              {view.phase.kind !== 'weekday' && <div className="main-top">{phasePanel}</div>}
              <MainTabs />
            </main>
            <ActionLog />
          </div>
        )}
        <PendingModal />
        <ConfirmBar />
        {error && <div className="toast" role="alert">{error}</div>}
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
  const { mode } = useDevice();
  if (!mode) return <DeviceChooser />; // 첫 접속: PC용 / 모바일용 선택
  if (!room || (!session && !spectating)) return <Lobby />;
  if (room.status === 'lobby' || !view) return <RoomLobby />;
  if (spectating && !session) return <GameLayout subtitle="관전" phasePanel={<PhaseStatus />} />;
  return <GameLayout phasePanel={<PhaseScreen />} />;
}

export function App() {
  return (
    <DeviceProvider>
      <StoreProvider>
        <NotifyProvider>
          <Router />
          <TooltipLayer />
        </NotifyProvider>
      </StoreProvider>
    </DeviceProvider>
  );
}
