import { useState } from 'react';
import { createPortal } from 'react-dom';
import { BOARD_CARDS, EXECUTIVE_CARDS, OBJECTIVE_CARDS, OPPONENT_CARDS, PLAYER_CARDS, SPONSOR_CARDS, STAFF_CARDS, TACTIC_CARDS } from '@server/data';
import { emptyTokens } from '@server/engine/state';
import type { PlayerInstance } from '@server/engine/state';
import type { PlayerKind } from '@server/engine/types';
import { BoardCardView, ExecutiveCardView, ObjectiveCardView, OpponentCardView, PlayerCardView, SponsorCardView, StaffCardView, TacticCardView } from './Cards';
import { Icon } from './Icons';
import { Tabs } from './Tabs';
import type { TabDef } from './Tabs';

// 전체 카드 목록(사용자 요청, 2026-09): 게임에 들어 있는 모든 카드를 종류별 탭으로 훑어본다. 읽기 전용이고 게임 상태와 무관하다.
// 상대 팀 카드는 경기 전까지 앞면이 비공개라(스카우트 보고서만 공개) 여기서도 보고서 면만 보여 준다
type CatalogTab = 'starter' | 'veteran' | 'prospect' | 'staff' | 'sponsor' | 'board' | 'executive' | 'objective' | 'tactic' | 'opponent';

const PLAYER_TABS: readonly CatalogTab[] = ['starter', 'veteran', 'prospect'];
const playersOf = (kind: PlayerKind) => PLAYER_CARDS.filter((c) => c.kind === kind);

const TABS: TabDef<CatalogTab>[] = [
  { key: 'starter', label: '주전', badge: playersOf('starter').length },
  { key: 'veteran', label: '베테랑', badge: playersOf('veteran').length },
  { key: 'prospect', label: '유망주', badge: playersOf('prospect').length },
  { key: 'staff', label: '직원', badge: STAFF_CARDS.length },
  { key: 'sponsor', label: '스폰서', badge: SPONSOR_CARDS.length },
  { key: 'board', label: '이사회', badge: BOARD_CARDS.length },
  { key: 'executive', label: '임원', badge: EXECUTIVE_CARDS.length },
  { key: 'objective', label: '목표', badge: OBJECTIVE_CARDS.length },
  { key: 'tactic', label: '전술', badge: TACTIC_CARDS.length },
  { key: 'opponent', label: '상대 팀', badge: OPPONENT_CARDS.length },
];

// 훈련 면을 그리기 위한 가짜 인스턴스 (PlayerCardView 는 인스턴스의 trained 로 면을 고른다)
const trainedInstance = (cardId: string): PlayerInstance => ({
  instanceId: `catalog-${cardId}`,
  cardId,
  trained: true,
  tokens: emptyTokens(),
  placed: {},
  stamina: 0,
  exhausted: false,
  careerVP: 0,
  careerUsed: { appearances: 0, goals: 0 },
});

function CatalogModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<CatalogTab>('starter');
  const [trained, setTrained] = useState(false);
  const [query, setQuery] = useState('');
  const isPlayerTab = PLAYER_TABS.includes(tab);
  // 유망주는 훈련 전 면이 모두 똑같아 훈련 면이 기본
  const changeTab = (next: CatalogTab) => {
    setTab(next);
    setTrained(next === 'prospect');
  };
  const q = query.trim().toLowerCase();
  const match = (...texts: (string | undefined)[]) => !q || texts.some((t) => t?.toLowerCase().includes(q));

  const body = (() => {
    switch (tab) {
      case 'starter':
      case 'veteran':
      case 'prospect':
        return playersOf(tab)
          .filter((c) => match(c.name, ...c.tags, c.untrained.effect?.text, c.trained.effect?.text))
          .map((c) => <PlayerCardView key={c.id} cardId={c.id} instance={trained ? trainedInstance(c.id) : undefined} />);
      case 'staff':
        return STAFF_CARDS.filter((c) => match(c.name, c.job, c.action?.text, c.trait?.text)).map((c) => <StaffCardView key={c.id} cardId={c.id} />);
      case 'sponsor':
        return SPONSOR_CARDS.filter((c) => match(c.name)).map((c) => <SponsorCardView key={c.id} cardId={c.id} />);
      case 'board':
        return BOARD_CARDS.filter((c) => match(c.name)).map((c) => <BoardCardView key={c.id} cardId={c.id} />);
      case 'executive':
        return EXECUTIVE_CARDS.filter((c) => match(c.name, c.action?.text, c.trait?.text)).map((c) => <ExecutiveCardView key={c.id} cardId={c.id} />);
      case 'objective':
        return OBJECTIVE_CARDS.filter((c) => match(c.name, c.goal, c.perfect)).map((c) => <ObjectiveCardView key={c.id} cardId={c.id} />);
      case 'tactic':
        return TACTIC_CARDS.filter((c) => match(c.name, c.effect?.text)).map((c) => <TacticCardView key={c.id} cardId={c.id} />);
      case 'opponent':
        return OPPONENT_CARDS.filter((c) => match(c.teamName, c.tier, c.scoutReport)).map((c) => <OpponentCardView key={c.id} cardId={c.id} />);
    }
  })();

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal catalog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="카드 목록">
        <div className="panel-head">
          <h2>카드 목록</h2>
          <button className="ghost small" onClick={onClose}>닫기</button>
        </div>
        <Tabs tabs={TABS} value={tab} onChange={changeTab} />
        <div className="row catalog-tools">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름·효과 문구로 찾기" aria-label="카드 찾기" />
          {isPlayerTab && (
            <label className="row small">
              <input type="checkbox" checked={trained} onChange={(e) => setTrained(e.target.checked)} />
              훈련 면 보기
            </label>
          )}
          <span className="muted small">{body.length}장</span>
        </div>
        {tab === 'prospect' && !trained && <p className="muted small">유망주는 훈련 전에는 모든 카드가 똑같이 보입니다. 훈련 면을 켜면 카드마다 다른 면이 보입니다.</p>}
        {tab === 'opponent' && <p className="muted small">상대 팀 카드의 앞면은 경기 때 공개됩니다. 여기서는 스카우트 보고서 면만 보여 줍니다.</p>}
        <div className="catalog-grid">{body.length > 0 ? body : <p className="muted small">찾는 카드가 없습니다.</p>}</div>
      </div>
    </div>,
    document.body,
  );
}

export function CatalogButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="legend-button catalog-button" onClick={() => setOpen(true)} title="게임에 들어 있는 모든 카드를 종류별로 봅니다">
        <Icon name="vp" size={14} />카드 목록
      </button>
      {open && <CatalogModal onClose={() => setOpen(false)} />}
    </>
  );
}
