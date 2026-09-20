import { useEffect, useRef, useState } from 'react';
import { cards, instanceName } from '@server/engine/cards';
import type { LogEntry, PlayerId } from '@server/engine/state';
import { RESOURCES } from '@server/engine/types';
import { hireCost, marketMinIndex, prospectCost } from '@server/engine/traits';
import { useCommit } from '../commit';
import { DeviceToggle, useDevice } from '../device';
import { DAY_LABEL, RESOURCE_LABEL, SEAT_COLORS, TOKEN_LABEL, phaseLabel } from '../labels';
import { NotifyToggles } from '../notify';
import { useStore, useView } from '../store';
import { useUi } from '../ui';
import type { MarketTab } from '../ui';
import { PlayerCardView, SponsorCardView, StaffCardView } from './Cards';
import { CostChips, Icon, TrackGlyph } from './Icons';
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
      <div className="status" title={`${view.week}주차 · ${phaseLabel(view.phase.kind)}`}>
        <span className="week">{view.week}주차</span>
        <span className="phase">{phaseLabel(view.phase.kind)}{view.phase.kind === 'weekday' && ` · ${DAY_LABEL[view.phase.day]}`}</span>
      </div>
      <div className="conn">
        {session && <NotifyToggles />}
        <DeviceToggle />
        <span className={`dot ${connected ? 'on' : 'off'}`} title={connected ? '연결됨' : '재연결 중'} />
        <span className="conn-text">{connected ? '연결됨' : '재연결 중'}</span>
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

// 자원마다 두 칸 알약: 왼쪽(색 채움) = 지금 보유한 자원, 오른쪽(흰 바탕·테두리·계단 그림) = 능력치 트랙 위치(월요일 조달 기준).
// 효과 칩의 자원 칩/트랙 칩과 같은 시각 언어
function SeatResources({ id, counts = true }: { id: PlayerId; counts?: boolean }) {
  const { view } = useView();
  const p = view.players[id]!;
  return (
    <span className="seat-res">
      {RESOURCES.map((r) => (
        <span key={r} className={`res-pill ${r}`} title={`${RESOURCE_LABEL[r]}: 보유 ${p.resources[r]}개 · 트랙 ${p.tracks[r]}칸 (월요일 조달 기준)`}>
          <span className="held"><Icon name={r} size={14} />{p.resources[r]}</span>
          <span className="track"><TrackGlyph up={false} size={14} />{p.tracks[r]}</span>
        </span>
      ))}
      <span className="res sub" title="리그 성적표 위치"><Icon name="goal" size={14} />{view.league.players[id]}</span>
      <span className="res sub" title="승점 토큰"><Icon name="vp" size={14} />{p.vp}</span>
      {counts && <span className="res sub" title="선수 수 · 직원 수">선수 {p.roster.length} · 직원 {p.staff.length}</span>}
    </span>
  );
}

// 헤더 아래 참가자 띠: 자리 색·이름·자원(트랙)·리그 위치·승점·상태 점. 누르면 그 참가자의 개인 보드로.
// compact(모바일용): 참가자는 이름 알약 한 줄로 줄이고, 그 아래에 내 자원(관전자는 고른 참가자) 한 줄만 둔다
export function PlayerStrip({ compact = false }: { compact?: boolean }) {
  const { view, session, room } = useView();
  const { selected, selectPlayer, mainTab, mobileTab } = useUi();
  const showing = compact ? mobileTab === 'board' : mainTab === 'personal';
  const seats = view.seats.map((id) => {
    const p = view.players[id]!;
    const status = playerStatus(view, id);
    const isMe = session?.playerId === id;
    const isBot = room?.players.find((r) => r.id === id)?.isBot;
    return (
      <button
        key={id}
        className={`${compact ? 'seat-chip' : 'pseat'}${selected === id && showing ? ' selected' : ''}${status === 'acting' ? ' acting' : ''}`}
        style={{ '--seat': seatColor(view, id) } as React.CSSProperties}
        onClick={() => selectPlayer(id)}
        title={`${p.name}의 개인 보드 보기`}
      >
        {!compact && <span className="seat-bar" />}
        <span className="pseat-main">
          <span className="seat-name">
            {p.name}
            {isMe && <span className="tag me">나</span>}
            {isBot && <span className="tag">AI</span>}
            {view.firstPlayer === id && <span className="tag first">선</span>}
            {status && <span className={`seat-status ${status}`} title={{ acting: '행동 중', waiting: '대기', done: '완료' }[status]} />}
          </span>
          {!compact && <SeatResources id={id} />}
        </span>
      </button>
    );
  });
  if (!compact) return <nav className="player-strip" aria-label="참가자">{seats}</nav>;
  const resId = session && view.players[session.playerId] ? session.playerId : view.players[selected] ? selected : view.seats[0]!;
  return (
    <nav className="player-strip compact" aria-label="참가자">
      <div className="seat-chips">{seats}</div>
      <div className="my-res" style={{ '--seat': seatColor(view, resId) } as React.CSSProperties}>
        <span className="my-res-name"><span className="seat-dot" />{session ? '내 자원' : view.players[resId]!.name}</span>
        <SeatResources id={resId} counts={false} />
      </div>
    </nav>
  );
}

