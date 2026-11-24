import { cards } from '@server/engine/cards';
import { DAY_LABEL, phaseLabel } from '../labels';
import { useView } from '../store';
import { GameOverScreen } from './GameOver';

// 관전자용 단계 상태 패널 (읽기 전용)
export function PhaseStatus() {
  const { view } = useView();
  const phase = view.phase;
  const name = (id: string) => view.players[id]?.name ?? id;
  const waiting = (done: Record<string, boolean>) => view.seats.filter((id) => !done[id]).map(name).join(', ');
  let body: React.ReactNode;
  switch (phase.kind) {
    case 'setup.draft':
      body = <p>{phase.round}/3 라운드 · 고르는 중: {waiting(phase.picked) || '없음'}</p>;
      break;
    case 'setup.objective':
      body = <p>고르는 중: {waiting(phase.chosen) || '없음'}</p>;
      break;
    case 'monday.board':
      body = (
        <ul className="status-list">
          <li>차례: <b>{name(phase.current)}</b></li>
          {view.seats.map((id) => {
            const m = phase.meetings[id]!;
            return <li key={id}><b>{name(id)}</b> {cards.board(m.card).name} — {m.decided ? '결정 완료' : m.roll === null ? '주사위 대기' : '주사위 굴림 (왼쪽 주사위 참고)'}</li>;
          })}
        </ul>
      );
      break;
    case 'weekday':
      body = <p>{DAY_LABEL[phase.day]} · <b>{name(phase.current)}</b>의 차례{phase.basicDone && ' (기본 행동 완료)'}</p>;
      break;
    case 'friday.prepare':
      body = <p>차례: <b>{name(phase.current)}</b> · 라인업 준비 중: {waiting(phase.submitted) || '없음'}</p>;
      break;
    case 'friday.match':
      body = <p>차례: <b>{name(phase.current)}</b> · 전술 효과 결정 중: {waiting(phase.decided) || '없음'}</p>;
      break;
    case 'friday.aftermath':
      body = (
        <ul className="status-list">
          <li>차례: <b>{name(phase.current)}</b></li>
          {view.seats.map((id) => {
            const m = phase.matches[id]!;
            return (
              <li key={id}>
                <b>{name(id)}</b> {m.report.myGoals}:{m.report.theirGoals} {cards.opponent(m.opponentCardId).teamName} ({{ win: '승', draw: '무', loss: '패' }[m.report.outcome]}) — {m.decided ? '완료' : m.roll === null ? '주사위 대기' : '주사위 굴림 (왼쪽 주사위 참고)'}
              </li>
            );
          })}
        </ul>
      );
      break;
    case 'gameOver':
      return <GameOverScreen />;
  }
  return (
    <section className="panel phase-panel">
      <div className="panel-head"><h2>{phaseLabel(phase.kind)}</h2></div>
      {body}
    </section>
  );
}
