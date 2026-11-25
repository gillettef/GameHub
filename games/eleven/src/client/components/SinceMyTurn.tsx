import { useState } from 'react';
import type { LogEntry } from '../../engine/state';
import type { GameView } from '../../engine/view';
import { useView } from '../store';
import { useUi } from '../ui';
import { LogLine } from './Shell';

// 내 차례가 시작될 때 '지난 내 차례 이후' 다른 참가자들이 한 일을 접을 수 있는 칸으로 보여 준다.
// 따라가기·효과 토스트를 없앤 뒤(사용자 결정 2026-09) 남의 행동은 기록 탭에서만 볼 수 있었다 — 기록을 다 읽지 않아도 되게 요점만.
// 내 차례가 아닐 때는 보이지 않는다(그때는 기록 탭으로 간다)

const SHOW_MAX = 8;

// 내 마지막 기록 뒤에 남은 다른 참가자·진행 기록. 내 기록이 아직 없으면 이번 주 것만
export function entriesSinceMyTurn(view: Pick<GameView, 'log' | 'me' | 'week'>): LogEntry[] {
  let start = -1;
  for (let i = view.log.length - 1; i >= 0; i--) {
    if (view.log[i]!.actor === view.me) {
      start = i;
      break;
    }
  }
  const rest = start >= 0 ? view.log.slice(start + 1) : view.log.filter((e) => e.week === view.week);
  return rest.filter((e) => e.actor !== view.me && e.day !== 'setup');
}

export function SinceMyTurn() {
  const { view, session } = useView();
  const { setMobileTab } = useUi();
  const phase = view.phase;
  // 이사회·주중에만. 금요일에는 모든 경기가 한꺼번에 판정되어 기록에 남으므로, 여기 보이면 아직 안 본 남의 경기 점수가 먼저 드러난다
  // ('경기 보기 전에는 점수를 먼저 보여 주지 않는다', 사용자 요청 2026-09-22)
  const myTurn = !!session && (phase.kind === 'monday.board' || phase.kind === 'weekday') && phase.current === session.playerId;
  const entries = myTurn ? entriesSinceMyTurn(view) : [];
  // 접은 상태는 차례마다 새로 연다 (다음 차례에는 새 소식이 있으므로)
  const turnKey = `${view.week}:${phase.kind}:${phase.kind === 'weekday' ? phase.day : ''}`;
  const [closed, setClosed] = useState<string | null>(null);
  if (!myTurn || entries.length === 0) return null;
  const shown = entries.slice(-SHOW_MAX);
  const more = entries.length - shown.length;
  return (
    <details className="panel since-turn" open={closed !== turnKey} onToggle={(e) => setClosed(e.currentTarget.open ? null : turnKey)}>
      <summary>
        지난 내 차례 이후 <span className="muted small">{entries.length}건</span>
      </summary>
      <div className="since-list">
        {more > 0 && (
          <button className="link small" onClick={() => setMobileTab('log')}>
            앞의 {more}건은 기록 탭에서 보기
          </button>
        )}
        {shown.map((e) => <LogLine key={e.id} entry={e} />)}
      </div>
    </details>
  );
}
