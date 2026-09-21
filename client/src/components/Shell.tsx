import { useEffect, useRef, useState } from 'react';
import { cards, instanceName } from '@server/engine/cards';
import type { LogEntry, PlayerId } from '@server/engine/state';
import { LEAGUE_MAX } from '@server/engine/friday';
import { leagueRankPoints } from '@server/engine/scoring';
import { RESOURCES, TRACK_MAX } from '@server/engine/types';
import { hireCost, marketMinIndex, prospectCost } from '@server/engine/traits';
import { WEEKS } from '@server/engine/weekend';
import { useCommit } from '../commit';
import { DeviceToggle, useDevice } from '../device';
import { DAY_LABEL, RESOURCE_LABEL, SEAT_COLORS, TOKEN_LABEL, phaseLabel } from '../labels';
import { NotifyToggles } from '../notify';
import { useStore, useView } from '../store';
import { useUi } from '../ui';
import type { MarketTab } from '../ui';
import { PlayerCardView, SponsorCardView, StaffCardView } from './Cards';
import { ChatBody, unreadCount } from './Chat';
import { Crest, PlayerCrest } from './Crest';
import { CostChips, Icon } from './Icons';
import { UpkeepChip } from './Upkeep';
import { SponsorContractModal } from './Sponsor';
import { Tabs } from './Tabs';

export function seatColor(view: { seats: PlayerId[] }, pid: PlayerId): string {
  return SEAT_COLORS[view.seats.indexOf(pid)] ?? '#64748B';
}

// 리그 등수: 같은 칸은 같은 등수 (p.26) — 상대 팀(비활성 포함) 전체와 비교
export function leagueRankOf(view: { league: { players: Record<PlayerId, number>; opponents: { position: number }[] } }, pid: PlayerId): number {
  const mine = view.league.players[pid] ?? 0;
  return 1 + [...Object.values(view.league.players), ...view.league.opponents.map((o) => o.position)].filter((x) => x > mine).length;
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
      <div className={`status${view.week >= WEEKS ? ' last-week' : ''}`} title={`${view.week}/${WEEKS}주차${view.week >= WEEKS ? ' · 마지막 주 (주말 유지비 없이 게임 종료)' : ''} · ${phaseLabel(view.phase.kind)}`}>
        <span className="week">
          {view.week}<span className="week-total">/{WEEKS}</span>주
          {view.week >= WEEKS && <span className="week-last">마지막 주</span>}
        </span>
        <span className="week-dots" aria-hidden="true">
          {Array.from({ length: WEEKS }, (_, i) => <i key={i} className={i + 1 < view.week ? 'past' : i + 1 === view.week ? 'now' : ''} />)}
        </span>
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

// 자원 칸: 위 = 지금 보유한 자원(큰 숫자), 아래 = 능력치 트랙 위치를 5칸 눈금으로 (월요일 조달 기준)
function SeatStats({ id }: { id: PlayerId }) {
  const { view } = useView();
  const p = view.players[id]!;
  return (
    <span className="pseat-stats">
      {RESOURCES.map((r) => (
        <span key={r} className={`stat ${r}`} title={`${RESOURCE_LABEL[r]}: 보유 ${p.resources[r]}개 · 트랙 ${p.tracks[r]}칸 (월요일마다 +${p.tracks[r]})`}>
          <span className="stat-top"><Icon name={r} size={14} /><b>{p.resources[r]}</b></span>
          <span className="pips" aria-hidden="true">
            {Array.from({ length: TRACK_MAX }, (_, i) => <i key={i} className={i < p.tracks[r] ? 'on' : ''} />)}
          </span>
        </span>
      ))}
    </span>
  );
}

// 헤더 아래 참가자 띠: 자리 색·이름·자원(트랙)·유지비·리그 위치·승점·상태 점. 누르면 그 참가자의 개인 보드로.
// PC용·모바일용이 같은 모양이다(사용자 요청 2026-09). 좁은 화면에서는 옆으로 밀리므로 처음에 내 자리가 보이게 맞춰 둔다
export function PlayerStrip() {
  const { view, session, room } = useView();
  const { selected, selectPlayer, mainTab, mobileTab } = useUi();
  const { mobile } = useDevice();
  const showing = mobile ? mobileTab === 'board' : mainTab === 'personal';
  const mine = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = mine.current;
    if (el?.parentElement) el.parentElement.scrollLeft = el.offsetLeft - 8; // 띠가 sticky 라 offsetLeft 는 띠 기준
  }, []);
  // 띠 높이가 내용에 따라 달라지므로(유지비 경고 등) 스티키 오프셋(--head-h)을 실제 높이로 맞춘다
  const strip = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = strip.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const sync = () => document.documentElement.style.setProperty('--head-h', `${48 + el.offsetHeight}px`);
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    return () => ro.disconnect();
  }, []);
  const STATUS_LABEL = { acting: '행동 중', waiting: '대기', done: '완료' } as const;
  const seats = view.seats.map((id) => {
    const p = view.players[id]!;
    const status = playerStatus(view, id);
    const isMe = session?.playerId === id;
    const isBot = room?.players.find((r) => r.id === id)?.isBot;
    return (
      <button
        key={id}
        ref={isMe ? mine : undefined}
        className={`pseat${selected === id && showing ? ' selected' : ''}${status === 'acting' ? ' acting' : ''}`}
        style={{ '--seat': seatColor(view, id) } as React.CSSProperties}
        onClick={() => selectPlayer(id)}
        title={`${p.name}의 개인 보드 보기`}
      >
        <span className="pseat-head">
          <PlayerCrest id={id} name={p.name} color={seatColor(view, id)} size={30} />
          <span className="pseat-id">
            <span className="seat-name">
              <span className="seat-name-text">{p.name}</span>
              {isMe && <span className="tag me">나</span>}
              {isBot && <span className="tag">AI</span>}
              {view.firstPlayer === id && <span className="tag first" title="선 참가자">선</span>}
            </span>
            <span className="pseat-meta">
              <span title="리그 등수 · 리그 성적표 위치">리그 <b>{leagueRankOf(view, id)}위</b> ({view.league.players[id]}칸)</span>
              <span title="승점 토큰"><Icon name="vp" size={12} />{p.vp}</span>
              <span title="선수 수 · 직원 수">선수 {p.roster.length} · 직원 {p.staff.length}</span>
            </span>
          </span>
          {status && <span className={`seat-state ${status}`}>{STATUS_LABEL[status]}</span>}
        </span>
        <span className="pseat-body">
          <SeatStats id={id} />
          <span className="seat-res"><UpkeepChip view={view} p={p} /></span>
        </span>
      </button>
    );
  });
  return <nav ref={strip} className="player-strip" aria-label="참가자">{seats}</nav>;
}

