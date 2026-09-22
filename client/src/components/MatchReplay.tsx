import { useEffect, useMemo, useState } from 'react';
import { cards, tokenLabel } from '@server/engine/cards';
import { SECTOR_LABEL } from '@server/engine/labels';
import { SECTOR_PAIRS, regionLine, regionSector } from '@server/engine/match';
import type { AttackTrace } from '@server/engine/match';
import type { MatchAftermath, PlayerInstance, UniformToken } from '@server/engine/state';
import type { Role, Sector } from '@server/engine/types';
import { Icon } from './Icons';

// 경기 보기 (사용자 요청 2026-09-22): 경기장 하나에 양 팀을 놓고 판정 트레이스(MatchReport.sectors[].theirAttack/myAttack)를
// 규칙서 순서(내 LW↔상대 RW → RW↔LW → CF↔CB → CM↔CM → CB↔CF, p.21)대로 재생한다. 위쪽은 상대(상하 반전: GK·CB·CM·CF, 윙은 좌우 반전),
// 아래쪽은 우리(CF·CM·CB·GK). 그래서 화면 왼쪽 열 = 내 LW ↔ 상대 RW, 오른쪽 열 = 내 RW ↔ 상대 LW 로 비교 짝이 그대로 맞는다.
// 구획마다 "상대 공격 → 내 수비·골키퍼", "내 공격 → 상대 수비·골키퍼" 두 스텝. 결과는 서버가 이미 정했고 여기서는 보여 주기만 한다.

interface Team {
  name: string;
  roster: PlayerInstance[];
  uniforms: UniformToken[];
}

interface RSlot {
  id: string;
  role: Role;
  skill: number;
  label: string; // 툴팁
  short: string; // 칩 안 글자 (내 팀: 등번호, 상대: 없음)
  order: number; // 같은 구획 안 정렬 (내 팀은 라인 순)
}

type Step = { kind: 'kickoff' } | { kind: 'attack'; pair: number; side: 'theirs' | 'mine' } | { kind: 'extras' } | { kind: 'final' };

const LINE_ORDER = { fwd: 0, mid: 1, back: 2 } as const;
// 구획 표기는 배치판의 지역 용어와 맞춘다 (사용자 결정 2026-09-22): 센터 구획은 그 라인의 중앙 지역 코드, 윙 구획은 그대로
const SECTOR_CODE: Record<Sector, string> = { LW: 'LW', RW: 'RW', CF: 'CF', CM: 'MC', CB: 'DC' };
const SECTOR_NAME: Record<Sector, string> = { LW: '레프트 윙', RW: '라이트 윙', CF: '공격-중앙', CM: '미드-중앙', CB: '수비-중앙' };
const THEIR_CENTER: readonly Sector[] = ['CB', 'CM', 'CF']; // 위(상대 GK 쪽)에서 아래로
const MY_CENTER: readonly Sector[] = ['CF', 'CM', 'CB'];

export function buildReplaySteps(m: MatchAftermath): Step[] {
  const steps: Step[] = [{ kind: 'kickoff' }];
  m.report.sectors.forEach((_, i) => {
    steps.push({ kind: 'attack', pair: i, side: 'theirs' });
    steps.push({ kind: 'attack', pair: i, side: 'mine' });
  });
  const sectorMine = m.report.sectors.reduce((n, s) => n + s.myGoals, 0);
  const sectorTheirs = m.report.sectors.reduce((n, s) => n + s.theirGoals, 0);
  if (m.preGoals > 0 || m.denied > 0 || m.report.myGoals !== sectorMine || m.report.theirGoals !== sectorTheirs || m.effects.length > 0) steps.push({ kind: 'extras' });
  steps.push({ kind: 'final' });
  return steps;
}

// 스텝 k까지 진행한 점수 (킥오프 0:0, 공격 스텝마다 그 방향의 골, 정리·최종은 보고서 총점)
function scoreAt(m: MatchAftermath, steps: Step[], k: number): { mine: number; theirs: number } {
  let mine = 0;
  let theirs = 0;
  for (let i = 0; i <= k && i < steps.length; i++) {
    const s = steps[i]!;
    if (s.kind === 'attack') {
      const sec = m.report.sectors[s.pair]!;
      if (s.side === 'mine') mine += sec.myGoals;
      else theirs += sec.theirGoals;
    } else if (s.kind === 'extras' || s.kind === 'final') {
      mine = m.report.myGoals;
      theirs = m.report.theirGoals;
    }
  }
  return { mine, theirs };
}

