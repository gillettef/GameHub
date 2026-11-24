import type { ReactNode } from 'react';
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
import { UpkeepShift, UpkeepWarning } from './Upkeep';
import { CatalogButton } from './Catalog';
import { LegendButton } from './Legend';
import { PhaseGuide } from './PhaseGuide';
import { SinceMyTurn } from './SinceMyTurn';
import { WeekSchedule } from './WeekSchedule';

// '진행' 영역: 이번 주 일정, 도움말 버튼, 지난 내 차례 이후 요약, 단계 패널, 주사위(이사회·경기 영향), 주중 행동 목록.
// 단계 패널을 주사위보다 먼저 둔다 — 이사회 카드·경기 결과를 읽고 아래로 내려오면 굴리기·적용 버튼이 있다(위아래로 오가지 않게).
// 주중 행동은 전부 여기에 나열하고 지금 할 수 있는 것만 활성화한다. **행동 버튼은 고르는 화면으로 이동만 시킨다**(사용자 요청 2026-09):
// 영입·고용·계약 → 이적 시장 탭, 방출 → 경기 보드, 시설·사무실 → 스타디움 보드의 '건설' 타일, 카드 행동 → 구단 보드의 그 카드 아래 버튼.
// 거기서 고르면 아래 확정 막대에서 확정한다. 맨 위는 차례 끝내기와 처음으로 되돌리기뿐 — 패스 버튼은 없고, 기본 행동 없이 차례를 끝내면 패스다(확정 필요).
// 못 누르는 버튼에는 이유를 버튼 안에 글로 적는다 — 터치 화면에서는 툴팁(title)이 버튼에 뜨지 않는다.

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

// 버튼 안의 '못 하는 이유' 한 줄
function Why({ children }: { children: ReactNode }) {
  return <span className="action-why">{children}</span>;
}

// 시설을 지을 수 없는 이유 (없으면 null). 차례·기본 행동 여부는 목록 머리에서 알려 주므로 여기서는 시설 자체의 조건만
function infraBlock(me: PlayerPublicView, type: string): string | null {
  const i = cards.boardData.infrastructure.find((x) => x.type === type)!;
  if (i.unique && me.infrastructure.includes(i.type)) return '이미 건설함';
  if (i.requires && !me.infrastructure.includes(i.requires)) return `${INFRA_LABEL[i.requires]} 먼저`;
  if (me.infrastructure.length >= 7) return '시설 7개 가득';
  if (me.resources.money < infraCost(me)) return `돈 부족 (보유 ${me.resources.money})`;
  return null;
}

// 스타디움 보드의 '건설' 타일: 시설 7종 + 사무실 확장. 누르면 선택 → 확정 막대 (내 주중 차례에만 보인다)
export function BuildOptions({ me }: { me: PlayerPublicView }) {
  const { view } = useView();
  const { chosen, select } = useCommit();
  const { basic } = useWeekdayTurn(me.id);
  const cls = (key: string) => `action-item${chosen === key ? ' chosen' : ''}`;
  const officeStep = cards.boardData.office[me.office];
  const officeBlock = !officeStep || officeStep.cost === 0 ? '사무실 끝까지 확장함' : me.resources.money < officeStep.cost ? `돈 부족 (보유 ${me.resources.money})` : null;
  return (
    <div className="action-list build-options">
      {cards.boardData.infrastructure.map((i) => {
        const block = infraBlock(me, i.type);
        return (
          <button
            key={i.type}
            className={`${cls(`infra:${i.type}`)} infra-action`}
            disabled={!basic || !!block}
            onClick={() => select(`infra:${i.type}`, { type: 'buildInfrastructure', infrastructure: i.type as InfrastructureType }, <>건설: <b>{INFRA_LABEL[i.type]}</b> <CostChips cost={{ money: infraCost(me) }} /> → {INFRA_EFFECT[i.type]} · 승점 {i.vp}<UpkeepShift view={view} p={me} change={{ infra: 1 }} /></>)}
            title={`${INFRA_LABEL[i.type]} · 돈 ${infraCost(me)} · ${INFRA_EFFECT[i.type]} · 게임 종료 승점 ${i.vp}${block ? ` (${block})` : ''}`}
          >
            <span className="infra-action-head">
              <span>{INFRA_LABEL[i.type]}</span>
              <CostChips cost={{ money: infraCost(me) }} />
            </span>
            {/* 무엇을 주는지: 트랙 +1(건설 즉시) / 관중석·광고판 칸 + 게임 종료 승점 (test_insight C7) */}
            <span className="infra-action-gain">
              {i.bonus.length > 0 ? <EffectChips effects={i.bonus} /> : <span className="infra-action-text">{i.type === 'billboard3' ? '광고판 +1칸' : '관중석 +1석'}</span>}
              <span className="chip vp" title={`게임 종료 승점 ${i.vp}`}><Icon name="vp" size={12} />{i.vp}</span>
            </span>
            {basic && block && <Why>{block}</Why>}
          </button>
        );
      })}
      <button
        className={cls('office')}
        disabled={!basic || !!officeBlock}
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
        {basic && officeBlock && officeStep && officeStep.cost > 0 && <Why>{officeBlock}</Why>}
      </button>
    </div>
  );
}

