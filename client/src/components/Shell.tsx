import { useState } from 'react';
import { cards } from '@server/engine/cards';
import type { LogEntry, PlayerId } from '@server/engine/state';
import { RESOURCES } from '@server/engine/types';
import { useCommit } from '../commit';
import { DAY_LABEL, SEAT_COLORS, TOKEN_LABEL, phaseLabel } from '../labels';
import { NotifyToggles } from '../notify';
import { useStore, useView } from '../store';
import { useUi } from '../ui';
import type { MarketTab } from '../ui';
import { PlayerCardView, SponsorCardView, StaffCardView } from './Cards';
import { CostChips, Icon } from './Icons';
import { SponsorContractModal } from './Sponsor';
import { Tabs } from './Tabs';

export function seatColor(view: { seats: PlayerId[] }, pid: PlayerId): string {
  return SEAT_COLORS[view.seats.indexOf(pid)] ?? '#64748B';
}

export function Header({ subtitle }: { subtitle?: string }) {
  const { view, room, connected, session, leave } = useView();
  return (
    <header className="topbar">
      <div className="brand">
        <span className="wordmark">ELEVEN</span>
        <span className="room">방 {room?.code}</span>
        {subtitle && <span className="tag">{subtitle}</span>}
      </div>
      <div className="status">
        <span className="week">{view.week}주차</span>
        <span className="phase">{phaseLabel(view.phase.kind)}{view.phase.kind === 'weekday' && ` · ${DAY_LABEL[view.phase.day]}`}</span>
      </div>
      <div className="conn">
        {session && <NotifyToggles />}
        <span className={`dot ${connected ? 'on' : 'off'}`} />
        {connected ? '연결됨' : '재연결 중'}
        <button className="link" onClick={leave}>나가기</button>
      </div>
    </header>
  );
}

// 단계별 참가자 대기 상태 (사이드바 점)
function playerStatus(view: ReturnType<typeof useView>['view'], pid: PlayerId): 'acting' | 'waiting' | 'done' | null {
  const phase = view.phase;
  switch (phase.kind) {
    case 'setup.draft':
      return phase.picked[pid] ? 'done' : 'acting';
    case 'setup.objective':
      return phase.chosen[pid] ? 'done' : 'acting';
    case 'monday.board':
      return phase.meetings[pid]?.decided ? 'done' : phase.current === pid ? 'acting' : 'waiting';
    case 'weekday':
      return phase.current === pid ? 'acting' : 'waiting';
    case 'friday.prepare':
      return phase.submitted[pid] ? 'done' : phase.current === pid ? 'acting' : 'waiting';
    case 'friday.aftermath':
      return phase.matches[pid]?.decided ? 'done' : phase.current === pid ? 'acting' : 'waiting';
    default:
      return null;
  }
}

