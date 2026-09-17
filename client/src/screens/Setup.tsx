import { useGame } from '../store';
import { ExecutiveCardView, ObjectiveCardView } from '../components/Cards';

export function DraftScreen() {
  const { view, act } = useGame();
  if (view.phase.kind !== 'setup.draft') return null;
  const { round, hand, picked, handSizes } = view.phase;
  const mine = picked[view.me];
  return (
    <section className="panel">
      <h2>임원 드래프트 · {round}/3 라운드</h2>
      <p className="muted small">1장을 고르면 남은 카드는 왼쪽 참가자에게 넘어갑니다. 3명의 임원이 이사회 투표와 능력치를 결정합니다.</p>
      <div className="row small">
        {view.seats.map((id) => (
          <span key={id} className={picked[id] ? 'badge' : 'muted'}>{view.players[id]!.name}: {picked[id] ? '선택 완료' : `${handSizes[id]}장 고르는 중`}</span>
        ))}
      </div>
      <div className="cards">
        {hand.map((cardId) => (
          <ExecutiveCardView key={cardId} cardId={cardId} onClick={mine ? undefined : () => act({ type: 'draftPick', cardId })} />
        ))}
      </div>
      {mine && <p className="muted">다른 참가자를 기다리는 중…</p>}
    </section>
  );
}

export function ObjectiveScreen() {
  const { view, act } = useGame();
  if (view.phase.kind !== 'setup.objective') return null;
  const { options, chosen } = view.phase;
  const mine = chosen[view.me];
  return (
    <section className="panel">
      <h2>목표 카드 선택</h2>
      <p className="muted small">2장 중 1장을 보관합니다. 다른 참가자에게는 공개되지 않습니다. (달성 판정은 이후 단계에서 추가)</p>
      <div className="cards">
        {options.map((cardId) => (
          <ObjectiveCardView key={cardId} cardId={cardId} onClick={mine ? undefined : () => act({ type: 'chooseObjective', cardId })} />
        ))}
      </div>
      {mine && <p className="muted">다른 참가자를 기다리는 중…</p>}
    </section>
  );
}