// 이적 시장: 주전/베테랑/유망주/직원/스폰서 탭. 내 주중 차례면 오른쪽 3장을 눌러 고르고, 아래 확정 막대에서 확정한다. 스폰서는 계약 유형 모달을 거친다.
// 유망주는 행이 없고 더미 맨 위 카드의 미훈련 면(공격/수비·비용 1)만 보인다 — 훈련 면은 영입해야 공개
export function MarketBody() {
  const { view, session, act } = useView();
  const { chosen, select } = useCommit();
  const { marketTab, setMarketTab } = useUi();
  const { mobile } = useDevice();
  const [sponsorPick, setSponsorPick] = useState<number | null>(null);
  // 모바일용: 시장 행은 옆으로 미는 한 줄. '지금 구매 가능' 구역이 앞에 있으므로 탭을 바꾸면 맨 앞으로 되돌린다
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mobile && rowRef.current) rowRef.current.scrollLeft = 0;
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
          <p className="muted small market-hint">주말마다 '지금 구매 가능'의 마지막 카드를 버리고, '다음 주에 열림' 카드가 넘어옵니다{canBuy ? ' · 카드를 눌러 고르고 아래에서 확정' : ''}</p>
          <div className="cards market-row" ref={rowRef}>
            {(() => {
              const row = view.market[marketTab];
              // 구매 가능한 첫 위치: 기본은 오른쪽 3장(2), 특성(시장 맨 왼쪽까지)이 있으면 0
              const from = marketTab === 'staff' ? 2 : me ? marketMinIndex(me, marketTab === 'sponsors' ? 'sponsors' : 'players') : 2;
              return (
                <>
                  <div className="market-zone open">
                    <span className="zone-label">지금 구매 가능</span>
                    <div className="zone-cards">{row.slice(from).map((id, i) => render[marketTab](id, i + from))}</div>
                  </div>
                  {from > 0 && (
                    <div className="market-zone locked">
                      <span className="zone-label">다음 주에 열림</span>
                      <div className="zone-cards">{row.slice(0, from).map((id, i) => render[marketTab](id, i))}</div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
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
  const { view, session } = useView();
  const entries = [
    ...view.seats.map((id) => ({ id, name: view.players[id]!.name, position: view.league.players[id]!, active: true })),
    ...view.league.opponents.map((o) => ({ id: undefined, name: cards.teamName(o.teamId), position: o.position, active: o.active })),
  ].sort((a, b) => b.position - a.position);
  const rankOf = (position: number) => 1 + entries.filter((e) => e.position > position).length; // 같은 칸은 같은 등수 (p.26)
  return (
    <div className="league-table" role="table" aria-label="리그 성적표">
      <div className="league-row head" role="row">
        <span role="columnheader">순위</span>
        <span role="columnheader">구단</span>
        <span role="columnheader" className="league-track-head">성적표 위치 <span className="muted">(승 +3 · 무 +1)</span></span>
        <span role="columnheader" className="num">칸</span>
        <span role="columnheader" className="num" title="지금 등수로 시즌이 끝나면 받는 승점 (p.26)">승점</span>
      </div>
      {entries.map((e, i) => {
        const rank = rankOf(e.position);
        const points = leagueRankPoints(rank);
        return (
          <div
            key={i}
            role="row"
            className={`league-row${e.id ? ' mine' : ''}${e.id && e.id === session?.playerId ? ' me' : ''}${e.active ? '' : ' inactive'}${rank === 1 ? ' top' : ''}`}
            style={e.id ? ({ '--seat': seatColor(view, e.id) } as React.CSSProperties) : undefined}
          >
            <span role="cell" className="rank">{rank}</span>
            <span role="cell" className="team">
              {e.id ? <PlayerCrest id={e.id} name={e.name} color={seatColor(view, e.id)} size={22} /> : <Crest name={e.name} size={22} />}
              <span className="team-name">{e.name}</span>
              {e.id && e.id === session?.playerId && <span className="tag me">나</span>}
              {!e.active && <span className="tag inactive-tag" title="이번 주에 참가자 2명 이상이 이 팀과 경기해서 마커가 비활성(검은색) 면입니다 (p.24). 다음에 아무도 이 팀을 상대하지 않는 주에는 주사위로 이동하는 대신 활성 면으로 돌아옵니다. 순위·승점 계산에는 그대로 포함됩니다.">비활성</span>}
            </span>
            <span role="cell" className="league-track" aria-hidden="true">
              <span className="league-fill" style={{ width: `${(Math.min(e.position, LEAGUE_MAX) / LEAGUE_MAX) * 100}%` }} />
            </span>
            <span role="cell" className="num pos">{e.position}</span>
            <span role="cell" className={`num pts${points < 0 ? ' minus' : ''}`}>{points > 0 ? `+${points}` : points}</span>
          </div>
        );
      })}
    </div>
  );
}

// 오른쪽 패널(모바일은 '기록' 탭): 공개 행동 기록 / 채팅. 기록은 주차·요일별로 묶고 행위자를 자리 색으로 표시.
// 채팅 탭을 보고 있으면 온 글을 읽은 것으로 치고, 아니면 탭에 안 읽은 수를 붙인다
export function ActionLog() {
  const { view, chat, session } = useView();
  const { sideTab, setSideTab, chatSeen, setChatSeen } = useUi();
  const lastChat = chat.at(-1)?.id ?? 0;
  useEffect(() => {
    if (sideTab === 'chat' && lastChat > chatSeen) setChatSeen(lastChat);
  }, [sideTab, lastChat, chatSeen, setChatSeen]);
  const unread = sideTab === 'chat' ? 0 : unreadCount(chat, chatSeen, session?.playerId);
  const groups: { key: string; week: number; day: LogEntry['day']; entries: LogEntry[] }[] = [];
  for (const entry of view.log) {
    const key = `${entry.week}-${entry.day}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, week: entry.week, day: entry.day, entries: [entry] });
  }
  return (
    <aside className="logbar" aria-label="기록">
      <div className="side-tabs" role="tablist">
        <button role="tab" aria-selected={sideTab === 'log'} className={sideTab === 'log' ? 'active' : ''} onClick={() => setSideTab('log')}>기록</button>
        <button role="tab" aria-selected={sideTab === 'chat'} className={sideTab === 'chat' ? 'active' : ''} onClick={() => setSideTab('chat')}>
          채팅{unread > 0 && <span className="badge-count" aria-label={`안 읽은 채팅 ${unread}개`}>{unread}</span>}
        </button>
      </div>
      {sideTab === 'chat' && <ChatBody colorOf={(pid) => seatColor(view, pid)} />}
      <div className="log-scroll" hidden={sideTab !== 'log'}>
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
                ? e.unsuspendedFirst
                  ? `유지비를 다 내지 못했습니다. 못 낸 1돈마다 직원 카드 1장에 출장정지 ${e.count}개를 놓습니다 — 받을 직원을 고르세요 (출장정지가 없는 직원이 있으면 그중에서). 출장정지된 직원은 행동·특성·세트 승점을 쓸 수 없고, 경기마다 1개씩 빠집니다.`
                  : `출장정지 ${e.count}개를 받을 직원 카드를 고르세요`
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
