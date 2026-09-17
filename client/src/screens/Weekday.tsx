import { useState } from 'react';
import { cards } from '@server/engine/cards';
import { INFRASTRUCTURE_COST } from '@server/engine/types';
import type { InfrastructureType } from '@server/engine/types';
import { PlayerCardView } from '../components/Cards';
import { CostChips, Icon } from '../components/Icons';
import { DAY_LABEL, INFRA_LABEL } from '../labels';
import { useGame } from '../store';

export function WeekdayScreen() {
  const { view, me, act } = useGame();
  const [releasing, setReleasing] = useState(false);
  if (view.phase.kind !== 'weekday') return null;
  const { day, current, basicDone, paidDone } = view.phase;
  const myTurn = current === view.me;
  const officeStep = cards.boardData.office[me.office];

  if (!myTurn) {
    return (
      <section className="panel phase-panel">
        <div className="panel-head">
          <h2>{DAY_LABEL[day]}</h2>
          <span className="muted"><b>{view.players[current]!.name}</b>의 차례 · 순서 {view.seats.map((id) => view.players[id]!.name).join(' → ')}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="panel phase-panel mine">
      <div className="panel-head">
        <h2>{DAY_LABEL[day]} · 내 차례</h2>
        <span className="muted">
          기본 행동 {basicDone ? '완료' : '1회'} · 유급 행동(<Icon name="ops" size={12} />2) {paidDone ? '완료' : '가능'}
        </span>
      </div>
      <p className="hint">아래 이적 시장의 카드를 눌러 영입·고용·계약할 수 있습니다.</p>

      <div className="action-groups">
        <div className="action-group">
          <h3>선수</h3>
          <button disabled={basicDone} onClick={() => act({ type: 'recruitProspect' })}><Icon name="prospect" />유망주 영입 <CostChips cost={{ money: 2 }} /></button>
          <button disabled={basicDone} className={releasing ? 'active' : ''} onClick={() => setReleasing((v) => !v)}>선수 방출…</button>
        </div>
        <div className="action-group">
          <h3>스타디움 <span className="muted">{me.infrastructure.length}/7 · <CostChips cost={{ money: INFRASTRUCTURE_COST }} /></span></h3>
          {cards.boardData.infrastructure.map((i) => (
            <button
              key={i.type}
              disabled={basicDone || (i.unique && me.infrastructure.includes(i.type))}
              onClick={() => act({ type: 'buildInfrastructure', infrastructure: i.type as InfrastructureType })}
              title={i.bonus.length ? '보너스 있음' : undefined}
            >
              {INFRA_LABEL[i.type]} <span className="chip vp"><Icon name="vp" />{i.vp}</span>
            </button>
          ))}
          <button disabled={basicDone || !officeStep || officeStep.cost === 0} onClick={() => act({ type: 'buildOffice' })}>
            사무실 확장 {officeStep && officeStep.cost > 0 ? <CostChips cost={{ money: officeStep.cost }} /> : '(완료)'}
          </button>
        </div>
        <div className="action-group">
          <h3>카드 행동</h3>
          {me.staff.map((s, index) => {
            const card = cards.staff(s.cardId);
            if (!card.action) return null;
            const blocked = s.exhausted || s.suspension > 0;
            return (
              <span key={`s${index}`} className="split">
                <button disabled={blocked || basicDone} onClick={() => act({ type: 'cardAction', source: { kind: 'staff', index } })} title={card.action.text}>
                  {card.name} <CostChips cost={card.action.cost} />
                </button>
                <button className="paid" disabled={blocked || paidDone || me.resources.ops < 2} onClick={() => act({ type: 'cardAction', source: { kind: 'staff', index }, paid: true })} title="운영 2개로 추가 수행">
                  유급
                </button>
              </span>
            );
          })}
          {me.executives.map((e, index) => {
            const card = cards.executive(e.cardId);
            if (!card.action) return null;
            return (
              <span key={`e${index}`} className="split">
                <button disabled={e.exhausted || basicDone} onClick={() => act({ type: 'cardAction', source: { kind: 'executive', index } })} title={card.action.text}>
                  {card.name} <CostChips cost={card.action.cost} />
                </button>
                <button className="paid" disabled={e.exhausted || paidDone || me.resources.ops < 2} onClick={() => act({ type: 'cardAction', source: { kind: 'executive', index }, paid: true })} title="운영 2개로 추가 수행">
                  유급
                </button>
              </span>
            );
          })}
          {!me.staff.some((s) => cards.staff(s.cardId).action) && !me.executives.some((e) => cards.executive(e.cardId).action) && <span className="muted small">행동이 있는 카드가 없습니다</span>}
        </div>
        <div className="action-group turn">
          <button className="ghost" disabled={basicDone} onClick={() => act({ type: 'pass' })}>패스</button>
          <button className="primary" disabled={!basicDone} onClick={() => act({ type: 'endTurn' })}>차례 끝내기</button>
        </div>
      </div>

      {releasing && (
        <div className="subpanel">
          <h3>방출할 선수 <span className="muted">— 2 + 현재 역량만큼 돈, 부상·출장정지면 절반</span></h3>
          <div className="cards">
            {me.roster.map((r) => (
              <PlayerCardView key={r.instanceId} cardId={r.cardId} instance={r} onClick={() => { act({ type: 'releasePlayer', instanceId: r.instanceId }); setReleasing(false); }} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
