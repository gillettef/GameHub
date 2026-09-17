import { Header, LeaguePanel, LogPanel, MyBoard, PendingModal, PlayerSummary } from './components/Shell';
import { phaseLabel } from './labels';
import { Lobby, RoomLobby } from './screens/Lobby';
import { MondayScreen } from './screens/Monday';
import { DraftScreen, ObjectiveScreen } from './screens/Setup';
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
    default:
      return (
        <section className="panel">
          <h2>{phaseLabel(view.phase.kind)}</h2>
          <p className="muted">이 단계의 화면은 아직 준비 중입니다.</p>
        </section>
      );
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
  const { room, view, session } = useStore();
  if (!room || !session) return <Lobby />;
  if (room.status === 'lobby' || !view) return <RoomLobby />;
  return <Game />;
}

export function App() {
  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  );
}
