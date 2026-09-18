import { cards } from '@server/engine/cards';
import { useCommit } from '../commit';
import { ExecutiveCardView, ObjectiveCardView } from '../components/Cards';
import { useGame } from '../store';

// 아직 고르지 않은 참가자 이름. 전원이 골라야(봇 포함) 다음 카드·다음 단계로 넘어간다
function WaitingFor({ done }: { done: Record<string, boolean> }) {
  const { view } = useGame();
  const names = view.seats.filter((id) => !done[id]).map((id) => view.players[id]!.name);
  return <p className="muted waiting-for">다른 참가자를 기다리는 중… {names.length > 0 && <span>({names.join(', ')})</span>}</p>;
}

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

// 드래프트·목표 카드: 카드를 누르면 강조되고 아래 확정 막대에서 확정해야 넘어간다
export function DraftScreen() {
  const { view } = useGame();
  const { chosen, select } = useCommit();
  if (view.phase.kind !== 'setup.draft') return null;
  const { round, hand, picked } = view.phase;
  const mine = picked[view.me];
  return (
    <section className="panel phase-panel mine">
      <div className="panel-head">
        <h2>임원 드래프트 {round}/3</h2>
        <Waiting done={picked} />
      </div>
      <p className="hint">임원 1명을 고르고 확정하면 남은 카드는 왼쪽 참가자에게 넘어갑니다. 주사위 눈의 색이 이사회에서 그 임원이 찍는 표입니다.</p>
      <div className="cards">
        {hand.map((cardId) => (
          <ExecutiveCardView key={cardId} cardId={cardId} chosen={chosen === cardId} onClick={mine ? undefined : () => select(cardId, { type: 'draftPick', cardId }, <>임원 영입: <b>{cards.executive(cardId).name}</b></>)} />
        ))}
      </div>
      {mine && <WaitingFor done={picked} />}
    </section>
  );
}

export function ObjectiveScreen() {
  const { view } = useGame();
  const { chosen, select } = useCommit();
  if (view.phase.kind !== 'setup.objective') return null;
  const { options, chosen: chosenMap } = view.phase;
  const mine = chosenMap[view.me];
  return (
    <section className="panel phase-panel mine">
      <div className="panel-head">
        <h2>목표 카드</h2>
        <Waiting done={chosenMap} />
      </div>
      <p className="hint">2장 중 1장을 골라 확정하면 보관합니다. 다른 참가자에게는 보이지 않습니다.</p>
      <div className="cards">
        {options.map((cardId) => (
          <ObjectiveCardView key={cardId} cardId={cardId} chosen={chosen === cardId} onClick={mine ? undefined : () => select(cardId, { type: 'chooseObjective', cardId }, <>목표 카드: <b>{cards.objective(cardId).name}</b></>)} />
        ))}
      </div>
      {mine && <WaitingFor done={chosenMap} />}
    </section>
  );
}
