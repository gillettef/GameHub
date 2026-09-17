import { Header, LeaguePanel, LogPanel, MyBoard, PendingModal, PlayerSummary } from './components/Shell';
import { FridayAftermathScreen, FridayPrepareScreen } from './screens/Friday';
import { GameOverScreen } from './screens/GameOver';
import { Lobby, RoomLobby } from './screens/Lobby';
import { MondayScreen } from './screens/Monday';
import { DraftScreen, ObjectiveScreen } from './screens/Setup';
import { SpectatorScreen } from './screens/Spectator';
import { WeekdayScreen } from './screens/Weekday';
import { StoreProvider, useGame, useStore } from './store';

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

function Game() {
  const { view, error } = useGame();
  return (
    <div className="game">
      <Header />
      <div className="columns">
        <aside className="col left">
          {view.seats.map((id) => (
            <PlayerSummary key={id} p={view.players[id]!} isMe={id === view.me} />
          ))}
          <LeaguePanel />
        </aside>
        <main className="col center">
          <PhaseScreen />
          <MyBoard />
        </main>
        <aside className="col right">
          <LogPanel />
        </aside>
      </div>
      <PendingModal />
      {error && <div className="toast">{error}</div>}
    </div>
  );
}

function Router() {
  const { room, view, session, spectating } = useStore();
  if (!room || (!session && !spectating)) return <Lobby />;
  if (room.status === 'lobby' || !view) return <RoomLobby />;
  if (spectating && !session) return <SpectatorScreen />;
  return <Game />;
}

export function App() {
  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  );
}
