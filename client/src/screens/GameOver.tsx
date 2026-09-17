import { useGame } from '../store';

const ROWS = [
  ['league', '리그 순위'],
  ['tokens', '승점 토큰'],
  ['staffSets', '직원 세트'],
  ['infrastructure', '기반 시설'],
  ['office', '사무실'],
  ['suspensions', '출장정지'],
] as const;

export function GameOverScreen() {
  const { view, leave } = useGame();
  if (view.phase.kind !== 'gameOver') return null;
  const { scores, winners } = view.phase;
  const order = [...view.seats].sort((a, b) => scores[b]!.total - scores[a]!.total);
  return (
    <section className="panel">
      <h2>게임 종료</h2>
      <p className="winner">🏆 {winners.map((id) => view.players[id]!.name).join(', ')} 승리!</p>
      <table className="scores">
        <thead>
          <tr>
            <th>항목</th>
            {order.map((id) => (
              <th key={id} className={winners.includes(id) ? 'winner-col' : ''}>{view.players[id]!.name}</th>
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
              {order.map((id) => <td key={id}>{scores[id]![key]}</td>)}
            </tr>
          ))}
          <tr className="total">
            <td>합계</td>
            {order.map((id) => <td key={id}>{scores[id]!.total}</td>)}
          </tr>
        </tbody>
      </table>
      <button onClick={leave}>로비로</button>
    </section>
  );
}
