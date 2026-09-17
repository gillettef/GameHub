import { useState } from 'react';
import { cards } from '@server/engine/cards';
import { INFRASTRUCTURE_COST } from '@server/engine/types';
import type { InfrastructureType, SponsorContract } from '@server/engine/types';
import { billboardLimit } from '@server/engine/weekday';
import { MarketPanel } from '../components/Shell';
import { PlayerCardView, SponsorCardView } from '../components/Cards';
import { CONTRACT_LABEL, DAY_LABEL, INFRA_LABEL, describeCost } from '../labels';
import { useGame } from '../store';

type Row = 'players' | 'staff' | 'sponsors';

export function WeekdayScreen() {
  const { view, me, act } = useGame();
  const [sponsorPick, setSponsorPick] = useState<number | null>(null);
  const [releasing, setReleasing] = useState(false);
  if (view.phase.kind !== 'weekday') return null;
  const { day, current, basicDone, paidDone } = view.phase;
  const myTurn = current === view.me;

  const buy = (row: Row, index: number) => {
    if (!myTurn || basicDone) return;
    if (row === 'players') act({ type: 'recruitPlayer', marketIndex: index });
    else if (row === 'staff') act({ type: 'hireStaff', marketIndex: index });
    else setSponsorPick(index);
  };

  const sign = (contract: SponsorContract, billboardChoice?: 'effect' | 'bonus') => {
    if (sponsorPick === null) return;
    act({ type: 'signSponsor', marketIndex: sponsorPick, contract, billboardChoice });
    setSponsorPick(null);
  };

  const officeStep = cards.boardData.office[me.office];
  const infraTypes = cards.boardData.infrastructure;

  return (
    <>
      <section className="panel">
        <h2>{DAY_LABEL[day]} · {myTurn ? '내 차례' : `${view.players[current]!.name}의 차례`}</h2>
        {myTurn ? (
          <>
            <p className="muted small">
              기본 행동 {basicDone ? '완료' : '1회 가능'} · 추가 유급 행동(운영 2개) {paidDone ? '완료' : '가능'}. 이적 시장 카드를 클릭해 영입/고용/계약합니다.
            </p>
            <div className="row wrap">
              <button disabled={basicDone} onClick={() => act({ type: 'recruitProspect' })}>유망주 영입 (💰2)</button>
              <button disabled={basicDone} onClick={() => setReleasing((v) => !v)}>선수 방출…</button>
              <button disabled={basicDone || !officeStep || officeStep.cost === 0} onClick={() => act({ type: 'buildOffice' })}>
                사무실 건설 {officeStep && officeStep.cost > 0 ? `(💰${officeStep.cost})` : '(완료)'}
              </button>
              <button disabled={basicDone} onClick={() => act({ type: 'pass' })}>패스</button>
              <button disabled={!basicDone} onClick={() => act({ type: 'endTurn' })}>차례 종료 →</button>
            </div>
            <div className="row wrap small">
              <span>기반 시설 (💰{INFRASTRUCTURE_COST}, {me.infrastructure.length}/7):</span>
              {infraTypes.map((i) => (
                <button
                  key={i.type}
                  className="small"
                  disabled={basicDone || (i.unique && me.infrastructure.includes(i.type))}
                  onClick={() => act({ type: 'buildInfrastructure', infrastructure: i.type as InfrastructureType })}
                >
                  {INFRA_LABEL[i.type]} (⭐{i.vp})
                </button>
              ))}
            </div>
            <div className="row wrap small">
              <span>카드 행동:</span>
              {me.staff.map((s, index) => {
                const card = cards.staff(s.cardId);
                if (!card.action) return null;
                const blocked = s.exhausted || s.suspension > 0;
                return (
                  <span key={`s${index}`} className="row">
                    <button className="small" disabled={blocked || basicDone} onClick={() => act({ type: 'cardAction', source: { kind: 'staff', index } })}>
                      {card.name} ({describeCost(card.action.cost)})
                    </button>
                    <button className="small" disabled={blocked || paidDone || me.resources.ops < 2} onClick={() => act({ type: 'cardAction', source: { kind: 'staff', index }, paid: true })}>
                      유급
                    </button>
                  </span>
                );
              })}
              {me.executives.map((e, index) => {
                const card = cards.executive(e.cardId);
                if (!card.action) return null;
                return (
                  <span key={`e${index}`} className="row">
                    <button className="small" disabled={e.exhausted || basicDone} onClick={() => act({ type: 'cardAction', source: { kind: 'executive', index } })}>
                      {card.name} ({describeCost(card.action.cost)})
                    </button>
                    <button className="small" disabled={e.exhausted || paidDone || me.resources.ops < 2} onClick={() => act({ type: 'cardAction', source: { kind: 'executive', index }, paid: true })}>
                      유급
                    </button>
                  </span>
                );
              })}
            </div>
            {releasing && (
              <div>
                <h4>방출할 선수 선택 <span className="muted small">(2💰 + 현재 역량, 부상/출장정지면 절반)</span></h4>
                <div className="cards">
                  {me.roster.map((r) => (
                    <PlayerCardView key={r.instanceId} cardId={r.cardId} instance={r} onClick={() => { act({ type: 'releasePlayer', instanceId: r.instanceId }); setReleasing(false); }} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="muted">다른 참가자의 차례입니다. 순서: {view.seats.map((id) => view.players[id]!.name).join(' → ')}</p>
        )}
      </section>
      <MarketPanel onBuy={myTurn && !basicDone ? buy : undefined} />
      {sponsorPick !== null && view.market.sponsors[sponsorPick] && (
        <div className="modal-backdrop" onClick={() => setSponsorPick(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>계약 유형 선택</h3>
            <SponsorCardView cardId={view.market.sponsors[sponsorPick]!} />
            <div className="row wrap">
              <button onClick={() => sign('kit')}>{CONTRACT_LABEL.kit} (즉시 효과 후 버림)</button>
              <button disabled={me.sponsors.billboards.length >= billboardLimit(me)} onClick={() => sign('billboard', 'effect')}>{CONTRACT_LABEL.billboard} · 카드 효과</button>
              <button disabled={me.sponsors.billboards.length >= billboardLimit(me)} onClick={() => sign('billboard', 'bonus')}>{CONTRACT_LABEL.billboard} · 추가 보너스</button>
              <button disabled={!!me.sponsors.naming} onClick={() => sign('naming')}>{CONTRACT_LABEL.naming} (효과 + 보너스)</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
