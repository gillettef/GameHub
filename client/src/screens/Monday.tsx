import { boardDecision, tallyVotes } from '@server/engine/monday';
import type { PlayerId } from '@server/engine/state';
import { BoardCardView, ExecutiveCardView } from '../components/Cards';
import { Icon } from '../components/Icons';
import { TurnBanner } from '../components/Turn';
import { COLOR_LABEL } from '../labels';
import { useGame } from '../store';

// 이사회는 선 참가자부터 한 명씩 진행한다. 차례인 참가자의 이사회 카드·임원·주사위 결과를 모두가 본다.
// "이 결정 적용" 버튼 자체가 확정이다(대안은 팬덤 재굴림). 적용 결과는 효과 토스트가 보여준다
export function MondayScreen() {
  const { view, act } = useGame();
  if (view.phase.kind !== 'monday.board') return null;
  const { current, meetings } = view.phase;
  const actor: PlayerId = current;
  const meeting = meetings[actor]!;
  const player = view.players[actor]!;
  const mine = actor === view.me;
  const execIds = player.executives.map((e) => e.cardId);
  // 집계와 결정 색은 엔진과 같은 함수를 쓴다 (모든 눈이 동수인 조합이면 첫 임원의 표)
  const t = meeting.roll ? tallyVotes(player, meeting.roll) : null;
  const color = meeting.roll ? boardDecision(player, meeting.roll) : null;
  const done = Object.fromEntries(view.seats.map((id) => [id, meetings[id]!.decided]));

  return (
    <section className={`panel phase-panel${mine ? ' mine' : ''}`}>
      <div className="panel-head">
        <h2>이사회</h2>
        <TurnBanner current={current} done={done} />
      </div>
      <p className="hint">
        {mine
          ? '조달은 끝났습니다. 주사위를 굴리면 임원 3명이 눈의 색대로 투표하고, 표가 많은 결정이 적용됩니다.'
          : `${player.name}의 이사회입니다. 주사위 결과와 임원들의 투표를 함께 지켜보세요.`}
      </p>
      <div className="two-col">
        <BoardCardView cardId={meeting.card} highlight={color} />
        <div className="stack">
          {meeting.roll === null ? (
            <p className="hint">
              <Icon name="die" size={14} /> {mine ? '오른쪽 위 주사위를 굴리세요.' : `${player.name}이(가) 주사위를 굴리기를 기다리는 중`}
            </p>
          ) : (
            <div className="stack">
              <div className="roll-result">
                <span className="big-die">{meeting.roll}</span>
                <span className="votes">
                  {(['yellow', 'blue', 'red'] as const).map((c) => (
                    <span key={c} className={`vote ${c}${color === c ? ' win' : ''}`}>
                      <span className={`die ${c}`} />
                      {t![c]}표
                    </span>
                  ))}
                </span>
                <span className="decision-name">{color && COLOR_LABEL[color]} 결정</span>
              </div>
              {mine ? (
                <div className="row">
                  <button className="primary" onClick={() => act({ type: 'acceptBoardRoll' })}>이 결정 적용</button>
                  <span className="muted small">마음에 안 들면 주사위 영역에서 팬덤 1개로 다시 굴릴 수 있습니다</span>
                </div>
              ) : (
                <p className="muted small">{player.name}이(가) 결정을 적용하거나 팬덤으로 다시 굴릴 수 있습니다.</p>
              )}
            </div>
          )}
          <div className="cards" aria-label="임원">
            {execIds.map((id, i) => (
              <ExecutiveCardView key={`${id}-${i}`} cardId={id} compact />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
