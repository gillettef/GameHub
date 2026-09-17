import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { PlayerId } from '@server/engine/state';
import { PlayerBoard } from './components/Boards';
import { DiceTray } from './components/DiceTray';
import { ActionLog, Header, LeaguePanel, MarketPanel, PendingModal, Sidebar } from './components/Shell';
import { FridayAftermathScreen, FridayPrepareScreen } from './screens/Friday';
import { GameOverScreen } from './screens/GameOver';
import { Lobby, RoomLobby } from './screens/Lobby';
import { MondayScreen } from './screens/Monday';
import { DraftScreen, ObjectiveScreen } from './screens/Setup';
import { PhaseStatus } from './screens/Spectator';
import { WeekdayScreen } from './screens/Weekday';
import { StoreProvider, useGame, useStore, useView } from './store';

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
      return <WeekdayScreen />;
    case 'friday.prepare':
      return <FridayPrepareScreen />;
    case 'friday.aftermath':
      return <FridayAftermathScreen />;
    case 'gameOver':
      return <GameOverScreen />;
  }
}

// 3분할: 참가자 사이드바 / 단계 패널 + 선택한 참가자 보드 + 공용 보드 / 기록
export function GameLayout({ phasePanel, subtitle }: { phasePanel: ReactNode; subtitle?: string }) {
  const { view, session, error } = useView();
  const [selected, setSelected] = useState<PlayerId>(session?.playerId ?? view.seats[0]!);
  useEffect(() => {
    if (!view.seats.includes(selected)) setSelected(session?.playerId ?? view.seats[0]!);
  }, [view.seats, selected, session?.playerId]);
  const p = view.players[selected] ?? view.players[view.seats[0]!]!;
  const isMe = session?.playerId === p.id;
  return (
    <div className="game">
      <Header subtitle={subtitle} />
      <div className="columns">
        <Sidebar selected={p.id} onSelect={setSelected} />
        <main className="main">
          <div className="main-top">
            <div className="main-top-phase">{phasePanel}</div>
            <DiceTray />
          </div>
          <PlayerBoard p={p} privateInfo={isMe ? view.self : undefined} />
          <MarketPanel />
          <LeaguePanel />
        </main>
        <ActionLog />
      </div>
      <PendingModal />
      {error && <div className="toast" role="alert">{error}</div>}
    </div>
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
      <Router />
    </StoreProvider>
  );
}
