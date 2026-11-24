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
  if (!status) {
    if (view.week < LAST_WEEK || view.phase.kind === 'gameOver') return null;
    return <span className="res sub upkeep-chip" title="마지막 주 주말에는 유지비를 내지 않고 게임이 끝납니다 (p.25)"><Icon name="money" size={14} />유지비 없음</span>;
  }
  const title = status.short > 0
    ? `${warningText(status, p.resources.money)} (경기 관중 수입은 아직 더하지 않은 값)`
    : `주말에 내는 유지비 ${status.due}돈 (선수·직원·기반 시설 수에 따라). 못 내면 1돈마다 직원 카드에 출장정지 2개`;
  return (
    <span className={`res sub upkeep-chip${status.short > 0 ? ' short' : ''}`} title={title}>
      <Icon name="money" size={14} />유지비 −{status.due}{status.short > 0 && <b> ⚠</b>}
    </span>
  );
}

// 영입·고용·건설·방출 뒤의 주말 유지비 (확정 막대 미리 보기): 선수·직원·시설 수가 구간을 넘으면 유지비가 바뀐다.
// 바뀌지 않거나 이번 주말에 유지비가 없으면(마지막 주) null
export interface UpkeepChange {
  players?: number; // +1 영입 / −1 방출
  staffCardId?: string; // 고용할 직원 (특성의 유지비 할인까지 반영)
  infra?: number; // +1 건설
}
export function upkeepShift(view: GameView, p: PlayerPublicView, change: UpkeepChange): { before: number; after: number } | null {
  if (!upkeepStatus(view, p)) return null;
  const before = upkeepDue(p);
  const roster = change.players && change.players < 0 ? p.roster.slice(0, change.players) : [...p.roster, ...Array.from({ length: change.players ?? 0 }, () => p.roster[0]!)];
  const staff = change.staffCardId ? [...p.staff, { cardId: change.staffCardId, exhausted: false, suspension: 0 }] : p.staff;
  const infrastructure = [...p.infrastructure, ...Array.from({ length: change.infra ?? 0 }, () => p.infrastructure[0]!)];
  const after = upkeepDue({ ...p, roster, staff, infrastructure });
  return after === before ? null : { before, after };
}

// 확정 막대 문구 끝에 붙이는 유지비 변화 꼬리표
export function UpkeepShift({ view, p, change }: { view: GameView; p: PlayerPublicView; change: UpkeepChange }) {
  const s = upkeepShift(view, p, change);
  if (!s) return null;
  return (
    <span className={`upkeep-shift${s.after > s.before ? ' up' : ' down'}`} title="선수·직원·기반 시설 수가 구간을 넘어 주말 유지비가 바뀝니다">
      · 주말 유지비 <Icon name="money" size={12} />{s.before} → {s.after}
    </span>
  );
}

// 주중 행동 목록 위의 경고: 아직 돈을 마련할 수 있는 동안(화·수·목) 알려 준다
export function UpkeepWarning({ view, p }: { view: GameView; p: PlayerPublicView }) {
  const status = upkeepStatus(view, p);
  if (!status || status.short === 0) return null;
  return <p className="error small upkeep-warning">⚠ {warningText(status, p.resources.money)}. 경기 관중 수입(관중석 팬덤)으로 메울 수 있는지 확인하세요.</p>;
}
