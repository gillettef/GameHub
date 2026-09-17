import { useEffect, useMemo, useState } from 'react';
import { activeSide, cards } from '@server/engine/cards';
import { standsCount } from '@server/engine/friday';
import { SECTOR_PAIRS, sectorCounts } from '@server/engine/match';
import type { UniformToken } from '@server/engine/state';
import { RESOURCES, SECTORS } from '@server/engine/types';
import type { Resources, Sector } from '@server/engine/types';
import { OpponentCardView, PlayerCardView, TacticCardView } from '../components/Cards';
import { RESOURCE_ICON, SECTOR_LABEL, describeCost } from '../labels';
import { autoPlace, previewField, validatePlacements } from '../lineup';
import { useGame } from '../store';

const MATCH_DIE_LABEL: Record<number, string> = {
  1: '팬덤 트랙 +1',
  2: '출전 선수 1명 훈련',
  3: '출전 선수 1명 일시 역량 +1',
  4: '출전 선수 1명 일시 약점 +1',
  5: '부상 (12면체 → 등번호)',
  6: '심각한 부상 (부상 토큰 2개)',
};

function TokenChip({ token, name }: { token: UniformToken; name?: string }) {
  return (
    <span className={`chip ${token.face}`} title={name}>
      {token.number ?? '∅'}
      {token.face === 'attack' ? '⚽' : '🛡'}
      {name && <span className="chip-name">{name}</span>}
    </span>
  );
}