// 헤더 아래 참가자 띠: 자리 색·이름·자원(트랙)·리그 위치·승점·상태 점. 누르면 그 참가자의 개인 보드로
export function PlayerStrip() {
  const { view, session, room } = useView();
  const { selected, selectPlayer, mainTab } = useUi();
  return (
    <nav className="player-strip" aria-label="참가자">
      {view.seats.map((id) => {
        const p = view.players[id]!;
        const status = playerStatus(view, id);
        const isMe = session?.playerId === id;
        const isBot = room?.players.find((r) => r.id === id)?.isBot;
        return (
          <button
            key={id}
            className={`pseat${selected === id && mainTab === 'personal' ? ' selected' : ''}${status === 'acting' ? ' acting' : ''}`}
            style={{ '--seat': seatColor(view, id) } as React.CSSProperties}
            onClick={() => selectPlayer(id)}
            title={`${p.name}의 개인 보드 보기`}
          >
            <span className="seat-bar" />
            <span className="pseat-main">
              <span className="seat-name">
                {p.name}
                {isMe && <span className="tag me">나</span>}
                {isBot && <span className="tag">AI</span>}
                {view.firstPlayer === id && <span className="tag first">선</span>}
                {status && <span className={`seat-status ${status}`} title={{ acting: '행동 중', waiting: '대기', done: '완료' }[status]} />}
              </span>
              <span className="seat-res">
                {RESOURCES.map((r) => (
                  <span key={r} className={`res ${r}`} title={`${r} ${p.resources[r]} (트랙 ${p.tracks[r]})`}>
                    <Icon name={r} size={12} />{p.resources[r]}<small>{p.tracks[r]}</small>
                  </span>
                ))}
                <span className="res sub" title="리그 성적표 위치"><Icon name="goal" size={12} />{view.league.players[id]}</span>
                <span className="res sub" title="승점 토큰"><Icon name="vp" size={12} />{p.vp}</span>
                <span className="res sub" title="선수 수 · 직원 수">선수 {p.roster.length} · 직원 {p.staff.length}</span>
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// 이적 시장: 선수/직원/스폰서 탭. 내 주중 차례면 오른쪽 3장을 눌러 고르고, 아래 확정 막대에서 확정한다. 스폰서는 계약 유형 모달을 거친다
export function MarketBody() {
  const { view, session, act } = useView();
  const { chosen, select } = useCommit();
  const { marketTab, setMarketTab } = useUi();
  const [sponsorPick, setSponsorPick] = useState<number | null>(null);
  const me = session ? view.players[session.playerId] : undefined;
  const canBuy = !!me && view.phase.kind === 'weekday' && view.phase.current === me.id && !view.phase.basicDone;
  const render: Record<MarketTab, (id: string, i: number) => React.ReactNode> = {
    players: (id, i) => (
      <PlayerCardView
        key={id}
        cardId={id}
        chosen={chosen === `market:${id}`}
        onClick={canBuy && i >= 2 ? () => select(`market:${id}`, { type: 'recruitPlayer', marketIndex: i }, <>선수 영입: <b>{cards.player(id).name}</b> <CostChips cost={{ money: cards.player(id).untrained.cost }} /></>) : undefined}
      />
    ),
    staff: (id, i) => (
      <StaffCardView
        key={id}
        cardId={id}
        chosen={chosen === `market:${id}`}
        onClick={canBuy && i >= 2 ? () => select(`market:${id}`, { type: 'hireStaff', marketIndex: i }, <>직원 고용: <b>{cards.staff(id).name}</b> <CostChips cost={{ money: cards.staff(id).cost }} /></>) : undefined}
      />
    ),
    sponsors: (id, i) => <SponsorCardView key={id} cardId={id} onClick={canBuy && i >= 2 ? () => setSponsorPick(i) : undefined} />,
  };
  const sponsorCardId = sponsorPick !== null ? view.market.sponsors[sponsorPick] : undefined;
  return (
    <>
      <Tabs<MarketTab>
        tabs={[
          { key: 'players', label: '선수', badge: `유망주 더미 ${view.deckCounts.prospects}` },
          { key: 'staff', label: '직원', badge: view.deckCounts.staff },
          { key: 'sponsors', label: '스폰서', badge: view.deckCounts.sponsors },
        ]}
        value={marketTab}
        onChange={setMarketTab}
      />
      <p className="muted small market-hint">오른쪽 3장만 구매 가능 · 왼쪽 2장은 다음 주에 오른쪽으로 밀립니다{canBuy ? ' · 카드를 눌러 고르고 아래에서 확정' : ''}</p>
      <div className="cards market-row">{view.market[marketTab].map((id, i) => render[marketTab](id, i))}</div>
      {sponsorPick !== null && sponsorCardId && me && (
        <SponsorContractModal
          cardId={sponsorCardId}
          me={me}
          onClose={() => setSponsorPick(null)}
          onSign={(c) => {
            act({ type: 'signSponsor', marketIndex: sponsorPick, contract: c.contract, billboardChoice: c.billboardChoice });
            setSponsorPick(null);
          }}
        />
      )}
    </>
  );
}

export function LeagueBody() {
  const { view } = useView();
  const entries = [
    ...view.seats.map((id) => ({ id, name: view.players[id]!.name, position: view.league.players[id]!, active: true })),
    ...view.league.opponents.map((o) => ({ id: undefined, name: cards.opponent(`op-${o.teamId}-3a`).teamName, position: o.position, active: o.active })),
  ].sort((a, b) => b.position - a.position);
  const max = Math.max(1, ...entries.map((e) => e.position));
  return (
    <ol className="league">
      {entries.map((e, i) => (
        <li key={i} className={`${e.id ? 'mine' : ''}${e.active ? '' : ' inactive'}`} style={e.id ? ({ '--seat': seatColor(view, e.id) } as React.CSSProperties) : undefined}>
          <span className="rank">{i + 1}</span>
          <span className="team">{e.id && <span className="seat-dot" />}{e.name}</span>
          <span className="bar"><span style={{ width: `${(e.position / max) * 100}%` }} /></span>
          <span className="pos">{e.position}</span>
        </li>
      ))}
    </ol>
  );
}

// 공개 행동 기록: 주차·요일별로 묶고 행위자를 자리 색으로 표시
export function ActionLog() {
  const { view } = useView();
  const groups: { key: string; week: number; day: LogEntry['day']; entries: LogEntry[] }[] = [];
  for (const entry of view.log) {
    const key = `${entry.week}-${entry.day}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, week: entry.week, day: entry.day, entries: [entry] });
  }
  return (
    <aside className="logbar" aria-label="기록">
      <div className="panel-head"><h2>기록</h2></div>
      <div className="log-scroll">
        {[...groups].reverse().map((g) => (
          <section key={g.key} className="log-group">
            <h3>{g.day === 'setup' ? '준비' : `${g.week}주차 ${DAY_LABEL[g.day]}`}</h3>
            {[...g.entries].reverse().map((e) => (
              <div key={e.id} className="log-entry" style={e.actor ? ({ '--seat': seatColor(view, e.actor) } as React.CSSProperties) : undefined}>
                {e.actor ? <span className="seat-dot" /> : <span className="seat-dot neutral" />}
                <span className="log-actor">{e.actor ? view.players[e.actor]?.name : ''}</span>
                <span className="log-text">{e.text}</span>
              </div>
            ))}
          </section>
        ))}
        {view.log.length === 0 && <p className="muted small">아직 기록이 없습니다.</p>}
      </div>
    </aside>
  );
}

// 효과 대상 선택 모달: 선수를 눌러 고르고 확정. 취소는 선택만 지운다(대상 선택 자체는 건너뛸 수 없다)
export function PendingModal() {
  const { view, session, act } = useStore();
  const [pick, setPick] = useState<string | null>(null);
  const me = view && session ? view.players[session.playerId] : undefined;
  const pending = me?.pending[0];
  if (!me || !pending) return null;
  const picked = pick && pending.candidates.includes(pick) ? pick : null;
  const pickedName = picked ? cards.player(me.roster.find((r) => r.instanceId === picked)?.cardId ?? '').name : null;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="대상 선택">
        <h2>대상 선택 — {pending.source}</h2>
        <p className="muted small">
          {pending.effect.type === 'addPlayerToken' || pending.effect.type === 'removePlayerToken'
            ? `${TOKEN_LABEL[pending.effect.token]} ${pending.effect.count}개를 받을 선수를 고르세요`
            : pending.effect.type === 'trainPlayer'
              ? '훈련할 선수를 고르세요'
              : '대상 선수를 고르세요'}
        </p>
        <div className="cards">
          {pending.candidates.map((instanceId) => {
            const inst = me.roster.find((r) => r.instanceId === instanceId);
            return inst ? <PlayerCardView key={instanceId} cardId={inst.cardId} instance={inst} chosen={picked === instanceId} onClick={() => setPick((p) => (p === instanceId ? null : instanceId))} /> : null;
          })}
        </div>
        <div className="modal-actions">
          {view?.phase.kind === 'weekday' && view.phase.canUndo && (
            <button className="link" onClick={() => act({ type: 'undoTurn' })} title="이번 차례의 행동을 모두 무르고 차례 처음으로 되돌립니다">
              차례 처음으로 되돌리기
            </button>
          )}
          <button className="ghost" disabled={!picked} onClick={() => setPick(null)}>취소</button>
          <button
            className="primary"
            disabled={!picked}
            onClick={() => {
              if (!picked) return;
              act({ type: 'resolvePending', pendingId: pending.id, instanceId: picked });
              setPick(null);
            }}
          >
            {pickedName ? `${pickedName}에게 적용` : '선수를 고르세요'}
          </button>
        </div>
      </div>
    </div>
  );
}