// 카드 행동을 못 하는 이유: 기본(paid=false) / 유급(paid=true)
function cardActionBlock(inst: { exhausted: boolean; suspension?: number }, paid: boolean, basicDone: boolean, paidDone: boolean, ops: number): string | null {
  if ((inst.suspension ?? 0) > 0) return '출장정지 중';
  if (inst.exhausted) return '이번 주에 이미 사용(소진)';
  if (!paid) return basicDone ? '기본 행동 완료' : null;
  if (paidDone) return '유급 행동 완료';
  if (ops < 2) return `운영 2 필요 (보유 ${ops})`;
  return null;
}

// 구단 보드의 내 직원·임원 카드 아래에 붙는 카드 행동 버튼 (기본 / 유급). 누르면 선택 → 확정 막대. 내 주중 차례에만 나온다
export function CardActionButtons({ me, kind, index }: { me: PlayerPublicView; kind: 'staff' | 'executive'; index: number }) {
  const { chosen, select } = useCommit();
  const { myTurn, basicDone, paidDone } = useWeekdayTurn(me.id);
  const staff = kind === 'staff' ? me.staff[index] : undefined;
  const inst = staff ?? me.executives[index];
  const card = inst && (kind === 'staff' ? cards.staff(inst.cardId) : cards.executive(inst.cardId));
  if (!inst || !card?.action || !myTurn) return null;
  const key = `${kind === 'staff' ? 'staff' : 'exec'}:${index}`;
  const label = <>카드 행동: <b>{card.name}</b> <CostChips cost={card.action.cost} /> — {card.action.text}</>;
  const basicBlock = cardActionBlock({ ...inst, suspension: staff?.suspension }, false, basicDone, paidDone, me.resources.ops);
  const paidBlock = cardActionBlock({ ...inst, suspension: staff?.suspension }, true, basicDone, paidDone, me.resources.ops);
  // 둘 다 막혔으면 이유 하나만 (같은 이유가 두 번 나오지 않게)
  const why = basicBlock && paidBlock ? (basicBlock === '기본 행동 완료' ? paidBlock : basicBlock) : null;
  return (
    <span className="card-actions-wrap">
      <span className="action-split card-actions">
        <button className={`action-item${chosen === key ? ' chosen' : ''}`} disabled={!!basicBlock} onClick={() => select(key, { type: 'cardAction', source: { kind, index } }, label)} title={card.action.text}>
          <span>카드 행동</span>
          <CostChips cost={card.action.cost} />
        </button>
        <button className={`paid${chosen === `${key}-paid` ? ' chosen' : ''}`} disabled={!!paidBlock} onClick={() => select(`${key}-paid`, { type: 'cardAction', source: { kind, index }, paid: true }, <>유급 (운영 2 추가) {label}</>)} title="기본 행동과 별개로, 운영 2개를 더 내고 한 번 더 수행">
          유급 <span className="paid-cost"><Icon name="ops" size={12} />2</span>
        </button>
      </span>
      {why && <Why>{why}</Why>}
    </span>
  );
}

