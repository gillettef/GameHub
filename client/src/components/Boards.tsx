import { cards, instanceName } from '@server/engine/cards';
import { billboardLimit } from '@server/engine/weekday';
import { WEEKS, upkeepDue } from '@server/engine/weekend';
import { RESOURCES, TRACK_MAX } from '@server/engine/types';
import type { InfrastructureType } from '@server/engine/types';
import type { PlayerPublicView } from '@server/engine/view';
import { useCommit } from '../commit';
import { INFRA_EFFECT, INFRA_LABEL, RESOURCE_LABEL } from '../labels';
import { useView } from '../store';
import { useUi } from '../ui';
import type { BoardTab } from '../ui';
import { objectiveLevel } from '@server/engine/objectives';
import { ExecutiveCardView, ObjectiveCardView, OpponentCardView, PlayerCardView, SponsorCardView, StaffCardView, TacticCardView } from './Cards';
import { Chip, EffectChips, Icon } from './Icons';
import { PlayerCrest } from './Crest';
import { seatColor } from './Shell';
import { Tabs } from './Tabs';

// 구단 보드 (룰북 p.7): 능력치 트랙 4개(월요일 조달), 유지비 3종, 직원, 임원.
// 이번 주 일정은 진행 영역(components/WeekSchedule.tsx)으로 옮겼다 (사용자 요청 2026-09)
// 실물 보드의 정보는 그대로 두고 운영 대시보드처럼 읽히게 배치한다 (DESIGN.md: 흰 타일 + #f6f8fa 면, 그림자 없음)
function ClubBoard({ p }: { p: PlayerPublicView }) {
  const { view } = useView();
  const { procurement, trackOverflow, upkeep } = cards.boardData;
  const stadiumCount = 4 + p.infrastructure.length;
  const upkeepRows: { label: string; count: number; table: number[] }[] = [
    { label: '선수', count: p.roster.length, table: upkeep.players },
    { label: '스타디움', count: stadiumCount, table: upkeep.stadium },
    { label: '직원', count: p.staff.length, table: upkeep.staff },
  ];
  const lastWeek = view.week >= WEEKS;
  return (
    <div className="club-board">
      <div className="club-grid">
        <section className="tile" aria-label="능력치 트랙">
          <h3 className="tile-title">능력치 <span className="tile-sub">월요일마다 마커 위치만큼 조달</span></h3>
          <div className="tracks">
            {RESOURCES.map((r) => (
              <div key={r} className={`track ${r}`}>
                <span className="track-head">
                  <span className={`track-icon ${r}`}><Icon name={r} size={16} /></span>
                  <span className="track-name">{RESOURCE_LABEL[r]}</span>
                  <span className="track-stock" title={`보유 ${RESOURCE_LABEL[r]}`}>{p.resources[r]}</span>
                </span>
                <span className="track-rail">
                  <span className="track-end" title={`1 미만으로 내려가면 ${RESOURCE_LABEL[trackOverflow[r].below]} −1`}><Icon name={trackOverflow[r].below} size={11} />−1</span>
                  {Array.from({ length: TRACK_MAX }, (_, i) => i + 1).map((n) => (
                    <span key={n} className={`track-cell${n <= p.tracks[r] ? ' filled' : ''}${p.tracks[r] === n ? ' marker' : ''}`} title={`${n}칸: 월요일 조달 +${procurement[r][n - 1]}`}>
                      <span className="track-num">{n}</span>
                      <span className="track-yield">+{procurement[r][n - 1]}</span>
                    </span>
                  ))}
                  <span className="track-end" title={`5를 넘기면 ${RESOURCE_LABEL[trackOverflow[r].above]} +1`}><Icon name={trackOverflow[r].above} size={11} />+1</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="tile" aria-label="유지비">
          <h3 className="tile-title">유지비 <span className="tile-sub">{lastWeek ? '마지막 주에는 내지 않습니다' : '주말에 지불 · 못 내면 직원 출장정지'}</span></h3>
          <div className="upkeep">
            {upkeepRows.map((c) => {
              const at = Math.min(Math.max(c.count, 1), 8);
              const cost = c.table[Math.min(c.count, c.table.length - 1)] ?? 0;
              return (
                <div key={c.label} className="upkeep-row" title={`${c.label} ${c.count} → 유지비 −${cost}`}>
                  <span className="upkeep-label">{c.label} <b>{c.count}</b></span>
                  <span className="upkeep-cells">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <span key={n} className={`upkeep-cell band-${c.table[n]}${c.count > 0 && at === n ? ' now' : ''}`}>{n === 8 ? '8+' : n}</span>
                    ))}
                  </span>
                  <span className="upkeep-cost"><Icon name="money" size={12} />−{cost}</span>
                </div>
              );
            })}
          </div>
          <div className={`upkeep-total${!lastWeek && upkeepDue(p) > p.resources.money ? ' short' : ''}`}>
            <span>이번 주말 합계</span>
            <b><Icon name="money" size={14} />−{lastWeek ? 0 : upkeepDue(p)}</b>
          </div>
        </section>
      </div>

      <section className="tile staff-row" aria-label="직원">
        <h3 className="tile-title">직원 <span className="tile-sub">{p.staff.length}명</span></h3>
        {p.staff.length === 0 ? (
          <span className="muted small">고용한 직원이 없습니다.</span>
        ) : (
          <div className="cards">
            {p.staff.map((s, i) => (
              <StaffCardView key={`${s.cardId}-${i}`} cardId={s.cardId} exhausted={s.exhausted} suspension={s.suspension} />
            ))}
          </div>
        )}
      </section>

      <section className="tile staff-row" aria-label="임원">
        <h3 className="tile-title">임원 <span className="tile-sub">{p.executives.length}명 · 이사회 투표</span></h3>
        {p.executives.length === 0 ? (
          <span className="muted small">아직 임원을 고르지 않았습니다.</span>
        ) : (
          <div className="cards">
            {p.executives.map((e, i) => (
              <ExecutiveCardView key={`${e.cardId}-${i}`} cardId={e.cardId} exhausted={e.exhausted} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const GENERAL_SLOTS = 4;

// 경기장 그림(위에서 본 모습): 잔디 + 하프라인·센터서클·양쪽 페널티 박스. 스타디움 평면도와 경기 보드가 같이 쓴다
function PitchLines() {
  return (
    <svg className="pitch-lines" viewBox="0 0 300 180" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect x="6" y="6" width="288" height="168" rx="4" />
      <line x1="150" y1="6" x2="150" y2="174" />
      <circle cx="150" cy="90" r="26" />
      <rect x="6" y="48" width="40" height="84" />
      <rect x="6" y="70" width="16" height="40" />
      <rect x="254" y="48" width="40" height="84" />
      <rect x="278" y="70" width="16" height="40" />
    </svg>
  );
}

// 스타디움 보드 (룰북 p.6): 경기장 평면도 — 가운데 잔디, 사방의 관중석 1~4, 터치라인의 광고판 1~3, 옆에 사무실(층)과 기반 시설 부지 4곳, 유니폼 스폰서.
// 아래에 계약한 스폰서 카드
function StadiumBoard({ p }: { p: PlayerPublicView }) {
  const office = cards.boardData.office;
  const general = p.infrastructure.filter((i) => !['stand3', 'stand4', 'billboard3'].includes(i));
  const has = (t: InfrastructureType) => p.infrastructure.includes(t);
  const infraDef = (t: InfrastructureType) => cards.boardData.infrastructure.find((d) => d.type === t)!;
  const infraTitle = (t: InfrastructureType) => `${INFRA_LABEL[t]} · ${INFRA_EFFECT[t]} · 게임 종료 승점 ${infraDef(t).vp}`;
  const stand = (n: 1 | 2 | 3 | 4, side: 'west' | 'east' | 'north' | 'south') => {
    const type = n === 3 ? 'stand3' : n === 4 ? 'stand4' : undefined;
    const open = !type || has(type);
    const title = !type
      ? `${n}번 관중석 (기본) — 경기 때 팬덤 1개를 놓으면 경기 후 돈 1`
      : open
        ? infraTitle(type)
        : `${n}번 관중석 (미건설) — 건설하면 경기 때 팬덤을 1개 더 놓을 수 있습니다${n === 4 ? ' · 3번 관중석을 먼저 지어야 합니다' : ''}`;
    return (
      <div className={`stand ${side}${open ? ' open' : ''}`} title={title}>
        <span className="stand-name"><Icon name="fandom" size={12} />{n}번 관중석</span>
        {type && open && <Chip icon="vp" value={infraDef(type).vp} />}
        {!open && <span className="stand-state">미건설</span>}
      </div>
    );
  };
  const limit = billboardLimit(p);
  const billboard = (i: number) => {
    const locked = i === 2 && !has('billboard3');
    const id = p.sponsors.billboards[i];
    const title = locked
      ? '3번 광고판 (미건설) — 건설하면 광고판 계약을 3장까지 맺을 수 있습니다'
      : id
        ? `${i + 1}번 광고판: ${cards.sponsor(id).name}`
        : `${i + 1}번 광고판 — 비어 있음`;
    return (
      <div key={i} className={`billboard${id ? ' filled' : ''}${locked ? ' locked' : ''}`} title={title}>
        <span className="billboard-no">{i + 1}</span>
        <span className="billboard-name">{locked ? '미건설' : id ? cards.sponsor(id).name : '광고 모집 중'}</span>
      </div>
    );
  };
  return (
    <div className="stadium-wrap">
      <div className="stadium-board">
        <section className="tile office-tile" aria-label="사무실">
          <h3 className="tile-title">사무실</h3>
          <ol className="office-tower" title="사무실 트랙: 돈을 내고 한 층씩 올라가며, 도달한 층의 승점을 게임 종료 때 받습니다">
            {[...office].reverse().map((step, ri) => {
              const i = office.length - 1 - ri;
              return (
                <li key={i} className={`office-floor${p.office === i ? ' marker' : ''}${p.office > i ? ' passed' : ''}`}>
                  <span className="office-level">{i === 0 ? '입구' : `${i}층`}</span>
                  <span className="office-vp"><Icon name="vp" size={11} />{step.vp}</span>
                  {step.cost > 0 && <span className="office-cost" title="위층으로 올라가는 비용">↑ <Icon name="money" size={11} />{step.cost}</span>}
                </li>
              );
            })}
          </ol>
        </section>

        <section className="stadium-plan" aria-label="경기장">
          {stand(3, 'north')}
          {stand(1, 'west')}
          <div className="stadium-pitch">
            <PitchLines />
            <span className="pitch-crest"><PlayerCrest id={p.id} name={p.name} color="rgba(255,255,255,0.22)" size={44} /></span>
          </div>
          {stand(2, 'east')}
          <div className="billboards" aria-label="광고판">{[0, 1, 2].map(billboard)}</div>
          {stand(4, 'south')}
        </section>

        <section className="tile lots-tile" aria-label="기반 시설">
          <h3 className="tile-title">기반 시설 <span className="tile-sub">{general.length}/{GENERAL_SLOTS}</span></h3>
          <div className="infra-grid">
            {Array.from({ length: GENERAL_SLOTS }, (_, i) => {
              const t = general[i];
              return (
                <div key={i} className={`infra-slot${t ? ' built' : ''}`} title={t ? infraTitle(t) : '빈 부지 — 주중 기본 행동으로 기반 시설을 건설'}>
                  {t ? (
                    <>
                      <span className="infra-name">{INFRA_LABEL[t]}</span>
                      <span className="chips">
                        {infraDef(t).bonus.length > 0 && <EffectChips effects={infraDef(t).bonus} />}
                        <Chip icon="vp" value={infraDef(t).vp} />
                      </span>
                    </>
                  ) : (
                    <span className="infra-empty">빈 부지</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className={`naming-slot${p.sponsors.naming ? ' filled' : ''}`} title="유니폼 스폰서 (카드는 앞면이 아래로)">
            <svg className="jersey" viewBox="0 0 32 28" aria-hidden="true" focusable="false"><path d="M11 2 3 6l3 7 3-1.5V26h14V11.5L26 13l3-7-8-4c-1 2-3 3-5 3s-4-1-5-3z" /></svg>
            <span className="naming-text">
              <span className="board-label">유니폼 스폰서</span>
              <span className="naming-name">{p.sponsors.naming ? cards.sponsor(p.sponsors.naming).name : '계약 없음'}</span>
            </span>
          </div>
        </section>
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

// 경기 보드 (룰북 p.8): 경기장(필드 토큰 — 수비 줄은 우리 진영, 공격 줄은 상대 진영), 벤치, 선수 카드, 상대 팀 스카우트 보고서.
// 사이드바에서 "선수 방출…"을 켜면(방출 모드) 내 선수 카드를 눌러 방출 대상을 고른다
function MatchBoard({ p }: { p: PlayerPublicView }) {
  const { view, session } = useView();
  const { releasing } = useUi();
  const { chosen, select } = useCommit();
  const canRelease = releasing && !!session && session.playerId === p.id && view.phase.kind === 'weekday' && view.phase.current === p.id && !view.phase.basicDone;
  const field = p.uniforms.filter((u) => u.location === 'field');
  const bench = p.uniforms.filter((u) => u.location === 'bench');
  const token = (u: (typeof field)[number]) => {
    const inst = u.cardInstanceId ? p.roster.find((r) => r.instanceId === u.cardInstanceId) : undefined;
    const role = u.face === 'attack' ? '공격' : '수비';
    return (
      <span key={u.id} className={`kit ${u.face}${inst ? ' carded' : ''}`} title={inst ? `${instanceName(inst)} · ${role}` : `카드 없는 유니폼 토큰 · ${role} · 역량 1`}>
        <span className="kit-no">{u.number ?? '–'}</span>
        <span className="kit-name">{inst ? instanceName(inst) : role}</span>
      </span>
    );
  };
  const attack = field.filter((u) => u.face === 'attack');
  const defense = field.filter((u) => u.face === 'defense');
  return (
    <div className="match-board">
      <div className="mb-field">
        <div className="mb-pitch">
          <PitchLines />
          <div className="mb-half defense" aria-label={`수비 ${defense.length}`}>{defense.map(token)}</div>
          <div className="mb-half attack" aria-label={`공격 ${attack.length}`}>{attack.map(token)}</div>
        </div>
        <div className="mb-legend">
          <span><i className="swatch defense" />수비 {defense.length}</span>
          <span><i className="swatch attack" />공격 {attack.length}</span>
          <span className="muted">이름이 적힌 유니폼은 선수 카드가 있는 자리, 없으면 역량 1</span>
        </div>
        <div className="mb-bench"><span className="mb-line-label">벤치 {bench.length}</span>{bench.map(token)}</div>
      </div>
      <div className="mb-side">
        <span className="board-label">다음 상대 <span className="muted">· 남은 상대 {p.opponentsLeft}팀</span></span>
        {p.nextOpponent ? <OpponentCardView cardId={p.nextOpponent} compact revealed={p.scouted && session?.playerId === p.id} /> : <span className="muted small">남은 상대 없음</span>}
        {p.scouted && session?.playerId === p.id && <span className="muted small"><Icon name="eye" size={12} /> 앞면을 미리 봤습니다</span>}
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

// 개인 보드: 구단 / 스타디움 / 경기 / (내) 손패 탭. 탭 상태는 UiProvider 가 단계에 맞춰 기본값을 정한다.
// 구단 상태(엠블럼·자원·승점)는 위 참가자 띠에 늘 보이므로 여기서 다시 그리지 않는다 (사용자 요청 2026-09)
export function PlayerBoard({ p, privateInfo }: { p: PlayerPublicView; privateInfo?: { tacticCards: string[]; objective?: string } }) {
  const { view } = useView();
  const { boardTab: tab, setBoardTab: setTab } = useUi();
  const hasHand = !!privateInfo && (privateInfo.tacticCards.length > 0 || !!privateInfo.objective);
  const shown: BoardTab = tab === 'hand' && !hasHand ? 'club' : tab;
  return (
    <div className="board-panel" style={{ '--seat': seatColor(view, p.id) } as React.CSSProperties}>
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
