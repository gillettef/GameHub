import { useGame } from '../store';
import { ExecutiveCardView, ObjectiveCardView } from '../components/Cards';

function Waiting({ done }: { done: Record<string, boolean> }) {
  const { view } = useGame();
  return (
    <span className="waiting">
      {view.seats.map((id) => (
        <span key={id} className={`tag${done[id] ? ' done' : ''}`}>{view.players[id]!.name}{done[id] ? ' ✓' : ''}</span>
      ))}
    </span>
  );
}

export function DraftScreen() {
  const { view, act } = useGame();
  if (view.phase.kind !== 'setup.draft') return null;
  const { round, hand, picked } = view.phase;
  const mine = picked[view.me];
  return (
    <section className="panel phase-panel mine">
      <div className="panel-head">
        <h2>임원 드래프트 {round}/3</h2>
        <Waiting done={picked} />
      </div>
      <p className="hint">임원 1명을 고르면 남은 카드는 왼쪽 참가자에게 넘어갑니다. 주사위 눈의 색이 이사회에서 그 임원이 찍는 표입니다.</p>
      <div className="cards">
        {hand.map((cardId) => (
          <ExecutiveCardView key={cardId} cardId={cardId} onClick={mine ? undefined : () => act({ type: 'draftPick', cardId })} />
        ))}
      </div>
      {mine && <p className="muted">다른 참가자를 기다리는 중</p>}
    </section>
  );
}

export function ObjectiveScreen() {
  const { view, act } = useGame();
  if (view.phase.kind !== 'setup.objective') return null;
  const { options, chosen } = view.phase;
  const mine = chosen[view.me];
  return (
    <section className="panel phase-panel mine">
      <div className="panel-head">
        <h2>목표 카드</h2>
        <Waiting done={chosen} />
      </div>
      <p className="hint">2장 중 1장을 보관합니다. 다른 참가자에게는 보이지 않습니다.</p>
      <div className="cards">
        {options.map((cardId) => (
          <ObjectiveCardView key={cardId} cardId={cardId} onClick={mine ? undefined : () => act({ type: 'chooseObjective', cardId })} />
        ))}
      </div>
      {mine && <p className="muted">다른 참가자를 기다리는 중</p>}
    </section>
  );
}
