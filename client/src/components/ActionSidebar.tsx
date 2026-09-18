import { cards } from '@server/engine/cards';
import type { PlayerId } from '@server/engine/state';
import { INFRASTRUCTURE_COST } from '@server/engine/types';
import type { InfrastructureType } from '@server/engine/types';
import type { PlayerPublicView } from '@server/engine/view';
import { useCommit } from '../commit';
import { DAY_LABEL, INFRA_LABEL, phaseLabel } from '../labels';
import { myTask } from '../notify';
import { useView } from '../store';
import { useUi } from '../ui';
import { DiceTray } from './DiceTray';
import { CostChips, Icon } from './Icons';
import { LegendButton } from './Legend';
import { seatColor } from './Shell';

// 왼쪽 사이드바: 지금 단계·차례·내 할 일, 주사위(이사회·경기 영향), 주중 행동 목록, 아이콘 설명.
// 주중 행동은 전부 여기에 나열하고 지금 할 수 있는 것만 활성화한다. 카드 고르기가 필요한 행동(영입·고용·계약·방출)은
// 메인의 해당 보드 탭으로 이동시키고, 나머지는 바로 선택 → 아래 확정 막대에서 확정한다.

function TurnStatus() {
  const { view, session } = useView();
  const phase = view.phase;
  const current = 'current' in phase ? phase.current : null;
  const mine = !!session && current === session.playerId;
  const task = session && view.me === session.playerId ? myTask(view) : null;
  const waiting = (done: Record<PlayerId, boolean>) => view.seats.filter((id) => !done[id]).map((id) => view.players[id]!.name);
  const pending = phase.kind === 'setup.draft' ? waiting(phase.picked) : phase.kind === 'setup.objective' ? waiting(phase.chosen) : null;
  return (
    <section className={`panel turn-status${task ? ' mine' : ''}`}>
      <div className="ts-phase">
        {phaseLabel(phase.kind)}
        {phase.kind === 'weekday' && ` · ${DAY_LABEL[phase.day]}`}
      </div>
      {current && (
        <div className="ts-current" style={{ '--seat': seatColor(view, current) } as React.CSSProperties}>
          <span className="seat-dot" />
          <b>{view.players[current]!.name}</b>의 차례{mine && ' · 나'}
        </div>
      )}
      {pending && <div className="ts-current muted">{pending.length ? `고르는 중: ${pending.join(', ')}` : '전원 완료'}</div>}
      {task && <div className="ts-task">{task}</div>}
    </section>
  );
}

