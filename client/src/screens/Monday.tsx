import { cards } from '@server/engine/cards';
import type { DieColor } from '@server/engine/types';
import { BoardCardView, ExecutiveCardView } from '../components/Cards';
import { Icon } from '../components/Icons';
import { COLOR_LABEL } from '../labels';
import { useGame } from '../store';

function tally(executiveIds: string[], face: number): Record<DieColor, number> {
  const t: Record<DieColor, number> = { yellow: 0, blue: 0, red: 0 };
  for (const id of executiveIds) t[cards.executive(id).votes[face - 1]!]++;
  return t;
}

function winner(t: Record<DieColor, number>): DieColor | null {
  const sorted = (Object.entries(t) as [DieColor, number][]).sort((a, b) => b[1] - a[1]);
  return sorted[0]![1] > sorted[1]![1] ? sorted[0]![0] : null;
}

export function MondayScreen() {
  const { view, me, act } = useGame();
  if (view.phase.kind !== 'monday.board') return null;
  const meeting = view.phase.meetings[view.me]!;
  const meetings = view.phase.meetings;
  const execIds = me.executives.map((e) => e.cardId);
  const t = meeting.roll ? tally(execIds, meeting.roll) : null;
  const color = t ? winner(t) : null;
  return (
    <section className="panel phase-panel mine">
      <div className="panel-head">
        <h2>이사회</h2>
        <span className="waiting">
          {view.seats.map((id) => (
            <span key={id} className={`tag${meetings[id]!.decided ? ' done' : ''}`}>{view.players[id]!.name}{meetings[id]!.decided ? ' ✓' : ''}</span>
          ))}
        </span>
      </div>
      <p className="hint">조달은 끝났습니다. 주사위를 굴리면 임원 3명이 눈의 색대로 투표하고, 표가 많은 결정이 적용됩니다.</p>
      <div className="two-col">
        <BoardCardView cardId={meeting.card} highlight={color} />
        <div className="stack">
          <div className="cards">
            {execIds.map((id, i) => (
              <ExecutiveCardView key={`${id}-${i}`} cardId={id} compact />
            ))}
          </div>
          {meeting.decided ? (
            <p className="muted">결정 완료. 다른 참가자를 기다리는 중</p>
          ) : meeting.roll === null ? (
            <p className="hint"><Icon name="die" size={14} /> 오른쪽 위 주사위를 굴리세요.</p>
          ) : (
            <div className="stack">
              <div className="roll-result">
                <span className="big-die">{meeting.roll}</span>
                <span className="votes">
                  {(['yellow', 'blue', 'red'] as const).map((c) => (
                    <span key={c} className={`vote ${c}${color === c ? ' win' : ''}`}><span className={`die ${c}`} />{t![c]}표</span>
                  ))}
                </span>
                <span className="decision-name">{color && COLOR_LABEL[color]} 결정</span>
              </div>
              <div className="row">
                <button className="primary" onClick={() => act({ type: 'acceptBoardRoll' })}>이 결정 적용</button>
                <span className="muted small">마음에 안 들면 주사위 영역에서 팬덤 1개로 다시 굴릴 수 있습니다</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