export function WeekdayActions({ me }: { me: PlayerPublicView }) {
  const { view, act } = useView();
  const { chosen, select } = useCommit();
  const { showBoard, showCard, showMarket, releasing, setReleasing } = useUi();
  if (view.phase.kind !== 'weekday') return null;
  const { day, current, basicDone, paidDone, canUndo, restriction } = view.phase;
  const myTurn = current === me.id;
  const basic = myTurn && !basicDone && restriction !== 'cardActionOnly';
  const cls = (key: string) => `action-item${chosen === key ? ' chosen' : ''}`;
  const prospect = view.nextProspect;
  const toggleRelease = () => {
    const next = !releasing;
    setReleasing(next);
    if (next) showBoard('match', me.id);
  };
  // 카드 행동 버튼: 구단 보드의 그 카드로 이동만 시킨다 — 기본/유급은 그 카드 아래에서 고른다. key 는 구단 보드 card-slot 의 data-focus 와 같다
  const cardNav = (key: string, name: string, text: string, cost: Parameters<typeof CostChips>[0]['cost'], inst: { exhausted: boolean; suspension?: number }) => {
    const basicBlock = cardActionBlock(inst, false, basicDone, paidDone, me.resources.ops);
    const paidBlock = cardActionBlock(inst, true, basicDone, paidDone, me.resources.ops);
    const blocked = !!basicBlock && !!paidBlock;
    return (
      <button key={key} className="action-item" disabled={!myTurn || blocked} onClick={() => showCard(key, me.id)} title={`구단 보드의 ${name} 카드 아래에서 행동(기본/유급)을 고릅니다 — ${text}`}>
        <span>{name}…</span>
        <CostChips cost={cost} />
        {myTurn && blocked && <Why>{basicBlock === '기본 행동 완료' ? paidBlock : basicBlock}</Why>}
      </button>
    );
  };
  // 시설: 7종을 여기 다시 늘어놓지 않고(스타디움 보드와 중복) 지을 수 있는 수만 알려 주고 스타디움 보드로 보낸다
  const buildable = cards.boardData.infrastructure.filter((i) => !infraBlock(me, i.type)).length;
  const officeStep = cards.boardData.office[me.office];
  const officeOpen = !!officeStep && officeStep.cost > 0 && me.resources.money >= officeStep.cost;
  // 기본 행동을 마쳤으면 차례 끝내기가 다음 할 일 — 크게 강조한다 (할 일이 남아 있으면 평범한 버튼)
  const wrapUp = myTurn && basicDone;
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
          className={`${cls('endTurn')}${wrapUp ? ' primary attention' : ''}`}
          disabled={!myTurn}
          onClick={() => (basicDone ? act({ type: 'endTurn' }) : select('endTurn', { type: 'endTurn' }, <>기본 행동을 하지 않고 <b>차례를 끝냅니다</b> (패스)</>))}
          title={basicDone ? '차례를 끝냅니다' : '기본 행동을 하지 않고 차례를 끝냅니다 (패스)'}
        >
          <span>차례 끝내기</span>
          {wrapUp && <span className="action-sub">{paidDone || me.resources.ops < 2 ? '할 일을 마쳤습니다' : '유급 카드 행동도 할 수 있습니다'}</span>}
          {myTurn && !basicDone && <span className="action-sub">기본 행동 없이 끝내면 패스</span>}
        </button>
        <button className={cls('undo')} disabled={!myTurn || !canUndo} onClick={() => select('undo', { type: 'undoTurn' }, <>이번 차례의 행동을 모두 무르고 <b>차례 처음</b>으로 되돌립니다</>)} title="이번 차례에 한 행동을 모두 무릅니다 (차례를 끝내기 전까지만)">
          <span><Icon name="train" size={14} className="flip" />처음으로 되돌리기</span>
          {myTurn && !canUndo && basicDone && <Why>카드가 공개되어 되돌릴 수 없음</Why>}
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
          {basic && !prospect && <Why>유망주 더미가 비었음</Why>}
        </button>
        <button className="action-item" disabled={!basic} onClick={() => showMarket('staff')} title="이적 시장 · 직원 탭에서 오른쪽 3장 중 한 장을 고릅니다">
          <span>직원 고용…</span>
        </button>
        <button className="action-item" disabled={!basic} onClick={() => showMarket('sponsors')} title="이적 시장 · 스폰서 탭에서 카드를 누르면 계약 유형을 고릅니다">
          <span>스폰서 계약…</span>
        </button>
      </div>

      <h3>선수 · 스타디움</h3>
      <div className="action-list">
        <button className={`action-item${releasing ? ' active' : ''}`} disabled={!basic || me.roster.length === 0} onClick={toggleRelease} title="경기 보드의 선수 카드를 눌러 방출할 선수를 고릅니다. 2 + 현재 역량만큼 돈, 부상·출장정지면 절반">
          <span>선수 방출…</span>
          {releasing && <span className="tag">선택 중</span>}
        </button>
        <button className="action-item" disabled={!basic} onClick={() => showBoard('stadium', me.id)} title="스타디움 보드의 '건설' 타일에서 시설이나 사무실을 고릅니다">
          <span>시설 건설·사무실 확장…</span>
          <span className="muted small">시설 {me.infrastructure.length}/7</span>
          {basic && <span className="action-sub">{buildable > 0 ? `지금 지을 수 있는 시설 ${buildable}종 · ` : '지을 수 있는 시설 없음 · '}{officeOpen ? '사무실 확장 가능' : '사무실 확장 불가'}</span>}
        </button>
      </div>

      <h3>카드 행동</h3>
      <div className="action-list">
        {me.staff.map((s, index) => {
          const card = cards.staff(s.cardId);
          return card.action ? cardNav(`staff:${index}`, card.name, card.action.text, card.action.cost, s) : null;
        })}
        {me.executives.map((e, index) => {
          const card = cards.executive(e.cardId);
          return card.action ? cardNav(`executive:${index}`, card.name, card.action.text, card.action.cost, e) : null;
        })}
        {!me.staff.some((s) => cards.staff(s.cardId).action) && !me.executives.some((e) => cards.executive(e.cardId).action) && <span className="muted small">행동이 있는 카드가 없습니다</span>}
      </div>
    </section>
  );
}

// '진행' 영역 전체. panel = 단계 패널(드래프트·이사회·경기 준비/결과 …), 주중에는 없음
export function ActionSidebar({ panel }: { panel?: ReactNode }) {
  const { view, session } = useView();
  const me = session ? view.players[session.playerId] : undefined;
  return (
    <aside className="sidebar" aria-label="행동">
      <WeekSchedule />
      {/* 처음 하는 사람이 찾기 쉽게 위쪽에 (예전에는 긴 행동 목록 맨 아래에 묻혀 있었다) */}
      <div className="help-row">
        <CatalogButton />
        <LegendButton />
      </div>
      <PhaseGuide />
      <SinceMyTurn />
      {panel}
      <DiceTray />
      {me && view.phase.kind === 'weekday' && <WeekdayActions me={me} />}
    </aside>
  );
}
