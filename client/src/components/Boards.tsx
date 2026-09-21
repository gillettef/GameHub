import { cards, instanceName } from '@server/engine/cards';
import { billboardLimit } from '@server/engine/weekday';
import { upkeepDue } from '@server/engine/weekend';
import { RESOURCES, TRACK_MAX } from '@server/engine/types';
import type { InfrastructureType, Resource } from '@server/engine/types';
import type { PlayerPublicView } from '@server/engine/view';
import { useCommit } from '../commit';
import { INFRA_LABEL, RESOURCE_LABEL } from '../labels';
import { useView } from '../store';
import { useUi } from '../ui';
import type { BoardTab } from '../ui';
import { objectiveLevel } from '@server/engine/objectives';
import { ExecutiveCardView, ObjectiveCardView, OpponentCardView, PlayerCardView, SponsorCardView, StaffCardView, TacticCardView } from './Cards';
import { Chip, Icon } from './Icons';
import { seatColor } from './Shell';
import { Tabs } from './Tabs';

const DAYS = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
] as const;

function currentDayKey(kind: string, day?: string): string | null {
  if (kind === 'monday.board') return 'mon';
  if (kind === 'weekday') return day ?? null;
  if (kind.startsWith('friday')) return 'fri';
  return null;
}

// 구단 보드 (룰북 p.7): 요일 트랙, 능력치 트랙 4개, 직원 행. 왼쪽에 유지비 트랙
function ClubBoard({ p }: { p: PlayerPublicView }) {
  const { view } = useView();
  const today = currentDayKey(view.phase.kind, view.phase.kind === 'weekday' ? view.phase.day : undefined);
  const { procurement, trackOverflow, upkeep } = cards.boardData;
  const stadiumCount = 4 + p.infrastructure.length;
  const upkeepCols: { label: string; count: number; table: number[] }[] = [
    { label: '선수', count: p.roster.length, table: upkeep.players },
    { label: '스타디움', count: stadiumCount, table: upkeep.stadium },
    { label: '직원', count: p.staff.length, table: upkeep.staff },
  ];
  return (
    <div className="club-board">
      <div className="day-track">
        {DAYS.map((d) => {
          const r = p.restrictions.find((x) => x.week === view.week && x.day === d.key);
          return (
            <span key={d.key} className={`day${today === d.key ? ' now' : ''}${r ? ' inspect' : ''}`} title={r ? `점검용 토큰: ${r.mode === 'noBasic' ? '기본 행동 불가' : '카드 행동만 가능'}` : undefined}>
              {d.label}
            </span>
          );
        })}
        <span className="day weekend">주말</span>
      </div>
      <div className="club-grid">
        <div className="upkeep">
          {upkeepCols.map((c) => (
            <div key={c.label} className="upkeep-col" title={`${c.label} ${c.count} → 유지비 −${c.table[Math.min(c.count, c.table.length - 1)]}`}>
              {[8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
                <span key={n} className={`upkeep-cell band-${c.table[n]}${c.count === n || (n === 8 && c.count > 8) ? ' now' : ''}`}>{n}</span>
              ))}
              <span className="upkeep-label">{c.label}</span>
            </div>
          ))}
          <div className="upkeep-total" title="주말에 내는 돈"><Icon name="money" size={12} />유지비 −{upkeepDue(p)}</div>
        </div>
        <div className="tracks">
          {RESOURCES.map((r) => (
            <div key={r} className={`track ${r}`}>
              <span className={`track-icon ${r}`} title={RESOURCE_LABEL[r]}><Icon name={r} size={16} /></span>
              <span className="track-end" title={`1 미만이면 ${RESOURCE_LABEL[trackOverflow[r].below]} −1`}><Icon name={trackOverflow[r].below} size={11} />−1</span>
              {Array.from({ length: TRACK_MAX }, (_, i) => i + 1).map((n) => (
                <span key={n} className={`track-cell${p.tracks[r] === n ? ' marker' : ''}`} title={`월요일 조달 +${procurement[r][n - 1]}`}>
                  <span className="track-num">{n}</span>
                  <span className="track-yield">+{procurement[r][n - 1]}</span>
                </span>
              ))}
              <span className="track-end" title={`5 초과면 ${RESOURCE_LABEL[trackOverflow[r].above]} +1`}><Icon name={trackOverflow[r].above} size={11} />+1</span>
              <span className={`track-stock ${r}`} title={`보유 ${RESOURCE_LABEL[r]}`}>{p.resources[r]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="staff-row">
        <span className="board-label">직원 · 임원</span>
        <div className="cards">
          {p.staff.map((s, i) => (
            <StaffCardView key={`${s.cardId}-${i}`} cardId={s.cardId} exhausted={s.exhausted} suspension={s.suspension} />
          ))}
          {p.executives.map((e, i) => (
            <ExecutiveCardView key={`${e.cardId}-${i}`} cardId={e.cardId} exhausted={e.exhausted} />
          ))}
        </div>
      </div>
    </div>
  );
}

const GENERAL_SLOTS = 4;

// 스타디움 보드 (룰북 p.6): 사무실 트랙, 기반 시설 슬롯, 관중석 1~4, 광고판 1~3, 유니폼 스폰서 칸. 아래에 계약한 스폰서 카드
function StadiumBoard({ p }: { p: PlayerPublicView }) {
  const office = cards.boardData.office;
  const general = p.infrastructure.filter((i) => !['stand3', 'stand4', 'billboard3'].includes(i));
  const has = (t: InfrastructureType) => p.infrastructure.includes(t);
  const infraDef = (t: InfrastructureType) => cards.boardData.infrastructure.find((d) => d.type === t)!;
  const slot = (t: InfrastructureType | undefined, key: string, label?: string) => (
    <span key={key} className={`infra-slot${t ? ' built' : ''}`} title={t ? `${INFRA_LABEL[t]} · 승점 ${infraDef(t).vp}` : label ?? '빈 슬롯'}>
      {t ? (
        <>
          <span className="infra-name">{INFRA_LABEL[t]}</span>
          <Chip icon="vp" value={infraDef(t).vp} />
        </>
      ) : (
        <span className="infra-empty">{label ?? '—'}</span>
      )}
    </span>
  );
  const limit = billboardLimit(p);
  return (
    <div className="stadium-wrap">
      <div className="stadium-board">
        <div className="office-track" title="사무실 트랙: 비용 → 승점">
          <span className="board-label">사무실</span>
          {[...office].reverse().map((step, ri) => {
            const i = office.length - 1 - ri;
            return (
              <span key={i} className={`office-step${p.office === i ? ' marker' : ''}${p.office > i ? ' passed' : ''}`}>
                {step.cost > 0 ? <span className="office-cost"><Icon name="money" size={11} />{step.cost}</span> : <span className="office-cost">—</span>}
                <span className="office-vp"><Icon name="vp" size={11} />{step.vp}</span>
              </span>
            );
          })}
        </div>
        <div className="stadium-main">
          <div className="infra-grid">
            {Array.from({ length: GENERAL_SLOTS }, (_, i) => slot(general[i], `g${i}`))}
          </div>
          <div className="stands">
            <span className="stand printed"><Icon name="fandom" size={12} />1번 관중석</span>
            <span className="stand printed"><Icon name="fandom" size={12} />2번 관중석</span>
            {slot(has('stand3') ? 'stand3' : undefined, 's3', '3번 관중석')}
            {slot(has('stand4') ? 'stand4' : undefined, 's4', '4번 관중석')}
          </div>
          <div className="billboards">
            {[0, 1].map((i) => (
              <span key={i} className={`billboard${p.sponsors.billboards[i] ? ' filled' : ''}`}>
                {i + 1}번 광고판{p.sponsors.billboards[i] && `: ${cards.sponsor(p.sponsors.billboards[i]!).name}`}
              </span>
            ))}
            <span className={`billboard${has('billboard3') ? '' : ' locked'}${p.sponsors.billboards[2] ? ' filled' : ''}`}>
              3번 광고판{has('billboard3') ? (p.sponsors.billboards[2] ? `: ${cards.sponsor(p.sponsors.billboards[2]!).name}` : '') : ' (미건설)'}
            </span>
          </div>
        </div>
        <div className={`naming-slot${p.sponsors.naming ? ' filled' : ''}`} title="유니폼 스폰서 (카드는 앞면이 아래로)">
          <span className="board-label">유니폼</span>
          <span>{p.sponsors.naming ? cards.sponsor(p.sponsors.naming).name : '—'}</span>
        </div>
      </div>
      <div className="sponsor-row">
        <span className="board-label">
          스폰서 계약 · 광고판 {p.sponsors.billboards.length}/{limit} · 유니폼 {p.sponsors.naming ? 1 : 0}/1
        </span>
        {p.sponsors.billboards.length === 0 && !p.sponsors.naming ? (
          <span className="muted small">계약한 스폰서가 없습니다. 장내 방송 계약은 효과만 받고 카드를 버립니다.</span>
        ) : (
          <div className="cards">
            {p.sponsors.billboards.map((id, i) => (
              <SponsorCardView key={`${id}-${i}`} cardId={id} badge={`${i + 1}번 광고판`} />
            ))}
            {p.sponsors.naming && <SponsorCardView cardId={p.sponsors.naming} badge="유니폼" faceDown />}
          </div>
        )}
      </div>
    </div>
  );
}

// 경기 보드 (룰북 p.8): 경기장(필드 토큰), 벤치, 선수 카드, 상대 팀 스카우트 보고서.
// 사이드바에서 "선수 방출…"을 켜면(방출 모드) 내 선수 카드를 눌러 방출 대상을 고른다
function MatchBoard({ p }: { p: PlayerPublicView }) {
  const { view, session } = useView();
  const { releasing } = useUi();
  const { chosen, select } = useCommit();
  const canRelease = releasing && !!session && session.playerId === p.id && view.phase.kind === 'weekday' && view.phase.current === p.id && !view.phase.basicDone;
  const field = p.uniforms.filter((u) => u.location === 'field');
  const bench = p.uniforms.filter((u) => u.location === 'bench');
  // 훈련 전 유망주는 '유망주'로만 보여야 한다 (instanceName)
  const nameOf = (instanceId?: string) => {
    const inst = instanceId ? p.roster.find((r) => r.instanceId === instanceId) : undefined;
    return inst ? instanceName(inst) : undefined;
  };
  const token = (u: (typeof field)[number]) => (
    <span key={u.id} className={`utoken ${u.face}`} title={nameOf(u.cardInstanceId)}>
      <Icon name={u.face} size={11} />{u.number ?? '∅'}
    </span>
  );
  return (
    <div className="match-board">
      <div className="mb-pitch">
        <div className="mb-line">
          <span className="mb-line-label">공격 {field.filter((u) => u.face === 'attack').length}</span>
          {field.filter((u) => u.face === 'attack').map(token)}
        </div>
        <div className="mb-line">
          <span className="mb-line-label">수비 {field.filter((u) => u.face === 'defense').length}</span>
          {field.filter((u) => u.face === 'defense').map(token)}
        </div>
        <div className="mb-bench"><span className="mb-line-label">벤치</span>{bench.map(token)}</div>
      </div>
      <div className="mb-side">
        {p.nextOpponent ? <OpponentCardView cardId={p.nextOpponent} compact revealed={p.scouted && session?.playerId === p.id} /> : <span className="muted small">남은 상대 없음</span>}
        {p.scouted && session?.playerId === p.id && <span className="muted small"><Icon name="eye" size={12} /> 앞면을 미리 봤습니다</span>}
        <span className="muted small">남은 상대 {p.opponentsLeft}팀</span>
      </div>
      <div className="mb-roster">
        <span className="board-label">
          선수 {p.roster.length}
          {canRelease && <span className="release-hint">방출할 선수를 누르세요 — 2 + 현재 역량만큼 돈, 부상·출장정지면 절반</span>}
        </span>
        <div className="cards">
          {p.roster.map((r) => (
            <PlayerCardView
              key={r.instanceId}
              cardId={r.cardId}
              instance={r}
              chosen={chosen === `release:${r.instanceId}`}
              onClick={canRelease ? () => select(`release:${r.instanceId}`, { type: 'releasePlayer', instanceId: r.instanceId }, <>방출: <b>{instanceName(r)}</b></>) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// 개인 보드: 구단 / 스타디움 / 경기 / (내) 손패 탭. 탭 상태는 UiProvider 가 단계에 맞춰 기본값을 정한다
export function PlayerBoard({ p, privateInfo }: { p: PlayerPublicView; privateInfo?: { tacticCards: string[]; objective?: string } }) {
  const { view } = useView();
  const { boardTab: tab, setBoardTab: setTab } = useUi();
  const hasHand = !!privateInfo && (privateInfo.tacticCards.length > 0 || !!privateInfo.objective);
  const shown: BoardTab = tab === 'hand' && !hasHand ? 'club' : tab;
  return (
    <div className="board-panel" style={{ '--seat': seatColor(view, p.id) } as React.CSSProperties}>
      <div className="panel-head">
        <h2><span className="seat-dot" />{p.name}의 구단</h2>
        <div className="chips">
          {RESOURCES.map((r: Resource) => (
            <Chip key={r} icon={r} value={p.resources[r]} title={RESOURCE_LABEL[r]} />
          ))}
          <Chip icon="vp" value={p.vp} title="승점 토큰" />
        </div>
      </div>
      <Tabs<BoardTab>
        tabs={[
          { key: 'club', label: '구단 보드', badge: `직원 ${p.staff.length}` },
          { key: 'stadium', label: '스타디움 보드', badge: `시설 ${p.infrastructure.length}/7` },
          { key: 'match', label: '경기 보드', badge: `선수 ${p.roster.length}` },
          ...(hasHand ? [{ key: 'hand' as const, label: '내 손패', badge: `${privateInfo!.tacticCards.length + (privateInfo!.objective ? 1 : 0)}` }] : []),
        ]}
        value={shown}
        onChange={setTab}
      />
      {shown === 'club' && <ClubBoard p={p} />}
      {shown === 'stadium' && <StadiumBoard p={p} />}
      {shown === 'match' && <MatchBoard p={p} />}
      {shown === 'hand' && privateInfo && (
        <div className="cards">
          {privateInfo.tacticCards.map((t) => (
            <TacticCardView key={t} cardId={t} compact />
          ))}
          {privateInfo.objective && <ObjectiveCardView cardId={privateInfo.objective} level={objectiveLevel(p, view.league, privateInfo.objective)} compact />}
        </div>
      )}
    </div>
  );
}
