import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cards, instanceName } from '@server/engine/cards';
import { INFRA_LABEL, SET_LABEL } from '@server/engine/labels';
import type { ScoreBreakdown } from '@server/engine/scoring';
import type { StaffSet } from '@server/engine/types';
import type { GameView, PlayerPublicView } from '@server/engine/view';
import { Stepper } from './Lineup';
import type { StepDef } from './Lineup';
import { seatColor } from './Shell';

// 시즌 종료 승점 확인(사용자 요청, 2026-09): 항목을 하나씩 넘기며, 항목마다 참가자를 한 명씩 차례로 체크(✓)해 근거와 점수를 보여 준다.
// 점수는 서버가 계산한 ScoreBreakdown 그대로이고, 여기서는 그 근거(어떤 카드·시설에서 나온 점수인지)만 공개된 보드에서 다시 읽어 설명한다.
type ItemKey = 'league' | 'tokens' | 'staffSets' | 'infrastructure' | 'office' | 'objective' | 'suspensions';

const ITEMS: { key: ItemKey; label: string; rule: string }[] = [
  { key: 'league', label: '리그 순위', rule: '리그 성적표 등수: 1위 15 · 2위 10 · 3위 8 · 4위 6 · 5위 4 · 6위 2 · 7위 0 · 8위 −2 · 9위 이하 −4 (같은 칸은 같은 등수)' },
  { key: 'tokens', label: '승점 토큰', rule: '게임 중 모은 승점 토큰 + 유망주 카드 경력 칸의 승점' },
  { key: 'staffSets', label: '직원 세트', rule: '같은 세트의 직원 카드 수에 따른 승점 (출장정지된 직원은 세지 않음)' },
  { key: 'infrastructure', label: '기반 시설', rule: '건설한 기반 시설 토큰에 적힌 승점' },
  { key: 'office', label: '사무실', rule: '사무실 트랙에서 도달한 칸의 승점 (2 / 5 / 9 / 15)' },
  { key: 'objective', label: '목표 카드', rule: '목표 달성 2 · 완벽 달성 4' },
  { key: 'suspensions', label: '출장정지', rule: '선수·직원 카드 위에 남은 출장정지 토큰 1개마다 −1' },
];
const LEVEL_LABEL = ['미달성', '목표 달성', '완벽 달성'] as const;
const REVEAL_MS = 450; // 참가자 한 명씩 체크되는 간격

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

// 항목별 근거. 공개된 보드 상태만 본다
function evidence(key: ItemKey, view: GameView, p: PlayerPublicView, score: ScoreBreakdown): string[] {
  switch (key) {
    case 'league':
      return [`리그 성적표 ${view.league.players[p.id] ?? 0}칸 → ${score.leagueRank}위`];
    case 'tokens': {
      const career = p.roster.filter((r) => r.careerVP > 0).map((r) => `${instanceName(r)} 경력 칸 ${r.careerVP}`);
      return [`승점 토큰 ${p.vp}`, ...career];
    }
    case 'staffSets': {
      const sets = new Map<StaffSet, { n: number; table: readonly number[] }>();
      for (const s of p.staff) {
        if (s.suspension > 0) continue;
        const card = cards.staff(s.cardId);
        const entry = sets.get(card.set) ?? { n: 0, table: card.setPoints };
        entry.n++;
        sets.set(card.set, entry);
      }
      const lines = [...sets].map(([set, { n, table }]) => `${SET_LABEL[set]} ${n}장 → ${table[Math.min(n, table.length) - 1] ?? 0}`);
      const suspended = p.staff.filter((s) => s.suspension > 0).map((s) => `${cards.staff(s.cardId).name} (출장정지라 제외)`);
      return lines.length + suspended.length > 0 ? [...lines, ...suspended] : ['직원 없음'];
    }
    case 'infrastructure':
      return p.infrastructure.length > 0
        ? p.infrastructure.map((t) => `${INFRA_LABEL[t]} ${cards.boardData.infrastructure.find((i) => i.type === t)?.vp ?? 0}`)
        : ['건설한 기반 시설 없음'];
    case 'office':
      return [p.office > 0 ? `사무실 ${p.office}단계` : '사무실을 올리지 않음'];
    case 'objective':
      return score.objectiveCard ? [cards.objective(score.objectiveCard).name, LEVEL_LABEL[score.objectiveLevel]] : ['목표 카드 없음'];
    case 'suspensions': {
      const lines = [
        ...p.roster.filter((r) => r.tokens.suspension > 0).map((r) => `${instanceName(r)} ×${r.tokens.suspension}`),
        ...p.staff.filter((s) => s.suspension > 0).map((s) => `${cards.staff(s.cardId).name} ×${s.suspension}`),
      ];
      return lines.length > 0 ? lines : ['남은 출장정지 없음'];
    }
  }
}