export function FridayPrepareScreen() {
  const { view, me, act } = useGame();
  const [tacticCardId, setTacticCardId] = useState(view.self.tacticCards[0] ?? '');
  const [formationIndex, setFormationIndex] = useState(0);
  const [played, setPlayed] = useState<string[]>([]);
  const [placements, setPlacements] = useState<Record<string, Sector>>({});
  const [stands, setStands] = useState(0);
  const [activations, setActivations] = useState<Record<string, boolean>>({});

  const tactic = cards.tactic(tacticCardId || view.self.tacticCards[0]!);
  const formation = tactic.formations[formationIndex] ?? tactic.formations[0]!;
  const need = useMemo(() => sectorCounts(formation), [formation]);
  const field = useMemo(() => previewField(me.uniforms, played), [me.uniforms, played]);
  const issues = validatePlacements(field, me.roster, played, formation, placements);
  const nameOf = (instanceId?: string) => (instanceId ? cards.player(me.roster.find((r) => r.instanceId === instanceId)?.cardId ?? '').name : undefined);

  // 출전 선수·포메이션·필드 구성이 실제로 바뀔 때만 자동 배치 (서버 브로드캐스트마다 수동 배치를 덮어쓰지 않도록)
  const layoutKey = `${field.map((t) => t.id).join(',')}|${played.join(',')}|${formation.defenders}-${formation.midfielders}-${formation.forwards}`;
  useEffect(() => {
    setPlacements(autoPlace(field, me.roster, played, formation));
  }, [layoutKey]);

  if (view.phase.kind !== 'friday.prepare') return null;
  const submitted = view.phase.submitted[view.me];

  const usedNumbers = new Set(played.map((id) => activeSide(me.roster.find((r) => r.instanceId === id)!).number).filter((n) => n !== undefined));
  const togglePlayer = (instanceId: string) => setPlayed((p) => (p.includes(instanceId) ? p.filter((x) => x !== instanceId) : [...p, instanceId]));

  const cost: Partial<Resources> = { stamina: played.length, fandom: stands };
  const activationMap: Record<string, Partial<Resources>> = {};
  for (const id of played) {
    if (!activations[id]) continue;
    const effect = activeSide(me.roster.find((r) => r.instanceId === id)!).effect;
    if (!effect) continue;
    activationMap[id] = effect.cost;
    for (const r of RESOURCES) cost[r] = (cost[r] ?? 0) + (effect.cost[r] ?? 0);
  }
  const affordable = RESOURCES.every((r) => (cost[r] ?? 0) <= me.resources[r]);
  const canSubmit = !submitted && issues.length === 0 && affordable && tacticCardId;

  const submit = () =>
    act({
      type: 'submitLineup',
      submission: { tacticCardId, formationIndex, players: played, placements, fandomInStands: stands, activations: activationMap },
    });

  return (
    <section className="panel">
      <h2>금요일 · 경기 준비</h2>
      <div className="row small wrap">
        {view.seats.map((id) => (
          <span key={id} className={view.phase.kind === 'friday.prepare' && view.phase.submitted[id] ? 'badge' : 'muted'}>
            {view.players[id]!.name}: {view.phase.kind === 'friday.prepare' && view.phase.submitted[id] ? '제출 완료' : '준비 중'}
          </span>
        ))}
      </div>
      {submitted ? (
        <p className="muted">라인업을 제출했습니다. 다른 참가자를 기다리는 중…</p>
      ) : (
        <>
          <h4>1. 상대 팀 스카우트 보고서</h4>
          {me.nextOpponent && <div className="cards"><OpponentCardView cardId={me.nextOpponent} /></div>}

          <h4>2. 전술 카드와 포메이션</h4>
          <div className="cards compact">
            {view.self.tacticCards.map((id) => (
              <TacticCardView key={id} cardId={id} selected={id === tacticCardId} onClick={() => { setTacticCardId(id); setFormationIndex(0); }} />
            ))}
          </div>
          {tacticCardId && cards.tactic(tacticCardId).formations.length > 1 && (
            <div className="row">
              {cards.tactic(tacticCardId).formations.map((f, i) => (
                <button key={i} className={`small${i === formationIndex ? ' active' : ''}`} onClick={() => setFormationIndex(i)}>
                  {f.defenders}-{f.midfielders}-{f.forwards}
                </button>
              ))}
            </div>
          )}

          <h4>3. 출전 선수 <span className="muted">(선수마다 💪1 · 부상/출장정지·같은 등번호 불가)</span></h4>
          <div className="cards">
            {me.roster.map((r) => {
              const side = activeSide(r);
              const blocked = r.tokens.injury > 0 || r.tokens.suspension > 0 || (side.number !== undefined && usedNumbers.has(side.number) && !played.includes(r.instanceId));
              return (
                <PlayerCardView
                  key={r.instanceId}
                  cardId={r.cardId}
                  instance={r}
                  selected={played.includes(r.instanceId)}
                  onClick={blocked ? undefined : () => togglePlayer(r.instanceId)}
                  footer={
                    played.includes(r.instanceId) && side.effect && !side.effect.mandatory ? (
                      <label className="row small">
                        <input type="checkbox" checked={!!activations[r.instanceId]} onChange={(e) => setActivations((a) => ({ ...a, [r.instanceId]: e.target.checked }))} />
                        효과 활성화 ({describeCost(side.effect.cost)})
                      </label>
                    ) : undefined
                  }
                />
              );
            })}
          </div>

          <h4>4. 유니폼 토큰 배치 <span className="muted">({formation.defenders}-{formation.midfielders}-{formation.forwards})</span></h4>
          <button className="small" onClick={() => setPlacements(autoPlace(field, me.roster, played, formation))}>자동 배치</button>
          <div className="pitch">
            {SECTORS.map((s) => (
              <div key={s} className={`sector ${s}`}>
                <div className="sector-title">{SECTOR_LABEL[s]} <span className="muted">{field.filter((t) => placements[t.id] === s).length}/{need[s]}</span></div>
                {field.filter((t) => placements[t.id] === s).map((t) => (
                  <TokenChip key={t.id} token={t} name={played.includes(t.cardInstanceId ?? '') ? nameOf(t.cardInstanceId) : undefined} />
                ))}
              </div>
            ))}
          </div>
          <div className="token-list">
            {field.map((t) => (
              <label key={t.id} className="row small">
                <TokenChip token={t} name={played.includes(t.cardInstanceId ?? '') ? nameOf(t.cardInstanceId) : undefined} />
                <select value={placements[t.id] ?? ''} onChange={(e) => setPlacements((p) => ({ ...p, [t.id]: e.target.value as Sector }))}>
                  <option value="">—</option>
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>{SECTOR_LABEL[s]}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {issues.length > 0 && <p className="error small">{issues.join(' · ')}</p>}

          <h4>5. 관중석 팬덤 <span className="muted">(관중석 {standsCount(me)}개 · 경기 후 배치한 만큼 💰)</span></h4>
          <input type="number" min={0} max={Math.min(standsCount(me), me.resources.fandom)} value={stands} onChange={(e) => setStands(Number(e.target.value))} />

          <p className="small">
            비용: {RESOURCES.filter((r) => (cost[r] ?? 0) > 0).map((r) => `${RESOURCE_ICON[r]}${cost[r]}`).join(' ') || '없음'}
            {!affordable && <span className="error"> — 자원 부족</span>}
          </p>
          <button disabled={!canSubmit} onClick={submit}>라인업 제출</button>
        </>
      )}
    </section>
  );
}

export function FridayAftermathScreen() {
  const { view, me, act } = useGame();
  if (view.phase.kind !== 'friday.aftermath') return null;
  const m = view.phase.matches[view.me]!;
  const opponent = cards.opponent(m.opponentCardId);
  const outcomeLabel = { win: '승리', draw: '무승부', loss: '패배' }[m.report.outcome];
  return (
    <section className="panel">
      <h2>금요일 · 경기 결과</h2>
      <div className="row small wrap">
        {view.seats.map((id) => {
          const x = view.phase.kind === 'friday.aftermath' ? view.phase.matches[id]! : null;
          return x ? (
            <span key={id} className={x.decided ? 'badge' : 'muted'}>
              {view.players[id]!.name}: {x.report.myGoals}:{x.report.theirGoals} vs {cards.opponent(x.opponentCardId).teamName} {x.decided ? '· 처리 완료' : ''}
            </span>
          ) : null;
        })}
      </div>
      <div className="two-col">
        <div>
          <h3>{me.name} {m.report.myGoals} : {m.report.theirGoals} {opponent.teamName} — <span className={`outcome ${m.report.outcome}`}>{outcomeLabel}</span></h3>
          <table className="report">
            <tbody>
              {m.report.sectors.map((s, i) => (
                <tr key={i}>
                  <td>{SECTOR_LABEL[SECTOR_PAIRS[i]![0]]} ↔ 상대 {SECTOR_LABEL[SECTOR_PAIRS[i]![1]]}</td>
                  <td>{s.myGoals} : {s.theirGoals}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">승리 +3칸 / 무승부 양 팀 +1칸 / 패배 상대 +3칸. 관중석 팬덤은 돈으로 바뀌었습니다.</p>
        </div>
        <OpponentCardView cardId={m.opponentCardId} revealed />
      </div>
      <h4>경기 영향 주사위</h4>
      {m.decided ? (
        <p className="muted">처리 완료. 다른 참가자를 기다리는 중…</p>
      ) : m.roll === null ? (
        <button onClick={() => act({ type: 'rollMatchDie' })}>🎲 주사위 굴리기</button>
      ) : (
        <div>
          <p>주사위 <b>{m.roll}</b> → {MATCH_DIE_LABEL[m.roll]}</p>
          <div className="row">
            <button onClick={() => act({ type: 'acceptMatchRoll' })}>적용</button>
            <button disabled={me.resources.fandom < 1} onClick={() => act({ type: 'rerollMatchDie' })}>📣 팬덤 1개로 재굴림</button>
          </div>
        </div>
      )}
    </section>
  );
}
