import { cards } from '@server/engine/cards';
import type { DieColor } from '@server/engine/types';
import { BoardCardView, ExecutiveCardView } from '../components/Cards';
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
  const execIds = me.executives.map((e) => e.cardId);
  const t = meeting.roll ? tally(execIds, meeting.roll) : null;
  const color = t ? winner(t) : null;
  return (
    <section className="panel">
      <h2>월요일 · 이사회</h2>
      <p className="muted small">조달은 자동으로 끝났습니다. 주사위를 굴려 임원 3명의 투표로 결정을 정합니다. 팬덤 1개로 다시 굴릴 수 있습니다.</p>
      <div className="row small">
        {view.seats.map((id) => (
          <span key={id} className={view.phase.kind === 'monday.board' && view.phase.meetings[id]!.decided ? 'badge' : 'muted'}>
            {view.players[id]!.name}: {view.phase.kind === 'monday.board' && view.phase.meetings[id]!.decided ? '완료' : '진행 중'}
          </span>
        ))}
      </div>
      <div className="two-col">
        <BoardCardView cardId={meeting.card} highlight={color} />
        <div>
          <div className="cards compact">
            {execIds.map((id, i) => (
              <ExecutiveCardView key={`${id}-${i}`} cardId={id} />
            ))}
          </div>
          {meeting.decided ? (
            <p className="muted">결정 완료. 다른 참가자를 기다리는 중…</p>
          ) : meeting.roll === null ? (
            <button onClick={() => act({ type: 'rollBoardDie' })}>🎲 주사위 굴리기</button>
          ) : (
            <div>
              <p>
                주사위 <b>{meeting.roll}</b> → 투표 {(['yellow', 'blue', 'red'] as const).map((c) => `${COLOR_LABEL[c]} ${t![c]}`).join(' / ')} → <b>{color && COLOR_LABEL[color]} 결정</b>
              </p>
              <div className="row">
                <button onClick={() => act({ type: 'acceptBoardRoll' })}>이대로 결정</button>
                <button disabled={me.resources.fandom < 1} onClick={() => act({ type: 'rerollBoardDie' })}>📣 팬덤 1개로 재굴림</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
