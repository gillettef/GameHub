import { cards } from '@server/engine/cards';
import { infraCost } from '@server/engine/traits';
import type { InfrastructureType } from '@server/engine/types';
import type { PlayerPublicView } from '@server/engine/view';
import { useCommit } from '../commit';
import { DAY_LABEL, INFRA_EFFECT, INFRA_LABEL } from '../labels';
import { useView } from '../store';
import { useUi } from '../ui';
import { DiceTray } from './DiceTray';
import { CostChips, EffectChips, Icon } from './Icons';
import { UpkeepWarning } from './Upkeep';
import { CatalogButton } from './Catalog';
import { LegendButton } from './Legend';
import { WeekSchedule } from './WeekSchedule';

// 왼쪽 사이드바: 이번 주 일정, 주사위(이사회·경기 영향), 주중 행동 목록, 아이콘 설명. 누구 차례인지는 헤더 참가자 띠의 표시가 알려준다.
// 주중 행동은 전부 여기에 나열하고 지금 할 수 있는 것만 활성화한다. **행동 버튼은 고르는 화면으로 이동만 시킨다**(사용자 요청 2026-09):
// 영입·고용·계약 → 이적 시장 탭, 방출 → 경기 보드, 시설·사무실 → 스타디움 보드의 '건설' 타일, 카드 행동 → 구단 보드의 그 카드 아래 버튼.
// 거기서 고르면 아래 확정 막대에서 확정한다. 맨 위는 차례 끝내기와 처음으로 되돌리기뿐 — 패스 버튼은 없고, 기본 행동 없이 차례를 끝내면 패스다(확정 필요).

// 지금 이 참가자가 주중 차례에 무엇을 할 수 있는지 (사이드바·스타디움 보드·구단 보드가 같이 쓴다)
export function useWeekdayTurn(pid: string) {
  const { view, session } = useView();
  const phase = view.phase.kind === 'weekday' ? view.phase : null;
  const myTurn = !!phase && !!session && session.playerId === pid && phase.current === pid;
  return {
    myTurn,
    basicDone: phase?.basicDone ?? true,
    paidDone: phase?.paidDone ?? true,
    // 요일 제한(점검용 토큰): 카드 행동만 가능한 날은 다른 기본 행동을 막는다. 기본 행동 불가인 날은 서버가 basicDone 으로 시작한다
    basic: myTurn && !!phase && !phase.basicDone && phase.restriction !== 'cardActionOnly',
  };
}

// 시설 7종 + 사무실 확장 버튼. mode 'nav' = 사이드바(누르면 스타디움 보드로 이동), 'select' = 스타디움 보드의 건설 타일(누르면 선택 → 확정 막대)
export function BuildOptions({ me, mode }: { me: PlayerPublicView; mode: 'nav' | 'select' }) {
  const { chosen, select } = useCommit();
  const { showBoard } = useUi();
  const { basic } = useWeekdayTurn(me.id);
  const cls = (key: string) => `action-item${mode === 'select' && chosen === key ? ' chosen' : ''}`;
  const officeStep = cards.boardData.office[me.office];
  const go = () => showBoard('stadium', me.id);
  return (
    <div className={`action-list${mode === 'select' ? ' build-options' : ''}`}>
      {cards.boardData.infrastructure.map((i) => (
        <button
          key={i.type}
          className={`${cls(`infra:${i.type}`)} infra-action`}
          disabled={!basic || (i.unique && me.infrastructure.includes(i.type)) || (!!i.requires && !me.infrastructure.includes(i.requires)) || me.infrastructure.length >= 7 || me.resources.money < infraCost(me)}
          onClick={mode === 'nav' ? go : () => select(`infra:${i.type}`, { type: 'buildInfrastructure', infrastructure: i.type as InfrastructureType }, <>건설: <b>{INFRA_LABEL[i.type]}</b> <CostChips cost={{ money: infraCost(me) }} /> → {INFRA_EFFECT[i.type]} · 승점 {i.vp}</>)}
          title={`${INFRA_LABEL[i.type]} · 돈 ${infraCost(me)} · ${INFRA_EFFECT[i.type]} · 게임 종료 승점 ${i.vp}${i.unique && me.infrastructure.includes(i.type) ? ' (이미 건설)' : ''}${i.requires && !me.infrastructure.includes(i.requires) ? ` (${INFRA_LABEL[i.requires]} 먼저)` : ''}`}
        >
          <span className="infra-action-head">
            <span>{INFRA_LABEL[i.type]}{mode === 'nav' && '…'}{i.unique && me.infrastructure.includes(i.type) && <span className="muted small"> (건설함)</span>}</span>
            <CostChips cost={{ money: infraCost(me) }} />
          </span>
          {/* 무엇을 주는지: 트랙 +1(건설 즉시) / 관중석·광고판 칸 + 게임 종료 승점 (test_insight C7) */}
          <span className="infra-action-gain">
            {i.bonus.length > 0 ? <EffectChips effects={i.bonus} /> : <span className="infra-action-text">{i.type === 'billboard3' ? '광고판 +1칸' : '관중석 +1석'}</span>}
            <span className="chip vp" title={`게임 종료 승점 ${i.vp}`}><Icon name="vp" size={12} />{i.vp}</span>
          </span>
        </button>
      ))}
      <button
        className={cls('office')}
        disabled={!basic || !officeStep || officeStep.cost === 0 || me.resources.money < officeStep.cost}
        onClick={mode === 'nav' ? go : () => officeStep && select('office', { type: 'buildOffice' }, <>사무실 확장 <CostChips cost={{ money: officeStep.cost }} /> → 승점 {officeStep.vp}</>)}
        title={officeStep && officeStep.cost > 0 ? `사무실 확장 · 돈 ${officeStep.cost} → 승점 ${officeStep.vp}` : '사무실 트랙 끝'}
      >
        <span>사무실 확장{mode === 'nav' && '…'}</span>
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
  );
}

