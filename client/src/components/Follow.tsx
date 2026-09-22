import { useCommit } from '../commit';
import { useView } from '../store';
import { useUi } from '../ui';
import { PlayerCrest } from './Crest';
import { seatColor } from './Shell';

// 관전 띠 (사용자 결정 2026-09-22 — 행동마다 보드가 바뀌는 자동 따라가기가 정신없어 이 형태로): 내 차례가 아닐 때 화면 아래에
// "○○ · 영입: 김○○" 한 줄이 떠서 다른 참가자(봇 포함)가 방금 한 행동을 알려 준다. 화면은 그대로 두고, "보러 가기"를 누르면 그때
// 그 참가자의 보드·탭으로 가서 만진 카드·시설을 비춘다(ui.visitTicker). 새 행동이 오면 내용이 바뀌고, 한동안 없으면 스스로 사라진다.
// 확정 막대와 같은 자리라 확정 대기(selection)가 있으면 숨긴다. 내 차례에는 ui.tsx 가 띠를 거둔다
export function FollowBar() {
  const { view } = useView();
  const { ticker, dismissTicker, visitTicker } = useUi();
  const { selection } = useCommit();
  if (!ticker || selection) return null;
  const actor = view.players[ticker.pid];
  if (!actor) return null;
  const color = seatColor(view, ticker.pid);
  return (
    <div key={ticker.seq} className="follow-bar" role="status" style={{ '--seat': color } as React.CSSProperties}>
      <span className="follow-actor">
        <PlayerCrest id={actor.id} name={actor.name} color={color} size={22} />
        <b>{actor.name}</b>
      </span>
      <span className="follow-text">{ticker.text}</span>
      <span className="confirm-actions">
        {ticker.focus && <button className="primary" onClick={visitTicker}>보러 가기</button>}
        <button className="ghost close" aria-label="닫기" title="닫기" onClick={dismissTicker}>✕</button>
      </span>
    </div>
  );
}
