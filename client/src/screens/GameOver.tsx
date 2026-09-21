import { useState } from 'react';
import { cards } from '@server/engine/cards';
import { ObjectiveCardView } from '../components/Cards';
import { ScoreReviewModal } from '../components/ScoreReview';
import { PlayerCrest } from '../components/Crest';
import { seatColor } from '../components/Shell';
import { useView } from '../store';

const LEVEL_LABEL = ['미달성', '목표 달성', '완벽 달성'] as const;

const ROWS = [
  ['league', '리그 순위'],
  ['tokens', '승점 토큰'],
  ['staffSets', '직원 세트'],
  ['infrastructure', '기반 시설'],
  ['office', '사무실'],
  ['objective', '목표 카드'],
  ['suspensions', '출장정지'],
] as const;

export function GameOverScreen() {
  const { view, leave } = useView();
  const [review, setReview] = useState(true); // 시즌이 끝나면 항목별 승점 확인 모달을 먼저 띄운다 (닫은 뒤에는 버튼으로 다시)
  if (view.phase.kind !== 'gameOver') return null;
  const { scores, winners } = view.phase;
  const order = [...view.seats].sort((a, b) => scores[b]!.total - scores[a]!.total);
  return (
    <section className="panel phase-panel mine">
      <div className="panel-head"><h2>시즌 종료</h2></div>
      <p className="winner">{winners.map((id) => view.players[id]!.name).join(', ')} 우승</p>
      <table className="scores">
        <thead>
          <tr>
            <th />
            {order.map((id) => (
              <th key={id} className={winners.includes(id) ? 'winner-col' : ''} style={{ '--seat': seatColor(view, id) } as React.CSSProperties}>
                <PlayerCrest id={id} name={view.players[id]!.name} color={seatColor(view, id)} size={20} />{view.players[id]!.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>리그 등수</td>
            {order.map((id) => <td key={id}>{scores[id]!.leagueRank}위</td>)}
          </tr>
          {ROWS.map(([key, label]) => (
            <tr key={key}>
              <td>{label}</td>
              {order.map((id) => (
                <td key={id} title={key === 'objective' && scores[id]!.objectiveCard ? `${cards.objective(scores[id]!.objectiveCard!).name} — ${LEVEL_LABEL[scores[id]!.objectiveLevel]}` : undefined}>
                  {scores[id]![key]}
                </td>
              ))}
            </tr>
          ))}
          <tr className="total">
            <td>합계</td>
            {order.map((id) => <td key={id}>{scores[id]!.total}</td>)}
          </tr>
        </tbody>
      </table>
      {/* p.27: 마지막 경기 뒤 목표 카드를 공개한다 */}
      <div className="step">
        <h3>목표 카드 공개</h3>
        <div className="cards">
          {order.filter((id) => scores[id]!.objectiveCard).map((id) => (
            <div key={id} className="stack" style={{ '--seat': seatColor(view, id) } as React.CSSProperties}>
              <span className="small"><span className="seat-dot" />{view.players[id]!.name} · <b>{LEVEL_LABEL[scores[id]!.objectiveLevel]}</b> (+{scores[id]!.objective})</span>
              <ObjectiveCardView cardId={scores[id]!.objectiveCard!} level={scores[id]!.objectiveLevel} compact />
            </div>
          ))}
        </div>
      </div>
      <div className="row">
        <button onClick={() => setReview(true)}>항목별 승점 확인</button>
        <button className="primary" onClick={leave}>로비로</button>
      </div>
      {review && <ScoreReviewModal view={view} onClose={() => setReview(false)} />}
    </section>
  );
}