// 구단 보드의 내 직원·임원 카드 아래에 붙는 카드 행동 버튼 (기본 / 유급). 누르면 선택 → 확정 막대. 내 주중 차례에만 나온다
export function CardActionButtons({ me, kind, index }: { me: PlayerPublicView; kind: 'staff' | 'executive'; index: number }) {
  const { chosen, select } = useCommit();
  const { myTurn, basicDone, paidDone } = useWeekdayTurn(me.id);
  const staff = kind === 'staff' ? me.staff[index] : undefined;
  const inst = staff ?? me.executives[index];
  const card = inst && (kind === 'staff' ? cards.staff(inst.cardId) : cards.executive(inst.cardId));
  if (!inst || !card?.action || !myTurn) return null;
  const blocked = inst.exhausted || (staff?.suspension ?? 0) > 0;
  const key = `${kind === 'staff' ? 'staff' : 'exec'}:${index}`;
  const label = <>카드 행동: <b>{card.name}</b> <CostChips cost={card.action.cost} /> — {card.action.text}</>;
  return (
    <span className="action-split card-actions">
      <button className={`action-item${chosen === key ? ' chosen' : ''}`} disabled={blocked || basicDone} onClick={() => select(key, { type: 'cardAction', source: { kind, index } }, label)} title={card.action.text}>
        <span>카드 행동</span>
        <CostChips cost={card.action.cost} />
      </button>
      <button className={`paid${chosen === `${key}-paid` ? ' chosen' : ''}`} disabled={blocked || paidDone || me.resources.ops < 2} onClick={() => select(`${key}-paid`, { type: 'cardAction', source: { kind, index }, paid: true }, <>유급 {label}</>)} title="운영 2개로 추가 수행">
        유급
      </button>
    </span>
  );
}

