import { useState } from 'react';
import { cards } from '@server/engine/cards';
import type { LogEntry, PlayerId } from '@server/engine/state';
import { RESOURCES } from '@server/engine/types';
import type { SponsorContract } from '@server/engine/types';
import { billboardLimit } from '@server/engine/weekday';
import { CONTRACT_LABEL, DAY_LABEL, SEAT_COLORS, TOKEN_LABEL, phaseLabel } from '../labels';
import { useStore, useView } from '../store';
import { PlayerCardView, SponsorCardView, StaffCardView } from './Cards';
import { Icon } from './Icons';

export function seatColor(view: { seats: PlayerId[] }, pid: PlayerId): string {
  return SEAT_COLORS[view.seats.indexOf(pid)] ?? '#64748B';
}

export function Header({ subtitle }: { subtitle?: string }) {
  const { view, room, connected, leave } = useView();
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
      return phase.meetings[pid]?.decided ? 'done' : 'acting';
    case 'weekday':
      return phase.current === pid ? 'acting' : 'waiting';
    case 'friday.prepare':
      return phase.submitted[pid] ? 'done' : 'acting';
    case 'friday.aftermath':
      return phase.matches[pid]?.decided ? 'done' : 'acting';
    default:
      return null;
  }
}

export function Sidebar({ selected, onSelect }: { selected: PlayerId; onSelect: (pid: PlayerId) => void }) {
  const { view, session, room } = useView();
  return (
    <nav className="sidebar" aria-label="참가자">
      {view.seats.map((id) => {
        const p = view.players[id]!;
        const status = playerStatus(view, id);
        const isMe = session?.playerId === id;
        const isBot = room?.players.find((r) => r.id === id)?.isBot;
        return (
          <button key={id} className={`seat${selected === id ? ' selected' : ''}`} style={{ '--seat': seatColor(view, id) } as React.CSSProperties} onClick={() => onSelect(id)}>
            <span className="seat-bar" />
            <span className="seat-main">
              <span className="seat-name">
                {p.name}
                {isMe && <span className="tag me">나</span>}
                {isBot && <span className="tag">AI</span>}
                {view.firstPlayer === id && <span className="tag first">선</span>}
              </span>
              <span className="seat-res">
                {RESOURCES.map((r) => (
                  <span key={r} className={`res ${r}`} title={`${r} ${p.resources[r]} (트랙 ${p.tracks[r]})`}>
                    <Icon name={r} size={12} />{p.resources[r]}<small>{p.tracks[r]}</small>
                  </span>
                ))}
              </span>
              <span className="seat-sub">
                <span title="리그 성적표 위치"><Icon name="goal" size={12} />{view.league.players[id]}</span>
                <span title="승점 토큰"><Icon name="vp" size={12} />{p.vp}</span>
                <span>선수 {p.roster.length}</span>
                <span>직원 {p.staff.length}</span>
              </span>
            </span>
            {status && <span className={`seat-status ${status}`} title={{ acting: '행동 중', waiting: '대기', done: '완료' }[status]} />}
          </button>
        );
      })}
    </nav>
  );
}

// 이적 시장: 내 주중 차례면 오른쪽 3장을 클릭해 영입/고용/계약
export function MarketPanel() {
  const { view, session, act } = useStore() as ReturnType<typeof useStore> & { view: NonNullable<ReturnType<typeof useStore>['view']> };
  const [sponsorPick, setSponsorPick] = useState<number | null>(null);
  if (!view) return null;
  const me = session ? view.players[session.playerId] : undefined;
  const canBuy = !!me && view.phase.kind === 'weekday' && view.phase.current === me.id && !view.phase.basicDone;
  const rows = [
    ['players', '선수', (id: string, i: number) => <PlayerCardView key={id} cardId={id} onClick={canBuy && i >= 2 ? () => act({ type: 'recruitPlayer', marketIndex: i }) : undefined} />],
    ['staff', '직원', (id: string, i: number) => <StaffCardView key={id} cardId={id} onClick={canBuy && i >= 2 ? () => act({ type: 'hireStaff', marketIndex: i }) : undefined} />],
    ['sponsors', '스폰서', (id: string, i: number) => <SponsorCardView key={id} cardId={id} onClick={canBuy && i >= 2 ? () => setSponsorPick(i) : undefined} />],
  ] as const;
  const sign = (contract: SponsorContract, billboardChoice?: 'effect' | 'bonus') => {
    if (sponsorPick === null) return;
    act({ type: 'signSponsor', marketIndex: sponsorPick, contract, billboardChoice });
    setSponsorPick(null);
  };
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>이적 시장</h2>
        <span className="muted small">오른쪽 3장만 구매 가능 · 유망주 더미 {view.deckCounts.prospects}장{canBuy && ' · 카드를 눌러 구매'}</span>
      </div>
      {rows.map(([key, label, render]) => (
        <div key={key} className="market-row-wrap">
          <h3>{label}</h3>
          <div className="cards market-row">{view.market[key].map((id, i) => render(id, i))}</div>
        </div>
      ))}
      {sponsorPick !== null && view.market.sponsors[sponsorPick] && me && (
        <div className="modal-backdrop" onClick={() => setSponsorPick(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>계약 유형</h2>
            <SponsorCardView cardId={view.market.sponsors[sponsorPick]!} />
            <div className="row wrap">
              <button onClick={() => sign('kit')}>{CONTRACT_LABEL.kit} — 즉시 효과 후 버림</button>
              <button disabled={me.sponsors.billboards.length >= billboardLimit(me)} onClick={() => sign('billboard', 'effect')}>{CONTRACT_LABEL.billboard} — 카드 효과</button>
              <button disabled={me.sponsors.billboards.length >= billboardLimit(me)} onClick={() => sign('billboard', 'bonus')}>{CONTRACT_LABEL.billboard} — 추가 보너스</button>
              <button disabled={!!me.sponsors.naming} onClick={() => sign('naming')}>{CONTRACT_LABEL.naming} — 효과 + 보너스</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function LeaguePanel() {
  const { view } = useView();
  const entries = [
    ...view.seats.map((id) => ({ id, name: view.players[id]!.name, position: view.league.players[id]!, active: true })),
    ...view.league.opponents.map((o) => ({ id: undefined, name: cards.opponent(`op-${o.teamId}-3a`).teamName, position: o.position, active: o.active })),
  ].sort((a, b) => b.position - a.position);
  const max = Math.max(1, ...entries.map((e) => e.position));
  return (
    <section className="panel">
      <div className="panel-head"><h2>리그 성적표</h2></div>
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
    </section>
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

export function PendingModal() {
  const { view, session, act } = useStore();
  const me = view && session ? view.players[session.playerId] : undefined;
  const pending = me?.pending[0];
  if (!me || !pending) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal">
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
            return inst ? (
              <PlayerCardView key={instanceId} cardId={inst.cardId} instance={inst} onClick={() => act({ type: 'resolvePending', pendingId: pending.id, instanceId })} />
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
}
