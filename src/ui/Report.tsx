import { useState } from 'react';
import { CFG, HUMAN, willEnter } from '../game/engine';
import type { GameState, Player } from '../game/types';
import { Icon } from './Icon';
import { TYPE_META } from './meta';
import { Sheet, VisitorChip } from './parts';

/** 한 플레이어의 운영 결과 (내 것·상대 것 모두 공개) */
function PlayerReport({ game, p, mine }: { game: GameState; p: Player; mine: boolean }) {
  const r = p.report;
  if (!r) return null;
  const net = r.feeIncome + r.income - r.upkeep;
  const turnedBack = p.visitors.filter((v) => !willEnter(v, r.fee));
  return (
    <>
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
            만족도 +{r.sat}점 <small>(누적 {p.satPool}/{CFG.satPerVp} · {CFG.satPerVp}점마다 VP 1)</small>
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

      {turnedBack.length > 0 && (
        <div className="callout warn">
          <Icon name="ticket" size={20} />
          <div>
            <b>입구에서 돌아간 관객 {turnedBack.length}명</b>
            <span>입장료 ${r.fee}가 지불 한도보다 높았어요.</span>
            <div className="entrance-row">
              {turnedBack.map((v) => (
                <VisitorChip key={v.id} v={v} enters={false} />
              ))}
            </div>
          </div>
        </div>
      )}
      {r.unserved > 0 && (
        <div className="callout warn">
          <Icon name="info" size={20} />
          <div>
            <b>이용 못 하고 나간 관객 {r.unserved}명 · 만족도 -{r.unservedSat}</b>
            <span>{mine ? '빈 시설이 없었어요. 시설을 늘리거나 안내 직원을 고용하고, 수용 인원만큼만 데려오세요.' : '시설이 부족했어요.'}</span>
          </div>
        </div>
      )}
      {r.broken.length > 0 && (
        <div className="callout bad">
          <Icon name="crack" size={20} />
          <div>
            <b>고장 발생</b>
            <span>
              {r.broken.join(', ')}
              {mine ? ' — 관리 단계에서 수리하세요.' : ''}
            </span>
          </div>
        </div>
      )}
      {(r.bonusSat > 0 || r.bonusIncome > 0) && (
        <div className="callout">
          <Icon name="sparkle" size={20} />
          <div>
            <b>
              보너스{r.bonusSat > 0 ? ` 만족도 +${r.bonusSat}` : ''}
              {r.bonusIncome > 0 ? ` 수익 +$${r.bonusIncome}` : ''}
            </b>
            <span>연구원과 시설 특수효과(패시브)로 얻었어요.</span>
          </div>
        </div>
      )}
      {r.trashAdded > 0 && (
        <div className="callout warn">
          <Icon name="trash" size={20} />
          <div>
            <b>쓰레기 +{r.trashAdded}</b>
            <span>{game.event?.trashDelta ? `이벤트 쓰레기 ${game.event.trashDelta}개 포함. ` : ''}치우지 않으면 라운드가 끝날 때마다 {CFG.trashPerVp}개당 VP -1이에요.</span>
          </div>
        </div>
      )}
      {r.debtVp > 0 && (
        <div className="callout bad">
          <Icon name="coin" size={20} />
          <div>
            <b>적자! VP -{r.debtVp}</b>
            <span>돈이 모자라 평판이 떨어졌어요. (적자 ${CFG.debtPerVp}마다 VP -1, 돈은 $0으로)</span>
          </div>
        </div>
      )}
    </>
  );
}

export function ReportSheet({ game, onNext }: { game: GameState; onNext: () => void }) {
  const [who, setWho] = useState(HUMAN);
  const p = game.players[who];
  return (
    <Sheet title={`${game.round}라운드 운영 결과`} tall>
      {game.players.length > 1 && (
        <div className="rep-tabs" role="tablist">
          {game.players.map((x) => (
            <button key={x.id} role="tab" aria-selected={who === x.id} className={who === x.id ? 'on' : ''} onClick={() => setWho(x.id)}>
              {x.id === HUMAN ? '내 공원' : x.name}
              <small>
                +{x.report?.vpGain ?? 0} VP
              </small>
            </button>
          ))}
        </div>
      )}
      <PlayerReport key={who} game={game} p={p} mine={who === HUMAN} />
      <div className="sticky-cta">
        <button className="btn primary wide" onClick={onNext}>
          관리 단계로 <Icon name="arrow" size={18} />
        </button>
      </div>
    </Sheet>
  );
}