export function WeekdayActions({ me }: { me: PlayerPublicView }) {
  const { view, act } = useView();
  const { chosen, select } = useCommit();
  const { showBoard, showMarket, releasing, setReleasing } = useUi();
  if (view.phase.kind !== 'weekday') return null;
  const { day, current, basicDone, paidDone, canUndo, restriction } = view.phase;
  const myTurn = current === me.id;
  const basic = myTurn && !basicDone && restriction !== 'cardActionOnly';
  const cls = (key: string) => `action-item${chosen === key ? ' chosen' : ''}`;
  const prospect = view.nextProspect;
  const canPay = !paidDone && me.resources.ops >= 2;
  const toggleRelease = () => {
    const next = !releasing;
    setReleasing(next);
    if (next) showBoard('match', me.id);
  };
  // 카드 행동 버튼: 구단 보드로 이동만 시킨다 — 기본/유급은 그 카드 아래에서 고른다
  const cardNav = (key: string, name: string, text: string, cost: Parameters<typeof CostChips>[0]['cost'], usable: boolean) => (
    <button key={key} className="action-item" disabled={!usable} onClick={() => showBoard('club', me.id)} title={`구단 보드의 ${name} 카드 아래에서 행동(기본/유급)을 고릅니다 — ${text}`}>
      <span>{name}…</span>
      <CostChips cost={cost} />
    </button>
  );
  return (
    <section className="panel action-panel">
      <div className="panel-head">
        <h2>행동 · {DAY_LABEL[day]}</h2>
        <span className="muted small">
          기본 {basicDone ? '완료' : '1회'} · 유급 {paidDone ? '완료' : '가능'}
        </span>
      </div>
      <UpkeepWarning view={view} p={me} />
      {!myTurn && <p className="muted small">내 차례가 아닙니다. 차례가 오면 활성화됩니다.</p>}
      {myTurn && restriction && (
        <p className="error small">점검용 토큰: {restriction === 'noBasic' ? '오늘은 기본 행동을 할 수 없습니다 (유급 카드 행동만 가능)' : '오늘은 카드 행동만 할 수 있습니다'}</p>
      )}

      <div className="action-list turn-actions">
        {/* 기본 행동을 했으면 바로 끝내고, 안 했으면(= 패스) 잘못 누르지 않게 확정 막대를 거친다 */}
        <button
          className={`${cls('endTurn')} primary`}
          disabled={!myTurn}
          onClick={() => (basicDone ? act({ type: 'endTurn' }) : select('endTurn', { type: 'endTurn' }, <>기본 행동을 하지 않고 <b>차례를 끝냅니다</b> (패스)</>))}
          title={basicDone ? '차례를 끝냅니다' : '기본 행동을 하지 않고 차례를 끝냅니다 (패스)'}
        >
          <span>차례 끝내기</span>
        </button>
        <button className={cls('undo')} disabled={!myTurn || !canUndo} onClick={() => select('undo', { type: 'undoTurn' }, <>이번 차례의 행동을 모두 무르고 <b>차례 처음</b>으로 되돌립니다</>)} title="이번 차례에 한 행동을 모두 무릅니다 (차례를 끝내기 전까지만)">
          <span><Icon name="train" size={14} className="flip" />처음으로 되돌리기</span>
        </button>
      </div>

      <h3>이적 시장</h3>
      <div className="action-list">
        <button className="action-item" disabled={!basic} onClick={() => showMarket('players')} title="이적 시장 · 주전 탭에서 오른쪽 3장 중 한 장을 고릅니다">
          <span>주전 선수 영입…</span>
        </button>
        <button className="action-item" disabled={!basic} onClick={() => showMarket('veterans')} title="이적 시장 · 베테랑 탭에서 오른쪽 3장 중 한 장을 고릅니다">
          <span>베테랑 영입…</span>
        </button>
        <button className="action-item" disabled={!basic || !prospect} onClick={() => showMarket('prospects')} title={prospect ? '이적 시장 · 유망주 탭에서 더미 맨 위 카드를 누릅니다 (미훈련 면만 보이고 훈련 면은 영입 후 공개)' : '유망주 더미가 비었습니다'}>
          <span>유망주 영입…</span>
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
      <p className="muted small infra-note">누르면 스타디움 보드로 이동해 거기서 건설합니다. 시설마다 <Icon name="vp" size={11} />게임 종료 승점 + 아래 효과. 트랙 +1은 건설 즉시 한 번 (5칸을 넘으면 자원으로).</p>
      <BuildOptions me={me} mode="nav" />

      <h3>카드 행동</h3>
      <div className="action-list">
        {me.staff.map((s, index) => {
          const card = cards.staff(s.cardId);
          return card.action ? cardNav(`s${index}`, card.name, card.action.text, card.action.cost, myTurn && !s.exhausted && s.suspension === 0 && (!basicDone || canPay)) : null;
        })}
        {me.executives.map((e, index) => {
          const card = cards.executive(e.cardId);
          return card.action ? cardNav(`e${index}`, card.name, card.action.text, card.action.cost, myTurn && !e.exhausted && (!basicDone || canPay)) : null;
        })}
        {!me.staff.some((s) => cards.staff(s.cardId).action) && !me.executives.some((e) => cards.executive(e.cardId).action) && <span className="muted small">행동이 있는 카드가 없습니다</span>}
      </div>
    </section>
  );
}

export function ActionSidebar() {
  const { view, session } = useView();
  const me = session ? view.players[session.playerId] : undefined;
  return (
    <aside className="sidebar" aria-label="행동">
      <WeekSchedule />
      <DiceTray />
      {me && view.phase.kind === 'weekday' && <WeekdayActions me={me} />}
      <CatalogButton />
      <LegendButton />
    </aside>
  );
}
