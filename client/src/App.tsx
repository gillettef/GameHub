import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { PlayerId } from '@server/engine/state';
import { CommitProvider, ConfirmBar } from './commit';
import { PlayerBoard } from './components/Boards';
import { DiceTray } from './components/DiceTray';
import { LegendButton } from './components/Legend';
import { ActionLog, Header, LeagueBody, MarketBody, PendingModal, Sidebar } from './components/Shell';
import { Tabs } from './components/Tabs';
import { EffectToasts } from './feed';
import { NotifyProvider, TurnAlert } from './notify';
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

type SharedTab = 'market' | 'league';

// 3분할: 참가자 사이드바 / 단계 패널 + 선택한 참가자 보드(탭) + 공용 영역(이적 시장·리그 탭) / 기록
export function GameLayout({ phasePanel, subtitle }: { phasePanel: ReactNode; subtitle?: string }) {
  const { view, session, error } = useView();
  const [selected, setSelected] = useState<PlayerId>(session?.playerId ?? view.seats[0]!);
  useEffect(() => {
    if (!view.seats.includes(selected)) setSelected(session?.playerId ?? view.seats[0]!);
  }, [view.seats, selected, session?.playerId]);
  // 턴제 단계에서 차례가 바뀌면 그 참가자의 보드를 보여준다 (원하면 사이드바에서 다른 참가자를 골라 볼 수 있다)
  const current = 'current' in view.phase ? view.phase.current : null;
  useEffect(() => {
    if (current) setSelected(current);
  }, [current]);
  // 공용 영역 탭: 주중에는 이적 시장, 경기 결과·종료 때는 리그
  const [shared, setShared] = useState<SharedTab>('market');
  useEffect(() => {
    if (view.phase.kind === 'friday.aftermath' || view.phase.kind === 'gameOver') setShared('league');
    else if (view.phase.kind === 'weekday') setShared('market');
  }, [view.phase.kind]);

  const p = view.players[selected] ?? view.players[view.seats[0]!]!;
  const isMe = session?.playerId === p.id;
  const myPending = session ? (view.players[session.playerId]?.pending.length ?? 0) : 0;
  // 선택(확정 대기)은 단계·차례·요일이 바뀌거나 대상 선택이 생기면 지운다
  const commitScope = [view.week, view.phase.kind, current ?? '', view.phase.kind === 'weekday' ? view.phase.day : '', myPending].join('|');
  return (
    <CommitProvider scope={commitScope}>
      <div className="game">
        <Header subtitle={subtitle} />
        <div className="columns">
          <Sidebar selected={p.id} onSelect={setSelected} />
          <main className="main">
            <div className="main-top">
              <div className="main-top-phase">{phasePanel}</div>
              <div className="main-side">
                <DiceTray />
                <LegendButton />
              </div>
            </div>
            <PlayerBoard p={p} privateInfo={isMe ? view.self : undefined} />
            <section className="panel shared-panel">
              <Tabs<SharedTab>
                tabs={[
                  { key: 'market', label: '이적 시장' },
                  { key: 'league', label: '리그 성적표' },
                ]}
                value={shared}
                onChange={setShared}
              />
              {shared === 'market' ? <MarketBody /> : <LeagueBody />}
            </section>
          </main>
          <ActionLog />
        </div>
        <PendingModal />
        <ConfirmBar />
        <EffectToasts />
        <TurnAlert />
        {error && <div className="toast" role="alert">{error}</div>}
      </div>
    </CommitProvider>
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
      </NotifyProvider>
    </StoreProvider>
  );
}
