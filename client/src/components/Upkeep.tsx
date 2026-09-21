import { WEEKS, upkeepDue, upkeepSuspensionPer } from '@server/engine/weekend';
import type { GameView, PlayerPublicView } from '@server/engine/view';
import { Icon } from './Icons';

const LAST_WEEK = WEEKS; // 6주차 주말은 유지비 없이 게임 종료 (p.25)

// 이번 주말에 낼 유지비와 지금 돈으로 모자라는 액수. 미납 1돈마다 직원 카드 1장에 출장정지 per 개 (p.25 3)
export function upkeepStatus(view: GameView, p: PlayerPublicView): { due: number; short: number; suspensions: number } | null {
  if (view.week >= LAST_WEEK || view.phase.kind === 'gameOver' || view.phase.kind.startsWith('setup')) return null;
  const due = upkeepDue(p);
  const short = Math.max(0, due - p.resources.money);
  return { due, short, suspensions: p.staff.length > 0 ? short * upkeepSuspensionPer(p) : 0 };
}

function warningText(status: { due: number; short: number; suspensions: number }, money: number): string {
  return `주말 유지비 ${status.due}돈 — 지금 ${money}돈이라 ${status.short}돈 부족${status.suspensions > 0 ? ` → 직원 카드에 출장정지 ${status.suspensions}개` : ''}`;
}

// 참가자 띠의 유지비 칩: 주말에 낼 돈. 지금 돈으로 모자라면 빨갛게
export function UpkeepChip({ view, p }: { view: GameView; p: PlayerPublicView }) {
  const status = upkeepStatus(view, p);
  if (!status) return null;
  const title = status.short > 0
    ? `${warningText(status, p.resources.money)} (경기 관중 수입은 아직 더하지 않은 값)`
    : `주말에 내는 유지비 ${status.due}돈 (선수·직원·기반 시설 수에 따라). 못 내면 1돈마다 직원 카드에 출장정지 2개`;
  return (
    <span className={`res sub upkeep${status.short > 0 ? ' short' : ''}`} title={title}>
      <Icon name="money" size={14} />유지비 −{status.due}{status.short > 0 && <b> ⚠</b>}
    </span>
  );
}

// 주중 행동 목록 위의 경고: 아직 돈을 마련할 수 있는 동안(화·수·목) 알려 준다
export function UpkeepWarning({ view, p }: { view: GameView; p: PlayerPublicView }) {
  const status = upkeepStatus(view, p);
  if (!status || status.short === 0) return null;
  return <p className="error small upkeep-warning">⚠ {warningText(status, p.resources.money)}. 경기 관중 수입(관중석 팬덤)으로 메울 수 있는지 확인하세요.</p>;
}
