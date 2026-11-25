import { RESOURCES } from '../../engine/types';
import type { PlayerPublicView } from '../../engine/view';
import { RESOURCE_LABEL } from '../labels';
import { ResourceChip } from './Icons';

// 월요일 화면 맨 위: 지난 주말 정산(유지비·버린 자원·출장정지)과 이번 주 조달.
// 주말은 따로 화면 없이 지나가고 조달도 한꺼번에 일어나서, 돈이 왜 줄었는지·무엇을 받았는지 모르는 문제가 있었다
export function WeekReportCard({ p, week }: { p: PlayerPublicView; week: number }) {
  const r = p.weekReport;
  if (!r || r.week !== week) return null;
  const discarded = RESOURCES.filter((k) => (r.discarded?.[k] ?? 0) > 0);
  const procured = RESOURCES.filter((k) => r.procured[k] > 0);
  return (
    <section className="week-report" aria-label="주말 정산과 조달">
      {r.upkeep && (
        <div className="week-report-row">
          <span className="week-report-label">지난 주말</span>
          <span className="chips">
            유지비 <ResourceChip resource="money" amount={r.upkeep.paid} cost />
            {r.upkeep.paid < r.upkeep.due && <span className="error"> ({r.upkeep.due - r.upkeep.paid}돈 못 냄 → 출장정지 {r.upkeep.suspensions}개)</span>}
            {discarded.length > 0 && (
              <>
                {' · '}버린 자원 {discarded.map((k) => <ResourceChip key={k} resource={k} amount={r.discarded![k]!} cost />)}
              </>
            )}
          </span>
        </div>
      )}
      <div className="week-report-row">
        <span className="week-report-label">{week}주차 조달</span>
        <span className="chips" title={`자원 트랙 위치만큼 받습니다: ${RESOURCES.map((k) => `${RESOURCE_LABEL[k]} ${r.procured[k]}`).join(' · ')}`}>
          {procured.length > 0 ? procured.map((k) => <ResourceChip key={k} resource={k} amount={r.procured[k]} signedValue />) : '없음'}
        </span>
      </div>
    </section>
  );
}