// 이적 시장: 주전/베테랑/유망주/직원/스폰서 탭. 내 주중 차례면 오른쪽 3장을 눌러 고르고, 아래 확정 막대에서 확정한다. 스폰서는 계약 유형 모달을 거친다.
// 유망주는 행이 없고 더미 맨 위 카드의 미훈련 면(공격/수비·비용 1)만 보인다 — 훈련 면은 영입해야 공개
export function MarketBody() {
  const { view, session, act } = useView();
  const { chosen, select } = useCommit();
  const { marketTab, setMarketTab } = useUi();
  const { mobile } = useDevice();
  const [sponsorPick, setSponsorPick] = useState<number | null>(null);
  // 모바일용: 시장 행은 옆으로 미는 한 줄이라, 살 수 있는 오른쪽 3장이 먼저 보이게 오른쪽 끝으로 밀어 둔다
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mobile && rowRef.current) rowRef.current.scrollLeft = rowRef.current.scrollWidth;
  }, [mobile, marketTab]);
  const me = session ? view.players[session.playerId] : undefined;
  const canBuy = !!me && view.phase.kind === 'weekday' && view.phase.current === me.id && !view.phase.basicDone;
  const playerRow = (row: 'players' | 'veterans') => (id: string, i: number) => (
    <PlayerCardView
      key={id}
      cardId={id}
      chosen={chosen === `market:${id}`}
      onClick={
        canBuy && me && i >= marketMinIndex(me, 'players')
          ? () => select(`market:${id}`, { type: 'recruitPlayer', marketIndex: i, row }, <>{row === 'veterans' ? '베테랑' : '주전 선수'} 영입: <b>{cards.player(id).name}</b> <CostChips cost={{ money: cards.player(id).untrained.cost }} /></>)
          : undefined
      }
    />
  );
  const render: Record<Exclude<MarketTab, 'prospects'>, (id: string, i: number) => React.ReactNode> = {
    players: playerRow('players'),
    veterans: playerRow('veterans'),
    staff: (id, i) => (
      <StaffCardView
        key={id}
        cardId={id}
        chosen={chosen === `market:${id}`}
        onClick={canBuy && me && i >= 2 ? () => select(`market:${id}`, { type: 'hireStaff', marketIndex: i }, <>직원 고용: <b>{cards.staff(id).name}</b> <CostChips cost={{ money: hireCost(me, cards.staff(id).cost) }} /></>) : undefined}
      />
    ),
    sponsors: (id, i) => <SponsorCardView key={id} cardId={id} onClick={canBuy && me && i >= marketMinIndex(me, 'sponsors') ? () => setSponsorPick(i) : undefined} />,
  };
  const sponsorCardId = sponsorPick !== null ? view.market.sponsors[sponsorPick] : undefined;
  const prospect = view.nextProspect;
  const prospectPrice = me && prospect ? prospectCost(me, cards.player(prospect).untrained.cost) : 0;
  return (
    <>
      <Tabs<MarketTab>
        tabs={[
          { key: 'players', label: '주전', badge: view.deckCounts.starters },
          { key: 'veterans', label: '베테랑', badge: view.deckCounts.veterans },
          { key: 'prospects', label: '유망주', badge: `더미 ${view.deckCounts.prospects}` },
          { key: 'staff', label: '직원', badge: view.deckCounts.staff },
          { key: 'sponsors', label: '스폰서', badge: view.deckCounts.sponsors },
        ]}
        value={marketTab}
        onChange={setMarketTab}
      />
      {marketTab === 'prospects' ? (
        <>
          <p className="muted small market-hint">유망주 더미 맨 위 카드 · 미훈련 면(공격/수비·비용)만 보이고 훈련 면은 영입 후에 공개됩니다{canBuy && prospect ? ' · 카드를 눌러 고르고 아래에서 확정' : ''}</p>
          <div className="cards prospect-deck">
            {prospect ? (
              <PlayerCardView
                cardId={prospect}
                chosen={chosen === 'prospect'}
                onClick={canBuy && me ? () => select('prospect', { type: 'recruitProspect' }, <>유망주 영입 ({cards.player(prospect).untrained.role === 'attack' ? '공격' : '수비'}) <CostChips cost={{ money: prospectPrice }} /></>) : undefined}
              />
            ) : (
              <span className="muted small">유망주 더미가 비었습니다</span>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="muted small market-hint">오른쪽 3장만 구매 가능 · 왼쪽 2장은 다음 주에 오른쪽으로 밀립니다{canBuy ? ' · 카드를 눌러 고르고 아래에서 확정' : ''}</p>
          <div className="cards market-row" ref={rowRef}>{view.market[marketTab].map((id, i) => render[marketTab](id, i))}</div>
        </>
      )}
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
  if (!me || !pending || !view) return null;
  const picked = pick && pending.candidates.includes(pick) ? pick : null;
  const target = pending.target;
  const row = pending.row ?? 'players';
  const nameOf = (c: string): string => {
    if (target === 'staff') return cards.staff(me.staff[Number(c)]?.cardId ?? '').name;
    if (target === 'market') {
      const id = view.market[row][Number(c)] ?? '';
      return row === 'players' || row === 'veterans' ? cards.player(id).name : row === 'staff' ? cards.staff(id).name : cards.sponsor(id).name;
    }
    if (target === 'token') return `토큰 ${me.uniforms.find((u) => u.id === c)?.number ?? '∅'}`;
    const inst = me.roster.find((r) => r.instanceId === c);
    return inst ? instanceName(inst) : ''; // 훈련 전 유망주는 '유망주'
  };
  const pickedName = picked ? nameOf(picked) : null;
  const e = pending.effect;
  const prompt =
    e.type === 'addPlayerToken'
      ? `${TOKEN_LABEL[e.token]} ${e.count}개를 받을 선수를 고르세요`
      : e.type === 'removePlayerToken'
        ? `${TOKEN_LABEL[e.token]} ${e.count}개를 제거할 선수를 고르세요`
        : e.type === 'trainPlayer'
          ? '훈련할 선수를 고르세요'
          : e.type === 'placeStamina'
            ? `체력 ${e.count}개를 올려놓을 선수를 고르세요`
            : e.type === 'releasePlayer'
              ? '방출할 선수를 고르세요 (방출 행동과 같은 보상)'
              : e.type === 'addStaffSuspension'
                ? `출장정지 ${e.count}개를 받을 직원 카드를 고르세요`
                : e.type === 'discardMarketCard'
                  ? '버릴 이적 시장 카드를 고르세요 (남은 카드는 오른쪽으로 밀리고 왼쪽이 보충됩니다)'
                  : e.type === 'flipUnmatchedToken'
                    ? '뒤집을 유니폼 토큰을 고르세요 (카드 없는 필드 토큰, 공격↔수비)'
                    : '대상을 고르세요';
  const toggle = (c: string) => setPick((p) => (p === c ? null : c));
  const candidate = (c: string) => {
    if (target === 'staff') {
      const s = me.staff[Number(c)];
      return s ? <StaffCardView key={c} cardId={s.cardId} exhausted={s.exhausted} suspension={s.suspension} chosen={picked === c} onClick={() => toggle(c)} /> : null;
    }
    if (target === 'market') {
      const id = view.market[row][Number(c)];
      if (!id) return null;
      if (row === 'players' || row === 'veterans') return <PlayerCardView key={c} cardId={id} chosen={picked === c} onClick={() => toggle(c)} />;
      if (row === 'staff') return <StaffCardView key={c} cardId={id} chosen={picked === c} onClick={() => toggle(c)} />;
      return <SponsorCardView key={c} cardId={id} chosen={picked === c} onClick={() => toggle(c)} />;
    }
    if (target === 'token') {
      const u = me.uniforms.find((x) => x.id === c);
      return u ? (
        <button key={c} type="button" className={`utoken pick ${u.face}${picked === c ? ' chosen' : ''}`} onClick={() => toggle(c)} title={u.face === 'attack' ? '공격 → 수비' : '수비 → 공격'}>
          <Icon name={u.face} size={11} />{u.number ?? '∅'}
        </button>
      ) : null;
    }
    const inst = me.roster.find((r) => r.instanceId === c);
    return inst ? <PlayerCardView key={c} cardId={inst.cardId} instance={inst} chosen={picked === c} onClick={() => toggle(c)} /> : null;
  };
  const confirmLabel = !pickedName ? '대상을 고르세요' : target === 'market' ? `${pickedName} 버리기` : target === 'token' ? `${pickedName} 뒤집기` : `${pickedName}에게 적용`;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="대상 선택">
        <h2>대상 선택 — {pending.source}{me.pending.length > 1 ? ` (${me.pending.length}번 남음)` : ''}</h2>
        <p className="muted small">{prompt}</p>
        <div className={target === 'token' ? 'row' : 'cards'}>{pending.candidates.map(candidate)}</div>
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
              act({ type: 'resolvePending', pendingId: pending.id, choice: picked });
              setPick(null);
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
