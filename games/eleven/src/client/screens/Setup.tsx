import { ExecutiveCardView, ObjectiveCardView } from '../components/Cards';
import { Crest, EMBLEM_LIST } from '../components/Crest';
import { seatColor } from '../components/Shell';
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

// 임원 드래프트: 카드를 누르면 바로 영입한다 — 확정·취소 막대 없음(사용자 요청 2026-09)
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
      <p className="hint">임원 1명을 누르면 바로 영입하고 남은 카드는 왼쪽 참가자에게 넘어갑니다. 주사위 눈의 색이 이사회에서 그 임원이 찍는 표입니다.</p>
      <div className="cards">
        {hand.map((cardId) => (
          <ExecutiveCardView key={cardId} cardId={cardId} onClick={mine ? undefined : () => act({ type: 'draftPick', cardId })} />
        ))}
      </div>
      {mine && <WaitingFor done={picked} />}
      {!mine && <EmblemPicker />}
    </section>
  );
}

// 내 구단 엠블럼 고르기(옛 대기실의 선택 격자): 준비 단계에서 아직 고르는 중일 때만 바꿀 수 있다(한 판에서 겹치지 않음)
function EmblemPicker() {
  const { view, act, room } = useGame();
  const me = room?.players.find((p) => p.id === view.me);
  if (!me) return null;
  return (
    <details className="emblem-picker">
      <summary>내 구단 엠블럼 바꾸기 <span className="muted small">· {EMBLEM_LIST.find((e) => e.id === me.emblem)?.name}</span></summary>
      <div className="emblem-grid" role="radiogroup" aria-label="내 구단 엠블럼">
        {EMBLEM_LIST.map((e) => {
          const owner = room?.players.find((p) => p.emblem === e.id && p.id !== me.id);
          const chosen = me.emblem === e.id;
          return (
            <button key={e.id} role="radio" aria-checked={chosen} aria-label={e.name} className={chosen ? 'emblem-option chosen' : 'emblem-option'} disabled={!!owner} title={owner ? `${e.name} — ${owner.name}의 엠블럼` : e.name} onClick={() => !chosen && act({ type: 'emblem', emblem: e.id })}>
              <Crest name={e.name} emblem={e.id} color={chosen ? seatColor(view, me.id) : owner ? 'var(--muted-light)' : 'var(--ink-2)'} size={30} />
            </button>
          );
        })}
      </div>
    </details>
  );
}

// 목표 카드도 누르면 바로 보관한다 — 확정 막대 없음(사용자 요청 2026-09-22)
export function ObjectiveScreen() {
  const { view, act } = useGame();
  if (view.phase.kind !== 'setup.objective') return null;
  const { options, chosen: chosenMap } = view.phase;
  const mine = chosenMap[view.me];
  return (
    <section className="panel phase-panel mine">
      <div className="panel-head">
        <h2>목표 카드</h2>
        <Waiting done={chosenMap} />
      </div>
      <p className="hint">2장 중 1장을 누르면 바로 보관합니다. 다른 참가자에게는 보이지 않습니다.</p>
      <div className="cards">
        {options.map((cardId) => (
          <ObjectiveCardView key={cardId} cardId={cardId} onClick={mine ? undefined : () => act({ type: 'chooseObjective', cardId })} />
        ))}
      </div>
      {mine && <WaitingFor done={chosenMap} />}
    </section>
  );
}
