import { cards } from '@server/engine/cards';
import type { PlayerPublicView } from '@server/engine/view';
import { RESOURCES } from '@server/engine/types';
import { INFRA_LABEL, RESOURCE_ICON, RESOURCE_LABEL, TOKEN_LABEL, phaseLabel } from '../labels';
import { useGame } from '../store';
import { PlayerCardView, SponsorCardView, StaffCardView } from './Cards';

export function Header() {
  const { view, room, connected, leave } = useGame();
  return (
    <header className="topbar">
      <div>
        <b>ELEVEN</b> · 방 {room?.code} · {view.week}주차 · {phaseLabel(view.phase.kind)}
        {view.phase.kind === 'weekday' && ` (${{ tue: '화', wed: '수', thu: '목' }[view.phase.day]}요일)`}
      </div>
      <div>
        <span className={`dot ${connected ? 'on' : 'off'}`} /> {connected ? '연결됨' : '재연결 중…'}
        <button className="link" onClick={leave}>나가기</button>
      </div>
    </header>
  );
}

export function PlayerSummary({ p, isMe }: { p: PlayerPublicView; isMe: boolean }) {
  const { view } = useGame();
  const name = view.players[p.id]?.name ?? p.id;
  return (
    <div className={`summary${isMe ? ' me' : ''}${view.firstPlayer === p.id ? ' first' : ''}`}>
      <div className="row">
        <b>{name}</b>
        {view.firstPlayer === p.id && <span className="badge">선</span>}
        <span className="muted small">리그 {view.league.players[p.id]}칸 · ⭐{p.vp}</span>
      </div>
      <div className="row small">
        {RESOURCES.map((r) => (
          <span key={r} title={RESOURCE_LABEL[r]}>{RESOURCE_ICON[r]}{p.resources[r]} <span className="muted">({p.tracks[r]})</span></span>
        ))}
      </div>
      <div className="muted small">
        선수 {p.roster.length} · 직원 {p.staff.length} · 시설 {p.infrastructure.length} · 사무실 {p.office} · 전술 {p.tacticCardCount}
      </div>
    </div>
  );
}

export function MyBoard() {
  const { view, me } = useGame();
  return (
    <section className="panel">
      <h3>내 구단</h3>
      <div className="muted small">
        시설: {me.infrastructure.length ? me.infrastructure.map((i) => INFRA_LABEL[i]).join(', ') : '없음'} · 사무실 {me.office}단계
        {me.sponsors.naming && ` · 명명권: ${cards.sponsor(me.sponsors.naming).name}`}
        {me.sponsors.billboards.length > 0 && ` · 광고판: ${me.sponsors.billboards.map((s) => cards.sponsor(s).name).join(', ')}`}
      </div>
      <h4>선수 ({me.roster.length})</h4>
      <div className="cards">
        {me.roster.map((r) => (
          <PlayerCardView key={r.instanceId} cardId={r.cardId} instance={r} />
        ))}
      </div>
      <h4>직원 · 임원</h4>
      <div className="cards">
        {me.staff.map((s, i) => (
          <StaffCardView key={`${s.cardId}-${i}`} cardId={s.cardId} exhausted={s.exhausted} suspension={s.suspension} />
        ))}
        {me.executives.map((e, i) => (
          <div key={`${e.cardId}-${i}`} className="card executive small">
            <b>{cards.executive(e.cardId).name}</b>{e.exhausted && ' · 소진'}
          </div>
        ))}
      </div>
      <h4>전술 카드 · 목표</h4>
      <div className="muted small">
        {view.self.tacticCards.map((t) => cards.tactic(t).name).join(', ') || '없음'}
        {view.self.objective && ` · 목표: ${cards.objective(view.self.objective).name}`}
      </div>
      {me.uniforms.length > 0 && (
        <div className="muted small">
          유니폼(필드): {me.uniforms.filter((u) => u.location === 'field').map((u) => `${u.number ?? '∅'}${u.face === 'attack' ? '⚽' : '🛡'}`).join(' ')}
        </div>
      )}
    </section>
  );
}

export function MarketPanel({ onBuy }: { onBuy?: (row: 'players' | 'staff' | 'sponsors', index: number) => void }) {
  const { view } = useGame();
  const rows = [
    ['players', '선수', (id: string, i: number) => <PlayerCardView key={id} cardId={id} onClick={onBuy && i >= 2 ? () => onBuy('players', i) : undefined} />],
    ['staff', '직원', (id: string, i: number) => <StaffCardView key={id} cardId={id} onClick={onBuy && i >= 2 ? () => onBuy('staff', i) : undefined} />],
    ['sponsors', '스폰서', (id: string, i: number) => <SponsorCardView key={id} cardId={id} onClick={onBuy && i >= 2 ? () => onBuy('sponsors', i) : undefined} />],
  ] as const;
  return (
    <section className="panel">
      <h3>이적 시장 <span className="muted small">(오른쪽 3장만 구매 가능 · 유망주 더미 {view.deckCounts.prospects}장)</span></h3>
      {rows.map(([key, label, render]) => (
        <div key={key}>
          <h4>{label}</h4>
          <div className="cards market-row">{view.market[key].map((id, i) => render(id, i))}</div>
        </div>
      ))}
    </section>
  );
}

export function LeaguePanel() {
  const { view } = useGame();
  const entries = [
    ...view.seats.map((id) => ({ name: view.players[id]!.name, position: view.league.players[id]!, active: true, mine: true })),
    ...view.league.opponents.map((o) => ({ name: cards.opponent(`op-${o.teamId}-3a`).teamName, position: o.position, active: o.active, mine: false })),
  ].sort((a, b) => b.position - a.position);
  return (
    <section className="panel">
      <h3>리그 성적표</h3>
      <ol className="league">
        {entries.map((e, i) => (
          <li key={i} className={e.mine ? 'mine' : e.active ? '' : 'inactive'}>
            {e.name} <span className="muted">{e.position}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function LogPanel() {
  const { view } = useGame();
  return (
    <section className="panel log">
      <h3>기록</h3>
      <ul>
        {[...view.log].reverse().slice(0, 30).map((l, i) => (
          <li key={i} className="small">{l}</li>
        ))}
      </ul>
    </section>
  );
}

// 대상 선택이 필요한 효과 처리
export function PendingModal() {
  const { me, act } = useGame();
  const pending = me.pending[0];
  if (!pending) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>대상 선택: {pending.source}</h3>
        <p className="muted small">
          {pending.effect.type === 'addPlayerToken' || pending.effect.type === 'removePlayerToken'
            ? `${TOKEN_LABEL[pending.effect.token]} ${pending.effect.count}개`
            : pending.effect.type}
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