function traceOf(m: MatchAftermath, step: Step): AttackTrace | null {
  if (step.kind !== 'attack') return null;
  const sec = m.report.sectors[step.pair]!;
  return step.side === 'mine' ? sec.myAttack : sec.theirAttack;
}

// initialIndex/autoplay 는 개발용 카드 점검 페이지(cardAudit)가 특정 스텝을 멈춰 그릴 때만 쓴다
export function MatchReplay({ actor, m, initialIndex = 0, autoplay = true }: { actor: Team; m: MatchAftermath; initialIndex?: number; autoplay?: boolean }) {
  const opponent = cards.opponent(m.opponentCardId);
  const steps = useMemo(() => buildReplaySteps(m), [m]);
  const [index, setIndex] = useState(Math.min(initialIndex, steps.length - 1));
  const [playing, setPlaying] = useState(autoplay);
  const last = steps.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    // 킥오프 1.2초 + 스텝 1.8초 × 12 ≈ 23초. 봇은 이 시간(driver.ts watchMs 24초)을 기다렸다가 주사위를 굴린다
    const t = setTimeout(() => setIndex((i) => Math.min(last, i + 1)), index === 0 ? 1200 : 1800);
    return () => clearTimeout(t);
  }, [playing, index, last]);

  // 내 슬롯: 경기에 쓴 배치·역량(일시적 토큰·전술 효과 포함). 상대 슬롯: 카드 그대로 (id 는 엔진 opponentSide 와 같은 규칙)
  const mine = useMemo(() => {
    const by: Record<Sector, RSlot[]> = { LW: [], CB: [], CM: [], CF: [], RW: [] };
    for (const token of actor.uniforms) {
      const region = m.placements[token.id];
      if (!region) continue;
      const label = tokenLabel(actor, m.played, token.id);
      by[regionSector(region)].push({ id: token.id, role: token.face, skill: m.skills[token.id] ?? 1, label, short: token.number !== undefined ? String(token.number) : '∅', order: LINE_ORDER[regionLine(region)] });
    }
    for (const s of Object.values(by)) s.sort((a, b) => a.order - b.order);
    return by;
  }, [actor, m]);
  const theirs = useMemo(() => {
    const by: Record<Sector, RSlot[]> = { LW: [], CB: [], CM: [], CF: [], RW: [] };
    for (const s of Object.keys(by) as Sector[]) {
      by[s] = opponent.sectors[s].map((slot, i) => ({ id: `${opponent.id}:${s}${i}`, role: slot.role, skill: slot.skill, label: `${opponent.teamName} ${SECTOR_LABEL[s]} · ${slot.role === 'attack' ? '공격' : '수비'} ${slot.skill}`, short: '', order: i }));
    }
    return by;
  }, [opponent]);

  const step = steps[index]!;
  const trace = traceOf(m, step);
  const score = scoreAt(m, steps, index);
  const pair = step.kind === 'attack' ? SECTOR_PAIRS[step.pair]! : null; // [내 구획, 상대 구획]
  const attackingSide = step.kind === 'attack' ? step.side : null;

  // 지금까지의 득점 표시(⚽ 누적)와 못 넣은 표시(막힘 ✕ · 선방 🧤 — 다른 구획으로 넘어가도 남는다, 사용자 요청 2026-09-22), 이번 스텝의 상태(막힘·막음·선방·득점)
  const { goalsSoFar, marksSoFar } = useMemo(() => {
    const g: Record<string, number> = {};
    const marks: Record<string, 'blocked' | 'saved'> = {};
    for (let i = 1; i <= index && i < steps.length; i++) {
      const t = traceOf(m, steps[i]!);
      if (!t) continue;
      for (const id of t.scorers) g[id] = (g[id] ?? 0) + 1;
      for (const b of t.blocks) marks[b.attacker] = 'blocked';
      for (const id of t.saved) marks[id] = 'saved';
    }
    return { goalsSoFar: g, marksSoFar: marks };
  }, [m, steps, index]);
  const stateOf = (id: string): string => {
    if (!trace) return '';
    if (trace.blocks.some((b) => b.attacker === id)) return 'blocked';
    if (trace.blocks.some((b) => b.defender === id)) return 'blocker';
    if (trace.scorers.includes(id)) return 'goal';
    if (trace.saved.includes(id)) return 'saved';
    if (trace.attackers.some((s) => s.id === id) || trace.defenders.some((s) => s.id === id)) return 'idle';
    return '';
  };
  const activeMine = pair ? pair[0] : null;
  const activeTheirs = pair ? pair[1] : null;
  const gkActive = (side: 'mine' | 'theirs') => !!trace && attackingSide !== null && attackingSide !== side && trace.unblocked.length > 0;
  const gkSavesLeft = (side: 'mine' | 'theirs') => {
    let left = m.report.goalkeepers[side].saves;
    for (let i = 1; i <= index && i < steps.length; i++) {
      const s = steps[i]!;
      if (s.kind === 'attack' && s.side !== side) left -= traceOf(m, s)!.saved.length;
    }
    return Math.max(0, left);
  };

  const renderSlot = (slot: RSlot, side: 'mine' | 'theirs') => {
    const st = stateOf(slot.id);
    const goals = goalsSoFar[slot.id] ?? 0;
    const mark = marksSoFar[slot.id]; // 지나간 구획에서 막혔거나 선방당한 표시는 그대로 남는다
    const title = `${slot.label}${st === 'blocked' || mark === 'blocked' ? ' — 막힘' : st === 'blocker' ? ' — 공격을 막음' : st === 'goal' ? ' — 득점' : st === 'saved' || mark === 'saved' ? ' — 골키퍼 선방' : ''}`;
    return (
      <span key={slot.id} className={`rslot ${side} ${slot.role}${st ? ` ${st}` : ''}${mark && st !== mark ? ` was-${mark}` : ''}`} title={title}>
        <Icon name={slot.role} size={11} />
        {slot.short && <b>{slot.short}</b>}
        <span className="rslot-skill">{slot.skill}</span>
        {goals > 0 && <span className="rslot-goal">{'⚽'.repeat(goals)}</span>}
        {mark === 'blocked' && <span className="rslot-mark">✕</span>}
        {mark === 'saved' && <span className="rslot-mark">🧤</span>}
      </span>
    );
  };
  const renderSector = (side: 'mine' | 'theirs', sector: Sector, cls: string) => {
    const slots = side === 'mine' ? mine[sector] : theirs[sector];
    const active = side === 'mine' ? activeMine === sector : activeTheirs === sector;
    const role = active && attackingSide ? (attackingSide === side ? '공격' : '수비') : null;
    return (
      <div key={`${side}-${sector}`} className={`rsector ${cls}${active ? ' active' : ''}${trace && !active ? ' dim' : ''}`} title={`${side === 'mine' ? actor.name : opponent.teamName} ${SECTOR_LABEL[sector]}`}>
        <div className="rsector-title">
          <b>{SECTOR_CODE[sector]}</b>
          <span className="rsector-name">{SECTOR_NAME[sector]}</span>
          {role && <span className="rsector-role">{role}</span>}
        </div>
        <div className="rsector-slots">{slots.length === 0 ? <span className="rsector-empty">—</span> : slots.map((s) => renderSlot(s, side))}</div>
      </div>
    );
  };
  const renderGk = (side: 'mine' | 'theirs') => {
    const gk = m.report.goalkeepers[side];
    const active = gkActive(side);
    const savedNow = active && trace ? trace.saved.length : 0;
    const conceded = active && trace ? trace.scorers.length : 0;
    return (
      <div className={`rgk${active ? ' active' : ''}${trace && !active ? ' dim' : ''}`} title={`${side === 'mine' ? actor.name : opponent.teamName} 골키퍼 · 역량 ${gk.skill} · 선방 ${gk.saves}`}>
        <b>GK</b>
        <span className="rslot gk"><Icon name="defense" size={11} /><span className="rslot-skill">{gk.skill}</span></span>
        <span className="rgk-saves">선방 {gkSavesLeft(side)}/{gk.saves}</span>
        {active && (savedNow > 0 || conceded > 0) && (
          <span className="rgk-now">{savedNow > 0 && <>🧤×{savedNow} </>}{conceded > 0 && <>실점 {conceded}</>}</span>
        )}
      </div>
    );
  };

  const caption = (() => {
    switch (step.kind) {
      case 'kickoff':
        return (
          <>
            <b>킥오프</b> — {actor.name} vs {opponent.teamName} ({opponent.formation.defenders}-{opponent.formation.midfielders}-{opponent.formation.forwards}). 구획을 LW → RW → CF → MC → DC 순서로 비교합니다.
          </>
        );
      case 'attack': {
        const t = trace!;
        const [my, their] = pair!;
        const who = step.side === 'mine' ? <>내 <b>{SECTOR_NAME[my]}</b> 공격 {t.attackers.length} → 상대 <b>{SECTOR_NAME[their]}</b> 수비 {t.defenders.length}</> : <>상대 <b>{SECTOR_NAME[their]}</b> 공격 {t.attackers.length} → 내 <b>{SECTOR_NAME[my]}</b> 수비 {t.defenders.length}</>;
        if (t.attackers.length === 0) return <>{step.pair + 1}/5 · {who}: 공격 선수가 없어 그대로 지나갑니다.</>;
        const goalWord = step.side === 'mine' ? '득점' : '실점';
        return (
          <>
            {step.pair + 1}/5 · {who}: 막힘 {t.blocks.length} · 뚫린 슛 {t.unblocked.length}
            {t.unblocked.length > 0 && <> → 선방 {t.saved.length} · <b className={t.scorers.length > 0 ? (step.side === 'mine' ? 'good' : 'bad') : ''}>{goalWord} {t.scorers.length}</b></>}
          </>
        );
      }
      case 'extras': {
        const sectorMine = m.report.sectors.reduce((n, s) => n + s.myGoals, 0);
        const sectorTheirs = m.report.sectors.reduce((n, s) => n + s.theirGoals, 0);
        const postMine = m.report.myGoals - sectorMine - m.preGoals;
        const postTheirs = m.report.theirGoals - (sectorTheirs - m.denied);
        return (
          <>
            <b>효과 정리</b>
            <ul className="replay-extras">
              {m.preGoals > 0 && <li>경기 전·전술 효과로 미리 넣은 골 +{m.preGoals}</li>}
              {m.denied > 0 && <li>효과로 무효화한 상대 득점 −{m.denied}</li>}
              {postMine !== 0 && <li>경기 후 효과로 바뀐 내 득점 {postMine > 0 ? '+' : ''}{postMine}</li>}
              {postTheirs !== 0 && <li>경기 후 효과로 바뀐 실점 {postTheirs > 0 ? '+' : ''}{postTheirs}</li>}
              {m.effects.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </>
        );
      }
      case 'final':
        return (
          <>
            <b>경기 종료</b> — {m.report.myGoals} : {m.report.theirGoals} <b className={m.report.outcome === 'win' ? 'good' : m.report.outcome === 'loss' ? 'bad' : ''}>{{ win: '승리', draw: '무승부', loss: '패배' }[m.report.outcome]}</b>
          </>
        );
    }
  })();

  return (
    <div className="replay">
      <div className="replay-pitch">
        <div className="rteam theirs">
          <span className="rteam-name">{opponent.teamName}</span>
          {renderGk('theirs')}
        </div>
        <div className="rhalf theirs">
          {renderSector('theirs', 'RW', 'wing left')}
          <div className="rcenter">{THEIR_CENTER.map((s) => renderSector('theirs', s, 'center'))}</div>
          {renderSector('theirs', 'LW', 'wing right')}
        </div>
        <div className="rmidline">
          <span className={`rscore${attackingSide === 'mine' && trace && trace.scorers.length > 0 ? ' bump-mine' : ''}${attackingSide === 'theirs' && trace && trace.scorers.length > 0 ? ' bump-theirs' : ''}`}>
            <span className="team">{actor.name}</span>
            <b>{score.mine} : {score.theirs}</b>
            <span className="team">{opponent.teamName}</span>
          </span>
        </div>
        <div className="rhalf mine">
          {renderSector('mine', 'LW', 'wing left')}
          <div className="rcenter">{MY_CENTER.map((s) => renderSector('mine', s, 'center'))}</div>
          {renderSector('mine', 'RW', 'wing right')}
        </div>
        <div className="rteam mine">
          {renderGk('mine')}
          <span className="rteam-name">{actor.name}</span>
        </div>
      </div>
      <div className="replay-caption" aria-live="polite">{caption}</div>
      <div className="replay-controls">
        <button type="button" className="ghost small" disabled={index === 0} onClick={() => { setPlaying(false); setIndex(0); }} title="처음으로">⏮</button>
        <button type="button" className="ghost small" disabled={index === 0} onClick={() => { setPlaying(false); setIndex((i) => Math.max(0, i - 1)); }}>◀ 이전</button>
        <button type="button" className="small" disabled={index >= last} onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ 일시정지' : '▶ 자동 재생'}</button>
        <button type="button" className="ghost small" disabled={index >= last} onClick={() => { setPlaying(false); setIndex((i) => Math.min(last, i + 1)); }}>다음 ▶</button>
        <button type="button" className="ghost small" disabled={index >= last} onClick={() => { setPlaying(false); setIndex(last); }} title="끝으로">⏭</button>
        <span className="muted small replay-count">{index + 1}/{steps.length}</span>
      </div>
    </div>
  );
}