export function ScoreReviewModal({ view, onClose }: { view: GameView; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(0); // 이번 항목에서 체크가 끝난 참가자 수
  const phase = view.phase;
  const seats = view.seats;
  const last = step === ITEMS.length; // 마지막 스텝 = 합계

  // 항목이 바뀌면 참가자를 한 명씩 체크한다. 움직임 줄이기 설정이면 한 번에
  useEffect(() => {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(seats.length);
      return;
    }
    setShown(0);
    const timers = seats.map((_, i) => setTimeout(() => setShown(i + 1), REVEAL_MS * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, [step, seats]);

  if (phase.kind !== 'gameOver') return null;
  const { scores, winners } = phase;
  const upTo = (id: string, count: number) => ITEMS.slice(0, count).reduce((n, item) => n + scores[id]![item.key], 0);
  const steps: StepDef[] = [...ITEMS.map((item, i) => ({ label: item.label, done: i < step })), { label: '합계', done: false }];
  const item = ITEMS[step];
  const revealing = shown < seats.length;

  return createPortal(
    <div className="modal-backdrop">
      <div className="modal score-review" role="dialog" aria-label="승점 확인">
        <div className="panel-head">
          <h2>승점 확인 <span className="muted small">{Math.min(step + 1, steps.length)} / {steps.length}</span></h2>
          <button className="ghost small" onClick={onClose}>닫기</button>
        </div>
        <Stepper steps={steps} current={step} onSelect={setStep} />
        <div className="score-review-head">
          <h3>{item ? item.label : '합계'}</h3>
          <p className="muted small">{item ? item.rule : '모든 항목을 더한 최종 승점입니다. 동점이면 리그 순위가 높은 쪽이 이깁니다.'}</p>
        </div>
        <ul className="score-rows">
          {seats.map((id, i) => {
            const p = view.players[id]!;
            const score = scores[id]!;
            const checked = i < shown;
            const points = item ? score[item.key] : score.total;
            return (
              <li key={id} className={`score-row${checked ? ' checked' : ''}${last && winners.includes(id) ? ' top' : ''}`} style={{ '--seat': seatColor(view, id) } as React.CSSProperties}>
                <span className="score-check" aria-hidden>{checked ? '✓' : ''}</span>
                <span className="score-name"><span className="seat-dot" />{p.name}{last && winners.includes(id) && <span className="tag done">우승</span>}</span>
                <span className="score-evidence">
                  {checked &&
                    (item
                      ? evidence(item.key, view, p, score).map((line, k) => <span key={k} className="tag">{line}</span>)
                      : ITEMS.filter((x) => score[x.key] !== 0).map((x) => <span key={x.key} className="tag">{x.label} {signed(score[x.key])}</span>))}
                </span>
                <span className={`score-points${points < 0 ? ' minus' : ''}`}>{checked ? (item ? signed(points) : points) : '…'}</span>
                <span className="score-running muted small">{checked && item ? `누적 ${upTo(id, step + 1)}` : ''}</span>
              </li>
            );
          })}
        </ul>
        <div className="modal-actions">
          <button className="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>이전</button>
          {revealing ? (
            <button onClick={() => setShown(seats.length)}>모두 보기</button>
          ) : last ? (
            <button className="primary" onClick={onClose}>확인 완료</button>
          ) : (
            <button className="primary" onClick={() => setStep((s) => s + 1)}>다음: {steps[step + 1]!.label}</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
