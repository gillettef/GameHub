import { cards } from '@server/engine/cards';
import { LeaguePanel, LogPanel, PlayerBoard, PlayerSummary } from '../components/Shell';
import { DAY_LABEL, phaseLabel } from '../labels';
import { useView } from '../store';
import { GameOverScreen } from './GameOver';

function PhaseStatus() {
  const { view } = useView();
  const phase = view.phase;
  const name = (id: string) => view.players[id]?.name ?? id;
  const waiting = (done: Record<string, boolean>) => view.seats.filter((id) => !done[id]).map(name).join(', ');
  switch (phase.kind) {
    case 'setup.draft':
      return <p>임원 드래프트 {phase.round}/3 · 대기: {waiting(phase.picked) || '없음'}</p>;
    case 'setup.objective':
      return <p>목표 카드 선택 · 대기: {waiting(phase.chosen) || '없음'}</p>;
    case 'monday.board':
      return (
        <ul className="small">
          {view.seats.map((id) => {
            const m = phase.meetings[id]!;
            return <li key={id}>{name(id)}: {cards.board(m.card).name} — {m.decided ? '결정 완료' : m.roll === null ? '주사위 대기' : `주사위 ${m.roll}`}</li>;
          })}
        </ul>
      );
    case 'weekday':
      return <p>{DAY_LABEL[phase.day]} · <b>{name(phase.current)}</b>의 차례 {phase.basicDone && '(기본 행동 완료)'}</p>;
    case 'friday.prepare':
      return <p>경기 준비 · 대기: {waiting(phase.submitted) || '없음'}</p>;
    case 'friday.aftermath':
      return (
        <ul className="small">
          {view.seats.map((id) => {
            const m = phase.matches[id]!;
            return (
              <li key={id}>
                {name(id)} {m.report.myGoals}:{m.report.theirGoals} {cards.opponent(m.opponentCardId).teamName} ({{ win: '승', draw: '무', loss: '패' }[m.report.outcome]}) — {m.decided ? '완료' : m.roll === null ? '주사위 대기' : `주사위 ${m.roll}`}
              </li>
            );
          })}
        </ul>
      );
    case 'gameOver':
      return null;
  }
}

export function SpectatorScreen() {
  const { view, room, connected, leave } = useView();
  return (
    <div className="game">
      <header className="topbar">
        <div>
          <b>ELEVEN</b> · 관전 · 방 {room?.code} · {view.week}주차 · {phaseLabel(view.phase.kind)}
        </div>
        <div>
          <span className={`dot ${connected ? 'on' : 'off'}`} /> {connected ? '연결됨' : '재연결 중…'}
          <button className="link" onClick={leave}>나가기</button>
        </div>
      </header>
      <div className="columns">
        <aside className="col left">
          {view.seats.map((id) => (
            <PlayerSummary key={id} p={view.players[id]!} isMe={false} />
          ))}
          <LeaguePanel />
        </aside>
        <main className="col center">
          <section className="panel">
            <h2>{phaseLabel(view.phase.kind)}</h2>
            <PhaseStatus />
          </section>
          {view.phase.kind === 'gameOver' ? (
            <GameOverScreen />
          ) : (
            view.seats.map((id) => <PlayerBoard key={id} p={view.players[id]!} title={view.players[id]!.name} />)
          )}
        </main>
        <aside className="col right">
          <LogPanel />
        </aside>
      </div>
    </div>
  );
}