function WeekdayActions({ me }: { me: PlayerPublicView }) {
  const { view } = useView();
  const { act } = useView();
  const { chosen, select } = useCommit();
  const { showBoard, showMarket, releasing, setReleasing } = useUi();
  if (view.phase.kind !== 'weekday') return null;
  const { current, basicDone, paidDone } = view.phase;
  const myTurn = current === me.id;
  const basic = myTurn && !basicDone;
  const cls = (key: string) => `action-item${chosen === key ? ' chosen' : ''}`;
  const officeStep = cards.boardData.office[me.office];
  const toggleRelease = () => {
    const next = !releasing;
    setReleasing(next);
    if (next) showBoard('match', me.id);
  };
  return (
    <section className="panel action-panel">
      <div className="panel-head">
        <h2>행동</h2>
        <span className="muted small">
          기본 {basicDone ? '완료' : '1회'} · 유급 {paidDone ? '완료' : '가능'}
        </span>
      </div>
      {!myTurn && <p className="muted small">내 차례가 아닙니다. 차례가 오면 활성화됩니다.</p>}

      <h3>이적 시장</h3>
      <div className="action-list">
        <button className="action-item" disabled={!basic} onClick={() => showMarket('players')} title="이적 시장 · 선수 탭에서 오른쪽 3장 중 한 장을 고릅니다">
          <span>선수 영입…</span>
        </button>
        <button className={cls('prospect')} disabled={!basic} onClick={() => select('prospect', { type: 'recruitProspect' }, <>유망주 영입 <CostChips cost={{ money: 2 }} /></>)}>
          <span><Icon name="prospect" size={14} />유망주 영입</span>
          <CostChips cost={{ money: 2 }} />
        </button>
        <button className="action-item" disabled={!basic} onClick={() => showMarket('staff')} title="이적 시장 · 직원 탭에서 오른쪽 3장 중 한 장을 고릅니다">
          <span>직원 고용…</span>
        </button>
        <button className="action-item" disabled={!basic} onClick={() => showMarket('sponsors')} title="이적 시장 · 스폰서 탭에서 카드를 누르면 계약 유형을 고릅니다">
          <span>스폰서 계약…</span>
        </button>
      </div>

      <h3>선수</h3>
      <div className="action-list">
        <button className={`action-item${releasing ? ' active' : ''}`} disabled={!basic} onClick={toggleRelease} title="경기 보드의 선수 카드를 눌러 방출할 선수를 고릅니다. 2 + 현재 역량만큼 돈, 부상·출장정지면 절반">
          <span>선수 방출…</span>
          {releasing && <span className="tag">선택 중</span>}
        </button>
      </div>

      <h3>
        스타디움 <span className="muted">{me.infrastructure.length}/7</span>
      </h3>
      <div className="action-list">
        {cards.boardData.infrastructure.map((i) => (
          <button
            key={i.type}
            className={cls(`infra:${i.type}`)}
            disabled={!basic || (i.unique && me.infrastructure.includes(i.type)) || me.infrastructure.length >= 7 || me.resources.money < INFRASTRUCTURE_COST}
            onClick={() => select(`infra:${i.type}`, { type: 'buildInfrastructure', infrastructure: i.type as InfrastructureType }, <>건설: <b>{INFRA_LABEL[i.type]}</b> <CostChips cost={{ money: INFRASTRUCTURE_COST }} /> → 승점 {i.vp}</>)}
            title={`${INFRA_LABEL[i.type]} · 돈 ${INFRASTRUCTURE_COST} · 승점 ${i.vp}${i.bonus.length ? ' · 보너스 있음' : ''}${i.unique && me.infrastructure.includes(i.type) ? ' (이미 건설)' : ''}`}
          >
            <span>{INFRA_LABEL[i.type]}</span>
            <span className="chips">
              <CostChips cost={{ money: INFRASTRUCTURE_COST }} />
              <span className="chip vp"><Icon name="vp" size={12} />{i.vp}</span>
            </span>
          </button>
        ))}
        <button
          className={cls('office')}
          disabled={!basic || !officeStep || officeStep.cost === 0 || me.resources.money < officeStep.cost}
          onClick={() => officeStep && select('office', { type: 'buildOffice' }, <>사무실 확장 <CostChips cost={{ money: officeStep.cost }} /> → 승점 {officeStep.vp}</>)}
          title={officeStep && officeStep.cost > 0 ? `사무실 확장 · 돈 ${officeStep.cost} → 승점 ${officeStep.vp}` : '사무실 트랙 끝'}
        >
          <span>사무실 확장</span>
          {officeStep && officeStep.cost > 0 ? (
            <span className="chips">
              <CostChips cost={{ money: officeStep.cost }} />
              <span className="chip vp"><Icon name="vp" size={12} />{officeStep.vp}</span>
            </span>
          ) : (
            <span className="muted small">완료</span>
          )}
        </button>
      </div>

      <h3>카드 행동</h3>
      <div className="action-list">
        {me.staff.map((s, index) => {
          const card = cards.staff(s.cardId);
          if (!card.action) return null;
          const blocked = !myTurn || s.exhausted || s.suspension > 0;
          const label = <>카드 행동: <b>{card.name}</b> <CostChips cost={card.action.cost} /> — {card.action.text}</>;
          return (
            <span key={`s${index}`} className="action-split">
              <button className={cls(`staff:${index}`)} disabled={blocked || basicDone} onClick={() => select(`staff:${index}`, { type: 'cardAction', source: { kind: 'staff', index } }, label)} title={card.action.text}>
                <span>{card.name}</span>
                <CostChips cost={card.action.cost} />
              </button>
              <button className={`paid${chosen === `staff-paid:${index}` ? ' chosen' : ''}`} disabled={blocked || paidDone || me.resources.ops < 2} onClick={() => select(`staff-paid:${index}`, { type: 'cardAction', source: { kind: 'staff', index }, paid: true }, <>유급 {label}</>)} title="운영 2개로 추가 수행">
                유급
              </button>
            </span>
          );
        })}
        {me.executives.map((e, index) => {
          const card = cards.executive(e.cardId);
          if (!card.action) return null;
          const blocked = !myTurn || e.exhausted;
          const label = <>카드 행동: <b>{card.name}</b> <CostChips cost={card.action.cost} /> — {card.action.text}</>;
          return (
            <span key={`e${index}`} className="action-split">
              <button className={cls(`exec:${index}`)} disabled={blocked || basicDone} onClick={() => select(`exec:${index}`, { type: 'cardAction', source: { kind: 'executive', index } }, label)} title={card.action.text}>
                <span>{card.name}</span>
                <CostChips cost={card.action.cost} />
              </button>
              <button className={`paid${chosen === `exec-paid:${index}` ? ' chosen' : ''}`} disabled={blocked || paidDone || me.resources.ops < 2} onClick={() => select(`exec-paid:${index}`, { type: 'cardAction', source: { kind: 'executive', index }, paid: true }, <>유급 {label}</>)} title="운영 2개로 추가 수행">
                유급
              </button>
            </span>
          );
        })}
        {!me.staff.some((s) => cards.staff(s.cardId).action) && !me.executives.some((e) => cards.executive(e.cardId).action) && <span className="muted small">행동이 있는 카드가 없습니다</span>}
      </div>

      <div className="action-list turn-actions">
        <button className={`${cls('pass')} ghost`} disabled={!basic} onClick={() => select('pass', { type: 'pass' }, <>기본 행동을 <b>패스</b>합니다</>)}>
          <span>패스</span>
        </button>
        <button className="action-item primary" disabled={!myTurn || !basicDone} onClick={() => act({ type: 'endTurn' })}>
          <span>차례 끝내기</span>
        </button>
      </div>
    </section>
  );
}

export function ActionSidebar() {
  const { view, session } = useView();
  const me = session ? view.players[session.playerId] : undefined;
  return (
    <aside className="sidebar" aria-label="행동">
      <TurnStatus />
      <DiceTray />
      {me && view.phase.kind === 'weekday' && <WeekdayActions me={me} />}
      <LegendButton />
    </aside>
  );
}
