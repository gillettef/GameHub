import { HUMAN } from '../game/engine';
import type { GameState } from '../game/types';
import { Icon } from './Icon';
import { TYPE_META } from './meta';
import { Sheet } from './parts';

export function ReportSheet({ game, onNext }: { game: GameState; onNext: () => void }) {
  const me = game.players[HUMAN];
  const r = me.report;
  if (!r) return null;
  const net = r.feeIncome + r.income - r.upkeep;
  const others = game.players.filter((p) => p.id !== HUMAN);
  return (
    <Sheet title={`${game.round}라운드 운영 결과`} tall>
      <div className="rep-stats">
        <div className="rs">
          <Icon name="ticket" size={18} />
          <b>
            {r.entered}
            <small>/{r.drawn}</small>
          </b>
          <span>입장 관객</span>
        </div>
        <div className="rs">
          <Icon name="coin" size={18} />
          <b className={net >= 0 ? 'pos' : 'neg'}>
            {net >= 0 ? '+' : ''}
            {net}
          </b>
          <span>순수익</span>
        </div>
        <div className="rs">
          <Icon name="star" size={18} />
          <b className="pos">+{r.vpGain}</b>
          <span>획득 VP</span>
        </div>
      </div>

      <div className="rep-ledger">
        <div>
          <span>
            입장료 ({r.entered}명 × ${r.fee})
          </span>
          <b className="pos">+${r.feeIncome}</b>
        </div>
        <div>
          <span>시설 수익</span>
          <b className="pos">+${r.income}</b>
        </div>
        <div>
          <span>유지비</span>
          <b className="neg">-${r.upkeep}</b>
        </div>
        <div>
          <span>
            만족도 +{r.sat}점 <small>(누적 {me.satPool}/4 → 4점마다 VP 1)</small>
          </span>
          <b className="pos">VP +{r.vpGain}</b>
        </div>
      </div>

      {r.visits.length > 0 && (
        <>
          <h4 className="rep-h">관객 동선</h4>
          <ul className="visits">
            {r.visits.map((v, i) => (
              <li key={i} style={{ animationDelay: `${Math.min(i, 14) * 55}ms` }}>
                <Icon name={v.visitor.kind === 'child' ? 'child' : 'adult'} size={16} />
                <Icon name={TYPE_META[v.facilityType].icon} size={16} />
                <span className="vn">
                  {v.facility}
                  {v.facilityType === v.visitor.fav && <em>취향 저격</em>}
                </span>
                <span className="vc">
                  <Icon name="coin" size={12} />
                  {v.income}
                </span>
                <span className="vs">
                  <Icon name="star" size={12} />
                  {v.sat}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {r.unserved > 0 && (
        <div className="callout warn">
          <Icon name="info" size={20} />
          <div>
            <b>돌아간 관객 {r.unserved}명</b>
            <span>탈 수 있는 시설이 없었어요. 시설을 늘리거나 안내 직원을 고용해 보세요.</span>
          </div>
        </div>
      )}
      {r.broken.length > 0 && (
        <div className="callout bad">
          <Icon name="crack" size={20} />
          <div>
            <b>고장 발생</b>
            <span>{r.broken.join(', ')} — 관리 단계에서 수리하세요.</span>
          </div>
        </div>
      )}
      {r.trashAdded > 0 && (
        <div className="callout warn">
          <Icon name="trash" size={20} />
          <div>
            <b>쓰레기 +{r.trashAdded}</b>
            <span>관리 단계에서 치우지 않으면 2개마다 VP가 깎여요.</span>
          </div>
        </div>
      )}
      {r.debtVp > 0 && (
        <div className="callout bad">
          <Icon name="coin" size={20} />
          <div>
            <b>적자! VP -{r.debtVp}</b>
            <span>돈이 모자라 평판이 떨어졌어요.</span>
          </div>
        </div>
      )}

      {others.length > 0 && (
        <>
          <h4 className="rep-h">상대 공원</h4>
          <ul className="others">
            {others.map((p) => (
              <li key={p.id}>
                <span>{p.name}</span>
                <span>관객 {p.report?.entered ?? 0}명</span>
                <span className="pos">VP +{p.report?.vpGain ?? 0}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="sticky-cta">
        <button className="btn primary wide" onClick={onNext}>
          관리 단계로 <Icon name="arrow" size={18} />
        </button>
      </div>
    </Sheet>
  );
}
